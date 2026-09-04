import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ReorderableTabBar } from '@/ui/ReorderableTabBar'
import {
  addExpense,
  addWalletTransaction,
  createBudget,
  createGoal,
  deleteBudget,
  deleteExpense,
  deleteGoal,
  deleteWalletTransaction,
  listBudgets,
  listExpenses,
  listGoals,
  listWalletTransactions,
} from '@/data/finance'
import { listFamilyMembers } from '@/data/family'
import { createShoppingStore, listShoppingStores } from '@/data/shoppingStores'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { deleteReceipt, getReceiptUrl, listReceipts, updateReceipt, uploadReceipt } from '@/data/receipts'
import { recordProductPurchase } from '@/data/products'
import { budgetPeriodRange, budgetSpent, walletBalance, walletCategoryTotal } from '@/domain/finance'
import { MONTH_LABELS } from '@/domain/calendar'
import { findKnownStore } from '@/domain/voiceQuery'
import { analyzeReceiptPhoto } from '@/services/receiptPhoto'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import { StoreIcon } from '@/ui/StoreIcon'
import type {
  Budget,
  BudgetPeriod,
  Expense,
  ExpenseKind,
  FamilyMember,
  KidGoal,
  KidWalletTransaction,
  Receipt,
  WalletTransactionType,
} from '@/domain/types'

const SUB_TABS = ['Gastos', 'Tickets', 'Presupuestos', 'Educación financiera'] as const
type SubTab = (typeof SUB_TABS)[number]

const EXPENSE_KINDS: { value: ExpenseKind; label: string }[] = [
  { value: 'real', label: 'Real' },
  { value: 'estimado', label: 'Estimado' },
  { value: 'previsto', label: 'Previsto' },
]

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function FinanceScreen() {
  const [tab, setTab] = useState<SubTab>('Gastos')

  return (
    <div className="screen">
      <h1>Dinero</h1>
      <ReorderableTabBar storageKey="dinero" tabs={SUB_TABS} active={tab} onSelect={setTab} />

      {tab === 'Gastos' && <ExpensesTab />}
      {tab === 'Tickets' && <ReceiptsTab />}
      {tab === 'Presupuestos' && <BudgetsTab />}
      {tab === 'Educación financiera' && <KidsFinanceTab />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Gastos (Skill 17/18)
// ---------------------------------------------------------------------

function ExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // "YYYY-MM" del mes que se está viendo — no siempre el actual, para
  // poder consultar meses anteriores (o cualquier mes suelto, como
  // febrero) en vez de solo el que corre.
  const [visibleMonth, setVisibleMonth] = useState(toDateStr(new Date()).slice(0, 7))

  function reload() {
    setLoading(true)
    listExpenses()
      .then(setExpenses)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  function shiftMonth(delta: number) {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setVisibleMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.expenseDate.startsWith(visibleMonth)),
    [expenses, visibleMonth],
  )

  const monthTotal = useMemo(
    () => monthExpenses.filter((e) => e.kind === 'real').reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses],
  )

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of monthExpenses.filter((e) => e.kind === 'real')) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [monthExpenses])

  if (loading) return <p className="muted">Cargando gastos…</p>

  const [visibleYear, visibleMonthIndex] = visibleMonth.split('-').map(Number)

  return (
    <div>
      {error && <p className="error">{error}</p>}

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

      <p className="points-badge">
        {MONTH_LABELS[visibleMonthIndex - 1]}: {monthTotal.toFixed(2)} €
      </p>
      {byCategory.length > 0 && (
        <ul className="ingredient-list">
          {byCategory.map(([cat, amount]) => (
            <li key={cat}>
              {cat}: {amount.toFixed(2)} €
            </li>
          ))}
        </ul>
      )}

      <div className="event-list">
        {monthExpenses.map((e) => (
          <div key={e.id} className="card task-card">
            <div className="task-card-main">
              <strong>
                {e.category} — {e.amount.toFixed(2)} €
              </strong>
              <p className="muted">
                {e.expenseDate} · {e.kind}
                {e.store && ` · ${e.store}`}
              </p>
            </div>
            <ConfirmButton label="Eliminar" onConfirm={() => deleteExpense(e.id).then(reload)} />
          </div>
        ))}
        {monthExpenses.length === 0 && <p className="muted">No hay gastos este mes.</p>}
      </div>

      <AddExpenseForm onAdded={reload} />
    </div>
  )
}

