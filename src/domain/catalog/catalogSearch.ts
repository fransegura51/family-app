// BUSCADOR Y EXPLORADOR del catálogo maestro para el selector de producto (revisión del ticket y cualquier otro sitio que deba elegir un producto del catálogo).
// Puro: sin red. Busca por nombre, sinónimo, abreviatura y variante, tolera erratas pequeñas y permite navegar por categorías sin escribir.
// A diferencia del normalizador de tickets, aquí NO se descartan palabras como «bolsa» (en un ticket son ruido; al buscar, son lo que la persona quiere).
import { productTextKey } from '../productText'
import { ABBREVIATIONS, SOFT_ABBREVIATIONS, singular } from './lexicon'
import { CATALOG_CLASSES, catalogClass } from './classes'
import { CATALOG_ENTRIES } from './catalogData'
import type { CatalogEntry } from './parse'
import { allVariants } from './variants'

const SEARCH_STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'y', 'a', 'en', 'un', 'una', 'al', 'por', 'e', 'o'])

/** Palabras de un texto de búsqueda: sin tildes, en singular y con las abreviaturas habituales de ticket expandidas. */
export function searchWords(text: string): string[] {
  const out: string[] = []
  for (const raw of productTextKey(text).split(' ')) {
    if (!raw || SEARCH_STOP.has(raw)) continue
    const w = ABBREVIATIONS[raw] ?? SOFT_ABBREVIATIONS[raw] ?? raw
    out.push(singular(w))
  }
  return out
}

