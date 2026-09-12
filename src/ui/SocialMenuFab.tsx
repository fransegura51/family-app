import { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, useRef, useState } from 'react'

// Petición real: "hazme un botón que ponga redes sociales y agrupa
// las cuatro botones de las redes sociales... para que no ocupe lugar
// en la pantalla" — sustituye a los 4 iconos sueltos (TikTok, Facebook,
// Instagram, YouTube) por uno solo, en el mismo hueco de la fila de
// Pepa, que al tocarlo despliega la lista de las cuatro redes. Mismo
// arrastre que el resto de botones redondos (ver VoiceCapture.tsx);
// al abrirse no navega a ningún sitio, solo despliega/cierra la lista.

const FAB_SIZE = 42
const FAB_GAP = 7
const FAB_DEFAULT_TOP = 8
// Los 4 primeros huecos de la fila son los botones de Pepa — este
// botón ocupa el quinto, justo después.
const PEPA_SLOTS = 4
const TAP_THRESHOLD_PX = 8
const STORAGE_KEY = 'familyapp:social-menu-fab-position'

interface FabPosition {
  top: number
  left: number
}

export interface SocialMenuItem {
  href: string
  label: string
  className: string
  icon: ReactNode
}

const DEFAULT_POSITION: FabPosition = { top: FAB_DEFAULT_TOP, left: FAB_DEFAULT_TOP + PEPA_SLOTS * (FAB_SIZE + FAB_GAP) }

function loadPosition(): FabPosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_POSITION
    const parsed = JSON.parse(raw)
    if (typeof parsed?.top === 'number' && typeof parsed?.left === 'number') return parsed
    return DEFAULT_POSITION
  } catch {
    return DEFAULT_POSITION
  }
}

function savePosition(position: FabPosition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
  } catch {
    // localStorage puede fallar en privado/incógnito — no es crítico,
    // solo se pierde recordar dónde se dejó el botón.
  }
}

export function SocialMenuFab({ items }: { items: SocialMenuItem[] }) {
  const [position, setPosition] = useState<FabPosition>(() => loadPosition())
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; moved: number } | null>(null)
  const wasDraggedRef = useRef(false)

  function handleDragStart(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    wasDraggedRef.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: 0 }
    setDragging(true)
  }

  function handleDragMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(dy))
    if (drag.moved >= TAP_THRESHOLD_PX) wasDraggedRef.current = true
    setDragOffset({ x: dx, y: dy })
  }

  function handleDragEnd(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    setDragOffset({ x: 0, y: 0 })
    if (!drag) return
    if (drag.moved >= TAP_THRESHOLD_PX) {
      const maxLeft = Math.max(0, window.innerWidth - FAB_SIZE)
      const maxTop = Math.max(0, window.innerHeight - FAB_SIZE)
      const rect = e.currentTarget.getBoundingClientRect()
      const next = {
        top: Math.min(Math.max(0, rect.top), maxTop),
        left: Math.min(Math.max(0, rect.left), maxLeft),
      }
      setPosition(next)
      savePosition(next)
    }
  }

  function handleClick(e: ReactMouseEvent) {
    // Si justo antes hubo un arrastre de verdad, este clic que viene
    // detrás no debe abrir/cerrar la lista — ya se ha hecho lo que se
    // quería (mover el botón).
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false
      e.preventDefault()
      return
    }
    setOpen((v) => !v)
  }

  return (
    <>
      {open && <div className="social-menu-overlay" onClick={() => setOpen(false)} />}
      <button
        type="button"
        aria-label="Redes sociales"
        aria-expanded={open}
        className={'voice-fab-round social-menu-fab' + (dragging ? ' voice-fab-dragging' : '')}
        style={{
          top: position.top + (dragging ? dragOffset.y : 0),
          left: position.left + (dragging ? dragOffset.x : 0),
          width: FAB_SIZE,
          height: FAB_SIZE,
        }}
        onClick={handleClick}
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <line x1="8.2" y1="10.8" x2="15.8" y2="7.2" />
          <line x1="8.2" y1="13.2" x2="15.8" y2="16.8" />
        </svg>
      </button>

      {open && (
        <div
          className="social-menu-flyout"
          style={{
            top: position.top + FAB_SIZE + 8,
            left: position.left,
          }}
        >
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="social-menu-item"
              onClick={() => setOpen(false)}
            >
              <span className={'social-menu-item-icon ' + item.className}>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </div>
      )}
    </>
  )
}
