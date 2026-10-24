// Comportamiento REAL (no solo texto) del sincronizador bancario modificado, ejecutado contra una base de datos de mentira: carga el código de
// supabase/functions/enable-banking-sync-transactions/index.ts, le quita Deno.serve y los imports, y ejecuta linkTransactionsToExpenses.
// Caso del encargo: compra de 60 € pagada con 20 € en efectivo y 40 € con tarjeta → UN solo gasto de 60 € y se concilia ÚNICAMENTE el cargo de 40 €.
import { transformSync } from 'esbuild'
import { beforeEach, describe, expect, it } from 'vitest'
import source from '../../supabase/functions/enable-banking-sync-transactions/index.ts?raw'

type Row = Record<string, unknown>
const db: Record<string, Row[]> = {}
let nextId = 1

function matchTerm(row: Row, term: string): boolean {
  const m = term.match(/^(\w+)\.(is\.null|neq\.(.+)|not\.in\.\((.+)\)|eq\.(.+))$/)
  if (!m) throw new Error(`filtro .or() no soportado en la prueba: ${term}`)
  const [, col, op, neq, notIn, eq] = m
  const v = row[col] ?? null
  if (op === 'is.null') return v === null
  if (neq !== undefined) return v !== neq
  if (notIn !== undefined) return !notIn.split(',').includes(String(v))
  return v === eq
}
function splitOr(expr: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of expr) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' = 'select'
  let payload: Row = {}
  const filters: ((r: Row) => boolean)[] = []
  const api: Record<string, unknown> = {}
  const run = () => {
    const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)))
    if (op === 'insert') {
      const row = { id: `n${nextId++}`, ...payload }
      ;(db[table] ??= []).push(row)
      return { data: [row], error: null }
    }
    if (op === 'update') {
      rows.forEach((r) => Object.assign(r, payload))
      return { data: rows, error: null }
    }
    return { data: rows, error: null }
  }
  const add = (name: string, fn: (...a: never[]) => void) => {
    api[name] = (...a: never[]) => (fn(...a), api)
  }
  add('select', () => {})
  add('insert', ((p: Row) => ((op = 'insert'), (payload = p))) as never)
  add('update', ((p: Row) => ((op = 'update'), (payload = p))) as never)
  add('eq', ((c: string, v: unknown) => filters.push((r) => r[c] === v)) as never)
  add('in', ((c: string, v: unknown[]) => filters.push((r) => v.includes(r[c]))) as never)
  add('is', ((c: string, v: unknown) => filters.push((r) => (r[c] ?? null) === v)) as never)
  add('not', ((c: string, o: string, v: unknown) => filters.push((r) => (o === 'is' ? (r[c] ?? null) !== v : true))) as never)
  add('gte', ((c: string, v: string) => filters.push((r) => String(r[c]) >= v)) as never)
  add('lte', ((c: string, v: string) => filters.push((r) => String(r[c]) <= v)) as never)
  add('or', ((expr: string) => {
    const terms = splitOr(expr)
    filters.push((r) => terms.some((t) => matchTerm(r, t)))
  }) as never)
  api.single = () => Promise.resolve({ data: run().data?.[0] ?? null, error: null })
  api.maybeSingle = () => Promise.resolve({ data: run().data?.[0] ?? null, error: null })
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve)
  return api
}
const admin = { from: (t: string) => builder(t), rpc: async () => ({ data: null }) }

// Se carga la función real del sincronizador.
const code = transformSync(
  source
    .slice(0, source.indexOf('Deno.serve('))
    .replace(/^import .*$/gm, ''),
  { loader: 'ts' },
).code
const { linkTransactionsToExpenses } = new Function('Deno', 'createClient', `${code}\nreturn { linkTransactionsToExpenses }`)({ env: { get: () => 'x' } }, () => admin) as {
  linkTransactionsToExpenses: (a: unknown, acc: unknown) => Promise<void>
}

