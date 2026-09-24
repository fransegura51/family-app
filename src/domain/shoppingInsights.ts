// "PEPA analiza tus compras" — carrusel de hallazgos sobre HÁBITOS de
// compra (Inciso Compras, Parte A). CODE CALCULATES, PEPA EXPLAINS:
// todo aquí es determinista, sobre product_prices/products ya
// registrados — nada de IA para sumar, comparar precios, contar
// recurrencias o decidir frecuencias/intervalos. Las frases son
// plantillas fijas rellenadas con hechos ya calculados.
//
// NO solapa con "¿Por qué ha cambiado mi compra?" (PorQueHaCambiadoMiCompra,
// src/ui/ShoppingScreen.tsx, sobre decomposeSpendChange/compareMonths de
// domain/priceTrends.ts): ese bloque explica CUÁNTO ha cambiado el gasto
// y por qué (efecto precio/cantidad, productos nuevos/desaparecidos en
// términos de gasto). Este archivo nunca calcula esos números — solo
// hábitos: qué tienda sale a cuenta, qué se repite, dónde sale más
// barato, qué empieza o deja de ser habitual, cesta núcleo y
// concentración por tienda.
//
// Reutiliza el mismo criterio de "comparable entre tiendas" que ya usa
// answerCheapest (domain/financeCompute.ts) y openDetail (ShoppingScreen
// → HistoryTab): agrupar por p.store || 'Sin tienda concreta', exigir
// ≥2 tiendas reales y ≥3 compras — no se reinventa un criterio distinto.
import type { Product, ProductPrice } from '@/domain/types'

export type ShoppingInsightKind =
  | 'tienda_habitual_barata'
  | 'producto_frecuente'
  | 'precio_minimo_tienda'
  | 'producto_emergente'
  | 'producto_desaparecido'
  | 'recompra_anticipada'
  | 'cesta_habitual'
  | 'categoria_por_tienda'

// "+info" solo existe cuando hay un destino real: el historial de
// precios de UN producto concreto (Compras → Historial). Qué chip
// (Alimentos/Otros) hay que activar para que el producto aparezca
// depende de purchaseNature (naturaleza real por ticket, no solo por
// classKind) — ese cálculo requiere recibos/categorías que este
// archivo no carga, así que lo resuelve HistoryTab con sus propios
// datos (ya autoritativos) al consumir el enlace pendiente, en vez de
// que este archivo adivine un chip que podría no coincidir.
export interface ShoppingInsightMoreInfo {
  productId: string
  productName: string
}

export interface ShoppingInsight {
  kind: ShoppingInsightKind
  text: string
  moreInfo?: ShoppingInsightMoreInfo
}

interface Input {
  prices: ProductPrice[]
  products: Product[]
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00').getTime() - new Date(a + 'T00:00').getTime()) / 86_400_000)
}

function groupByProduct(prices: ProductPrice[]): Map<string, ProductPrice[]> {
  const map = new Map<string, ProductPrice[]>()
  for (const p of prices) {
    const list = map.get(p.productId)
    if (list) list.push(p)
    else map.set(p.productId, [p])
  }
  return map
}

// Último precio por tienda (misma técnica que openDetail/answerCheapest):
// ordena por fecha ascendente y se queda con la última entrada de cada
// tienda — así un mismo producto/tienda no cuenta dos veces.
function lastPriceByStore(productPrices: ProductPrice[]): Map<string, { price: number; date: string }> {
  const byStore = new Map<string, { price: number; date: string }>()
  for (const p of [...productPrices].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))) {
    byStore.set(p.store || 'Sin tienda concreta', { price: p.price, date: p.recordedDate })
  }
  return byStore
}

function productById(products: Product[]): Map<string, Product> {
  return new Map(products.map((p) => [p.id, p]))
}

function moreInfoFor(product: Product): ShoppingInsightMoreInfo {
  return { productId: product.id, productName: product.displayName }
}

