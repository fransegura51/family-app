// Compras manuales (sin ticket) contra una base de datos de mentira con aislamiento por familia (como la RLS real):
// una sola compra y un solo gasto, justificante posterior sobre la misma fila, efectivo que no se une al banco, y nada cruza entre familias.
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db: Record<string, Row[]> = { profiles: [], expenses: [], receipts: [] }
let me = { id: 'u1', family: 'famA' }
let nextId = 1
let failReceiptInsert = false
const removedFiles: string[] = []

function builder(table: string) {
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | null = null
  const filters: ((r: Row) => boolean)[] = []
  const api: Record<string, unknown> = {}
  const visible = () => (table === 'profiles' ? db[table] : db[table].filter((r) => r.family_id === me.family)) // RLS simulada
  const run = () => {
    const rows = visible().filter((r) => filters.every((f) => f(r)))
    if (op === 'insert') {
      if (table === 'receipts' && failReceiptInsert) return { data: null, error: new Error('receipt insert failed') }
      const row: Row = { id: `id${nextId++}`, ...payload }
      if (table !== 'profiles' && row.family_id !== me.family) return { data: null, error: new Error('RLS') }
      db[table].push(row)
      return { data: [row], error: null }
    }
    if (op === 'update') {
      rows.forEach((r) => Object.assign(r, payload))
      return { data: rows, error: null }
    }
    if (op === 'delete') {
      db[table] = db[table].filter((r) => !rows.includes(r))
      return { data: rows, error: null }
    }
    return { data: rows, error: null }
  }
  const chain = (name: string, fn: (...a: never[]) => void) => {
    api[name] = (...a: never[]) => {
      fn(...a)
      return api
    }
  }
  chain('select', () => {})
  chain('insert', ((p: Row) => ((op = 'insert'), (payload = p))) as never)
  chain('update', ((p: Row) => ((op = 'update'), (payload = p))) as never)
  chain('delete', (() => (op = 'delete')) as never)
  chain('eq', ((c: string, v: unknown) => filters.push((r) => r[c] === v)) as never)
  chain('in', ((c: string, v: unknown[]) => filters.push((r) => v.includes(r[c]))) as never)
  chain('gte', ((c: string, v: string) => filters.push((r) => String(r[c]) >= v)) as never)
  chain('lte', ((c: string, v: string) => filters.push((r) => String(r[c]) <= v)) as never)
  chain('is', ((c: string, v: unknown) => filters.push((r) => (r[c] ?? null) === v)) as never)
  chain('order', () => {})
  chain('range', () => {})
  api.single = () => {
    const out = run()
    const first = (out.data as Row[] | null)?.[0]
    return Promise.resolve(first ? { data: first, error: null } : { data: null, error: out.error ?? new Error('no rows') })
  }
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve)
  return api
}

vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    from: (t: string) => builder(t),
    auth: { getUser: async () => ({ data: { user: { id: me.id } } }) },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async (p: string[]) => (removedFiles.push(...p), { error: null }) }) },
  },
}))
vi.mock('@/domain/imageCompression', () => ({ compressImageFile: async (f: File) => f }))
vi.mock('@/data/paginate', () => ({ fetchAllRows: async (q: (a: number, b: number) => Promise<{ data: Row[] }>) => (await q(0, 999)).data }))

import { attachReceiptFile, listManualPurchasesWithoutTicket, updateReceipt, uploadReceipt } from './receipts'

const photo = () => new File(['x'], 'ticket.jpg', { type: 'image/jpeg' })
const quick = (o: Partial<Parameters<typeof uploadReceipt>[0]> = {}) =>
  uploadReceipt({ file: null, isManual: true, paymentMethod: 'efectivo', store: 'Panadería', receiptDate: '2026-10-23', totalAmount: 8, category: null, purchasedByMemberId: 'mA', ...o })

beforeEach(() => {
  db.profiles = [{ id: 'u1', family_id: 'famA' }, { id: 'u2', family_id: 'famB' }]
  db.expenses = []
  db.receipts = []
  me = { id: 'u1', family: 'famA' }
  nextId = 1
  failReceiptInsert = false
  removedFiles.length = 0
})

