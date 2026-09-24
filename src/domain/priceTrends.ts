// Compara lo que cuesta cada producto de un mes a otro, a partir del
// mismo historial de precios que ya alimentan los tickets y la Memoria
// de la lista de la compra (Skill 09). Sin IA: agrupa por producto,
// magnitud (€/kg vs €/ud — ver domain/measurementUnit.ts) y mes,
// promedia si se compró varias veces, y calcula la subida o bajada en
// % frente al mes anterior.
//
// "price" es siempre el precio POR MAGNITUD (por unidad, o por kg si
// unit="kg") — NUNCA el importe total de la línea, y nunca hay que
// volver a dividir aquí entre "quantity". PESO-4/5: nunca se compara
// un precio €/kg con uno €/ud, ni un legacy unit=null ambiguo (una
// serie con "kg" en otro sitio) con ninguno de los dos — ver
// groupBySafeMagnitude.
import { groupBySafeMagnitude, type MeasurementUnit } from '@/domain/measurementUnit'

export interface RawPurchase {
  productId: string
  price: number // precio POR MAGNITUD (por unidad, o por kg) de la línea
  quantity: number // unidades o kg comprados en esa línea (1 si no se sabe)
  unit: string | null // 'kg' | 'ud' | null (legacy anterior a PESO-1/2/3)
  recordedDate: string // YYYY-MM-DD
}

export interface ProductMonthPrice {
  productId: string
  unit: MeasurementUnit
  month: string // YYYY-MM
  avgPrice: number // precio medio de esa magnitud ese mes
}

export function averagePricesByMonth(purchases: RawPurchase[]): ProductMonthPrice[] {
  const byProduct = new Map<string, RawPurchase[]>()
  for (const p of purchases) {
    const list = byProduct.get(p.productId) ?? []
    list.push(p)
    byProduct.set(p.productId, list)
  }

  const sums = new Map<string, { sum: number; count: number; productId: string; unit: MeasurementUnit; month: string }>()
  for (const [productId, records] of byProduct) {
    const { kg, ud } = groupBySafeMagnitude(records)
    for (const [unit, group] of [['kg', kg] as const, ['ud', ud] as const]) {
      for (const p of group) {
        const month = p.recordedDate.slice(0, 7)
        const key = `${productId}|${unit}|${month}`
        const entry = sums.get(key) ?? { sum: 0, count: 0, productId, unit, month }
        entry.sum += p.price
        entry.count += 1
        sums.set(key, entry)
      }
    }
  }
  return [...sums.values()].map(({ sum, count, productId, unit, month }) => ({ productId, unit, month, avgPrice: sum / count }))
}

export interface ProductPriceComparison {
  productId: string
  unit: MeasurementUnit
  currentPrice: number | null
  previousPrice: number | null
  deltaPercent: number | null // positivo = subida, negativo = bajada
}

export function compareMonths(
  monthPrices: ProductMonthPrice[],
  currentMonth: string,
  previousMonth: string,
): ProductPriceComparison[] {
  const byKey = new Map<string, { productId: string; unit: MeasurementUnit; current?: number; previous?: number }>()
  for (const mp of monthPrices) {
    if (mp.month !== currentMonth && mp.month !== previousMonth) continue
    const key = `${mp.productId}|${mp.unit}`
    const entry = byKey.get(key) ?? { productId: mp.productId, unit: mp.unit }
    if (mp.month === currentMonth) entry.current = mp.avgPrice
    if (mp.month === previousMonth) entry.previous = mp.avgPrice
    byKey.set(key, entry)
  }

  const results: ProductPriceComparison[] = []
  for (const { productId, unit, current, previous } of byKey.values()) {
    if (current == null) continue // solo interesa lo comprado ESTE mes
    const deltaPercent = previous != null && previous !== 0 ? ((current - previous) / previous) * 100 : null
    results.push({ productId, unit, currentPrice: current, previousPrice: previous ?? null, deltaPercent })
  }
  return results
}

