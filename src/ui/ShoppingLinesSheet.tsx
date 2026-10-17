import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { addShoppingItems, listShoppingItems } from '@/data/shopping'
import { markShoppingDuplicates, type MenuShoppingRow } from '@/domain/communityMenu'
import { errorMessage } from '@/domain/errorMessage'
import type { ShoppingPlanLine } from '@/domain/menuShoppingPlan'
import { showToast } from '@/state/toast'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import '@/ui/community/menu/communityMenu.css'

// Hoja «Añadir a Compras» de una lista de ingredientes ya calculada (suma, escalado y redondeo de compra los hace menuShoppingPlan.ts). La usan el menú de Comunidad y
// el menú semanal de la Cocina. Antes de guardar se REVISA todo:
//   · lo que ya está en tu lista (sin comprar) sale marcado «Ya está en tu lista» y SIN marcar: no se duplica salvo que tú lo marques;
//   · puedes desmarcar lo que ya tengas en casa;
//   · nada se guarda hasta pulsar el botón, y se guarda de una vez (todo o nada).
// Cada ingrediente ocupa UNA fila compacta: casilla, nombre, cantidad ya calculada y, discreto, cuántas recetas lo usan; «Ver platos» despliega cuáles (no se listan siempre).
// Pulsar el botón dos veces no duplica: el segundo toque se ignora mientras se guarda, y al terminar la hoja pasa a «Añadido».
type ListState = { status: 'loading' } | { status: 'ok'; rows: MenuShoppingRow[] } | { status: 'error'; message: string }

export function distinctDishes(line: ShoppingPlanLine): string[] {
  return [...new Set(line.sources.map((s) => s.dishName))]
}

