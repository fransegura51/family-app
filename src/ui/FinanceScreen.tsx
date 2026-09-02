import { FormEvent, useEffect, useMemo, useState } from 'react'
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
import { MemberAvatar } from '@/ui/MemberAvatar'
import { deleteReceipt, getReceiptUrl, listReceipts, updateReceipt, uploadReceipt } from '@/data/receipts'
import { listAllProductPrices, listProducts, recordProductPurchase } from '@/data/products'
import { budgetSpent, walletBalance } from '@/domain/finance'
import { MONTH_LABELS } from '@/domain/calendar'
import { averagePricesByMonth, basketTotal, compareMonths } from '@/domain/priceTrends'
import { analyzeReceiptPhoto } from '@/services/receiptPhoto'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import type {
  Budget,
  BudgetPeriod,
  Expense,
  ExpenseKind,
  FamilyMember,
  KidGoal,
  KidWalletTransaction,
  Product,
  ProductPrice,
  Receipt,
  WalletTransactionType,
} from '@/domain/types'

const SUB_TABS = ['Gastos', 'Tickets', 'Precios', 'Presupuestos', 'Educación financiera'] as const
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
      <div className="filter-row">
        {SUB_TABS.map((t) => (
          <button key={t} className={'chip' + (tab === t ? ' chip-active' : '')} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Gastos' && <ExpensesTab />}
      {tab === 'Tickets' && <ReceiptsTab />}
      {tab === 'Precios' && <PriceTrendsTab />}
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
            <button type="button" className="link-button" onClick={() => deleteExpense(e.id).then(reload)}>
              Eliminar
            </button>
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

function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    listReceipts()
      .then(setReceipts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleDelete(receipt: Receipt) {
    try {
      await deleteReceipt(receipt)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    }
  }

  if (loading) return <p className="muted">Cargando tickets…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        Sube la foto y pulsa "Leer ticket" para rellenar productos y precios automáticamente
        (con IA, nivel gratuito) — revisa el resultado antes de guardar, la lectura no siempre
        acierta.
      </p>
      <div className="event-list">
        {receipts.map((r) =>
          editingId === r.id ? (
            <EditReceiptForm
              key={r.id}
              receipt={r}
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
        {receipts.length === 0 && <p className="muted">No hay tickets guardados.</p>}
      </div>
      <AddReceiptForm onAdded={reload} />
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
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            Ver ticket
          </a>
        ) : (
          <button
            type="button"
            className="link-button"
            onClick={() => getReceiptUrl(receipt.storagePath).then(setUrl)}
          >
            Ver ticket
          </button>
        )}
      </div>
      <div className="member-card-actions">
        <button type="button" className="link-button" onClick={onEdit}>
          Editar
        </button>
        <button type="button" className="link-button" onClick={onDelete}>
          Eliminar
        </button>
      </div>
    </div>
  )
}

function EditReceiptForm({
  receipt,
  onDone,
  onCancel,
}: {
  receipt: Receipt
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
      <label>
        Establecimiento
        <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
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

function AddReceiptForm({ onAdded }: { onAdded: () => void }) {
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
      if (parsed.store) setStore(parsed.store)
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

      <label>
        Establecimiento
        <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
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
// Precios — compara lo pagado por cada producto este mes frente al
// anterior, a partir del mismo historial que alimentan los tickets y la
// Memoria de la lista de la compra. No normaliza por cantidad (1L vs
// 1,5L cuentan igual): compara lo que se pagó cada vez, que es el dato
// que hay sin pedir cantidades exactas en cada compra.
// ---------------------------------------------------------------------

function PriceDelta({ percent }: { percent: number | null }) {
  if (percent == null) return null
  const rounded = Math.round(percent * 10) / 10
  if (Math.abs(rounded) < 0.5) return <span className="muted"> · sin cambios</span>
  const up = rounded > 0
  return (
    <span style={{ color: up ? '#c0392b' : '#1e8449', fontWeight: 600, marginLeft: 8 }}>
      {up ? '▲' : '▼'} {Math.abs(rounded)}%
    </span>
  )
}

function PriceTrendsTab() {
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(toDateStr(new Date()).slice(0, 7))

  useEffect(() => {
    setLoading(true)
    Promise.all([listAllProductPrices(), listProducts()])
      .then(([p, prod]) => {
        setPrices(p)
        setProducts(prod)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function shiftMonth(delta: number) {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setVisibleMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const previousMonth = useMemo(() => {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [visibleMonth])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p.displayName])), [products])

  const purchases = useMemo(
    () =>
      prices.map((p) => {
        const qty = Number(p.quantity)
        return {
          productId: p.productId,
          price: p.price,
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
          recordedDate: p.recordedDate,
        }
      }),
    [prices],
  )

  const comparisons = useMemo(() => {
    const monthly = averagePricesByMonth(purchases)
    return compareMonths(monthly, visibleMonth, previousMonth)
      .map((c) => ({ ...c, name: productById.get(c.productId) ?? '?' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [purchases, visibleMonth, previousMonth, productById])

  const currentBasket = useMemo(() => basketTotal(purchases, visibleMonth), [purchases, visibleMonth])
  const previousBasket = useMemo(() => basketTotal(purchases, previousMonth), [purchases, previousMonth])
  const basketDeltaPercent = previousBasket > 0 ? ((currentBasket - previousBasket) / previousBasket) * 100 : null

  if (loading) return <p className="muted">Cargando precios…</p>

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
      </div>

      <div className="card event-card">
        <strong>Total de la compra</strong>
        <p>
          {currentBasket.toFixed(2)} €
          <PriceDelta percent={basketDeltaPercent} />
        </p>
        {previousBasket > 0 && <p className="muted">Mes anterior: {previousBasket.toFixed(2)} €</p>}
      </div>

      <p className="muted">
        Precio medio por unidad este mes frente al mes anterior — 🔺 rojo si ha subido, 🔻 verde si ha bajado.
        Si compraste varias unidades de golpe (p. ej. 2 bolsas de patatas), se tiene en cuenta para no confundir
        "comprar más" con "subir de precio".
      </p>

      <div className="event-list">
        {comparisons.map((c) => (
          <div key={c.productId} className="card event-card">
            <strong>{c.name}</strong>
            <p>
              {c.currentPrice!.toFixed(2)} €/ud
              <PriceDelta percent={c.deltaPercent} />
            </p>
            {c.previousPrice != null && <p className="muted">Mes anterior: {c.previousPrice.toFixed(2)} €/ud</p>}
            {c.previousPrice == null && <p className="muted">Sin compra el mes anterior para comparar</p>}
          </div>
        ))}
        {comparisons.length === 0 && (
          <p className="muted">No hay productos con precio registrado este mes (tickets o lista de la compra).</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Presupuestos (Skill 19)
// ---------------------------------------------------------------------

function BudgetsTab() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listBudgets(), listExpenses()])
      .then(([b, e]) => {
        setBudgets(b)
        setExpenses(e)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  if (loading) return <p className="muted">Cargando presupuestos…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {budgets.map((b) => {
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
              <button type="button" className="link-button" onClick={() => deleteBudget(b.id).then(reload)}>
                Eliminar
              </button>
            </div>
          )
        })}
        {budgets.length === 0 && <p className="muted">No hay presupuestos todavía.</p>}
      </div>
      <AddBudgetForm onAdded={reload} />
    </div>
  )
}

function AddBudgetForm({ onAdded }: { onAdded: () => void }) {
  const [periodType, setPeriodType] = useState<BudgetPeriod>('mensual')
  const [periodStart, setPeriodStart] = useState(toDateStr(new Date()))
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

function KidsFinanceTab() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')
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
  const memberTransactions = transactions.filter((t) => t.memberId === activeMemberId)
  const memberGoals = goals.filter((g) => g.memberId === activeMemberId)

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

      <p className="points-badge">Saldo: {balance.toFixed(2)} €</p>

      <h2 className="section-title">Objetivos de ahorro</h2>
      <div className="event-list">
        {memberGoals.map((goal) => {
          const pct = Math.min(100, Math.round((balance / goal.targetAmount) * 100))
          return (
            <div key={goal.id} className="card task-card">
              <div className="task-card-main">
                <strong>{goal.title}</strong>
                <p className="muted">
                  {balance.toFixed(2)} € de {goal.targetAmount.toFixed(2)} € ({pct}%)
                </p>
                <div className="progress-bar">
                  <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button type="button" className="link-button" onClick={() => deleteGoal(goal.id).then(reload)}>
                Eliminar
              </button>
            </div>
          )
        })}
        {memberGoals.length === 0 && <p className="muted">Sin objetivos todavía.</p>}
      </div>
      <AddGoalForm memberId={activeMemberId} onAdded={reload} />

      <h2 className="section-title">Movimientos</h2>
      <div className="event-list">
        {memberTransactions.map((t) => (
          <div key={t.id} className="card task-card">
            <div className="task-card-main">
              <strong>
                {t.type === 'ingreso' ? '+' : '-'}
                {t.amount.toFixed(2)} € — {t.description}
              </strong>
            </div>
            <button
              type="button"
              className="link-button"
              onClick={() => deleteWalletTransaction(t.id).then(reload)}
            >
              Eliminar
            </button>
          </div>
        ))}
        {memberTransactions.length === 0 && <p className="muted">Sin movimientos todavía.</p>}
      </div>
      <AddTransactionForm memberId={activeMemberId} onAdded={reload} />
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

function AddTransactionForm({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [type, setType] = useState<WalletTransactionType>('ingreso')
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
      <h2>Nuevo movimiento</h2>
      <label>
        Tipo
        <select value={type} onChange={(e) => setType(e.target.value as WalletTransactionType)}>
          <option value="ingreso">Ingreso</option>
          <option value="gasto">Gasto</option>
        </select>
      </label>
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