export function basketTotal(purchases: RawPurchase[], month: string): number {
  return purchases
    .filter((p) => p.recordedDate.startsWith(month))
    .reduce((sum, p) => sum + p.price * (p.quantity > 0 ? p.quantity : 1), 0)
}

// Skill de Pepa, punto 24 — "¿Por qué ha cambiado mi gasto?": reparte la
// diferencia entre dos meses en tres causas, por producto (a partir de
// los tickets, no del banco):
// - priceEffect: mismo producto, ha subido/bajado el precio.
// - quantityEffect: mismo producto, se ha comprado más o menos cantidad.
// - newProductsEffect / droppedProductsEffect: productos que empiezan o
//   dejan de comprarse ese mes.
// Es una aproximación (usa el precio medio del mes), por eso el
// documento exige dejar claro que es un análisis basado en tickets.
export interface SpendChangeBreakdown {
  previousTotal: number
  currentTotal: number
  priceEffect: number
  quantityEffect: number
  newProductsEffect: number
  droppedProductsEffect: number
}

export function decomposeSpendChange(
  purchases: RawPurchase[],
  currentMonth: string,
  previousMonth: string,
): SpendChangeBreakdown {
  const byProduct = new Map<string, RawPurchase[]>()
  for (const p of purchases) {
    const month = p.recordedDate.slice(0, 7)
    if (month !== currentMonth && month !== previousMonth) continue
    const list = byProduct.get(p.productId) ?? []
    list.push(p)
    byProduct.set(p.productId, list)
  }

  let priceEffect = 0
  let quantityEffect = 0
  let newProductsEffect = 0
  let droppedProductsEffect = 0
  let previousTotal = 0
  let currentTotal = 0

  function sumSide(records: RawPurchase[], month: string): { qty: number; spend: number } {
    let qty = 0
    let spend = 0
    for (const r of records) {
      if (r.recordedDate.slice(0, 7) !== month) continue
      const q = r.quantity > 0 ? r.quantity : 1
      qty += q
      spend += r.price * q
    }
    return { qty, spend }
  }

  for (const [, records] of byProduct) {
    // PESO-5 — un legacy ambiguo (unit=null en una serie que también tiene "kg", ver
    // domain/measurementUnit.ts) NUNCA se compara con el otro mes como si fuese "el mismo producto que
    // cambió de precio": se cuenta como si se hubiera dejado de comprar "como antes" y empezado a
    // comprar "como ahora" — nunca inventa un efecto de precio o cantidad entre dos magnitudes que no
    // sabemos si son la misma. El total de cada mes (previousTotal/currentTotal) sigue sumando TODO,
    // así que el balance económico real nunca cambia.
    const { kg, ud, unknown } = groupBySafeMagnitude(records)
    for (const u of unknown) {
      const month = u.recordedDate.slice(0, 7)
      const qty = u.quantity > 0 ? u.quantity : 1
      const spend = u.price * qty
      if (month === previousMonth) {
        previousTotal += spend
        droppedProductsEffect -= spend
      } else {
        currentTotal += spend
        newProductsEffect += spend
      }
    }
    for (const group of [kg, ud]) {
      if (group.length === 0) continue
      const prev = sumSide(group, previousMonth)
      const cur = sumSide(group, currentMonth)
      previousTotal += prev.spend
      currentTotal += cur.spend
      if (prev.qty > 0 && cur.qty > 0) {
        const prevAvgPrice = prev.spend / prev.qty
        const curAvgPrice = cur.spend / cur.qty
        priceEffect += (curAvgPrice - prevAvgPrice) * prev.qty
        quantityEffect += (cur.qty - prev.qty) * curAvgPrice
      } else if (prev.qty > 0 && cur.qty === 0) {
        droppedProductsEffect -= prev.spend
      } else if (prev.qty === 0 && cur.qty > 0) {
        newProductsEffect += cur.spend
      }
    }
  }
  return { previousTotal, currentTotal, priceEffect, quantityEffect, newProductsEffect, droppedProductsEffect }
}
