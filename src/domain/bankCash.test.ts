import { describe, expect, it } from 'vitest'
import { bankCashCandidates, isCashDepositText, previewBankCash } from './bankCash'
import type { Expense } from './types'

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-20', amount: 100, category: 'Otros', store: null, kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'banco', paymentMethod: null, ...o }) as Expense

// Casos reales de la base: el reintegro de 1.200 € ya clasificado «sin cartera», el ingreso de 500 € y compras corrientes que NO deben ofrecerse.
const MOVS = [
  ex({ id: 'r1200', amount: 1200, expenseDate: '2026-10-13', notes: 'REINTEGRO CAJERO AUTOMATICO 5402XXXXXXXX4041 13.10', category: 'Retirada de efectivo' }),
  ex({ id: 'r40', amount: 40, expenseDate: '2026-08-10', notes: 'REINTEGRO CAJERO AUTOMATICO 09.08' }),
  ex({ id: 'd500', amount: 500, isIncome: true, expenseDate: '2026-10-21', notes: 'INGRESO EFECTIVO CAJERO AUTOMATICO 008142380051/' }),
  ex({ id: 'aeat', amount: 312.4, isIncome: true, notes: 'AGENCIA TRIBUTARIA DEVOLUCION' }),
  ex({ id: 'pizza', amount: 23.5, store: 'PIZZERIA ROMA', notes: 'COMPRA TARJ. PIZZERIA ROMA' }),
  ex({ id: 'amazon', amount: 41.99, store: 'AMAZON', notes: 'COMPRA TARJ. AMAZON' }),
  ex({ id: 'super', amount: 62.1, store: 'MERCADONA', notes: 'COMPRA TARJ. MERCADONA' }),
  ex({ id: 'manual', amount: 20, source: 'manual', notes: 'REINTEGRO CAJERO' }),
]

describe('reconocer un ingreso de efectivo', () => {
  it.each(['INGRESO EFECTIVO CAJERO AUTOMATICO 008142380051/', 'Ingreso en efectivo', 'INGRESO DE EFECTIVO'])('«%s» sí', (t) => expect(isCashDepositText(t)).toBe(true))
  it.each(['AGENCIA TRIBUTARIA INGRESO', 'ABONO BIZUM DE FRANCISCO', 'TRANSFERENCIA NÓMINA', null])('«%s» no', (t) => expect(isCashDepositText(t)).toBe(false))
})

describe('Banco → Cartera: solo retiradas de cajero', () => {
  const { recognized, manual } = bankCashCandidates(MOVS, new Set(), 'toWallet')
  it('ofrece los reintegros (incluida la de 1.200 € ya clasificada sin cartera) y ninguna compra ni ingreso', () => {
    expect(recognized.map((c) => c.expense.id)).toEqual(['r1200', 'r40'])
    expect(recognized[0].classifiedWithoutWallet).toBe(true)
    expect(recognized[1].classifiedWithoutWallet).toBe(false)
  })
  it('sin búsqueda no hay lista manual: una pizzería o Amazon nunca se ofrecen solas', () => {
    expect(manual).toEqual([])
  })
  it('lo ya enlazado a una cartera no vuelve a salir', () => {
    expect(bankCashCandidates(MOVS, new Set(['r1200']), 'toWallet').recognized.map((c) => c.expense.id)).toEqual(['r40'])
  })
})

describe('Cartera → Banco: solo ingresos de efectivo', () => {
  it('ofrece el ingreso de 500 € y no el de la Agencia Tributaria', () => {
    const { recognized } = bankCashCandidates(MOVS, new Set(), 'toBank')
    expect(recognized.map((c) => c.expense.id)).toEqual(['d500'])
  })
})

describe('búsqueda manual controlada', () => {
  it('por importe aproximado encuentra un cargo ambiguo y exige confirmar (recognized = false)', () => {
    const { manual } = bankCashCandidates(MOVS, new Set(), 'toWallet', { amount: '62,10' })
    expect(manual.map((c) => c.expense.id)).toEqual(['super'])
    expect(manual[0].recognized).toBe(false)
  })
  it('por texto y por fechas; en la otra dirección solo aparecen ingresos', () => {
    expect(bankCashCandidates(MOVS, new Set(), 'toWallet', { query: 'amazon' }).manual.map((c) => c.expense.id)).toEqual(['amazon'])
    expect(bankCashCandidates(MOVS, new Set(), 'toBank', { query: 'tributaria' }).manual.map((c) => c.expense.id)).toEqual(['aeat'])
    expect(bankCashCandidates(MOVS, new Set(), 'toWallet', { from: '2026-10-01', to: '2026-10-31' }).manual.map((c) => c.expense.id)).toEqual(['pizza', 'amazon', 'super'])
  })
  it('un movimiento apuntado a mano (no del banco) no se ofrece nunca', () => {
    const all = bankCashCandidates(MOVS, new Set(), 'toWallet', { query: 'cajero' })
    expect([...all.recognized, ...all.manual].some((c) => c.expense.id === 'manual')).toBe(false)
  })
  it('un importe no válido no devuelve nada', () => {
    expect(bankCashCandidates(MOVS, new Set(), 'toWallet', { amount: 'abc' }).manual).toEqual([])
  })
})

describe('vista previa antes de confirmar', () => {
  it('Banco → Cartera sube la cartera y avisa de que el banco ya bajó', () => {
    const p = previewBankCash('toWallet', 1200, 'Jennifer', 86.5)
    expect(p.walletAfter).toBe(1286.5)
    expect(p.negative).toBe(false)
    expect(p.walletLine).toContain('sube')
    expect(p.bankLine).toContain('ya bajó')
  })
  it('Cartera → Banco baja la cartera y avisa si quedaría en negativo (el caso de los 500 €)', () => {
    const p = previewBankCash('toBank', 500, 'Jennifer', 86.5)
    expect(p.walletAfter).toBe(-413.5)
    expect(p.negative).toBe(true)
    expect(p.bankLine).toContain('ya subió')
  })
})
