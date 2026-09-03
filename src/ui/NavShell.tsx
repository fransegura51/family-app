import { PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { VoiceCapture } from '@/ui/VoiceCapture'
import { useTabOrder } from '@/ui/ReorderableTabBar'
import { saveTabOrder } from '@/state/tabOrder'

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
const TAP_THRESHOLD_PX = 8

function isActivePath(pathname: string, tab: (typeof TABS)[number]): boolean {
  return tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(tab.to + '/')
}

// Navegación inferior, mobile-first, fija en toda la app (Skill 02).
// El orden se cambia arrastrando con el dedo O CON EL RATÓN — petición
// real: "toda la aplicación quiero que sea móvil... todos los iconos
// de que todo sea movible", y luego, al probarlo desde el ordenador:
// "no pude cambiar las cosas enganchándolas con el puntero del ratón".
// Pointer Events cubren dedo y ratón con el mismo código.
export function NavShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { order, setOrder } = useTabOrder('bottom-nav', TAB_PATHS)
  const orderedTabs = order.map((path) => TAB_BY_PATH.get(path)).filter((t): t is (typeof TABS)[number] => !!t)

  const dragRef = useRef<{ to: string; startX: number; startIndex: number; itemWidth: number; moved: number } | null>(null)
  const [draggingTo, setDraggingTo] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  function handlePointerDown(e: ReactPointerEvent, to: string, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    el.setPointerCapture(e.pointerId)
    const index = order.indexOf(to)
    dragRef.current = { to, startX: e.clientX, startIndex: index, itemWidth: el.offsetWidth + 4, moved: 0 }
    setDraggingTo(to)
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    drag.moved = Math.max(drag.moved, Math.abs(dx))
    setDragOffset(dx)
    const shift = Math.round(dx / drag.itemWidth)
    const newIndex = Math.min(order.length - 1, Math.max(0, drag.startIndex + shift))
    setOrder((prev) => {
      const currentIndex = prev.indexOf(drag.to)
      if (currentIndex === -1 || currentIndex === newIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
  }

  function handlePointerUp() {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingTo(null)
    setDragOffset(0)
    if (!drag) return
    if (drag.moved < TAP_THRESHOLD_PX) {
      navigate(drag.to)
      return
    }
    saveTabOrder('bottom-nav', order)
  }

  return (
    <div className="app-shell">
      <main className="app-content">
        <Outlet />
      </main>
      <VoiceCapture />
      <nav className="bottom-nav">
        {orderedTabs.map((tab) => (
          <button
            key={tab.to}
            type="button"
            className={
              'nav-item' + (isActivePath(location.pathname, tab) ? ' active' : '') + (draggingTo === tab.to ? ' nav-item-dragging' : '')
            }
            style={draggingTo === tab.to ? { transform: `translateX(${dragOffset}px)` } : undefined}
            onPointerDown={(e) => handlePointerDown(e, tab.to, e.currentTarget)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <span className="nav-item-icon">{tab.icon}</span>
            <span className="nav-item-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
