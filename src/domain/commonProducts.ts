// PRODUCTOS COMUNES del comparador (COMP-3). Lógica pura.
//
// Un producto común («LECHE SEMIDESNATADA») agrupa artículos de distintas tiendas, marcas y formatos que SE PUEDEN COMPARAR entre sí. Cada artículo está en un solo
// producto común; no se emparejan de dos en dos. Lo que ya existía no se duplica:
//   · «es exactamente el mismo producto» / «distinto» sigue siendo la decisión de la familia entre dos artículos (product_equivalences) y la inferencia por nombre
//     (productIdentity). Aquí se reutilizan para PROPONER el producto común y para marcar en los resultados qué artículos son idénticos y cuáles solo comparables.
//   · Nada se asigna solo salvo cuando el artículo es IDÉNTICO a uno ya agrupado; todo lo demás es una sugerencia que la persona acepta, busca o descarta.
import { compareIdentities, identifyProduct, type ProductIdentity } from './catalog/identify'
import { productTextKey } from './productText'
import { productSignature } from './productIdentity'
import { normalizeMeasurementUnit } from './measurementUnit'
import { normalizePrice, packTotalSize, parseProductPack, type NormalizedPrice, type PackInput, type UnitPriceBasis } from './productSize'
import { relationBetween, type CmpPrice, type CmpProduct, type ProductLink, type RelationContext } from './priceComparison'
import type { ProductRelation } from './productIdentity'

export interface CommonProduct {
  id: string
  name: string
  normalizedName: string
  /** 'pending' = lo ha agrupado PEPA y la familia todavía no lo ha revisado. Sin valor = confirmado. */
  status?: 'confirmed' | 'pending'
}

export interface CommonMember {
  productId: string
  commonId: string
  source: 'sugerido' | 'manual' | 'auto' | 'pepa'
}

export function normalizeCommonName(name: string): string {
  return productTextKey(name)
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Nombre propuesto para un producto común nuevo a partir del artículo: sus palabras de producto sin marca ni tamaño, en el orden del nombre (editable). */
export function suggestCommonName(article: CmpProduct): string {
  const sig = productSignature(article.displayName, article.brand)
  const core = new Set(sig.core)
  const ordered = productTextKey(article.displayName)
    .split(' ')
    .filter((w) => w.length > 1 && !/^\d+$/.test(w))
  const seen = new Set<string>()
  const words: string[] = []
  for (const w of ordered) {
    const base = [...core].find((c) => c === w || w.startsWith(c) || c.startsWith(w))
    if (!base || seen.has(base)) continue
    seen.add(base)
    words.push(w)
    if (words.length >= 3) break
  }
  return cap(words.join(' ') || productTextKey(article.displayName))
}

export interface CommonSuggestion {
  common: CommonProduct
  /** Mayor = más fiable. */
  score: number
  relation: ProductRelation
  /** Frase corta del porqué. */
  reason: string
  /** El artículo con el que coincide (si viene de un miembro). */
  matchedWith: string | null
  /** true = idéntico a un artículo ya agrupado: puede asignarse sin preguntar. */
  automatic: boolean
}

const RELATION_SCORE: Record<ProductRelation, number> = { identical: 100, equivalent: 80, possible: 40, different: 0 }

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}

// Rasgos que hacen que sea OTRO producto: con y sin alcohol, lactosa, gluten, azúcar; entera, desnatada o semidesnatada; integral; light/zero.
const CRITICAL_VARIANTS = new Set(['alcohol', 'lactosa', 'gluten', 'azucar', 'azucares', 'zero', 'cero', 'light', 'entera', 'desnatada', 'semidesnatada', 'integral', 'proteina', 'proteinas'])
function critical(variants: readonly string[]): string[] {
  return variants.filter((v) => CRITICAL_VARIANTS.has(v)).sort()
}

/**
 * Productos comunes que podrían corresponder a un artículo, de más a menos fiables (máximo 3). Reutiliza las reglas de identidad y las decisiones de la familia:
 * leche entera y semidesnatada, con y sin alcohol, con y sin lactosa NUNCA se proponen juntas.
 */
