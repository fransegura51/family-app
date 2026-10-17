import { Link, useLocation } from 'react-router-dom'
import { paths } from '@/ui/community/communityNav'

export interface ToolbarItem {
  key: 'search' | 'saved' | 'drafts' | 'recent' | 'profile' | 'publish'
  icon: string
  label: string
  to: string
  // Solo para quien puede participar (con permiso de solo lectura no hay nada que guardar, borrar ni publicar).
  participates?: boolean
  // Las rutas que cuentan como «estás aquí» además de la propia (p. ej. «Mi perfil» marca también los ajustes de perfil y las medallas).
  alsoActive?: string[]
}

// Barra compacta bajo la cabecera: una sola fila, iconos con etiqueta corta, sin desplazamiento lateral. «Publicar» es la acción principal y se ve más destacada.
// Medallas ya NO está aquí: viven dentro de «Mi perfil». Administración tampoco: es un enlace discreto dentro del menú «☰ Menú».
export function communityToolbarItems(profileId: string | null | undefined): ToolbarItem[] {
  return [
    { key: 'search', icon: '🔍', label: 'Buscar', to: paths.search() },
    {
      key: 'saved',
      icon: '🔖',
      label: 'Guardados',
      to: paths.saved,
      participates: true,
    },
    {
      key: 'drafts',
      icon: '📝',
      label: 'Borradores',
      to: paths.drafts,
      participates: true,
    },
    { key: 'recent', icon: '✨', label: 'Novedades', to: paths.recent },
    {
      key: 'profile',
      icon: '👤',
      label: 'Mi perfil',
      to: profileId ? paths.profile(profileId) : paths.myProfile,
      participates: true,
      alsoActive: [paths.myProfile, paths.medals],
    },
    {
      key: 'publish',
      icon: '✍️',
      label: 'Publicar',
      to: paths.newPost(),
      participates: true,
    },
  ]
}

function isOn(pathname: string, to: string): boolean {
  const base = to.split('?')[0]
  return pathname === base || pathname.startsWith(base + '/')
}

export function CommunityToolbar({ canParticipate, profileId }: { canParticipate: boolean; profileId?: string | null }) {
  const location = useLocation()
  const items = communityToolbarItems(profileId).filter((i) => canParticipate || !i.participates)
  return (
    <nav className="community-toolbar" aria-label="Herramientas de Comunidad">
      {items.map((i) => {
        const active = [i.to, ...(i.alsoActive ?? [])].some((to) => isOn(location.pathname, to))
        return (
          <Link
            key={i.key}
            to={i.to}
            className={'community-toolbar-item' + (i.key === 'publish' ? ' community-toolbar-publish' : '') + (active ? ' active' : '')}
            aria-current={active ? 'page' : undefined}
            state={{ from: location.pathname }}
          >
            <span className="community-toolbar-icon" aria-hidden="true">
              {i.icon}
            </span>
            <span className="community-toolbar-label">{i.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
