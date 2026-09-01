// Compara lo que cuesta cada producto de un mes a otro, a partir del
// mismo historial de precios que ya alimentan los tickets y la Memoria
// de la lista de la compra (Skill 09). Sin IA: agrupa por producto y
// por mes, promedia si se compró varias veces, y calcula la subida o
// bajada en % frente al mes anterior.
//
// "price" es siempre el importe TOTAL pagado en esa línea (p. ej. 2
// bolsas de patatas a 3€ = 6€), no el precio por unidad — por eso para
// comparar el precio del producto en sí se divide entre "quantity"
// antes de promediar (bug real detectado: sin esto, comprar el doble
// un mes parecía una subida de precio del 100%, no un cambio de
// cantidad). El total de la cesta (basketTotal) sí usa el importe total
// tal cual, porque ahí interesa lo realmente pagado.

export interface RawPurchase {
  productId: string
  price: number // importe TOTAL de la línea
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
    const qty = p.quantity > 0 ? p.quantity : 1
    const unitPrice = p.price / qty
    const entry = sums.get(key) ?? { sum: 0, count: 0 }
    entry.sum += unitPrice
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
  return purchases.filter((p) => p.recordedDate.startsWith(month)).reduce((sum, p) => sum + p.price, 0)
}
