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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Preparar compra del menú">
      <div className="modal">
        <h3>🛒 Preparar compra del menú</h3>
        <p className="muted" style={{ fontSize: 12 }}>
          Ingredientes de las recetas de los platos que prepara la familia. Escalado orientativo a {targetDiners} comensal{targetDiners === 1 ? '' : 'es'} confirmados (solo donde la receta tiene raciones). Revísalo: nada se añade hasta que confirmes.
        </p>
        {lines.length === 0 && <p className="muted">No hay ingredientes de recetas vinculadas a platos de la familia.</p>}
        {lines.map((line, i) => (
          <div key={line.key} style={{ borderTop: '1px solid rgba(0,0,0,0.08)', padding: '6px 0' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={rows[i].include} onChange={(e) => update(i, { include: e.target.checked })} aria-label={`Comprar ${line.name}`} />
              <strong>{line.name}</strong>
            </label>
            <div className="inline-fields" style={{ marginTop: 4 }}>
              <input
                type="text"
                value={rows[i].quantity}
                placeholder="Cantidad (desconocida)"
                onChange={(e) => update(i, { quantity: e.target.value })}
                aria-label={`Cantidad de ${line.name}`}
              />
              <select value={rows[i].store} onChange={(e) => update(i, { store: e.target.value })} aria-label={`Tienda de ${line.name}`}>
                <option value="">Sin tienda</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>
              Para: {[...new Set(line.sources.map((s) => s.dishName))].join(', ')}
              {line.notes.map((n) => ` · ${NOTE_LABEL[n]}`).join('')}
            </p>
          </div>
        ))}
        {error && <p className="error">{error}</p>}
        <div className="filter-row">
          <button type="button" onClick={() => void confirm()} disabled={saving || selected === 0}>
            {saving ? 'Añadiendo…' : `Añadir ${selected} a Compras`}
          </button>
          <button type="button" className="link-button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
