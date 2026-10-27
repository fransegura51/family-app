// AGRUPACIÓN AUTOMÁTICA del comparador (COMP-3): PEPA propone productos comunes a partir del historial. Lógica pura, sin red ni IA.
//
// Reglas (todas conservadoras; ante la duda NO se agrupa):
//   · «Mismo nombre, distinto tamaño» (GUACAMOLE 200 G / GUACAMOLE 500 GR) o «mismo producto con otra marca o el nombre cortado por el ticket» (MINI EMPAN PISTO / MINI EMP PISTO
//     P6, BATIDO PULEVA CAC / BATIDO CACAO PACK 6): mismas palabras de producto, mismas variantes críticas (entera ≠ semidesnatada, con ≠ sin alcohol…) y MISMOS números sueltos
//     (VELA CIFRA 0 ≠ VELA CIFRA 4). La marca, el tamaño y el ruido de ticket («P-6», «x12») no cuentan. No hace falta que coincida el EAN.
//   · Una palabra genérica sola («LECHE», «ARROZ») no agrupa nada por sí sola: falta la variante.
//   · Una decisión «distinto» de la familia siempre separa dos artículos.
//   · NUNCA se toca un grupo confirmado por la familia: lo que PEPA ve parecido a sus artículos se ofrece aparte («Para tus grupos») y lo añade la persona.
//   · Un grupo de PEPA que sigue pendiente puede crecer con compras nuevas; lo que la persona separó o descartó (rechazos) no se vuelve a proponer.
//   · Es idempotente: con el mismo estado no propone nada nuevo.
import { compareIdentities, identifyProduct, type ProductIdentity } from './catalog/identify'
import { productTextKey } from './productText'
import { productSignature } from './productIdentity'
import { type CmpPrice, type CmpProduct, type RelationContext } from './priceComparison'
import { stripSize } from './productSize'
import type { CommonMember, CommonProduct } from './commonProducts'

export interface AutoCommon extends CommonProduct {
  status: 'confirmed' | 'pending'
}

const NOISE = new Set(['pack', 'pk', 'ud', 'uds', 'unidades', 'unidad', 'x', 'pcs', 'bolsa', 'bandeja'])
// Marcas blancas de las tiendas: la tienda cambia, el producto no.
const STORE_BRANDS = new Set(['alteza', 'selex', 'consum', 'hacendado', 'deliplus', 'milbona', 'compy', 'carrefour', 'eroski', 'auchan', 'alcampo', 'hipercor'])
// Una sola palabra así no identifica un producto (puede ser cualquier clase): hace falta una variante o más palabras.
const AMBIGUOUS_SINGLE = new Set(['leche', 'aceite', 'arroz', 'pan', 'queso', 'yogur', 'yogurt', 'pasta', 'agua', 'vino', 'jamon', 'carne', 'pollo', 'cerdo', 'ternera', 'pescado', 'fruta', 'verdura', 'galleta', 'cereal', 'azucar', 'harina', 'sal', 'refresco', 'zumo', 'cafe', 'te', 'mantequilla', 'huevo', 'embutido', 'salsa', 'pizza', 'helado', 'bocadillo', 'ensalada', 'extra', 'pendiente', 'mix'])
// Tiendas donde se come o se llena el depósito: no son compras de supermercado comparables.
const NOT_SUPERMARKET = /pizzer|restaur|cafeter|\bbar\b|gasolin|e\.?s\.? |repsol|cepsa|galp|shell|\bbp\b|macro asia/i

export interface Norm {
  p: CmpProduct
  /** Marca reconocida en el nombre (la misma en todo el grupo = forma parte del nombre del grupo). */
  brand: string | null
  tokens: string[]
  variants: string[]
  nums: string[]
  /** Texto completo sin tamaño ni ruido de pack: dos artículos con el mismo texto son el mismo producto en distinto tamaño. */
  text: string
  /** Lo que el catálogo maestro entiende del artículo (producto, atributos, confianza). */
  cat: ProductIdentity
}

