import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ReorderableTabBar } from '@/ui/ReorderableTabBar'
import {
  addExpense,
  addWalletTransaction,
  createBudget,
  createBudgetCategoriesBulk,
  createBudgetCategory,
  createGoal,
  createTag,
  deleteBudget,
  deleteBudgetCategory,
  deleteExpense,
  deleteGoal,
  deleteTag,
  deleteWalletTransaction,
  listBudgetCategories,
  listBudgets,
  listExpenses,
  listGoals,
  listTags,
  listWalletTransactions,
  reorderBudgetCategories,
  reorderTags,
  updateBudgetCategory,
  updateExpense,
  updateTag,
} from '@/data/finance'
import {
  disconnectBank,
  listAspsps,
  listBankAccounts,
  listBankConnections,
  listBankTransactions,
  startBankConnection,
  syncBankTransactions,
  type Aspsp,
} from '@/data/bank'
import { listFamilyMembers } from '@/data/family'
import { createShoppingStore, listShoppingStores } from '@/data/shoppingStores'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { deleteReceipt, getReceiptUrl, listReceipts, updateReceipt, uploadReceipt } from '@/data/receipts'
import { listAllProductPrices, listProducts } from '@/data/products'
import { isFoodPurchase } from '@/domain/products'
import { averagePricesByMonth, compareMonths, decomposeSpendChange, type RawPurchase } from '@/domain/priceTrends'
import {
  deleteProductPricesByReceipt,
  listProductPricesByReceipt,
  recordProductPurchase,
  type ReceiptLineDetail,
} from '@/data/products'
import {
  budgetPeriodRange,
  budgetSpent,
  isFoodCategory,
  resolveCategoryClassification,
  walletBalance,
  walletCategoryTotal,
} from '@/domain/finance'
import { MONTH_LABELS } from '@/domain/calendar'
import { PRESET_LABELS, rangeForPreset, toDateStr, type SpendRangePreset } from '@/domain/dateRanges'
import { findKnownStore } from '@/domain/voiceQuery'
import { analyzeReceiptPhoto } from '@/services/receiptPhoto'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import { StoreIcon } from '@/ui/StoreIcon'
import type {
  BankAccount,
  BankConnection,
  BankTransaction,
  Budget,
  BudgetCategory,
  BudgetPeriod,
  Expense,
  FamilyMember,
  KidGoal,
  KidWalletTransaction,
  Receipt,
  Tag,
  WalletTransactionType,
} from '@/domain/types'

// Tickets y Registro Alimentación se mudan a Compras (petición real:
// "estoy pensando si pasar registro alimentación y tickets a compra")
// — Economía se queda solo con el dinero en sí (Gastos, Presupuesto,
// Educación financiera). Sus componentes (ReceiptsTab, BudgetsTab)
// siguen definidos en este archivo y se exportan para que
// ShoppingScreen los use, en vez de duplicar todo el código de
// tickets/categorías en dos sitios.
//
// Skill de Pepa, punto 3: "Resumen · Conclusiones de Pepa ·
// Estadísticas · Movimientos · Presupuesto General · Educación
// Financiera". Resumen y Conclusiones se combinan en una sola pestaña
// (van siempre juntas, mismo periodo, misma pantalla) en vez de dos
// pestañas casi vacías por separado.
const SUB_TABS = ['Resumen', 'Estadísticas', 'Movimientos', 'Presupuesto Generales', 'Banco', 'Educación financiera'] as const
type SubTab = (typeof SUB_TABS)[number]

// Skill de Pepa, punto 24: "Ver X registros →" tiene que abrir
// Movimientos filtrado EXACTAMENTE con el conjunto que produjo el
// dato — se comparte este estado entre Estadísticas y Movimientos en
// vez de duplicar la lógica de filtrado en cada estadística.
export interface MovementsFilter {
  label: string
  from?: string
  to?: string
  category?: string
  tagId?: string
  necessity?: 'debo' | 'necesito' | 'quiero'
  isFixed?: boolean
  isIncome?: boolean
}

export function FinanceScreen() {
  const [tab, setTab] = useState<SubTab>('Resumen')
  const [movementsFilter, setMovementsFilter] = useState<MovementsFilter | null>(null)

  function viewMovements(filter: MovementsFilter) {
    setMovementsFilter(filter)
    setTab('Movimientos')
  }

  return (
    <div className="screen">
      <h1>Economía</h1>
      <ReorderableTabBar storageKey="dinero" tabs={SUB_TABS} active={tab} onSelect={setTab} />

      {tab === 'Resumen' && <ResumenTab onViewMovements={viewMovements} />}
      {tab === 'Estadísticas' && <EstadisticasTab onViewMovements={viewMovements} />}
      {tab === 'Movimientos' && (
        <ExpensesTab filter={movementsFilter} onClearFilter={() => setMovementsFilter(null)} />
      )}
      {tab === 'Presupuesto Generales' && <BudgetsTab group="generales" seedCategories={MASTER_CATEGORY_SEED} />}
      {tab === 'Banco' && <BankTab />}
      {tab === 'Educación financiera' && <KidsFinanceTab />}
    </div>
  )
}

