import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { VoiceCapture } from '@/ui/VoiceCapture'
import { useTabOrder } from '@/ui/ReorderableTabBar'

// Mismos iconos que las tarjetas de Inicio (HomeScreen), para que se
// reconozcan de un vistazo. Se pidió tener las 11 secciones de Inicio
// siempre a mano, no solo Calendario/Tareas/Compras/Familia — con 12
// pestañas en total no caben en una fila sin desplazamiento en un
// móvil, así que la barra se desplaza horizontalmente en vez de
// encoger el texto hasta ser ilegible.
const TABS = [
  { to: '/', label: 'Inicio', icon: '🏠', end: true },
  { to: '/familia', label: 'Familia', icon: '👨‍👩‍👧‍👦' },
  { to: '/calendario', label: 'Calendario', icon: '📅' },
  { to: '/puntos', label: 'Puntos', icon: '⭐' },
  { to: '/compras', label: 'Compras', icon: '🛒' },
  { to: '/alimentacion', label: 'Alimentación', icon: '🍎' },
  { to: '/dinero', label: 'Dinero', icon: '💶' },
  { to: '/ubicacion', label: 'Ubicación', icon: '📍' },
  { to: '/cumpleanos', label: 'Cumpleaños', icon: '🎂' },
  { to: '/contactos', label: 'Contactos', icon: '📇' },
  { to: '/galeria', label: 'Galería', icon: '📷' },
  { to: '/documentos', label: 'Documentos', icon: '📁' },
]

const TAB_PATHS = TABS.map((t) => t.to)
const TAB_BY_PATH = new Map(TABS.map((t) => [t.to, t]))

// Navegación inferior, mobile-first, fija en toda la app (Skill 02).
// El orden se puede cambiar con el dedo — petición real: "toda la
// aplicación quiero que sea móvil, se puedan mover todos los iconos y
// cambiar de sitio, todos" — mismo mecanismo (↕️ Organizar + flechas)
// que ya se usa en Inicio y en el resto de pestañas de la app.
export function NavShell() {
  const { order, move } = useTabOrder('bottom-nav', TAB_PATHS)
  const [organizing, setOrganizing] = useState(false)
  const orderedTabs = order.map((path) => TAB_BY_PATH.get(path)).filter((t): t is (typeof TABS)[number] => !!t)

  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <VoiceCapture />
      <nav className="bottom-nav">
        {orderedTabs.map((tab, i) =>
          organizing ? (
            <div key={tab.to} className="nav-item nav-item-organizing">
              <button
                type="button"
                className="nav-item-move"
                disabled={i === 0}
                onClick={() => move(tab.to, -1)}
                aria-label={`Mover ${tab.label} antes`}
              >
                ‹
              </button>
              <span className="nav-item-icon">{tab.icon}</span>
              <span className="nav-item-label">{tab.label}</span>
              <button
                type="button"
                className="nav-item-move"
                disabled={i === orderedTabs.length - 1}
                onClick={() => move(tab.to, 1)}
                aria-label={`Mover ${tab.label} después`}
              >
                ›
              </button>
            </div>
          ) : (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            >
              <span className="nav-item-icon">{tab.icon}</span>
              <span className="nav-item-label">{tab.label}</span>
            </NavLink>
          ),
        )}
        <button type="button" className="nav-item nav-organize-toggle" onClick={() => setOrganizing(!organizing)}>
          <span className="nav-item-icon">↕️</span>
          <span className="nav-item-label">{organizing ? 'Listo' : 'Mover'}</span>
        </button>
      </nav>
    </div>
  )
}
