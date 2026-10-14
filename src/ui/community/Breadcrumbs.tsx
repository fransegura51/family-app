import { Link } from 'react-router-dom'
import type { Crumb } from '@/ui/community/communityNav'

// Migas de pan de Comunidad (móvil y ordenador): Inicio › Comunidad › [Sección] › Publicación. Nunca llevan el título de la publicación.
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="community-crumbs" aria-label="Migas de pan">
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={`${c.label}-${i}`} aria-current={last ? 'page' : undefined}>
              {c.to && !last ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
              {!last && <span aria-hidden="true"> › </span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
