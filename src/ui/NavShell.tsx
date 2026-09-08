import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { VoiceCapture } from '@/ui/VoiceCapture'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { NAV_TAB_BY_PATH, NAV_TAB_PATHS, isActiveNavPath, navSectionId, type NavTab } from '@/domain/navTabs'
import { loadTabOrder, resolveTabOrder } from '@/state/tabOrder'
import { getFamilyName, listFamilyMembers } from '@/data/family'
import { listCustomMenuItems, seedDefaultCustomMenuItems } from '@/data/customMenu'
import type { CustomMenuItem, FamilyMember, Profile } from '@/domain/types'

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
export function NavShell({ profile }: { profile: Profile }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [order, setOrder] = useState(() => resolveTabOrder(NAV_TAB_PATHS, loadTabOrder('bottom-nav')))
  const [menuOpen, setMenuOpen] = useState(false)
  // Petición real: "un desplegable, y en el desplegable que aparezca
  // el nombre de todas las personas que estén en la familia" — cabecera
  // del ☰ Menú al estilo Wallet (nombre de familia + desplegable con
  // los miembros), y debajo los accesos personalizables tipo Wallet
  // ("añade todas las subcarpetas... con la función de añadir o
  // quitar"). Se cargan una vez al montar, no en cada apertura del menú.
  const [familyName, setFamilyName] = useState<string | null>(null)
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [customItems, setCustomItems] = useState<CustomMenuItem[]>([])
  const [familyDropdownOpen, setFamilyDropdownOpen] = useState(false)
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  useEffect(() => {
    getFamilyName().then(setFamilyName).catch(() => {})
    listFamilyMembers().then(setMembers).catch(() => {})
    listCustomMenuItems()
      .then(async (items) => {
        if (items.length === 0) {
          await seedDefaultCustomMenuItems()
          items = await listCustomMenuItems()
        }
        setCustomItems(items)
      })
      .catch(() => {})
  }, [])

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
  const visibleTabs = order
    .map((path) => NAV_TAB_BY_PATH.get(path))
    .filter((t): t is NavTab => !!t)
    .filter((t) => profile.allowedSections == null || t.to === '/' || profile.allowedSections.includes(navSectionId(t)))
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

      {menuOpen && <div className="nav-menu-overlay" onClick={() => setMenuOpen(false)} />}

      {menuOpen && (
        <div className="nav-menu-flyout">
          {/* Petición real, con captura de referencia de la app Wallet:
              cabecera con el nombre de familia y un desplegable con
              los miembros. Renombrar de verdad vive en "Organizar
              menú" (con clic aparte, no en la misma fila que abre el
              desplegable). */}
          <div className="nav-menu-family">
            <button type="button" className="nav-menu-family-header" onClick={() => setFamilyDropdownOpen((v) => !v)}>
              <span className="nav-item-icon">👨‍👩‍👧‍👦</span>
              <span className="nav-menu-family-text">
                <strong>{familyName ?? 'Familia'}</strong>
                <span className="muted">Familia compartida</span>
              </span>
              <span aria-hidden="true">{familyDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {familyDropdownOpen && (
              <div className="nav-menu-family-dropdown">
                <button type="button" className="nav-menu-item" onClick={() => go('/menu-organizar')}>
                  <span className="nav-item-icon">✏️</span>
                  Cambiar nombre de familia
                </button>
                {members.map((m) => (
                  <button key={m.id} type="button" className="nav-menu-item" onClick={() => go('/familia')}>
                    <MemberAvatar member={m} size={24} />
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>

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

          {/* Petición real: "añade todas las subcarpetas que te he
              puesto en la foto [Wallet]... con la función de añadir
              más si queremos, o eliminar alguna" — de momento son solo
              accesos (sin pantalla real detrás todavía), se gestionan
              desde "Organizar menú". */}
          {customItems.length > 0 && <hr className="nav-menu-divider" />}
          {customItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav-menu-item"
              onClick={() => {
                setPlaceholderNotice(true)
                setTimeout(() => setPlaceholderNotice(false), 2500)
              }}
            >
              <span className="nav-item-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
          {placeholderNotice && (
            <p className="muted" style={{ fontSize: 12, padding: '4px 16px' }}>
              Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
            </p>
          )}

          <hr className="nav-menu-divider" />
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