/** Una palabra genérica sola («ARROZ», «POLLO»): puede ser cualquiera de los productos de esa familia, así que por sí sola no agrupa. */
function bareGeneric(c: ProductIdentity): boolean {
  const words = productTextKey(c.entry?.name ?? '').split(' ').filter(Boolean)
  return words.length === 1 && AMBIGUOUS_SINGLE.has(words[0]) && c.leftover.length === 0
}

export function normalizeForGrouping(p: CmpProduct): Norm {
  const sig = productSignature(stripSize(p.displayName), p.brand)
  let tokens = sig.core.filter((w) => w.length > 1 && !NOISE.has(w) && !/^p\d*$/.test(w) && !/^\d/.test(w) && !STORE_BRANDS.has(w))
  if (tokens.includes('semidesnatada')) tokens = tokens.filter((w) => w !== 'desnatada')
  const variants = tokens.filter((w) => sig.variants.includes(w))
  // Números sueltos que NO son un tamaño ni una cantidad de pack («VELA CIFRA 4», «PAPEL HIGIENICO 4 CA» ≠ «… 2 CA»).
  const stripped = productTextKey(stripSize(p.displayName))
    .replace(/\b(p|pk|pack|x)\s?\d+\b/g, ' ')
    .replace(/\b\d+\s?(pack|pk|ud|uds|unid\w*)\b/g, ' ')
  const nums = (stripped.match(/\b\d+\b/g) ?? []).sort()
  const text = stripped.replace(/\s+/g, ' ').trim()
  return { p, brand: sig.brand, tokens: [...new Set(tokens)].sort(), variants: [...new Set(variants)].sort(), nums, text, cat: identifyProduct(p.displayName, p.brand, p.catalogProductKey) }
}

/** Un token del ticket puede venir cortado por el límite de caracteres («CAC» por «CACAO», «EMP» por «EMPAN»): coincide si es prefijo (≥ 3 letras) del otro. */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return s.length >= 3 && l.startsWith(s)
}

/** ¿Las palabras de producto de ambos coinciden una a una (admitiendo cortes de ticket)? */
function tokensMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...b]
  for (const x of a) {
    const i = left.findIndex((y) => tokenMatch(x, y))
    if (i < 0) return false
    left.splice(i, 1)
  }
  return true
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i])

function decidedDifferent(a: CmpProduct, b: CmpProduct, ctx: RelationContext): boolean {
  return !!ctx.decisions?.some((d) => d.relation === 'different' && ((d.productA === a.id && d.productB === b.id) || (d.productA === b.id && d.productB === a.id)))
}

/** ¿Dos artículos son lo bastante claramente el mismo producto (otra marca, otro tamaño, nombre cortado) como para agruparlos? */
export function sameProductForGrouping(a: Norm, b: Norm, ctx: RelationContext = {}): boolean {
  if (a.p.id === b.p.id || decidedDifferent(a.p, b.p, ctx)) return false
  // CATÁLOGO MAESTRO: si distingue los dos productos (talla, etapa, tipo de leche, patata fresca ≠ frita...) NUNCA se agrupan; si los identifica con seguridad como el
  // mismo (misma identidad completa: producto + atributos + variante) se agrupan aunque el ticket los escriba distinto («O.V.E.» / «aceite de oliva virgen extra»).
  // El tamaño no cuenta para agrupar («LECHE SEMI P-6» y «LECHE SEMIDESNATADA 1 L» son la misma leche); sí lo que distingue el producto.
  const verdict = compareIdentities(a.cat, b.cat, { ignoreSize: true })
  if (verdict?.relation === 'different') return false
  if (verdict && !bareGeneric(a.cat) && a.cat.identityKey != null && a.cat.identityKey === b.cat.identityKey) return true
  if (!sameSet(a.nums, b.nums) || !sameSet(a.variants, b.variants)) return false
  if (a.text !== '' && a.text === b.text) return a.tokens.length > 0 && !(a.tokens.length === 1 && AMBIGUOUS_SINGLE.has(a.tokens[0]))
  const specific = (n: Norm) => n.tokens.length >= 2
  if (!specific(a) || !specific(b)) return false
  return tokensMatch(a.tokens, b.tokens)
}

