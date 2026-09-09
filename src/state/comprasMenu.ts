// Mismo patrón que economiaMenu.ts / alimentacionMenu.ts — petición
// real: "a toda la aplicación que tenga menús... el mismo formato que
// economía". Se duplica en vez de generalizar por lo mismo que
// alimentacionMenu.ts: menos riesgo que tocar una pantalla ya en
// producción para generalizarla.

export type FixedComprasMenuItemKey = 'Inicio' | 'Lista' | 'Historial' | 'No alimentos' | 'Tickets' | 'Registro Alimentación'
export type ComprasMenuItemKey = FixedComprasMenuItemKey | `custom:${string}`

export function isCustomComprasMenuKey(key: ComprasMenuItemKey): boolean {
  return key.startsWith('custom:')
}

export interface ComprasMenuEntry {
  key: ComprasMenuItemKey
  icon?: string
  label?: string
}

export interface ComprasMenuGroup {
  id: string
  name: string | null
  items: ComprasMenuEntry[]
}

export const COMPRAS_MENU_ITEM_META: Record<FixedComprasMenuItemKey, { icon: string; label: string }> = {
  Inicio: { icon: '🏠', label: 'Inicio' },
  Lista: { icon: '🛒', label: 'Lista de la compra' },
  Historial: { icon: '📈', label: 'Historial de precios' },
  'No alimentos': { icon: '🧴', label: 'No alimentos' },
  Tickets: { icon: '🧾', label: 'Tickets' },
  'Registro Alimentación': { icon: '🍎', label: 'Registro Alimentación' },
}

export function comprasMenuEntryMeta(entry: ComprasMenuEntry): { icon: string; label: string } {
  if (!isCustomComprasMenuKey(entry.key)) return COMPRAS_MENU_ITEM_META[entry.key as FixedComprasMenuItemKey]
  return { icon: entry.icon || '📌', label: entry.label || '(sin nombre)' }
}

const DEFAULT_KEYS: FixedComprasMenuItemKey[] = ['Inicio', 'Lista', 'Historial', 'No alimentos', 'Tickets', 'Registro Alimentación']

const KEY = 'familyapp:compras-menu-layout'

function defaultLayout(): ComprasMenuGroup[] {
  return [{ id: 'default', name: null, items: DEFAULT_KEYS.map((key) => ({ key })) }]
}

export function loadComprasMenuLayout(): ComprasMenuGroup[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultLayout()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultLayout()
    const groups: ComprasMenuGroup[] = (parsed as { id: string; name: string | null; items: unknown[] }[]).map((g) => ({
      id: g.id,
      name: g.name,
      items: g.items.map((item) => (typeof item === 'string' ? { key: item as ComprasMenuItemKey } : (item as ComprasMenuEntry))),
    }))
    const known = new Set(groups.flatMap((g) => g.items.map((it) => it.key)))
    const missing = DEFAULT_KEYS.filter((k) => !known.has(k))
    if (missing.length === 0) return groups
    return groups.map((g, i) => (i === 0 ? { ...g, items: [...g.items, ...missing.map((key) => ({ key }))] } : g))
  } catch {
    return defaultLayout()
  }
}

export function saveComprasMenuLayout(layout: ComprasMenuGroup[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // Sin localStorage — se queda en el orden por defecto.
  }
}

const PINNED_KEY = 'familyapp:compras-pinned-tabs'

function isValidComprasMenuKey(k: unknown): k is ComprasMenuItemKey {
  return typeof k === 'string' && ((DEFAULT_KEYS as readonly string[]).includes(k) || k.startsWith('custom:'))
}

export function loadComprasPinnedItems(): ComprasMenuItemKey[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidComprasMenuKey) : []
  } catch {
    return []
  }
}

export function saveComprasPinnedItems(items: ComprasMenuItemKey[]) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(items))
  } catch {
    // Sin localStorage — se queda todo dentro del desplegable.
  }
}
