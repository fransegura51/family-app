import { useState } from 'react'
import { addMenuShoppingLines } from '@/data/food'
import { errorMessage } from '@/domain/errorMessage'
import type { ShoppingPlanLine } from '@/domain/menuShoppingPlan'
import type { ScaleNote } from '@/domain/recipeScaling'
import type { ShoppingStoreEntry } from '@/domain/types'
import { showToast } from '@/state/toast'
import { clearPendingMenuShoppingRequestId, pendingMenuShoppingRequestId } from '@/state/menuShoppingRequestId'

const NOTE_LABEL: Record<ScaleNote, string> = {
  sin_raciones: 'La receta no tiene raciones: cantidad original, sin escalar.',
  cantidad_no_numerica: 'Cantidad no numérica en la receta: revísala.',
  unidad_no_escalable: 'Unidad que no se escala: cantidad original.',
  fraccionario: 'Resultado no entero de unidades: revísalo antes de comprar.',
}

// Una fila de la revisión. `line` es null para un producto añadido a mano.
interface ReviewRow {
  id: string
  line: ShoppingPlanLine | null
  name: string
  include: boolean
  quantity: string
  store: string
}

// Revisión ANTES de guardar: nada se añade a Compras hasta pulsar el botón de confirmar.
export function MenuShoppingModal({
  lines,
  stores,
  eventId,
  targetDiners,
  onClose,
  onSaved,
}: {
  lines: ShoppingPlanLine[]
  stores: ShoppingStoreEntry[]
  eventId: string
  targetDiners: number
  onClose: () => void
  onSaved: () => void
}) {
  const [rows, setRows] = useState<ReviewRow[]>(() =>
    lines.map((l) => ({ id: l.key, line: l, name: l.name, include: true, quantity: l.quantity ?? '', store: '' })),
  )
  // Identificador de ESTA confirmación: un reintento con el mismo valor no duplica nada en Compras.
  // Persistido por evento (no solo en memoria) — si la app se cierra justo después de confirmar, o el
  // modal se desmonta antes de recibir la respuesta, al volver se reutiliza el MISMO id en vez de uno
  // nuevo; una vez confirmada con éxito se libera, así que la siguiente compra es una operación nueva.
  const [requestId] = useState(() => pendingMenuShoppingRequestId(eventId))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = rows.filter((r) => r.include && r.name.trim()).length

  function update(id: string, patch: Partial<{ name: string; include: boolean; quantity: string; store: string }>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  // Producto añadido a mano: entra en la revisión como cualquier otra fila (sin cantidad ni tienda por defecto).
  function addManual() {
    setRows((prev) => [...prev, { id: `manual:${prev.length}:${Date.now()}`, line: null, name: '', include: true, quantity: '', store: '' }])
  }

  async function confirm() {
    const chosen = rows
      .filter((r) => r.include && r.name.trim())
      .map((r) => ({ name: r.name.trim(), quantity: r.quantity.trim(), store: r.store || null }))
    if (chosen.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await addMenuShoppingLines(chosen, eventId, requestId)
      clearPendingMenuShoppingRequestId(eventId)
      showToast(`Añadidos ${chosen.length} a Compras`)
      onSaved()
    } catch (err) {
      // Atómico en servidor: si falla, no queda nada guardado de esta confirmación.
      setError(errorMessage(err, 'No se ha podido guardar la compra. No se ha añadido nada a Compras.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    // Maquetación móvil: overlay + hoja OPACA (.modal-sheet, la misma clase que el resto de modales de la app),
    // cabecera fija, cuerpo con scroll propio y pie separado con safe-area. Solo cambia la presentación.
    <div className="modal-overlay menu-shopping-overlay" role="dialog" aria-modal="true" aria-label="Preparar compra del menú">
      <div className="modal-sheet menu-shopping-sheet">
        <header className="menu-shopping-header">
          <h3>🛒 Preparar compra del menú</h3>
          <p className="muted menu-shopping-intro">Revisa qué quieres añadir a Compras. Nada se guarda hasta que confirmes.</p>
          <p className="muted menu-shopping-scale">
            Escalado orientativo a {targetDiners} comensal{targetDiners === 1 ? '' : 'es'} confirmados (solo donde la receta tiene raciones).
          </p>
        </header>
        <div className="menu-shopping-body">
          {rows.length === 0 && <p className="muted">No hay nada que proponer de este menú. Puedes añadir un producto a mano.</p>}
          {rows.map((row) => (
            <article key={row.id} className="menu-shopping-item">
              <label className="menu-shopping-check">
                <input type="checkbox" checked={row.include} onChange={(e) => update(row.id, { include: e.target.checked })} aria-label={`Comprar ${row.name || "producto nuevo"}`} />
                {row.line && row.line.direct ? (
                  <input
                    className="menu-shopping-name menu-shopping-name-input"
                    type="text"
                    value={row.name}
                    placeholder="Nombre del producto"
                    onChange={(e) => update(row.id, { name: e.target.value })}
                    aria-label={`Nombre de ${row.line.name}`}
                  />
                ) : row.line ? (
                  <span className="menu-shopping-name">{row.name}</span>
                ) : (
                  <input
                    className="menu-shopping-name menu-shopping-name-input"
                    type="text"
                    value={row.name}
                    placeholder="Nombre del producto"
                    onChange={(e) => update(row.id, { name: e.target.value })}
                    aria-label="Nombre del producto añadido"
                  />
                )}
              </label>
              <div className="menu-shopping-controls">
                <input
                  className="menu-shopping-quantity"
                  type="text"
                  value={row.quantity}
                  placeholder="Cantidad (desconocida)"
                  onChange={(e) => update(row.id, { quantity: e.target.value })}
                  aria-label={`Cantidad de ${row.name || "producto nuevo"}`}
                />
                <select className="menu-shopping-store" value={row.store} onChange={(e) => update(row.id, { store: e.target.value })} aria-label={`Tienda de ${row.name || "producto nuevo"}`}>
                  <option value="">Sin tienda</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="menu-shopping-sources">Para: {row.line ? [...new Set(row.line.sources.map((s) => s.dishName))].join(', ') : 'Añadido a mano'}</p>
              {row.line && row.line.notes.length > 0 && <p className="menu-shopping-notes">{row.line.notes.map((n) => NOTE_LABEL[n]).join(' ')}</p>}
            </article>
          ))}
          <button type="button" className="link-button menu-shopping-add" onClick={addManual} disabled={saving}>
            + Añadir producto a mano
          </button>
        </div>
        <footer className="menu-shopping-footer">
          {error && <p className="error">{error}</p>}
          <div className="menu-shopping-actions">
            <button type="button" className="menu-shopping-confirm" onClick={() => void confirm()} disabled={saving || selected === 0}>
              {saving ? 'Añadiendo…' : `Añadir ${selected} a Compras`}
            </button>
            <button type="button" className="menu-shopping-cancel link-button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
