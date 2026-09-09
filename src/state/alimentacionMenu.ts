// Mismo patrón que economiaMenu.ts — petición real: "todas estas
// pestañas... quiero que hagamos como en economía, quiero que haga su
// menú de inicio con tres rayas arriba y metas todas las pestañas en
// el menú de inicio, meter y sacar para obtenerla fuera o dentro,
// poder editar... el mismo formato que el menú de economía". Se
// duplica en vez de generalizar economiaMenu.ts porque esa pantalla ya
// está en producción y probada — tocarla para generalizarla es más
// riesgo que las ~80 líneas que se repiten aquí.

export type FixedAlimentacionMenuItemKey = 'Inicio' | 'Menú' | 'Recetas' | 'Registro' | 'Peso'
export type AlimentacionMenuItemKey = FixedAlimentacionMenuItemKey | `custom:${string}`

export function isCustomAlimentacionMenuKey(key: AlimentacionMenuItemKey): boolean {
  return key.startsWith('custom:')
}

export interface AlimentacionMenuEntry {
  key: AlimentacionMenuItemKey
  // Solo para accesos personalizados — las 5 claves fijas siempre sacan
  // su icono/nombre de ALIMENTACION_MENU_ITEM_META.
  icon?: string
  label?: string
}

export interface AlimentacionMenuGroup {
  id: string
  name: string | null
  items: AlimentacionMenuEntry[]
}

export const ALIMENTACION_MENU_ITEM_META: Record<FixedAlimentacionMenuItemKey, { icon: string; label: string }> = {
  Inicio: { icon: '🏠', label: 'Inicio' },
  Menú: { icon: '📅', label: 'Menú semanal' },
  Recetas: { icon: '📖', label: 'Recetas' },
  Registro: { icon: '📝', label: 'Registro' },
  Peso: { icon: '⚖️', label: 'Peso' },
}

export function alimentacionMenuEntryMeta(entry: AlimentacionMenuEntry): { icon: string; label: string } {
  if (!isCustomAlimentacionMenuKey(entry.key)) return ALIMENTACION_MENU_ITEM_META[entry.key as FixedAlimentacionMenuItemKey]
  return { icon: entry.icon || '📌', label: entry.label || '(sin nombre)' }
}

const DEFAULT_KEYS: FixedAlimentacionMenuItemKey[] = ['Inicio', 'Menú', 'Recetas', 'Registro', 'Peso']

const KEY = 'familyapp:alimentacion-menu-layout'

function defaultLayout(): AlimentacionMenuGroup[] {
  return [{ id: 'default', name: null, items: DEFAULT_KEYS.map((key) => ({ key })) }]
}

export function loadAlimentacionMenuLayout(): AlimentacionMenuGroup[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLayout()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultLayout()
    const groups: AlimentacionMenuGroup[] = (parsed as { id: string; name: string | null; items: unknown[] }[]).map((g) => ({
      id: g.id,
      name: g.name,
      items: g.items.map((item) =>
        typeof item === 'string' ? { key: item as AlimentacionMenuItemKey } : (item as AlimentacionMenuEntry),
      ),
    }))
    // Si en el futuro se añade una clave fija nueva, que aparezca sola
    // (al final del primer grupo) en vez de desaparecer del
    // desplegable hasta que alguien lo note.
    const known = new Set(groups.flatMap((g) => g.items.map((it) => it.key)))
    const missing = DEFAULT_KEYS.filter((k) => !known.has(k))
    if (missing.length === 0) return groups
    return groups.map((g, i) => (i === 0 ? { ...g, items: [...g.items, ...missing.map((key) => ({ key }))] } : g))
  } catch {
    return defaultLayout()
  }
}

export function saveAlimentacionMenuLayout(layout: AlimentacionMenuGroup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // Sin localStorage (privado/bloqueado) — se queda en el orden por
    // defecto, no rompe nada.
  }
}

const PINNED_KEY = 'familyapp:alimentacion-pinned-tabs'

function isValidAlimentacionMenuKey(k: unknown): k is AlimentacionMenuItemKey {
  return typeof k === 'string' && ((DEFAULT_KEYS as readonly string[]).includes(k) || k.startsWith('custom:'))
}

export function loadAlimentacionPinnedItems(): AlimentacionMenuItemKey[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidAlimentacionMenuKey) : []
  } catch {
    return []
  }
}

export function saveAlimentacionPinnedItems(items: AlimentacionMenuItemKey[]) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(items))
  } catch {
    // Sin localStorage — se queda todo dentro del desplegable.
  }
}
