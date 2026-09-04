import { useState } from 'react'
import { NAV_TAB_BY_PATH, NAV_TAB_PATHS, type NavTab } from '@/domain/navTabs'
import { loadTabOrder, resolveTabOrder, saveTabOrder } from '@/state/tabOrder'

const PINNED_COUNT = 4

// Reordenar el menú con flechas arriba/abajo en vez de arrastrar con
// el dedo — petición real, tras varios intentos de arrastre táctil
// poco fiable justo en esta barra (compite con los propios gestos del
// borde inferior del iPhone): "si cambiarle el orden allí mismo es un
// problema, igual sería mejor hacer una pestaña de configuración para
// ello". Sin gracia, pero infalible — a diferencia del arrastre, que
// depende de un gesto que aquí llevaba todo el día fallando. Los
// primeros 4 de esta lista son los que se quedan fijos abajo; el
// resto vive detrás del botón "Menú".
export function MenuSettingsScreen() {
  const [order, setOrder] = useState(() => resolveTabOrder(NAV_TAB_PATHS, loadTabOrder('bottom-nav')))
  const orderedTabs = order.map((path) => NAV_TAB_BY_PATH.get(path)).filter((t): t is NavTab => !!t)

  function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= order.length) return
    const next = [...order]
    ;[next[index], next[newIndex]] = [next[newIndex], next[index]]
    setOrder(next)
    saveTabOrder('bottom-nav', next)
  }

  return (
    <div className="screen">
      <h1>Organizar menú</h1>
      <p className="muted">
        Los 4 primeros se quedan fijos abajo del todo; el resto aparece al tocar el botón "☰ Menú".
      </p>
      <div className="event-list">
        {orderedTabs.map((tab, i) => (
          <div key={tab.to} className="card task-card">
            <span className="nav-item-icon" style={{ fontSize: 22 }}>
              {tab.icon}
            </span>
            <div className="task-card-main">
              <strong>{tab.label}</strong>
              <p className="muted">{i < PINNED_COUNT ? 'Fijo abajo' : 'Dentro del menú'}</p>
            </div>
            <button
              type="button"
              className="link-button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Subir ${tab.label}`}
            >
              ↑
            </button>
            <button
              type="button"
              className="link-button"
              disabled={i === orderedTabs.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Bajar ${tab.label}`}
            >
              ↓
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
