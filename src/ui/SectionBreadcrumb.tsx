import { Link, useLocation } from 'react-router-dom'
import { NAV_TABS, type NavTab } from '@/domain/navTabs'

// Ayuda, Buzón de sugerencias y Configuración son secciones navegables reales (tienen su propia ruta y
// cabecera) pero viven fuera de NAV_TABS — se añaden a mano a NavShell (botones sueltos al final del
// desplegable ☰), no en el bucle de pestañas. Mismo criterio aquí para que SectionBreadcrumb las
// resuelva igual que las 12 normales, sin inventar una semántica nueva solo para encajarlas.
const EXTRA_SECTIONS: NavTab[] = [
  { to: '/ayuda', label: 'Ayuda', icon: '❓' },
  { to: '/sugerencias', label: 'Buzón', icon: '💡' },
  { to: '/menu-organizar', label: 'Configuración', icon: '⚙️' },
]
const ALL_SECTIONS: NavTab[] = [...NAV_TABS, ...EXTRA_SECTIONS]

// Actividad (/actividad) y el Panel de admin (/admin-uso) no están aquí a propósito — no son secciones
// normales del menú (sin entrada en NAV_TABS ni en el ☰), así que no llevan SectionBreadcrumb.
export function sectionForPath(pathname: string): NavTab | null {
  const matches = ALL_SECTIONS.filter((t) => t.to !== '/' && (pathname === t.to || pathname.startsWith(`${t.to}/`)))
  if (matches.length === 0) return null
  // Más específica primero — ninguna ruta real está anidada hoy, pero esto deja el criterio correcto
  // si alguna vez lo estuviera, en vez de depender del orden de NAV_TABS.
  return matches.sort((a, b) => b.to.length - a.to.length)[0]
}

// Navegación de orientación "Sección / Ubicación actual" — capa puramente aditiva, nunca sustituye la
// navegación real de cada pantalla (tabs, vistas, deep-links siguen exactamente igual). La sección se
// resuelve sola a partir de la ruta; la subsección es la única pieza que depende del estado interno de
// cada pantalla, así que se recibe por prop. Máximo dos niveles siempre — nunca un tercero (petición
// real: dentro de un evento con un módulo abierto, "Eventos / Boda de plata", nunca "/Invitados").
export function SectionBreadcrumb({ subsection }: { subsection: string }) {
  const location = useLocation()
  const section = sectionForPath(location.pathname)
  if (!section) return null
  return (
    <nav className="section-breadcrumb" aria-label="Ubicación actual">
      {/* state.sectionHome: pulsar la sección siempre significa "vuelve a tu Inicio real", incluso
          cuando ya se está en esa misma ruta (ver useSectionHome) — un <Link> real, sin onClick propio. */}
      <Link to={section.to} state={{ sectionHome: true }} className="section-breadcrumb-section">
        {section.label}
      </Link>
      <span className="section-breadcrumb-sep" aria-hidden="true">
        /
      </span>
      <span className="section-breadcrumb-current" aria-current="page">
        {subsection}
      </span>
    </nav>
  )
}
