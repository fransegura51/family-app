// CARTERAS DE EFECTIVO DENTRO DE MOVIMIENTOS. Lógica pura de la vista filtrada por cartera.
//
// No hay un segundo historial económico: un movimiento de una cartera es de dos tipos.
// - Con gasto/ingreso enlazado (`expenseId`): una compra pagada desde la cartera, una devolución a la cartera o una retirada del banco. Ese
//   registro YA es una fila de Movimientos (tabla `expenses`) y se enseña con la misma fila de siempre.
// - Sin gasto enlazado: entrada, salida, ajuste de saldo o traspaso entre carteras. No son ingreso ni gasto, así que no existen en `expenses`;
//   se enseñan como filas del mismo estilo, solo dentro de la vista de esa cartera.
import type { CashMovement, CashWallet } from './cashWallet'
import type { Expense, FamilyMember } from './types'

/** Valor del filtro «efectivo sin cartera»: gastos pagados en efectivo que no están enlazados a ninguna cartera. */
export const CASH_WITHOUT_WALLET = 'sin-cartera'

/** Ids de gastos/ingresos enlazados a algún movimiento de ESTA cartera. */
export function expenseIdsOfWallet(movements: readonly CashMovement[], walletId: string): Set<string> {
  return new Set(movements.filter((m) => m.walletId === walletId && m.expenseId != null).map((m) => m.expenseId as string))
}

/** Ids de gastos/ingresos enlazados a cualquier cartera. */
export function allWalletLinkedExpenseIds(movements: readonly CashMovement[]): Set<string> {
  return new Set(movements.filter((m) => m.expenseId != null).map((m) => m.expenseId as string))
}

/** Gasto pagado en efectivo que no pasa por ninguna cartera (el efectivo es opcional: sigue siendo un gasto normal). */
export function isCashWithoutWallet(expense: Pick<Expense, 'id' | 'paymentMethod' | 'isIncome'>, linkedIds: ReadonlySet<string>): boolean {
  return expense.paymentMethod === 'efectivo' && !linkedIds.has(expense.id)
}

/**
 * Filtro de Movimientos por cartera. `view` null = todos (no se oculta nada, tampoco el efectivo sin cartera);
 * `CASH_WITHOUT_WALLET` = solo el efectivo sin cartera; cualquier otro valor = el id de una cartera.
 */
export function filterExpensesByCashView<T extends Pick<Expense, 'id' | 'paymentMethod' | 'isIncome'>>(expenses: readonly T[], movements: readonly CashMovement[], view: string | null): T[] {
  if (view == null) return [...expenses]
  if (view === CASH_WITHOUT_WALLET) {
    const linked = allWalletLinkedExpenseIds(movements)
    return expenses.filter((e) => isCashWithoutWallet(e, linked))
  }
  const ids = expenseIdsOfWallet(movements, view)
  return expenses.filter((e) => ids.has(e.id))
}

/** Movimientos de la cartera sin gasto enlazado (entrada, salida, ajuste, traspaso), dentro del periodo, del más reciente al más antiguo. */
export function cashOnlyMovements(movements: readonly CashMovement[], walletId: string, from: string, to: string): CashMovement[] {
  return movements
    .filter((m) => m.walletId === walletId && m.expenseId == null && m.occurredOn >= from && m.occurredOn <= to)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
}

export type CashListItem = { type: 'expense'; date: string; expense: Expense } | { type: 'cash'; date: string; movement: CashMovement }

/** Lista única (mismo orden por fecha que Movimientos): gastos enlazados + movimientos propios de la cartera. */
export function mergeCashListItems(expenses: readonly Expense[], cashMovements: readonly CashMovement[]): CashListItem[] {
  const items: CashListItem[] = [
    ...expenses.map((expense) => ({ type: 'expense' as const, date: expense.expenseDate, expense })),
    ...cashMovements.map((movement) => ({ type: 'cash' as const, date: movement.occurredOn, movement })),
  ]
  // Estable: a igual fecha, los gastos conservan el orden que ya traían.
  return items.map((it, i) => ({ it, i })).sort((a, b) => b.it.date.localeCompare(a.it.date) || a.i - b.i).map((x) => x.it)
}

/** Para «Deshacer» una retirada del banco: movimiento de traspaso enlazado a ese gasto en esa cartera. */
export function bankTransferMovementOf(movements: readonly CashMovement[], walletId: string, expenseId: string): CashMovement | null {
  return movements.find((m) => m.walletId === walletId && m.expenseId === expenseId && (m.kind === 'transfer_in' || m.kind === 'transfer_out')) ?? null
}

export interface WalletCardInfo {
  title: string
  /** «Personal» o «Familiar». */
  kind: 'personal' | 'familiar'
  holder: string | null
}

export function walletCardInfo(wallet: Pick<CashWallet, 'name' | 'ownerMemberId'>, members: readonly Pick<FamilyMember, 'id' | 'name'>[]): WalletCardInfo {
  if (wallet.ownerMemberId == null) return { title: wallet.name, kind: 'familiar', holder: null }
  return { title: wallet.name, kind: 'personal', holder: members.find((m) => m.id === wallet.ownerMemberId)?.name ?? null }
}
