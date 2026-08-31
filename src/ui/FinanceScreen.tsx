import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  addExpense,
  addWalletTransaction,
  createBudget,
  createGoal,
  deleteBudget,
  deleteExpense,
  deleteGoal,
  listBudgets,
  listExpenses,
  listGoals,
  listWalletTransactions,
} from '@/data/finance'
import { listFamilyMembers } from '@/data/family'
import { budgetSpent, walletBalance } from '@/domain/finance'
import type {
  Budget,
  BudgetPeriod,
  Expense,
  ExpenseKind,
  FamilyMember,
  KidGoal,
  KidWalletTransaction,
  WalletTransactionType,
} from '@/domain/types'

const SUB_TABS = ['Gastos', 'Presupuestos', 'Educación financiera'] as const
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

  function reload() {
    setLoading(true)
    listExpenses()
      .then(setExpenses)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const monthTotal = useMemo(() => {
    const thisMonth = toDateStr(new Date()).slice(0, 7)
    return expenses
      .filter((e) => e.kind === 'real' && e.expenseDate.startsWith(thisMonth))
      .reduce((sum, e) => sum + e.amount, 0)
  }, [expenses])

  const byCategory = useMemo(() => {
    const thisMonth = toDateStr(new Date()).slice(0, 7)
    const map = new Map<string, number>()
    for (const e of expenses.filter((e) => e.kind === 'real' && e.expenseDate.startsWith(thisMonth))) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [expenses])

  if (loading) return <p className="muted">Cargando gastos…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <p className="points-badge">Este mes: {monthTotal.toFixed(2)} €</p>
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
        {expenses.map((e) => (
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
        {expenses.length === 0 && <p className="muted">No hay gastos registrados.</p>}
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
