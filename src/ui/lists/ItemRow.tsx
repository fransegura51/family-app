import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { LIST_ITEM_STYLES, RICH_COLORS, parseRich, type ListItem, type ListItemStyle } from '@/domain/lists'
import { useSwipeDelete } from '@/ui/lists/gestures'

// Un elemento se pinta con elementos de React (b / span con color), nunca con innerHTML.
export function RichText({ text, rich }: { text: string; rich: string | null }) {
  if (!rich) return <>{text}</>
  return (
    <>
      {parseRich(rich).map((s, i) => {
        const style: CSSProperties | undefined = s.color ? { color: RICH_COLORS[s.color] } : undefined
        const inner = style ? <span style={style}>{s.text}</span> : <>{s.text}</>
        return s.bold ? <b key={i}>{inner}</b> : <span key={i}>{inner}</span>
      })}
    </>
  )
}

export interface ItemRowProps {
  item: ListItem
  /** Estilo de los elementos: «casillas» pinta la casilla de completar; los demás, una marca (símbolo o número) sin casilla. */
  style?: ListItemStyle
  /** Marca de numeración ya calculada (solo con el estilo de numeración). */
  numbering?: string
  selectMode: boolean
  selected: boolean
  linkedToShopping: boolean
  /** Si es false no hay asa de arrastre (orden automático o sin permiso). */
  canReorder: boolean
  dragging: boolean
  dragOffsetY: number
  dropMark: 'before' | 'after' | null
  dragHandleProps: { onPointerDown: (e: ReactPointerEvent) => void; onPointerMove: (e: ReactPointerEvent) => void; onPointerUp: () => void; onPointerCancel: () => void }
  onToggleDone: (item: ListItem) => void
  onToggleSelected: (item: ListItem) => void
  onEdit: (item: ListItem) => void
  onDelete: (item: ListItem) => void
}

function ItemRowBase(p: ItemRowProps) {
  const { item } = p
  const swipe = useSwipeDelete(!p.selectMode)
  const style = p.style ?? 'casillas'
  const withBoxes = style === 'casillas'
  const mark = style === 'numeracion' ? (p.numbering ?? '') : (LIST_ITEM_STYLES.find((x) => x.value === style)?.sample ?? '')
  return (
    <div
      className={'shopping-row-outer lists-item-outer' + (p.dropMark ? ` lists-drop-${p.dropMark}` : '')}
      style={{ overflow: p.dragging ? 'visible' : 'hidden' }}
      data-drop-id={item.id}
      data-drop-kind="item"
    >
      {!p.selectMode && (
        <div className="shopping-row-delete-behind" style={{ visibility: swipe.translateX !== 0 ? 'visible' : 'hidden' }}>
          <button type="button" className="shopping-row-delete-btn" onClick={() => p.onDelete(item)} aria-label={`Eliminar ${item.text}`}>
            🗑 Eliminar
          </button>
        </div>
      )}
      <div
        className={'price-row shopping-row-inner lists-item' + (item.depth === 1 ? ' lists-item-sub' : '') + (item.done && withBoxes ? ' lists-item-done' : '') + (p.dragging ? ' shopping-item-dragging' : '')}
        style={{
          transform: p.dragging ? `translateY(${p.dragOffsetY}px)` : swipe.translateX !== 0 ? `translateX(${swipe.translateX}px)` : undefined,
          transition: swipe.moving ? 'none' : undefined,
        }}
        {...swipe.handlers}
      >
        {p.selectMode ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={p.selected}
            className={'shopping-check' + (p.selected ? ' shopping-check-checked' : '')}
            onClick={() => p.onToggleSelected(item)}
            aria-label={`Elegir ${item.text}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        ) : !withBoxes ? (
          <span className={'lists-mark' + (style === 'numeracion' ? ' lists-mark-num' : '')} aria-hidden="true">
            {mark}
          </span>
        ) : (
          <button
            type="button"
            className={'shopping-check' + (item.done ? ' shopping-check-checked' : '')}
            onClick={() => p.onToggleDone(item)}
            aria-label={item.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
            data-help-id="listas.casilla"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="price-row-name price-row-name-button lists-item-text"
          onClick={() => {
            if (swipe.isOpen) {
              swipe.close()
              return
            }
            if (p.selectMode) p.onToggleSelected(item)
            else p.onEdit(item)
          }}
        >
          <RichText text={item.text} rich={item.rich} />
        </button>
        {p.linkedToShopping && (
          <span className="lists-linked muted" title="Enviado a la Lista de la compra" aria-label="Enviado a la Lista de la compra">
            🛒
          </span>
        )}
        {p.canReorder && !p.selectMode && (
          <span className="shopping-drag-handle" {...p.dragHandleProps} aria-label="Arrastrar para reordenar">
            ⠿
          </span>
        )}
      </div>
    </div>
  )
}

export const ItemRow = memo(ItemRowBase)
