// Petición real: "esa pestaña dentro de Inicio del desplegable quiero
// que se puedan editar y que se puedan cambiar de posición... más
// arriba, más abajo, agruparla como quiera... por categoría" — el
// contenido del ☰ de Economía (las 6 pestañas + los 3 accesos que
// antes eran botones flotantes) se guarda en el dispositivo como una
// lista de grupos con nombre, editable desde el propio desplegable
// (ver EconomiaMenuDropdown en FinanceScreen.tsx). Mismo patrón que
// tabOrder.ts (orden del ☰ Menú global) pero con grupos, no solo orden.
//
// Luego: "¿cómo puedo crear un acceso nuevo, con su propio nombre e
// icono, no solo una carpeta para agrupar los que ya hay?" — por eso
// las claves fijas (FixedEconomiaMenuItemKey) conviven con claves
// personalizadas ("custom:<id>"), que llevan su propio icono/nombre
// dentro del propio item en vez de en ECONOMIA_MENU_ITEM_META (esa
// tabla solo conoce las fijas).

export type FixedEconomiaMenuItemKey =
  | 'Resumen'
  | 'Estadísticas'
  | 'Movimientos'
  | 'Presupuesto Generales'
  | 'Banco'
  | 'Educación financiera'
  | 'accion:categorias'
  | 'accion:etiquetas'
  | 'accion:movimiento'

export type EconomiaMenuItemKey = FixedEconomiaMenuItemKey | `custom:${string}`

export function isCustomEconomiaMenuKey(key: EconomiaMenuItemKey): boolean {
  return key.startsWith('custom:')
}

export interface EconomiaMenuEntry {
  key: EconomiaMenuItemKey
  // Solo para accesos personalizados (key empieza por "custom:") — las
  // 9 claves fijas siempre sacan su icono/nombre de
  // ECONOMIA_MENU_ITEM_META, estos campos se ignoran para ellas.
  icon?: string
  label?: string
}

export interface EconomiaMenuGroup {
  id: string
  // null = grupo "sin nombre" (no muestra encabezado en el desplegable).
  name: string | null
  items: EconomiaMenuEntry[]
}

export const ECONOMIA_MENU_ITEM_META: Record<FixedEconomiaMenuItemKey, { icon: string; label: string }> = {
  Resumen: { icon: '🏠', label: 'Inicio' },
  Estadísticas: { icon: '📊', label: 'Estadísticas' },
  Movimientos: { icon: '📋', label: 'Movimientos' },
  'Presupuesto Generales': { icon: '💰', label: 'Presupuesto Generales' },
  Banco: { icon: '🏦', label: 'Banco' },
  'Educación financiera': { icon: '🎓', label: 'Educación financiera' },
  'accion:categorias': { icon: '🗂️', label: 'Categorías' },
  'accion:etiquetas': { icon: '🏷️', label: 'Etiquetas' },
  'accion:movimiento': { icon: '➕', label: 'Nuevo movimiento' },
}

// Icono/nombre a mostrar para cualquier entrada, fija o personalizada.
export function economiaMenuEntryMeta(entry: EconomiaMenuEntry): { icon: string; label: string } {
  if (!isCustomEconomiaMenuKey(entry.key)) return ECONOMIA_MENU_ITEM_META[entry.key as FixedEconomiaMenuItemKey]
  return { icon: entry.icon || '📌', label: entry.label || '(sin nombre)' }
}

const DEFAULT_KEYS: FixedEconomiaMenuItemKey[] = [
  'Resumen',
  'Estadísticas',
  'Movimientos',
  'Presupuesto Generales',
  'Banco',
  'Educación financiera',
  'accion:categorias',
  'accion:etiquetas',
  'accion:movimiento',
]

const KEY = 'familyapp:economia-menu-layout'

function defaultLayout(): EconomiaMenuGroup[] {
  return [{ id: 'default', name: null, items: DEFAULT_KEYS.map((key) => ({ key })) }]
}

export function loadEconomiaMenuLayout(): EconomiaMenuGroup[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLayout()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultLayout()
    // Versión anterior guardaba items como string[] en vez de
    // {key, icon?, label?}[] — se adapta sola, sin perder lo ya
    // guardado (nombres/orden de categorías incluidos).
    const groups: EconomiaMenuGroup[] = (parsed as { id: string; name: string | null; items: unknown[] }[]).map((g) => ({
      id: g.id,
      name: g.name,
      items: g.items.map((item) => (typeof item === 'string' ? { key: item as EconomiaMenuItemKey } : (item as EconomiaMenuEntry))),
    }))
    // Si en una actualización futura se añade una clave fija nueva,
    // que aparezca sola (al final del primer grupo) en vez de
    // desaparecer del desplegable hasta que alguien lo note.
    const known = new Set(groups.flatMap((g) => g.items.map((it) => it.key)))
    const missing = DEFAULT_KEYS.filter((k) => !known.has(k))
    if (missing.length === 0) return groups
    return groups.map((g, i) => (i === 0 ? { ...g, items: [...g.items, ...missing.map((key) => ({ key }))] } : g))
  } catch {
    return defaultLayout()
  }
}

export function saveEconomiaMenuLayout(layout: EconomiaMenuGroup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // Sin localStorage (privado/bloqueado) — se queda en el orden por
    // defecto, no rompe nada.
  }
}
