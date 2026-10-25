import { supabase } from '@/data/supabaseClient'
import type { CashMovement, CashMovementKind, CashWallet } from '@/domain/cashWallet'
import type { PaymentLeg } from '@/domain/purchasePayments'
import { toRpcPayments } from '@/domain/purchasePayments'

// Efectivo, pagos mixtos, devoluciones y vínculo con el banco (migración 0312). Todo pasa por RLS o por funciones del servidor que
// comprueban permisos; este archivo solo traduce. Los errores del servidor llegan como objetos sin `instanceof Error`: usar errorMessage().

export async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return data.family_id
}

/** Texto comprensible de un error de las funciones del servidor («cash_transfer: no puedes…» → «no puedes…»). */
export function cashErrorText(err: unknown, fallback: string): string {
  const message = typeof err === 'object' && err != null && 'message' in err ? String((err as { message: unknown }).message) : ''
  const m = message.match(/^[a-z_]+: (.+)$/)
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : fallback
}

// ─── Carteras ───

export async function listWallets(): Promise<CashWallet[]> {
  const [{ data: wallets, error }, { data: balances }] = await Promise.all([
    supabase.from('cash_wallets').select('id, name, owner_member_id, opening_balance, archived_at, created_at').order('created_at'),
    supabase.from('cash_wallet_balances').select('wallet_id, balance'),
  ])
  if (error) throw error
  const byId = new Map((balances ?? []).map((b) => [b.wallet_id as string, Number(b.balance)]))
  return (wallets ?? []).map((w) => ({
    id: w.id,
    name: w.name,
    ownerMemberId: w.owner_member_id,
    openingBalance: Number(w.opening_balance),
    archivedAt: w.archived_at,
    createdAt: w.created_at ?? null,
    balance: byId.get(w.id) ?? Number(w.opening_balance),
  }))
}

/** Lista sin lanzar: si 0312 aún no está aplicada o no hay acceso a «dinero», el efectivo simplemente no se ofrece. */
export async function listWalletsSafe(): Promise<CashWallet[]> {
  try {
    return await listWallets()
  } catch {
    return []
  }
}

export async function createWallet(input: { name: string; ownerMemberId: string | null; openingBalance: number }): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('cash_wallets').insert({ family_id: familyId, name: input.name.trim(), owner_member_id: input.ownerMemberId, opening_balance: input.openingBalance })
  if (error) throw error
}

export async function archiveWallet(id: string): Promise<void> {
  const { error } = await supabase.from('cash_wallets').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function listMovements(walletId: string): Promise<CashMovement[]> {
  const { data, error } = await supabase
    .from('cash_movements')
    .select('id, wallet_id, kind, amount, occurred_on, note, transfer_id, expense_id')
    .eq('wallet_id', walletId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    walletId: m.wallet_id,
    kind: m.kind as CashMovementKind,
    amount: Number(m.amount),
    occurredOn: m.occurred_on,
    note: m.note,
    transferId: m.transfer_id,
    expenseId: m.expense_id,
  }))
}

/** Todos los movimientos de todas las carteras visibles (para filtrar Movimientos por cartera). Sin lanzar: sin carteras o sin 0312 no hay nada que enseñar. */
export async function listAllMovementsSafe(): Promise<CashMovement[]> {
  try {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('id, wallet_id, kind, amount, occurred_on, note, transfer_id, expense_id')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(2000)
    if (error) return []
    return (data ?? []).map((m) => ({
      id: m.id,
      walletId: m.wallet_id,
      kind: m.kind as CashMovementKind,
      amount: Number(m.amount),
      occurredOn: m.occurred_on,
      note: m.note,
      transferId: m.transfer_id,
      expenseId: m.expense_id,
    }))
  } catch {
    return []
  }
}

export async function renameWallet(id: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('cash_wallet: ponle un nombre')
  const { error } = await supabase.from('cash_wallets').update({ name: clean }).eq('id', id)
  if (error) throw error
}

