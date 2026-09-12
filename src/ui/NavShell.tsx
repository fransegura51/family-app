import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { VoiceCapture } from '@/ui/VoiceCapture'
import { SocialMenuFab, type SocialMenuItem } from '@/ui/SocialMenuFab'
import { NAV_TAB_BY_PATH, NAV_TAB_PATHS, isActiveNavPath, navSectionId, type NavTab } from '@/domain/navTabs'
import { loadTabOrder, resolveTabOrder } from '@/state/tabOrder'
import type { Profile } from '@/domain/types'

// Cuántos iconos se quedan fijos abajo, siempre a la vista — el resto
// vive detrás del botón "Menú". Son los primeros N del orden guardado
// (el mismo que se cambia en Organizar menú), así que fijar cuáles se
// ven es simplemente cuestión de subirlos ahí.
const PINNED_COUNT = 4

// Enlaces a las redes sociales de Pepa, agrupados detrás de un solo
// botón (ver SocialMenuFab.tsx) — petición real: "agrupa las cuatro
// botones de las redes sociales... para que no ocupe lugar en la
// pantalla".
const SOCIAL_MENU_ITEMS: SocialMenuItem[] = [
  {
    href: 'https://vm.tiktok.com/ZN9SCoTPw5T4b-Psl03/',
    label: 'TikTok',
    className: 'tiktok-fab',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="white" aria-hidden="true">
        <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
  {
    href: 'https://www.facebook.com/share/1V4aXKnrKj/',
    label: 'Facebook',
    className: 'facebook-fab',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="white" aria-hidden="true">
        <path d="M13.5 9H15V6.5h-1.5c-1.93 0-3.5 1.57-3.5 3.5v1.5H8v2.5h2v6h2.5v-6H15l.5-2.5h-3V10c0-.55.45-1 1-1z" />
      </svg>
    ),
  },
  {
    href: 'https://www.instagram.com/pepafamily8',
    label: 'Instagram',
    className: 'instagram-fab',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none" />
      </svg>
    ),
  },
  {
    href: 'https://www.youtube.com/@Pepa-r8h',
    label: 'YouTube',
    className: 'youtube-fab',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="white" aria-hidden="true">
        <path d="M9 7l8 5-8 5V7z" />
      </svg>
    ),
  },
]

// Navegación inferior, mobile-first, fija en toda la app (Skill 02).
// Antes los 12 iconos se desplazaban de lado con el dedo — en iPhone,
// ese deslizar horizontal tan pegado al borde inferior competía con
// los propios gestos de iOS ahí mismo (petición real: "al deslizarse
// en el iPhone muchas veces pillo el botón de Siri que está a la
// misma altura"). Ahora solo unos pocos iconos fijos (sin deslizar,
// así que no hay gesto que competir) y un botón "Menú" que despliega
// el resto en vertical — el propio deslizar horizontal desaparece del
// todo. Reordenar ya no es aquí: ver MenuSettingsScreen.
export function NavShell({ profile }: { profile: Profile }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [order, setOrder] = useState(() => resolveTabOrder(NAV_TAB_PATHS, loadTabOrder('bottom-nav')))
  const [menuOpen, setMenuOpen] = useState(false)

  // MenuSettingsScreen vive en otra pantalla (no se remonta NavShell
  // al navegar allí y volver, es la propia estructura) — sin este
  // aviso, reordenar allí no se veía reflejado aquí hasta recargar la
  // app entera.
  useEffect(() => {
    function handleOrderChanged(e: Event) {
      const key = (e as CustomEvent<{ key: string }>).detail?.key
      if (key && key !== 'bottom-nav') return
      setOrder(resolveTabOrder(NAV_TAB_PATHS, loadTabOrder('bottom-nav')))
    }
    window.addEventListener('family-app:tab-order-changed', handleOrderChanged)
    return () => window.removeEventListener('family-app:tab-order-changed', handleOrderChanged)
  }, [])

  // Un invitado con allowedSections no ve en el menú las secciones que
  // no le tocan — "Inicio" siempre visible, el resto según permiso.
  // Para un hijo con su propia cuenta (role 'child'), Economía
  // (/dinero) se queda visible aunque 'dinero' no esté en su
  // allowedSections: ahí vive también Educación financiera, que sí debe
  // verse (FinanceScreen filtra las demás pestañas por dentro).
  const visibleTabs = order
    .map((path) => NAV_TAB_BY_PATH.get(path))
    .filter((t): t is NavTab => !!t)
    .filter(
      (t) =>
        profile.allowedSections == null ||
        t.to === '/' ||
        (profile.role === 'child' && t.to === '/dinero') ||
        profile.allowedSections.includes(navSectionId(t)),
    )
  const pinned = visibleTabs.slice(0, PINNED_COUNT)
  const rest = visibleTabs.slice(PINNED_COUNT)

  function go(to: string) {
    setMenuOpen(false)
    navigate(to)
  }

  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <VoiceCapture />
      <SocialMenuFab items={SOCIAL_MENU_ITEMS} />

      {menuOpen && <div className="nav-menu-overlay" onClick={() => setMenuOpen(false)} />}

      {menuOpen && (
        <div className="nav-menu-flyout">
          {rest.map((tab) => (
            <button
              key={tab.to}
              type="button"
              className={'nav-menu-item' + (isActiveNavPath(location.pathname, tab) ? ' active' : '')}
              onClick={() => go(tab.to)}
            >
              <span className="nav-item-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <button type="button" className="nav-menu-item nav-menu-settings" onClick={() => go('/ayuda')}>
            <span className="nav-item-icon">❓</span>
            Ayuda
          </button>
          <button type="button" className="nav-menu-item nav-menu-settings" onClick={() => go('/sugerencias')}>
            <span className="nav-item-icon">💡</span>
            Sugerencias
          </button>
          <button type="button" className="nav-menu-item nav-menu-settings" onClick={() => go('/menu-organizar')}>
            <span className="nav-item-icon">⚙️</span>
            Configuración
          </button>
        </div>
      )}

      {/* Petición real: "el botón de las tres rayas que hay abajo a la
          izquierda... quiero que me lo metas en la barra de abajo,
          donde está la casa, compras, economía y calendario... antes
          de la casa, y repartes el espacio entre los cinco" — ya no
          flota aparte (position: fixed), es un icono más de
          bottom-nav-pinned (justify-content: space-around ya reparte
          el hueco solo entre los que haya). */}
      <nav className="bottom-nav bottom-nav-pinned">
        <button
          type="button"
          className={'nav-item' + (menuOpen ? ' active' : '')}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          <span className="nav-item-icon">{menuOpen ? '✕' : '☰'}</span>
          <span className="nav-item-label">Menú</span>
        </button>
        {pinned.map((tab) => (
          <button
            key={tab.to}
            type="button"
            className={'nav-item' + (isActiveNavPath(location.pathname, tab) ? ' active' : '')}
            onClick={() => navigate(tab.to)}
          >
            <span className="nav-item-icon">{tab.icon}</span>
            <span className="nav-item-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