const ACCOUNT = { id: 'acc1', owner_member_id: null, bank_connections: { family_id: 'famA' } }
const DAY = '2026-10-20'
const expense = (o: Row): Row => ({ family_id: 'famA', expense_date: DAY, kind: 'real', is_income: false, source: 'manual', payment_method: null, category: 'Otros', store: 'Ferretería', ...o })
const tx = (o: Row): Row => ({ account_id: 'acc1', transaction_date: DAY, currency: 'EUR', credit_debit: 'DBIT', description: 'COMPRA', matched_expense_id: null, ...o })

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  db.expenses = []
  db.bank_transactions = []
  db.purchase_payments = []
  db.receipts = []
  db.budget_categories = [{ family_id: 'famA', name: 'Otros', catalog_key: null }, { family_id: 'famA', name: 'Devoluciones', catalog_key: 'i.ingreso.devoluciones' }]
  nextId = 1
})

const sync = () => linkTransactionsToExpenses(admin, ACCOUNT)
const bankExpenses = () => db.expenses.filter((e) => e.source === 'banco')

describe('pago mixto: 60 € = 20 € efectivo + 40 € tarjeta', () => {
  function mixedPurchase() {
    db.expenses.push(expense({ id: 'E1', amount: 60, payment_method: 'mixto' }))
    db.receipts.push({ id: 'R1', family_id: 'famA', receipt_date: DAY, expense_id: 'E1' })
    db.purchase_payments.push(
      { id: 'P1', family_id: 'famA', receipt_id: 'R1', method: 'efectivo', amount: 20, bank_transaction_id: null },
      { id: 'P2', family_id: 'famA', receipt_id: 'R1', method: 'tarjeta', amount: 40, bank_transaction_id: null },
    )
  }

  it('el cargo bancario de 40 € se concilia con SU compra: un solo gasto de 60 €, sin gasto nuevo', async () => {
    mixedPurchase()
    db.bank_transactions.push(tx({ id: 'BT40', amount: 40 }))
    await sync()
    expect(db.bank_transactions[0].matched_expense_id).toBe('E1')
    expect(db.purchase_payments.find((p) => p.id === 'P2')?.bank_transaction_id).toBe('BT40')
    expect(db.purchase_payments.find((p) => p.id === 'P1')?.bank_transaction_id).toBeNull() // el efectivo no se enlaza a nada del banco
    expect(db.expenses).toHaveLength(1) // ningún gasto nuevo
    expect(db.expenses[0]).toMatchObject({ id: 'E1', amount: 60, source: 'ticket_banco' })
  })

  it('un cargo de 60 € (el total) NO se concilia con la compra mixta: es otro gasto', async () => {
    mixedPurchase()
    db.bank_transactions.push(tx({ id: 'BT60', amount: 60, description: 'COMPRA OTRO COMERCIO' }))
    await sync()
    expect(db.expenses.find((e) => e.id === 'E1')).toMatchObject({ source: 'manual', amount: 60 })
    expect(db.bank_transactions[0].matched_expense_id).not.toBe('E1')
    expect(bankExpenses()).toHaveLength(1)
  })

  it('un cargo de 20 € (la parte en efectivo) NO se concilia con nada de la compra', async () => {
    mixedPurchase()
    db.bank_transactions.push(tx({ id: 'BT20', amount: 20, description: 'OTRA COSA' }))
    await sync()
    expect(db.expenses.find((e) => e.id === 'E1')?.source).toBe('manual')
    expect(db.purchase_payments.find((p) => p.id === 'P1')?.bank_transaction_id).toBeNull()
    expect(bankExpenses()).toHaveLength(1)
  })

  it('con los tres cargos a la vez: solo el de 40 € va a la compra, los otros dos son gastos del banco', async () => {
    mixedPurchase()
    db.bank_transactions.push(tx({ id: 'BT40', amount: 40 }), tx({ id: 'BT60', amount: 60 }), tx({ id: 'BT20', amount: 20 }))
    await sync()
    expect(db.bank_transactions.find((t) => t.id === 'BT40')?.matched_expense_id).toBe('E1')
    expect(bankExpenses().map((e) => e.amount).sort()).toEqual([20, 60])
    expect(db.expenses.filter((e) => e.amount === 60 && e.source !== 'banco')).toHaveLength(1)
  })

  it('si dos compras mixtas tienen una parte de tarjeta de 40 € en la misma ventana, no se elige ninguna (ambiguo)', async () => {
    mixedPurchase()
    db.expenses.push(expense({ id: 'E2', amount: 55, payment_method: 'mixto' }))
    db.receipts.push({ id: 'R2', family_id: 'famA', receipt_date: DAY, expense_id: 'E2' })
    db.purchase_payments.push({ id: 'P3', family_id: 'famA', receipt_id: 'R2', method: 'tarjeta', amount: 40, bank_transaction_id: null })
    db.bank_transactions.push(tx({ id: 'BT40', amount: 40 }))
    await sync()
    expect(db.purchase_payments.filter((p) => p.bank_transaction_id).length).toBe(0)
    expect(bankExpenses()).toHaveLength(1)
  })

  it('una parte de tarjeta ya enlazada a otro movimiento del banco no se vuelve a usar', async () => {
    mixedPurchase()
    db.purchase_payments[1].bank_transaction_id = 'OTRO'
    db.bank_transactions.push(tx({ id: 'BT40', amount: 40 }))
    await sync()
    expect(db.bank_transactions[0].matched_expense_id).not.toBe('E1')
  })
})

