import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { Crumb } from '@/ui/community/communityNav'

// Hueco del marco donde van las migas: justo DEBAJO de la cabecera ilustrada y ENCIMA de la barra de herramientas. Cada página sigue escribiendo su <Breadcrumbs/> donde
// siempre, y aquí se coloca en ese hueco. undefined = no hay marco (pruebas o pantallas sueltas: se pintan en su sitio); null = el marco existe pero el hueco aún no está
// montado (no se pinta nada hasta que esté, para no verlas saltar).
export const BreadcrumbSlotContext = createContext<HTMLElement | null | undefined>(undefined)

// Migas de pan de Comunidad (móvil y ordenador): Inicio › Comunidad › [Sección] › Publicación. Nunca llevan el título de la publicación.
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const slot = useContext(BreadcrumbSlotContext)
  if (slot === null) return null
  const nav = (
    <nav className="community-crumbs" aria-label="Migas de pan">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={`${c.label}-${i}`} aria-current={last ? 'page' : undefined}>
              {c.to && !last ? <Link to={c.to} state={c.state}>{c.label}</Link> : <span>{c.label}</span>}
              {!last && <span aria-hidden="true"> › </span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
  return slot ? createPortal(nav, slot) : nav
}
