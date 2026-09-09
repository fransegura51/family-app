// Mismo patrón que economiaMenu.ts / alimentacionMenu.ts / comprasMenu.ts
// — petición real: "el formato que has hecho ahora para meter todas
// las pestañas me gusta mucho, aplícalo a toda la aplicación... que
// toda la aplicación se vea en el mismo formato".

export type FixedUbicacionMenuItemKey = 'Inicio' | 'Ubicación' | 'Reglas'
export type UbicacionMenuItemKey = FixedUbicacionMenuItemKey | `custom:${string}`

export function isCustomUbicacionMenuKey(key: UbicacionMenuItemKey): boolean {
  return key.startsWith('custom:')
}

export interface UbicacionMenuEntry {
  key: UbicacionMenuItemKey
  icon?: string
  label?: string
}

export interface UbicacionMenuGroup {
  id: string
  name: string | null
  items: UbicacionMenuEntry[]
}

export const UBICACION_MENU_ITEM_META: Record<FixedUbicacionMenuItemKey, { icon: string; label: string }> = {
  Inicio: { icon: '🏠', label: 'Inicio' },
  Ubicación: { icon: '📍', label: 'Ubicación en vivo' },
  Reglas: { icon: '🔔', label: 'Reglas' },
}

export function ubicacionMenuEntryMeta(entry: UbicacionMenuEntry): { icon: string; label: string } {
  if (!isCustomUbicacionMenuKey(entry.key)) return UBICACION_MENU_ITEM_META[entry.key as FixedUbicacionMenuItemKey]
  return { icon: entry.icon || '📌', label: entry.label || '(sin nombre)' }
}

const DEFAULT_KEYS: FixedUbicacionMenuItemKey[] = ['Inicio', 'Ubicación', 'Reglas']

const KEY = 'familyapp:ubicacion-menu-layout'

function defaultLayout(): UbicacionMenuGroup[] {
  return [{ id: 'default', name: null, items: DEFAULT_KEYS.map((key) => ({ key })) }]
}

export function loadUbicacionMenuLayout(): UbicacionMenuGroup[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLayout()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultLayout()
    const groups: UbicacionMenuGroup[] = (parsed as { id: string; name: string | null; items: unknown[] }[]).map((g) => ({
      id: g.id,
      name: g.name,
      items: g.items.map((item) => (typeof item === 'string' ? { key: item as UbicacionMenuItemKey } : (item as UbicacionMenuEntry))),
    }))
    const known = new Set(groups.flatMap((g) => g.items.map((it) => it.key)))
    const missing = DEFAULT_KEYS.filter((k) => !known.has(k))
    if (missing.length === 0) return groups
    return groups.map((g, i) => (i === 0 ? { ...g, items: [...g.items, ...missing.map((key) => ({ key }))] } : g))
  } catch {
    return defaultLayout()
  }
}

export function saveUbicacionMenuLayout(layout: UbicacionMenuGroup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // Sin localStorage — se queda en el orden por defecto.
  }
}

const PINNED_KEY = 'familyapp:ubicacion-pinned-tabs'

function isValidUbicacionMenuKey(k: unknown): k is UbicacionMenuItemKey {
  return typeof k === 'string' && ((DEFAULT_KEYS as readonly string[]).includes(k) || k.startsWith('custom:'))
}

export function loadUbicacionPinnedItems(): UbicacionMenuItemKey[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidUbicacionMenuKey) : []
  } catch {
    return []
  }
}

export function saveUbicacionPinnedItems(items: UbicacionMenuItemKey[]) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(items))
  } catch {
    // Sin localStorage — se queda todo dentro del desplegable.
  }
}
