import { TouchEvent as ReactTouchEvent, useEffect, useRef, useState } from 'react'
import { loadTabOrder, resolveTabOrder, saveTabOrder } from '@/state/tabOrder'

// Fila de pestañas (Dinero, Compras, Alimentación...) que se arrastra
// con el dedo — petición real: "quiero poder tocarlas con el dedo y
// desplazarlas a donde yo quiera... como hemos hecho con la lista de
// la compra... eso es lo que quiero en todas las pestañas de la
// aplicación". Mismo mecanismo que ya usa la lista de la compra
// (arrastre por eje, reordena en vivo mientras se mueve el dedo,
// guarda al soltar), en horizontal en vez de vertical. Un toque corto
// sin apenas movimiento selecciona la pestaña, tal y como antes —
// arrastrar de verdad la reordena.
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

  function handleTouchStart(e: ReactTouchEvent, id: T, el: HTMLElement) {
    const index = order.indexOf(id)
    dragRef.current = { id, startX: e.touches[0].clientX, startIndex: index, itemWidth: el.offsetWidth + 8, moved: 0 }
    setDraggingId(id)
  }

  function handleTouchMove(e: ReactTouchEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.touches[0].clientX - drag.startX
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

  function handleTouchEnd(e: ReactTouchEvent) {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setDragOffset(0)
    if (!drag) return
    // Sin esto, el navegador dispara además un "click" fantasma justo
    // después del touchend — se duplicaría la selección (o se
    // seleccionaría por error tras un arrastre real).
    e.preventDefault()
    if (drag.moved < TAP_THRESHOLD_PX) {
      // Apenas se ha movido — era un toque para seleccionar, no un
      // arrastre para reordenar.
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
          onClick={() => {
            // El propio touchend ya selecciona en móvil (toque corto);
            // esto es el respaldo para ratón/teclado en escritorio.
            if (!dragRef.current) onSelect(t)
          }}
          onTouchStart={(e) => handleTouchStart(e, t, e.currentTarget)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
