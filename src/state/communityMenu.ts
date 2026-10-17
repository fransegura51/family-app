// Menú desplegable de Comunidad (☰ Menú): mismo patrón que comprasMenu.ts / economiaMenu.ts / alimentacionMenu.ts (orden propio, accesos «sacados» a la pantalla, edición),
// reducido a lo que tiene sentido aquí: SOLO tres destinos (Portada, Recetas y cocina, Hogar y familia). Es por móvil (localStorage, como el resto de menús: no cuesta ninguna
// consulta a Supabase). Administración NO es un acceso configurable: aparece aparte, discreto, solo para la administración.
export type CommunityMenuKey = 'portada' | 'recetas' | 'hogar'

export const COMMUNITY_MENU_KEYS: readonly CommunityMenuKey[] = ['portada', 'recetas', 'hogar']

export const COMMUNITY_MENU_META: Record<CommunityMenuKey, { icon: string; label: string; to: string; end?: boolean }> = {
  portada: { icon: '🏠', label: 'Portada', to: '/comunidad', end: true },
  recetas: { icon: '🍲', label: 'Recetas y cocina', to: '/comunidad/s/recetas' },
  hogar: { icon: '🏡', label: 'Hogar y familia', to: '/comunidad/s/hogar' },
}

const ORDER_KEY = 'familyapp:community-menu-order'
const PINNED_KEY = 'familyapp:community-pinned-tabs'

const isKey = (k: unknown): k is CommunityMenuKey => typeof k === 'string' && (COMMUNITY_MENU_KEYS as readonly string[]).includes(k)

// Lo guardado puede venir incompleto o dañado: se completa con las claves que falten (al final) y se descarta lo desconocido y lo repetido.
export function sanitizeCommunityMenuOrder(raw: unknown): CommunityMenuKey[] {
  const saved = Array.isArray(raw) ? raw.filter(isKey) : []
  const unique = [...new Set(saved)]
  return [...unique, ...COMMUNITY_MENU_KEYS.filter((k) => !unique.includes(k))]
}

export function sanitizeCommunityPinned(raw: unknown): CommunityMenuKey[] {
  return Array.isArray(raw) ? [...new Set(raw.filter(isKey))] : []
}

export function loadCommunityMenuOrder(): CommunityMenuKey[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    return sanitizeCommunityMenuOrder(raw ? JSON.parse(raw) : null)
  } catch {
    return sanitizeCommunityMenuOrder(null)
  }
}

export function saveCommunityMenuOrder(order: CommunityMenuKey[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(sanitizeCommunityMenuOrder(order)))
  } catch {
    // Sin localStorage: se queda el orden de siempre.
  }
}

export function loadCommunityPinned(): CommunityMenuKey[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    return sanitizeCommunityPinned(raw ? JSON.parse(raw) : null)
  } catch {
    return []
  }
}

export function saveCommunityPinned(items: CommunityMenuKey[]): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(sanitizeCommunityPinned(items)))
  } catch {
    // Sin localStorage: todo se queda dentro del desplegable.
  }
}

// ¿Qué destino del menú es el de la dirección actual? (para marcar «estás aquí»). Las demás pantallas (buscar, guardados, una publicación…) no marcan ninguno.
export function activeCommunityMenuKey(pathname: string): CommunityMenuKey | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/comunidad') return 'portada'
  if (path === '/comunidad/s/recetas' || path.startsWith('/comunidad/s/recetas/')) return 'recetas'
  if (path === '/comunidad/s/hogar' || path.startsWith('/comunidad/s/hogar/')) return 'hogar'
  return null
}

// Mover un destino una posición (−1 arriba, +1 abajo); fuera de los extremos no hace nada.
export function moveMenuKey(order: readonly CommunityMenuKey[], key: CommunityMenuKey, direction: -1 | 1): CommunityMenuKey[] {
  const i = order.indexOf(key)
  const j = i + direction
  if (i === -1 || j < 0 || j >= order.length) return [...order]
  const next = [...order]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