// ---------------------------------------------------------------------
// TIPO 1 — tienda más conveniente para productos habituales.
// ---------------------------------------------------------------------
export function findCheapestStoreForHabituals(input: Input): ShoppingInsight | null {
  const byProduct = groupByProduct(input.prices)
  const cheapestStoreCount = new Map<string, number>()
  for (const [, prices] of byProduct) {
    if (prices.length < 3) continue
    const byStore = lastPriceByStore(prices)
    const realStores = [...byStore.entries()].filter(([store]) => store !== 'Sin tienda concreta')
    if (realStores.length < 2) continue
    const cheapest = realStores.reduce((min, e) => (e[1].price < min[1].price ? e : min))
    cheapestStoreCount.set(cheapest[0], (cheapestStoreCount.get(cheapest[0]) ?? 0) + 1)
  }
  if (cheapestStoreCount.size === 0) return null
  const [store, count] = [...cheapestStoreCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  if (count < 3) return null
  return {
    kind: 'tienda_habitual_barata',
    text: `De los productos que compras habitualmente, ${count} te han salido más baratos en ${store} que en otras tiendas.`,
  }
}

// ---------------------------------------------------------------------
// TIPO 2 — producto con mayor frecuencia (últimos 30 días).
// ---------------------------------------------------------------------
export function findMostFrequentProduct(input: Input, now: Date): ShoppingInsight | null {
  const nowStr = now.toISOString().slice(0, 10)
  const windowStart = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
  const byProduct = groupByProduct(input.prices)
  const products = productById(input.products)
  let best: { productId: string; count: number } | null = null
  for (const [productId, prices] of byProduct) {
    const count = prices.filter((p) => p.recordedDate >= windowStart && p.recordedDate <= nowStr).length
    if (count < 3) continue
    if (!best || count > best.count || (count === best.count && productId < best.productId)) best = { productId, count }
  }
  if (!best) return null
  const product = products.get(best.productId)
  if (!product) return null
  return {
    kind: 'producto_frecuente',
    text: `${product.displayName} es uno de tus productos más habituales: lo has comprado ${best.count} ${best.count === 1 ? 'vez' : 'veces'} en los últimos 30 días.`,
    moreInfo: moreInfoFor(product),
  }
}

// ---------------------------------------------------------------------
// TIPO 3 — dónde has comprado más barato un producto (mayor diferencia
// entre tiendas, mismo umbral de "comparable" que answerCheapest).
// ---------------------------------------------------------------------
export function findBestPriceGapProduct(input: Input): ShoppingInsight | null {
  const byProduct = groupByProduct(input.prices)
  const products = productById(input.products)
  let best: { productId: string; gap: number; min: { store: string; price: number }; max: { store: string; price: number } } | null = null
  for (const [productId, prices] of byProduct) {
    if (prices.length < 3) continue
    const byStore = lastPriceByStore(prices)
    const realStores = [...byStore.entries()].filter(([store]) => store !== 'Sin tienda concreta')
    if (realStores.length < 2) continue
    const sorted = [...realStores].sort((a, b) => a[1].price - b[1].price)
    const min = { store: sorted[0][0], price: sorted[0][1].price }
    const max = { store: sorted[sorted.length - 1][0], price: sorted[sorted.length - 1][1].price }
    const gap = max.price - min.price
    if (gap < 0.05) continue
    if (!best || gap > best.gap || (gap === best.gap && productId < best.productId)) best = { productId, gap, min, max }
  }
  if (!best) return null
  const product = products.get(best.productId)
  if (!product) return null
  return {
    kind: 'precio_minimo_tienda',
    text: `${product.displayName} lo has pagado más barato en ${best.min.store}: ${best.min.price.toFixed(2)} €. En otra compra llegó a costarte ${best.max.price.toFixed(2)} €.`,
    moreInfo: moreInfoFor(product),
  }
}

// ---------------------------------------------------------------------
// TIPO 4 — producto que empieza a ser habitual: aparece en casi todas
// las últimas N compras (recibos) de la familia, Y toda su historia de
// compra cabe dentro de esa ventana reciente (si tuviera historia más
// antigua ya sería un producto habitual de siempre, no "emergente").
// ---------------------------------------------------------------------
export function findEmergingProduct(input: Input): ShoppingInsight | null {
  const receiptDates = new Map<string, string>()
  for (const p of input.prices) {
    if (!p.receiptId) continue
    const current = receiptDates.get(p.receiptId)
    if (!current || p.recordedDate > current) receiptDates.set(p.receiptId, p.recordedDate)
  }
  const recentReceipts = [...receiptDates.entries()].sort((a, b) => b[1].localeCompare(a[1]))
  const windowSize = Math.min(5, recentReceipts.length)
  if (windowSize < 4) return null
  const recentReceiptIds = new Set(recentReceipts.slice(0, windowSize).map(([id]) => id))

  const byProduct = groupByProduct(input.prices)
  const products = productById(input.products)
  let best: { productId: string; appearances: number } | null = null
  for (const [productId, prices] of byProduct) {
    const receiptsForProduct = new Set(prices.filter((p) => p.receiptId).map((p) => p.receiptId as string))
    const appearances = [...receiptsForProduct].filter((id) => recentReceiptIds.has(id)).length
    if (appearances < windowSize - 1) continue
    // Toda la historia del producto cabe en la ventana reciente: si tuviera
    // recibos fuera de ella no sería "emergente", sería ya un habitual.
    if (receiptsForProduct.size !== appearances) continue
    if (!best || appearances > best.appearances || (appearances === best.appearances && productId < best.productId)) {
      best = { productId, appearances }
    }
  }
  if (!best) return null
  const product = products.get(best.productId)
  if (!product) return null
  return {
    kind: 'producto_emergente',
    text: `${product.displayName} ya aparece en ${best.appearances} de tus últimas ${windowSize} compras.`,
    moreInfo: moreInfoFor(product),
  }
}

// ---------------------------------------------------------------------
// TIPO 5 — producto habitual que ha desaparecido: era regular
// (avgDaysBetween conocido) y hace ya bastante más de lo normal que no
// se compra.
// ---------------------------------------------------------------------
export function findDisappearedProduct(input: Input, now: Date): ShoppingInsight | null {
  const nowStr = now.toISOString().slice(0, 10)
  const byProduct = groupByProduct(input.prices)
  const products = productById(input.products)
  let best: { productId: string; daysSinceLast: number } | null = null
  for (const [productId, prices] of byProduct) {
    if (prices.length < 3) continue
    const sorted = [...prices].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].recordedDate, sorted[i].recordedDate))
    const avgDaysBetween = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const lastDate = sorted[sorted.length - 1].recordedDate
    const daysSinceLast = daysBetween(lastDate, nowStr)
    if (daysSinceLast <= 30 || daysSinceLast <= avgDaysBetween * 2) continue
    if (!best || daysSinceLast > best.daysSinceLast || (daysSinceLast === best.daysSinceLast && productId < best.productId)) {
      best = { productId, daysSinceLast }
    }
  }
  if (!best) return null
  const product = products.get(best.productId)
  if (!product) return null
  return {
    kind: 'producto_desaparecido',
    text: `Hace más de un mes que no compras ${product.displayName}, aunque antes aparecía con frecuencia.`,
    moreInfo: moreInfoFor(product),
  }
}