describe('compra rápida sin ticket', () => {
  it('«Panadería — 8 € — Efectivo» crea UNA compra y UN gasto manual enlazados, con quien pagó', async () => {
    const id = await quick()
    expect(db.expenses).toHaveLength(1)
    expect(db.expenses[0]).toMatchObject({ family_id: 'famA', amount: 8, store: 'Panadería', kind: 'real', source: 'manual' })
    expect(db.receipts).toHaveLength(1)
    expect(db.receipts[0]).toMatchObject({ id, storage_path: null, is_manual: true, payment_method: 'efectivo', purchased_by_member_id: 'mA', expense_id: db.expenses[0].id, total_amount: 8 })
  })

  it('un ticket normal sigue sin ser manual y su gasto sigue siendo «ticket»', async () => {
    await uploadReceipt({ file: photo(), store: 'Mercadona', receiptDate: '2026-10-23', totalAmount: 20, category: null, purchasedByMemberId: null })
    expect(db.receipts[0]).toMatchObject({ is_manual: false, payment_method: null })
    expect(db.receipts[0].storage_path).toEqual(expect.stringContaining('famA/'))
    expect(db.expenses[0].source).toBe('ticket')
  })

  it('si falla guardar la compra no queda un gasto huérfano', async () => {
    failReceiptInsert = true
    await expect(quick()).rejects.toThrow()
    expect(db.expenses).toHaveLength(0)
  })
})

describe('integración con el banco: sin doble contabilización', () => {
  const bankExpense = (o: Row = {}) => ({ id: 'bank1', family_id: 'famA', expense_date: '2026-10-22', amount: 8, store: 'PANADERIA X', kind: 'real', source: 'banco', is_income: false, ...o })

  it('pagada con tarjeta y el banco ya la trajo: se une a ese gasto (pasa a ticket_banco), no se crea otro', async () => {
    db.expenses = [bankExpense()]
    await quick({ paymentMethod: 'tarjeta' })
    expect(db.expenses).toHaveLength(1)
    expect(db.expenses[0]).toMatchObject({ id: 'bank1', source: 'ticket_banco' })
    expect(db.receipts[0].expense_id).toBe('bank1')
  })

  it('pagada en efectivo NUNCA se une a un apunte del banco aunque coincida el importe: son dos gastos distintos', async () => {
    db.expenses = [bankExpense()]
    await quick({ paymentMethod: 'efectivo' })
    expect(db.expenses).toHaveLength(2)
    expect(db.expenses.find((e) => e.id === 'bank1')?.source).toBe('banco')
  })

  it('dos compras manuales iguales (mismo pan, misma semana) siguen siendo dos compras y dos gastos', async () => {
    await quick({ paymentMethod: 'tarjeta' })
    await quick({ paymentMethod: 'tarjeta' })
    expect(db.expenses).toHaveLength(2)
    expect(db.receipts).toHaveLength(2)
  })
})

describe('justificante posterior', () => {
  it('añade la foto a la MISMA compra: sigue habiendo una compra y un gasto', async () => {
    const id = await quick()
    expect(await attachReceiptFile(id, photo())).toBe(true)
    expect(db.receipts).toHaveLength(1)
    expect(db.expenses).toHaveLength(1)
    expect(db.receipts[0].storage_path).toEqual(expect.stringContaining('famA/'))
    expect(db.receipts[0]).toMatchObject({ store: 'Panadería', total_amount: 8, purchased_by_member_id: 'mA', is_manual: true })
  })

  it('si ya tiene justificante no lo pisa', async () => {
    const id = await quick()
    await attachReceiptFile(id, photo())
    const first = db.receipts[0].storage_path
    expect(await attachReceiptFile(id, photo())).toBe(false)
    expect(db.receipts[0].storage_path).toBe(first)
  })

  it('las compras manuales sin ticket se pueden listar para ofrecerlas al subir un ticket', async () => {
    const manual = await quick()
    await uploadReceipt({ file: photo(), store: 'Mercadona', receiptDate: '2026-10-23', totalAmount: 20, category: null, purchasedByMemberId: null })
    expect((await listManualPurchasesWithoutTicket()).map((r) => r.id)).toEqual([manual])
  })
})

describe('aislamiento entre familias', () => {
  it('otra familia no ve ni puede completar la compra manual', async () => {
    const id = await quick()
    me = { id: 'u2', family: 'famB' }
    expect(await listManualPurchasesWithoutTicket()).toEqual([])
    await expect(attachReceiptFile(id, photo())).rejects.toThrow()
    expect(db.receipts[0].storage_path).toBeNull()
  })

  it('cada familia guarda su compra con su family_id y su gasto', async () => {
    await quick()
    me = { id: 'u2', family: 'famB' }
    await quick({ purchasedByMemberId: 'mB' })
    expect(db.receipts.map((r) => r.family_id).sort()).toEqual(['famA', 'famB'])
    expect(db.expenses.map((r) => r.family_id).sort()).toEqual(['famA', 'famB'])
  })
})