function AddExpenseForm({ onAdded }: { onAdded: () => void }) {
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [store, setStore] = useState('')
  const [kind, setKind] = useState<ExpenseKind>('real')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addExpense({ date, amount: Number(amount), category, store, kind })
      setAmount('')
      setCategory('')
      setStore('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo gasto</h2>
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label>
        Categoría
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Alimentación" required />
      </label>
      <label>
        Establecimiento
        <input type="text" value={store} onChange={(e) => setStore(e.target.value)} />
      </label>
      <label>
        Tipo
        <select value={kind} onChange={(e) => setKind(e.target.value as ExpenseKind)}>
          {EXPENSE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Añadir'}
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

function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [knownStores, setKnownStores] = useState<string[]>([])
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
      <AddReceiptForm onAdded={reload} knownStores={knownStores} existingFolders={storeNames} />

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
                      <EditReceiptForm
                        key={r.id}
                        receipt={r}
                        existingFolders={storeNames}
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

type SpendRangePreset = 'dia' | 'semana' | 'mes' | 'año' | 'rango'

function rangeForPreset(preset: SpendRangePreset, customFrom: string, customTo: string): [string, string] {
  const today = new Date()
  const todayStr = toDateStr(today)
  if (preset === 'dia') return [todayStr, todayStr]
  if (preset === 'semana') {
    // Lunes a domingo de esta semana.
    const dow = (today.getDay() + 6) % 7
    const monday = new Date(today)
    monday.setDate(today.getDate() - dow)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return [toDateStr(monday), toDateStr(sunday)]
  }
  if (preset === 'mes') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return [toDateStr(first), toDateStr(last)]
  }
  if (preset === 'año') {
    return [`${today.getFullYear()}-01-01`, `${today.getFullYear()}-12-31`]
  }
  return [customFrom || todayStr, customTo || todayStr]
}

const PRESET_LABELS: Record<SpendRangePreset, string> = {
  dia: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  año: 'Este año',
  rango: 'Rango',
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

function ReceiptRow({
  receipt,
  onEdit,
  onDelete,
}: {
  receipt: Receipt
  onEdit: () => void
  onDelete: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{receipt.store || 'Sin establecimiento'}</strong>
        <p className="muted">
          {receipt.receiptDate}
          {receipt.totalAmount != null && ` · ${receipt.totalAmount.toFixed(2)} €`}
        </p>
        {receipt.storagePath ? (
          url ? (
            <a href={url} target="_blank" rel="noreferrer">
              Ver ticket
            </a>
          ) : (
            <button
              type="button"
              className="link-button"
              onClick={() => getReceiptUrl(receipt.storagePath!).then(setUrl)}
            >
              Ver ticket
            </button>
          )
        ) : (
          <p className="muted">Foto eliminada (ticket de hace más de 3 meses)</p>
        )}
      </div>
      <div className="member-card-actions">
        <button type="button" className="link-button" onClick={onEdit}>
          Editar
        </button>
        <ConfirmButton label="Eliminar" onConfirm={onDelete} />
      </div>
    </div>
  )
}

function EditReceiptForm({
  receipt,
  existingFolders,
  onDone,
  onCancel,
}: {
  receipt: Receipt
  existingFolders: string[]
  onDone: () => void
  onCancel: () => void
}) {
  const [store, setStore] = useState(receipt.store ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt.receiptDate)
  const [totalAmount, setTotalAmount] = useState(receipt.totalAmount != null ? String(receipt.totalAmount) : '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateReceipt(receipt.id, {
        store,
        receiptDate,
        totalAmount: totalAmount ? Number(totalAmount) : null,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      {/* Petición real: "los tickets, ¿puedo yo decir dónde se meten?
          porque H Rafal II e Hiperber es lo mismo" — el emparejamiento
          automático por texto no siempre acierta (son nombres de
          verdad distintos), así que aquí se puede simplemente tocar la
          carpeta correcta en vez de fiarse de que el texto coincida. */}
      {existingFolders.length > 0 && (
        <label>
          Mover a esta carpeta
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
        <input type="text" list="receipt-known-stores" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
      </label>
      <label>
        Fecha
        <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
      </label>
      <label>
        Importe total (€)
        <input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

interface DraftLine {
  name: string
  quantity: string
  price: string // importe TOTAL de la línea (cantidad × precio unitario), no el precio por unidad
}

type OcrStatus = 'idle' | 'reading' | 'done' | 'error'

function AddReceiptForm({
  onAdded,
  knownStores,
  existingFolders,
}: {
  onAdded: () => void
  knownStores: string[]
  existingFolders: string[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [store, setStore] = useState('')
  const [receiptDate, setReceiptDate] = useState(toDateStr(new Date()))
  const [totalAmount, setTotalAmount] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Elige una foto o archivo del ticket')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await uploadReceipt({
        file,
        store,
        receiptDate,
        totalAmount: totalAmount ? Number(totalAmount) : null,
      })

      // En paralelo, no uno a uno: con muchos productos leídos, guardarlos
      // en serie tardaba tanto (una llamada de red por línea) que parecía
      // que se había quedado colgado en "Subiendo…" — bug real detectado
      // al probar con un ticket de varias líneas.
      await Promise.all(
        lines
          .filter((line) => line.name.trim() && !Number.isNaN(Number(line.price)))
          .map((line) =>
            recordProductPurchase({
              name: line.name.trim(),
              price: Number(line.price),
              quantity: line.quantity || '1',
              unit: '',
              store,
              date: receiptDate,
            }),
          ),
      )

      setFile(null)
      setStore('')
      setTotalAmount('')
      setLines([])
      setOcrStatus('idle')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el ticket')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
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

      {/* Petición real: "el ticket, ¿dónde quiero guardarlo? en
          Mercadona, en Hiperber, en Aldi, donde yo quiera" — tocar la
          carpeta de destino en vez de escribirla, para no depender de
          que el texto coincida exactamente con una ya existente. */}
      {existingFolders.length > 0 && (
        <label>
          ¿Dónde guardo este ticket?
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

      {(ocrStatus === 'done' || lines.length > 0) && (
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
            </div>
          ))}
          {lines.length === 0 && <p className="muted">No se ha reconocido ningún producto.</p>}
          <button type="button" className="link-button" onClick={addBlankLine}>
            + Añadir línea
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Subiendo…' : 'Guardar ticket'}
      </button>
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
// vez de barras. conic-gradient reparte cada tienda su color según su
// % del total, sin necesidad de dibujar el SVG a mano.
function StorePieChart({ groups, monthLabel }: { groups: { store: string; total: number }[]; monthLabel: string }) {
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)
  let cumulative = 0
  const stops = groups.map((g, i) => {
    const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0
    const start = cumulative
    cumulative += pct
    return `${STORE_COLORS[i % STORE_COLORS.length]} ${start}% ${cumulative}%`
  })
  const gradient = grandTotal > 0 ? `conic-gradient(${stops.join(', ')})` : '#e9ecef'

  return (
    <div className="card event-card">
      <strong>Reparto del gasto por tienda — {monthLabel}</strong>
      {grandTotal === 0 ? (
        <p className="muted">No hay tickets guardados ese mes.</p>
      ) : (
        <div className="store-pie-wrap">
          <div className="store-pie" style={{ background: gradient }} />
          <div className="store-pie-legend">
            {groups.map((g, i) => {
              const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0
              return (
                <div key={g.store} className="store-pie-legend-row">
                  <span className="store-pie-swatch" style={{ background: STORE_COLORS[i % STORE_COLORS.length] }} />
                  <span className="store-pie-legend-name">{g.store}</span>
                  <span className="muted">
                    {pct.toFixed(0)}% · {g.total.toFixed(2)} €
                  </span>
                </div>
              )
            })}
          </div>
        </div>
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
function BudgetsTab() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [knownStores, setKnownStores] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(toDateStr(new Date()).slice(0, 7))

  function reload() {
    setLoading(true)
    Promise.all([listBudgets(), listExpenses(), listReceipts(), listShoppingStores()])
      .then(([b, e, r, stores]) => {
        setBudgets(b)
        setExpenses(e)
        setReceipts(r)
        setKnownStores(stores.map((s) => s.name))
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

  if (loading) return <p className="muted">Cargando presupuestos…</p>

  const [visibleYear, visibleMonthIndex] = visibleMonth.split('-').map(Number)
  const monthBudgets = budgets.filter((b) => budgetPeriodRange(b).start.slice(0, 7) === visibleMonth)
  const monthReceipts = receipts.filter((r) => r.receiptDate.startsWith(visibleMonth))
  const pieGroups = groupReceiptsByStore(monthReceipts, knownStores)

  return (
    <div>
      {error && <p className="error">{error}</p>}

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

      <StorePieChart groups={pieGroups} monthLabel={`${MONTH_LABELS[visibleMonthIndex - 1]} ${visibleYear}`} />
      <div className="event-list">
        {monthBudgets.map((b) => {
          const spent = budgetSpent(b, expenses)
          const pct = Math.min(100, Math.round((spent / b.amount) * 100))
          return (
            <div key={b.id} className="card task-card">
              <div className="task-card-main">
                <strong>{b.category ?? 'General'}</strong>
                <p className="muted">
                  {b.periodType} desde {b.periodStart} · gastado {spent.toFixed(2)} € de {b.amount.toFixed(2)} €
                  ({pct}%)
                </p>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <ConfirmButton label="Eliminar" onConfirm={() => deleteBudget(b.id).then(reload)} />
            </div>
          )
        })}
        {monthBudgets.length === 0 && <p className="muted">No hay presupuestos guardados en este mes.</p>}
      </div>
      <AddBudgetForm key={visibleMonth} onAdded={reload} defaultPeriodStart={`${visibleMonth}-01`} />
    </div>
  )
}

function AddBudgetForm({ onAdded, defaultPeriodStart }: { onAdded: () => void; defaultPeriodStart: string }) {
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
      await createBudget({ periodType, periodStart, category, amount: Number(amount) })
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
        <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Alimentación" />
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
