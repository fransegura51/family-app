import { pastelPalette } from '@/domain/colors'

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
  { to: '/eventos', label: 'Eventos', icon: '🎉' },
  { to: '/puntos', label: 'Puntos', icon: '⭐' },
  { to: '/compras', label: 'Compras', icon: '🛒' },
  { to: '/alimentacion', label: 'La cocina de Pepa', icon: '🍎' },
  { to: '/dinero', label: 'Economía', icon: '💶' },
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

// Identificador de sección para permisos de invitados — el propio
// segmento de la ruta (sin barra), p. ej. "/galeria" -> "galeria".
// "/" (Inicio) siempre es visible, así que no necesita id.
export function navSectionId(tab: NavTab): string {
  return tab.to.replace(/^\//, '')
}

// Petición real: "el menú ☰... pondría los mismos colores que en el
// menú de inicio" — un único mapa, calculado aquí, para que Inicio y
// el desplegable ☰ (NavShell) repartan el mismo pastel por sección en
// vez de cada uno calcular su propia paleta por separado (que
// coincidiría por casualidad, no lo garantizaría).
export const NAV_SECTION_COLORS: ReadonlyMap<string, string> = (() => {
  const sections = NAV_TABS.filter((t) => t.to !== '/')
  const palette = pastelPalette(sections.length)
  return new Map(sections.map((t, i) => [navSectionId(t), palette[i]]))
})()
