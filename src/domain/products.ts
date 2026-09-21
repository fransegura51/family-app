import type { BudgetCategory, Product, ProductPrice, Receipt } from '@/domain/types'
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

// FASE 6C.2B — NATURALEZA DE UN PRODUCTO COMPRADO: TRIESTADO, no un booleano.
//
//   'alimentacion'  → es comida (FOOD)
//   'no_alimentos'  → no es comida (OTHER)
//   'desconocido'   → NO SE SABE («Producto sin clasificar»): no entra ni en Alimentos ni en Otros
//
// TIENDA != TIPO DE PRODUCTO: la tienda (Amazon, Mercadona, la que sea) NO decide nada aquí. Precedencia, única para todos los consumidores:
//   A. clase conocida del producto (manual o histórica, que existe entre las de la familia) → manda el `kind` de esa clase
//      (también sobre una marca non_food antigua y contradictoria);
//   B. sin clase conocida, marca explícita heredada non_food = true (p. ej. «Bombona» marcada como Otros) → no alimentos;
//   C. sin clase conocida y sin marca: solo hay UNA evidencia histórica que se conserva de forma transitoria — el ticket está en la categoría
//      financiera «Alimentación» (o una subcategoría suya) → alimentación. Sin ella → DESCONOCIDO. Se midió antes de conservarla: hoy hay 263
//      líneas / 112 productos / 1.014,64 € que dependen EXCLUSIVAMENTE de esa evidencia; retirarla las sacaría de Alimentos sin prueba de que
//      no lo sean, así que se mantiene y queda identificada (basis 'ticket_alimentacion') para poder retirarla cuando se decida.
//
// Una categoría financiera GENÉRICA del ticket (Regalos y compras varias, Otros, «Amazon»...) NUNCA prueba que un producto sea «no alimentos»:
// un mismo ticket puede mezclar cosas de distinto tipo. Un ticket sin categoría (NULL, pendiente) tampoco prueba nada → desconocido.
//
// NO confundir con «Pendiente de clasificar» (category NULL de un gasto o ticket): aquello es la categoría FINANCIERA; esto es la
// naturaleza del PRODUCTO. Son conceptos y banderas distintos.
export type ProductNature = 'alimentacion' | 'no_alimentos' | 'desconocido'
export type ProductNatureBasis = 'class' | 'non_food' | 'ticket_alimentacion' | 'none'

export interface PurchaseNatureContext {
  /** Tickets cuya categoría financiera es Alimentación (o una subcategoría): ver buildFoodReceiptIds. */
  foodReceiptIds: Set<string>
  /** Productos de no alimentos: clase de no alimentos, o marca heredada non_food sin clase (ver buildProductKindSets). */
  nonFoodProductIds?: Set<string>
  /** Productos con clase conocida de alimentación (ver buildProductKindSets). */
  foodProductIds?: Set<string>
}

/** La naturaleza de una compra (línea de product_prices) y en qué se apoya. La tienda no entra. */
export function resolvePurchaseNature(
  price: { productId: string; receiptId: string | null },
  ctx: PurchaseNatureContext,
): { nature: ProductNature; basis: ProductNatureBasis } {
  if (ctx.foodProductIds?.has(price.productId)) return { nature: 'alimentacion', basis: 'class' }
  if (ctx.nonFoodProductIds?.has(price.productId)) return { nature: 'no_alimentos', basis: 'non_food' }
  if (price.receiptId != null && ctx.foodReceiptIds.has(price.receiptId)) return { nature: 'alimentacion', basis: 'ticket_alimentacion' }
  return { nature: 'desconocido', basis: 'none' }
}

export function purchaseNature(
  price: { productId: string; receiptId: string | null },
  foodReceiptIds: Set<string>,
  nonFoodProductIds: Set<string> = new Set(),
  foodProductIds: Set<string> = new Set(),
): ProductNature {
  return resolvePurchaseNature(price, { foodReceiptIds, nonFoodProductIds, foodProductIds }).nature
}

// ¿Es comida? Solo el estado FOOD del triestado: «no alimentos» y «desconocido» dan false (por eso NO usar `!isFoodPurchase` como
// «Otros»: un desconocido no es Otros; usa purchaseNature).
export function isFoodPurchase(
  price: { productId: string; receiptId: string | null },
  foodReceiptIds: Set<string>,
  nonFoodProductIds: Set<string> = new Set(),
  foodProductIds: Set<string> = new Set(),
): boolean {
  return purchaseNature(price, foodReceiptIds, nonFoodProductIds, foodProductIds) === 'alimentacion'
}

// Conjuntos de productos por su TIPO REAL (Fase 6C): la clase conocida manda (también sobre un non_food antiguo y contradictorio);
// sin clase conocida, la marca heredada non_food. La tienda no interviene.
export function buildProductKindSets(products: Pick<Product, 'id' | 'nonFood' | 'classKind'>[]): {
  nonFoodProductIds: Set<string>
  foodProductIds: Set<string>
} {
  const nonFoodProductIds = new Set<string>()
  const foodProductIds = new Set<string>()
  for (const p of products) {
    if (p.classKind === 'alimentacion') foodProductIds.add(p.id)
    else if (p.classKind === 'no_alimentos' || p.nonFood) nonFoodProductIds.add(p.id)
  }
  return { nonFoodProductIds, foodProductIds }
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