export async function addMovement(input: { walletId: string; kind: 'in' | 'out' | 'adjust'; delta: number; note: string; date: string }): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase.from('cash_movements').insert({ family_id: familyId, wallet_id: input.walletId, kind: input.kind, amount: input.delta, note: input.note.trim() || null, occurred_on: input.date })
  if (error) throw error
}

export async function deleteMovement(id: string): Promise<void> {
  const { error } = await supabase.from('cash_movements').delete().eq('id', id)
  if (error) throw error
}

export async function transferCash(input: { from: string; to: string; amount: number; date: string; note: string }): Promise<void> {
  const { error } = await supabase.rpc('cash_transfer', { p_from: input.from, p_to: input.to, p_amount: input.amount, p_date: input.date, p_note: input.note.trim() || null })
  if (error) throw error
}

/** Marca un apunte bancario ya sincronizado (p. ej. una retirada de cajero) como traspaso con la cartera: no es gasto ni ingreso. */
export async function linkBankExpenseToWallet(walletId: string, expenseId: string): Promise<void> {
  const { error } = await supabase.rpc('cash_link_bank_expense', { p_wallet: walletId, p_expense: expenseId })
  if (error) throw error
}

export async function unlinkBankMovement(movementId: string): Promise<void> {
  const { error } = await supabase.rpc('cash_unlink_bank_expense', { p_movement: movementId })
  if (error) throw error
}

// ─── Pagos de una compra ───

export async function setPurchasePayments(receiptId: string, legs: readonly PaymentLeg[], paidByMemberId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_purchase_payments', { p_receipt: receiptId, p_payments: toRpcPayments(legs, paidByMemberId) })
  if (error) throw error
}

export interface PurchasePaymentRow {
  id: string
  receiptId: string
  method: string
  amount: number
  walletId: string | null
  bankTransactionId: string | null
}

/** Pagos de las compras (sin lanzar: sin 0312 no hay pagos que enseñar). */
export async function listPurchasePayments(): Promise<PurchasePaymentRow[]> {
  try {
    const { data, error } = await supabase.from('purchase_payments').select('id, receipt_id, method, amount, wallet_id, bank_transaction_id')
    if (error) return []
    return (data ?? []).map((p) => ({ id: p.id, receiptId: p.receipt_id, method: p.method, amount: Number(p.amount), walletId: p.wallet_id, bankTransactionId: p.bank_transaction_id }))
  } catch {
    return []
  }
}

// ─── Devoluciones ───

export async function registerPurchaseRefund(input: { receiptId: string; amount: number; date: string; destination: string; walletId: string | null; note: string }): Promise<void> {
  const { error } = await supabase.rpc('register_purchase_refund', {
    p_receipt: input.receiptId,
    p_amount: input.amount,
    p_date: input.date,
    p_destination: input.destination,
    p_wallet: input.walletId,
    p_note: input.note.trim() || null,
  })
  if (error) throw error
}

export interface PurchaseRefundRow {
  id: string
  receiptId: string
  amount: number
  destination: string
  walletId: string | null
  createdAt: string
}

export async function listPurchaseRefunds(): Promise<PurchaseRefundRow[]> {
  try {
    const { data, error } = await supabase.from('purchase_refunds').select('id, receipt_id, amount, destination, wallet_id, created_at')
    if (error) return []
    return (data ?? []).map((r) => ({ id: r.id, receiptId: r.receipt_id, amount: Number(r.amount), destination: r.destination, walletId: r.wallet_id, createdAt: r.created_at }))
  } catch {
    return []
  }
}

// Gastos que ya tienen un movimiento de cartera enlazado (traspaso con el banco o pago en efectivo): no se ofrecen para unir ni quitar.
export async function listCashLinkedExpenseIds(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from('cash_movements').select('expense_id').not('expense_id', 'is', null)
    if (error) return new Set()
    return new Set((data ?? []).map((m) => m.expense_id as string))
  } catch {
    return new Set()
  }
}

