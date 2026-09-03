import { useState } from 'react'
import { loadTabOrder, resolveTabOrder, saveTabOrder } from '@/state/tabOrder'

// Fila de pestañas (Dinero, Compras, Alimentación...) que se puede
// reordenar — mismo mecanismo ya usado y aceptado para las tarjetas de
// Inicio (↕️ Organizar + mover con flechas), aquí generalizado para no
// repetirlo pantalla por pantalla (petición real: "quiero que todas
// las pestañas... se puedan mover de sitio... no tengo que decirte una
// por una, toda la aplicación").
export function useTabOrder<T extends string>(storageKey: string, allTabs: readonly T[]) {
  const [order, setOrder] = useState<T[]>(() => resolveTabOrder(allTabs, loadTabOrder(storageKey)))

  function move(tab: T, direction: -1 | 1) {
    setOrder((prev) => {
      const index = prev.indexOf(tab)
      const target = index + direction
      if (index === -1 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      saveTabOrder(storageKey, next)
      return next
    })
  }

  return { order, move }
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
  const { order, move } = useTabOrder(storageKey, tabs)
  const [organizing, setOrganizing] = useState(false)

  return (
    <div className="tab-bar-row">
      <div className="filter-row tab-bar-chips">
        {order.map((t, i) => (
          <span key={t} className={'chip tab-chip' + (active === t ? ' chip-active' : '')}>
            {organizing && i > 0 && (
              <button
                type="button"
                className="tab-chip-move"
                onClick={() => move(t, -1)}
                aria-label={`Mover ${t} a la izquierda`}
              >
                ‹
              </button>
            )}
            <button
              type="button"
              className="tab-chip-label"
              onClick={() => (organizing ? undefined : onSelect(t))}
            >
              {t}
            </button>
            {organizing && i < order.length - 1 && (
              <button
                type="button"
                className="tab-chip-move"
                onClick={() => move(t, 1)}
                aria-label={`Mover ${t} a la derecha`}
              >
                ›
              </button>
            )}
          </span>
        ))}
      </div>
      <button type="button" className="link-button tab-bar-organize" onClick={() => setOrganizing(!organizing)}>
        {organizing ? '✓ Listo' : '↕️'}
      </button>
    </div>
  )
}
