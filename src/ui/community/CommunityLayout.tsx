import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import header640 from '@/assets/community/comunidad-master-v1-640.webp'
import header1280 from '@/assets/community/comunidad-master-v1-1280.webp'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { paths } from '@/ui/community/communityNav'
import '@/ui/community/community.css'

// Marco de TODAS las páginas de Comunidad (portada, secciones, publicaciones, comentarios, perfiles, borradores y páginas internas): arriba va siempre la
// cabecera oficial COMUNIDAD_MASTER_v1 (la imagen aprobada, sin rediseñar ni recortar a Pepa o al rótulo), y debajo el menú de Comunidad.
// La imagen original está guardada sin tocar en src/assets/brand/variants/comunidad-master-v1.png; aquí se sirve una versión WebP optimizada de la misma
// imagen (640 y 1280 px de ancho) para no gastar datos del móvil.
export function CommunityHeader() {
  return (
    <header className="community-header">
      <img
        className="community-header-img"
        src={header640}
        srcSet={`${header640} 640w, ${header1280} 1280w`}
        sizes="(max-width: 640px) 90vw, 560px"
        width={1672}
        height={941}
        alt="Comunidad PEPA: Pepa con recetas, consejos, conversaciones y familias conectadas"
        decoding="async"
      />
    </header>
  )
}

const LINKS: { to: string; label: string; end?: boolean }[] = [
  { to: paths.home, label: 'Portada', end: true },
  { to: '/comunidad/s/recetas', label: '🍲 Recetas y cocina' },
  { to: '/comunidad/s/hogar', label: '🏡 Hogar y familia' },
  { to: paths.search(), label: '🔎 Buscar' },
  { to: paths.saved, label: '🔖 Guardados' },
  { to: paths.drafts, label: '📝 Borradores' },
  { to: paths.news, label: '🔔 Novedades' },
  { to: paths.medals, label: '🏅 Medallas' },
  { to: paths.myProfile, label: '🙂 Mi perfil' },
]

export function CommunityLayout() {
  const { me, status, loading } = useCommunity()
  const location = useLocation()

  // Mientras no esté abierta (y la persona no sea administradora) Comunidad no se enseña.
  if (!loading && status && !status.visible) {
    return (
      <div className="screen community-screen">
        <CommunityHeader />
        <p className="community-closed">Comunidad PEPA todavía no está abierta. ¡Muy pronto podrás compartir recetas y consejos con otras familias!</p>
        <Link to="/" className="link-button">
          Volver a Inicio
        </Link>
      </div>
    )
  }

  return (
    <div className="screen community-screen">
      <CommunityHeader />
      {status && !status.launched && status.isAdmin && (
        <p className="community-preview-banner" role="note">
          Vista previa para administración: Comunidad todavía no está abierta al resto de usuarios.
        </p>
      )}
      <nav className="community-nav" aria-label="Menú de Comunidad">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => 'community-nav-link' + (isActive ? ' active' : '')} state={{ from: location.pathname }}>
            {l.label}
          </NavLink>
        ))}
        {(me?.isAdmin || status?.isAdmin) && (
          <NavLink to={paths.admin} className={({ isActive }) => 'community-nav-link' + (isActive ? ' active' : '')}>
            🛠️ Administración
          </NavLink>
        )}
      </nav>
      <Outlet />
    </div>
  )
}