// ─── Vínculo con el banco y duplicados ───

/** Vincula la compra con su pago del banco. Devuelve el id del registro para poder deshacerlo (restoreEconomyLog). El movimiento bancario original se conserva. */
export async function linkPurchaseToBank(purchaseExpenseId: string, bankExpenseId: string, paymentId: string | null = null): Promise<string> {
  const { data, error } = await supabase.rpc('link_purchase_to_bank_expense', { p_purchase_expense: purchaseExpenseId, p_bank_expense: bankExpenseId, p_payment: paymentId })
  if (error) throw error
  return data as string
}

/** Retira un gasto duplicado propio (nunca un apunte del banco). Devuelve el id del registro para poder deshacerlo. */
export async function removeDuplicateExpense(keepExpenseId: string, removeExpenseId: string): Promise<string> {
  const { data, error } = await supabase.rpc('remove_duplicate_expense', { p_keep: keepExpenseId, p_remove: removeExpenseId })
  if (error) throw error
  return data as string
}

/** Borrado seguro de una compra (carteras coherentes, movimientos bancarios originales conservados). Devuelve el id del registro para poder deshacerlo. */
export async function deletePurchase(receiptId: string): Promise<string> {
  const { data, error } = await supabase.rpc('delete_purchase', { p_receipt: receiptId })
  if (error) throw error
  return data as string
}

/** Deshace un borrado de compra, una retirada de duplicado o un vínculo con el banco. Solo se puede deshacer una vez. */
export async function restoreEconomyLog(logId: string): Promise<{ skipped: number }> {
  const { data, error } = await supabase.rpc('restore_economy_log', { p_log: logId })
  if (error) throw error
  return { skipped: Number((data as { skipped?: number } | null)?.skipped ?? 0) }
}

export async function listDuplicateDecisions(): Promise<[string, string][]> {
  try {
    const { data, error } = await supabase.from('purchase_duplicate_decisions').select('expense_a, expense_b')
    if (error) return []
    return (data ?? []).map((d) => [d.expense_a as string, d.expense_b as string] as [string, string])
  } catch {
    return []
  }
}

/** «No son lo mismo»: se recuerda para no volver a preguntar. */
export async function dismissDuplicate(expenseA: string, expenseB: string): Promise<void> {
  const familyId = await currentFamilyId()
  const [a, b] = expenseA < expenseB ? [expenseA, expenseB] : [expenseB, expenseA]
  const { error } = await supabase.from('purchase_duplicate_decisions').upsert({ family_id: familyId, expense_a: a, expense_b: b }, { onConflict: 'expense_a,expense_b' })
  if (error) throw error
}

// ─── Retiradas de efectivo del banco (migración 0318: sin aplicar hasta autorización; el cliente solo ofrece estas acciones si la familia tiene la categoría nueva) ───

/** Confirma una retirada del banco: la reparte entre carteras (suma ≤ lo retirado) o, sin partes, solo la clasifica «sin cartera». Devuelve lo que queda sin asignar. */
export async function assignWithdrawal(expenseId: string, parts: readonly { walletId: string; amount: number }[]): Promise<number> {
  const { data, error } = await supabase.rpc('cash_assign_withdrawal', { p_expense: expenseId, p_parts: parts.map((p) => ({ wallet_id: p.walletId, amount: p.amount })) })
  if (error) throw error
  return Number(data ?? 0)
}

/** La entrada de efectivo ya estaba apuntada a mano: el cargo del banco se vincula a ELLA (no se crea otra entrada). Se puede deshacer con unlinkBankMovement. */
export async function adoptEntryAsWithdrawal(expenseId: string, movementId: string): Promise<void> {
  const { error } = await supabase.rpc('cash_adopt_entry_as_withdrawal', { p_expense: expenseId, p_movement: movementId })
  if (error) throw error
}
