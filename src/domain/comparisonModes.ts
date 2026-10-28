// LOS DOS MODOS DEL COMPARADOR (NORM-3). Lógica pura, sin red.
//
//   · Productos idénticos     el MISMO producto (misma identidad del catálogo y misma marca) entre tiendas, fechas, formatos y packs. Parte de los productos comunes que la
//                             familia ya tiene (se respetan tal cual) y añade, sin que nadie tenga que emparejar nada, los artículos que el catálogo identifica con seguridad.
//   · Alternativas comparables  productos DISTINTOS de una misma familia funcional (cervezas, refrescos, leches…) para ver qué marca, variedad o formato sale mejor.
//
// Nada se guarda aquí ni se toca ninguna compra: son vistas calculadas con el normalizador común (catalog/identify) y el cálculo de precios de siempre (commonResult).
import { alternativeFamilyOf, alternativeFamilyClassName } from './catalog/families'
import { CATALOG_CLASSES, catalogClass } from './catalog/classes'
import { identifyProduct, type ProductIdentity } from './catalog/identify'
import { commonResult, memberFormats, type CommonMember, type CommonProduct, type CommonResult, type MemberFormat, type Offering } from './commonProducts'
import { describePack } from './packFormat'
import type { RelationContext } from './priceComparison'
import { toCmpPrice, toCmpProduct } from './priceComparisonAdapters'
import { productTextKey } from './productText'
import type { ParsedSize, UnitPriceBasis } from './productSize'
import type { Product, ProductPrice } from './types'

export type CompareMode = 'identicos' | 'alternativas'
export type CompareSort = 'categoria' | 'az' | 'precio' | 'frecuencia'

export const COMPARE_MODES: readonly CompareMode[] = ['identicos', 'alternativas']
export const COMPARE_SORTS: readonly CompareSort[] = ['categoria', 'az', 'precio', 'frecuencia']
export const SORT_LABEL: Record<CompareSort, string> = { categoria: 'Por categoría', az: 'A–Z', precio: 'Precio por unidad', frecuencia: 'Más comprados' }

export interface ComparisonRow {
  key: string
  productId: string
  priceId: string | null
  /** Nombre normalizado del producto con su marca y variante («Leche semidesnatada · Pascual»); si no se reconoce, el texto del ticket. */
  label: string
  /** Texto original del artículo (nunca se toca). */
  rawName: string
  store: string
  date: string
  /** «6 × 25 cl = 1,5 l» o «sin formato». */
  packText: string
  pack: Offering['pack']
  /** Precio pagado por la presentación, tal cual el ticket. */
  totalPrice: number
  /** Precio por kilo, litro o unidad; null si no se puede normalizar (sin formato). */
  normalized: number | null
  basis: UnitPriceBasis | null
  /** 'normalizada' = en la unidad de comparación del grupo; 'otra-unidad' = exacta pero de otra magnitud; 'sin-formato' = falta el formato. */
  state: 'normalizada' | 'otra-unidad' | 'sin-formato'
  cheapest: boolean
  diffPct: number | null
  /** Otros artículos del grupo que son exactamente el mismo producto. */
  sameAs: string[]
}

export interface ModeGroup {
  id: string
  /** 'comun' = producto común de la familia; 'identidad' = el catálogo lo identifica con seguridad; 'familia' = alternativas comparables. */
  origin: 'comun' | 'identidad' | 'familia'
  name: string
  classKey: string | null
  className: string
  common: CommonProduct
  /** true = calculado al vuelo (no hay producto común guardado): no se puede renombrar ni eliminar. */
  virtual: boolean
  result: CommonResult
  formats: MemberFormat[]
  rows: ComparisonRow[]
  productIds: string[]
  /** Compras distintas (una compra con varias presentaciones cuenta una vez). */
  purchases: number
  /** Menor precio normalizado del grupo, si es fiable. */
  best: { value: number; basis: UnitPriceBasis; store: string } | null
  /** Productos distintos dentro del grupo (en alternativas, cuántas marcas o variedades). */
  distinctProducts: number
}