// Skill de Pepa, punto 22: enlazar cuentas bancarias reales (varias
// por familia) — mismo patrón que Google Calendar (startGoogleConnect
// redirige, la vuelta ocurre en enable-banking-auth-callback con
// ?bank=connected|error). Los movimientos importados alimentan
// Movimientos (source='banco', módulo de conciliación con tickets
// pendiente aparte).
function BankTab() {
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [transactions, setTransactions] = useState<BankTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showConnect, setShowConnect] = useState(false)
  // Solo importa para la primera sincronización de cada cuenta — a
  // partir de ahí cada sincronización (manual o del cron 4 veces al
  // día, ver 0077_schedule_bank_sync.sql) es incremental de verdad,
  // solo trae lo nuevo desde el último movimiento ya guardado.
  const [syncDays, setSyncDays] = useState(90)

  function reload() {
    setLoading(true)
    Promise.all([listBankConnections(), listBankAccounts(), listBankTransactions()])
      .then(([c, a, t]) => {
        setConnections(c)
        setAccounts(a)
        setTransactions(t)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // Enable Banking trae de vuelta aquí con ?bank=connected|error tras
    // el consentimiento — se lee una vez y se limpia de la URL para que
    // un refresco de página no lo vuelva a mostrar.
    const params = new URLSearchParams(window.location.search)
    const result = params.get('bank')
    if (result === 'connected') setNotice('✓ Banco conectado.')
    else if (result === 'error') setNotice(`No se pudo conectar (${params.get('detail') ?? 'error'}).`)
    if (result) {
      params.delete('bank')
      params.delete('detail')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
    reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const result = await syncBankTransactions(syncDays)
      setNotice(`✓ ${result.totalSynced} movimiento${result.totalSynced === 1 ? '' : 's'} sincronizado${result.totalSynced === 1 ? '' : 's'}.`)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <p className="muted">Cargando cuentas bancarias…</p>

  const activeConnections = connections.filter((c) => c.status === 'active')

  return (
    <div>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {activeConnections.length === 0 ? (
        <p className="muted">
          Todavía no hay ningún banco enlazado. Al enlazar una cuenta, sus movimientos se pueden traer aquí y
          usarlos en Economía junto con los tickets.
        </p>
      ) : (
        activeConnections.map((c) => {
          const connAccounts = accounts.filter((a) => a.connectionId === c.id)
          return (
            <div key={c.id} className="card event-card" style={{ marginBottom: 8 }}>
              <strong>🏦 {c.aspspName}</strong>
              <p className="muted" style={{ margin: '4px 0' }}>
                {connAccounts.length} {connAccounts.length === 1 ? 'cuenta' : 'cuentas'}
                {c.validUntil && ` · válido hasta ${c.validUntil.slice(0, 10)}`}
              </p>
              {connAccounts.map((a) => (
                <p key={a.id} className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                  · {a.name ?? 'Cuenta'} {a.iban ? `(${a.iban})` : ''} {a.currency ?? ''}
                </p>
              ))}
              <ConfirmButton
                label="Desconectar"
                confirmLabel="¿Seguro?"
                className="link-button"
                onConfirm={() => disconnectBank(c.id).then(reload)}
              />
            </div>
          )
        })
      )}

      {activeConnections.length > 0 && (
        <>
          <div className="inline-fields" style={{ alignItems: 'center' }}>
            <button type="button" onClick={handleSync} disabled={syncing} style={{ flex: 'none' }}>
              {syncing ? 'Sincronizando…' : '🔄 Sincronizar movimientos'}
            </button>
            <select value={syncDays} onChange={(e) => setSyncDays(Number(e.target.value))} style={{ flex: 'none' }}>
              <option value={30}>Primera vez: último mes</option>
              <option value={90}>Primera vez: últimos 3 meses</option>
              <option value={365}>Primera vez: último año</option>
              <option value={0}>Primera vez: todo el histórico</option>
            </select>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Se sincroniza sola 4 veces al día. Este periodo solo se usa la primera vez que se enlaza cada cuenta —
            después solo se trae lo nuevo desde el último movimiento guardado.
          </p>
        </>
      )}

      <button type="button" className="link-button" onClick={() => setShowConnect((v) => !v)}>
        {showConnect ? 'Cerrar' : '+ Conectar banco'}
      </button>
      {showConnect && (
        <ConnectBankForm
          connecting={connecting}
          onConnecting={setConnecting}
          onError={(msg) => setError(msg)}
        />
      )}

      {transactions.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 16, fontWeight: 600 }}>
            Movimientos del banco ({transactions.length})
          </p>
          <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Cada uno se categoriza solo y aparece también en Movimientos, ya editable (categoría, etiqueta...). Si ya
            existía como ticket con el mismo importe y fecha cercana, se une con él en vez de duplicarse.
          </p>
          <div className="price-row-list">
            {transactions.slice(0, 50).map((t) => (
              <div key={t.id} className="price-row">
                <span className="price-row-name">
                  {t.description ?? 'Movimiento'}
                  <span className="muted"> · {t.transactionDate}</span>
                </span>
                <span className="price-row-price" style={{ color: t.creditDebit === 'CRDT' ? '#1e8449' : undefined }}>
                  {t.creditDebit === 'CRDT' ? '+' : '-'}
                  {t.amount.toFixed(2)} €
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ConnectBankForm({
  connecting,
  onConnecting,
  onError,
}: {
  connecting: boolean
  onConnecting: (v: boolean) => void
  onError: (msg: string) => void
}) {
  const [country, setCountry] = useState('ES')
  const [aspsps, setAspsps] = useState<Aspsp[]>([])
  const [loadingAspsps, setLoadingAspsps] = useState(false)
  const [selected, setSelected] = useState('')

  function loadAspsps(c: string) {
    setLoadingAspsps(true)
    setSelected('')
    listAspsps(c)
      .then(setAspsps)
      .catch((err: Error) => onError(err.message))
      .finally(() => setLoadingAspsps(false))
  }

  useEffect(() => loadAspsps(country), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    if (!selected) return
    const aspsp = aspsps.find((a) => a.name === selected)
    if (!aspsp) return
    onConnecting(true)
    onError('')
    try {
      await startBankConnection(aspsp.name, aspsp.country)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
      onConnecting(false)
    }
  }

  return (
    <div className="card member-form">
      <label>
        País
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value)
            loadAspsps(e.target.value)
          }}
        >
          <option value="ES">España</option>
          <option value="FI">Finlandia</option>
          <option value="FR">Francia</option>
          <option value="DE">Alemania</option>
          <option value="IT">Italia</option>
          <option value="PT">Portugal</option>
        </select>
      </label>
      <label>
        Banco
        {loadingAspsps ? (
          <p className="muted">Cargando bancos…</p>
        ) : (
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Elige un banco</option>
            {aspsps.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <button type="button" onClick={handleConnect} disabled={!selected || connecting}>
        {connecting ? 'Abriendo el banco…' : 'Conectar'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------
// Resumen + Conclusiones de Pepa (Skill de Pepa, puntos 4/5)
// ---------------------------------------------------------------------

const NECESSITY_LABELS: Record<'debo' | 'necesito' | 'quiero', string> = {
  debo: 'Debo',
  necesito: 'Necesito',
  quiero: 'Quiero',
}

function ResumenTab({ onViewMovements }: { onViewMovements: (f: MovementsFilter) => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))

  useEffect(() => {
    listExpenses()
      .then(setExpenses)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="muted">Cargando resumen…</p>

  const [from, to] = rangeForPreset(preset, customFrom, customTo)
  const inRange = expenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to)
  const real = inRange.filter((e) => e.kind === 'real')
  const totalIncome = real.filter((e) => e.isIncome).reduce((s, e) => s + e.amount, 0)
  const totalSpent = real.filter((e) => !e.isIncome).reduce((s, e) => s + e.amount, 0)
  const ahorro = totalIncome - totalSpent
  // Skill de Pepa, punto 1: no se inventa una tasa de ahorro sin
  // ingresos con los que calcularla.
  const tasaAhorro = totalIncome > 0 ? (ahorro / totalIncome) * 100 : null

  // Periodo anterior EQUIVALENTE (misma duración, justo antes), para las
  // conclusiones — Skill de Pepa, punto 5: "en comparaciones mostrar
  // siempre porcentaje + euros, nunca depender solo del porcentaje".
  const fromMs = new Date(from + 'T00:00').getTime()
  const toMs = new Date(to + 'T00:00').getTime()
  const spanMs = Math.max(toMs - fromMs, 86_400_000)
  const prevTo = toDateStr(new Date(fromMs - 86_400_000))
  const prevFrom = toDateStr(new Date(fromMs - spanMs))
  const prevReal = expenses.filter((e) => e.kind === 'real' && e.expenseDate >= prevFrom && e.expenseDate <= prevTo)
  const prevSpent = prevReal.filter((e) => !e.isIncome).reduce((s, e) => s + e.amount, 0)

  const conclusions: { text: string; filter?: MovementsFilter }[] = []
  if (real.length === 0) {
    conclusions.push({ text: 'Todavía no hay movimientos en este periodo para sacar conclusiones.' })
  } else if (prevReal.length === 0) {
    conclusions.push({ text: 'No hay datos del periodo anterior para comparar todavía — con el tiempo Pepa podrá comparar la evolución.' })
  } else {
    const deltaPct = prevSpent > 0 ? ((totalSpent - prevSpent) / prevSpent) * 100 : null
    const deltaEur = totalSpent - prevSpent
    if (deltaPct === null) {
      conclusions.push({ text: `Habéis gastado ${totalSpent.toFixed(2)} € — no había gasto en el periodo anterior con el que comparar.` })
    } else if (Math.abs(deltaPct) < 3) {
      conclusions.push({ text: `Habéis mantenido prácticamente el mismo ritmo de gasto que el periodo anterior y vuestra economía se mantiene estable.` })
    } else {
      const sign = deltaPct > 0 ? '+' : ''
      conclusions.push({
        text: `Habéis gastado un ${sign}${deltaPct.toFixed(0)}% (${sign}${deltaEur.toFixed(2)} €) ${deltaPct > 0 ? 'más' : 'menos'} que en el periodo anterior.`,
        filter: { label: `Gastos — ${PRESET_LABELS[preset]}`, from, to, isIncome: false },
      })
    }
    if (tasaAhorro !== null) {
      if (tasaAhorro >= 20) conclusions.push({ text: `Vuestra tasa de ahorro es del ${tasaAhorro.toFixed(0)}% — una economía saneada.` })
      else if (tasaAhorro < 0) conclusions.push({ text: `Este periodo habéis gastado más de lo que habéis ingresado (${ahorro.toFixed(2)} €).` })
    }
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="filter-row" style={{ marginBottom: 8 }}>
        {(['dia', 'semana', 'mes', 'año', 'rango'] as SpendRangePreset[]).map((p) => (
          <button key={p} type="button" className={'chip' + (preset === p ? ' chip-active' : '')} onClick={() => setPreset(p)}>
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      {preset === 'rango' && (
        <div className="inline-fields" style={{ marginBottom: 8 }}>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span>a</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      <div className="card event-card">
        <strong>Resumen — {PRESET_LABELS[preset]}</strong>
        <p style={{ color: '#1e8449', margin: '6px 0 0' }}>
          Ingresos: +{totalIncome.toFixed(2)} €{' '}
          <button type="button" className="link-button" onClick={() => onViewMovements({ label: `Ingresos — ${PRESET_LABELS[preset]}`, from, to, isIncome: true })}>
            Ver registros →
          </button>
        </p>
        <p style={{ color: '#c0392b', margin: '4px 0' }}>
          Gastos: -{totalSpent.toFixed(2)} €{' '}
          <button type="button" className="link-button" onClick={() => onViewMovements({ label: `Gastos — ${PRESET_LABELS[preset]}`, from, to, isIncome: false })}>
            Ver registros →
          </button>
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Ahorro: {ahorro.toFixed(2)} €</strong>
          {tasaAhorro !== null && <span className="muted"> · Tasa de ahorro {tasaAhorro.toFixed(0)}%</span>}
        </p>
      </div>

      <h2 className="section-title">Conclusiones de Pepa</h2>
      {conclusions.map((c, i) => (
        <div key={i} className="card event-card">
          <p style={{ margin: 0 }}>{c.text}</p>
          {c.filter && (
            <button type="button" className="link-button" onClick={() => onViewMovements(c.filter!)}>
              +info →
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------
// Estadísticas (Skill de Pepa, puntos 7-17)
// ---------------------------------------------------------------------

interface BreakdownSlice {
  key: string
  label: string
  icon?: string
  total: number
  count: number
  hasChildren?: boolean
}

const DONUT_COLORS = ['#4C6EF5', '#e8590c', '#2f9e44', '#ae3ec9', '#f08c00', '#1098ad', '#e64980', '#748ffc', '#20c997', '#fa5252']

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Recorte de anillo (donut) entre dos ángulos — el rodaja real que se
// toca, no una fila de texto aparte.
function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
  const clampedEnd = Math.min(endAngle, startAngle + 359.99) // círculo completo (1 sola porción) es un caso degenerado en SVG
  const startOuter = polarToCartesian(cx, cy, rOuter, clampedEnd)
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle)
  const startInner = polarToCartesian(cx, cy, rInner, clampedEnd)
  const endInner = polarToCartesian(cx, cy, rInner, startAngle)
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ')
}

// Dónut de verdad interactivo: cada porción es su propio <path> de SVG
// con su propio onClick — antes era un único div con conic-gradient
// (no se puede tocar una porción concreta, solo listar el texto
// debajo). Petición real, muy insistida: "cuando lo toque [el dónut]
// que se ponga otro subdónut al lado con la categoría que ha
// tocado... en el dónut, no en la lista" — se aplica igual a todos los
// dónuts de la app (categorías, etiquetas, Debo/Necesito/Quiero,
// Fijo/variable, reparto por tienda), sin ninguna lista aparte debajo.
function SvgDonut({
  slices,
  centerLabel,
  highlightedKey,
  onSliceClick,
  size = 190,
  colors = DONUT_COLORS,
}: {
  slices: { key: string; total: number }[]
  centerLabel: { name: string; total: number }
  highlightedKey: string | null
  onSliceClick: (key: string) => void
  size?: number
  colors?: string[]
}) {
  if (slices.length === 0) {
    return <p className="muted">No hay movimientos en este periodo para esta vista.</p>
  }
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2
  const rInner = rOuter * 0.52
  const grandTotal = slices.reduce((s, x) => s + x.total, 0)
  let cumulative = 0

  return (
    <div className="donut-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
        {slices.map((s, i) => {
          const pct = grandTotal > 0 ? (s.total / grandTotal) * 360 : 0
          if (pct <= 0) return null
          const start = cumulative
          cumulative += pct
          const dimmed = highlightedKey != null && highlightedKey !== s.key
          return (
            <path
              key={s.key}
              d={donutSlicePath(cx, cy, rOuter, rInner, start, start + pct)}
              fill={dimmed ? '#dfe3ea' : colors[i % colors.length]}
              onClick={() => onSliceClick(s.key)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
      </svg>
      <div className="donut-ring-center">
        <span>{centerLabel.name}</span>
        <strong>{centerLabel.total.toFixed(2)} €</strong>
      </div>
    </div>
  )
}

// Un solo nivel (etiquetas, Debo/Necesito/Quiero, Fijo/variable): tocar
// una porción va directo a "Ver registros", no hay más niveles debajo.
function BreakdownDonut({
  slices,
  centerLabel,
  onViewRecords,
}: {
  slices: BreakdownSlice[]
  centerLabel: { name: string; total: number }
  onViewRecords: (key: string) => void
}) {
  return <SvgDonut slices={slices} centerLabel={centerLabel} highlightedKey={null} onSliceClick={onViewRecords} />
}

// Skill de Pepa, punto 10: "Donut principal por categorías. Al
// seleccionar una categoría, segundo donut con subcategorías" —
// petición real: "si tocas una de las categorías [EN EL DÓNUT] se
// resalta y ves el importe de esa categoría y a la vez se abre un
// segundo dónut con el reparto de las subcategorías, al lado".
// Carrusel horizontal de anillos (uno por nivel) — sin ninguna lista
// de texto: la única forma de elegir categoría es tocar la porción.
function CategoryDonutExplorer({
  categories,
  expenses,
  onViewRecords,
}: {
  categories: BudgetCategory[]
  expenses: Expense[]
  onViewRecords: (category: string, label: string) => void
}) {
  const [selectedTopId, setSelectedTopId] = useState<string | null>(null)
  const [highlightTop, setHighlightTop] = useState<string | null>(null)
  const [highlightSub, setHighlightSub] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const topLevel = categories.filter((c) => !c.parentId)
  const topSlices: BreakdownSlice[] = topLevel
    .map((c) => {
      const childNames = categories.filter((x) => x.parentId === c.id).map((x) => x.name)
      const matched = expenses.filter((e) => e.category === c.name || childNames.includes(e.category))
      return {
        key: c.id,
        label: c.name,
        icon: c.icon,
        total: matched.reduce((s, e) => s + e.amount, 0),
        count: matched.length,
        hasChildren: childNames.length > 0,
      }
    })
    .filter((s) => s.total > 0)
  const topGrandTotal = topSlices.reduce((s, x) => s + x.total, 0)
  const highlightedTop = topSlices.find((s) => s.key === highlightTop)
  const topCenter = highlightedTop ? { name: highlightedTop.label, total: highlightedTop.total } : { name: 'Todo', total: topGrandTotal }

  const selectedTop = selectedTopId ? topLevel.find((c) => c.id === selectedTopId) : undefined
  const subSlices: BreakdownSlice[] = selectedTop
    ? categories
        .filter((c) => c.parentId === selectedTop.id)
        .map((c): BreakdownSlice => {
          const matched = expenses.filter((e) => e.category === c.name)
          return { key: c.id, label: c.name, icon: c.icon, total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
        })
        .concat(
          (() => {
            const direct = expenses.filter((e) => e.category === selectedTop.name)
            return direct.length > 0
              ? [{ key: `directo:${selectedTop.id}`, label: '(sin subcategoría)', total: direct.reduce((s, e) => s + e.amount, 0), count: direct.length } as BreakdownSlice]
              : []
          })(),
        )
        .filter((s) => s.total > 0)
    : []
  const subGrandTotal = subSlices.reduce((s, x) => s + x.total, 0)
  const highlightedSub = subSlices.find((s) => s.key === highlightSub)
  const subCenter = highlightedSub ? { name: highlightedSub.label, total: highlightedSub.total } : { name: 'Todo', total: subGrandTotal }

  function scrollToIndex(index: number) {
    requestAnimationFrame(() => {
      const track = trackRef.current
      if (track) track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' })
    })
  }

  function selectTop(key: string) {
    setHighlightTop(key)
    const slice = topSlices.find((s) => s.key === key)
    if (!slice) return
    if (slice.hasChildren) {
      setSelectedTopId(key)
      setHighlightSub(null)
      scrollToIndex(1)
    } else {
      onViewRecords(slice.label, slice.label)
    }
  }

  function selectSub(key: string) {
    setHighlightSub(key)
    const slice = subSlices.find((s) => s.key === key)
    if (!slice || !selectedTop) return
    onViewRecords(key.startsWith('directo:') ? selectedTop.name : slice.label, slice.label)
  }

  function closeSub() {
    setSelectedTopId(null)
    setHighlightSub(null)
    scrollToIndex(0)
  }

  if (topSlices.length === 0) {
    return <p className="muted">No hay movimientos en este periodo para esta vista.</p>
  }

  return (
    <div className="donut-explorer">
      <div
        className="donut-track"
        ref={trackRef}
        onScroll={(e) => setActiveIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        <div className="donut-card">
          <SvgDonut slices={topSlices} centerLabel={topCenter} highlightedKey={highlightTop} onSliceClick={selectTop} />
        </div>
        {selectedTop && (
          <div className="donut-card">
            <button type="button" className="link-button" onClick={closeSub}>
              ‹ {selectedTop.name}
            </button>
            <SvgDonut slices={subSlices} centerLabel={subCenter} highlightedKey={highlightSub} onSliceClick={selectSub} />
          </div>
        )}
      </div>
      {selectedTop && (
        <div className="donut-dots">
          <span className={'donut-dot' + (activeIndex === 0 ? ' donut-dot-active' : '')} />
          <span className={'donut-dot' + (activeIndex !== 0 ? ' donut-dot-active' : '')} />
        </div>
      )}
    </div>
  )
}

function EstadisticasTab({ onViewMovements }: { onViewMovements: (f: MovementsFilter) => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [purchases, setPurchases] = useState<RawPurchase[]>([])
  const [productNames, setProductNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  const [view, setView] = useState<'categorias' | 'etiquetas' | 'dnq' | 'fijo'>('categorias')

  useEffect(() => {
    Promise.all([listExpenses(), listBudgetCategories(), listTags(), listAllProductPrices(), listProducts(), listReceipts()])
      .then(([e, c, t, prices, products, receipts]) => {
        setExpenses(e)
        setCategories(c)
        setTags(t)
        const receiptCategoryById = new Map(receipts.map((r) => [r.id, r.category]))
        setPurchases(
          // Un pedido de Amazon que no sea de alimentación no debe
          // entrar en el análisis de "¿por qué ha cambiado mi gasto?"
          // de la cesta de tickets — uno que sí lo sea (café...) sí cuenta.
          prices
            .filter((p) => isFoodPurchase(p, receiptCategoryById))
            .map((p) => {
              const qty = Number(p.quantity)
              return { productId: p.productId, price: p.price, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1, recordedDate: p.recordedDate }
            }),
        )
        setProductNames(new Map(products.map((pr) => [pr.id, pr.displayName])))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="muted">Cargando estadísticas…</p>

  const [from, to] = rangeForPreset(preset, customFrom, customTo)
  const periodLabel = `${PRESET_LABELS[preset]} (${from} a ${to})`
  const real = expenses.filter((e) => e.kind === 'real' && !e.isIncome && e.expenseDate >= from && e.expenseDate <= to)
  const totalReal = real.reduce((s, e) => s + e.amount, 0)

  function viewFor(extra: Partial<MovementsFilter>, label: string) {
    onViewMovements({ label, from, to, isIncome: false, ...extra })
  }

  let body: JSX.Element
  if (view === 'categorias') {
    body = <CategoryDonutExplorer categories={categories} expenses={real} onViewRecords={(cat, label) => viewFor({ category: cat }, `${label} — ${periodLabel}`)} />
  } else if (view === 'etiquetas') {
    const slices: BreakdownSlice[] = tags
      .map((t) => {
        const matched = real.filter((e) => e.tagId === t.id)
        return { key: t.id, label: t.name, icon: '🏷️', total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body =
      tags.length === 0 ? (
        <p className="muted">Todavía no hay etiquetas — puedes crear la primera desde el botón flotante de Movimientos.</p>
      ) : (
        <BreakdownDonut
          slices={slices}
          centerLabel={{ name: 'Todo', total: slices.reduce((s, x) => s + x.total, 0) }}
          onViewRecords={(key) => viewFor({ tagId: key }, `Etiqueta — ${periodLabel}`)}
        />
      )
  } else if (view === 'dnq') {
    const groups: { key: 'debo' | 'necesito' | 'quiero' | 'sin_clasificar'; label: string }[] = [
      { key: 'debo', label: 'Debo' },
      { key: 'necesito', label: 'Necesito' },
      { key: 'quiero', label: 'Quiero' },
      { key: 'sin_clasificar', label: 'Sin clasificar' },
    ]
    const necessityByExpense = new Map(real.map((e) => [e.id, resolveCategoryClassification(e.category, categories).necessity]))
    const slices: BreakdownSlice[] = groups
      .map((g) => {
        const matched = real.filter((e) => (g.key === 'sin_clasificar' ? !necessityByExpense.get(e.id) : necessityByExpense.get(e.id) === g.key))
        return { key: g.key, label: g.label, total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body = (
      <BreakdownDonut
        slices={slices}
        centerLabel={{ name: 'Todo', total: totalReal }}
        onViewRecords={(key) =>
          key === 'sin_clasificar'
            ? viewFor({}, `Sin clasificar — ${periodLabel}`)
            : viewFor({ necessity: key as 'debo' | 'necesito' | 'quiero' }, `${NECESSITY_LABELS[key as 'debo' | 'necesito' | 'quiero']} — ${periodLabel}`)
        }
      />
    )
  } else {
    const groups: { key: 'fijo' | 'variable' | 'sin_clasificar'; label: string }[] = [
      { key: 'fijo', label: 'Fijo' },
      { key: 'variable', label: 'Variable' },
      { key: 'sin_clasificar', label: 'Sin clasificar' },
    ]
    const isFixedByExpense = new Map(real.map((e) => [e.id, resolveCategoryClassification(e.category, categories).isFixed]))
    const slices: BreakdownSlice[] = groups
      .map((g) => {
        const matched = real.filter((e) =>
          g.key === 'sin_clasificar' ? isFixedByExpense.get(e.id) == null : isFixedByExpense.get(e.id) === (g.key === 'fijo'),
        )
        return { key: g.key, label: g.label, total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body = (
      <BreakdownDonut
        slices={slices}
        centerLabel={{ name: 'Todo', total: totalReal }}
        onViewRecords={(key) => (key === 'sin_clasificar' ? viewFor({}, `Sin clasificar — ${periodLabel}`) : viewFor({ isFixed: key === 'fijo' }, `${key === 'fijo' ? 'Fijo' : 'Variable'} — ${periodLabel}`))}
      />
    )
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="filter-row" style={{ marginBottom: 8 }}>
        {(['dia', 'semana', 'mes', 'año', 'rango'] as SpendRangePreset[]).map((p) => (
          <button key={p} type="button" className={'chip' + (preset === p ? ' chip-active' : '')} onClick={() => setPreset(p)}>
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      {preset === 'rango' && (
        <div className="inline-fields" style={{ marginBottom: 8 }}>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span>a</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}

      {/* Skill de Pepa, punto 8: mismo selector, mismo periodo, mismo
          total general — solo cambia la dimensión de agrupación. */}
      <div className="filter-row" style={{ marginBottom: 8 }}>
        <button type="button" className={'chip' + (view === 'categorias' ? ' chip-active' : '')} onClick={() => setView('categorias')}>
          Categorías
        </button>
        <button type="button" className={'chip' + (view === 'etiquetas' ? ' chip-active' : '')} onClick={() => setView('etiquetas')}>
          Etiquetas
        </button>
        <button type="button" className={'chip' + (view === 'dnq' ? ' chip-active' : '')} onClick={() => setView('dnq')}>
          Debo/Necesito/Quiero
        </button>
        <button type="button" className={'chip' + (view === 'fijo' ? ' chip-active' : '')} onClick={() => setView('fijo')}>
          Fijo/variable
        </button>
      </div>

      <div className="card event-card">
        <strong>Gastos — {periodLabel}</strong>
        <p style={{ margin: '4px 0' }}>{totalReal.toFixed(2)} €</p>
        {body}
      </div>

      <EvolucionTemporal expenses={expenses} onViewMovements={onViewMovements} />
      <PorQueHaCambiadoMiGasto purchases={purchases} productNames={productNames} onViewMovements={onViewMovements} />
    </div>
  )
}

// Skill de Pepa, punto 13: ingresos/gastos/ahorro mes a mes, con acceso
// directo a los movimientos de cada mes.
function EvolucionTemporal({ expenses, onViewMovements }: { expenses: Expense[]; onViewMovements: (f: MovementsFilter) => void }) {
  const months = useMemo(() => {
    const now = new Date()
    const list: { key: string; label: string; from: string; to: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const from = `${key}-01`
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const to = `${key}-${String(lastDay).padStart(2, '0')}`
      list.push({ key, label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`, from, to })
    }
    return list
  }, [])

  const rows = months.map((m) => {
    const inMonth = expenses.filter((e) => e.kind === 'real' && e.expenseDate >= m.from && e.expenseDate <= m.to)
    const income = inMonth.filter((e) => e.isIncome).reduce((s, e) => s + e.amount, 0)
    const spent = inMonth.filter((e) => !e.isIncome).reduce((s, e) => s + e.amount, 0)
    return { ...m, income, spent, ahorro: income - spent, count: inMonth.length }
  })
  const maxAmount = Math.max(1, ...rows.map((r) => Math.max(r.income, r.spent)))

  return (
    <div className="card event-card">
      <strong>Evolución temporal — últimos 6 meses</strong>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{r.label}</span>
              <span className={r.ahorro >= 0 ? 'muted' : 'error'}>Ahorro: {r.ahorro.toFixed(2)} €</span>
            </div>
            <div style={{ display: 'flex', height: 8, gap: 2, marginTop: 3 }}>
              <div style={{ width: `${(r.income / maxAmount) * 100}%`, background: '#2f9e44', borderRadius: 3 }} />
            </div>
            <div style={{ display: 'flex', height: 8, gap: 2, marginTop: 2 }}>
              <div style={{ width: `${(r.spent / maxAmount) * 100}%`, background: '#e64980', borderRadius: 3 }} />
            </div>
            <button
              type="button"
              className="link-button"
              style={{ fontSize: 12 }}
              onClick={() => onViewMovements({ label: `Movimientos — ${r.label}`, from: r.from, to: r.to })}
            >
              +{r.income.toFixed(2)} € / -{r.spent.toFixed(2)} € · {r.count} {r.count === 1 ? 'registro' : 'registros'} · Ver →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Skill de Pepa, punto 14: solo se muestra si hay datos de tickets
// suficientes en los dos meses a comparar — si no, se explica qué
// falta en vez de enseñar un desglose vacío o inventado.
function PorQueHaCambiadoMiGasto({
  purchases,
  productNames,
  onViewMovements,
}: {
  purchases: RawPurchase[]
  productNames: Map<string, string>
  onViewMovements: (f: MovementsFilter) => void
}) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  const hasCurrent = purchases.some((p) => p.recordedDate.startsWith(currentMonth))
  const hasPrevious = purchases.some((p) => p.recordedDate.startsWith(previousMonth))

  return (
    <div className="card event-card">
      <strong>¿Por qué ha cambiado mi gasto?</strong>
      {!hasCurrent || !hasPrevious ? (
        <p className="muted" style={{ marginTop: 6 }}>
          Todavía no hay tickets suficientes este mes y el anterior para desglosar el cambio de gasto — en cuanto haya
          tickets de ambos meses, Pepa podrá explicar cuánto se debe a precio, a cantidad o a productos nuevos.
        </p>
      ) : (
        (() => {
          const b = decomposeSpendChange(purchases, currentMonth, previousMonth)
          const delta = b.currentTotal - b.previousTotal
          const topMovers = compareMonths(averagePricesByMonth(purchases), currentMonth, previousMonth)
            .filter((c) => c.previousPrice != null && c.deltaPercent != null)
            .sort((a, b2) => Math.abs(b2.deltaPercent!) - Math.abs(a.deltaPercent!))
            .slice(0, 3)
          return (
            <>
              <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>
                Análisis basado en los productos leídos de tus tickets — puede no coincidir exactamente con el banco.
              </p>
              <p style={{ margin: '2px 0' }}>
                Cesta de tickets: {b.previousTotal.toFixed(2)} € → {b.currentTotal.toFixed(2)} € ({delta >= 0 ? '+' : ''}
                {delta.toFixed(2)} €)
              </p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                <li>Por cambio de precio: {b.priceEffect >= 0 ? '+' : ''}{b.priceEffect.toFixed(2)} €</li>
                <li>Por comprar más o menos cantidad: {b.quantityEffect >= 0 ? '+' : ''}{b.quantityEffect.toFixed(2)} €</li>
                <li>Por productos nuevos: +{b.newProductsEffect.toFixed(2)} €</li>
                <li>Por productos que ya no se compran: {b.droppedProductsEffect.toFixed(2)} €</li>
              </ul>
              {topMovers.length > 0 && (
                <>
                  <p className="muted" style={{ margin: '10px 0 2px', fontSize: 12 }}>
                    Productos que más han cambiado de precio:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {topMovers.map((c) => (
                      <li key={c.productId}>
                        {productNames.get(c.productId) ?? '?'}: {c.previousPrice!.toFixed(2)} € → {c.currentPrice!.toFixed(2)} € (
                        {c.deltaPercent! >= 0 ? '+' : ''}
                        {c.deltaPercent!.toFixed(0)}%)
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button
                type="button"
                className="link-button"
                style={{ marginTop: 6 }}
                onClick={() => onViewMovements({ label: `Tickets — ${currentMonth}`, from: `${currentMonth}-01`, to: `${currentMonth}-31` })}
              >
                Ver movimientos de este mes →
              </button>
            </>
          )
        })()
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Gastos (Skill 17/18)
// ---------------------------------------------------------------------

// Gastos es ahora el ÚNICO sitio de la app para ver y categorizar
// cualquier movimiento, y el único con el botón flotante para crear
// categorías y apuntar gastos (petición real: "en Gastos solo debería
// haber una lista de los gastos, al estilo de los productos, cada uno
// en una línea estrecha, ordenados por fecha y donde se puedan
// categorizar... traslado el botón flotante de Presupuesto General a
// Gastos"). Presupuesto Generales y Registro Alimentación pasan a leer
// de esta misma lista, sin su propio sitio para crearlos.
function ExpensesTab({
  filter,
  onClearFilter,
}: {
  filter?: MovementsFilter | null
  onClearFilter?: () => void
}) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // "YYYY-MM" del mes que se está viendo — no siempre el actual, para
  // poder consultar meses anteriores (o cualquier mes suelto, como
  // febrero) en vez de solo el que corre. Se ignora mientras haya un
  // `filter` activo (viene de "Ver X registros →" en Estadísticas).
  const [visibleMonth, setVisibleMonth] = useState(toDateStr(new Date()).slice(0, 7))
  const [managing, setManaging] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Igual que las categorías sugeridas de Presupuesto Generales: se dan
  // de alta solas la primera vez, sin pedirlo — petición real: "los
  // ingresos también se deberían poder categorizar, como sueldo,
  // regalo, ingreso".
  const seededIncomeRef = useRef(false)

  function reload() {
    setLoading(true)
    Promise.all([listExpenses(), listBudgetCategories(), listTags()])
      .then(async ([e, c, t]) => {
        if (!seededIncomeRef.current && !c.some((cat) => cat.budgetGroup === 'ingresos')) {
          seededIncomeRef.current = true
          await createBudgetCategoriesBulk(INCOME_CATEGORY_SEED.map((s) => ({ ...s, budgetGroup: 'ingresos' })))
          c = await listBudgetCategories()
        }
        setExpenses(e)
        setCategories(c)
        setTags(t)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  function shiftMonth(delta: number) {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setVisibleMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Skill de Pepa, punto 24: el filtro que llega de "Ver X registros →"
  // manda sobre la navegación por mes normal — mismos criterios que
  // produjeron la cifra, ni uno más ni uno menos.
  const filteredExpenses = useMemo(() => {
    if (!filter) return expenses.filter((e) => e.expenseDate.startsWith(visibleMonth))
    return expenses.filter((e) => {
      if (filter.from && e.expenseDate < filter.from) return false
      if (filter.to && e.expenseDate > filter.to) return false
      if (filter.category !== undefined && e.category !== filter.category) return false
      if (filter.tagId !== undefined && e.tagId !== filter.tagId) return false
      if (filter.necessity !== undefined || filter.isFixed !== undefined) {
        const classification = resolveCategoryClassification(e.category, categories)
        if (filter.necessity !== undefined && classification.necessity !== filter.necessity) return false
        if (filter.isFixed !== undefined && classification.isFixed !== filter.isFixed) return false
      }
      if (filter.isIncome !== undefined && e.isIncome !== filter.isIncome) return false
      return true
    })
  }, [expenses, filter, visibleMonth])

  const monthExpenses = filteredExpenses

  const monthTotal = useMemo(
    () => monthExpenses.filter((e) => e.kind === 'real' && !e.isIncome).reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses],
  )

  // Petición real: "gráficos de estadísticas, total ingresos" — un
  // ingreso (nómina, paga extra...) es el mismo movimiento, solo
  // marcado al revés. Se crean desde el "Resumen" de cada presupuesto
  // (Skill: ingresos separados por pestaña), pero se ven aquí también
  // para tener el listado completo por fecha.
  const monthIncome = useMemo(
    () => monthExpenses.filter((e) => e.isIncome).reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses],
  )

  if (loading) return <p className="muted">Cargando gastos…</p>

  const [visibleYear, visibleMonthIndex] = visibleMonth.split('-').map(Number)

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {filter ? (
        <div className="card event-card">
          <strong>Filtro: {filter.label}</strong>
          <p className="muted" style={{ margin: '4px 0' }}>
            {monthExpenses.length} {monthExpenses.length === 1 ? 'registro' : 'registros'}
          </p>
          <button type="button" className="link-button" onClick={onClearFilter}>
            ✕ Quitar filtro
          </button>
        </div>
      ) : (
        <div className="month-nav">
          <button type="button" className="link-button" onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <strong>
            {MONTH_LABELS[visibleMonthIndex - 1]} {visibleYear}
          </strong>
          <button type="button" className="link-button" onClick={() => shiftMonth(1)}>
            ›
          </button>
          <input
            type="month"
            value={visibleMonth}
            onChange={(e) => e.target.value && setVisibleMonth(e.target.value)}
          />
          <button type="button" className="link-button" onClick={() => setVisibleMonth(toDateStr(new Date()).slice(0, 7))}>
            Hoy
          </button>
        </div>
      )}

      <p className="points-badge">
        {monthTotal.toFixed(2)} € gastados
        {monthIncome > 0 && ` · +${monthIncome.toFixed(2)} € ingresados`}
      </p>

      <div className="price-row-list">
        {monthExpenses.map((e) =>
          editingId === e.id ? (
            <EditExpenseInline
              key={e.id}
              expense={e}
              categories={categories}
              tags={tags}
              onDone={() => {
                setEditingId(null)
                reload()
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={e.id} className="price-row" onClick={() => setEditingId(e.id)} style={{ cursor: 'pointer' }}>
              <span className="price-row-name">
                {!e.isIncome && categories.find((c) => c.name === e.category)?.icon} {e.category}
                <span className="muted">
                  {' '}
                  · {e.expenseDate}
                  {e.store && ` · ${e.store}`}
                  {e.kind !== 'real' && ` · ${e.kind}`}
                  {e.tagId && ` · 🏷️ ${tags.find((t) => t.id === e.tagId)?.name ?? ''}`}
                </span>
              </span>
              <span className="price-row-price" style={{ color: e.isIncome ? '#1e8449' : undefined }}>
                {e.isIncome ? '+' : ''}
                {e.amount.toFixed(2)} €
              </span>
              <span onClick={(ev) => ev.stopPropagation()}>
                <ConfirmIconButton
                  icon="✕"
                  className="icon-button"
                  ariaLabel="Borrar movimiento"
                  onConfirm={() => deleteExpense(e.id).then(reload)}
                />
              </span>
            </div>
          ),
        )}
        {monthExpenses.length === 0 && <p className="muted">No hay gastos este mes.</p>}
      </div>

      <button type="button" className="screen-fab" onClick={() => setManaging(true)}>
        + Categorías y movimientos
      </button>

      {managing && (
        <ManageCategoriesModal
          categories={categories}
          tags={tags}
          onClose={() => setManaging(false)}
          onChanged={reload}
        />
      )}
    </div>
  )
}

// Desplegable de etiqueta reutilizable — "Sin etiqueta" siempre
// disponible (Skill de Pepa: una etiqueta por movimiento, opcional).
function TagSelect({ value, onChange, tags }: { value: string; onChange: (v: string) => void; tags: Tag[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sin etiqueta</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}

// Editar cualquier movimiento de la lista de Gastos — categoría
// (desplegable real, ya no texto libre) para uno normal, o solo
// fecha/importe si es un ingreso (los ingresos no llevan categoría de
// presupuesto). Etiqueta, Debo/Necesito/Quiero y Fijo/variable se
// pueden asignar en los dos casos (Skill de Pepa, puntos 11/15/16).
function EditExpenseInline({
  expense,
  categories,
  tags,
  onDone,
  onCancel,
}: {
  expense: Expense
  categories: BudgetCategory[]
  tags: Tag[]
  onDone: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(expense.expenseDate)
  const [amount, setAmount] = useState(String(expense.amount))
  const [category, setCategory] = useState(expense.category)
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [store, setStore] = useState(expense.store ?? '')
  const [tagId, setTagId] = useState(expense.tagId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Skill de Pepa, puntos 15/16 — ya no se elige a mano por movimiento:
  // se hereda de la categoría (automática, editable en "+ Categorías y
  // movimientos" si la familia no está de acuerdo con la de fábrica).
  const classification = resolveCategoryClassification(category, categories)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateExpense(expense.id, {
        date,
        amount: Number(amount),
        category,
        tagId: tagId || null,
        ...(expense.isIncome ? {} : { store }),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form" onClick={(e) => e.stopPropagation()}>
      {expense.isIncome ? (
        <label>
          Categoría
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
            {incomeCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Categoría
          <CategorySelect value={category} onChange={setCategory} categories={categories} />
        </label>
      )}
      <div className="inline-fields">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {!expense.isIncome && (
        <label>
          Establecimiento (opcional)
          <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
        </label>
      )}
      <label>
        Etiqueta (opcional)
        <TagSelect value={tagId} onChange={setTagId} tags={tags} />
      </label>
      {!expense.isIncome && (
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          {classification.necessity ? NECESSITY_LABELS[classification.necessity] : 'Sin clasificar'}
          {' · '}
          {classification.isFixed == null ? 'Sin clasificar' : classification.isFixed ? 'Fijo' : 'Variable'}
          {' — según la categoría, editable en "+ Categorías y movimientos".'}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// El único botón flotante de Gastos (petición real: "traslado el botón
// flotante de Presupuesto General a Gastos"): crear categorías de
// cualquiera de los dos grupos, reordenarlas con flechas, y apuntar un
// gasto eligiendo la categoría de una lista.
function ManageCategoriesModal({
  categories,
  tags,
  onClose,
  onChanged,
}: {
  categories: BudgetCategory[]
  tags: Tag[]
  onClose: () => void
  onChanged: () => void
}) {
  const [newCategoryGroup, setNewCategoryGroup] = useState<'alimentacion' | 'generales' | 'ingresos'>('alimentacion')
  const [addingCategory, setAddingCategory] = useState(false)
  const [addingExpense, setAddingExpense] = useState(false)
  const [addingTag, setAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [renamingTagId, setRenamingTagId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function moveTag(index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= tags.length) return
    const next = [...tags]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    reorderTags(next.map((t) => t.id)).then(onChanged)
  }

  async function handleAddTag(e: FormEvent) {
    e.preventDefault()
    if (!newTagName.trim()) return
    await createTag({ name: newTagName.trim() })
    setNewTagName('')
    setAddingTag(false)
    onChanged()
  }

  async function handleRenameTag(id: string) {
    if (renameValue.trim()) await updateTag(id, { name: renameValue.trim() })
    setRenamingTagId(null)
    onChanged()
  }

  const alimentacion = categories.filter((c) => c.budgetGroup === 'alimentacion')
  const generales = categories.filter((c) => c.budgetGroup === 'generales')
  const ingresos = categories.filter((c) => c.budgetGroup === 'ingresos')

  function move(group: BudgetCategory[], index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= group.length) return
    const next = [...group]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    reorderBudgetCategories(next.map((c) => c.id)).then(onChanged)
  }

  function renderRow(c: BudgetCategory, list: BudgetCategory[], i: number, indent: boolean, showClassification: boolean) {
    return (
      <div key={c.id} className="card task-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, padding: '6px 10px', marginLeft: indent ? 20 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <div className="task-card-main">
            <strong style={{ fontSize: 13 }}>
              {c.icon} {c.name}
            </strong>
          </div>
          <button
            type="button"
            className="link-button"
            style={{ padding: 4 }}
            disabled={i === 0}
            onClick={() => move(list, i, -1)}
            aria-label={`Subir ${c.name}`}
          >
            ↑
          </button>
          <button
            type="button"
            className="link-button"
            style={{ padding: 4 }}
            disabled={i === list.length - 1}
            onClick={() => move(list, i, 1)}
            aria-label={`Bajar ${c.name}`}
          >
            ↓
          </button>
          <ConfirmIconButton
            icon="✕"
            className="link-button"
            ariaLabel={`Eliminar categoría ${c.name}`}
            onConfirm={() => deleteBudgetCategory(c.id).then(onChanged)}
          />
        </div>
        {/* Skill de Pepa, puntos 15/16 — clasificación automática de
            fábrica, editable aquí por la familia si no está de
            acuerdo (petición real: "editables si se quiere
            posteriormente por el usuario"). */}
        {showClassification && (
          <div className="inline-fields" style={{ gap: 6 }}>
            <select
              value={c.necessity ?? ''}
              onChange={(e) => updateBudgetCategory(c.id, { necessity: (e.target.value || null) as 'debo' | 'necesito' | 'quiero' | null }).then(onChanged)}
              style={{ fontSize: 12, padding: '4px 6px' }}
            >
              <option value="">Sin clasificar</option>
              <option value="debo">Debo</option>
              <option value="necesito">Necesito</option>
              <option value="quiero">Quiero</option>
            </select>
            <select
              value={c.isFixed == null ? '' : c.isFixed ? 'fijo' : 'variable'}
              onChange={(e) => updateBudgetCategory(c.id, { isFixed: e.target.value === '' ? null : e.target.value === 'fijo' }).then(onChanged)}
              style={{ fontSize: 12, padding: '4px 6px' }}
            >
              <option value="">Sin clasificar</option>
              <option value="fijo">Fijo</option>
              <option value="variable">Variable</option>
            </select>
          </div>
        )}
      </div>
    )
  }

  // Skill de Pepa, punto 10: dos niveles — cada categoría principal
  // muestra debajo sus subcategorías (parent_id), cada nivel se
  // reordena por separado.
  function renderGroupList(label: string, list: BudgetCategory[], showClassification: boolean) {
    const topLevel = list.filter((c) => !c.parentId)
    return (
      <>
        <p className="muted" style={{ marginBottom: 4, fontWeight: 600 }}>
          {label}
        </p>
        <div className="event-list" style={{ marginBottom: 8 }}>
          {topLevel.map((c, i) => {
            const children = list.filter((x) => x.parentId === c.id)
            return (
              <div key={c.id}>
                {renderRow(c, topLevel, i, false, showClassification)}
                {children.map((child, j) => renderRow(child, children, j, true, showClassification))}
              </div>
            )
          })}
          {topLevel.length === 0 && <p className="muted">Sin categorías todavía.</p>}
        </div>
      </>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Categorías y movimientos
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {/* Petición real: "subiría en ese menú los puntos de crear
            gasto y crear categoría arriba del todo y debajo la lista
            de categorías". */}
        <button type="button" className="link-button" onClick={() => setAddingExpense((v) => !v)}>
          {addingExpense ? 'Cerrar' : '+ Añadir movimiento'}
        </button>
        {addingExpense && (
          <AddExpenseToAnyCategoryInline
            categories={categories}
            onAdded={() => {
              setAddingExpense(false)
              onChanged()
            }}
          />
        )}

        <button type="button" className="link-button" onClick={() => setAddingCategory((v) => !v)}>
          {addingCategory ? 'Cerrar' : '+ Nueva categoría'}
        </button>
        {addingCategory && (
          <>
            <div className="filter-row" style={{ margin: '8px 0' }}>
              <button
                type="button"
                className={'chip' + (newCategoryGroup === 'alimentacion' ? ' chip-active' : '')}
                onClick={() => setNewCategoryGroup('alimentacion')}
              >
                Alimentación
              </button>
              <button
                type="button"
                className={'chip' + (newCategoryGroup === 'generales' ? ' chip-active' : '')}
                onClick={() => setNewCategoryGroup('generales')}
              >
                Generales
              </button>
              <button
                type="button"
                className={'chip' + (newCategoryGroup === 'ingresos' ? ' chip-active' : '')}
                onClick={() => setNewCategoryGroup('ingresos')}
              >
                Ingresos
              </button>
            </div>
            <AddBudgetCategoryInline
              budgetGroup={newCategoryGroup}
              parentOptions={categories.filter((c) => c.budgetGroup === newCategoryGroup && !c.parentId)}
              onAdded={() => {
                setAddingCategory(false)
                onChanged()
              }}
            />
          </>
        )}

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        {renderGroupList('Alimentación', alimentacion, true)}
        {renderGroupList('Generales', generales, true)}
        {renderGroupList('Ingresos', ingresos, false)}

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        {/* Skill de Pepa, punto 11: crear/editar/eliminar/reordenar
            etiquetas — libres, sin lista cerrada. */}
        <p className="muted" style={{ marginBottom: 4, fontWeight: 600 }}>
          Etiquetas
        </p>
        <div className="event-list" style={{ marginBottom: 8 }}>
          {tags.map((t, i) =>
            renamingTagId === t.id ? (
              <form
                key={t.id}
                className="inline-fields"
                style={{ marginBottom: 6 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  handleRenameTag(t.id)
                }}
              >
                <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                <button type="submit">Guardar</button>
              </form>
            ) : (
              <div key={t.id} className="card task-card" style={{ padding: '6px 10px', gap: 6, fontSize: 13 }}>
                <button
                  type="button"
                  className="task-card-main"
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => {
                    setRenamingTagId(t.id)
                    setRenameValue(t.name)
                  }}
                >
                  <strong style={{ fontSize: 13 }}>🏷️ {t.name}</strong>
                </button>
                <button type="button" className="link-button" style={{ padding: 4 }} disabled={i === 0} onClick={() => moveTag(i, -1)} aria-label={`Subir ${t.name}`}>
                  ↑
                </button>
                <button
                  type="button"
                  className="link-button"
                  style={{ padding: 4 }}
                  disabled={i === tags.length - 1}
                  onClick={() => moveTag(i, 1)}
                  aria-label={`Bajar ${t.name}`}
                >
                  ↓
                </button>
                <ConfirmIconButton icon="✕" className="link-button" ariaLabel={`Eliminar etiqueta ${t.name}`} onConfirm={() => deleteTag(t.id).then(onChanged)} />
              </div>
            ),
          )}
          {tags.length === 0 && <p className="muted">Todavía no hay etiquetas.</p>}
        </div>
        <button type="button" className="link-button" onClick={() => setAddingTag((v) => !v)}>
          {addingTag ? 'Cerrar' : '+ Nueva etiqueta'}
        </button>
        {addingTag && (
          <form onSubmit={handleAddTag} className="inline-fields" style={{ marginTop: 8 }}>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Eric, Vacaciones…"
              autoFocus
            />
            <button type="submit">Crear</button>
          </form>
        )}
      </div>
    </div>
  )
}

// Apuntar un gasto eligiendo la categoría de una lista (cualquiera de
// los dos grupos), sin tener que abrir antes su tarjeta.
function AddExpenseToAnyCategoryInline({
  categories,
  onAdded,
}: {
  categories: BudgetCategory[]
  onAdded: () => void
}) {
  // Petición real: "¿los ingresos dónde se apuntan? Debería ser en
  // gastos también... en el mismo formulario que se creen también
  // ingresos con un desplegable más" — mismo formulario, un chip
  // Gasto/Ingreso; un ingreso no lleva categoría de presupuesto ni
  // establecimiento, solo fecha e importe.
  const [isIncome, setIsIncome] = useState(false)
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [category, setCategory] = useState(categories[0]?.name ?? 'Alimentación')
  const [incomeCategory, setIncomeCategory] = useState(incomeCategories[0]?.name ?? 'Ingreso')
  const [store, setStore] = useState('')
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isIncome) {
        await addExpense({
          date,
          amount: Number(amount),
          category: incomeCategory,
          store: '',
          kind: 'real',
          isIncome: true,
          budgetGroup: 'generales',
        })
      } else {
        const matched = categories.find((c) => c.name === category)
        await addExpense({
          date,
          amount: Number(amount),
          category,
          store,
          kind: 'real',
          isIncome: false,
          budgetGroup: matched?.budgetGroup,
        })
      }
      setAmount('')
      setStore('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="member-form">
      <div className="filter-row">
        <button type="button" className={'chip' + (!isIncome ? ' chip-active' : '')} onClick={() => setIsIncome(false)}>
          Gasto
        </button>
        <button type="button" className={'chip' + (isIncome ? ' chip-active' : '')} onClick={() => setIsIncome(true)}>
          Ingreso
        </button>
      </div>
      {isIncome ? (
        <label>
          Categoría
          <select value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)}>
            {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
            {incomeCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Categoría
          <CategorySelect value={category} onChange={setCategory} categories={categories} />
        </label>
      )}
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      {!isIncome && (
        <label>
          Establecimiento (opcional)
          <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : isIncome ? 'Apuntar ingreso' : 'Apuntar gasto'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Tickets (Skill 10) — lectura automática con Gemini (nivel gratuito,
// la misma IA que reconoce alimentos en la foto de la nevera) en vez de
// OCR carácter-a-carácter: entiende el ticket como una foto completa,
// así que se le escapan muchos menos productos que a un OCR local en
// tickets arrugados o con letra pequeña. Alimenta el mismo historial de
// precios que ya usa la Memoria de la lista de la compra.
// ---------------------------------------------------------------------

// Nombre del ticket ya llevado al nombre de tienda DADO DE ALTA en
// Compras, si coincide con uno — así "MERCADONA, S.A." y "MERCADONA"
// se agrupan bajo el mismo "Mercadona" en vez de salir como grupos
// distintos por una simple diferencia de mayúsculas o de sufijo legal.
// Mismo truco ya probado que usa el reconocimiento de voz para tiendas
// (findKnownStore). Ojo: esto NO adivina que "H.Rafal II" es el mismo
// sitio que "Hiperber" — son palabras distintas de verdad, ninguna
// coincidencia de texto puede saber eso; para esos casos hay que
// corregir el ticket a mano una vez (el desplegable de abajo ya
// ofrece las tiendas dadas de alta para no tener que escribirlo).
const STORE_COLORS = ['#4C6EF5', '#e8590c', '#2f9e44', '#ae3ec9', '#f08c00', '#1098ad', '#e64980']

function canonicalStoreName(raw: string | null, knownStores: string[]): string {
  if (!raw || !raw.trim()) return 'Sin establecimiento'
  return findKnownStore(raw, knownStores)?.store ?? raw.trim()
}

// Petición real: "me creas también, aunque estén vacías, otras
// carpetas que sean de Aldi, Líder, Superdumbo... y con los
// supermercados que vayamos añadiendo, ya le vamos añadiendo más" —
// una carpeta por cada tienda YA DADA DE ALTA en Compras, aunque
// todavía no tenga ningún ticket guardado, no solo las que ya
// tuvieran alguno.
function groupReceiptsByStore(
  receipts: Receipt[],
  knownStores: string[],
): { store: string; receipts: Receipt[]; total: number }[] {
  const groups = new Map<string, Receipt[]>()
  for (const s of knownStores) groups.set(s, [])
  for (const r of receipts) {
    const key = canonicalStoreName(r.store, knownStores)
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  return [...groups.entries()]
    .map(([store, list]) => ({
      store,
      receipts: list,
      total: list.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total)
}

// Petición real: "tienes que poner una pestaña para añadir
// supermercado, para añadir tienda" — directamente aquí, sin tener que
// ir a Compras para dar de alta una tienda nueva antes de poder
// guardarle un ticket.
function AddStoreInline({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createShoppingStore(name.trim())
      setName('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir la tienda')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="inline-fields" style={{ marginBottom: 12 }}>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva tienda (p. ej. Aldi)" />
      <button type="submit" disabled={saving || !name.trim()}>
        + Añadir tienda
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [knownStores, setKnownStores] = useState<string[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Petición real: "créame una carpeta dentro de ticket por cada
  // supermercado... que cuando yo le toque la carpeta de Mercadona, se
  // me abran todos los tickets que hay guardados" — plegado por
  // defecto, solo el nombre/total a la vista; tocar la carpeta la
  // abre. Empieza vacío (todas plegadas) hasta que se toque alguna.
  const [expandedStore, setExpandedStore] = useState<string | null>(null)
  const [rangePreset, setRangePreset] = useState<SpendRangePreset>('mes')
  const [rangeCustomFrom, setRangeCustomFrom] = useState(toDateStr(new Date()))
  const [rangeCustomTo, setRangeCustomTo] = useState(toDateStr(new Date()))

  function reload() {
    setLoading(true)
    listReceipts()
      .then(setReceipts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    listShoppingStores()
      .then((rows) => setKnownStores(rows.map((s) => s.name)))
      .catch(() => {})
    listBudgetCategories().then(setCategories).catch(() => {})
    listFamilyMembers().then(setMembers).catch(() => {})
  }, [])

  async function handleDelete(receipt: Receipt) {
    try {
      await deleteReceipt(receipt)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    }
  }

  if (loading) return <p className="muted">Cargando tickets…</p>

  const grouped = groupReceiptsByStore(receipts, knownStores)
  const storeNames = grouped.map((g) => g.store)
  const [rangeFrom, rangeTo] = rangeForPreset(rangePreset, rangeCustomFrom, rangeCustomTo)
  const rangeFilteredReceipts = receipts.filter((r) => r.receiptDate >= rangeFrom && r.receiptDate <= rangeTo)
  const rangeGrouped = groupReceiptsByStore(rangeFilteredReceipts, knownStores)

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <datalist id="receipt-known-stores">
        {knownStores.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* Petición real: "el aparato para subir tickets... arriba del
          todo" — antes iba al final de la lista. */}
      <ReceiptForm mode="add" onDone={reload} knownStores={knownStores} existingFolders={storeNames} categories={categories} members={members} />

      {/* Petición real: "reparto del gasto por tienda, eso me lo hace
          del total, y no quiero que me lo haga del total... que las
          estadísticas se ajusten al selector que tenemos arriba" — un
          único selector de fecha (arriba del todo) para el total, el
          reparto por tienda y el gasto mensual, en vez de uno nuevo en
          cada apartado. */}
      <ReceiptSpendSummary
        receipts={receipts}
        knownStores={knownStores}
        storeNames={storeNames}
        preset={rangePreset}
        onPresetChange={setRangePreset}
        customFrom={rangeCustomFrom}
        onCustomFromChange={setRangeCustomFrom}
        customTo={rangeCustomTo}
        onCustomToChange={setRangeCustomTo}
      />

      {receipts.length > 0 && (
        <>
          <StoreBreakdownChart groups={rangeGrouped} />
          <StoreMonthlyChart receipts={rangeFilteredReceipts} knownStores={knownStores} storeNames={storeNames} from={rangeFrom} to={rangeTo} />
        </>
      )}

      {/* Petición real: "créame una carpeta dentro de ticket por cada
          supermercado... que cuando yo le toque la carpeta de
          Mercadona, se me abran todos los tickets que hay guardados...
          que desaparezcan los tickets de ahí abajo y que ahí pongan
          las carpetas". Una carpeta por tienda, plegada por defecto
          (logo real, nombre, nº de tickets y total) — los tickets
          sueltos ya no se ven directamente, solo dentro de su carpeta.
          Una carpeta por cada tienda ya dada de alta, aunque no tenga
          tickets todavía (petición real: "aunque estén vacías, me
          creas las carpetas... y con los supermercados que vayamos
          añadiendo, ya le vamos añadiendo más" — de ahí el formulario
          de abajo para dar de alta una tienda nueva sin salir de aquí).
          Se filtran con el mismo selector de arriba (Hoy/Esta
          semana/Este mes/Este año/Rango) — petición real: "tickets
          guardados tengo de Mercadona 583, pero son los del mes pasado
          y los de este... quiero filtrarme solo por los de este mes o
          por esta semana". */}
      <h2 className="section-title">Tickets guardados</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Se filtran con el selector de arriba ({PRESET_LABELS[rangePreset]}).
      </p>
      <AddStoreInline onAdded={() => listShoppingStores().then((rows) => setKnownStores(rows.map((s) => s.name)))} />
      <div className="store-folder-grid">
        {rangeGrouped.map(({ store, receipts: storeReceipts, total }) => {
          const isOpen = expandedStore === store
          return (
            <div key={store} className="store-folder">
              <button
                type="button"
                className="store-folder-header"
                onClick={() => setExpandedStore(isOpen ? null : store)}
              >
                <span className="store-folder-icon">
                  <StoreIcon name={store} size={22} />
                </span>
                <span className="store-folder-info">
                  <strong>{store}</strong>
                  <span className="muted">
                    {storeReceipts.length} {storeReceipts.length === 1 ? 'ticket' : 'tickets'} · {total.toFixed(2)} €
                  </span>
                </span>
                <span className="store-folder-chevron">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="event-list store-folder-contents">
                  {storeReceipts.map((r) =>
                    editingId === r.id ? (
                      <ReceiptForm
                        key={r.id}
                        mode="edit"
                        receipt={r}
                        existingFolders={storeNames}
                        knownStores={knownStores}
                        categories={categories}
                        members={members}
                        onDone={() => {
                          setEditingId(null)
                          reload()
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <ReceiptRow
                        key={r.id}
                        receipt={r}
                        members={members}
                        onEdit={() => setEditingId(r.id)}
                        onDelete={() => handleDelete(r)}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {receipts.length === 0 && <p className="muted">No hay tickets guardados.</p>}
    </div>
  )
}

// Petición real: "que se pueda ver por cada mes lo que he gastado...
// por meses, por años, por día, por semana o por rango de fecha que
// yo le ponga" — filtro de fecha con presets rápidos más un rango a
// medida, cruzado con la tienda (o todas), sobre el mismo dato ya
// cargado (sin ida y vuelta al servidor por cada cambio de filtro).
function ReceiptSpendSummary({
  receipts,
  knownStores,
  storeNames,
  preset,
  onPresetChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
}: {
  receipts: Receipt[]
  knownStores: string[]
  storeNames: string[]
  preset: SpendRangePreset
  onPresetChange: (p: SpendRangePreset) => void
  customFrom: string
  onCustomFromChange: (d: string) => void
  customTo: string
  onCustomToChange: (d: string) => void
}) {
  const [selectedStore, setSelectedStore] = useState('Todas')

  const [from, to] = rangeForPreset(preset, customFrom, customTo)

  const filtered = receipts.filter((r) => {
    if (r.receiptDate < from || r.receiptDate > to) return false
    if (selectedStore === 'Todas') return true
    return canonicalStoreName(r.store, knownStores) === selectedStore
  })
  const total = filtered.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0)

  return (
    <div className="card event-card">
      <strong>Cuánto he gastado</strong>
      <div className="filter-row" style={{ marginTop: 8, marginBottom: 8 }}>
        {(['dia', 'semana', 'mes', 'año', 'rango'] as SpendRangePreset[]).map((p) => (
          <button
            key={p}
            type="button"
            className={'chip' + (preset === p ? ' chip-active' : '')}
            onClick={() => onPresetChange(p)}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      {preset === 'rango' && (
        <div className="inline-fields" style={{ marginBottom: 8 }}>
          <input type="date" value={customFrom} onChange={(e) => onCustomFromChange(e.target.value)} />
          <span>a</span>
          <input type="date" value={customTo} onChange={(e) => onCustomToChange(e.target.value)} />
        </div>
      )}
      <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} style={{ marginBottom: 8 }}>
        <option value="Todas">Todas las tiendas</option>
        {storeNames.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <p>
        {total.toFixed(2)} € · {filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}
      </p>
    </div>
  )
}

// Petición real: "un gráfico general con lo que se gasta cada mes en
// todos los supermercados... Mercadona el setenta por ciento de las
// compras... Hiperber el treinta por ciento" — barras horizontales,
// una por tienda, con el importe y el % sobre el total de todas.
function StoreBreakdownChart({ groups }: { groups: { store: string; receipts: Receipt[]; total: number }[] }) {
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)
  const maxTotal = Math.max(...groups.map((g) => g.total), 1)
  return (
    <div className="card event-card">
      <strong>Reparto del gasto por tienda</strong>
      <div className="price-row-list" style={{ marginTop: 8 }}>
        {groups.map((g, i) => {
          const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0
          return (
            <div key={g.store} className="store-bar-row">
              <span className="price-row-name">{g.store}</span>
              <div className="store-bar-track">
                <div
                  className="store-bar-fill"
                  style={{ width: `${(g.total / maxTotal) * 100}%`, background: STORE_COLORS[i % STORE_COLORS.length] }}
                />
              </div>
              <span className="store-bar-value">
                {pct.toFixed(0)}% · {g.total.toFixed(2)} €
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Petición real: "un gráfico con lo que se va gastando cada mes en ese
// supermercado" — barras verticales, para la tienda elegida (o todas
// juntas), acotado al mismo selector de fecha de arriba (antes eran
// siempre los últimos 6 meses fijos, sin importar el filtro elegido).
function StoreMonthlyChart({
  receipts,
  knownStores,
  storeNames,
  from,
  to,
}: {
  receipts: Receipt[]
  knownStores: string[]
  storeNames: string[]
  from: string
  to: string
}) {
  const [selectedStore, setSelectedStore] = useState('Todas')

  const months = useMemo(() => {
    const start = new Date(from + 'T00:00')
    const end = new Date(to + 'T00:00')
    const list: string[] = []
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const last = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cursor <= last) {
      list.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return list
  }, [from, to])

  const totalsByMonth = useMemo(() => {
    const sums = new Map<string, number>()
    for (const r of receipts) {
      if (selectedStore !== 'Todas' && canonicalStoreName(r.store, knownStores) !== selectedStore) continue
      const month = r.receiptDate.slice(0, 7)
      sums.set(month, (sums.get(month) ?? 0) + (r.totalAmount ?? 0))
    }
    return sums
  }, [receipts, knownStores, selectedStore])

  const maxValue = Math.max(...months.map((m) => totalsByMonth.get(m) ?? 0), 1)

  return (
    <div className="card event-card">
      <strong>Gasto mensual</strong>
      <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} style={{ margin: '8px 0' }}>
        <option value="Todas">Todas las tiendas</option>
        {storeNames.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="month-bar-chart">
        {months.map((m) => {
          const value = totalsByMonth.get(m) ?? 0
          const mo = Number(m.split('-')[1])
          return (
            <div key={m} className="month-bar-col">
              <div className="month-bar-track">
                <div className="month-bar-fill" style={{ height: `${(value / maxValue) * 100}%` }} title={`${value.toFixed(2)} €`} />
              </div>
              <span className="month-bar-label">
                {MONTH_LABELS[mo - 1].slice(0, 3)}
                <br />
                {value > 0 ? `${value.toFixed(0)}€` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Desplegable de categoría compartido entre el formulario de tickets y
// (más adelante) cualquier otro sitio que quiera clasificar un gasto —
// agrupa las categorías reales de cada presupuesto (Alimentación /
// Generales) para poder ver de un vistazo a qué grupo pertenece cada
// una, con "Alimentación" y "Amazon" sueltos arriba como valores
// genéricos por defecto (el primero ya contaba como el total de
// tickets de super, Skill 19; el segundo es para pedidos de Amazon
// mientras no se reclasifiquen a mano).
function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string
  onChange: (v: string) => void
  categories: BudgetCategory[]
}) {
  const alimentacion = categories.filter((c) => c.budgetGroup === 'alimentacion')
  const generales = categories.filter((c) => c.budgetGroup === 'generales')
  const known = new Set(['Alimentación', 'Amazon', ...alimentacion.map((c) => c.name), ...generales.map((c) => c.name)])

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="Alimentación">Alimentación (general)</option>
      <option value="Amazon">Amazon (sin clasificar)</option>
      {alimentacion.length > 0 && (
        <optgroup label="Alimentación — categorías">
          {alimentacion.map((c) => (
            <option key={c.id} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {generales.length > 0 && (
        <optgroup label="Generales">
          {generales.map((c) => (
            <option key={c.id} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {/* Valor ya guardado que no coincide con ninguna categoría de
          arriba (texto suelto de antes de este cambio) — se muestra tal
          cual para no perderlo silenciosamente al abrir el formulario. */}
      {value && !known.has(value) && <option value={value}>{value}</option>}
    </select>
  )
}

function ReceiptRow({
  receipt,
  members,
  onEdit,
  onDelete,
}: {
  receipt: Receipt
  members: FamilyMember[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [lines, setLines] = useState<ReceiptLineDetail[] | null>(null)
  const [loadingLines, setLoadingLines] = useState(false)
  const [viewing, setViewing] = useState(false)

  const purchaser = receipt.purchasedByMemberId ? members.find((m) => m.id === receipt.purchasedByMemberId) : null

  async function handleToggleExpand() {
    setExpanded((prev) => !prev)
    if (lines === null) {
      setLoadingLines(true)
      try {
        setLines(await listProductPricesByReceipt(receipt.id))
      } catch {
        setLines([])
      } finally {
        setLoadingLines(false)
      }
    }
  }

  async function handleViewTicket() {
    if (!receipt.storagePath || viewing) return
    setViewing(true)
    try {
      const url = await getReceiptUrl(receipt.storagePath)
      window.open(url, '_blank')
    } finally {
      setViewing(false)
    }
  }

  return (
    <div className="card receipt-row">
      <div className="receipt-row-main">
        <button type="button" className="receipt-row-summary" onClick={handleToggleExpand}>
          <span>{receipt.receiptDate}</span>
          {receipt.totalAmount != null && <span> · {receipt.totalAmount.toFixed(2)} €</span>}
          <span> · {receipt.category}</span>
          {purchaser && <span className="muted"> · {purchaser.name}</span>}
        </button>
        <div className="receipt-row-actions">
          {receipt.storagePath && (
            <button type="button" className="icon-button" onClick={handleViewTicket} aria-label="Ver ticket" title="Ver ticket">
              👁
            </button>
          )}
          <button type="button" className="icon-button" onClick={onEdit} aria-label="Editar ticket" title="Editar">
            ✏️
          </button>
          <ConfirmIconButton icon="✕" onConfirm={onDelete} ariaLabel="Borrar ticket" className="icon-button" />
        </div>
      </div>
      {expanded && (
        <div className="receipt-row-detail">
          {loadingLines && <p className="muted">Cargando detalle…</p>}
          {!loadingLines && lines && lines.length === 0 && (
            <p className="muted">No se guardó el detalle de productos de este ticket.</p>
          )}
          {!loadingLines &&
            lines &&
            lines.map((l) => (
              <p key={l.id} className="muted receipt-row-detail-line">
                {l.name}
                {l.quantity && ` · ${l.quantity} ud`} · {l.price.toFixed(2)} €/ud
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

interface DraftLine {
  name: string
  quantity: string
  price: string // importe TOTAL de la línea (cantidad × precio unitario), no el precio por unidad
}

type OcrStatus = 'idle' | 'reading' | 'done' | 'error'

// Mismo formulario para subir un ticket nuevo y para editar uno ya
// guardado (petición real: "cuando se quiera editar el ticket debe
// abrirse el mismo formulario que para subirlo") — en modo edición se
// precarga con los datos del ticket y sus líneas ya leídas (reconstruidas
// desde el Historial, Skill 09), y no hay selector de foto/OCR porque el
// archivo ya está subido.
function ReceiptForm({
  mode,
  receipt,
  onDone,
  onCancel,
  knownStores,
  existingFolders,
  categories,
  members,
}: {
  mode: 'add' | 'edit'
  receipt?: Receipt
  onDone: () => void
  onCancel?: () => void
  knownStores: string[]
  existingFolders: string[]
  categories: BudgetCategory[]
  members: FamilyMember[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [store, setStore] = useState(receipt?.store ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt?.receiptDate ?? toDateStr(new Date()))
  const [totalAmount, setTotalAmount] = useState(receipt?.totalAmount != null ? String(receipt.totalAmount) : '')
  const [category, setCategory] = useState(receipt?.category ?? 'Alimentación')
  const [purchasedByMemberId, setPurchasedByMemberId] = useState(receipt?.purchasedByMemberId ?? '')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle')
  const [loadingLines, setLoadingLines] = useState(mode === 'edit')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'edit' || !receipt) return
    listProductPricesByReceipt(receipt.id)
      .then((detail) =>
        setLines(
          detail.map((l) => {
            const qty = Number(l.quantity)
            const totalLinePrice = Number.isFinite(qty) && qty > 0 ? l.price * qty : l.price
            return { name: l.name, quantity: l.quantity ?? '1', price: totalLinePrice.toFixed(2) }
          }),
        ),
      )
      .catch(() => {})
      .finally(() => setLoadingLines(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, receipt?.id])

  async function handleReadTicket() {
    if (!file) return
    setOcrStatus('reading')
    setError(null)
    try {
      const parsed = await analyzeReceiptPhoto(file)
      // Lleva "MERCADONA, S.A." al nombre ya dado de alta en Compras
      // ("Mercadona") cuando coincide, para no crear un grupo de
      // tickets distinto por cada variante del mismo nombre.
      if (parsed.store) setStore(findKnownStore(parsed.store, knownStores)?.store ?? parsed.store)
      if (parsed.date) setReceiptDate(parsed.date)
      if (parsed.total != null) setTotalAmount(String(parsed.total))
      setLines(parsed.items.map((l) => ({ name: l.name, quantity: String(l.quantity), price: l.price.toFixed(2) })))
      setOcrStatus('done')
    } catch (err) {
      setOcrStatus('error')
      setError(err instanceof Error ? err.message : 'No se pudo leer el ticket')
    }
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function addBlankLine() {
    setLines((prev) => [...prev, { name: '', quantity: '1', price: '' }])
  }

  async function saveLines(receiptId: string) {
    // En paralelo, no uno a uno: con muchos productos leídos, guardarlos
    // en serie tardaba tanto (una llamada de red por línea) que parecía
    // que se había quedado colgado en "Subiendo…" — bug real detectado
    // al probar con un ticket de varias líneas.
    await Promise.all(
      lines
        .filter((line) => line.name.trim() && !Number.isNaN(Number(line.price)))
        .map((line) => {
          // "Precio" es el importe TOTAL de la línea ("3 cervezas,
          // 3,30€"), no el precio de una — bug real reportado: se
          // guardaba tal cual y la Memoria de precios enseñaba 3,30€
          // como si fuera el precio de una unidad. Se divide entre
          // las unidades para guardar siempre precio por unidad.
          const units = Number(line.quantity)
          const unitPrice = Number.isFinite(units) && units > 0 ? Number(line.price) / units : Number(line.price)
          return recordProductPurchase({
            name: line.name.trim(),
            price: unitPrice,
            quantity: line.quantity || '1',
            unit: '',
            store,
            date: receiptDate,
            receiptId,
          })
        }),
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'add' && !file) {
      setError('Elige una foto o archivo del ticket')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'add') {
        const receiptId = await uploadReceipt({
          file: file!,
          store,
          receiptDate,
          totalAmount: totalAmount ? Number(totalAmount) : null,
          category,
          purchasedByMemberId: purchasedByMemberId || null,
        })
        await saveLines(receiptId)
        setFile(null)
        setStore('')
        setTotalAmount('')
        setCategory('Alimentación')
        setPurchasedByMemberId('')
        setLines([])
        setOcrStatus('idle')
      } else if (receipt) {
        await updateReceipt(receipt.id, {
          store,
          receiptDate,
          totalAmount: totalAmount ? Number(totalAmount) : null,
          category,
          purchasedByMemberId: purchasedByMemberId || null,
        })
        // Se sustituyen todas las líneas por las editadas, en vez de
        // intentar emparejar una a una con las que ya había.
        await deleteProductPricesByReceipt(receipt.id)
        await saveLines(receipt.id)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      {mode === 'add' && (
        <>
          <h2>Subir ticket</h2>
          <p className="muted">
            La foto del ticket se guarda solo los últimos 3 meses; pasado ese tiempo se borra la foto
            (la tienda, la fecha y el importe se quedan igual).
          </p>
          <label>Foto o archivo</label>
          <FileOrPdfPicker
            file={file}
            onChange={(f) => {
              setFile(f)
              setLines([])
              setOcrStatus('idle')
            }}
          />

          {file && (
            <button type="button" className="voice-mic-button" onClick={handleReadTicket} disabled={ocrStatus === 'reading'}>
              {ocrStatus === 'reading' ? 'Leyendo ticket… puede tardar unos segundos' : '📷 Leer ticket'}
            </button>
          )}
        </>
      )}

      {/* Petición real: "el ticket, ¿dónde quiero guardarlo? en
          Mercadona, en Hiperber, en Aldi, donde yo quiera" / "¿puedo yo
          decir dónde se meten? porque H Rafal II e Hiperber es lo
          mismo" — tocar la carpeta de destino en vez de escribirla. */}
      {existingFolders.length > 0 && (
        <label>
          {mode === 'add' ? '¿Dónde guardo este ticket?' : 'Mover a esta carpeta'}
          <div className="filter-row" style={{ margin: '4px 0' }}>
            {existingFolders.map((f) => (
              <button
                key={f}
                type="button"
                className={'chip' + (store === f ? ' chip-active' : '')}
                onClick={() => setStore(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </label>
      )}
      <label>
        Establecimiento
        <input
          type="text"
          list="receipt-known-stores"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="Mercadona"
        />
      </label>
      <label>
        Fecha
        <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
      </label>
      <label>
        Importe total (€)
        <input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
      </label>
      <label>
        Categoría
        <CategorySelect value={category} onChange={setCategory} categories={categories} />
      </label>
      <label>
        ¿Quién hizo la compra? (opcional)
        <select value={purchasedByMemberId} onChange={(e) => setPurchasedByMemberId(e.target.value)}>
          <option value="">—</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      {loadingLines && <p className="muted">Cargando productos leídos…</p>}
      {!loadingLines && (ocrStatus === 'done' || mode === 'edit' || lines.length > 0) && (
        <div className="day-modal-group">
          <p className="muted">
            Productos leídos — revisa y corrige antes de guardar. "Cant." es cuántas unidades se compraron
            (p. ej. 2 bolsas) y "Precio" el importe total de esa línea, no el precio de una sola unidad.
          </p>
          {lines.map((line, i) => (
            <div key={i} className="receipt-line-row">
              <input
                type="text"
                value={line.name}
                onChange={(e) => updateLine(i, { name: e.target.value })}
                placeholder="Producto"
              />
              <input
                type="number"
                className="receipt-line-qty"
                min={1}
                step={1}
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                placeholder="Cant."
                title="Cantidad comprada"
              />
              <input
                type="number"
                step="0.01"
                value={line.price}
                onChange={(e) => updateLine(i, { price: e.target.value })}
                placeholder="Precio total"
              />
              <button type="button" className="link-button" onClick={() => removeLine(i)}>
                ✕
              </button>
              {/* Mismo cálculo que se guarda de verdad — para pillar un
                  fallo de lectura antes de guardar, no después. */}
              {Number(line.quantity) > 1 && !Number.isNaN(Number(line.price)) && (
                <span className="muted">= {(Number(line.price) / Number(line.quantity)).toFixed(2)} €/ud</span>
              )}
            </div>
          ))}
          {lines.length === 0 && <p className="muted">No se ha reconocido ningún producto.</p>}
          <button type="button" className="link-button" onClick={addBlankLine}>
            + Añadir línea
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : mode === 'add' ? 'Guardar ticket' : 'Guardar'}
        </button>
        {mode === 'edit' && (
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// Presupuestos (Skill 19)
// ---------------------------------------------------------------------

// Petición real: "un esquema de estadística, pero que sea redondo,
// como un quesito... la porción que se gasta de Mercadona, la porción
// de Hiperber... el tanto por ciento con el precio que corresponde" —
// mismo dato que el reparto por tienda de Tickets, pero como tarta en
// vez de barras. Mismo dónut tocable que el resto de la app (sin
// lista aparte): tocar una porción la resalta y muestra su importe en
// el centro.
function StorePieChart({ groups, monthLabel }: { groups: { store: string; total: number }[]; monthLabel: string }) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)
  const slices = groups.map((g) => ({ key: g.store, total: g.total }))
  const highlightedSlice = groups.find((g) => g.store === highlighted)
  const centerLabel = highlightedSlice ? { name: highlightedSlice.store, total: highlightedSlice.total } : { name: 'Todo', total: grandTotal }

  return (
    <div className="card event-card">
      <strong>Reparto del gasto por tienda — {monthLabel}</strong>
      {grandTotal === 0 ? (
        <p className="muted">No hay tickets guardados ese mes.</p>
      ) : (
        <SvgDonut
          slices={slices}
          centerLabel={centerLabel}
          highlightedKey={highlighted}
          onSliceClick={(key) => setHighlighted((prev) => (prev === key ? null : key))}
          colors={STORE_COLORS}
        />
      )}
    </div>
  )
}

// Petición real: "cuando termina el mes, guardamos el presupuesto en
// el mes que corresponda... con lo que hemos gastado, como en un
// historial para poder consultarlo" — no hace falta "archivar" nada a
// mano: cada presupuesto ya lleva su propio mes (periodStart) y los
// gastos/tickets ya guardan su fecha para siempre, así que el
// historial YA EXISTE, solo hacía falta poder pasar de mes en mes
// para verlo, en vez de una lista larga con todos los meses
// mezclados. Mismo patrón de navegación que Gastos.
// Categorías con las que se siembra Presupuesto Generales la primera
// vez que se abre esa pestaña (petición real: "luz, agua, impuestos,
// taller, imprevistos, hipoteca, préstamos, gastos escolares... con
// emojis y nombres").
// Categorías de INGRESO sugeridas (petición real: "sueldo, regalo,
// ingreso") — mismo mecanismo que las de gasto, solo que agrupadas
// bajo 'ingresos' en vez de 'alimentacion'/'generales', así nunca
// entran por error en ningún cálculo de presupuesto (esos solo miran
// gastos, nunca ingresos, y solo esos dos grupos).
const INCOME_CATEGORY_SEED: { name: string; icon: string }[] = [
  { name: 'Sueldo', icon: '💼' },
  { name: 'Regalo', icon: '🎁' },
  { name: 'Ingreso', icon: '💰' },
]

interface CategorySeed {
  name: string
  icon: string
  necessity: 'debo' | 'necesito' | 'quiero' | null
  isFixed: boolean | null
  children?: CategorySeed[]
}

// Skill de Pepa, punto 9: taxonomía maestra del documento — 11
// categorías de gasto con sus subcategorías, clasificadas de fábrica
// en fijo/variable y debo/necesito/quiero según estándares contables
// habituales (debo: obligación contractual o legal; necesito: consumo
// básico; quiero: discrecional. fijo: importe recurrente pactado;
// variable: fluctúa con el consumo) — petición real: "la adjudicación
// no debería ser manual sino automática... clasificar cada categoría
// desde un principio, editable si se quiere después". Reemplaza la
// lista suelta anterior (Luz, Agua, Impuestos...); las familias que ya
// tenían esas categorías las conservan (0076_category_necessity_taxonomy.sql
// las integró en este mismo árbol).
const MASTER_CATEGORY_SEED: CategorySeed[] = [
  {
    name: 'Alimentación',
    icon: '🛒',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Supermercado, carnicería y tiendas de alimentación', icon: '🛒', necessity: 'necesito', isFixed: false },
      { name: 'Restaurantes, bares y cafeterías', icon: '🍽️', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Vivienda y hogar',
    icon: '🏠',
    necessity: 'necesito',
    isFixed: true,
    children: [
      { name: 'Alquiler / hipoteca', icon: '🏦', necessity: 'debo', isFixed: true },
      { name: 'Suministros', icon: '💡', necessity: 'necesito', isFixed: true },
      { name: 'Mantenimiento y hogar', icon: '🔨', necessity: 'necesito', isFixed: false },
      { name: 'Seguro de hogar', icon: '🛡️', necessity: 'debo', isFixed: true },
    ],
  },
  {
    name: 'Transporte y vehículo',
    icon: '🚗',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Combustible', icon: '⛽', necessity: 'necesito', isFixed: false },
      { name: 'Aparcamiento y peajes', icon: '🅿️', necessity: 'necesito', isFixed: false },
      { name: 'Transporte público / taxi', icon: '🚕', necessity: 'necesito', isFixed: false },
      { name: 'Mantenimiento y reparaciones', icon: '🔧', necessity: 'necesito', isFixed: false },
      { name: 'Seguro / financiación del vehículo', icon: '🚙', necessity: 'debo', isFixed: true },
    ],
  },
  {
    name: 'Compras y familia',
    icon: '🛍️',
    necessity: 'quiero',
    isFixed: false,
    children: [
      { name: 'Ropa y accesorios', icon: '👕', necessity: 'necesito', isFixed: false },
      { name: 'Niños', icon: '🧸', necessity: 'necesito', isFixed: false },
      { name: 'Casa y jardín', icon: '🏡', necessity: 'quiero', isFixed: false },
      { name: 'Tecnología y electrónica', icon: '📺', necessity: 'quiero', isFixed: false },
      { name: 'Mascotas', icon: '🐾', necessity: 'necesito', isFixed: false },
      { name: 'Regalos y compras varias', icon: '🎁', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Salud y bienestar',
    icon: '⚕️',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Salud y farmacia', icon: '💊', necessity: 'necesito', isFixed: false },
      { name: 'Belleza y cuidado personal', icon: '💅', necessity: 'quiero', isFixed: false },
      { name: 'Deporte y fitness', icon: '🏋️', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Ocio y viajes',
    icon: '🌴',
    necessity: 'quiero',
    isFixed: false,
    children: [
      { name: 'Ocio y cultura', icon: '🎭', necessity: 'quiero', isFixed: false },
      { name: 'Aficiones', icon: '🎨', necessity: 'quiero', isFixed: false },
      { name: 'Suscripciones y entretenimiento', icon: '🎬', necessity: 'quiero', isFixed: true },
      { name: 'Viajes y vacaciones', icon: '✈️', necessity: 'quiero', isFixed: false },
      { name: 'Eventos y celebraciones', icon: '🎉', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Comunicaciones y servicios',
    icon: '📱',
    necessity: 'necesito',
    isFixed: true,
    children: [
      { name: 'Teléfono e Internet', icon: '📶', necessity: 'necesito', isFixed: true },
      { name: 'Software y aplicaciones', icon: '💻', necessity: 'quiero', isFixed: true },
      { name: 'Otros servicios', icon: '🔌', necessity: 'necesito', isFixed: false },
    ],
  },
  {
    name: 'Finanzas y obligaciones',
    icon: '📑',
    necessity: 'debo',
    isFixed: true,
    children: [
      { name: 'Impuestos', icon: '🧾', necessity: 'debo', isFixed: true },
      { name: 'Préstamos e intereses', icon: '💳', necessity: 'debo', isFixed: true },
      { name: 'Seguros', icon: '🔒', necessity: 'debo', isFixed: true },
      { name: 'Comisiones y cargos', icon: '💸', necessity: 'debo', isFixed: false },
      { name: 'Multas / obligaciones', icon: '🚨', necessity: 'debo', isFixed: false },
      { name: 'Asesoría', icon: '🧑‍💼', necessity: 'debo', isFixed: false },
    ],
  },
  {
    name: 'Ahorro e inversión',
    icon: '💰',
    necessity: null,
    isFixed: null,
    children: [
      { name: 'Ahorro', icon: '🐷', necessity: null, isFixed: true },
      { name: 'Inversiones', icon: '📈', necessity: null, isFixed: false },
    ],
  },
  {
    name: 'Movimientos internos',
    icon: '🔄',
    necessity: null,
    isFixed: null,
    children: [{ name: 'Transferencias entre cuentas propias', icon: '🔁', necessity: null, isFixed: null }],
  },
  { name: 'Otros', icon: '📦', necessity: null, isFixed: null },
]

// Crea un árbol de dos niveles de golpe: primero las principales, y
// con sus ids ya reales las subcategorías apuntando a ellas (mismo
// mecanismo que ya usaba el sembrado plano, ahora con clasificación
// incluida).
async function seedCategoryTree(seed: CategorySeed[], budgetGroup: string): Promise<void> {
  const topInserted = await createBudgetCategoriesBulk(
    seed.map((s) => ({ name: s.name, icon: s.icon, budgetGroup, necessity: s.necessity, isFixed: s.isFixed })),
  )
  const idByName = new Map(topInserted.map((r) => [r.name, r.id]))
  const childInputs = seed.flatMap((s) =>
    (s.children ?? []).map((child) => ({
      name: child.name,
      icon: child.icon,
      budgetGroup,
      parentId: idByName.get(s.name) ?? null,
      necessity: child.necessity,
      isFixed: child.isFixed,
    })),
  )
  if (childInputs.length > 0) await createBudgetCategoriesBulk(childInputs)
}

// Presupuesto Alimentación y Presupuesto Generales son la MISMA
// pantalla, solo cambia el "grupo" de categorías/presupuestos que
// muestra cada una — petición real: "que todos los presupuestos estén
// conectados". Por eso BudgetsOverview (abajo) lee de TODOS los
// grupos a la vez: las estadísticas y el informe salen iguales se
// entre desde una pestaña o desde la otra.
export function BudgetsTab({
  group,
  seedCategories,
}: {
  group: string
  seedCategories: CategorySeed[]
}) {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [knownStores, setKnownStores] = useState<string[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(toDateStr(new Date()).slice(0, 7))
  // Evita sembrar las categorías sugeridas más de una vez por sesión
  // mientras se espera la respuesta del primer alta.
  const seededRef = useRef(false)

  function reload() {
    setLoading(true)
    Promise.all([listBudgets(), listExpenses(), listReceipts(), listShoppingStores(), listBudgetCategories()])
      .then(async ([b, e, r, stores, cats]) => {
        // Primera vez que se abre esta pestaña y no tiene categorías
        // propias todavía — se dan de alta las sugeridas solas, sin
        // pedirlo (petición real: "me pones todas esas categorías").
        if (!seededRef.current && seedCategories.length > 0 && !cats.some((c) => c.budgetGroup === group)) {
          seededRef.current = true
          await seedCategoryTree(seedCategories, group)
          cats = await listBudgetCategories()
        }
        setBudgets(b)
        setExpenses(e)
        setReceipts(r)
        setKnownStores(stores.map((s) => s.name))
        setCategories(cats)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, []) // eslint-disable-line react-hooks/exhaustive-deps

  function shiftMonth(delta: number) {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setVisibleMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  if (loading) return <p className="muted">Cargando presupuestos…</p>

  const [visibleYear, visibleMonthIndex] = visibleMonth.split('-').map(Number)
  const groupCategories = categories.filter((c) => c.budgetGroup === group)
  const groupBudgets = budgets.filter((b) => b.budgetGroup === group)
  // Solo los tickets clasificados como Alimentación cuentan aquí —
  // petición real: "ahora también hay tickets que no son de
  // Alimentación (Amazon...), esos no se deberían detallar en el
  // registro de Alimentación". El resto (Casa y Jardín, Amazon sin
  // clasificar...) no aparece ni en este desglose por tienda ni en el
  // total.
  const foodReceipts = receipts.filter(
    (r) => r.receiptDate.startsWith(visibleMonth) && isFoodCategory(r.category, categories),
  )
  const pieGroups = groupReceiptsByStore(foodReceipts, knownStores)

  // El total de Alimentación (y el de cada categoría) sale SIEMPRE de
  // `expenses`, nunca sumando receipts.total_amount aparte — cada
  // ticket con importe ya crea su propio gasto real con la misma
  // categoría (uploadReceipt), así que sumar las dos cosas contaría el
  // mismo euro dos veces. Ver domain/finance.ts (isFoodCategory /
  // budgetSpent) para la misma regla aplicada a los presupuestos
  // guardados.
  const monthRealExpenses = expenses.filter(
    (e) => e.expenseDate.startsWith(visibleMonth) && !e.isIncome && e.kind === 'real',
  )
  const alimentacionTotal = monthRealExpenses
    .filter((e) => isFoodCategory(e.category, categories))
    .reduce((sum, e) => sum + e.amount, 0)
  const generalesCategoriesTotal = groupCategories
    .map((c) => monthRealExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0))
    .reduce((sum, t) => sum + t, 0)
  const categoryPieSlices =
    group === 'generales'
      ? [
          ...groupCategories
            .map((c) => ({
              store: `${c.icon} ${c.name}`,
              total: monthRealExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0),
            }))
            .filter((s) => s.total > 0),
          // 🛒 y no 🍽️ a propósito — petición real: "se ha colado el
          // emoticono de restaurantes aunque no hay gastos de
          // restaurantes". Esta porción es TODO el gasto de Alimentación
          // (tickets de compra, no comer fuera), así que el icono de
          // carrito es el que no confunde.
          { store: '🛒 Alimentación (total)', total: alimentacionTotal },
        ].filter((s) => s.total > 0)
      : []

  // Presupuesto total del mes con su barra de % gastado — solo existe
  // en Generales ahora. Alimentación ya no tiene presupuesto/límite
  // propio, se queda como puro registro (petición real: "el
  // presupuesto general deduce todos los gastos como un único
  // presupuesto") — el gastado de Generales suma sus categorías MÁS
  // el total de Alimentación completo.
  const groupSpentTotal = generalesCategoriesTotal + alimentacionTotal
  const overallBudget =
    groupBudgets.find((b) => !b.category && budgetPeriodRange(b).start.slice(0, 7) === visibleMonth) ?? null

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <BudgetsOverview allExpenses={expenses} allCategories={categories} group={group} onChanged={reload} />

      <div className="month-nav">
        <button type="button" className="link-button" onClick={() => shiftMonth(-1)}>
          ‹
        </button>
        <strong>
          {MONTH_LABELS[visibleMonthIndex - 1]} {visibleYear}
        </strong>
        <button type="button" className="link-button" onClick={() => shiftMonth(1)}>
          ›
        </button>
        <input
          type="month"
          value={visibleMonth}
          onChange={(e) => e.target.value && setVisibleMonth(e.target.value)}
        />
        <button type="button" className="link-button" onClick={() => setVisibleMonth(toDateStr(new Date()).slice(0, 7))}>
          Hoy
        </button>
      </div>

      {group === 'alimentacion' ? (
        <div className="card event-card">
          <strong>Total registrado en Alimentación</strong>
          <p style={{ margin: '4px 0' }}>{alimentacionTotal.toFixed(2)} €</p>
          <p className="muted" style={{ margin: 0 }}>
            Solo registro — no resta de ningún presupuesto. Cuenta para el Presupuesto General.
          </p>
        </div>
      ) : (
        <OverallBudgetCard
          group={group}
          visibleMonth={visibleMonth}
          budget={overallBudget}
          spent={groupSpentTotal}
          onChanged={reload}
        />
      )}

      {group === 'alimentacion' && (
        <StorePieChart groups={pieGroups} monthLabel={`${MONTH_LABELS[visibleMonthIndex - 1]} ${visibleYear}`} />
      )}
      {group === 'generales' && categoryPieSlices.length > 0 && (
        <StorePieChart groups={categoryPieSlices} monthLabel={`${MONTH_LABELS[visibleMonthIndex - 1]} ${visibleYear}`} />
      )}

      {group === 'alimentacion' ? (
        <BudgetCategoriesSection
          categories={groupCategories}
          budgetGroup={group}
          monthExpenses={monthRealExpenses}
          onChanged={reload}
        />
      ) : (
        <GeneralesCategoriesSection categories={groupCategories} monthExpenses={monthRealExpenses} />
      )}

      {group === 'generales' && (
        <BudgetMonthFolders
          budgets={groupBudgets}
          expenses={expenses}
          categories={categories}
          group={group}
          onChanged={reload}
        />
      )}
    </div>
  )
}

// Presupuesto total del mes con su barra de % gastado — petición real:
// "si tengo 800€ de presupuesto para comida... voy gastando 200,
// 250... qué tanto por ciento voy gastando, cada vez que añado una
// compra" (y lo mismo en Generales, con 4000€ sumando todas sus
// categorías más el total de Alimentación). Sin presupuesto puesto
// todavía para este mes, pide el importe; una vez puesto, se puede
// cambiar en cualquier momento.
function OverallBudgetCard({
  group,
  visibleMonth,
  budget,
  spent,
  onChanged,
}: {
  group: string
  visibleMonth: string
  budget: Budget | null
  spent: number
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (budget) await deleteBudget(budget.id)
      await createBudget({
        periodType: 'mensual',
        periodStart: `${visibleMonth}-01`,
        category: '',
        amount: Number(amount),
        budgetGroup: group,
      })
      setEditing(false)
      setAmount('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!budget || editing) {
    return (
      <form onSubmit={handleSave} className="card member-form">
        <label>
          Presupuesto total del mes (€)
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {budget && (
            <button type="button" className="link-button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    )
  }

  const pct = Math.min(100, Math.round((spent / budget.amount) * 100))
  const over = spent > budget.amount

  return (
    <div className="card event-card">
      <strong>Presupuesto total del mes</strong>
      <p>
        {spent.toFixed(2)} € de {budget.amount.toFixed(2)} € ({pct}%)
      </p>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${pct}%`, background: over ? '#c0392b' : undefined }}
        />
      </div>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setAmount(String(budget.amount))
          setEditing(true)
        }}
      >
        Cambiar importe
      </button>
    </div>
  )
}

// Los presupuestos se guardan por mes, en carpetas — petición real:
// "la parte del nuevo presupuesto la eliminaría, y ahí pondría una
// carpeta para guardar todos los presupuestos... créame una carpeta
// por cada mes... para poderlos consultar". Reemplaza el formulario
// siempre visible de antes: ahora "Nuevo presupuesto" es una carpeta
// más, al final de la lista, que se despliega para dar de alta uno.
function BudgetMonthFolders({
  budgets,
  expenses,
  categories,
  group,
  onChanged,
}: {
  budgets: Budget[]
  expenses: Expense[]
  categories: BudgetCategory[]
  group: string
  onChanged: () => void
}) {
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [addingMonth, setAddingMonth] = useState(false)

  const byMonth = new Map<string, Budget[]>()
  for (const b of budgets) {
    const month = budgetPeriodRange(b).start.slice(0, 7)
    const list = byMonth.get(month) ?? []
    list.push(b)
    byMonth.set(month, list)
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <>
      <h2 className="section-title">Presupuestos</h2>
      <p className="muted" style={{ marginTop: -8 }}>Guardados por mes — toca uno para consultarlo.</p>
      <div className="store-folder-grid">
        {months.map(([month, monthBudgets]) => {
          const [y, m] = month.split('-').map(Number)
          const isOpen = openMonth === month
          const totalBudgeted = monthBudgets.reduce((sum, b) => sum + b.amount, 0)
          return (
            <div key={month} className="store-folder">
              <button
                type="button"
                className="store-folder-header"
                onClick={() => setOpenMonth(isOpen ? null : month)}
              >
                <span className="store-folder-icon">📅</span>
                <span className="store-folder-info">
                  <strong>
                    {MONTH_LABELS[m - 1]} {y}
                  </strong>
                  <span className="muted">
                    {monthBudgets.length} {monthBudgets.length === 1 ? 'presupuesto' : 'presupuestos'} ·{' '}
                    {totalBudgeted.toFixed(2)} €
                  </span>
                </span>
                <span className="store-folder-chevron">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="event-list store-folder-contents">
                  {monthBudgets.map((b) => {
                    const spent = budgetSpent(b, expenses, { categories })
                    const pct = Math.min(100, Math.round((spent / b.amount) * 100))
                    const icon = categories.find((c) => c.name === b.category)?.icon
                    return (
                      <div key={b.id} className="card task-card">
                        <div className="task-card-main">
                          <strong>
                            {icon && `${icon} `}
                            {b.category ?? 'General'}
                          </strong>
                          <p className="muted">
                            {b.periodType} desde {b.periodStart} · gastado {spent.toFixed(2)} € de{' '}
                            {b.amount.toFixed(2)} € ({pct}%)
                          </p>
                          <div className="progress-bar">
                            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <ConfirmButton label="Eliminar" onConfirm={() => deleteBudget(b.id).then(onChanged)} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <div className="store-folder">
          <button
            type="button"
            className="store-folder-header"
            onClick={() => setAddingMonth((v) => !v)}
          >
            <span className="store-folder-icon">➕</span>
            <span className="store-folder-info">
              <strong>Nuevo presupuesto</strong>
            </span>
            <span className="store-folder-chevron">{addingMonth ? '▾' : '▸'}</span>
          </button>
          {addingMonth && (
            <div className="store-folder-contents">
              <AddBudgetForm
                onAdded={() => {
                  setAddingMonth(false)
                  onChanged()
                }}
                defaultPeriodStart={`${toDateStr(new Date()).slice(0, 7)}-01`}
                categories={categories}
                group={group}
              />
            </div>
          )}
        </div>
      </div>
      {months.length === 0 && <p className="muted">No hay presupuestos guardados todavía.</p>}
    </>
  )
}

// Apuntar un ingreso (nómina, paga extra...) según va llegando —
// petición real: "quiero poder ir poniendo los ingresos que tengo ese
// mes y cuando los tengo... que se cree el ingreso el día que lo
// apunte pero que se pueda cambiar con un calendario". La fecha
// arranca en hoy pero es un <input type="date"> normal — se puede
// cambiar a cualquier otro día antes de guardar.
function AddIncomeInline({
  group,
  categories,
  onAdded,
}: {
  group: string
  categories: BudgetCategory[]
  onAdded: () => void
}) {
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  // Petición real: "los ingresos también se deberían poder
  // categorizar, como sueldo, regalo, ingreso" — antes era un texto
  // libre de "descripción", ahora la misma categoría estructurada
  // (con icono) que ya usa el resto de la app.
  const [category, setCategory] = useState(incomeCategories[0]?.name ?? 'Ingreso')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addExpense({
        date,
        amount: Number(amount),
        category,
        store: '',
        kind: 'real',
        isIncome: true,
        budgetGroup: group,
      })
      setAmount('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form" style={{ marginBottom: 8 }}>
      <label>
        Categoría
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
          {incomeCategories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar ingreso'}
      </button>
    </form>
  )
}

// Estadísticas de Dinero — el gasto suma Alimentación + Generales
// juntos (petición real: "que todos los presupuestos estén
// conectados"), pero los INGRESOS no: cada pestaña tiene los suyos,
// sin sumarse con la otra (petición real: "los ingresos tienen que
// ser diferentes... no quiero que me sumen [los de Generales] en
// Alimentación"). Mismo selector Hoy/Esta semana/Este
// mes/Este año/Rango que ya usan los Tickets de esta misma pantalla.
function BudgetsOverview({
  allExpenses,
  allCategories,
  group,
  onChanged,
}: {
  allExpenses: Expense[]
  allCategories: BudgetCategory[]
  group: string
  onChanged: () => void
}) {
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  // Petición real: "quiero poder ir poniendo los ingresos que tengo
  // ese mes y cuando los tengo... que se cree el día que lo apunte
  // pero que se pueda cambiar con un calendario y que se pueda
  // eliminar".
  const [addingIncome, setAddingIncome] = useState(false)
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null)

  const [from, to] = rangeForPreset(preset, customFrom, customTo)
  const inRange = allExpenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to)
  // Los ingresos NO se conectan entre pestañas — petición real: "los
  // ingresos tienen que ser diferentes... presupuesto generales tiene
  // 4000€... presupuesto de alimentación 800€... no quiero que me
  // sumen [los de Generales] en Alimentación". El gasto sí se sigue
  // sumando entre las dos (eso no ha cambiado).
  const incomeEntries = inRange
    .filter((e) => e.isIncome && e.budgetGroup === group)
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
  const totalIncome = incomeEntries.reduce((sum, e) => sum + e.amount, 0)
  const totalSpent = inRange.filter((e) => !e.isIncome && e.kind === 'real').reduce((sum, e) => sum + e.amount, 0)

  async function handleDeleteIncome(id: string) {
    await deleteExpense(id)
    onChanged()
  }

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of inRange.filter((e) => !e.isIncome && e.kind === 'real')) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [inRange])

  const rangeLabel = `${PRESET_LABELS[preset]} (${from} a ${to})`

  return (
    <div className="card event-card">
      <strong>Resumen</strong>
      <p className="muted" style={{ marginTop: 0 }}>
        {group === 'alimentacion'
          ? 'Solo registro — no tiene presupuesto ni ingresos propios.'
          : 'Gastado suma Alimentación + Generales · Ingresos es solo de esta pestaña.'}
      </p>
      <div className="filter-row" style={{ marginTop: 8, marginBottom: 8 }}>
        {(['dia', 'semana', 'mes', 'año', 'rango'] as SpendRangePreset[]).map((p) => (
          <button
            key={p}
            type="button"
            className={'chip' + (preset === p ? ' chip-active' : '')}
            onClick={() => setPreset(p)}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>
      {preset === 'rango' && (
        <div className="inline-fields" style={{ marginBottom: 8 }}>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          <span>a</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
        </div>
      )}
      {/* Alimentación ya no tiene presupuesto ni ingresos propios
          (petición real: "hay que quitar en Registro alimentación lo
          de ingreso") — solo se queda con el total gastado. */}
      {group !== 'alimentacion' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ color: '#1e8449', fontWeight: 600, margin: '4px 0' }}>Ingresos: +{totalIncome.toFixed(2)} €</p>
            <button type="button" className="link-button" onClick={() => setAddingIncome((v) => !v)}>
              {addingIncome ? 'Cerrar' : '+ Añadir ingreso'}
            </button>
          </div>

          {addingIncome && <AddIncomeInline group={group} categories={allCategories} onAdded={onChanged} />}
        </>
      )}

      {group !== 'alimentacion' && incomeEntries.length > 0 && (
        <div className="event-list" style={{ marginBottom: 8 }}>
          {incomeEntries.map((inc) =>
            editingIncomeId === inc.id ? (
              <EditCategoryExpenseRow
                key={inc.id}
                expense={inc}
                onDone={() => {
                  setEditingIncomeId(null)
                  onChanged()
                }}
                onCancel={() => setEditingIncomeId(null)}
              />
            ) : (
              <div key={inc.id} className="card task-card">
                <div className="task-card-main">
                  <strong style={{ color: '#1e8449' }}>+{inc.amount.toFixed(2)} €</strong>
                  <p className="muted">
                    {inc.expenseDate}
                    {inc.category && inc.category !== 'Ingreso' && ` · ${inc.category}`}
                  </p>
                </div>
                <button type="button" className="link-button" onClick={() => setEditingIncomeId(inc.id)}>
                  Editar
                </button>
                <ConfirmButton label="Eliminar" onConfirm={() => handleDeleteIncome(inc.id)} />
              </div>
            ),
          )}
        </div>
      )}

      <p style={{ color: '#c0392b', fontWeight: 600, margin: '4px 0' }}>Gastado: -{totalSpent.toFixed(2)} €</p>
      {group !== 'alimentacion' && (
        <p style={{ margin: '4px 0' }}>
          <strong>Balance: {(totalIncome - totalSpent).toFixed(2)} €</strong>
        </p>
      )}

      {byCategory.length > 0 && (
        <div className="price-row-list" style={{ marginTop: 8 }}>
          {byCategory.map(([cat, amount]) => {
            const icon = allCategories.find((c) => c.name === cat)?.icon
            return (
              <div key={cat} className="price-row">
                <span className="price-row-name">
                  {icon && `${icon} `}
                  {cat}
                </span>
                <span className="price-row-price">{amount.toFixed(2)} €</span>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        className="link-button"
        style={{ marginTop: 8 }}
        onClick={() =>
          openBudgetReport({
            rangeLabel,
            totalIncome,
            totalSpent,
            byCategory: byCategory.map(([name, amount]) => ({
              name,
              icon: allCategories.find((c) => c.name === name)?.icon,
              amount,
            })),
          })
        }
      >
        📄 Generar informe
      </button>
    </div>
  )
}

// Abre una pestaña aparte con un informe limpio y lanza el diálogo de
// imprimir del propio navegador (gratis, sin librería — "Guardar como
// PDF" ya está en ese diálogo en cualquier móvil u ordenador).
function openBudgetReport(report: {
  rangeLabel: string
  totalIncome: number
  totalSpent: number
  byCategory: { name: string; icon?: string; amount: number }[]
}) {
  const win = window.open('', '_blank')
  if (!win) return
  const rows =
    report.byCategory
      .map(
        (c) =>
          `<tr><td>${c.icon ?? ''} ${c.name}</td><td style="text-align:right">${c.amount.toFixed(2)} €</td></tr>`,
      )
      .join('') || '<tr><td colspan="2">Sin movimientos en este periodo</td></tr>'
  win.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de Economía</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; padding-top: 64px; color: #1c1f26; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .muted { color: #6b7280; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 6px 4px; border-bottom: 1px solid #eee; }
  .totals p { margin: 4px 0; font-size: 15px; }
  .income { color: #1e8449; font-weight: 600; }
  .expense { color: #c0392b; font-weight: 600; }
  /* Petición real: "no tiene botón de cierre, tuve que salir de la
     aplicación" — window.open() en una PWA instalada no siempre abre
     una pestaña de verdad con su propia flecha de volver, así que el
     informe necesita su propio botón. */
  .close-btn {
    position: fixed;
    top: 12px;
    right: 12px;
    background: #4c6ef5;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  @media print {
    .close-btn { display: none; }
  }
</style>
</head>
<body>
  <button type="button" class="close-btn" onclick="window.close(); setTimeout(function(){ history.back() }, 150)">✕ Cerrar</button>
  <h1>Informe de Economía</h1>
  <p class="muted">${report.rangeLabel}</p>
  <div class="totals">
    <p class="income">Ingresos: +${report.totalIncome.toFixed(2)} €</p>
    <p class="expense">Gastado: -${report.totalSpent.toFixed(2)} €</p>
    <p><strong>Balance: ${(report.totalIncome - report.totalSpent).toFixed(2)} €</strong></p>
  </div>
  <h2>Por categoría</h2>
  <table>${rows}</table>
</body>
</html>`)
  win.document.close()
  win.focus()
  win.print()
}

// Categorías de presupuesto con icono — petición real: "en la pestaña
// de presupuestos que se puedan crear categorías, algo como lo de la
// foto" (captura de referencia: Salario 👔, Comestibles 🛒,
// Entretenimiento 🍿, Vivienda 🏠, cada una con su icono). Mismas
// carpetas de colores que en Documentos. Tocar una categoría abre un
// formulario rápido para apuntarle un gasto — petición real: "quiero
// poder apuntar en cada categoría los gastos de cada cosa, en agua,
// en gastos escolares, hipoteca...".
// Debe coincidir con las columnas de .doc-folder-grid (repeat(3, 1fr)).
const CATEGORY_GRID_COLS = 3
const CATEGORY_DRAG_TAP_THRESHOLD_PX = 8

function BudgetCategoriesSection({
  categories,
  budgetGroup,
  monthExpenses,
  onChanged,
}: {
  categories: BudgetCategory[]
  budgetGroup: string
  monthExpenses: Expense[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [loggingCategory, setLoggingCategory] = useState<BudgetCategory | null>(null)

  // Arrastrar con el dedo para reordenar los iconos — petición real:
  // "que se puedan mover y organizar como queramos, arrastrándolos con
  // el dedo". Mismo mecanismo que ya usan la lista de la compra y los
  // botones de Pepa: la lista local sigue a las props salvo mientras se
  // arrastra, y solo se guarda de verdad (reorderBudgetCategories) si
  // el gesto fue un arrastre real, no un toque corto.
  const [order, setOrder] = useState(categories)
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    startIndex: number
    cellW: number
    cellH: number
    moved: number
  } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const wasDraggedRef = useRef(false)

  useEffect(() => {
    if (!dragRef.current) setOrder(categories)
  }, [categories])

  function handleDragStart(e: ReactPointerEvent, id: string, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    el.setPointerCapture(e.pointerId)
    wasDraggedRef.current = false
    const index = order.findIndex((c) => c.id === id)
    const style = getComputedStyle(el.parentElement as HTMLElement)
    const gap = parseFloat(style.columnGap || style.gap || '0') || 0
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, startIndex: index, cellW: el.offsetWidth + gap, cellH: el.offsetHeight + gap, moved: 0 }
    setDraggingId(id)
  }

  function handleDragMove(e: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(dy))
    if (drag.moved >= CATEGORY_DRAG_TAP_THRESHOLD_PX) wasDraggedRef.current = true
    setDragOffset({ x: dx, y: dy })
    const startRow = Math.floor(drag.startIndex / CATEGORY_GRID_COLS)
    const startCol = drag.startIndex % CATEGORY_GRID_COLS
    const newCol = Math.min(CATEGORY_GRID_COLS - 1, Math.max(0, startCol + Math.round(dx / drag.cellW)))
    const newRow = Math.max(0, startRow + Math.round(dy / drag.cellH))
    const newIndex = Math.min(order.length - 1, newRow * CATEGORY_GRID_COLS + newCol)
    setOrder((prev) => {
      const currentIndex = prev.findIndex((c) => c.id === drag.id)
      if (currentIndex === -1 || currentIndex === newIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
  }

  function handleDragEnd() {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setDragOffset({ x: 0, y: 0 })
    if (drag && drag.moved >= CATEGORY_DRAG_TAP_THRESHOLD_PX) {
      reorderBudgetCategories(order.map((c) => c.id)).then(onChanged)
    }
  }

  function handleCardClick(c: BudgetCategory) {
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false
      return
    }
    setLoggingCategory(c)
  }

  return (
    <>
      <h2 className="section-title">Categorías</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Toca una categoría para apuntarle un gasto, o arrástrala para moverla.
      </p>
      <div className="doc-folder-grid">
        {order.map((c) => {
          const spent = monthExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0)
          const isDragging = draggingId === c.id
          return (
            <div
              key={c.id}
              className={
                'doc-folder-card doc-folder-card-draggable' + (isDragging ? ' doc-folder-card-dragging' : '')
              }
              style={{
                position: 'relative',
                cursor: 'pointer',
                ...(isDragging ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } : {}),
              }}
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick(c)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCardClick(c)
              }}
              onPointerDown={(e) => handleDragStart(e, c.id, e.currentTarget)}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              <span className="doc-folder-icon" style={{ background: 'var(--primary)' }}>
                {c.icon}
              </span>
              <strong className="doc-folder-name">{c.name}</strong>
              <span className="muted doc-folder-count">{spent > 0 ? `${spent.toFixed(2)} €` : 'Sin gastos'}</span>
              <span style={{ position: 'absolute', top: -4, right: 4 }} onClick={(e) => e.stopPropagation()}>
                <ConfirmIconButton
                  icon="✕"
                  className="link-button"
                  ariaLabel={`Eliminar categoría ${c.name}`}
                  onConfirm={() => deleteBudgetCategory(c.id).then(onChanged)}
                />
              </span>
            </div>
          )
        })}
        <button
          type="button"
          className={'doc-folder-card doc-folder-card-add' + (adding ? ' doc-folder-card-active' : '')}
          onClick={() => setAdding((v) => !v)}
        >
          <span className="doc-folder-icon doc-folder-icon-add">➕</span>
          <strong className="doc-folder-name">Nueva categoría</strong>
        </button>
      </div>
      {categories.length === 0 && !adding && (
        <p className="muted">Todavía no hay categorías — crea alguna para elegirla al hacer un presupuesto.</p>
      )}
      {adding && (
        <AddBudgetCategoryInline
          budgetGroup={budgetGroup}
          onAdded={() => {
            setAdding(false)
            onChanged()
          }}
        />
      )}
      {loggingCategory && (
        <LogCategoryExpenseModal
          category={loggingCategory}
          expenses={monthExpenses.filter((e) => e.category === loggingCategory.name)}
          onClose={() => setLoggingCategory(null)}
          onChanged={onChanged}
        />
      )}
    </>
  )
}

// Versión de la sección de categorías para Presupuesto Generales: un
// único botón flotante reúne crear categoría, reordenarlas y añadir un
// gasto suelto (petición real: "las categorías que se organicen en el
// mismo menú flotante donde se crean, y haz otro para crear gastos, o
// si lo ves mejor combina todo en el mismo botón" — un solo botón es
// más limpio que dos flotando a la vez). La lista de la pantalla queda
// solo para consultar y apuntar un gasto a una categoría concreta
// tocándola; crear, reordenar (con flechas, mismo mecanismo que
// "Organizar menú") y borrar categorías, o apuntar un gasto sin elegir
// antes una tarjeta, vive dentro de ese botón.
// Presupuesto Generales ya no crea ni edita nada por su cuenta — solo
// consulta cuánto lleva cada categoría. Crear, reordenar y apuntar
// gastos vive todo en el botón flotante de Gastos (petición real: "las
// categorías... en el mismo menú flotante donde se crean").
function GeneralesCategoriesSection({
  categories,
  monthExpenses,
}: {
  categories: BudgetCategory[]
  monthExpenses: Expense[]
}) {
  return (
    <>
      <h2 className="section-title">Categorías</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Se crean y se apuntan desde el botón flotante de la pestaña Gastos.
      </p>
      <div className="event-list">
        {categories.map((c) => {
          const spent = monthExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0)
          return (
            <div key={c.id} className="card task-card">
              <div className="task-card-main">
                <strong>
                  {c.icon} {c.name}
                </strong>
                <p className="muted">{spent > 0 ? `${spent.toFixed(2)} €` : 'Sin gastos'}</p>
              </div>
            </div>
          )
        })}
        {categories.length === 0 && <p className="muted">Todavía no hay categorías.</p>}
      </div>
    </>
  )
}

// Además de apuntar, se ven los gastos ya guardados de ESTE mes en la
// categoría, con editar/eliminar — petición real: "también quiero
// poder eliminarlo o editarlo por si me he equivocado".
function LogCategoryExpenseModal({
  category,
  expenses,
  onClose,
  onChanged,
}: {
  category: BudgetCategory
  expenses: Expense[]
  onClose: () => void
  onChanged: () => void
}) {
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addExpense({
        date,
        amount: Number(amount),
        category: category.name,
        store: '',
        kind: 'real',
        isIncome: false,
        budgetGroup: category.budgetGroup,
      })
      setAmount('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteExpense(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {category.icon} {category.name}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {expenses.length > 0 && (
          <div className="event-list" style={{ marginBottom: 12 }}>
            {expenses.map((exp) =>
              editingId === exp.id ? (
                <EditCategoryExpenseRow
                  key={exp.id}
                  expense={exp}
                  onDone={() => {
                    setEditingId(null)
                    onChanged()
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div key={exp.id} className="card task-card">
                  <div className="task-card-main">
                    <strong>{exp.amount.toFixed(2)} €</strong>
                    <p className="muted">{exp.expenseDate}</p>
                  </div>
                  <button type="button" className="link-button" onClick={() => setEditingId(exp.id)}>
                    Editar
                  </button>
                  <ConfirmButton label="Eliminar" onConfirm={() => handleDelete(exp.id)} />
                </div>
              ),
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="member-form">
          <label>
            Fecha
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Importe (€)
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Apuntar gasto'}
          </button>
        </form>
      </div>
    </div>
  )
}

function EditCategoryExpenseRow({
  expense,
  onDone,
  onCancel,
}: {
  expense: Expense
  onDone: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(expense.expenseDate)
  const [amount, setAmount] = useState(String(expense.amount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateExpense(expense.id, { date, amount: Number(amount) })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form">
      <div className="inline-fields">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// Nombre → emoji, para que al escribir "Farmacia" se ponga sola 💊 y
// así con las demás — petición real: "que cuando se ponga por ejemplo
// farmacia se ponga automáticamente el emoji de farmacia y así con
// todos". Búsqueda por palabra suelta dentro del nombre (normalizada,
// sin acentos), así "Gastos escolares" encuentra "escolar" aunque no
// sea la palabra exacta.
const CATEGORY_ICON_SUGGESTIONS: Record<string, string> = {
  farmacia: '💊',
  medicina: '💊',
  salud: '🏥',
  medico: '🏥',
  hospital: '🏥',
  luz: '💡',
  electricidad: '💡',
  agua: '💧',
  gas: '🔥',
  internet: '📶',
  telefono: '📱',
  movil: '📱',
  impuesto: '🧾',
  hacienda: '🧾',
  factura: '🧾',
  hipoteca: '🏦',
  banco: '🏦',
  alquiler: '🏠',
  vivienda: '🏠',
  casa: '🏠',
  taller: '🔧',
  coche: '🚗',
  gasolina: '⛽',
  combustible: '⛽',
  transporte: '🚌',
  seguro: '🛡️',
  imprevisto: '⚠️',
  prestamo: '💳',
  credito: '💳',
  ahorro: '💰',
  salario: '👔',
  sueldo: '👔',
  nomina: '👔',
  comestible: '🛒',
  alimentacion: '🛒',
  compra: '🛒',
  supermercado: '🛒',
  entretenimiento: '🍿',
  ocio: '🍿',
  cine: '🎬',
  restaurante: '🍽️',
  comida: '🍽️',
  ropa: '👕',
  moda: '👕',
  regalo: '🎁',
  mascota: '🐾',
  gimnasio: '🏋️',
  deporte: '⚽',
  vacacion: '✈️',
  viaje: '✈️',
  escolar: '🎒',
  colegio: '🎒',
  escuela: '🎒',
  educacion: '🎓',
  universidad: '🎓',
  belleza: '💇',
  peluqueria: '💇',
  suscripcion: '📺',
  streaming: '📺',
}

function suggestCategoryIcon(name: string): string | null {
  const norm = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (!norm) return null
  if (CATEGORY_ICON_SUGGESTIONS[norm]) return CATEGORY_ICON_SUGGESTIONS[norm]
  for (const [keyword, icon] of Object.entries(CATEGORY_ICON_SUGGESTIONS)) {
    if (norm.includes(keyword)) return icon
  }
  return null
}

// Paleta para elegir el icono a mano — petición real: "ponme que se
// despliegue una lista de emojis".
const CATEGORY_ICON_PALETTE = [
  '💰', '🧾', '💡', '💧', '🔥', '📶', '📱', '🏦', '🏠', '🔧',
  '🚗', '⛽', '🚌', '🛡️', '⚠️', '💳', '🛒', '🍿', '🍽️', '👕',
  '🎁', '🐾', '🏋️', '⚽', '✈️', '🎒', '🎓', '💇', '📺', '👔',
  '💊', '🏥', '🎬', '📚', '🎮', '🧸',
]

function AddBudgetCategoryInline({
  budgetGroup,
  parentOptions,
  onAdded,
}: {
  budgetGroup: string
  parentOptions?: BudgetCategory[]
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💰')
  const [parentId, setParentId] = useState<string>('')
  const [necessity, setNecessity] = useState<'' | 'debo' | 'necesito' | 'quiero'>('')
  const [isFixed, setIsFixed] = useState<'' | 'fijo' | 'variable'>('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mientras sea true, escribir el nombre puede seguir cambiando el
  // icono solo — en cuanto la persona elige uno a mano (picker o
  // escrito), se deja de tocar aunque seguya escribiendo el nombre.
  const iconTouchedRef = useRef(false)

  function handleNameChange(value: string) {
    setName(value)
    if (iconTouchedRef.current) return
    const suggested = suggestCategoryIcon(value)
    if (suggested) setIcon(suggested)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createBudgetCategory({
        name,
        icon,
        budgetGroup,
        parentId: parentId || null,
        necessity: necessity || null,
        isFixed: isFixed === '' ? null : isFixed === 'fijo',
      })
      setName('')
      setIcon('💰')
      setParentId('')
      setNecessity('')
      setIsFixed('')
      iconTouchedRef.current = false
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir la categoría')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <div className="inline-fields" style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          style={{ width: 56, textAlign: 'center', fontSize: 20, padding: '10px 0' }}
          aria-label="Elegir icono"
        >
          {icon}
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Farmacia"
          style={{ flex: 1 }}
          autoFocus
        />
        {pickerOpen && (
          <div className="emoji-picker-grid">
            {CATEGORY_ICON_PALETTE.map((e) => (
              <button
                key={e}
                type="button"
                className="emoji-picker-option"
                onClick={() => {
                  setIcon(e)
                  iconTouchedRef.current = true
                  setPickerOpen(false)
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Skill de Pepa, punto 10: subcategoría opcional de dos niveles
          — sin elegir principal, queda como categoría de primer nivel. */}
      {parentOptions && parentOptions.length > 0 && (
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Categoría principal (ninguna)</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      )}
      {/* Skill de Pepa, puntos 15/16 — petición real: "clasificar cada
          categoría desde un principio". Aquí es la única clasificación
          que no puede ser automática (categoría nueva, sin
          equivalente en la taxonomía de fábrica): la elige la familia,
          opcional y editable después. No aplica a Ingresos. */}
      {budgetGroup !== 'ingresos' && (
        <div className="inline-fields">
          <select value={necessity} onChange={(e) => setNecessity(e.target.value as typeof necessity)}>
            <option value="">¿Debo, necesito o quiero? (opcional)</option>
            <option value="debo">Debo</option>
            <option value="necesito">Necesito</option>
            <option value="quiero">Quiero</option>
          </select>
          <select value={isFixed} onChange={(e) => setIsFixed(e.target.value as typeof isFixed)}>
            <option value="">¿Fijo o variable? (opcional)</option>
            <option value="fijo">Fijo</option>
            <option value="variable">Variable</option>
          </select>
        </div>
      )}
      {!iconTouchedRef.current && suggestCategoryIcon(name) && (
        <p className="muted" style={{ marginTop: -8, fontSize: 12 }}>
          Icono sugerido para "{name}" — toca el icono para cambiarlo.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving || !name.trim()}>
        {saving ? 'Añadiendo…' : '+ Añadir categoría'}
      </button>
    </form>
  )
}

function AddBudgetForm({
  onAdded,
  defaultPeriodStart,
  categories,
  group,
}: {
  onAdded: () => void
  defaultPeriodStart: string
  categories: BudgetCategory[]
  group: string
}) {
  const [periodType, setPeriodType] = useState<BudgetPeriod>('mensual')
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createBudget({ periodType, periodStart, category, amount: Number(amount), budgetGroup: group })
      setCategory('')
      setAmount('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo presupuesto</h2>
      <label>
        Periodo
        <select value={periodType} onChange={(e) => setPeriodType(e.target.value as BudgetPeriod)}>
          <option value="mensual">Mensual</option>
          <option value="semanal">Semanal</option>
        </select>
      </label>
      <label>
        Empieza el
        <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
      </label>
      <label>
        Categoría (vacío = general)
        <input
          type="text"
          list="budget-category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Alimentación"
        />
        <datalist id="budget-category-options">
          {categories.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear presupuesto'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Educación financiera infantil (Skill 20)
// ---------------------------------------------------------------------

// Antes había un único saldo mezclando ingresos y gastos en una sola
// lista de "Movimientos" — a petición real de la usuaria, para
// educación financiera se separa en cuatro categorías con su propia
// pestaña cada una, para poder ver en cualquier momento cuánto tiene
// disponible, cuánto ha ahorrado, cuánto ha ingresado en total y
// cuánto ha gastado, todo por separado.
const WALLET_TABS: { key: WalletTransactionType; label: string; formLabel: string }[] = [
  { key: 'ingreso', label: 'Ingresos', formLabel: 'ingreso' },
  { key: 'ahorro', label: 'Ahorro', formLabel: 'ahorro' },
  { key: 'gasto', label: 'Gastos', formLabel: 'gasto' },
  { key: 'impuesto', label: 'Impuestos', formLabel: 'impuesto' },
]

function KidsFinanceTab() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')
  const [walletTab, setWalletTab] = useState<WalletTransactionType>('ingreso')
  const [transactions, setTransactions] = useState<KidWalletTransaction[]>([])
  const [goals, setGoals] = useState<KidGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listFamilyMembers(), listWalletTransactions(), listGoals()])
      .then(([m, t, g]) => {
        const kids = m.filter((x) => x.memberType === 'child' || x.memberType === 'baby')
        setMembers(kids)
        if (kids.length > 0 && !activeMemberId) setActiveMemberId(kids[0].id)
        setTransactions(t)
        setGoals(g)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, []) // eslint-disable-line react-hooks/exhaustive-deps

  const balance = activeMemberId ? walletBalance(activeMemberId, transactions) : 0
  const memberGoals = goals.filter((g) => g.memberId === activeMemberId)
  const activeTabInfo = WALLET_TABS.find((t) => t.key === walletTab)!
  const categoryTotal = activeMemberId ? walletCategoryTotal(activeMemberId, walletTab, transactions) : 0
  const categoryTransactions = transactions.filter((t) => t.memberId === activeMemberId && t.type === walletTab)

  if (loading) return <p className="muted">Cargando…</p>
  if (members.length === 0) return <p className="muted">No hay niños/bebés en la familia todavía.</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="filter-row">
        {members.map((m) => (
          <button
            key={m.id}
            className={'chip' + (activeMemberId === m.id ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => setActiveMemberId(m.id)}
          >
            <MemberAvatar member={m} size={18} />
            {m.name}
          </button>
        ))}
      </div>

      <p className="points-badge">Disponible: {balance.toFixed(2)} €</p>
      <p className="muted">
        {WALLET_TABS.map((t) => `${t.label} ${walletCategoryTotal(activeMemberId, t.key, transactions).toFixed(2)} €`).join(' · ')}
      </p>

      <div className="filter-row">
        {WALLET_TABS.map((t) => (
          <button
            key={t.key}
            className={'chip' + (walletTab === t.key ? ' chip-active' : '')}
            onClick={() => setWalletTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <h2 className="section-title">
        {activeTabInfo.label}: {categoryTotal.toFixed(2)} €
      </h2>

      {walletTab === 'ahorro' && (
        <>
          <h3>Objetivos de ahorro</h3>
          <div className="event-list">
            {memberGoals.map((goal) => {
              const pct = Math.min(100, Math.round((categoryTotal / goal.targetAmount) * 100))
              return (
                <div key={goal.id} className="card task-card">
                  <div className="task-card-main">
                    <strong>{goal.title}</strong>
                    <p className="muted">
                      {categoryTotal.toFixed(2)} € de {goal.targetAmount.toFixed(2)} € ({pct}%)
                    </p>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <ConfirmButton label="Eliminar" onConfirm={() => deleteGoal(goal.id).then(reload)} />
                </div>
              )
            })}
            {memberGoals.length === 0 && <p className="muted">Sin objetivos todavía.</p>}
          </div>
          <AddGoalForm memberId={activeMemberId} onAdded={reload} />
        </>
      )}

      <div className="event-list">
        {categoryTransactions.map((t) => (
          <div key={t.id} className="card task-card">
            <div className="task-card-main">
              <strong>
                {t.amount.toFixed(2)} € — {t.description}
              </strong>
            </div>
            <ConfirmButton label="Eliminar" onConfirm={() => deleteWalletTransaction(t.id).then(reload)} />
          </div>
        ))}
        {categoryTransactions.length === 0 && <p className="muted">Sin movimientos todavía.</p>}
      </div>
      <AddTransactionForm memberId={activeMemberId} type={walletTab} formLabel={activeTabInfo.formLabel} onAdded={reload} />
    </div>
  )
}

function AddGoalForm({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createGoal({ memberId, title, targetAmount: Number(targetAmount) })
      setTitle('')
      setTargetAmount('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo objetivo</h2>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Un juguete" required />
      </label>
      <label>
        Coste (€)
        <input type="number" step="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear objetivo'}
      </button>
    </form>
  )
}

// El tipo ya no se elige en un desplegable — lo decide la pestaña en la
// que estés (Ingresos/Ahorro/Gastos/Impuestos), así no hay que elegirlo
// dos veces ni se puede registrar un ingreso sin querer en la pestaña
// de gastos.
function AddTransactionForm({
  memberId,
  type,
  formLabel,
  onAdded,
}: {
  memberId: string
  type: WalletTransactionType
  formLabel: string
  onAdded: () => void
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addWalletTransaction({ memberId, type, amount: Number(amount), description })
      setAmount('')
      setDescription('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo {formLabel}</h2>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label>
        Descripción
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  )
}