export function suggestCommons(
  article: CmpProduct,
  commons: readonly CommonProduct[],
  members: readonly CommonMember[],
  products: readonly CmpProduct[],
  ctx: RelationContext = {},
): CommonSuggestion[] {
  const productById = new Map(products.map((p) => [p.id, p]))
  const membersByCommon = new Map<string, CmpProduct[]>()
  for (const m of members) {
    const p = productById.get(m.productId)
    if (!p || p.id === article.id) continue
    const list = membersByCommon.get(m.commonId) ?? []
    list.push(p)
    membersByCommon.set(m.commonId, list)
  }
  const sig = productSignature(article.displayName, article.brand)
  const mine = critical(sig.variants)
  const idArticle = identifyProduct(article.displayName, article.brand, article.catalogProductKey)
  const opinion = (id: ProductIdentity) => !!id.entry && !id.entry.broad && id.confidence !== 'dudoso'
  const out: CommonSuggestion[] = []
  for (const common of commons) {
    // El catálogo maestro corta las coincidencias genéricas: «QUESADILLA DE POLLO» no es «Pollo» ni «AQUARIUS ZERO» un refresco de cola zero. Solo se descarta cuando el catálogo
    // opina de TODAS las referencias del grupo (su nombre y sus artículos) y en todas ve otro producto; si no opina (o alguna es el mismo producto), se sigue con las reglas de siempre.
    if (opinion(idArticle)) {
      const refs = [identifyProduct(common.name), ...(membersByCommon.get(common.id) ?? []).map((m) => identifyProduct(m.displayName, m.brand, m.catalogProductKey))].filter(opinion)
      if (refs.length > 0 && refs.every((r) => compareIdentities(idArticle, r, { ignoreSize: true })?.relation === 'different')) continue
    }
    // El perfil del producto común (variantes críticas de su nombre o, si no las tiene, de sus artículos) tiene que ser el del artículo: «Cerveza» no admite «sin alcohol».
    const nameCritical = critical(productSignature(common.name).variants)
    const memberCritical = (membersByCommon.get(common.id) ?? []).map((m) => critical(productSignature(m.displayName, m.brand).variants))
    const profile = nameCritical.length > 0 ? nameCritical : (memberCritical.find((c) => c.length > 0) ?? [])
    if (!sameSet(profile, mine)) continue
    let best: { link: ProductLink; member: CmpProduct } | null = null
    for (const member of membersByCommon.get(common.id) ?? []) {
      const link = relationBetween(article, member, ctx)
      if (link.relation === 'different') continue
      if (!best || RELATION_SCORE[link.relation] > RELATION_SCORE[best.link.relation]) best = { link, member }
    }
    // El propio nombre del producto común: sus palabras deben estar en el artículo y las variantes (entera, sin lactosa…) tienen que coincidir.
    const csig = productSignature(common.name)
    const nameMatch = csig.core.length > 0 && csig.core.every((w) => sig.core.includes(w)) && sameSet(csig.variants, sig.variants.filter((v) => csig.variants.includes(v)))
    const variantClash = sig.variants.some((v) => v !== 'sin' && !csig.variants.includes(v)) && csig.variants.length > 0
    if (nameMatch && !variantClash && csig.core.length >= 1 && (!best || best.link.relation === 'possible')) {
      out.push({ common, score: 60 + Math.min(csig.core.length, 3) * 3, relation: 'equivalent', reason: `el nombre coincide con «${common.name}»`, matchedWith: null, automatic: false })
      continue
    }
    if (best) {
      const automatic = best.link.relation === 'identical' && best.link.automatic
      out.push({
        common,
        score: RELATION_SCORE[best.link.relation] + (best.link.source === 'family' ? 15 : 0),
        relation: best.link.relation,
        reason: best.link.relation === 'identical' ? `es el mismo producto que ${best.member.displayName}` : best.link.relation === 'equivalent' ? `comparable con ${best.member.displayName}` : `se parece a ${best.member.displayName}`,
        matchedWith: best.member.displayName,
        automatic,
      })
    }
  }
  return out.sort((a, b) => b.score - a.score || a.common.name.localeCompare(b.common.name, 'es')).slice(0, 3)
}

