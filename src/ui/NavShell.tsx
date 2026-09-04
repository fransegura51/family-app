import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { VoiceCapture } from '@/ui/VoiceCapture'
import { NAV_TAB_BY_PATH, NAV_TAB_PATHS, isActiveNavPath, type NavTab } from '@/domain/navTabs'
import { loadTabOrder, resolveTabOrder } from '@/state/tabOrder'

// Cuántos iconos se quedan fijos abajo, siempre a la vista — el resto
// vive detrás del botón "Menú". Son los primeros N del orden guardado
// (el mismo que se cambia en Organizar menú), así que fijar cuáles se
// ven es simplemente cuestión de subirlos ahí.
const PINNED_COUNT = 4

// Navegación inferior, mobile-first, fija en toda la app (Skill 02).
// Antes los 12 iconos se desplazaban de lado con el dedo — en iPhone,
// ese deslizar horizontal tan pegado al borde inferior competía con
// los propios gestos de iOS ahí mismo (petición real: "al deslizarse
// en el iPhone muchas veces pillo el botón de Siri que está a la
// misma altura"). Ahora solo unos pocos iconos fijos (sin deslizar,
// así que no hay gesto que competir) y un botón "Menú" que despliega
// el resto en vertical — el propio deslizar horizontal desaparece del
// todo. Reordenar ya no es aquí: ver MenuSettingsScreen.
export function NavShell() {
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

  const orderedTabs = order.map((path) => NAV_TAB_BY_PATH.get(path)).filter((t): t is NavTab => !!t)
  const pinned = orderedTabs.slice(0, PINNED_COUNT)
  const rest = orderedTabs.slice(PINNED_COUNT)

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
          <button type="button" className="nav-menu-item nav-menu-settings" onClick={() => go('/menu-organizar')}>
            <span className="nav-item-icon">⚙️</span>
            Organizar menú
          </button>
        </div>
      )}

      <button
        type="button"
        className={'nav-menu-fab' + (menuOpen ? ' nav-menu-fab-open' : '')}
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
      >
        {menuOpen ? '✕' : '☰'}
      </button>

      <nav className="bottom-nav bottom-nav-pinned">
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