export interface AutoGroupInput {
  products: readonly CmpProduct[]
  prices: readonly (CmpPrice & { quantity?: number })[]
  commons: readonly AutoCommon[]
  members: readonly CommonMember[]
  skippedIds: ReadonlySet<string>
  rejectedIds: ReadonlySet<string>
  ctx?: RelationContext
}

export interface AutoGroup {
  /** Producto común de PEPA pendiente al que se añaden (null = grupo nuevo). */
  commonId: string | null
  name: string
  productIds: string[]
  stores: string[]
  reason: string
}

export interface AutoForConfirmed {
  commonId: string
  commonName: string
  productIds: string[]
}

export interface AutoPlan {
  /** Grupos nuevos o ampliaciones de grupos de PEPA todavía sin revisar. */
  groups: AutoGroup[]
  /** Artículos que casan con un grupo YA CONFIRMADO por la familia: no se añaden solos. */
  forConfirmed: AutoForConfirmed[]
  /** Grupos descartados por repetir el nombre de otro producto común distinto. */
  skippedByName: number
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Nombre del grupo: las palabras de producto del artículo más comprado, completando las cortadas con la versión más larga que aparezca en el grupo, con tildes. */
export function groupName(members: readonly Norm[], rawNames: ReadonlyMap<string, string>): string {
  const lead = members[0]
  // Todos son el MISMO producto del catálogo maestro, sin palabras sueltas: el grupo se llama como el producto normalizado («Pañales talla 4»).
  const key = lead.cat.identityKey
  if (key != null && lead.cat.name && lead.cat.leftover.length === 0 && members.every((m) => m.cat.identityKey === key)) return lead.cat.name
  const raw = new Map<string, string>() // texto sin tildes → palabra con tildes (minúsculas)
  for (const m of members) for (const w of (rawNames.get(m.p.id) ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w) raw.set(productTextKey(w), w)
  const order = productTextKey(stripSize(lead.p.displayName)).split(' ')
  const words: string[] = []
  const used = new Set<string>()
  for (const w of order) {
    const base = lead.tokens.find((t) => t === w || t.startsWith(w) || w.startsWith(t))
    if (!base || used.has(base)) continue
    used.add(base)
    // La versión más larga de esa palabra entre los artículos del grupo (los cortes del ticket se completan).
    const longest =
      members
        .flatMap((m) => m.tokens)
        .filter((t) => tokenMatch(t, base))
        .sort((a, b) => b.length - a.length)[0] ?? base
    // Con tildes y sin recortar la «s» final que quita la normalización (REFRES, PICOS).
    const full = raw.get(longest) ?? [...raw.entries()].filter(([k]) => k.startsWith(longest)).sort((a, b) => a[0].length - b[0].length)[0]?.[1] ?? longest
    if (full.length > 2) words.push(full)
    if (words.length >= 4) break
  }
  // Si todos los artículos son de la misma marca (REFRES COCA COLA), la marca identifica el grupo.
  const brands = new Set(members.map((m) => m.brand))
  const brand = brands.size === 1 ? [...brands][0] : null
  if (brand && words.length < 4) words.push(brand)
  return cap(words.join(' '))
}

export function planAutoGrouping(input: AutoGroupInput): AutoPlan {
  const ctx = input.ctx ?? {}
  const norms = new Map(input.products.map((p) => [p.id, normalizeForGrouping(p)]))
  const rawNames = new Map(input.products.map((p) => [p.id, p.displayName]))
  const memberOf = new Map(input.members.map((m) => [m.productId, m.commonId]))
  const lines = new Map<string, { n: number; stores: Set<string> }>()
  for (const pr of input.prices) {
    const cur = lines.get(pr.productId) ?? { n: 0, stores: new Set<string>() }
    cur.n += 1
    if (pr.store?.trim()) cur.stores.add(pr.store.trim())
    lines.set(pr.productId, cur)
  }
  const supermarket = (id: string) => [...(lines.get(id)?.stores ?? [])].some((s) => !NOT_SUPERMARKET.test(s))

  // Candidatos: con compras en una tienda de compra, sin grupo, sin «no emparejar» y sin rechazo previo.
  const cands = input.products
    .filter((p) => lines.has(p.id) && supermarket(p.id) && !/^bolsa\b/i.test(p.displayName.trim()) && !memberOf.has(p.id) && !input.skippedIds.has(p.id) && !input.rejectedIds.has(p.id))
    .map((p) => norms.get(p.id) as Norm)
    .sort((a, b) => (lines.get(b.p.id)?.n ?? 0) - (lines.get(a.p.id)?.n ?? 0) || a.p.displayName.localeCompare(b.p.displayName, 'es'))

  // 1. Artículos que casan con un producto común ya existente (por su nombre o por alguno de sus artículos).
  const forConfirmed = new Map<string, AutoForConfirmed>()
  const groups: AutoGroup[] = []
  const placed = new Set<string>()
  for (const c of input.commons) {
    const nameNorm = normalizeForGrouping({ id: `common:${c.id}`, displayName: c.name })
    const memberNorms = input.members.filter((m) => m.commonId === c.id).map((m) => norms.get(m.productId)).filter((n): n is Norm => !!n)
    const refs: Norm[] = [nameNorm, ...memberNorms]
    const hits = cands.filter((n) => !placed.has(n.p.id) && refs.some((r) => sameProductForGrouping(n, r, ctx)) && !memberNorms.some((r) => decidedDifferent(n.p, r.p, ctx)))
    if (hits.length === 0) continue
    for (const h of hits) placed.add(h.p.id)
    if (c.status === 'confirmed') {
      forConfirmed.set(c.id, { commonId: c.id, commonName: c.name, productIds: hits.map((h) => h.p.id) })
    } else {
      groups.push({ commonId: c.id, name: c.name, productIds: hits.map((h) => h.p.id), stores: storesOf(hits, lines), reason: 'Se parecen a los artículos que PEPA ya había agrupado.' })
    }
  }

  // 2. Grupos nuevos entre los artículos que quedan: componentes conexos y, dentro de cada uno, solo los que casan con todos.
  const rest = cands.filter((n) => !placed.has(n.p.id))
  const seen = new Set<string>()
  const usedNames = new Set(input.commons.map((c) => productTextKey(c.name)))
  let skippedByName = 0
  for (const start of rest) {
    if (seen.has(start.p.id)) continue
    const comp: Norm[] = []
    const queue = [start]
    seen.add(start.p.id)
    while (queue.length > 0) {
      const cur = queue.shift() as Norm
      comp.push(cur)
      for (const o of rest) {
        if (!seen.has(o.p.id) && sameProductForGrouping(cur, o, ctx)) {
          seen.add(o.p.id)
          queue.push(o)
        }
      }
    }
    if (comp.length < 2) continue
    const clique: Norm[] = []
    for (const n of comp) if (clique.every((q) => sameProductForGrouping(n, q, ctx))) clique.push(n)
    if (clique.length < 2) continue
    const name = groupName(clique, rawNames)
    const nk = productTextKey(name)
    if (!name || usedNames.has(nk)) {
      skippedByName += 1
      continue
    }
    usedNames.add(nk)
    const stores = storesOf(clique, lines)
    groups.push({ commonId: null, name, productIds: clique.map((n) => n.p.id), stores, reason: stores.length > 1 ? `Mismo producto en ${stores.join(' y ')}.` : 'Mismo producto en distintas presentaciones o marcas.' })
  }

  // Lo más útil primero: más tiendas, luego más artículos.
  groups.sort((a, b) => b.stores.length - a.stores.length || b.productIds.length - a.productIds.length || a.name.localeCompare(b.name, 'es'))
  return { groups, forConfirmed: [...forConfirmed.values()], skippedByName }
}

function storesOf(ns: readonly Norm[], lines: Map<string, { n: number; stores: Set<string> }>): string[] {
  const out = new Map<string, string>()
  for (const n of ns) for (const s of lines.get(n.p.id)?.stores ?? []) out.set(s.toLowerCase(), s)
  return [...out.values()].sort((a, b) => a.localeCompare(b, 'es'))
}
