// Selector de ingredientes de una receta → Lista de la compra. ÚNICO para toda la app: lo usa «La cocina de PEPA»
// (Recetas) y «Menú del evento». La familia decide qué ingredientes pasan (y, si quiere, en qué tienda); PEPA no
// envía nada por su cuenta ni inventa ingredientes: solo existen los que la familia escribió en la receta.
// `eventId` (opcional) deja el producto ligado al evento, igual que ya hacía el flujo de Eventos.
import { useState } from 'react'
import { addRecipeIngredientsToShoppingList } from '@/data/food'
import { errorMessage } from '@/domain/errorMessage'
import type { Recipe, ShoppingStoreEntry } from '@/domain/types'

export function PickIngredientsModal({
  recipe,
  stores,
  eventId = null,
  dishName,
  onCancel,
  onDone,
  onError,
}: {
  recipe: Recipe
  stores: ShoppingStoreEntry[]
  // Opcional: evento al que se liga lo que se añada (Menú del evento).
  eventId?: string | null
  // Opcional: plato del evento para el que se eligen (solo cambia el texto de ayuda).
  dishName?: string
  onCancel: () => void
  onDone: (count: number) => void
  onError: (message: string) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(recipe.ingredients.map((i) => i.id)))
  const [storeByIngredient, setStoreByIngredient] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState(false)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleConfirm() {
    setSaving(true)
    try {
      const selections = [...selected].map((ingredientId) => ({
        ingredientId,
        store: storeByIngredient.get(ingredientId) || null,
      }))
      await addRecipeIngredientsToShoppingList(recipe, selections, eventId)
      onDone(selections.length)
    } catch (err) {
      onError(errorMessage(err, 'No se pudo generar la lista'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Añadir a la lista
          </h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {dishName && (
          <p className="muted" style={{ margin: 0 }}>
            Para «{dishName}», con la receta «{recipe.title}».
          </p>
        )}
        <p className="muted">Elige qué ingredientes hacen falta y, si quieres, en qué tienda comprar cada uno.</p>
        {recipe.ingredients.length === 0 && <p className="muted">Esta receta todavía no tiene ingredientes escritos.</p>}
        <div className="event-list">
          {recipe.ingredients.map((i) => (
            <div key={i.id} className="card" style={{ padding: 10 }}>
              <label className="checkbox-label" style={{ marginBottom: 6 }}>
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                {i.name}
                {i.quantity && ` — ${i.quantity}${i.unit ? ' ' + i.unit : ''}`}
              </label>
              {selected.has(i.id) && (
                <select value={storeByIngredient.get(i.id) ?? ''} onChange={(e) => setStoreByIngredient((prev) => new Map(prev).set(i.id, e.target.value))}>
                  <option value="">Sin tienda concreta</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={handleConfirm} disabled={saving || selected.size === 0}>
          {saving ? 'Añadiendo…' : `Añadir ${selected.size} a la lista`}
        </button>
      </div>
    </div>
  )
}
