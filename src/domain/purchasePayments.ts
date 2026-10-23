// PAGOS DE UNA COMPRA (incluidos los pagos mixtos). Una compra = UN gasto total; los pagos solo dicen con qué se pagó (la suma es el total).
import { PAYMENT_METHODS, isPaymentMethod, parseAmount, type PaymentMethod } from './manualPurchase'

export interface PaymentLeg {
  method: PaymentMethod
  /** Texto del campo importe. */
  amount: string
  /** Solo para efectivo: la cartera de la que sale. Vacío = efectivo sin cartera. */
  walletId: string
}

export const emptyLeg = (method: PaymentMethod = 'efectivo'): PaymentLeg => ({ method, amount: '', walletId: '' })

const round2 = (n: number) => Math.round(n * 100) / 100

export function legsTotal(legs: readonly PaymentLeg[]): number {
  return round2(legs.reduce((s, l) => s + (parseAmount(l.amount) ?? 0), 0))
}

/** Lo que falta (+) o sobra (−) por repartir entre los pagos. */
export function remainingToAllocate(total: number, legs: readonly PaymentLeg[]): number {
  return round2(total - legsTotal(legs))
}

/** Primer problema que impide guardar los pagos, o null. */
export function validateLegs(total: number, legs: readonly PaymentLeg[]): string | null {
  if (legs.length === 0) return 'Indica cómo se pagó'
  for (const l of legs) {
    if (!isPaymentMethod(l.method)) return 'Elige una forma de pago de la lista'
    const a = parseAmount(l.amount)
    if (a == null || a <= 0) return 'Cada pago necesita un importe mayor que 0'
    if (l.walletId && l.method !== 'efectivo') return 'Solo el efectivo sale de una cartera'
  }
  const rest = remainingToAllocate(total, legs)
  if (Math.abs(rest) > 0.005) return rest > 0 ? `Faltan ${rest.toFixed(2).replace('.', ',')} € por repartir` : `Sobran ${(-rest).toFixed(2).replace('.', ',')} € en los pagos`
  const methods = legs.map((l) => `${l.method}|${l.walletId}`)
  if (new Set(methods).size !== methods.length) return 'Hay dos pagos iguales: júntalos en uno'
  return null
}

/** Método que resume la compra: el único, o «mixto». */
export function summaryMethod(legs: readonly Pick<PaymentLeg, 'method'>[]): PaymentMethod | 'mixto' | null {
  if (legs.length === 0) return null
  return legs.length === 1 ? legs[0].method : 'mixto'
}

/** Al cambiar el importe total de una compra con un solo pago, ese pago sigue siendo el total. Con varios se deja a la persona. */
export function syncSingleLeg(legs: readonly PaymentLeg[], total: number): PaymentLeg[] {
  return legs.length === 1 ? [{ ...legs[0], amount: String(total) }] : [...legs]
}

/** Reparto inicial al pasar de un pago a dos: lo ya pagado queda en el primero y el resto en el segundo. */
export function splitInTwo(total: number, first: PaymentLeg): PaymentLeg[] {
  const a = parseAmount(first.amount)
  const firstAmount = a != null && a > 0 && a < total ? a : round2(total / 2)
  const other: PaymentMethod = first.method === 'tarjeta' ? 'efectivo' : 'tarjeta'
  return [{ ...first, amount: String(firstAmount) }, { ...emptyLeg(other), amount: String(round2(total - firstAmount)) }]
}

/** Carga para la función del servidor. */
export function toRpcPayments(legs: readonly PaymentLeg[], paidByMemberId: string | null): { method: PaymentMethod; amount: number; wallet_id: string | null; paid_by_member_id: string | null }[] {
  return legs.map((l) => ({
    method: l.method,
    amount: parseAmount(l.amount) ?? 0,
    wallet_id: l.method === 'efectivo' && l.walletId ? l.walletId : null,
    paid_by_member_id: paidByMemberId,
  }))
}

/** ¿Hay que llamar a set_purchase_payments? Solo con varios pagos o si algún pago usa una cartera; un único medio se guarda con la propia compra. */
export function needsPaymentRecords(legs: readonly PaymentLeg[]): boolean {
  return legs.length > 1 || legs.some((l) => l.method === 'efectivo' && l.walletId !== '')
}

export { PAYMENT_METHODS }
