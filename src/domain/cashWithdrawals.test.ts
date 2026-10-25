import { describe, expect, it } from 'vitest'
import type { CashMovement } from './cashWallet'
import { checkWithdrawalSplit, isCashWithdrawalText, matchingManualEntries, pendingWithdrawals, planAdoptions } from './cashWithdrawals'
import type { Expense } from './types'

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-20', amount: 100, category: 'Otros', store: 'REINTEGRO CAJERO AUTOMATICO', kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'banco', paymentMethod: null, ...o }) as Expense
const mv = (o: Partial<CashMovement> & Pick<CashMovement, 'id'>): CashMovement => ({ walletId: 'w1', kind: 'in', amount: 100, occurredOn: '2026-10-20', note: null, transferId: null, expenseId: null, ...o })

describe('reconocer una retirada de cajero', () => {
  it.each(['REINTEGRO CAJERO AUTOMÁTICO', 'REINTEGRO CAJERO AUTOMATICO 4041', 'Reintegro en cajero', 'DISPOSICION EFECTIVO CAJERO', 'RETIRADA DE EFECTIVO', 'Extracción de efectivo', 'ATM MADRID'])('«%s» sí', (t) => {
    expect(isCashWithdrawalText(t)).toBe(true)
  })
  it.each(['REINTEGRO HACIENDA', 'COMPRA TARJ. MERCADONA', 'Retirada de fondos del seguro', 'BIZUM A PACO', null, ''])('«%s» no', (t) => {
    expect(isCashWithdrawalText(t)).toBe(false)
  })
})

describe('retiradas por asignar', () => {
  it('solo cargos del banco con aspecto de retirada, sin cartera ni categoría «Retirada de efectivo»', () => {
    const expenses = [
      ex({ id: 'a' }),
      ex({ id: 'b', category: 'Retirada de efectivo' }), // ya clasificada «sin cartera»
      ex({ id: 'c', store: 'MERCADONA' }),
      ex({ id: 'd', source: 'manual' }),
      ex({ id: 'e', isIncome: true }),
      ex({ id: 'f', notes: 'REINTEGRO CAJERO', store: null }),
      ex({ id: 'g' }), // ya enlazada a una cartera
    ]
    expect(pendingWithdrawals(expenses, new Set(['g'])).map((p) => p.expense.id).sort()).toEqual(['a', 'f'])
  })
  it('se puede excluir lo ya gestionado (Movimientos internos) y lo antiguo', () => {
    const expenses = [ex({ id: 'a', expenseDate: '2026-10-20' }), ex({ id: 'old', expenseDate: '2026-05-01' }), ex({ id: 'int', category: 'Transferencias entre cuentas propias' })]
    const out = pendingWithdrawals(expenses, new Set(), { exclude: (e) => e.category === 'Transferencias entre cuentas propias', sinceDate: '2026-08-01' })
    expect(out.map((p) => p.expense.id)).toEqual(['a'])
  })
})

describe('retirada ya registrada a mano: no se duplica la entrada', () => {
  it('una entrada libre del mismo importe y fecha cercana es candidata; una ya vinculada o de otro importe, no', () => {
    const w = ex({ id: 'w' })
    const movements = [mv({ id: 'm1' }), mv({ id: 'm2', amount: 99.99 }), mv({ id: 'm3', expenseId: 'otra' }), mv({ id: 'm4', occurredOn: '2026-09-01' }), mv({ id: 'm5', kind: 'transfer_in' })]
    expect(matchingManualEntries(w, movements).map((m) => m.id)).toEqual(['m1'])
  })
  it('coincidencia segura y única (≤ 3 días): se vincula sola', () => {
    const plan = planAdoptions(pendingWithdrawals([ex({ id: 'w' })], new Set()), [mv({ id: 'm1', occurredOn: '2026-10-19' })])
    expect(plan.auto).toHaveLength(1)
    expect(plan.auto[0].entry.id).toBe('m1')
    expect(plan.suggest).toHaveLength(0)
  })
  it('fecha algo distinta (4-7 días): solo se sugiere, decide la persona', () => {
    const plan = planAdoptions(pendingWithdrawals([ex({ id: 'w' })], new Set()), [mv({ id: 'm1', occurredOn: '2026-10-15' })])
    expect(plan.auto).toHaveLength(0)
    expect(plan.suggest[0].entries.map((m) => m.id)).toEqual(['m1'])
  })
  it('varias entradas posibles o dos retiradas que quieren la misma entrada: nada se vincula solo', () => {
    const two = planAdoptions(pendingWithdrawals([ex({ id: 'w' })], new Set()), [mv({ id: 'm1' }), mv({ id: 'm2', walletId: 'w2' })])
    expect(two.auto).toHaveLength(0)
    expect(two.suggest[0].entries).toHaveLength(2)
    const shared = planAdoptions(pendingWithdrawals([ex({ id: 'w1' }), ex({ id: 'w2', expenseDate: '2026-10-21' })], new Set()), [mv({ id: 'm1' })])
    expect(shared.auto).toHaveLength(0)
    expect(shared.suggest).toHaveLength(2)
  })
  it('sin entradas parecidas no hay nada que vincular', () => {
    expect(planAdoptions(pendingWithdrawals([ex({ id: 'w' })], new Set()), [])).toEqual({ auto: [], suggest: [] })
  })
})

describe('repartir una retirada entre carteras', () => {
  it('una sola cartera con todo el importe', () => {
    expect(checkWithdrawalSplit(100, [{ walletId: 'a', amount: '100' }])).toEqual({ ok: true, parts: [{ walletId: 'a', amount: 100 }], assigned: 100, unassigned: 0 })
  })
  it('reparto parcial: lo que no se asigna queda indicado como efectivo sin cartera', () => {
    expect(checkWithdrawalSplit(100, [{ walletId: 'a', amount: '40' }, { walletId: 'b', amount: '35,50' }, { walletId: 'c', amount: '' }])).toEqual({
      ok: true,
      parts: [{ walletId: 'a', amount: 40 }, { walletId: 'b', amount: 35.5 }],
      assigned: 75.5,
      unassigned: 24.5,
    })
  })
  it('la suma nunca puede superar lo retirado', () => {
    const r = checkWithdrawalSplit(100, [{ walletId: 'a', amount: '70' }, { walletId: 'b', amount: '40' }])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/supera lo retirado/)
  })
  it('importes no válidos, una cartera repetida o ninguna parte se rechazan', () => {
    expect(checkWithdrawalSplit(100, [{ walletId: 'a', amount: 'abc' }]).ok).toBe(false)
    expect(checkWithdrawalSplit(100, [{ walletId: 'a', amount: '-5' }]).ok).toBe(false)
    expect(checkWithdrawalSplit(100, [{ walletId: 'a', amount: '10' }, { walletId: 'a', amount: '20' }]).ok).toBe(false)
    expect(checkWithdrawalSplit(100, [{ walletId: 'a', amount: '' }]).ok).toBe(false)
  })
})
