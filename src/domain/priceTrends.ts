// Compara lo que cuesta cada producto de un mes a otro, a partir del
// mismo historial de precios que ya alimentan los tickets y la Memoria
// de la lista de la compra (Skill 09). Sin IA: agrupa por producto y
// por mes, promedia si se compró varias veces, y calcula la subida o
// bajada en % frente al mes anterior.
//
// "price" es siempre el precio POR UNIDAD (recordProductPurchase ya
// divide el importe total de la línea entre las unidades antes de
// guardarlo) — NUNCA hay que volver a dividir aquí entre "quantity".
// Bug real reportado: se dividía dos veces, y una cerveza a 1,10€/ud
// aparecía en este listado a 0,73€/ud. El total de la cesta
// (basketTotal) sí necesita multiplicar por "quantity", porque ahí
// interesa lo realmente pagado en la línea, no el precio unitario.

export interface RawPurchase {
  productId: string
  price: number // precio POR UNIDAD de la línea
  quantity: number // unidades compradas en esa línea (1 si no se sabe)
  recordedDate: string // YYYY-MM-DD
}

export interface ProductMonthPrice {
  productId: string
  month: string // YYYY-MM
  avgPrice: number // precio medio POR UNIDAD ese mes
}

export function averagePricesByMonth(purchases: RawPurchase[]): ProductMonthPrice[] {
  const sums = new Map<string, { sum: number; count: number }>()
  for (const p of purchases) {
    const month = p.recordedDate.slice(0, 7)
    const key = `${p.productId}|${month}`
    const entry = sums.get(key) ?? { sum: 0, count: 0 }
    entry.sum += p.price
    entry.count += 1
    sums.set(key, entry)
  }
  return [...sums.entries()].map(([key, { sum, count }]) => {
    const [productId, month] = key.split('|')
    return { productId, month, avgPrice: sum / count }
  })
}

export interface ProductPriceComparison {
  productId: string
  currentPrice: number | null
  previousPrice: number | null
  deltaPercent: number | null // positivo = subida, negativo = bajada
}

export function compareMonths(
  monthPrices: ProductMonthPrice[],
  currentMonth: string,
  previousMonth: string,
): ProductPriceComparison[] {
  const byProduct = new Map<string, { current?: number; previous?: number }>()
  for (const mp of monthPrices) {
    if (mp.month !== currentMonth && mp.month !== previousMonth) continue
    const entry = byProduct.get(mp.productId) ?? {}
    if (mp.month === currentMonth) entry.current = mp.avgPrice
    if (mp.month === previousMonth) entry.previous = mp.avgPrice
    byProduct.set(mp.productId, entry)
  }

  const results: ProductPriceComparison[] = []
  for (const [productId, { current, previous }] of byProduct) {
    if (current == null) continue // solo interesa lo comprado ESTE mes
    const deltaPercent = previous != null && previous !== 0 ? ((current - previous) / previous) * 100 : null
    results.push({ productId, currentPrice: current, previousPrice: previous ?? null, deltaPercent })
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
  const byProduct = new Map<string, { prevQty: number; prevSpend: number; curQty: number; curSpend: number }>()
  for (const p of purchases) {
    const month = p.recordedDate.slice(0, 7)
    if (month !== currentMonth && month !== previousMonth) continue
    const entry = byProduct.get(p.productId) ?? { prevQty: 0, prevSpend: 0, curQty: 0, curSpend: 0 }
    const qty = p.quantity > 0 ? p.quantity : 1
    const spend = p.price * qty
    if (month === previousMonth) {
      entry.prevQty += qty
      entry.prevSpend += spend
    } else {
      entry.curQty += qty
      entry.curSpend += spend
    }
    byProduct.set(p.productId, entry)
  }

  let priceEffect = 0
  let quantityEffect = 0
  let newProductsEffect = 0
  let droppedProductsEffect = 0
  let previousTotal = 0
  let currentTotal = 0
  for (const { prevQty, prevSpend, curQty, curSpend } of byProduct.values()) {
    previousTotal += prevSpend
    currentTotal += curSpend
    if (prevQty > 0 && curQty > 0) {
      const prevAvgPrice = prevSpend / prevQty
      const curAvgPrice = curSpend / curQty
      priceEffect += (curAvgPrice - prevAvgPrice) * prevQty
      quantityEffect += (curQty - prevQty) * curAvgPrice
    } else if (prevQty > 0 && curQty === 0) {
      droppedProductsEffect -= prevSpend
    } else if (prevQty === 0 && curQty > 0) {
      newProductsEffect += curSpend
    }
  }
  return { previousTotal, currentTotal, priceEffect, quantityEffect, newProductsEffect, droppedProductsEffect }
}
