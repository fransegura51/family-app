// DESCUENTOS GENERALES DE UNA COMPRA (COR-09). Lógica pura, todo en CÉNTIMOS enteros para que los repartos sumen SIEMPRE el importe exacto.
//
// Cómo funciona el sistema de descuentos de PEPA:
//   · receipts.discount_total (migración 0293) guarda, como dato estructurado, la SUMA de los descuentos de una compra (positiva, en €). El total de la compra es lo PAGADO (ya con
//     el descuento aplicado) y los precios de cada producto del Historial de precios son los ORIGINALES (nunca se tocan).
//   · Lo rellena la lectura de un ticket con líneas de descuento (importe negativo) y el correo de Mercadona; ahora también se puede registrar a mano cuando una compra importada
//     trae los precios originales y falta la promoción (p. ej. un pedido de Amazon cuyo correo no incluía el descuento).
//   · En las estadísticas por clasificación, un descuento GENERAL (no atribuido a un producto concreto) se reparte entre los productos en proporción a su precio, con céntimos
//     exactos, para que lo que suman las clasificaciones sea lo realmente pagado. No es un ingreso ni un producto ficticio.
// PEPA nunca da por hecho que una diferencia es un descuento: solo avisa; registrarlo es una decisión de la persona.

const toCents = (n: number): number => Math.round(n * 100)
const fromCents = (c: number): number => c / 100

/** Reparte `totalCents` en partes proporcionales a `weights` (método del mayor resto): suma EXACTA, sin partes negativas. */
function apportion(totalCents: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (weights.length === 0) return []
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? totalCents : 0))
  const raw = weights.map((w) => (totalCents * w) / sum)
  const base = raw.map((r) => Math.floor(r + 1e-9))
  let left = totalCents - base.reduce((s, b) => s + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r + 1e-9) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    base[i] += 1
    left -= 1
  }
  return base
}

/**
 * Importe NETO de cada producto tras repartir un descuento general en proporción a su precio. La suma del resultado es exactamente (suma de los importes − descuento), en
 * céntimos. Sin descuento (o sin importes) devuelve los importes tal cual, sin redondear nada. El descuento nunca supera lo que suman los productos.
 */
export function distributeDiscount(amounts: readonly number[], discount: number): number[] {
  const cents = amounts.map(toCents)
  const total = cents.reduce((s, c) => s + c, 0)
  const wanted = Math.max(0, toCents(discount))
  if (wanted === 0 || total <= 0) return [...amounts]
  const share = apportion(Math.min(wanted, total), cents)
  return cents.map((c, i) => fromCents(c - share[i]))
}

export const DISCOUNT_TOLERANCE = 0.02

export type ReceiptDifferenceKind = 'ok' | 'less_paid' | 'more_paid'

export interface ReceiptDifference {
  kind: ReceiptDifferenceKind
  linesTotal: number
  discount: number
  /** Lo que deberían sumar los productos menos el descuento ya registrado. */
  expected: number
  total: number
  /** total pagado − esperado (negativo = se pagó menos de lo que suman los productos). */
  difference: number
  /** Con `less_paid`: el descuento general que explicaría la diferencia (positivo, en €). */
  suggestedDiscount: number | null
}

/** Compara lo que suman los productos (menos el descuento ya registrado) con el total pagado. Solo avisa: no asume qué es la diferencia. */
export function compareReceiptTotal(linesTotal: number, discount: number, total: number): ReceiptDifference {
  const lines = fromCents(toCents(linesTotal))
  const disc = fromCents(Math.max(0, toCents(discount)))
  const expected = fromCents(toCents(lines) - toCents(disc))
  const difference = fromCents(toCents(total) - toCents(expected))
  const kind: ReceiptDifferenceKind = Math.abs(difference) <= DISCOUNT_TOLERANCE ? 'ok' : difference < 0 ? 'less_paid' : 'more_paid'
  return { kind, linesTotal: lines, discount: disc, expected, total, difference, suggestedDiscount: kind === 'less_paid' ? fromCents(-toCents(difference)) : null }
}