export function ShoppingLinesSheet({ intro, lines, onClose, note }: { intro: ReactNode; lines: ShoppingPlanLine[]; onClose: () => void; note?: ReactNode }) {
  const uid = useId()
  const dialogRef = useDialogFocus<HTMLDivElement>()
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  // Casillas marcadas (por clave de línea). Las que ya estaban en la lista empiezan sin marcar.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [added, setAdded] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sending = useRef(false)

  // Una lectura de la lista de la compra al abrir (para avisar de lo que ya está). Si no se puede leer, no se deja guardar a ciegas: se puede reintentar.
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    listShoppingItems()
      .then((items) => {
        if (cancelled) return
        const rows = markShoppingDuplicates(lines, items)
        setState({ status: 'ok', rows })
        setChecked(new Set(rows.filter((r) => !r.inList).map((r) => r.line.key)))
      })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(e, 'No se ha podido leer tu lista de la compra.') })
      })
    return () => {
      cancelled = true
    }
  }, [lines, reloadKey])

  const rows = state.status === 'ok' ? state.rows : []
  const selectedCount = rows.filter((r) => checked.has(r.line.key)).length
  const inListCount = rows.filter((r) => r.inList).length

  function toggleIn(setter: typeof setChecked, key: string) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function confirm() {
    if (sending.current || selectedCount === 0 || added !== null) return
    sending.current = true
    setSaving(true)
    setError(null)
    try {
      const chosen = rows.filter((r) => checked.has(r.line.key))
      // Cantidad con su unidad en el texto («320 g», «3 unidades»); sin cantidad conocida se deja vacía (nunca 0). «al gusto» se conserva tal cual.
      await addShoppingItems(chosen.map((r) => ({ name: r.line.name, quantity: r.line.quantity ?? '', unit: '', priority: 'normal' as const, tripId: null })))
      setAdded(chosen.length)
      showToast(`Añadidos ${chosen.length} a Compras`)
    } catch (e) {
      setError(errorMessage(e, 'No se han podido añadir los productos.') + ' No se ha añadido nada a Compras; puedes volver a intentarlo. Si tu cuenta no tiene acceso a Compras, pídeselo a quien administra tu familia.')
    } finally {
      sending.current = false
      setSaving(false)
    }
  }

  const titleId = `${uid}-title`
  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()} onKeyDown={(e) => e.key === 'Escape' && !saving && onClose()}>
      <div ref={dialogRef} className="modal-sheet community-menu-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="community-menu-sheet-head">
          <h2 id={titleId}>🛒 Añadir a Compras</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="community-menu-sheet-body">
          <p className="muted community-menu-small">{intro}</p>

          {added !== null ? (
            <>
              <p className="community-notice ok" role="status">
                ✅ Añadidos {added} {added === 1 ? 'producto' : 'productos'} a tu lista de la compra.
              </p>
              <div className="community-menu-sheet-links">
                <Link to="/compras">🛒 Abrir Compras</Link>
              </div>
              <div className="community-menu-sheet-actions">
                <button type="button" className="primary" onClick={onClose}>
                  Cerrar
                </button>
              </div>
            </>
          ) : (
            <>
              {state.status === 'loading' && <p className="muted">Mirando tu lista de la compra…</p>}
              {state.status === 'error' && (
                <div>
                  <p className="error" role="alert">
                    {state.message} Sin leerla no podemos avisarte de lo que ya tienes apuntado.
                  </p>
                  <button type="button" className="primary" onClick={() => setReloadKey((k) => k + 1)}>
                    Reintentar
                  </button>
                </div>
              )}
              {state.status === 'ok' && (
                <>
                  {rows.length === 0 && <p className="muted">Estas recetas no tienen ingredientes que añadir.</p>}
                  {note}
                  {inListCount > 0 && (
                    <p className="community-notice" role="status">
                      {inListCount === 1 ? '1 producto ya está' : `${inListCount} productos ya están`} en tu lista y se han dejado sin marcar para no duplicarlos. Si quieres otra
                      unidad, márcalo.
                    </p>
                  )}
                  {rows.length > 0 && (
                    <div className="community-menu-selectall">
                      <button type="button" className="link-button" onClick={() => setChecked(new Set(rows.map((r) => r.line.key)))}>
                        Marcar todo
                      </button>
                      <button type="button" className="link-button" onClick={() => setChecked(new Set())}>
                        Desmarcar todo
                      </button>
                    </div>
                  )}
                  <ul className="community-menu-shop-list community-menu-shop-compact">
                    {rows.map((r) => {
                      const dishes = distinctDishes(r.line)
                      const expanded = open.has(r.line.key)
                      return (
                        <li key={r.line.key} className="community-menu-shop-item">
                          <div className="community-menu-shop-row">
                            <label className="community-menu-shop-check">
                              <input type="checkbox" checked={checked.has(r.line.key)} onChange={() => toggleIn(setChecked, r.line.key)} />
                              <span className="community-menu-shop-text">
                                <strong>{r.line.name}</strong>
                                {r.line.quantity && <span className="community-menu-shop-qty"> · {r.line.quantity}</span>}
                                {r.inList && <span className="community-menu-badge reuse"> Ya está en tu lista</span>}
                              </span>
                            </label>
                            {dishes.length > 0 && (
                              <button
                                type="button"
                                className="link-button community-menu-shop-dishes-btn"
                                aria-expanded={expanded}
                                aria-label={`${expanded ? 'Ocultar' : 'Ver'} los platos que usan ${r.line.name}`}
                                onClick={() => toggleIn(setOpen, r.line.key)}
                              >
                                {dishes.length} {dishes.length === 1 ? 'receta' : 'recetas'} {expanded ? '▴' : '▾'}
                              </button>
                            )}
                          </div>
                          {expanded && <p className="community-menu-shop-for">Para: {dishes.join(', ')}</p>}
                          {r.line.hint && <p className="community-menu-shop-notes">{r.line.hint}</p>}
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="community-menu-sheet-actions community-menu-sticky">
                <button type="button" className="primary" onClick={() => void confirm()} disabled={saving || selectedCount === 0 || state.status !== 'ok'}>
                  {saving ? 'Añadiendo…' : `Añadir ${selectedCount} a Compras`}
                </button>
                <button type="button" className="link-button" onClick={onClose} disabled={saving}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
