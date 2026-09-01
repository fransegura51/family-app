// Compara lo que cuesta cada producto de un mes a otro, a partir del
// mismo historial de precios que ya alimentan los tickets y la Memoria
// de la lista de la compra (Skill 09). Sin IA: agrupa por producto y
// por mes, promedia si se compró varias veces, y calcula la subida o
// bajada en % frente al mes anterior. No normaliza por cantidad (1L vs
// 1,5L cuentan igual) — compara lo que se pagó cada vez, que es lo que
// hay disponible sin pedir al usuario que rellene cantidades exactas
// cada vez.

export interface RawPurchase {
  productId: string
  price: number
  recordedDate: string // YYYY-MM-DD
}

export interface ProductMonthPrice {
  productId: string
  month: string // YYYY-MM
  avgPrice: number
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
  return purchases.filter((p) => p.recordedDate.startsWith(month)).reduce((sum, p) => sum + p.price, 0)
}