// ---------------------------------------------------------------------
// TIPO 6 — compra repetida antes de lo habitual: el último intervalo es
// mucho más corto que la media de los intervalos anteriores.
// ---------------------------------------------------------------------
export function findEarlyRepurchase(input: Input): ShoppingInsight | null {
  const byProduct = groupByProduct(input.prices)
  const products = productById(input.products)
  let best: { productId: string; lastGap: number; avgPrior: number; ratio: number } | null = null
  for (const [productId, prices] of byProduct) {
    if (prices.length < 4) continue
    const sorted = [...prices].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].recordedDate, sorted[i].recordedDate))
    const lastGap = gaps[gaps.length - 1]
    const priorGaps = gaps.slice(0, -1)
    if (priorGaps.length < 2) continue
    const avgPrior = priorGaps.reduce((a, b) => a + b, 0) / priorGaps.length
    if (avgPrior < 5 || lastGap < 1) continue
    const ratio = lastGap / avgPrior
    if (ratio >= 0.5) continue
    if (!best || ratio < best.ratio || (ratio === best.ratio && productId < best.productId)) {
      best = { productId, lastGap, avgPrior, ratio }
    }
  }
  if (!best) return null
  const product = products.get(best.productId)
  if (!product) return null
  return {
    kind: 'recompra_anticipada',
    text: `Has vuelto a comprar ${product.displayName} solo ${best.lastGap} ${best.lastGap === 1 ? 'día' : 'días'} después. Normalmente pasan unos ${Math.round(best.avgPrior)} días entre compras.`,
    moreInfo: moreInfoFor(product),
  }
}

