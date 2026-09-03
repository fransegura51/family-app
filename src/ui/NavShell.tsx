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
// Cuánto hay que mantener el dedo quieto para que cuente como "quiero
// arrastrar" en vez de "quiero desplazar la barra" — petición real,
// tras rechazar la primera versión (arrastre solo de ratón): "también
// quiero que se puedan mover los iconos desde el móvil, aparte de que
// se deslicen a la izquierda y la derecha". Ambos gestos empiezan
// igual (un dedo tocando y moviéndose en horizontal), así que hace
// falta algo que los distinga: un deslizar normal se mueve enseguida,
// mantener pulsado se queda quieto un momento antes de moverse.
const LONG_PRESS_MS = 450

function isActivePath(pathname: string, tab: (typeof TABS)[number]): boolean {
  return tab.end ? pathname === tab.to : pathname === tab.to || pathname.startsWith(tab.to + '/')
}

// Navegación inferior, mobile-first, fija en toda la app (Skill 02).
// Con el dedo: un toque corto navega, deslizar desplaza la barra para
// ver el resto de iconos (gesto nativo, no tocado), y mantener pulsado
// un instante sin moverse entra en modo arrastre para reordenar. Con
// el ratón no hay ese conflicto de gestos, así que ahí el arrastre
// empieza al instante, sin esperar.
export function NavShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { order, setOrder } = useTabOrder('bottom-nav', TAB_PATHS)
  const orderedTabs = order.map((path) => TAB_BY_PATH.get(path)).filter((t): t is (typeof TABS)[number] => !!t)

  const dragRef = useRef<{ to: string; startX: number; startIndex: number; itemWidth: number; moved: number } | null>(null)
  const [draggingTo, setDraggingTo] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  // Evita que, tras un arrastre de verdad, el "click" que el
  // navegador dispara justo después vuelva a navegar por su cuenta —
  // misma protección ya probada en los botones de Pepa.
  const wasDraggedRef = useRef(false)

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ to: string; el: HTMLElement; pointerId: number; startX: number; startY: number } | null>(null)

  function clearLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function beginDrag(to: string, el: HTMLElement, pointerId: number, clientX: number) {
    el.setPointerCapture(pointerId)
    const index = order.indexOf(to)
    dragRef.current = { to, startX: clientX, startIndex: index, itemWidth: el.offsetWidth + 4, moved: 0 }
    setDraggingTo(to)
  }

  function handlePointerDown(e: ReactPointerEvent, to: string, el: HTMLElement) {
    wasDraggedRef.current = false
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
      beginDrag(to, el, e.pointerId, e.clientX)
      return
    }
    pendingRef.current = { to, el, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY }
    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      const p = pendingRef.current
      if (!p) return
      beginDrag(p.to, p.el, p.pointerId, p.startX)
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(e: ReactPointerEvent) {
    // Todavía esperando a ver si es pulsación mantenida — si el dedo
    // ya se ha movido de verdad, es que se quiere desplazar la barra,
    // no reordenar: se cancela la espera y se deja el gesto nativo de
    // desplazamiento seguir su curso sin interferir.
    if (longPressTimerRef.current && pendingRef.current) {
      const dx = e.clientX - pendingRef.current.startX
      const dy = e.clientY - pendingRef.current.startY
      if (Math.hypot(dx, dy) > TAP_THRESHOLD_PX) {
        clearLongPress()
        pendingRef.current = null
      }
      return
    }

    const drag = dragRef.current
    if (!drag) return
    // Ya en modo arrastre: evita que el navegador intente además
    // desplazar la barra mientras se reordena.
    e.preventDefault()
    const dx = e.clientX - drag.startX
    drag.moved = Math.max(drag.moved, Math.abs(dx))
    if (drag.moved >= TAP_THRESHOLD_PX) wasDraggedRef.current = true
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
    clearLongPress()
    pendingRef.current = null
    const drag = dragRef.current
    dragRef.current = null
    setDraggingTo(null)
    setDragOffset(0)
    if (drag && drag.moved >= TAP_THRESHOLD_PX) {
      saveTabOrder('bottom-nav', order)
    }
  }

  function handleClick(to: string) {
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false
      return
    }
    navigate(to)
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
            onClick={() => handleClick(tab.to)}
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
