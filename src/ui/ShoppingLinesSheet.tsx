import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { addShoppingItems, listShoppingItems } from '@/data/shopping'
import { markShoppingDuplicates, type MenuShoppingRow } from '@/domain/communityMenu'
import { errorMessage } from '@/domain/errorMessage'
import { EMPTY_STORE_CHOICE, storeForRow, type StoreChoice } from '@/domain/storeAssignment'
import type { ShoppingPlanLine } from '@/domain/menuShoppingPlan'
import type { ShoppingItem } from '@/domain/types'
import { showToast } from '@/state/toast'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import { RowStoreSelect, StoreChoiceBar, useShoppingStores } from '@/ui/ShoppingStoreChoice'
import '@/ui/community/menu/communityMenu.css'

// Hoja «Añadir a Compras» de una lista de ingredientes ya calculada (suma, escalado y redondeo de compra los hace menuShoppingPlan.ts). La usan el menú de Comunidad y
// el menú semanal de la Cocina. Antes de guardar se REVISA todo:
//   · lo que ya está en tu lista (sin comprar) sale marcado «Ya está en tu lista» y SIN marcar: no se duplica salvo que tú lo marques;
//   · puedes desmarcar lo que ya tengas en casa;
//   · nada se guarda hasta pulsar el botón, y se guarda de una vez (todo o nada).
// Cada ingrediente ocupa UNA fila compacta: casilla, nombre, cantidad ya calculada y, discreto, cuántas recetas lo usan; «Ver platos» despliega cuáles (no se listan siempre).
// Pulsar el botón dos veces no duplica: el segundo toque se ignora mientras se guarda, y al terminar la hoja pasa a «Añadido».
type LoadState = { status: 'loading' } | { status: 'ok'; items: ShoppingItem[] } | { status: 'error'; message: string }

export function distinctDishes(line: ShoppingPlanLine): string[] {
  return [...new Set(line.sources.map((s) => s.dishName))]
}