describe('efectivo y tarjeta (gasto completo)', () => {
  it('un gasto pagado en EFECTIVO no se concilia con un cargo del mismo importe', async () => {
    db.expenses.push(expense({ id: 'C1', amount: 8, payment_method: 'efectivo', store: 'Panadería' }))
    db.bank_transactions.push(tx({ id: 'B8', amount: 8, description: 'CAFETERIA LUNA' }))
    await sync()
    expect(db.expenses.find((e) => e.id === 'C1')?.source).toBe('manual')
    expect(bankExpenses()).toHaveLength(1)
  })

  it('el mismo gasto pagado con TARJETA sí se concilia (comportamiento de siempre)', async () => {
    db.expenses.push(expense({ id: 'T1', amount: 8, payment_method: 'tarjeta' }))
    db.bank_transactions.push(tx({ id: 'B8', amount: 8 }))
    await sync()
    expect(db.expenses).toHaveLength(1)
    expect(db.expenses[0].source).toBe('ticket_banco')
  })

  it('un gasto sin forma de pago indicada (datos anteriores) se concilia como siempre', async () => {
    db.expenses.push(expense({ id: 'V1', amount: 8 }))
    db.bank_transactions.push(tx({ id: 'B8', amount: 8 }))
    await sync()
    expect(db.expenses).toHaveLength(1)
    expect(db.expenses[0].source).toBe('ticket_banco')
  })
})

describe('devoluciones registradas a mano y su abono bancario', () => {
  const refund = (o: Row) => expense({ id: 'D1', amount: 10, is_income: true, category: 'Devoluciones', store: null, payment_method: 'tarjeta', ...o })
  const credit = (o: Row = {}) => tx({ id: 'BC', amount: 10, credit_debit: 'CRDT', description: 'ABONO FERRETERIA', ...o })

  it('el abono del banco se une a la devolución registrada: no se crea otro ingreso', async () => {
    db.expenses.push(refund({}))
    db.bank_transactions.push(credit())
    await sync()
    expect(db.expenses).toHaveLength(1)
    expect(db.expenses[0].source).toBe('ticket_banco')
    expect(db.bank_transactions[0].matched_expense_id).toBe('D1')
  })

  it('una devolución en EFECTIVO no se une a ningún abono', async () => {
    db.expenses.push(refund({ payment_method: 'efectivo' }))
    db.bank_transactions.push(credit())
    await sync()
    expect(db.expenses.find((e) => e.id === 'D1')?.source).toBe('manual')
    expect(bankExpenses()).toHaveLength(1)
  })

  it('con dos devoluciones iguales posibles no se elige ninguna', async () => {
    db.expenses.push(refund({}), refund({ id: 'D2' }))
    db.bank_transactions.push(credit())
    await sync()
    expect(db.expenses.filter((e) => e.source === 'manual')).toHaveLength(2)
    expect(bankExpenses()).toHaveLength(1)
  })

  it('un abono fuera de ±14 días o de otro importe no se une', async () => {
    db.expenses.push(refund({ expense_date: '2026-09-01' }))
    db.bank_transactions.push(credit())
    await sync()
    expect(db.expenses.find((e) => e.id === 'D1')?.source).toBe('manual')
  })

  it('un abono ya enlazado a un gasto no se enlaza dos veces', async () => {
    db.expenses.push(refund({}))
    db.bank_transactions.push(credit({ id: 'BX', matched_expense_id: 'D1' }), credit({ id: 'BY' }))
    await sync()
    expect(db.bank_transactions.find((t) => t.id === 'BY')?.matched_expense_id).not.toBe('D1')
  })
})
