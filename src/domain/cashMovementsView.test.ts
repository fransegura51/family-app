import { describe, expect, it } from 'vitest'
import type { CashMovement } from './cashWallet'
import { allWalletLinkedExpenseIds, bankTransferMovementOf, CASH_WITHOUT_WALLET, cashOnlyMovements, expenseIdsOfWallet, filterExpensesByCashView, isCashWithoutWallet, mergeCashListItems, walletCardInfo } from './cashMovementsView'
import type { Expense } from './types'

const mv = (o: Partial<CashMovement> & Pick<CashMovement, 'id' | 'walletId'>): CashMovement => ({ kind: 'in', amount: 10, occurredOn: '2026-10-20', note: null, transferId: null, expenseId: null, ...o })
const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense => ({ familyId: 'f', expenseDate: '2026-10-20', amount: 13.5, category: null, store: null, kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'manual', paymentMethod: null, ...o }) as Expense

// Caso real de la validación: compra de 13,50 € pagada desde la cartera de Jennifer (100 € → 86,50 €).
const movements: CashMovement[] = [
  mv({ id: 'm0', walletId: 'jenni', kind: 'in', amount: 100, occurredOn: '2026-10-24', note: 'saldo' }),
  mv({ id: 'm1', walletId: 'jenni', kind: 'payment', amount: -13.5, occurredOn: '2026-10-25', expenseId: 'compra' }),
  mv({ id: 'm2', walletId: 'jenni', kind: 'transfer_in', amount: 50, occurredOn: '2026-10-22', expenseId: 'retirada' }),
  mv({ id: 'm3', walletId: 'jenni', kind: 'transfer_out', amount: -5, occurredOn: '2026-10-23', transferId: 't1' }),
  mv({ id: 'm4', walletId: 'familiar', kind: 'transfer_in', amount: 5, occurredOn: '2026-10-23', transferId: 't1' }),
  mv({ id: 'm5', walletId: 'familiar', kind: 'payment', amount: -4, expenseId: 'compra-familiar' }),
]
const expenses = [
  ex({ id: 'compra', paymentMethod: 'efectivo' }),
  ex({ id: 'retirada', source: 'banco', amount: 50 }),
  ex({ id: 'compra-familiar', paymentMethod: 'efectivo', amount: 4 }),
  ex({ id: 'sin-cartera', paymentMethod: 'efectivo', amount: 8 }),
  ex({ id: 'tarjeta', paymentMethod: 'tarjeta', amount: 20 }),
  ex({ id: 'banco', source: 'banco', amount: 30 }),
]

describe('movimientos de una cartera en Movimientos', () => {
  it('una cartera ve solo los gastos enlazados a SUS movimientos (compra y retirada del banco), no los de otra', () => {
    expect([...expenseIdsOfWallet(movements, 'jenni')].sort()).toEqual(['compra', 'retirada'])
    expect(filterExpensesByCashView(expenses, movements, 'jenni').map((e) => e.id)).toEqual(['compra', 'retirada'])
    expect(filterExpensesByCashView(expenses, movements, 'familiar').map((e) => e.id)).toEqual(['compra-familiar'])
  })

  it('sin filtro (null) NO se oculta nada: tampoco el efectivo sin cartera, ni la tarjeta ni el banco', () => {
    expect(filterExpensesByCashView(expenses, movements, null).map((e) => e.id)).toEqual(expenses.map((e) => e.id))
  })

  it('«efectivo sin cartera» enseña los gastos en efectivo que no pasan por ninguna cartera', () => {
    expect(filterExpensesByCashView(expenses, movements, CASH_WITHOUT_WALLET).map((e) => e.id)).toEqual(['sin-cartera'])
    expect(isCashWithoutWallet(expenses[3], allWalletLinkedExpenseIds(movements))).toBe(true)
    expect(isCashWithoutWallet(expenses[0], allWalletLinkedExpenseIds(movements))).toBe(false)
    expect(isCashWithoutWallet(expenses[4], allWalletLinkedExpenseIds(movements))).toBe(false)
  })

  it('el filtro nunca crea ni duplica registros: devuelve los mismos objetos', () => {
    const out = filterExpensesByCashView(expenses, movements, 'jenni')
    expect(out[0]).toBe(expenses[0])
    expect(expenses).toHaveLength(6)
  })

  it('los movimientos propios de la cartera (entrada, traspaso) salen aparte, sin gasto, dentro del periodo y del más reciente al más antiguo', () => {
    const own = cashOnlyMovements(movements, 'jenni', '2026-10-01', '2026-10-31')
    expect(own.map((m) => m.id)).toEqual(['m0', 'm3'])
    expect(cashOnlyMovements(movements, 'jenni', '2026-10-24', '2026-10-31').map((m) => m.id)).toEqual(['m0'])
    // el movimiento de pago y el de la retirada ya son filas de Movimientos: no se repiten
    expect(own.some((m) => m.expenseId != null)).toBe(false)
  })

  it('la lista combinada va por fecha (más reciente primero) y conserva el orden de los gastos del mismo día', () => {
    const items = mergeCashListItems([ex({ id: 'a', expenseDate: '2026-10-25' }), ex({ id: 'b', expenseDate: '2026-10-22' })], [mv({ id: 'c1', walletId: 'jenni', occurredOn: '2026-10-24' }), mv({ id: 'c2', walletId: 'jenni', occurredOn: '2026-10-22' })])
    expect(items.map((i) => (i.type === 'expense' ? i.expense.id : i.movement.id))).toEqual(['a', 'c1', 'b', 'c2'])
  })

  it('la retirada del banco se puede deshacer desde la fila: se encuentra su movimiento de traspaso', () => {
    expect(bankTransferMovementOf(movements, 'jenni', 'retirada')?.id).toBe('m2')
    expect(bankTransferMovementOf(movements, 'jenni', 'compra')).toBeNull() // una compra no se deshace como traspaso
    expect(bankTransferMovementOf(movements, 'familiar', 'retirada')).toBeNull()
  })

  it('la tarjeta distingue cartera personal (con titular) y familiar', () => {
    const members = [{ id: 'j', name: 'Jennifer' }]
    expect(walletCardInfo({ name: 'Cartera de Jennifer', ownerMemberId: 'j' }, members)).toEqual({ title: 'Cartera de Jennifer', kind: 'personal', holder: 'Jennifer' })
    expect(walletCardInfo({ name: 'Cartera familiar', ownerMemberId: null }, members)).toEqual({ title: 'Cartera familiar', kind: 'familiar', holder: null })
    expect(walletCardInfo({ name: 'X', ownerMemberId: 'otra' }, members).holder).toBeNull()
  })
})
