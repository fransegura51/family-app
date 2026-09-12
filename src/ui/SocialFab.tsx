import { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, useRef, useState } from 'react'

// Petición real: "queremos ponerle un enlace directo desde la
// aplicación a la cuenta de TikTok/Facebook/Instagram/YouTube que
// tiene Pepa" — mismo tamaño y fila que los botones redondos de Pepa
// (ver VoiceCapture.tsx), arrastrable con el dedo a cualquier sitio de
// la pantalla, visible en todas las pantallas para toda la familia.
// Un solo componente genérico (en vez de repetir la lógica de
// arrastre en un archivo por red social) parametrizado por url/icono/
// color/posición — NavShell.tsx instancia una vez por red.

// Mismas medidas que los botones de Pepa (FAB_SIZE/FAB_GAP/FAB_DEFAULT_TOP
// en VoiceCapture.tsx, no exportadas — se repiten aquí a propósito, son
// solo 3 números y así este archivo no depende de los internos de ese
// componente).
const FAB_SIZE = 42
const FAB_GAP = 7
const FAB_DEFAULT_TOP = 8
// Los 4 primeros huecos de la fila son los botones de Pepa — las redes
// sociales ocupan el quinto en adelante, uno por `slotIndex` (0 = justo
// después de Pepa).
const PEPA_SLOTS = 4
const TAP_THRESHOLD_PX = 8

interface FabPosition {
  top: number
  left: number
}

function defaultPosition(slotIndex: number): FabPosition {
  return { top: FAB_DEFAULT_TOP, left: FAB_DEFAULT_TOP + (PEPA_SLOTS + slotIndex) * (FAB_SIZE + FAB_GAP) }
}

function loadPosition(storageKey: string, fallback: FabPosition): FabPosition {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (typeof parsed?.top === 'number' && typeof parsed?.left === 'number') return parsed
    return fallback
  } catch {
    return fallback
  }
}

function savePosition(storageKey: string, position: FabPosition) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(position))
  } catch {
    // localStorage puede fallar en privado/incógnito — no es crítico,
    // solo se pierde recordar dónde se dejó el botón.
  }
}

export function SocialFab({
  href,
  ariaLabel,
  className,
  slotIndex,
  storageKey,
  children,
}: {
  href: string
  ariaLabel: string
  className: string
  slotIndex: number
  storageKey: string
  children: ReactNode
}) {
  const fallback = defaultPosition(slotIndex)
  const [position, setPosition] = useState<FabPosition>(() => loadPosition(storageKey, fallback))
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; moved: number } | null>(null)
  const wasDraggedRef = useRef(false)

  function handleDragStart(e: ReactPointerEvent<HTMLAnchorElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    wasDraggedRef.current = false
    dragRef.current = { startX: e.clientX, startY: e.clientY, moved: 0 }
    setDragging(true)
  }

  function handleDragMove(e: ReactPointerEvent<HTMLAnchorElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(dy))
    if (drag.moved >= TAP_THRESHOLD_PX) wasDraggedRef.current = true
    setDragOffset({ x: dx, y: dy })
  }

  function handleDragEnd(e: ReactPointerEvent<HTMLAnchorElement>) {
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
      savePosition(storageKey, next)
    }
  }

  function handleClick(e: ReactMouseEvent) {
    // Si justo antes hubo un arrastre de verdad, este clic que viene
    // detrás no debe abrir el enlace — ya se ha hecho lo que se quería.
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false
      e.preventDefault()
    }
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
      className={'voice-fab-round ' + className + (dragging ? ' voice-fab-dragging' : '')}
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
      {children}
    </a>
  )
}
