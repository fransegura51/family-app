import { NavLink, Outlet } from 'react-router-dom'
import { VoiceCapture } from '@/ui/VoiceCapture'

const TABS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/calendario', label: 'Calendario' },
  { to: '/tareas', label: 'Tareas' },
  { to: '/compras', label: 'Compras' },
  { to: '/familia', label: 'Familia' },
]

// Navegación inferior, mobile-first, botones grandes (Skill 02).
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
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