// ─── Cola de «Emparejar» ───

export interface ArticleStats {
  lines: number
  /** Gasto acumulado aproximado (suma de precios por unidad × cantidad). */
  spend: number
  stores: string[]
  lastDate: string
  lastPrice: number
  lastStore: string | null
  /** Formato del envase de la última compra, si se conoce. */
  pack: PackInput | null
}

export function articleStats(prices: readonly (CmpPrice & { quantity?: number })[]): Map<string, ArticleStats> {
  const out = new Map<string, ArticleStats>()
  const sorted = [...prices].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))
  for (const p of sorted) {
    const cur = out.get(p.productId) ?? { lines: 0, spend: 0, stores: [], lastDate: '', lastPrice: 0, lastStore: null, pack: null }
    cur.lines += 1
    cur.spend += p.price * (p.quantity && p.quantity > 0 ? p.quantity : 1)
    const s = p.store?.trim()
    if (s && !cur.stores.includes(s)) cur.stores.push(s)
    cur.lastDate = p.recordedDate
    cur.lastPrice = p.price
    cur.lastStore = s || null
    cur.pack = p.pack ?? cur.pack
    out.set(p.productId, cur)
  }
  return out
}

export interface PairingItem {
  article: CmpProduct
  stats: ArticleStats
  suggestions: CommonSuggestion[]
  /** Nombre propuesto si se crea un producto común nuevo. */
  newName: string
  score: number
  /** Algún producto común sugerido ya tiene artículos de otra tienda: emparejarlo permite comparar. */
  crossStore: boolean
}

export interface PairingQueueOptions {
  /** Texto del buscador (nombre del artículo o de la tienda). */
  query?: string
  /** Solo artículos con compras en alguna de estas tiendas (vacío = todas). */
  stores?: readonly string[]
  /** Artículos que no hace falta emparejar (PEPA ya los reconoce con seguridad y se comparan solos). */
  exclude?: ReadonlySet<string>
}

/**
 * Artículos todavía sin producto común ni «no emparejar», ordenados por utilidad: frecuencia de compra, gasto acumulado, posibles coincidencias y si
 * emparejarlos permite comparar entre tiendas. NO se excluye ningún tipo de producto (también limpieza, higiene, pañales…): los menos útiles quedan al final.
 */
export function pairingQueue(
  products: readonly CmpProduct[],
  prices: readonly (CmpPrice & { quantity?: number })[],
  commons: readonly CommonProduct[],
  members: readonly CommonMember[],
  skippedIds: ReadonlySet<string>,
  ctx: RelationContext = {},
  options: PairingQueueOptions = {},
): PairingItem[] {
  const stats = articleStats(prices)
  const memberIds = new Set(members.map((m) => m.productId))
  const storesOfCommon = new Map<string, Set<string>>()
  for (const m of members) {
    const set = storesOfCommon.get(m.commonId) ?? new Set<string>()
    for (const s of stats.get(m.productId)?.stores ?? []) set.add(s.toLowerCase())
    storesOfCommon.set(m.commonId, set)
  }
  const q = productTextKey(options.query ?? '')
  const storeFilter = new Set((options.stores ?? []).map((s) => s.toLowerCase()))
  const items: PairingItem[] = []
  for (const article of products) {
    const st = stats.get(article.id)
    if (!st || memberIds.has(article.id) || skippedIds.has(article.id) || options.exclude?.has(article.id)) continue
    if (storeFilter.size > 0 && !st.stores.some((s) => storeFilter.has(s.toLowerCase()))) continue
    if (q && !productTextKey(article.displayName).includes(q) && !st.stores.some((s) => productTextKey(s).includes(q))) continue
    const suggestions = suggestCommons(article, commons, members, products, ctx)
    const mine = new Set(st.stores.map((s) => s.toLowerCase()))
    const crossStore = suggestions.some((s) => [...(storesOfCommon.get(s.common.id) ?? [])].some((store) => !mine.has(store)))
    // Frecuencia (pesada por lo que cuesta: 16 bolsas de 0,15 € no valen más que un detergente), gasto acumulado, coincidencias y utilidad para comparar entre tiendas.
    const score = Math.log2(1 + st.lines) * 3 * Math.min(1, st.lastPrice / 1.5) + Math.sqrt(st.spend) * 2.5 + (suggestions.length > 0 ? 18 + suggestions[0].score / 10 : 0) + (crossStore ? 30 : 0)
    items.push({ article, stats: st, suggestions, newName: suggestCommonName(article), score, crossStore })
  }
  return items.sort((a, b) => b.score - a.score || a.article.displayName.localeCompare(b.article.displayName, 'es'))
}

