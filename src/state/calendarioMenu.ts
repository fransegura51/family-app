// Mismo patrón que economiaMenu.ts / alimentacionMenu.ts / comprasMenu.ts
// / ubicacionMenu.ts — petición real: "esas pestañas las metes en una
// con tres rayas igual, un desplegable... que se abran y se pueda
// elegir las pestañas... con el mismo formato que economía, que se
// puedan sacar, que se puedan quitar, que se puedan editar". "Vista
// general" hace de Inicio (se abre por defecto), igual que "Resumen"
// en Economía se etiqueta "Inicio" en el desplegable sin dejar de ser
// una pestaña real.

export type FixedCalendarioMenuItemKey = 'Vista general' | 'Mes' | 'Semana' | '3 días' | 'Día' | 'Familiar' | 'Agenda' | 'Externos'
export type CalendarioMenuItemKey = FixedCalendarioMenuItemKey | `custom:${string}`

export function isCustomCalendarioMenuKey(key: CalendarioMenuItemKey): boolean {
  return key.startsWith('custom:')
}

export interface CalendarioMenuEntry {
  key: CalendarioMenuItemKey
  icon?: string
  label?: string
}

export interface CalendarioMenuGroup {
  id: string
  name: string | null
  items: CalendarioMenuEntry[]
}

export const CALENDARIO_MENU_ITEM_META: Record<FixedCalendarioMenuItemKey, { icon: string; label: string }> = {
  'Vista general': { icon: '🏠', label: 'Inicio' },
  Mes: { icon: '📅', label: 'Mes' },
  Semana: { icon: '📆', label: 'Semana' },
  '3 días': { icon: '📋', label: '3 días' },
  Día: { icon: '🗓️', label: 'Día' },
  Familiar: { icon: '👨‍👩‍👧‍👦', label: 'Familiar' },
  Agenda: { icon: '📝', label: 'Agenda' },
  Externos: { icon: '🔗', label: 'Externos' },
}

export function calendarioMenuEntryMeta(entry: CalendarioMenuEntry): { icon: string; label: string } {
  if (!isCustomCalendarioMenuKey(entry.key)) return CALENDARIO_MENU_ITEM_META[entry.key as FixedCalendarioMenuItemKey]
  return { icon: entry.icon || '📌', label: entry.label || '(sin nombre)' }
}

const DEFAULT_KEYS: FixedCalendarioMenuItemKey[] = ['Vista general', 'Mes', 'Semana', '3 días', 'Día', 'Familiar', 'Agenda', 'Externos']

const KEY = 'familyapp:calendario-menu-layout'

function defaultLayout(): CalendarioMenuGroup[] {
  return [{ id: 'default', name: null, items: DEFAULT_KEYS.map((key) => ({ key })) }]
}

export function loadCalendarioMenuLayout(): CalendarioMenuGroup[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLayout()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultLayout()
    const groups: CalendarioMenuGroup[] = (parsed as { id: string; name: string | null; items: unknown[] }[]).map((g) => ({
      id: g.id,
      name: g.name,
      items: g.items.map((item) => (typeof item === 'string' ? { key: item as CalendarioMenuItemKey } : (item as CalendarioMenuEntry))),
    }))
    const known = new Set(groups.flatMap((g) => g.items.map((it) => it.key)))
    const missing = DEFAULT_KEYS.filter((k) => !known.has(k))
    if (missing.length === 0) return groups
    return groups.map((g, i) => (i === 0 ? { ...g, items: [...g.items, ...missing.map((key) => ({ key }))] } : g))
  } catch {
    return defaultLayout()
  }
}

export function saveCalendarioMenuLayout(layout: CalendarioMenuGroup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // Sin localStorage — se queda en el orden por defecto.
  }
}

const PINNED_KEY = 'familyapp:calendario-pinned-tabs'

function isValidCalendarioMenuKey(k: unknown): k is CalendarioMenuItemKey {
  return typeof k === 'string' && ((DEFAULT_KEYS as readonly string[]).includes(k) || k.startsWith('custom:'))
}

export function loadCalendarioPinnedItems(): CalendarioMenuItemKey[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidCalendarioMenuKey) : []
  } catch {
    return []
  }
}

export function saveCalendarioPinnedItems(items: CalendarioMenuItemKey[]) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(items))
  } catch {
    // Sin localStorage — se queda todo dentro del desplegable.
  }
}
