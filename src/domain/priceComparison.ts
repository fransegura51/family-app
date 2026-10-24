// COMPARADOR INTELIGENTE DE PRECIOS entre establecimientos, a partir de las compras de LA PROPIA FAMILIA (nunca un catálogo global de precios).
//
// Capas, de abajo arriba (todo puro y reutilizable por tickets, compras manuales, historial y lista de la compra):
//   productIdentity.ts → ¿idéntico / equivalente / posible / distinto?        productSize.ts → €/kg, €/l, €/ud, €/envase
//   relationBetween    → decisión de la FAMILIA > equivalencia compartida validada > inferencia automática > sugerencia
//   productPriceView   → último precio por tienda, diferencias y evolución (ficha del producto)
//   compareShoppingList→ total estimado de la lista por tienda, con cobertura y sin favorecer a quien tiene menos precios
//
// Reglas de honestidad: sin tamaño fiable no hay comparación exacta; un precio de otra magnitud (€/kg frente a €/l) no se mezcla; los
// precios son HISTÓRICOS (lo que pagó esta familia), nunca ofertas vigentes; una tienda con menos productos con precio no gana por tener
// un total más bajo.
import { productTextKey } from './productText'
import { compareProducts, type ProductRelation } from './productIdentity'
import { normalizeMeasurementUnit } from './measurementUnit'
import { basisLabel, normalizePrice, parseProductSize, type NormalizedPrice, type UnitPriceBasis } from './productSize'

export interface CmpProduct {
  id: string
  displayName: string
  brand?: string | null
  /** Clave CAT-1 de la clase (food.lacteos_huevos...) si se conoce: solo sirve para descartar. */
  classKey?: string | null
}

export interface CmpPrice {
  productId: string
  /** Precio por magnitud (por unidad comprada, o por kg si unit='kg'), como en product_prices. */
  price: number
  store: string | null
  unit: string | null
  recordedDate: string
}

export type DecisionRelation = 'same' | 'equivalent' | 'different'
/** Decisión explícita de la FAMILIA sobre dos de sus productos (equivalencia personalizada). Manda sobre todo lo demás. */
export interface FamilyDecision {
  productA: string
  productB: string
  relation: DecisionRelation
}
/** Equivalencia compartida entre familias (solo nombres normalizados; sin precios ni datos de nadie). */
export interface SharedEquivalence {
  keyA: string
  keyB: string
  level: 'validated' | 'provisional' | 'blocked'
}
export interface RelationContext {
  decisions?: readonly FamilyDecision[]
  shared?: readonly SharedEquivalence[]
}

