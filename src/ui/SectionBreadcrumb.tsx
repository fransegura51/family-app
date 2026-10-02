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

// Un nivel del breadcrumb, más allá de la Sección (que siempre se resuelve sola de la ruta). `to` +
// `state` solo tienen sentido en un nivel que NO es el último: es un destino determinista, nunca basado
// en volver atrás en el navegador, y el `state` es la misma pieza que `state={{ sectionHome: true }}` ya usaba — un flag
// que la propia pantalla detecta (useSectionHome / useLocationFlag) para volver a ESE nivel real aunque
// la ruta no cambie, porque React Router no remonta al navegar a la misma URL en la que ya se está.
export interface BreadcrumbLevel {
  label: string
  to?: string
  state?: Record<string, boolean>
}

// Navegación de orientación "Sección / Ubicación actual", o "Sección / Contexto real / Ubicación actual"
// cuando la propia pantalla tiene un nivel intermedio genuino (hoy solo Eventos: dentro de un evento con
// un módulo abierto — "Eventos / Boda de plata / Preparativos"). Capa puramente aditiva, nunca sustituye
// la navegación real de cada pantalla (tabs, vistas, deep-links siguen exactamente igual). La Sección se
// resuelve sola a partir de la ruta; todo lo demás depende del estado interno de cada pantalla, así que
// se recibe por `subsection` — un string simple (el caso normal, un único nivel más) o una lista de
// niveles cuando hace falta más de uno. Nunca un número fijo: cada pantalla aporta los que necesite de
// verdad, nunca niveles artificiales solo porque técnicamente exista un componente interno.
export function SectionBreadcrumb({ subsection }: { subsection: string | BreadcrumbLevel[] }) {
  const location = useLocation()
  const section = sectionForPath(location.pathname)
  if (!section) return null
  const extraLevels: BreadcrumbLevel[] = typeof subsection === 'string' ? [{ label: subsection }] : subsection
  // state.sectionHome: pulsar la Sección siempre significa "vuelve a tu Inicio real", incluso cuando ya
  // se está en esa misma ruta (ver useSectionHome) — un <Link> real, sin onClick propio.
  const levels: BreadcrumbLevel[] = [{ label: section.label, to: section.to, state: { sectionHome: true } }, ...extraLevels]
  return (
    <nav className="section-breadcrumb" aria-label="Migas de pan">
      {levels.map((level, i) => {
        const isCurrent = i === levels.length - 1
        return (
          <span className="section-breadcrumb-item" key={`${i}-${level.label}`}>
            {i > 0 && (
              <span className="section-breadcrumb-sep" aria-hidden="true">
                /
              </span>
            )}
            {!isCurrent && level.to ? (
              <Link to={level.to} state={level.state} className="section-breadcrumb-section">
                {level.label}
              </Link>
            ) : (
              // El último nivel es la ubicación actual: texto destacado, nunca un enlace (aria-current
              // marca "estás aquí"). Un nivel intermedio sin `to` (no debería darse hoy) cae también aquí
              // en vez de romper, con el estilo de enlace pero sin comportamiento — nunca sin etiqueta.
              <span className={isCurrent ? 'section-breadcrumb-current' : 'section-breadcrumb-section'} aria-current={isCurrent ? 'page' : undefined}>
                {level.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
