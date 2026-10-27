// «Qué ha entendido PEPA» de cada línea del ticket, para la pantalla de revisión (y para cualquier otro sitio que quiera enseñarlo).
// Puro: usa el MISMO normalizador del catálogo maestro (identify.ts); no clasifica por su cuenta ni guarda nada.
import { catalogClass } from './classes'
import { CATALOG_ENTRIES } from './catalogData'
import { identifyProduct, type MatchConfidence, type ProductIdentity } from './identify'
import type { CatalogEntry } from './parse'
import { tokensOf } from './tokens'
import { describePackInput, type PackInput } from '../productSize'

export type ReadingState =
  /** Sin nombre todavía. */
  | 'vacio'
  /** El catálogo lo identifica con seguridad. */
  | 'seguro'
  /** La familia lo confirmó o lo corrigió (se guarda en el producto). */
  | 'confirmado'
  /** Hay una propuesta, pero hay que confirmarla. */
  | 'probable'
  /** El catálogo no lo reconoce. */
  | 'dudoso'

export interface LineReading {
  state: ReadingState
  /** Texto original del ticket (nunca se toca). */
  raw: string
  /** «Leche semidesnatada»; null si no se identifica. */
  productName: string | null
  /** Clave estable del producto del catálogo; null si no se identifica. */
  entryKey: string | null
  /** Clave de la clase CAT-1 del catálogo (food.lacteos_huevos...); null si no se identifica. */
  classKey: string | null
  /** Nombre de la clase del catálogo (para cuando la familia aún no la tiene). */
  className: string | null
  brand: string | null
  /** Variante que distingue el producto («gouda», «zero», «fresa»): palabras que el catálogo no reconoce como producto ni marca. */
  variant: string | null
  /** «6 envases · capacidad pendiente», «5 kg», «formato pendiente». */
  format: string
  /** El formato se conoce lo bastante para comparar precios (o se vende por peso). */
  formatKnown: boolean
  /** Lo que falta para que el artículo sirva en el comparador (vacío = listo). */
  missing: string[]
  /** El artículo ya puede compararse solo: identificado con seguridad, con sus datos obligatorios y con formato fiable. */
  readyToCompare: boolean
  confidence: MatchConfidence
  reasons: string[]
}

export interface ReadLineInput {
  name: string
  brand?: string | null
  /** Producto del catálogo confirmado o corregido por la familia, si lo hay (products.catalog_product_key o lo elegido en esta revisión). */
  catalogProductKey?: string | null
  /** Formato efectivo de la línea (lo indicado, el del nombre o el recordado); null = sin formato. */
  effectivePack?: PackInput | null
  /** La línea se vende por peso (kg): el precio ya es por kg y no hace falta formato. */
  soldByWeight?: boolean
}

const ATTR_LABEL: Record<string, string> = { talla: 'la talla', etapa: 'la etapa', tipoLeche: 'el tipo de leche' }

/** «6 envases · capacidad pendiente» / «6 unidades» / «5 kg» / «formato pendiente». Nunca se inventa una capacidad. */
export function readingFormat(identity: ProductIdentity, effectivePack: PackInput | null | undefined, soldByWeight: boolean): { text: string; known: boolean } {
  if (soldByWeight) return { text: 'al peso', known: true }
  if (effectivePack) {
    // «P-6» solo dice cuántos: 6 de capacidad desconocida si el producto se vende por volumen o peso.
    const countOnly = effectivePack.unit === 'ud' && effectivePack.amount === 1
    if (countOnly && identity.basis && identity.basis !== 'ud') {
      return { text: `${effectivePack.count} ${identity.basis === 'l' ? 'envases' : 'unidades'} · ${identity.basis === 'l' ? 'capacidad' : 'peso de cada uno'} pendiente`, known: false }
    }
    return { text: describePackInput(effectivePack), known: true }
  }
  if (identity.pack) {
    const countOnly = identity.pack.unit === 'ud' && identity.pack.amount === 1
    if (countOnly && identity.basis && identity.basis !== 'ud') {
      return { text: `${identity.pack.count} ${identity.basis === 'l' ? 'envases' : 'unidades'} · ${identity.basis === 'l' ? 'capacidad' : 'peso de cada uno'} pendiente`, known: false }
    }
    return { text: describePackInput(identity.pack), known: true }
  }
  return { text: 'formato pendiente', known: false }
}

export function readLine(input: ReadLineInput): LineReading {
  const raw = input.name ?? ''
  if (!raw.trim()) {
    return { state: 'vacio', raw, productName: null, entryKey: null, classKey: null, className: null, brand: null, variant: null, format: '', formatKnown: false, missing: [], readyToCompare: false, confidence: 'dudoso', reasons: [] }
  }
  const id = identifyProduct(raw, input.brand ?? null, input.catalogProductKey ?? null)
  const format = readingFormat(id, input.effectivePack, input.soldByWeight === true)
  const confirmed = !!input.catalogProductKey && id.reasons.includes('confirmado por la familia')
  const state: ReadingState = !id.entry ? 'dudoso' : confirmed ? 'confirmado' : id.confidence === 'seguro' ? 'seguro' : id.confidence === 'probable' ? 'probable' : 'dudoso'
  const missing: string[] = []
  if (!id.entry) missing.push('confirmar el producto')
  else {
    if (id.entry.broad) missing.push('decir qué producto concreto es')
    if (state === 'probable') missing.push('confirmar el producto')
    for (const m of id.missing) missing.push(`indicar ${ATTR_LABEL[m] ?? m}`)
    if (!format.known) missing.push(id.pack ? 'indicar el formato del envase' : 'indicar el formato')
  }
  const variant = id.leftover.length > 0 ? id.leftover.join(' ') : null
  return {
    state,
    raw,
    productName: id.name,
    entryKey: id.entry?.key ?? null,
    classKey: id.classKey,
    className: id.classKey ? (catalogClass(id.classKey)?.name ?? null) : null,
    brand: id.brand,
    variant,
    format: format.text,
    formatKnown: format.known,
    missing,
    readyToCompare: missing.length === 0 && id.identityKey != null,
    confidence: id.confidence,
    reasons: id.reasons,
  }
}

export interface CatalogSearchHit {
  key: string
  name: string
  className: string
}

/** Busca un producto del catálogo por lo que escribe la persona («merluza», «pañales», «leche semi»). Solo productos concretos (no los de «clase»). */
export function searchCatalogEntries(query: string, limit = 6): CatalogSearchHit[] {
  const q = tokensOf(query)
  if (q.length === 0) return []
  const scored: { entry: CatalogEntry; score: number }[] = []
  for (const entry of CATALOG_ENTRIES) {
    if (entry.broad) continue
    const nameWords = tokensOf(entry.name)
    const aliasWords = new Set(entry.aliases.flat())
    let score = 0
    let hits = 0
    for (const w of q) {
      const inName = nameWords.some((n) => n === w || (w.length >= 3 && n.startsWith(w)))
      const inAlias = aliasWords.has(w) || [...aliasWords].some((a) => w.length >= 3 && a.startsWith(w))
      if (inName) {
        score += 3
        hits++
      } else if (inAlias) {
        score += 1
        hits++
      }
    }
    if (hits === q.length) scored.push({ entry, score: score - nameWords.length * 0.1 })
  }
  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, 'es'))
  return scored.slice(0, limit).map(({ entry }) => ({ key: entry.key, name: entry.name, className: catalogClass(entry.classKey)?.name ?? '' }))
}