/** Artículos pendientes con la misma palabra clave y las mismas variantes que `base`: candidatos a unirse al mismo producto común nuevo (la persona los marca). */
export function similarPending(base: CmpProduct, pending: readonly CmpProduct[], ctx: RelationContext = {}): CmpProduct[] {
  const bs = productSignature(base.displayName, base.brand)
  const mine = critical(bs.variants)
  return pending
    .filter((p) => p.id !== base.id)
    .filter((p) => {
      const ps = productSignature(p.displayName, p.brand)
      // Comparten una palabra del producto y no chocan en lo que lo hace OTRO producto (con/sin alcohol, entera/desnatada…). Que sean marcas distintas es justo lo normal aquí.
      if (!ps.core.some((w) => bs.core.includes(w))) return false
      if (!sameSet(critical(ps.variants), mine)) return false
      const decided = ctx.decisions?.find((d) => (d.productA === base.id && d.productB === p.id) || (d.productA === p.id && d.productB === base.id))
      return decided?.relation !== 'different'
    })
    .slice(0, 8)
}

// ─── Resultados: un producto común con todas sus presentaciones ───

export interface Offering {
  productId: string
  productName: string
  store: string
  date: string
  /** Línea de product_prices de la última compra de esta presentación (para corregir su formato). */
  priceId: string | null
  /** Precio total pagado por la presentación (por unidad comprada, tal cual el ticket). */
  totalPrice: number
  pack: PackInput | null
  normalized: NormalizedPrice
  /** Diferencia con la opción más barata, en % (0 para la más barata); null si no se compara. */
  diffPct: number | null
  cheapest: boolean
  /** Artículos del mismo producto común que son EXACTAMENTE el mismo producto que este (misma marca y presentación o decisión de la familia). */
  sameAs: string[]
}

export interface CommonResult {
  common: CommonProduct
  basis: UnitPriceBasis | null
  offers: Offering[]
  /** Sin formato conocido: no se compara, se pide completarlo. */
  unformatted: Offering[]
  /** Con formato exacto, pero de otra magnitud (€/kg frente a €/l): no se mezcla. */
  otherUnit: Offering[]
  storeCount: number
  /**
   * false = las presentaciones se comparan solo por unidad (brick, lata…) pero NO se conoce lo que contiene cada una (el «P-6» del nombre dice 6 unidades, no cuántos litros):
   * se enseñan, pero no se declara ninguna «más económica» hasta confirmar el formato.
   */
  reliable: boolean
  /** Días entre la compra más antigua y la más reciente de las comparadas. */
  spanDays: number
  note: string | null
}

const BASIS_PRIORITY: UnitPriceBasis[] = ['l', 'kg', 'ud']
export const WIDE_SPAN_DAYS = 120

function daysBetween(a: string, b: string): number {
  const t = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return Math.abs(Math.round((t(b) - t(a)) / 86_400_000))
}

function packKey(pack: PackInput | null): string {
  return pack ? `${pack.count}x${pack.amount}${pack.unit}` : 'sin'
}

