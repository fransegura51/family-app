import { useState } from 'react'
import { addMenuShoppingLines } from '@/data/food'
import { errorMessage } from '@/domain/errorMessage'
import type { ShoppingPlanLine } from '@/domain/menuShoppingPlan'
import type { ScaleSkipReason } from '@/domain/recipeScaling'
import type { ShoppingStoreEntry } from '@/domain/types'
import { showToast } from '@/state/toast'

const NOTE_LABEL: Record<ScaleSkipReason, string> = {
  sin_raciones: 'La receta no tiene raciones: cantidad original, sin escalar.',
  cantidad_no_numerica: 'Cantidad no numérica en la receta: revísala.',
  unidad_no_escalable: 'Unidad que no se escala: cantidad original.',
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
  const [rows, setRows] = useState(() => lines.map((l) => ({ include: true, quantity: l.quantity ?? '', store: '' })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = rows.filter((r) => r.include).length

  function update(index: number, patch: Partial<{ include: boolean; quantity: string; store: string }>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function confirm() {
    const chosen = lines
      .map((line, i) => ({ line, row: rows[i] }))
      .filter(({ row }) => row.include)
      .map(({ line, row }) => ({ name: line.name, quantity: row.quantity.trim(), store: row.store || null }))
    if (chosen.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await addMenuShoppingLines(chosen, eventId)
      showToast(`Añadidos ${chosen.length} a Compras`)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir a Compras; no se ha guardado nada más'))
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
          {lines.length === 0 && <p className="muted">No hay ingredientes de recetas vinculadas a platos de la familia.</p>}
          {lines.map((line, i) => (
            <article key={line.key} className="menu-shopping-item">
              <label className="menu-shopping-check">
                <input type="checkbox" checked={rows[i].include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Comprar ${line.name}`} />
                <span className="menu-shopping-name">{line.name}</span>
              </label>
              <div className="menu-shopping-controls">
                <input
                  className="menu-shopping-quantity"
                  type="text"
                  value={rows[i].quantity}
                  placeholder="Cantidad (desconocida)"
                  onChange={(e) => update(i, { quantity: e.target.value })}
                  aria-label={`Cantidad de ${line.name}`}
                />
                <select className="menu-shopping-store" value={rows[i].store} onChange={(e) => update(i, { store: e.target.value })} aria-label={`Tienda de ${line.name}`}>
                  <option value="">Sin tienda</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <p className="menu-shopping-sources">Para: {[...new Set(line.sources.map((s) => s.dishName))].join(', ')}</p>
              {line.notes.length > 0 && <p className="menu-shopping-notes">{line.notes.map((n) => NOTE_LABEL[n]).join(' ')}</p>}
            </article>
          ))}
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
