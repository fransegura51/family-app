import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import header640 from '@/assets/community/comunidad-master-v1-640.webp'
import header1280 from '@/assets/community/comunidad-master-v1-1280.webp'
import {
  activeCommunityMenuKey,
  COMMUNITY_MENU_META,
  loadCommunityMenuOrder,
  loadCommunityPinned,
  saveCommunityMenuOrder,
  saveCommunityPinned,
  type CommunityMenuKey,
} from '@/state/communityMenu'
import { ReadOnlyNotice } from '@/ui/community/CommunityAccessNotices'
import { CommunityMenu } from '@/ui/community/CommunityMenu'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { CommunityToolbar } from '@/ui/community/CommunityToolbar'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
import { useHideFloatingOnScroll } from '@/ui/community/useHideFloatingOnScroll'
import '@/ui/community/community.css'

// Marco de TODAS las páginas de Comunidad (portada, secciones, publicaciones, comentarios, perfiles, borradores y páginas internas). De arriba abajo:
//   1. franja compacta con el botón «☰ Menú» (mismo desplegable que Compras: Portada, Recetas y cocina, Hogar y familia),
//   2. la cabecera oficial COMUNIDAD_MASTER_v1 a todo el ancho útil, entera (sin deformar ni recortar a Pepa o al rótulo),
//   3. la barra de herramientas (Buscar, Guardados, Borradores, Novedades, Mi perfil, Publicar).
// La imagen original está guardada sin tocar en src/assets/brand/variants/comunidad-master-v1.png; aquí se sirve una versión WebP optimizada de la misma
// imagen (640 y 1280 px de ancho) para no gastar datos del móvil.
export function CommunityHeader() {
  return (
    <header className="community-header">
      <img
        className="community-header-img"
        src={header640}
        srcSet={`${header640} 640w, ${header1280} 1280w`}
        sizes="(max-width: 760px) 100vw, 728px"
        width={1672}
        height={941}
        alt="Comunidad PEPA: Pepa con recetas, consejos, conversaciones y familias conectadas"
        decoding="async"
      />
    </header>
  )
}

export function CommunityLayout() {
  const { me, status, loading } = useCommunity()
  const { canParticipate } = useCommunityAccess()
  const location = useLocation()
  const navigate = useNavigate()
  useHideFloatingOnScroll()

  // Menú «☰ Menú»: se cierra al elegir un destino (cambia la ruta), con Escape, tocando fuera y con su botón «Cerrar». Orden y accesos «sacados» a la pantalla se
  // guardan en este móvil (como en el resto de menús), sin ninguna consulta al servidor.
  const [menuOpen, setMenuOpen] = useState(false)
  const [order, setOrder] = useState<CommunityMenuKey[]>(() => loadCommunityMenuOrder())
  const [pinned, setPinned] = useState<CommunityMenuKey[]>(() => loadCommunityPinned())
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    const onOutside = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [menuOpen])

  const changeOrder = useCallback((next: CommunityMenuKey[]) => {
    setOrder(next)
    saveCommunityMenuOrder(next)
  }, [])
  const togglePin = useCallback((key: CommunityMenuKey) => {
    setPinned((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      saveCommunityPinned(next)
      return next
    })
  }, [])

  // Mientras no esté abierta Comunidad no se enseña (con el interruptor de lanzamiento en 0 solo entran las cuentas propietarias).
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

  const isAdmin = !!(me?.isAdmin || status?.isAdmin)
  const activeKey = activeCommunityMenuKey(location.pathname)
  const pinnedInOrder = order.filter((k) => pinned.includes(k))

  return (
    <div className="screen community-screen">
      <div className="community-topstrip" ref={menuRef}>
        <button
          type="button"
          ref={menuButtonRef}
          className="community-menu-btn"
          aria-expanded={menuOpen}
          aria-controls="community-menu"
          aria-label={menuOpen ? 'Cerrar menú de Comunidad' : 'Abrir menú de Comunidad'}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? '✕' : '☰'} Menú
        </button>
        <span className="community-topstrip-title">{activeKey ? COMMUNITY_MENU_META[activeKey].label : 'Comunidad PEPA'}</span>
        {menuOpen && (
          <CommunityMenu
            order={order}
            pinned={pinned}
            activeKey={activeKey}
            isAdmin={isAdmin}
            onOrderChange={changeOrder}
            onTogglePin={togglePin}
            onGo={(to) => navigate(to, { state: { from: location.pathname } })}
            onClose={() => {
              setMenuOpen(false)
              menuButtonRef.current?.focus()
            }}
          />
        )}
      </div>
      <CommunityHeader />
      {pinnedInOrder.length > 0 && (
        <div className="filter-row community-pinned-row" aria-label="Accesos a la vista">
          {pinnedInOrder.map((key) => (
            <button
              key={key}
              type="button"
              className={'chip' + (activeKey === key ? ' chip-active' : '')}
              aria-current={activeKey === key ? 'page' : undefined}
              onClick={() =>
                navigate(COMMUNITY_MENU_META[key].to, {
                  state: { from: location.pathname },
                })
              }
            >
              <span aria-hidden="true">{COMMUNITY_MENU_META[key].icon}</span> {COMMUNITY_MENU_META[key].label}
            </button>
          ))}
        </div>
      )}
      <CommunityToolbar canParticipate={canParticipate} profileId={me?.id ?? null} />
      <ReadOnlyNotice />
      <Outlet />
    </div>
  )
}