export type RelationSource = 'family' | 'shared' | 'inferred'
export interface ProductLink {
  relation: ProductRelation
  source: RelationSource
  /** true = se aplica sola; false = SUGERENCIA que la familia puede confirmar o rechazar. */
  automatic: boolean
  reasons: string[]
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function relationBetween(a: CmpProduct, b: CmpProduct, ctx: RelationContext = {}): ProductLink {
  if (a.id === b.id) return { relation: 'identical', source: 'inferred', automatic: true, reasons: ['el mismo producto'] }

  // 1. La familia manda: lo que confirmó o rechazó a mano.
  const decision = ctx.decisions?.find((d) => pairKey(d.productA, d.productB) === pairKey(a.id, b.id))
  if (decision) {
    const relation: ProductRelation = decision.relation === 'same' ? 'identical' : decision.relation === 'equivalent' ? 'equivalent' : 'different'
    return { relation, source: 'family', automatic: true, reasons: ['así lo habéis indicado en vuestra familia'] }
  }

  const inferred = compareProducts({ name: a.displayName, brand: a.brand }, { name: b.displayName, brand: b.brand }, { a: a.classKey, b: b.classKey })

  // 2. Equivalencia compartida: validada (varias familias) se aplica; provisional solo sugiere; bloqueada descarta.
  const ka = productTextKey(a.displayName)
  const kb = productTextKey(b.displayName)
  const shared = ctx.shared?.find((s) => pairKey(s.keyA, s.keyB) === pairKey(ka, kb))
  if (shared) {
    if (shared.level === 'blocked') return { relation: 'different', source: 'shared', automatic: true, reasons: ['otras familias han indicado que son distintos'] }
    if (shared.level === 'validated') return { relation: 'equivalent', source: 'shared', automatic: true, reasons: ['varias familias coinciden en que son equivalentes'] }
    if (inferred.relation !== 'different') {
      return inferred.relation === 'identical' || inferred.relation === 'equivalent'
        ? { relation: inferred.relation, source: 'inferred', automatic: true, reasons: inferred.reasons }
        : { relation: 'possible', source: 'shared', automatic: false, reasons: ['otra familia los ha marcado como equivalentes'] }
    }
  }

  // 3. Inferencia por el nombre.
  return { relation: inferred.relation, source: 'inferred', automatic: inferred.relation === 'identical' || inferred.relation === 'equivalent', reasons: inferred.reasons }
}

export type GroupScope = 'identical' | 'equivalent'

export interface GroupMember {
  product: CmpProduct
  link: ProductLink
}

/** Productos de la familia que cuentan como el mismo (scope 'identical') o equivalentes (scope 'equivalent') que `target`, y sugerencias aparte. */
export function equivalentGroup(
  target: CmpProduct,
  all: readonly CmpProduct[],
  ctx: RelationContext = {},
  scope: GroupScope = 'equivalent',
): { members: GroupMember[]; suggestions: GroupMember[] } {
  const members: GroupMember[] = []
  const suggestions: GroupMember[] = []
  for (const p of all) {
    const link = relationBetween(target, p, ctx)
    if (link.relation === 'different') continue
    if (link.automatic && (link.relation === 'identical' || (scope === 'equivalent' && link.relation === 'equivalent'))) members.push({ product: p, link })
    else if (link.relation === 'possible' || (link.automatic && link.relation === 'equivalent')) suggestions.push({ product: p, link })
  }
  members.sort((x, y) => (x.product.id === target.id ? -1 : y.product.id === target.id ? 1 : 0))
  return { members, suggestions }
}

// ─── Ficha del producto: precios por establecimiento ───

export const NO_STORE = 'Sin tienda concreta'

export interface StorePricePoint {
  date: string
  productId: string
  productName: string
  price: NormalizedPrice
}
export interface StorePriceRow {
  store: string
  last: StorePricePoint
  history: StorePricePoint[]
  /** Diferencia de precio normalizado con el más barato, en % (0 para el más barato). */
  diffVsCheapestPct: number | null
  /** Evolución en esa tienda: primer → último precio comparable, en %. */
  trendPct: number | null
}
export interface ProductPriceView {
  basis: UnitPriceBasis | null
  rows: StorePriceRow[]
  cheapestStore: string | null
  /** Registros que no se pudieron comparar de forma exacta (otra magnitud o sin tamaño fiable); siguen guardados tal cual. */
  notComparable: number
  /** Explicación cuando no se puede dar una comparación exacta. */
  note: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const pct = (from: number, to: number) => (from > 0 ? Math.round(((to - from) / from) * 1000) / 10 : null)

export function productPriceView(members: readonly CmpProduct[], prices: readonly CmpPrice[]): ProductPriceView {
  const nameOf = new Map(members.map((m) => [m.id, m.displayName]))
  const points: (StorePricePoint & { store: string })[] = []
  for (const r of prices) {
    const name = nameOf.get(r.productId)
    if (name == null || !(r.price >= 0)) continue
    points.push({ store: r.store?.trim() || NO_STORE, date: r.recordedDate, productId: r.productId, productName: name, price: normalizePrice(r, name) })
  }
  if (points.length === 0) return { basis: null, rows: [], cheapestStore: null, notComparable: 0, note: 'Todavía no hay compras registradas de este producto.' }

  // Base de comparación: la del registro exacto más reciente.
  const exact = points.filter((p) => p.price.exact).sort((a, b) => a.date.localeCompare(b.date))
  if (exact.length === 0) {
    return { basis: null, rows: [], cheapestStore: null, notComparable: points.length, note: 'Falta el tamaño del envase en el nombre (por ejemplo «1 L» o «500 g»): no se puede calcular una comparación exacta.' }
  }
  const basis = exact[exact.length - 1].price.basis
  const usable = exact.filter((p) => p.price.basis === basis)
  const notComparable = points.length - usable.length

  const byStore = new Map<string, StorePricePoint[]>()
  for (const p of usable) {
    const list = byStore.get(p.store) ?? []
    list.push(p)
    byStore.set(p.store, list)
  }
  const rows: StorePriceRow[] = [...byStore.entries()].map(([store, list]) => {
    const history = [...list].sort((a, b) => a.date.localeCompare(b.date))
    const first = history[0].price.value
    const last = history[history.length - 1]
    return { store, last, history, diffVsCheapestPct: null, trendPct: history.length >= 2 ? pct(first, last.price.value) : null }
  })
  const real = rows.filter((r) => r.store !== NO_STORE)
  const cheapest = real.length > 0 ? real.reduce((m, r) => (r.last.price.value < m.last.price.value ? r : m)) : null
  for (const r of rows) r.diffVsCheapestPct = cheapest && r.store !== NO_STORE ? pct(cheapest.last.price.value, r.last.price.value) : null
  rows.sort((a, b) => a.last.price.value - b.last.price.value)
  return {
    basis,
    rows,
    cheapestStore: cheapest && real.length >= 2 ? cheapest.store : null,
    notComparable,
    note: notComparable > 0 ? `${notComparable} ${notComparable === 1 ? 'compra no se incluye' : 'compras no se incluyen'}: otro formato o sin tamaño fiable.` : null,
  }
}

// ─── Lista de la compra: total estimado por establecimiento ───

export interface ListItem {
  name: string
  /** Cantidad escrita en la lista («2», «1,5»); null = 1. */
  quantity: string | null
  unit: string | null
}

export const STALE_PRICE_DAYS = 60
export const MIN_COMMON_ITEMS = 3
const FULL_COVERAGE = 1

export interface ItemStorePrice {
  store: string
  /** Coste estimado del artículo en esa tienda (cantidad × precio). */
  cost: number
  date: string
  basedOnProduct: string
  /** true = el precio sale de un producto EQUIVALENTE (otra marca o tamaño), no del mismo. */
  equivalent: boolean
}
export interface ItemComparison {
  item: ListItem
  /** Producto de la familia al que corresponde el artículo (null = no se reconoce). */
  productId: string | null
  prices: ItemStorePrice[]
  reason: string | null
}
export interface StoreTotal {
  store: string
  covered: number
  total: number
  complete: boolean
  oldestDate: string | null
  newestDate: string | null
  stale: boolean
}
export type CompareMode = 'full' | 'common' | 'insufficient'
export interface ListComparison {
  itemCount: number
  items: ItemComparison[]
  stores: StoreTotal[]
  mode: CompareMode
  /** Totales de las tiendas comparadas (completos, o sobre el conjunto común), de menor a mayor. */
  ranking: { store: string; total: number }[]
  commonCount: number
  cheapest: string | null
  /** Diferencia (€) entre la más barata y la siguiente; null si no hay con qué comparar. */
  savingVsNext: number | null
  hasStale: boolean
  note: string
}

function parseQty(q: string | null): number | null {
  if (q == null || q.trim() === '') return 1
  const n = Number(q.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function daysBetween(from: string, to: Date): number {
  const [y, m, d] = from.split('-').map(Number)
  return Math.floor((to.getTime() - Date.UTC(y, m - 1, d)) / 86_400_000)
}

export function compareShoppingList(
  list: readonly ListItem[],
  products: readonly CmpProduct[],
  prices: readonly CmpPrice[],
  ctx: RelationContext = {},
  now: Date = new Date(),
): ListComparison {
  const pricesByProduct = new Map<string, CmpPrice[]>()
  for (const p of prices) {
    const l = pricesByProduct.get(p.productId) ?? []
    l.push(p)
    pricesByProduct.set(p.productId, l)
  }
  const allStores = new Set<string>()
  for (const p of prices) if (p.store?.trim()) allStores.add(p.store.trim())

  const items: ItemComparison[] = list.map((item): ItemComparison => {
    // 1. ¿Qué producto de la familia es este artículo? Mismo texto, o idéntico por nombre (nunca solo «equivalente»).
    const key = productTextKey(item.name)
    const ref: CmpProduct | undefined =
      products.find((p) => productTextKey(p.displayName) === key) ??
      products.find((p) => relationBetween({ id: '__item__', displayName: item.name }, p, ctx).relation === 'identical')
    if (!ref) return { item, productId: null, prices: [], reason: 'No es un producto que hayáis comprado antes' }
    const qty = parseQty(item.quantity)
    if (qty == null) return { item, productId: ref.id, prices: [], reason: 'Cantidad no válida' }

    const { members } = equivalentGroup(ref, products, ctx, 'equivalent')
    const refSize = parseProductSize(ref.displayName)
    const listUnit = normalizeMeasurementUnit(item.unit)
    const best = new Map<string, ItemStorePrice & { dateNum: string }>()
    for (const m of members) {
      for (const r of pricesByProduct.get(m.product.id) ?? []) {
        const store = r.store?.trim()
        if (!store) continue
        const norm = normalizePrice(r, m.product.displayName)
        let cost: number | null = null
        if (norm.basis === 'kg' && norm.size == null) {
          // Vendido por peso: solo si el artículo también se pide en kg.
          if (listUnit === 'kg') cost = norm.value * qty
        } else if (m.product.id === ref.id || (norm.exact && refSize)) {
          // Mismo producto: el precio del envase tal cual. Equivalente con otro tamaño: contenido del artículo × precio normalizado.
          if (m.product.id === ref.id || (norm.size && refSize && norm.size.magnitude === refSize.magnitude)) {
            cost = m.product.id === ref.id ? (norm.packagePrice ?? norm.value) * qty : norm.value * (refSize!.magnitude === 'unidades' ? refSize!.amount : refSize!.amount / 1000) * qty
          }
        } else if (members.length > 0 && m.link.relation === 'identical') {
          cost = (norm.packagePrice ?? norm.value) * qty // idéntico (misma presentación) sin tamaño legible
        }
        if (cost == null) continue
        const prev = best.get(store)
        if (!prev || r.recordedDate > prev.dateNum) {
          best.set(store, { store, cost: round2(cost), date: r.recordedDate, dateNum: r.recordedDate, basedOnProduct: m.product.displayName, equivalent: m.product.id !== ref.id })
        }
      }
    }
    const out = [...best.values()].map(({ dateNum: _d, ...rest }) => rest)
    return { item, productId: ref.id, prices: out, reason: out.length === 0 ? 'Sin precio comparable (falta el tamaño o no se compró en ninguna tienda)' : null }
  })

  const stores: StoreTotal[] = [...allStores].sort().map((store) => {
    const priced = items.flatMap((i) => i.prices.filter((p) => p.store === store))
    const dates = priced.map((p) => p.date).sort()
    const oldest = dates[0] ?? null
    return {
      store,
      covered: priced.length,
      total: round2(priced.reduce((s, p) => s + p.cost, 0)),
      complete: items.length > 0 && priced.length / items.length >= FULL_COVERAGE,
      oldestDate: oldest,
      newestDate: dates[dates.length - 1] ?? null,
      stale: oldest != null && daysBetween(oldest, now) > STALE_PRICE_DAYS,
    }
  }).filter((s) => s.covered > 0)

  const complete = stores.filter((s) => s.complete)
  const tooFew = (n: number) => n < 2
  let mode: CompareMode = 'insufficient'
  let ranking: { store: string; total: number }[] = []
  let commonCount = 0
  let note = ''
  if (items.length === 0) note = 'La lista está vacía.'
  else if (!tooFew(complete.length)) {
    mode = 'full'
    ranking = complete.map((s) => ({ store: s.store, total: s.total })).sort((a, b) => a.total - b.total)
    commonCount = items.length
    note = 'Total de la lista completa con vuestros precios históricos.'
  } else {
    // Conjunto común: artículos con precio en TODAS las tiendas que se comparan (las que cubren más artículos).
    const sorted = [...stores].sort((x, y) => y.covered - x.covered || x.store.localeCompare(y.store))
    for (let k = Math.min(4, sorted.length); k >= 2; k--) {
      const candidates = sorted.slice(0, k)
      const common = items.filter((i) => candidates.every((c) => i.prices.some((p) => p.store === c.store)))
      if (common.length < MIN_COMMON_ITEMS) continue
      mode = 'common'
      commonCount = common.length
      ranking = candidates
        .map((c) => ({ store: c.store, total: round2(common.reduce((sum, i) => sum + (i.prices.find((p) => p.store === c.store)?.cost ?? 0), 0)) }))
        .sort((x, y) => x.total - y.total)
      note = `Solo se comparan los ${common.length} artículos con precio conocido en todas las tiendas (de ${items.length}).`
      break
    }
    if (mode === 'insufficient') note = 'Todavía no hay precios suficientes para comparar la lista entre tiendas.'
  }
  const cheapest = mode === 'insufficient' || ranking.length === 0 ? null : ranking[0].store
  const savingVsNext = ranking.length >= 2 ? round2(ranking[1].total - ranking[0].total) : null
  const used = new Set(ranking.map((r) => r.store))
  const hasStale = stores.some((s) => used.has(s.store) && s.stale)
  return { itemCount: items.length, items, stores, mode, ranking, commonCount, cheapest, savingVsNext, hasStale, note }
}

export { basisLabel }