/** Todas las presentaciones compradas de un producto común, normalizadas a €/kg, €/l o €/ud y ordenadas de menor a mayor. Conserva precio, fecha, tienda y formato originales. */
export function commonResult(
  common: CommonProduct,
  memberProducts: readonly CmpProduct[],
  prices: readonly CmpPrice[],
  ctx: RelationContext = {},
): CommonResult {
  const nameOf = new Map(memberProducts.map((p) => [p.id, p.displayName]))
  const latest = new Map<string, Offering>()
  for (const r of prices) {
    const name = nameOf.get(r.productId)
    if (name == null || !(r.price >= 0)) continue
    const store = r.store?.trim() || 'Sin tienda concreta'
    const key = `${r.productId}|${store.toLowerCase()}|${packKey(r.pack ?? null)}`
    const prev = latest.get(key)
    if (prev && prev.date >= r.recordedDate) continue
    latest.set(key, { productId: r.productId, productName: name, store, date: r.recordedDate, priceId: r.id ?? null, totalPrice: r.price, pack: r.pack ?? null, normalized: normalizePrice(r, name), diffPct: null, cheapest: false, sameAs: [] })
  }
  const all = [...latest.values()]
  const exact = all.filter((o) => o.normalized.exact)
  const counts = new Map<UnitPriceBasis, number>()
  for (const o of exact) counts.set(o.normalized.basis, (counts.get(o.normalized.basis) ?? 0) + 1)
  let basis: UnitPriceBasis | null = null
  for (const b of BASIS_PRIORITY) if ((counts.get(b) ?? 0) > (basis ? (counts.get(basis) ?? 0) : 0)) basis = b
  const offers = exact.filter((o) => o.normalized.basis === basis).sort((a, b) => a.normalized.value - b.normalized.value || b.date.localeCompare(a.date))
  // Comparar por unidad solo es fiable si el contenido de cada unidad está confirmado (formato guardado). Un «P-6» o «x12» del nombre cuenta unidades, no litros ni kilos.
  const reliable = !(basis === 'ud' && offers.some((o) => !o.pack))
  // Con una sola presentación no hay con qué comparar: no se marca como la más económica.
  const best = reliable && offers.length >= 2 ? (offers[0]?.normalized.value ?? null) : null
  for (const o of offers) {
    o.cheapest = best != null && o.normalized.value === best
    o.diffPct = best != null && best > 0 ? Math.round(((o.normalized.value - best) / best) * 1000) / 10 : null
  }
  // Qué artículos son exactamente el mismo producto (distinta tienda, mismo artículo): solo se marca, nunca se mezcla con «comparable».
  const byId = new Map(memberProducts.map((p) => [p.id, p]))
  for (const o of [...offers, ...all.filter((x) => !x.normalized.exact)]) {
    const me = byId.get(o.productId)
    if (!me) continue
    o.sameAs = [...new Set(all.filter((x) => x.productId !== o.productId).map((x) => x.productId))]
      .filter((id) => {
        const other = byId.get(id)
        return other != null && relationBetween(me, other, ctx).relation === 'identical'
      })
      .map((id) => nameOf.get(id) ?? '')
      .filter(Boolean)
  }
  const dates = offers.map((o) => o.date).sort()
  const spanDays = dates.length >= 2 ? daysBetween(dates[0], dates[dates.length - 1]) : 0
  const storeCount = new Set(offers.map((o) => o.store.toLowerCase())).size
  const notes: string[] = []
  if (spanDays > WIDE_SPAN_DAYS) notes.push(`Las compras comparadas están separadas por ${Math.round(spanDays / 30)} meses: los precios pueden haber cambiado.`)
  if (!reliable) notes.push('Se compara por unidad (brick, lata…) y no se sabe cuánto contiene cada una: indica el formato de cada artículo para saber cuál sale más barata por litro o kilo. Mientras tanto no se marca ninguna como la más económica.')
  else if (offers.length < 2) notes.push(offers.length === 0 ? 'Todavía no hay presentaciones con formato conocido para comparar.' : 'Solo hay una presentación con formato conocido: falta otra para comparar.')
  return {
    common,
    basis,
    offers,
    unformatted: all.filter((o) => !o.normalized.exact).sort((a, b) => b.date.localeCompare(a.date)),
    otherUnit: exact.filter((o) => o.normalized.basis !== basis),
    storeCount,
    reliable,
    spanDays,
    note: notes.length > 0 ? notes.join(' ') : null,
  }
}

