// VARIANTES de un producto del catálogo («Leche» → entera, semidesnatada, desnatada, sin lactosa…) para poder elegirlas sin repetir la búsqueda.
//
// No hay una segunda lista de productos: cada variante es un producto del catálogo + los valores de sus atributos, y se guarda en la misma columna
// (products.catalog_product_key) con una clave derivada y estable:  <producto>.v_<atributo>_<valor>[__<atributo>_<valor>]  (solo minúsculas, cifras, «_» y «.»).
// identify.ts resuelve esa clave al producto y fija los atributos, de modo que «LECHE ASTURIANA S» confirmada como «Leche semidesnatada» se identifica y se agrupa
// igual que «LECHE SEMIDESNATADA».
import { ATTRS, entryDisplayName, type AttrDef } from './attrs'
import { CATALOG_ENTRIES } from './catalogData'
import type { CatalogEntry } from './parse'

export interface CatalogVariant {
  /** Clave que se guarda en el producto. */
  key: string
  entryKey: string
  /** Valor de cada atributo fijado por la variante. */
  attrs: Record<string, string>
  /** «Leche semidesnatada», «Pañales talla 4». */
  label: string
}

const SEP = '.v_'
// Atributos que no son una variante que se elija a mano al confirmar un producto.
const SKIP_ATTRS = new Set(['bio'])
// Combinaciones útiles: el atributo obligatorio del producto con uno de estos (leche semidesnatada SIN LACTOSA, pañal talla 4 BRAGUITA).
const COMBINE_WITH = new Set(['lactosa', 'gluten', 'azucar', 'tipoPanal'])
const NUMERIC_RANGE: Record<string, string[]> = { talla: ['1', '2', '3', '4', '5', '6', '7'], etapa: ['1', '2', '3', '4'] }

function valuesOf(def: AttrDef): string[] {
  const out = def.values.map((v) => v.value)
  for (const v of NUMERIC_RANGE[def.id] ?? []) if (!out.includes(v)) out.push(v)
  return out.filter((v) => v !== def.defaultValue)
}

const lower = (s: string) => s.toLowerCase()

/** Clave de variante: los atributos van ordenados para que la misma combinación dé siempre la misma clave. */
export function variantKey(entryKey: string, attrs: Readonly<Record<string, string>>): string {
  const parts = Object.keys(attrs)
    .sort()
    .map((id) => `${lower(id)}_${lower(attrs[id])}`)
  return `${entryKey}${SEP}${parts.join('__')}`
}

let LIST: CatalogVariant[] | null = null
let BY_KEY: Map<string, CatalogVariant> | null = null
let BY_ENTRY: Map<string, CatalogVariant[]> | null = null
let ENTRY_BY_KEY: Map<string, CatalogEntry> | null = null

function build(): void {
  if (LIST) return
  const list: CatalogVariant[] = []
  const entryByKey = new Map(CATALOG_ENTRIES.map((e) => [e.key, e]))
  for (const entry of CATALOG_ENTRIES) {
    if (entry.broad) continue
    const defs = entry.attrs.map((a) => ({ ...a, def: ATTRS[a.id] })).filter((a) => a.def && !SKIP_ATTRS.has(a.id))
    const make = (chosen: Record<string, string>) => {
      const full: Record<string, string | null> = {}
      for (const a of entry.attrs) full[a.id] = chosen[a.id] ?? ATTRS[a.id].defaultValue ?? null
      list.push({ key: variantKey(entry.key, chosen), entryKey: entry.key, attrs: chosen, label: entryDisplayName(entry, full) })
    }
    for (const a of defs) for (const v of valuesOf(a.def)) make({ [a.id]: v })
    for (const r of defs.filter((a) => a.required)) {
      for (const v of valuesOf(r.def)) {
        for (const o of defs) {
          if (o.id === r.id || !COMBINE_WITH.has(o.id)) continue
          for (const w of valuesOf(o.def)) make({ [r.id]: v, [o.id]: w })
        }
      }
    }
  }
  const byKey = new Map<string, CatalogVariant>()
  const byEntry = new Map<string, CatalogVariant[]>()
  for (const v of list) {
    if (byKey.has(v.key)) continue
    byKey.set(v.key, v)
    byEntry.set(v.entryKey, [...(byEntry.get(v.entryKey) ?? []), v])
  }
  LIST = [...byKey.values()]
  BY_KEY = byKey
  BY_ENTRY = byEntry
  ENTRY_BY_KEY = entryByKey
}

export function allVariants(): readonly CatalogVariant[] {
  build()
  return LIST ?? []
}

/** Variantes de un producto, de las más sencillas (un atributo) a las combinadas. */
export function variantsOf(entryKey: string): CatalogVariant[] {
  build()
  return (BY_ENTRY?.get(entryKey) ?? []).slice().sort((a, b) => Object.keys(a.attrs).length - Object.keys(b.attrs).length)
}

/** Producto y atributos de una clave de variante; undefined si la clave no es de una variante conocida. */
export function resolveVariantKey(key: string): { entry: CatalogEntry; attrs: Record<string, string> } | undefined {
  build()
  const v = BY_KEY?.get(key)
  const entry = v ? ENTRY_BY_KEY?.get(v.entryKey) : undefined
  return v && entry ? { entry, attrs: v.attrs } : undefined
}

export function variantByKey(key: string): CatalogVariant | undefined {
  build()
  return BY_KEY?.get(key)
}
