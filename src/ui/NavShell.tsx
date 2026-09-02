import { NavLink, Outlet } from 'react-router-dom'
import { VoiceCapture } from '@/ui/VoiceCapture'

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
  { to: '/tareas', label: 'Tareas', icon: '✅' },
  { to: '/compras', label: 'Compras', icon: '🛒' },
  { to: '/alimentacion', label: 'Alimentación', icon: '🍎' },
  { to: '/dinero', label: 'Dinero', icon: '💶' },
  { to: '/ubicacion', label: 'Ubicación', icon: '📍' },
  { to: '/cumpleanos', label: 'Cumpleaños', icon: '🎂' },
  { to: '/contactos', label: 'Contactos', icon: '📇' },
  { to: '/galeria', label: 'Galería', icon: '📷' },
  { to: '/documentos', label: 'Documentos', icon: '📁' },
]

// Navegación inferior, mobile-first, fija en toda la app (Skill 02).
export function NavShell() {
  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <VoiceCapture />
      <nav className="bottom-nav">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <span className="nav-item-icon">{tab.icon}</span>
            <span className="nav-item-label">{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
