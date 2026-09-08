// Petición real: "esa pestaña dentro de Inicio del desplegable quiero
// que se puedan editar y que se puedan cambiar de posición... más
// arriba, más abajo, agruparla como quiera... por categoría" — el
// contenido del ☰ de Economía (las 6 pestañas + los 3 accesos que
// antes eran botones flotantes) se guarda en el dispositivo como una
// lista de grupos con nombre, editable desde "Organizar menú de
// Economía" (ver EconomiaMenuSettingsScreen). Mismo patrón que
// tabOrder.ts (orden del ☰ Menú global) pero con grupos, no solo orden.

export type EconomiaMenuItemKey =
  | 'Resumen'
  | 'Estadísticas'
  | 'Movimientos'
  | 'Presupuesto Generales'
  | 'Banco'
  | 'Educación financiera'
  | 'accion:categorias'
  | 'accion:etiquetas'
  | 'accion:movimiento'

export interface EconomiaMenuGroup {
  id: string
  // null = grupo "sin nombre" (no muestra encabezado en el desplegable).
  name: string | null
  items: EconomiaMenuItemKey[]
}

export const ECONOMIA_MENU_ITEM_META: Record<EconomiaMenuItemKey, { icon: string; label: string }> = {
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

const DEFAULT_ITEMS: EconomiaMenuItemKey[] = [
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
  return [{ id: 'default', name: null, items: [...DEFAULT_ITEMS] }]
}

export function loadEconomiaMenuLayout(): EconomiaMenuGroup[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLayout()
    const parsed = JSON.parse(raw) as EconomiaMenuGroup[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultLayout()
    // Si en una actualización futura se añade un accesos nuevo, que
    // aparezca solo (al final del primer grupo) en vez de desaparecer
    // del desplegable hasta que alguien lo note.
    const known = new Set(parsed.flatMap((g) => g.items))
    const missing = DEFAULT_ITEMS.filter((k) => !known.has(k))
    if (missing.length === 0) return parsed
    return parsed.map((g, i) => (i === 0 ? { ...g, items: [...g.items, ...missing] } : g))
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
