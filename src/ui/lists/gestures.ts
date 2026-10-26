import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

// Gestos de Mis listas. El deslizar-para-eliminar es el MISMO mecanismo ya validado en iPhone en la Lista de la compra
// (ShoppingItemRow): se sigue el toque siempre, pero solo se captura el puntero tras confirmar intención HORIZONTAL (umbral de 8 px
// y |dx| > |dy|); un toque o un gesto vertical nunca captura nada, así que el scroll y los clics funcionan igual que sin él.
export const SWIPE_OPEN_X = -76
export const SWIPE_INTENT_THRESHOLD_PX = 8

export function useSwipeDelete(enabled = true) {
  const [openX, setOpenX] = useState(0)
  const [liveX, setLiveX] = useState<number | null>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const swiping = useRef(false)
  const intent = useRef(false)

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!enabled) return
    startX.current = e.clientX
    startY.current = e.clientY
    swiping.current = true
    intent.current = false
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!swiping.current) return
    const dx = e.clientX - startX.current
    if (!intent.current) {
      const dy = e.clientY - startY.current
      if (Math.abs(dx) < SWIPE_INTENT_THRESHOLD_PX && Math.abs(dy) < SWIPE_INTENT_THRESHOLD_PX) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        swiping.current = false
        return
      }
      intent.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    e.preventDefault()
    setLiveX(Math.min(0, Math.max(SWIPE_OPEN_X, openX + dx)))
  }
  const onPointerEnd = () => {
    if (!swiping.current) return
    swiping.current = false
    const current = liveX ?? openX
    setOpenX(current < SWIPE_OPEN_X / 2 ? SWIPE_OPEN_X : 0)
    setLiveX(null)
  }
  return {
    translateX: liveX ?? openX,
    moving: liveX != null,
    isOpen: openX !== 0,
    close: () => setOpenX(0),
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  }
}

// Arrastrar con el dedo desde un asa (touch-action: none en el asa). Mientras se arrastra se busca, bajo el dedo, el elemento más
// cercano con data-drop-id / data-drop-kind y, al soltar, se avisa de dónde cayó. No mueve nada por sí mismo: la pantalla decide.
export interface DropTarget {
  id: string
  kind: string
  /** true = soltado en la mitad inferior del destino. */
  after: boolean
}
export function useDragSort(onDrop: (dragId: string, target: DropTarget | null) => void) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const [over, setOver] = useState<DropTarget | null>(null)
  const startY = useRef(0)
  const current = useRef<DropTarget | null>(null)

  const find = (x: number, y: number, self: string): DropTarget | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const host = (el as HTMLElement).closest?.('[data-drop-id]') as HTMLElement | null
      if (!host || host.dataset.dropId === self) continue
      const r = host.getBoundingClientRect()
      return { id: host.dataset.dropId as string, kind: host.dataset.dropKind ?? '', after: y > r.top + r.height / 2 }
    }
    return null
  }
  const start = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    startY.current = e.clientY
    current.current = null
    setDragId(id)
    setOffsetY(0)
    setOver(null)
  }
  const move = (e: ReactPointerEvent) => {
    if (!dragId) return
    setOffsetY(e.clientY - startY.current)
    const t = find(e.clientX, e.clientY, dragId)
    current.current = t
    setOver(t)
    // Cerca del borde de la pantalla, la página sigue sola para poder llegar más lejos.
    if (e.clientY < 80) window.scrollBy(0, -12)
    else if (e.clientY > window.innerHeight - 80) window.scrollBy(0, 12)
  }
  const end = () => {
    if (!dragId) return
    const id = dragId
    const t = current.current
    setDragId(null)
    setOffsetY(0)
    setOver(null)
    current.current = null
    onDrop(id, t)
  }
  return { dragId, offsetY, over, handleProps: (id: string) => ({ onPointerDown: (e: ReactPointerEvent) => start(e, id), onPointerMove: move, onPointerUp: end, onPointerCancel: end }) }
}
