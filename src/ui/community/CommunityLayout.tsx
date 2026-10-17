import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import header640 from '@/assets/community/comunidad-master-v1-640.webp'
import header1280 from '@/assets/community/comunidad-master-v1-1280.webp'
import { ReadOnlyNotice } from '@/ui/community/CommunityAccessNotices'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
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

// `participates`: solo se enseña a quien puede participar (con permiso solo de lectura no tienen sentido: no hay nada que guardar ni borradores ni alias).
// `secondary`: va dentro del botón «Más opciones» (las tres secciones principales —Portada, Recetas y cocina, Hogar y familia— están siempre a la vista, sin
// desplazamiento lateral). Ninguna opción se ha quitado: Administración (solo administración) también está en «Más opciones».
const LINKS: { to: string; label: string; end?: boolean; participates?: boolean; secondary?: boolean }[] = [
  { to: paths.home, label: 'Portada', end: true },
  { to: '/comunidad/s/recetas', label: '🍲 Recetas y cocina' },
  { to: '/comunidad/s/hogar', label: '🏡 Hogar y familia' },
  { to: paths.search(), label: '🔎 Buscar', secondary: true },
  { to: paths.saved, label: '🔖 Guardados', participates: true, secondary: true },
  { to: paths.drafts, label: '📝 Borradores', participates: true, secondary: true },
  { to: paths.news, label: '🔔 Novedades', secondary: true },
  { to: paths.medals, label: '🏅 Medallas', participates: true, secondary: true },
  { to: paths.myProfile, label: '🙂 Mi perfil', participates: true, secondary: true },
]

export function CommunityLayout() {
  const { me, status, loading } = useCommunity()
  const { canParticipate } = useCommunityAccess()
  const location = useLocation()
  // Menú «Más opciones»: se cierra al elegir una opción (cambia la ruta), con Escape, tocando fuera y con su botón «Cerrar».
  const [moreOpen, setMoreOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false)
        moreButtonRef.current?.focus()
      }
    }
    const onOutside = (e: Event) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [moreOpen])
  const visibleLinks = LINKS.filter((l) => canParticipate || !l.participates)
  const mainLinks = visibleLinks.filter((l) => !l.secondary)
  const moreLinks = visibleLinks.filter((l) => l.secondary)
  const isAdmin = me?.isAdmin || status?.isAdmin
  const moreActive = [...moreLinks.map((l) => l.to.split('?')[0]), ...(isAdmin ? [paths.admin] : [])].some(
    (to) => location.pathname === to || location.pathname.startsWith(to + '/'),
  )

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
      <nav className="community-nav" aria-label="Menú de Comunidad" ref={navRef}>
        <div className="community-nav-main">
          {mainLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => 'community-nav-link' + (isActive ? ' active' : '')} state={{ from: location.pathname }}>
              {l.label}
            </NavLink>
          ))}
          <button
            type="button"
            ref={moreButtonRef}
            className={'community-nav-link community-nav-more-btn' + (moreActive ? ' active' : '') + (moreOpen ? ' open' : '')}
            aria-expanded={moreOpen}
            aria-controls="community-nav-more"
            onClick={() => setMoreOpen((o) => !o)}
          >
            Más opciones {moreOpen ? '▴' : '▾'}
          </button>
        </div>
        {moreOpen && (
          <div id="community-nav-more" className="community-nav-more">
            <ul className="community-nav-more-list">
              {moreLinks.map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} end={l.end} className={({ isActive }) => 'community-nav-link' + (isActive ? ' active' : '')} state={{ from: location.pathname }}>
                    {l.label}
                  </NavLink>
                </li>
              ))}
              {isAdmin && (
                <li>
                  <NavLink to={paths.admin} className={({ isActive }) => 'community-nav-link' + (isActive ? ' active' : '')}>
                    🛠️ Administración
                  </NavLink>
                </li>
              )}
            </ul>
            <button
              type="button"
              className="link-button community-nav-more-close"
              onClick={() => {
                setMoreOpen(false)
                moreButtonRef.current?.focus()
              }}
            >
              Cerrar
            </button>
          </div>
        )}
      </nav>
      <ReadOnlyNotice />
      <Outlet />
    </div>
  )
}
