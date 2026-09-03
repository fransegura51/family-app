import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import { loadTabOrder, resolveTabOrder, saveTabOrder } from '@/state/tabOrder'

// Fila de pestañas (Dinero, Compras, Alimentación...) que se arrastra
// con el dedo O CON EL RATÓN — petición real: "quiero poder tocarlas
// con el dedo y desplazarlas a donde yo quiera... eso es lo que quiero
// en todas las pestañas de la aplicación", y luego, al probarlo desde
// el ordenador: "no pude cambiar las cosas enganchándolas con el
// puntero del ratón y moviéndolas. Si en el móvil sí". Pointer Events
// (en vez de Touch Events) cubren dedo, ratón y lápiz óptico con el
// mismo código, así que no hace falta duplicar la lógica para cada
// uno. Un toque/clic corto sin apenas movimiento selecciona la
// pestaña; arrastrar de verdad la reordena.
const TAP_THRESHOLD_PX = 8

export function useTabOrder<T extends string>(storageKey: string, allTabs: readonly T[]) {
  const [order, setOrder] = useState<T[]>(() => resolveTabOrder(allTabs, loadTabOrder(storageKey)))

  useEffect(() => {
    setOrder((prev) => resolveTabOrder(allTabs, prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTabs.join('|')])

  return { order, setOrder }
}

export function ReorderableTabBar<T extends string>({
  storageKey,
  tabs,
  active,
  onSelect,
}: {
  storageKey: string
  tabs: readonly T[]
  active: T
  onSelect: (tab: T) => void
}) {
  const { order, setOrder } = useTabOrder(storageKey, tabs)
  const dragRef = useRef<{ id: T; startX: number; startIndex: number; itemWidth: number; moved: number } | null>(null)
  const [draggingId, setDraggingId] = useState<T | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  function handlePointerDown(e: ReactPointerEvent, id: T, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    el.setPointerCapture(e.pointerId)
    const index = order.indexOf(id)
    dragRef.current = { id, startX: e.clientX, startIndex: index, itemWidth: el.offsetWidth + 8, moved: 0 }
    setDraggingId(id)
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
      const currentIndex = prev.indexOf(drag.id)
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
    setDraggingId(null)
    setDragOffset(0)
    if (!drag) return
    if (drag.moved < TAP_THRESHOLD_PX) {
      // Apenas se ha movido — era un toque/clic para seleccionar, no
      // un arrastre para reordenar.
      onSelect(drag.id)
      return
    }
    saveTabOrder(storageKey, order)
  }

  return (
    <div className="filter-row tab-bar-chips">
      {order.map((t) => (
        <button
          key={t}
          type="button"
          className={'chip tab-chip' + (active === t ? ' chip-active' : '') + (draggingId === t ? ' tab-chip-dragging' : '')}
          style={draggingId === t ? { transform: `translateX(${dragOffset}px)` } : undefined}
          onPointerDown={(e) => handlePointerDown(e, t, e.currentTarget)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