/** Distancia de edición limitada a `max` (suficiente para erratas: «lechee», «semidesnatda»). */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, k) => k)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    if (Math.min(...cur) > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

export interface CatalogHit {
  /** Clave que se guarda: la del producto o la de la variante. */
  key: string
  name: string
  classKey: string
  className: string
  /** Subcategoría del catálogo («Lácteos»…); ayuda a distinguir entradas con nombre parecido. */
  sub: string
  /** Clave del producto principal (la misma que `key` si no es una variante). */
  entryKey: string
  variant: boolean
  /**
   * COMP-04: entrada GENERAL de una categoría («Electrónica», «Ropa y calzado», «Carne»…): sirve cuando el artículo pertenece a la categoría pero el catálogo no tiene un producto más
   * concreto (un cable Ethernet). Es la misma entrada que usa la clasificación automática (broad), ahora también elegible a mano.
   */
  general?: boolean
}

interface Indexed {
  hit: CatalogHit
  name: string[]
  alias: Set<string>
  extra: Set<string>
}

let INDEX: Indexed[] | null = null

function indexEntry(entry: CatalogEntry): Indexed {
  const cls = catalogClass(entry.classKey)
  return {
    hit: { key: entry.key, name: entry.name, classKey: entry.classKey, className: cls?.name ?? '', sub: entry.sub, entryKey: entry.key, variant: false, ...(entry.broad ? { general: true } : {}) },
    name: searchWords(entry.name),
    alias: new Set(entry.aliases.flat()),
    extra: new Set([...searchWords(entry.sub), ...searchWords(cls?.name ?? '')]),
  }
}

function build(): Indexed[] {
  if (INDEX) return INDEX
  // COMP-04: las entradas generales (de clase) también se pueden elegir a mano; los productos concretos salen antes.
  const entries = CATALOG_ENTRIES
  const byKey = new Map(entries.map((e) => [e.key, e]))
  const out = entries.map(indexEntry)
  for (const v of allVariants()) {
    const base = byKey.get(v.entryKey)
    if (!base) continue
    const cls = catalogClass(base.classKey)
    out.push({
      hit: { key: v.key, name: v.label, classKey: base.classKey, className: cls?.name ?? '', sub: base.sub, entryKey: base.key, variant: true },
      name: searchWords(v.label),
      alias: new Set(base.aliases.flat()),
      extra: new Set([...searchWords(base.sub), ...searchWords(cls?.name ?? '')]),
    })
  }
  INDEX = out
  return out
}

function scoreWord(w: string, ix: Indexed): number {
  if (ix.name.includes(w)) return 4
  if (w.length >= 4 && ix.name.some((n) => n.startsWith(w))) return 3
  if (ix.alias.has(w)) return 2
  if (w.length >= 4 && [...ix.alias].some((a) => a.startsWith(w))) return 1.5
  if (ix.extra.has(w)) return 0.8
  if (w.length >= 5) {
    const tol = w.length >= 8 ? 2 : 1
    if (ix.name.some((n) => within(w, n, tol))) return 2.5
    if ([...ix.alias].some((a) => within(w, a, tol))) return 1
  }
  return 0
}

/**
 * Productos y variantes del catálogo que encajan con lo escrito. Todas las palabras tienen que encajar. Los productos principales salen antes que sus variantes
 * (salvo que lo escrito nombre la variante, «leche semi»), y se evitan los parecidos solo por una coincidencia parcial de letras.
 */
export function searchCatalog(query: string, limit = 8): CatalogHit[] {
  const q = searchWords(query)
  if (q.length === 0) return []
  const scored: { ix: Indexed; score: number }[] = []
  for (const ix of build()) {
    let score = 0
    let ok = true
    for (const w of q) {
      const s = scoreWord(w, ix)
      if (s === 0) {
        ok = false
        break
      }
      score += s
    }
    if (!ok) continue
    // Menos palabras sobrantes en el nombre = más específico a lo escrito; las variantes pasan después de su producto si lo escrito no las nombra.
    score -= Math.max(0, ix.name.length - q.length) * 0.15
    if (ix.hit.general) score -= 1.5 // una entrada general solo gana cuando no hay un producto más concreto
    if (ix.hit.variant) {
      const extraWords = ix.name.filter((n) => !searchWords(CATALOG_ENTRIES.find((e) => e.key === ix.hit.entryKey)?.name ?? '').includes(n))
      const named = extraWords.length > 0 && extraWords.every((n) => q.some((w) => n.startsWith(w) || w === n))
      score -= named ? 0 : 1.2
    }
    scored.push({ ix, score })
  }
  // Los productos concretos van siempre antes que las entradas generales de categoría (COMP-04).
  scored.sort((a, b) => Number(!!a.ix.hit.general) - Number(!!b.ix.hit.general) || b.score - a.score || a.ix.hit.name.localeCompare(b.ix.hit.name, 'es'))
  const seen = new Set<string>()
  const out: CatalogHit[] = []
  for (const { ix } of scored) {
    if (seen.has(ix.hit.key)) continue
    seen.add(ix.hit.key)
    out.push(ix.hit)
    if (out.length >= limit) break
  }
  return out
}

// ─── Explorar sin escribir ───

export interface CatalogCategoryInfo {
  key: string
  name: string
  icon: string
  count: number
}

/** Categorías con productos concretos (las de «clase» se saltan), en el orden en que las conoce el catálogo. */
export function catalogCategories(): CatalogCategoryInfo[] {
  const counts = new Map<string, number>()
  // COMP-04: cuentan también las entradas generales, para que TODA categoría con algo en el catálogo (p. ej. «Electrónica y hogar», que casi solo tiene la general) se pueda abrir.
  for (const e of CATALOG_ENTRIES) counts.set(e.classKey, (counts.get(e.classKey) ?? 0) + 1)
  return CATALOG_CLASSES.filter((c) => (counts.get(c.key) ?? 0) > 0).map((c) => ({ key: c.key, name: c.name, icon: c.icon, count: counts.get(c.key) ?? 0 }))
}

export interface CatalogBrowseGroup {
  sub: string
  items: CatalogHit[]
}

/** Productos de una categoría agrupados por subcategoría y ordenados A–Z (sin variantes: estas se eligen al abrir el producto). */
export function browseCategory(classKey: string): CatalogBrowseGroup[] {
  const groups = new Map<string, CatalogHit[]>()
  const general: CatalogHit[] = []
  for (const e of CATALOG_ENTRIES) {
    if (e.classKey !== classKey) continue
    const { hit } = indexEntry(e)
    if (e.broad) {
      general.push(hit)
      continue
    }
    groups.set(e.sub || 'Otros', [...(groups.get(e.sub || 'Otros') ?? []), hit])
  }
  const out = [...groups.entries()].map(([sub, items]) => ({ sub, items: items.sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
  // La categoría general al final: «si ninguno de estos encaja, elige la categoría» (COMP-04).
  if (general.length > 0) out.push({ sub: 'Categoría general', items: general.sort((a, b) => a.name.localeCompare(b.name, 'es')) })
  return out
}

export function catalogHitByKey(key: string): CatalogHit | undefined {
  const entry = CATALOG_ENTRIES.find((e) => e.key === key)
  if (entry) return indexEntry(entry).hit
  return build().find((ix) => ix.hit.key === key)?.hit
}