export interface ModeInput {
  products: readonly Product[]
  prices: readonly ProductPrice[]
  commons: readonly CommonProduct[]
  members: readonly CommonMember[]
  skipped?: readonly string[]
  ctx?: RelationContext
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const BASIS_RANK: Record<UnitPriceBasis, number> = { l: 0, kg: 1, ud: 2, envase: 3 }

/** El catálogo identifica el artículo con seguridad (o la familia lo confirmó) y con todos sus datos: se puede comparar sin emparejarlo a mano. */
export function hasReliableIdentity(p: Pick<Product, 'displayName' | 'brand' | 'catalogProductKey'>): boolean {
  return identifyProduct(p.displayName, p.brand, p.catalogProductKey).identityKey != null
}

/** Nombre para mostrar: producto normalizado + palabras que lo distinguen + marca; el texto del ticket si el catálogo no lo reconoce. */
export function productLabel(p: Pick<Product, 'displayName' | 'brand' | 'catalogProductKey'>, id: ProductIdentity = identifyProduct(p.displayName, p.brand, p.catalogProductKey)): string {
  if (!id.entry || id.entry.broad || id.confidence === 'dudoso' || !id.name) return p.displayName
  const variant = id.leftover.length > 0 ? ` ${id.leftover.join(' ')}` : ''
  const brand = id.brand ? ` · ${cap(id.brand)}` : ''
  return `${id.name}${variant}${brand}`
}

function identicalKey(id: ProductIdentity): string | null {
  return id.identityKey != null ? `${id.identityKey}|${id.brand ?? ''}` : null
}

// Nombre de cada clase del catálogo → su clave; «Lácteos y huevos» es el nombre histórico de «Lácteos» (la 0294 lo cambió) y puede seguir en datos antiguos.
const CLASS_KEY_BY_NAME = new Map<string, string>([...CATALOG_CLASSES.map((c) => [productTextKey(c.name), c.key] as [string, string]), [productTextKey('Lácteos y huevos'), 'food.lacteos_huevos']])

/** Categoría de un artículo: la que la familia confirmó (la misma que ven Compras y Economía) y, si no hay, la del catálogo. Una clase propia de la familia se respeta tal cual. */
function classKeyOf(p: Product, id: ProductIdentity): string | null {
  const confirmed = p.classConfirmedAt ? p.category?.trim() : ''
  if (confirmed) return CLASS_KEY_BY_NAME.get(productTextKey(confirmed)) ?? `custom:${confirmed}`
  return id.entry && !id.entry.broad ? id.classKey : null
}

function classNameOf(key: string | null): string {
  if (!key) return 'Sin categoría'
  return catalogClass(key)?.name ?? (key.startsWith('custom:') ? key.slice(7) : 'Sin categoría')
}

function majorityClass(keys: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** Formato leído del NOMBRE cuando la compra no tiene uno guardado, con el mismo estilo en todas las filas («5 kg», «750 ml», «6 uds»). */
function sizeText(size: ParsedSize): string {
  const n = (v: number) => String(Math.round(v * 1000) / 1000).replace('.', ',')
  if (size.magnitude === 'peso') return size.amount >= 1000 ? `${n(size.amount / 1000)} kg` : `${n(size.amount)} g`
  if (size.magnitude === 'volumen') return size.amount >= 1000 ? `${n(size.amount / 1000)} l` : `${n(size.amount)} ml`
  return `${n(size.amount)} ${size.amount === 1 ? 'ud' : 'uds'}`
}

function packLabel(o: Offering, state: ComparisonRow['state']): string {
  if (o.pack) return describePack(o.pack)
  if (o.normalized.size) return `${sizeText(o.normalized.size)} (del nombre)`
  return state !== 'sin-formato' && o.normalized.basis === 'kg' ? 'al peso' : 'sin formato'
}

function purchaseCount(prices: readonly ProductPrice[]): number {
  return new Set(prices.map((p) => p.receiptId ?? `${p.recordedDate}|${(p.store ?? '').trim().toLowerCase()}`)).size
}

function buildGroup(
  origin: ModeGroup['origin'],
  common: CommonProduct,
  virtual: boolean,
  products: readonly Product[],
  prices: readonly ProductPrice[],
  ctx: RelationContext,
  classKey: string | null,
): ModeGroup | null {
  const own = prices.filter((p) => products.some((x) => x.id === p.productId))
  if (own.length === 0) return null
  const cmpProducts = products.map(toCmpProduct)
  const cmpPrices = own.map(toCmpPrice)
  const result = commonResult(common, cmpProducts, cmpPrices, ctx)
  const formats = memberFormats(cmpProducts, cmpPrices, result.basis)
  const byId = new Map(products.map((p) => [p.id, p]))
  const toRow = (o: Offering, state: ComparisonRow['state']): ComparisonRow => {
    const p = byId.get(o.productId)
    return {
      key: `${o.productId}|${o.store}|${o.date}|${o.pack ? describePack(o.pack) : 'sin'}`,
      productId: o.productId,
      priceId: o.priceId,
      label: p ? productLabel(p) : o.productName,
      rawName: p?.displayName ?? o.productName,
      store: o.store,
      date: o.date,
      packText: packLabel(o, state),
      pack: o.pack,
      totalPrice: o.totalPrice,
      normalized: state === 'sin-formato' ? null : o.normalized.value,
      basis: state === 'sin-formato' ? null : o.normalized.basis,
      state,
      cheapest: o.cheapest,
      diffPct: o.diffPct,
      sameAs: o.sameAs,
    }
  }
  const rows = [...result.offers.map((o) => toRow(o, 'normalizada')), ...result.otherUnit.map((o) => toRow(o, 'otra-unidad')), ...result.unformatted.map((o) => toRow(o, 'sin-formato'))]
  const head = result.reliable && result.basis && result.offers.length > 0 ? result.offers[0] : null
  return {
    id: common.id,
    origin,
    name: common.name,
    classKey,
    className: classNameOf(classKey),
    common,
    virtual,
    result,
    formats,
    rows,
    productIds: products.map((p) => p.id),
    purchases: purchaseCount(own),
    best: head && result.basis ? { value: head.normalized.value, basis: result.basis, store: head.store } : null,
    distinctProducts: new Set(products.map((p) => identicalKey(identifyProduct(p.displayName, p.brand, p.catalogProductKey)) ?? p.id)).size,
  }
}

/** Grupos del modo «Productos idénticos». */
function identicalGroups(input: ModeInput, ctx: RelationContext): ModeGroup[] {
  const productById = new Map(input.products.map((p) => [p.id, p]))
  const priced = new Set(input.prices.map((p) => p.productId))
  const memberOf = new Map(input.members.map((m) => [m.productId, m.commonId]))
  const skipped = new Set(input.skipped ?? [])
  const identity = new Map(input.products.map((p) => [p.id, identifyProduct(p.displayName, p.brand, p.catalogProductKey)]))

  // Productos comunes de la familia, con los artículos que ya tienen.
  const byCommon = new Map<string, Product[]>()
  for (const m of input.members) {
    const p = productById.get(m.productId)
    if (p) byCommon.set(m.commonId, [...(byCommon.get(m.commonId) ?? []), p])
  }
  // Identidades que ya viven en un producto común: un artículo nuevo igual a uno de sus miembros se suma a ese grupo (no se crea otro).
  const commonOfKey = new Map<string, string>()
  for (const [cid, list] of byCommon) {
    for (const p of list) {
      const k = identicalKey(identity.get(p.id) as ProductIdentity)
      if (k && !commonOfKey.has(k)) commonOfKey.set(k, cid)
    }
  }

  const virtual = new Map<string, Product[]>()
  for (const p of input.products) {
    if (!priced.has(p.id) || memberOf.has(p.id) || skipped.has(p.id)) continue
    const key = identicalKey(identity.get(p.id) as ProductIdentity)
    if (!key) continue
    const cid = commonOfKey.get(key)
    if (cid) byCommon.set(cid, [...(byCommon.get(cid) ?? []), p])
    else virtual.set(key, [...(virtual.get(key) ?? []), p])
  }

  const out: ModeGroup[] = []
  for (const c of input.commons) {
    const list = byCommon.get(c.id) ?? []
    if (list.length === 0) continue
    const g = buildGroup('comun', c, false, list, input.prices, ctx, majorityClass(list.map((p) => classKeyOf(p, identity.get(p.id) as ProductIdentity))))
    if (g) out.push(g)
  }
  for (const [key, list] of virtual) {
    const id = identity.get(list[0].id) as ProductIdentity
    const common: CommonProduct = { id: `ident:${key}`, name: productLabel(list[0], id), normalizedName: productTextKey(key), status: 'confirmed' }
    const g = buildGroup('identidad', common, true, list, input.prices, ctx, majorityClass(list.map((p) => classKeyOf(p, identity.get(p.id) as ProductIdentity))))
    if (g) out.push(g)
  }
  return out
}

/** Grupos del modo «Alternativas comparables»: una familia por necesidad de compra, con cada producto distinto dentro. */
function alternativeGroups(input: ModeInput, ctx: RelationContext): ModeGroup[] {
  const priced = new Set(input.prices.map((p) => p.productId))
  const families = new Map<string, { family: ReturnType<typeof alternativeFamilyOf>; products: Product[] }>()
  for (const p of input.products) {
    if (!priced.has(p.id)) continue
    const id = identifyProduct(p.displayName, p.brand, p.catalogProductKey)
    // Solo lo que el catálogo identifica con seguridad (o la familia confirmó): una propuesta dudosa no mezcla productos en una familia.
    if (!id.entry || id.entry.broad || id.confidence !== 'seguro') continue
    const family = alternativeFamilyOf(id.entry)
    const cur = families.get(family.id) ?? { family, products: [] }
    cur.products.push(p)
    families.set(family.id, cur)
  }
  const out: ModeGroup[] = []
  for (const { family, products } of families.values()) {
    const common: CommonProduct = { id: `alt:${family.id}`, name: family.name, normalizedName: productTextKey(family.name), status: 'confirmed' }
    const g = buildGroup('familia', common, true, products, input.prices, ctx, family.classKey)
    if (g) out.push({ ...g, className: alternativeFamilyClassName(family) })
  }
  return out
}

export function buildComparisonGroups(mode: CompareMode, input: ModeInput): ModeGroup[] {
  const ctx = input.ctx ?? {}
  return mode === 'identicos' ? identicalGroups(input, ctx) : alternativeGroups(input, ctx)
}

// ─── Orden y filtros ───

const byName = (a: ModeGroup, b: ModeGroup) => a.name.localeCompare(b.name, 'es')

export function sortGroups(groups: readonly ModeGroup[], sort: CompareSort): ModeGroup[] {
  const list = [...groups]
  switch (sort) {
    case 'az':
      return list.sort(byName)
    case 'frecuencia':
      return list.sort((a, b) => b.purchases - a.purchases || byName(a, b))
    case 'precio':
      // Lo que se puede comparar primero; entre unidades distintas (€/l, €/kg, €/ud) no se mezcla el orden: se agrupa por unidad y dentro, de menor a mayor.
      return list.sort((a, b) => {
        if (!a.best || !b.best) return a.best ? -1 : b.best ? 1 : byName(a, b)
        return BASIS_RANK[a.best.basis] - BASIS_RANK[b.best.basis] || a.best.value - b.best.value || byName(a, b)
      })
    default:
      return list.sort((a, b) => (a.classKey == null ? 1 : 0) - (b.classKey == null ? 1 : 0) || a.className.localeCompare(b.className, 'es') || byName(a, b))
  }
}

export interface GroupFilter {
  query?: string
  classKey?: string | null
  /** Solo grupos con algo que comparar (dos presentaciones normalizadas o más). */
  onlyComparable?: boolean
}

export function isComparable(g: ModeGroup): boolean {
  return g.result.offers.length >= 2
}

export function filterGroups(groups: readonly ModeGroup[], f: GroupFilter): ModeGroup[] {
  const q = productTextKey(f.query ?? '')
  return groups.filter((g) => {
    if (f.classKey && g.classKey !== f.classKey) return false
    if (f.onlyComparable && !isComparable(g)) return false
    if (!q) return true
    return productTextKey(g.name).includes(q) || productTextKey(g.className).includes(q) || g.rows.some((r) => productTextKey(r.label).includes(q) || productTextKey(r.rawName).includes(q) || productTextKey(r.store).includes(q))
  })
}

export interface GroupClassOption {
  key: string
  name: string
  count: number
}

export function groupClassOptions(groups: readonly ModeGroup[]): GroupClassOption[] {
  const counts = new Map<string, GroupClassOption>()
  for (const g of groups) {
    if (!g.classKey) continue
    const cur = counts.get(g.classKey) ?? { key: g.classKey, name: g.className, count: 0 }
    cur.count += 1
    counts.set(g.classKey, cur)
  }
  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Artículos que ya se comparan solos (identidad segura): no hace falta emparejarlos a mano. */
export function autoComparableIds(products: readonly Product[]): Set<string> {
  return new Set(products.filter(hasReliableIdentity).map((p) => p.id))
}
