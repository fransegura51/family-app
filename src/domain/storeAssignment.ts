// Compras: a qué tienda va cada producto al enviarlos desde un menú, una receta o un evento. Una sola tienda para todo («Sin tienda» incluida) o repartir entre varias en una
// única confirmación: primero una tienda general y, después, solo se cambian los productos que van a otra. Las tiendas salen SIEMPRE de las tiendas habituales de la familia
// (shopping_stores); nada se inventa y una tienda que no es de la familia se descarta (el producto queda «Sin tienda»). Sin DOM ni red: se prueba sola.
import type { ShoppingStoreEntry } from '@/domain/types'

export interface StoreChoice {
  // false = una sola tienda para todos los productos; true = «Repartir entre varias tiendas».
  split: boolean
  // Tienda general ('' = Sin tienda). En modo reparto es la que llevan los productos que no se han tocado.
  general: string
  // Cambios por producto (clave de la fila → nombre de tienda, '' = Sin tienda). Solo existen los que la persona ha tocado.
  overrides: Record<string, string>
}

export const NO_STORE = ''

export const EMPTY_STORE_CHOICE: StoreChoice = { split: false, general: NO_STORE, overrides: {} }

const norm = (s: string) => s.trim().toLowerCase()

// Nombre canónico de una tienda de la familia (el que se guarda en el producto) o null si no es una de sus tiendas habituales.
export function canonicalStore(stores: Pick<ShoppingStoreEntry, 'name'>[], name: string | null | undefined): string | null {
  if (!name || !name.trim()) return null
  return stores.find((s) => norm(s.name) === norm(name))?.name ?? null
}

export function setGeneralStore(choice: StoreChoice, name: string): StoreChoice {
  return { ...choice, general: name }
}

// En modo reparto: la tienda de un producto sigue a la general hasta que se toca.
export function setRowStore(choice: StoreChoice, key: string, name: string | null): StoreChoice {
  const overrides = { ...choice.overrides }
  if (name === null) delete overrides[key]
  else overrides[key] = name
  return { ...choice, overrides }
}

// Cambiar de modo NO pierde lo elegido: al volver a «una sola tienda» se ignoran los cambios por producto (siguen guardados por si se vuelve a repartir).
export function setSplit(choice: StoreChoice, split: boolean): StoreChoice {
  return { ...choice, split }
}

// Tienda que se guardará para un producto: nombre canónico de las tiendas de la familia, o null (Sin tienda).
export function storeForRow(choice: StoreChoice, key: string, stores: Pick<ShoppingStoreEntry, 'name'>[]): string | null {
  const wanted = choice.split && key in choice.overrides ? choice.overrides[key] : choice.general
  return canonicalStore(stores, wanted)
}

// Valor que enseña el selector de una fila en modo reparto: '__general' = «como el resto», o el nombre elegido ('' = Sin tienda).
export const FOLLOW_GENERAL = '__general'
export function rowSelectValue(choice: StoreChoice, key: string): string {
  return key in choice.overrides ? choice.overrides[key] : FOLLOW_GENERAL
}

// Resumen para el botón de confirmar: cuántos productos van a cada tienda («Consum 3 · Hiperber 1 · Sin tienda 2»).
export function storeSummary(choice: StoreChoice, keys: string[], stores: Pick<ShoppingStoreEntry, 'name'>[]): { store: string | null; count: number }[] {
  const counts = new Map<string | null, number>()
  for (const k of keys) {
    const s = storeForRow(choice, k, stores)
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  // Las tiendas en el orden de las tiendas de la familia; «Sin tienda» al final.
  const out: { store: string | null; count: number }[] = []
  for (const s of stores) if (counts.has(s.name)) out.push({ store: s.name, count: counts.get(s.name) ?? 0 })
  if (counts.has(null)) out.push({ store: null, count: counts.get(null) ?? 0 })
  return out
}

export function storeSummaryText(summary: { store: string | null; count: number }[]): string {
  return summary.map((s) => `${s.store ?? 'Sin tienda'} ${s.count}`).join(' · ')
}

// Productos que ya están pendientes en Compras con ese nombre y en qué tienda (para avisar sin fusionar ni sobrescribir nada).
export function pendingStoresByName(current: { name: string; status: string; store?: string | null }[]): Map<string, (string | null)[]> {
  const map = new Map<string, (string | null)[]>()
  for (const c of current) {
    if (c.status !== 'pendiente') continue
    const key = c.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
    const list = map.get(key) ?? []
    list.push(c.store ?? null)
    map.set(key, list)
  }
  return map
}
