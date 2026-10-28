// FAMILIAS DE ALTERNATIVAS COMPARABLES: productos DISTINTOS que cubren una necesidad de compra semejante (cervezas de varias marcas, refrescos, leches, aceites…).
//
// No es una segunda taxonomía: cuelga del catálogo maestro. Niveles (de general a concreto):
//   1. Categoría general      → clase CAT-1 del catálogo («Bebidas alcohólicas»).
//   2. Familia comparable     → esta lista; por defecto es el propio producto del catálogo («Leche», «Cerveza», «Aceite de girasol»), y aquí se juntan los que son
//                               alternativas entre sí aunque tengan entrada propia («Refresco de cola», «Limonada», «Refresco»… → «Refrescos»).
//   3. Producto normalizado   → identityKey (producto + atributos + variante) de identify.ts.
//   4. Marca y variantes      → marca reconocida y palabras que distinguen (zero, fresa…).
//   5. Formato y presentación → pack de cada compra (productSize).
//   6. Compras históricas     → product_prices, que nunca se tocan.
// Agrupar por familia NO funde identidades ni historiales: cada producto sigue siendo el suyo y se enseña por separado dentro de la familia.
import { catalogClass } from './classes'
import type { CatalogEntry } from './parse'

export interface AlternativeFamily {
  /** Estable; las familias por defecto usan «e:<clave del producto>». */
  id: string
  name: string
  classKey: string
}

interface FamilyDef {
  id: string
  name: string
  keys: readonly string[]
}

// Solo se juntan productos que de verdad se eligen unos en lugar de otros al comprar. Ante la duda, cada producto es su propia familia.
const MERGED: readonly FamilyDef[] = [
  { id: 'refrescos', name: 'Refrescos', keys: ['bna.refresco.cola', 'bna.refresco', 'bna.limonada', 'bna.naranjada', 'bna.gaseosa', 'bna.tonica'] },
  { id: 'bebidas-vegetales', name: 'Bebidas vegetales', keys: ['lac.bebida.avena', 'lac.bebida.soja', 'lac.bebida.almendra', 'lac.bebida.arroz', 'lac.bebida.coco'] },
  { id: 'aceite-oliva', name: 'Aceite de oliva', keys: ['desp.aceite.oliva.virgen.extra', 'desp.aceite.oliva.virgen', 'desp.aceite.oliva'] },
  { id: 'detergentes-ropa', name: 'Detergente para la ropa', keys: ['limp.detergente.liquido', 'limp.detergente.polvo', 'limp.detergente.capsulas'] },
  { id: 'yogures', name: 'Yogures', keys: ['lac.yogur', 'lac.yogur.griego', 'lac.yogur.proteina', 'lac.yogur.bifidus'] },
  { id: 'papel-higienico', name: 'Papel higiénico', keys: ['limp.papel.higienico'] },
]

const BY_ENTRY = new Map<string, FamilyDef>()
for (const f of MERGED) for (const k of f.keys) BY_ENTRY.set(k, f)

export function alternativeFamilyOf(entry: Pick<CatalogEntry, 'key' | 'name' | 'classKey'>): AlternativeFamily {
  const merged = BY_ENTRY.get(entry.key)
  if (merged) return { id: merged.id, name: merged.name, classKey: entry.classKey }
  return { id: `e:${entry.key}`, name: entry.name, classKey: entry.classKey }
}

export function alternativeFamilyClassName(f: AlternativeFamily): string {
  return catalogClass(f.classKey)?.name ?? 'Sin categoría'
}

export const MERGED_FAMILY_IDS: readonly string[] = MERGED.map((f) => f.id)