/** Lo más barato de un resultado, en una frase corta para la lista plegada. null si no hay con qué comparar. */
export function resultHeadline(r: CommonResult): { store: string; value: number; basis: UnitPriceBasis; extraPct: number | null } | null {
  if (r.offers.length < 2 || r.basis == null || !r.reliable) return null
  const best = r.offers[0]
  const worst = r.offers[r.offers.length - 1]
  return { store: best.store, value: best.normalized.value, basis: r.basis, extraPct: worst.diffPct }
}

// ─── Formatos de los artículos de un producto común ───

export type FormatState = 'confirmado' | 'propuesto' | 'falta'

/** Qué se sabe del contenido de un artículo del grupo (a partir de su última compra). Nunca se inventa: lo que no se sabe es «falta». */
export interface MemberFormat {
  productId: string
  productName: string
  store: string
  /** Línea de product_prices de la última compra (para guardar el formato). */
  priceId: string | null
  totalPrice: number
  date: string
  state: FormatState
  /** Formato guardado y confirmado (state 'confirmado'). */
  pack: PackInput | null
  /** Formato que PEPA lee en el nombre y que la persona puede confirmar (state 'propuesto'). */
  proposal: PackInput | null
  /** Por qué falta, si hay algo que decir. */
  note: string | null
}

/**
 * Para cada artículo del grupo: formato conocido, propuesto por PEPA (lo dice el nombre) o por completar. Un envase que solo cuenta unidades («P-6») cuando el grupo se compara por
 * litro o kilo NO está completo: falta el contenido de cada unidad.
 */
export function memberFormats(memberProducts: readonly CmpProduct[], prices: readonly CmpPrice[], basis: UnitPriceBasis | null): MemberFormat[] {
  const latest = new Map<string, CmpPrice>()
  for (const r of prices) {
    const prev = latest.get(r.productId)
    if (!prev || prev.recordedDate < r.recordedDate) latest.set(r.productId, r)
  }
  const out: MemberFormat[] = []
  for (const p of memberProducts) {
    const r = latest.get(p.id)
    if (!r) continue
    const base = { productId: p.id, productName: p.displayName, store: r.store?.trim() || 'Sin tienda concreta', priceId: r.id ?? null, totalPrice: r.price, date: r.recordedDate }
    if (normalizeMeasurementUnit(r.unit) === 'kg') {
      out.push({ ...base, state: 'confirmado', pack: null, proposal: null, note: 'Se vende por kilo: ya se compara por €/kg.' })
      continue
    }
    const countOnly = (pk: PackInput) => packTotalSize(pk)?.magnitude === 'unidades'
    const needsVolume = basis === 'l' || basis === 'kg'
    if (r.pack && packTotalSize(r.pack)) {
      if (needsVolume && countOnly(r.pack)) out.push({ ...base, state: 'falta', pack: null, proposal: null, note: 'Solo indica cuántas unidades trae: falta el contenido de cada una.' })
      else out.push({ ...base, state: 'confirmado', pack: r.pack, proposal: null, note: null })
      continue
    }
    const fromName = parseProductPack(p.displayName)
    if (fromName && !(needsVolume && countOnly(fromName)) && !countOnly(fromName)) {
      out.push({ ...base, state: 'propuesto', pack: null, proposal: fromName, note: 'PEPA lo lee en el nombre del artículo.' })
      continue
    }
    out.push({ ...base, state: 'falta', pack: null, proposal: null, note: fromName ? 'El nombre solo dice cuántas unidades trae: falta el contenido de cada una.' : null })
  }
  return out.sort((a, b) => (a.state === b.state ? a.productName.localeCompare(b.productName, 'es') : a.state === 'confirmado' ? 1 : b.state === 'confirmado' ? -1 : a.state === 'propuesto' ? -1 : 1))
}