// ---------------------------------------------------------------------
// TIPO 7 — cesta habitual: productos claramente recurrentes (nunca
// cuánto ha subido/bajado la cesta — eso es "¿Por qué ha cambiado mi
// compra?"). Sin moreInfo: es un agregado, no hay un único producto al
// que enlazar.
// ---------------------------------------------------------------------
export function findCoreBasket(input: Input): ShoppingInsight | null {
  const byProduct = groupByProduct(input.prices)
  const products = productById(input.products)
  const recurring = [...byProduct.entries()]
    .filter(([, prices]) => prices.length >= 4)
    .map(([productId, prices]) => ({ productId, count: prices.length, name: products.get(productId)?.displayName }))
    .filter((x): x is { productId: string; count: number; name: string } => x.name != null)
    .sort((a, b) => b.count - a.count || a.productId.localeCompare(b.productId))
  if (recurring.length < 3) return null
  const shown = recurring.slice(0, 5).map((x) => x.name)
  const suffix = recurring.length > shown.length ? '…' : ''
  return {
    kind: 'cesta_habitual',
    text: `Estos ${recurring.length} productos forman el núcleo de tu compra: aparecen de forma recurrente en tus tickets (${shown.join(', ')}${suffix}).`,
  }
}

// ---------------------------------------------------------------------
// TIPO 8 — dónde concentras cada tipo de compra. Usa product.category
// YA GUARDADO (manual o legado) tal cual — no invoca el resolutor
// central resolveProductClassSafe (necesita family_food_types +
// aprendizaje compartido, fuera de alcance de este análisis ligero de
// hábitos): los productos sin category guardada simplemente no
// participan, no se adivina ninguna clase. Sin moreInfo: agregado por
// categoría, no un único producto.
// ---------------------------------------------------------------------
export function findCategoryStoreConcentration(input: Input): ShoppingInsight | null {
  const products = productById(input.products)
  const byCategory = new Map<string, Map<string, number>>()
  for (const p of input.prices) {
    if (!p.store) continue
    const product = products.get(p.productId)
    const category = product?.category?.trim()
    if (!category) continue
    const byStore = byCategory.get(category) ?? new Map<string, number>()
    byStore.set(p.store, (byStore.get(p.store) ?? 0) + 1)
    byCategory.set(category, byStore)
  }
  interface Candidate {
    category: string
    store: string
    share: number
  }
  const candidates: Candidate[] = []
  for (const [category, byStore] of byCategory) {
    const total = [...byStore.values()].reduce((a, b) => a + b, 0)
    if (total < 5) continue
    const [store, count] = [...byStore.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    const share = count / total
    if (share < 0.6) continue
    candidates.push({ category, store, share })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.share - a.share || a.category.localeCompare(b.category))
  const first = candidates[0]
  const second = candidates.find((c) => c.store !== first.store)
  if (second) {
    return {
      kind: 'categoria_por_tienda',
      text: `La mayoría de tus productos de ${first.category} los compras en ${first.store}, mientras que los de ${second.category} aparecen más en ${second.store}.`,
    }
  }
  return {
    kind: 'categoria_por_tienda',
    text: `La mayoría de tus productos de ${first.category} los compras en ${first.store}.`,
  }
}

// ---------------------------------------------------------------------
// Orquestador — solo incluye los tipos para los que hay datos
// suficientes y fiables; nunca rellena artificialmente hasta 8.
// ---------------------------------------------------------------------
export function buildShoppingInsights(input: Input, now: Date = new Date()): ShoppingInsight[] {
  const results = [
    findCheapestStoreForHabituals(input),
    findMostFrequentProduct(input, now),
    findBestPriceGapProduct(input),
    findEmergingProduct(input),
    findDisappearedProduct(input, now),
    findEarlyRepurchase(input),
    findCoreBasket(input),
    findCategoryStoreConcentration(input),
  ]
  return results.filter((r): r is ShoppingInsight => r !== null)
}
