// DEVOLUCIONES DE UNA COMPRA. El gasto original NO se toca: la devolución es una fila aparte en Economía (categoría estándar «Devoluciones»,
// Modelo C, domain/refunds.ts) que resta del gasto bruto sin contar como ingreso ordinario. Aquí solo se calcula el neto de la compra.
import { parseAmount } from './manualPurchase'

const round2 = (n: number) => Math.round(n * 100) / 100

export type RefundStatus = 'none' | 'partial' | 'total'

export interface RefundSummary {
  total: number
  refunded: number
  /** Lo pagado menos lo devuelto. */
  net: number
  /** Lo que aún se puede devolver. */
  remaining: number
  status: RefundStatus
}

export function refundSummary(total: number, refunds: readonly { amount: number }[]): RefundSummary {
  const refunded = round2(refunds.reduce((s, r) => s + r.amount, 0))
  const remaining = round2(Math.max(0, total - refunded))
  return { total, refunded, net: round2(total - refunded), remaining, status: refunded <= 0 ? 'none' : remaining <= 0.005 ? 'total' : 'partial' }
}

export function validateRefund(summary: RefundSummary, amountText: string): { amount: number } | { error: string } {
  const amount = parseAmount(amountText)
  if (amount == null || amount <= 0) return { error: 'Escribe cuánto te han devuelto' }
  if (summary.remaining <= 0.005) return { error: 'Esta compra ya está devuelta por completo' }
  if (amount > summary.remaining + 0.005) return { error: `Solo quedan ${summary.remaining.toFixed(2).replace('.', ',')} € por devolver de esta compra` }
  return { amount }
}

/** Texto corto para la fila de la compra. null si no hay devoluciones. */
export function refundLine(s: RefundSummary): string | null {
  if (s.status === 'none') return null
  const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €'
  return s.status === 'total' ? `↩️ Devuelta por completo (${eur(s.refunded)})` : `↩️ Devueltos ${eur(s.refunded)} · neto ${eur(s.net)}`
}
