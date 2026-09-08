import type { BudgetCategory, ProductPrice, Receipt } from '@/domain/types'
import { isFoodCategory } from '@/domain/finance'

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

// Solo para desempatar sugerencias con el mismo número de compras
// (petición real: "si tienes que elegir entre cerveza... y pan porque
// se han comprado la misma cantidad de veces sugiere pan, pero si
// realmente se han comprado más cervezas se respeta") — nunca cambia
// el recuento real, solo el orden cuando empatan.
const ALCOHOL_KEYWORDS = ['cerveza', 'vino', 'vodka', 'whisky', 'whiskey', 'ron ', 'ginebra', 'licor', 'cava', 'champan', 'champán', 'sidra']

export function isLikelyAlcohol(displayName: string): boolean {
  const name = ` ${displayName.trim().toLowerCase()} `
  return ALCOHOL_KEYWORDS.some((k) => name.includes(k))
}

// Un artículo de Amazon solo cuenta como alimentación si la propia
// familia le puso una categoría de Alimentación (la general o alguna
// de sus subcategorías, p. ej. un café) al ticket al revisarlo — el
// resto de tiendas (Mercadona, Hiperber...) es siempre compra física,
// así que cuenta entera como alimentación aunque alguna línea suelta
// no lo sea del todo (petición real: "al ser todo compra en tienda y
// no online los dejamos dentro de esa clasificación").
export function isFoodPurchase(price: { store: string | null; receiptId: string | null }, foodReceiptIds: Set<string>): boolean {
  if (price.store !== 'Amazon') return true
  return price.receiptId != null && foodReceiptIds.has(price.receiptId)
}

// Construye de una vez el conjunto de tickets que cuentan como
// alimentación (ver isFoodPurchase) — evita repetir en cada sitio que
// lo usa la resolución categoría → subcategoría → "Alimentación".
export function buildFoodReceiptIds(receipts: Pick<Receipt, 'id' | 'category'>[], categories: BudgetCategory[]): Set<string> {
  return new Set(receipts.filter((r) => isFoodCategory(r.category, categories)).map((r) => r.id))
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
