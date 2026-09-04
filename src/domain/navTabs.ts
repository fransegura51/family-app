// Las 12 secciones de la navegación inferior — en un módulo aparte
// (no dentro de NavShell.tsx) para que la pantalla de "Organizar
// menú" (MenuSettingsScreen) pueda usar la misma lista sin depender
// de NavShell ni al revés.
export interface NavTab {
  to: string
  label: string
  icon: string
  end?: true
}

export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/familia', label: 'Familia', icon: '👨‍👩‍👧‍👦' },
  { to: '/calendario', label: 'Calendario', icon: '📅' },
  { to: '/puntos', label: 'Puntos', icon: '⭐' },
  { to: '/compras', label: 'Compras', icon: '🛒' },
  { to: '/alimentacion', label: 'Alimentación', icon: '🍎' },
  { to: '/dinero', label: 'Dinero', icon: '💶' },
  { to: '/ubicacion', label: 'Ubicación', icon: '📍' },
  { to: '/cumpleanos', label: 'Cumpleaños', icon: '🎂' },
  { to: '/contactos', label: 'Contactos', icon: '📇' },
  { to: '/galeria', label: 'Galería', icon: '📷' },
  { to: '/documentos', label: 'Documentos', icon: '📁' },
]

export const NAV_TAB_PATHS = NAV_TABS.map((t) => t.to)
export const NAV_TAB_BY_PATH = new Map(NAV_TABS.map((t) => [t.to, t]))

export function isActiveNavPath(pathname: string, tab: NavTab): boolean {
  return tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(tab.to + '/')
}
