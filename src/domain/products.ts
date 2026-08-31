import type { ProductPrice } from '@/domain/types'

export interface ProductStats {
  count: number
  lastPrice: number
  avgPrice: number
  minPrice: number
  maxPrice: number
  lastDate: string
  avgDaysBetween: number | null
  // Sugerido para la próxima compra: ya ha pasado (al menos) el intervalo
  // medio histórico entre compras. Skill 09: la sugerencia se muestra,
  // pero añadirla a la lista siempre requiere una acción explícita del
  // usuario — nunca se añade sola.
  isDue: boolean
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00').getTime() - new Date(a + 'T00:00').getTime()) / 86_400_000)
}

export function computeProductStats(prices: ProductPrice[]): ProductStats | null {
  if (prices.length === 0) return null
  const sorted = [...prices].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))
  const amounts = sorted.map((p) => p.price)
  const lastDate = sorted[sorted.length - 1].recordedDate

  let avgDaysBetween: number | null = null
  if (sorted.length >= 2) {
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].recordedDate, sorted[i].recordedDate))
    }
    avgDaysBetween = gaps.reduce((a, b) => a + b, 0) / gaps.length
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const daysSinceLast = daysBetween(lastDate, todayStr)
  const isDue = avgDaysBetween != null && daysSinceLast >= avgDaysBetween

  return {
    count: sorted.length,
    lastPrice: amounts[amounts.length - 1],
    avgPrice: amounts.reduce((a, b) => a + b, 0) / amounts.length,
    minPrice: Math.min(...amounts),
    maxPrice: Math.max(...amounts),
    lastDate,
    avgDaysBetween,
    isDue,
  }
}
