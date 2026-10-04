// Arrastrar y soltar con un ASA (☰) para reordenar una lista, válido con dedo y con ratón.
// Mismo patrón que la lista de la compra (ya validado en iPhone/Android): eventos de puntero con
// setPointerCapture, y el asa lleva \`touch-action: none\` en el CSS (.drag-handle) para que el navegador no
// confunda el arrastre con desplazar la pantalla. Sin dependencias. La alternativa accesible (Subir/Bajar) la
// pinta quien use el hook; no depende de este gesto.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { dragTargetIndex, moveToIndex } from '@/domain/eventDayPlan'

export function useDragReorder(ids: string[], onCommit: (orderedIds: string[]) => void) {
  const [order, setOrder] = useState(ids)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const dragRef = useRef<{ id: string; startY: number; startIndex: number; itemHeight: number; initial: string[] } | null>(null)
  const orderRef = useRef(order)
  orderRef.current = order

  // La lista de fuera manda, salvo mientras hay un gesto en marcha.
  const idsKey = ids.join('|')
  useEffect(() => {
    if (!dragRef.current) setOrder(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  function handleProps(id: string) {
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const row = e.currentTarget.closest('[data-reorder-row]') as HTMLElement | null
        const current = orderRef.current
        dragRef.current = { id, startY: e.clientY, startIndex: current.indexOf(id), itemHeight: (row?.offsetHeight ?? 44) + 6, initial: current }
        setDraggingId(id)
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        const drag = dragRef.current
        if (!drag) return
        const dy = e.clientY - drag.startY
        const target = dragTargetIndex(drag.startIndex, dy, drag.itemHeight, orderRef.current.length)
        if (target !== drag.startIndex) {
          const currentIndex = orderRef.current.indexOf(drag.id)
          setOrder((prev) => moveToIndex(prev, currentIndex, target))
          // Reiniciar el punto de referencia tras cada salto (si no, el desplazamiento se acumula y se "montan" las filas).
          drag.startY += (target - drag.startIndex) * drag.itemHeight
          drag.startIndex = target
          setDragOffset(e.clientY - drag.startY)
        } else {
          setDragOffset(dy)
        }
      },
      onPointerUp: finish,
      onPointerCancel: finish,
    }
  }

  function finish() {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setDragOffset(0)
    if (!drag) return
    const next = orderRef.current
    if (next.join('|') !== drag.initial.join('|')) onCommit(next)
  }

  return { order, setOrder, draggingId, dragOffset, handleProps }
}
