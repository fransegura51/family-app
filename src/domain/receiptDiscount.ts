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

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// COMP-07 — ahorro por descuentos (Compras → Estadística compras). Cada compra con descuento general registrado cuenta UNA sola vez: original (= pagado + descuento), descuento y
// pagado cuadran siempre (en céntimos). Nunca se infiere un descuento: solo se suman los registrados en receipts.discount_total.
export interface DiscountReceiptInput {
  id: string
  receiptDate: string
  store: string | null
  totalAmount: number | null
  discountTotal?: number | null
}
export interface DiscountPurchase {
  receiptId: string
  date: string
  store: string | null
  /** Importe antes de descuentos (= pagado + descuento). */
  original: number
  discount: number
  /** Lo realmente pagado (el total de la compra). */
  paid: number
}
export interface DiscountMonth {
  /** AAAA-MM */
  month: string
  discount: number
  purchases: number
}
export interface DiscountSummary {
  /** Suma de los descuentos de las compras del periodo. */
  total: number
  /** Compras con descuento del periodo, de la más reciente a la más antigua. */
  purchases: DiscountPurchase[]
  /** Evolución mensual (todas las fechas con descuento, de la más antigua a la más reciente). */
  byMonth: DiscountMonth[]
}

export function summarizeReceiptDiscounts(receipts: readonly DiscountReceiptInput[], from: string, to: string): DiscountSummary {
  const withDiscount = receipts.filter((r) => r.totalAmount != null && toCents(r.discountTotal ?? 0) > 0)
  const toPurchase = (r: DiscountReceiptInput): DiscountPurchase => {
    const paid = toCents(r.totalAmount as number)
    const discount = toCents(r.discountTotal ?? 0)
    return { receiptId: r.id, date: r.receiptDate, store: r.store, original: fromCents(paid + discount), discount: fromCents(discount), paid: fromCents(paid) }
  }
  const purchases = withDiscount
    .filter((r) => r.receiptDate >= from && r.receiptDate <= to)
    .map(toPurchase)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const monthCents = new Map<string, { cents: number; purchases: number }>()
  for (const r of withDiscount) {
    const key = r.receiptDate.slice(0, 7)
    const cur = monthCents.get(key) ?? { cents: 0, purchases: 0 }
    monthCents.set(key, { cents: cur.cents + toCents(r.discountTotal ?? 0), purchases: cur.purchases + 1 })
  }
  const byMonth = [...monthCents.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, v]) => ({ month, discount: fromCents(v.cents), purchases: v.purchases }))
  return { total: fromCents(purchases.reduce((s, p) => s + toCents(p.discount), 0)), purchases, byMonth }
}