describe('efectivo, pagos mixtos y vínculo con Economía (capa de datos)', () => {
  const bankExpense = (o: Row = {}) => ({ id: 'bank1', family_id: 'famA', expense_date: '2026-10-22', amount: 8, store: 'PANADERIA X', kind: 'real', source: 'banco', is_income: false, ...o })

  it('el gasto de una compra en efectivo lleva payment_method = efectivo (el sincronizador del banco nunca lo une a un cargo)', async () => {
    await quick({ paymentMethod: 'efectivo' })
    expect(db.expenses[0]).toMatchObject({ source: 'manual', payment_method: 'efectivo' })
    expect(db.receipts[0]).toMatchObject({ payment_method: 'efectivo' })
  })

  it('un TICKET pagado en efectivo tampoco se une a un cargo bancario del mismo importe', async () => {
    db.expenses = [bankExpense()]
    await uploadReceipt({ file: photo(), store: 'Panadería', receiptDate: '2026-10-23', totalAmount: 8, category: null, purchasedByMemberId: null, paymentMethod: 'efectivo' })
    expect(db.expenses).toHaveLength(2)
    expect(db.expenses.find((e) => e.id === 'bank1')?.source).toBe('banco')
  })

  it('un TICKET sin forma de pago indicada se une al cargo del banco como siempre (compatibilidad)', async () => {
    db.expenses = [bankExpense()]
    await uploadReceipt({ file: photo(), store: 'Panadería', receiptDate: '2026-10-23', totalAmount: 8, category: null, purchasedByMemberId: null })
    expect(db.expenses).toHaveLength(1)
    expect(db.expenses[0].source).toBe('ticket_banco')
  })

  it('pago mixto: la compra queda como «mixto», con UN gasto por el total y sin unirse a un cargo del mismo total', async () => {
    db.expenses = [bankExpense({ amount: 60 })]
    await quick({ totalAmount: 60, paymentMethod: 'mixto' })
    expect(db.expenses).toHaveLength(2) // el cargo del banco sigue siendo suyo; la compra, un solo gasto de 60
    expect(db.expenses.filter((e) => e.source === 'manual')).toHaveLength(1)
    expect(db.expenses.find((e) => e.source === 'manual')).toMatchObject({ amount: 60, payment_method: 'mixto' })
    expect(db.receipts[0].payment_method).toBe('mixto')
  })

  it('la compra manual puede usar el gasto que YA estaba en Economía: no se crea otro', async () => {
    db.expenses = [{ id: 'eco1', family_id: 'famA', expense_date: '2026-10-23', amount: 8, store: 'Panadería', kind: 'real', source: 'manual', is_income: false, payment_method: null }]
    const id = await quick({ paymentMethod: 'efectivo', linkExpenseId: 'eco1' })
    expect(db.expenses).toHaveLength(1)
    expect(db.receipts.find((r) => r.id === id)?.expense_id).toBe('eco1')
    expect(db.expenses[0].payment_method).toBe('efectivo') // y se le anota cómo se pagó
  })

  it('un gasto que ya tenía forma de pago no se pisa al vincularlo', async () => {
    db.expenses = [{ id: 'eco1', family_id: 'famA', expense_date: '2026-10-23', amount: 8, store: 'Panadería', kind: 'real', source: 'manual', is_income: false, payment_method: 'tarjeta' }]
    await quick({ paymentMethod: 'efectivo', linkExpenseId: 'eco1' })
    expect(db.expenses[0].payment_method).toBe('tarjeta')
  })

  it('cambiar la forma de pago al editar actualiza también el gasto de Economía', async () => {
    const id = await quick({ paymentMethod: 'tarjeta' })
    await updateReceipt(id, { store: 'Panadería', receiptDate: '2026-10-23', totalAmount: 8, purchasedByMemberId: 'mA', paymentMethod: 'efectivo' })
    expect(db.expenses[0].payment_method).toBe('efectivo')
    expect(db.receipts[0].payment_method).toBe('efectivo')
  })

  it('editar sin tocar la forma de pago (undefined) no la cambia', async () => {
    const id = await quick({ paymentMethod: 'tarjeta' })
    await updateReceipt(id, { store: 'Panadería', receiptDate: '2026-10-23', totalAmount: 9, purchasedByMemberId: 'mA' })
    expect(db.expenses[0]).toMatchObject({ amount: 9, payment_method: 'tarjeta' })
  })
})