export function ShoppingLinesSheet({ intro, lines, onClose, note, onAdded }: { intro: ReactNode; lines: ShoppingPlanLine[]; onClose: () => void; note?: ReactNode; onAdded?: (count: number) => void }) {
  const uid = useId()
  const dialogRef = useDialogFocus<HTMLDivElement>()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  // Casillas marcadas (por clave de línea). Las que ya estaban en la lista empiezan sin marcar.
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())
  // Tienda de destino: una para todo o repartido entre varias (las tiendas habituales de la familia).
  const { stores } = useShoppingStores()
  const [choice, setChoice] = useState<StoreChoice>(EMPTY_STORE_CHOICE)
  const [saving, setSaving] = useState(false)
  const [added, setAdded] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sending = useRef(false)
  const knownKeys = useRef<Set<string> | null>(null)
  // Cambios de la persona en los productos ESCRITOS A MANO (nombre, cantidad y unidad). Se conservan aunque cambien las personas u otras cantidades.
  const [edits, setEdits] = useState<Record<string, { name?: string; quantity?: string; unit?: string }>>({})

  // Una lectura de la lista de la compra al abrir (para avisar de lo que ya está); NO se vuelve a pedir si cambian las cantidades (p. ej. otro número de personas). Si no se puede
  // leer, no se deja guardar a ciegas: se puede reintentar.
  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    listShoppingItems()
      .then((items) => {
        if (!cancelled) setLoad({ status: 'ok', items })
      })
      .catch((e) => {
        if (!cancelled) setLoad({ status: 'error', message: errorMessage(e, 'No se ha podido leer tu lista de la compra.') })
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const rows = useMemo(() => (load.status === 'ok' ? markShoppingDuplicates(lines, load.items) : []), [lines, load])
  const state: { status: 'loading' } | { status: 'ok' } | { status: 'error'; message: string } = load.status === 'ok' ? { status: 'ok' } : load

  // La primera vez, todo marcado salvo lo que ya está en la lista. Si luego cambian las cantidades, se CONSERVA lo que la persona había marcado o desmarcado de cada producto que sigue
  // ahí (y su tienda); solo los productos nuevos entran con la regla de siempre.
  useEffect(() => {
    if (load.status !== 'ok') return
    const before = knownKeys.current
    knownKeys.current = new Set(rows.map((r) => r.line.key))
    setChecked((prev) => new Set(rows.filter((r) => (before && before.has(r.line.key) ? prev.has(r.line.key) : !r.inList)).map((r) => r.line.key)))
  }, [rows, load.status])

  // Un producto escrito a mano sin nombre no se puede añadir (se nota en el contador y no se envía).
  const nameOf = (r: MenuShoppingRow) => (r.line.direct ? (edits[r.line.key]?.name ?? r.line.name).trim() : r.line.name)
  const usable = (r: MenuShoppingRow) => checked.has(r.line.key) && nameOf(r) !== ''
  const selectedCount = rows.filter(usable).length
  function setEdit(key: string, patch: { name?: string; quantity?: string; unit?: string }) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }
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
      const chosen = rows.filter(usable)
      // Ingredientes de receta: cantidad con su unidad en el texto («320 g», «3 unidades»); sin cantidad conocida se deja vacía (nunca 0). «al gusto» se conserva tal cual.
      // Escritos a mano: el nombre, la cantidad y la unidad que la persona haya puesto (vacías si no puso nada; nunca se inventan).
      await addShoppingItems(
        chosen.map((r) =>
          r.line.direct
            ? { name: nameOf(r), quantity: (edits[r.line.key]?.quantity ?? '').trim(), unit: (edits[r.line.key]?.unit ?? '').trim(), priority: 'normal' as const, tripId: null, store: storeForRow(choice, r.line.key, stores) }
            : { name: r.line.name, quantity: r.line.quantity ?? '', unit: '', priority: 'normal' as const, tripId: null, store: storeForRow(choice, r.line.key, stores) },
        ),
      )
      setAdded(chosen.length)
      onAdded?.(chosen.length)
      showToast(`Añadidos ${chosen.length} a Compras`)
    } catch (e) {
      setError(errorMessage(e, 'No se han podido añadir los productos.') + ' No se ha añadido nada a Compras; puedes volver a intentarlo. Si tu cuenta no tiene acceso a Compras, pídeselo a quien administra tu familia.')
    } finally {
      sending.current = false
      setSaving(false)
    }
  }

  const recipeRows = rows.filter((r) => !r.line.direct)
  const manualRows = rows.filter((r) => r.line.direct)

  const inListBadge = (r: MenuShoppingRow) =>
    r.inList && (
      <span className="community-menu-badge reuse">
        {' '}
        Ya está en tu lista
        {r.inListStores.some((s) => s) ? ` (${[...new Set(r.inListStores.map((s) => s ?? 'sin tienda'))].join(', ')})` : ''}
      </span>
    )

  function renderRecipeRow(r: MenuShoppingRow) {
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
              {inListBadge(r)}
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
        <RowStoreSelect stores={stores} choice={choice} onChange={setChoice} rowKey={r.line.key} name={r.line.name} />
        {expanded && <p className="community-menu-shop-for">Para: {dishes.join(', ')}</p>}
        {r.line.hint && <p className="community-menu-shop-notes">{r.line.hint}</p>}
      </li>
    )
  }

  // Producto escrito a mano: nombre, cantidad y unidad editables (la cantidad empieza vacía; no se impone ninguna).
  function renderManualRow(r: MenuShoppingRow) {
    const e = edits[r.line.key] ?? {}
    return (
      <li key={r.line.key} className="community-menu-shop-item community-menu-shop-manual-item">
        <div className="community-menu-shop-row">
          <input type="checkbox" checked={checked.has(r.line.key)} onChange={() => toggleIn(setChecked, r.line.key)} aria-label={`Añadir ${nameOf(r) || 'producto'} a Compras`} />
          <input
            className="community-menu-shop-name-input"
            type="text"
            value={e.name ?? r.line.name}
            maxLength={120}
            placeholder="Nombre del producto"
            aria-label={`Nombre de ${r.line.name}`}
            onChange={(ev) => setEdit(r.line.key, { name: ev.target.value })}
          />
        </div>
        <div className="community-menu-shop-manual-fields">
          <input
            type="text"
            inputMode="decimal"
            value={e.quantity ?? ''}
            maxLength={20}
            placeholder="Cantidad"
            aria-label={`Cantidad de ${nameOf(r) || r.line.name}`}
            onChange={(ev) => setEdit(r.line.key, { quantity: ev.target.value })}
          />
          <input
            type="text"
            value={e.unit ?? ''}
            maxLength={20}
            placeholder="Unidad"
            aria-label={`Unidad de ${nameOf(r) || r.line.name}`}
            onChange={(ev) => setEdit(r.line.key, { unit: ev.target.value })}
          />
        </div>
        {inListBadge(r) && <p className="community-menu-shop-notes">{inListBadge(r)}</p>}
        <RowStoreSelect stores={stores} choice={choice} onChange={setChoice} rowKey={r.line.key} name={nameOf(r) || r.line.name} />
      </li>
    )
  }

  const titleId = `${uid}-title`
  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onClose()} onKeyDown={(e) => e.key === 'Escape' && !saving && onClose()}>
      <div ref={dialogRef} className="modal-sheet community-menu-sheet" data-help-id="lineas-compra.hoja" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
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
                    <div className="community-menu-selectall" data-help-id="lineas-compra.marcar">
                      <button type="button" className="link-button" onClick={() => setChecked(new Set(rows.map((r) => r.line.key)))}>
                        Marcar todo
                      </button>
                      <button type="button" className="link-button" onClick={() => setChecked(new Set())}>
                        Desmarcar todo
                      </button>
                    </div>
                  )}
                  <StoreChoiceBar stores={stores} choice={choice} onChange={setChoice} keys={rows.filter((r) => checked.has(r.line.key)).map((r) => r.line.key)} />
                  {recipeRows.length > 0 && (
                    <>
                      {manualRows.length > 0 && <h3 className="community-menu-shop-heading">Ingredientes de recetas</h3>}
                      <ul className="community-menu-shop-list community-menu-shop-compact" data-help-id="lineas-compra.lista">{recipeRows.map(renderRecipeRow)}</ul>
                    </>
                  )}
                  {manualRows.length > 0 && (
                    <>
                      <h3 className="community-menu-shop-heading">
                        Escritos a mano <span className="muted">(se añaden tal cual, sin recetas: revisa el nombre y pon la cantidad si quieres)</span>
                      </h3>
                      <ul className="community-menu-shop-list community-menu-shop-compact community-menu-shop-manual">{manualRows.map(renderManualRow)}</ul>
                    </>
                  )}
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <div className="community-menu-sheet-actions community-menu-sticky">
                <button type="button" className="primary" data-help-id="lineas-compra.confirmar" onClick={() => void confirm()} disabled={saving || selectedCount === 0 || state.status !== 'ok'}>
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
