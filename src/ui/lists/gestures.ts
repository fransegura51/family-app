import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

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

// Arrastrar con el dedo desde un asa (touch-action: none en el asa) o, en las listas de la pantalla principal, con una pulsación prolongada
// sobre la fila (el dedo quieto ~0,45 s; si se mueve antes, es un desplazamiento normal de la pantalla y no pasa nada). Mientras se arrastra
// se busca, bajo el dedo, el elemento más cercano con data-drop-id / data-drop-kind y, al soltar, se avisa de dónde cayó. No mueve nada por sí
// mismo: la pantalla decide.
export interface DropTarget {
  id: string
  kind: string
  /** true = soltado en la mitad inferior del destino. */
  after: boolean
}
export const LONG_PRESS_MS = 450
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10

// Destino bajo el dedo. Primero por la pila de elementos del punto; si no sale nada (Safari iOS con el puntero capturado y la fila
// desplazada), por los rectángulos de los destinos: gana el más pequeño que contiene el punto (una lista dentro de una carpeta gana a la carpeta).
export function findDropTarget(x: number, y: number, self: string, root: Document = document): DropTarget | null {
  const hit = (host: HTMLElement): DropTarget => {
    const r = host.getBoundingClientRect()
    return { id: host.dataset.dropId as string, kind: host.dataset.dropKind ?? '', after: y > r.top + r.height / 2 }
  }
  const stack = typeof root.elementsFromPoint === 'function' ? root.elementsFromPoint(x, y) : []
  for (const el of stack) {
    const host = (el as HTMLElement).closest?.('[data-drop-id]') as HTMLElement | null
    if (!host || host.dataset.dropId === self) continue
    return hit(host)
  }
  let best: HTMLElement | null = null
  let bestArea = Infinity
  root.querySelectorAll<HTMLElement>('[data-drop-id]').forEach((host) => {
    if (host.dataset.dropId === self) return
    const r = host.getBoundingClientRect()
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return
    const area = r.width * r.height
    if (area < bestArea) {
      best = host
      bestArea = area
    }
  })
  return best ? hit(best) : null
}

export function useDragSort(onDrop: (dragId: string, target: DropTarget | null) => void) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const [over, setOver] = useState<DropTarget | null>(null)
  const startY = useRef(0)
  const current = useRef<DropTarget | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const press = useRef<{ x: number; y: number; id: string } | null>(null)
  const lastDragEnd = useRef(0)
  // El arrastre en curso también en una referencia: el asa está DENTRO de la fila, así que sus eventos suben a la fila y no deben contarse dos veces.
  const active = useRef<string | null>(null)

  // Mientras se arrastra, la página no se desplaza con el dedo (Safari iOS ignora touch-action si el gesto ya empezó como scroll):
  // un oyente NO pasivo cancela el desplazamiento del toque. Solo está puesto durante el arrastre.
  useEffect(() => {
    if (!dragId) return
    const block = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault()
    }
    document.addEventListener('touchmove', block, { passive: false })
    return () => document.removeEventListener('touchmove', block)
  }, [dragId])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const clearPress = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    press.current = null
  }
  const begin = (id: string, y: number) => {
    startY.current = y
    current.current = null
    active.current = id
    setDragId(id)
    setOffsetY(0)
    setOver(null)
  }
  const start = (e: ReactPointerEvent, id: string) => {
    e.stopPropagation()
    clearPress()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* sin captura el arrastre sigue funcionando mientras el dedo esté sobre el asa */
    }
    begin(id, e.clientY)
  }
  const track = (x: number, y: number, id: string) => {
    setOffsetY(y - startY.current)
    const t = findDropTarget(x, y, id)
    current.current = t
    setOver(t)
    // Cerca del borde de la pantalla, la página sigue sola para poder llegar más lejos.
    if (y < 80) window.scrollBy(0, -12)
    else if (y > window.innerHeight - 80) window.scrollBy(0, 12)
  }
  const move = (e: ReactPointerEvent) => {
    const id = active.current
    if (!id) return
    track(e.clientX, e.clientY, id)
  }
  const end = (e?: ReactPointerEvent) => {
    const id = active.current
    if (!id) return
    active.current = null
    // Se vuelve a mirar dónde está el dedo al soltar: si el último movimiento no llegó, no se pierde el destino.
    const t = e && e.type === 'pointerup' ? (findDropTarget(e.clientX, e.clientY, id) ?? current.current) : current.current
    setDragId(null)
    setOffsetY(0)
    setOver(null)
    current.current = null
    lastDragEnd.current = Date.now()
    onDrop(id, t)
  }

  // Pulsación prolongada sobre la fila (solo táctil/lápiz y no sobre botones o campos).
  const rowProps = (id: string) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse' || active.current) return
      if ((e.target as HTMLElement).closest?.('button, input, select, textarea, [data-no-longpress]')) return
      const el = e.currentTarget
      const pointerId = e.pointerId
      press.current = { x: e.clientX, y: e.clientY, id }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        const p = press.current
        timer.current = null
        if (!p) return
        try {
          el.setPointerCapture(pointerId)
        } catch {
          /* ver start() */
        }
        navigator.vibrate?.(12)
        begin(id, p.y)
        press.current = null
      }, LONG_PRESS_MS)
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (active.current === id) {
        track(e.clientX, e.clientY, id)
        return
      }
      const p = press.current
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_MOVE_TOLERANCE_PX) clearPress()
    },
    onPointerUp: (e: ReactPointerEvent) => {
      clearPress()
      if (active.current === id) end(e)
    },
    onPointerCancel: (e: ReactPointerEvent) => {
      clearPress()
      if (active.current === id) end(e)
    },
    // Una pulsación larga en iOS abre el menú contextual del enlace: se evita mientras se espera o se arrastra.
    onContextMenu: (e: { preventDefault: () => void }) => {
      if (timer.current || active.current === id) e.preventDefault()
    },
    // Tras arrastrar, el «clic» que genera el soltar no debe abrir la lista.
    onClickCapture: (e: { preventDefault: () => void; stopPropagation: () => void }) => {
      if (Date.now() - lastDragEnd.current < 400) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
  })

  return {
    dragId,
    offsetY,
    over,
    rowProps,
    handleProps: (id: string) => ({ onPointerDown: (e: ReactPointerEvent) => start(e, id), onPointerMove: move, onPointerUp: end, onPointerCancel: end }),
  }
}
