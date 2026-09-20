import { FormEvent, useState } from 'react'
import { createFamilyFoodType, deleteFamilyFoodType, updateFamilyFoodType, type FamilyFoodType, type FoodTypeKind } from '@/data/foodTypes'
import { colorForClass } from '@/domain/colors'
import { ICON_CHOICES } from '@/domain/foodTypes'
import { errorMessage } from '@/domain/errorMessage'
import { ConfirmIconButton } from '@/ui/ConfirmButton'

// Petición real: "de paso si puedes poner una gama más amplia de
// emojis estaría bien" — rejilla de emojis (comida y compras a la
// vez) para elegir el icono de una clase nueva o editada, sin
// depender de que el teclado de emoji del móvil esté a mano.
function EmojiPickerGrid({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div
      className="card"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: 8, maxHeight: 160, overflowY: 'auto', marginTop: 4 }}
    >
      {ICON_CHOICES.map((e) => (
        <button
          key={e}
          type="button"
          className="link-button"
          style={{ fontSize: 20, padding: 4, lineHeight: 1 }}
          onClick={() => onPick(e)}
        >
          {e}
        </button>
      ))}
    </div>
  )
}

const DEFAULT_ICON_BY_KIND: Record<FoodTypeKind, string> = { alimentacion: '🍽️', no_alimentos: '🛍️' }

// Petición real: "en los productos no alimenticios en el engranaje
// viene la misma clasificación de los alimentos... reestructuramos la
// creación de clases y la hacemos para todos los productos, misma
// separación por un botón Alimentos y Otros. De paso haz las clases
// más estrechas, editables (lápiz) y los emojis también editables".
// Empieza con las de fábrica de cada conjunto (sembradas solas la
// primera vez) y se pueden crear/editar/borrar las que hagan falta,
// por separado para Alimentos y para Otros.
//
// Petición real: "en la parte que emerge al leer un ticket debería
// estar accesible el botón engranaje de crear nuevas clases de
// productos" — antes solo vivía dentro de ShoppingScreen (Historial de
// precios); se saca a un archivo aparte para que también lo use
// ReceiptForm (FinanceScreen, revisión de ticket) sin crear un import
// circular entre las dos pantallas.
export function ProductTypesModal({
  types,
  initialKind,
  onClose,
  onChanged,
}: {
  types: FamilyFoodType[]
  initialKind: FoodTypeKind
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [kind, setKind] = useState<FoodTypeKind>(initialKind)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(DEFAULT_ICON_BY_KIND[initialKind])
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [showEditIconPicker, setShowEditIconPicker] = useState(false)

  const visibleTypes = types.filter((t) => t.kind === kind)

  function switchKind(next: FoodTypeKind) {
    setKind(next)
    setIcon(DEFAULT_ICON_BY_KIND[next])
    setShowIconPicker(false)
    setEditingId(null)
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createFamilyFoodType(name.trim(), icon, kind)
      setName('')
      setIcon(DEFAULT_ICON_BY_KIND[kind])
      setShowIconPicker(false)
      await onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear'))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(t: FamilyFoodType) {
    setEditingId(t.id)
    setEditName(t.name)
    setEditIcon(t.icon)
    setShowEditIconPicker(false)
  }

  async function handleSaveEdit() {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await updateFamilyFoodType(editingId, editName.trim(), editIcon)
      setEditingId(null)
      await onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteFamilyFoodType(id)
      if (editingId === id) setEditingId(null)
      await onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar'))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            ⚙️ Clasificaciones de productos
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Son las clases que puedes elegir para cada producto en Historial de precios — Alimentos y Otros tienen
          cada uno las suyas. Cada clase tiene siempre su color (el que ves en la lista, el historial y las
          estadísticas), que sale de su nombre.
        </p>
        <div className="filter-row">
          <button
            type="button"
            className={'chip' + (kind === 'alimentacion' ? ' chip-active' : '')}
            onClick={() => switchKind('alimentacion')}
          >
            Alimentos
          </button>
          <button
            type="button"
            className={'chip' + (kind === 'no_alimentos' ? ' chip-active' : '')}
            onClick={() => switchKind('no_alimentos')}
          >
            Otros
          </button>
        </div>
        <form onSubmit={handleCreate} className="inline-fields" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="link-button"
            style={{ fontSize: 20 }}
            onClick={() => setShowIconPicker((v) => !v)}
            title="Elegir icono"
            aria-label="Elegir icono de la nueva clase"
          >
            {icon}
          </button>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'alimentacion' ? 'Nueva clase (p. ej. Especias)' : 'Nueva clase (p. ej. Deporte)'}
            style={{ flex: 1, background: name.trim() ? colorForClass(name) : undefined }}
          />
          <button type="submit" disabled={saving || !name.trim()}>
            Crear
          </button>
        </form>
        {showIconPicker && (
          <EmojiPickerGrid
            onPick={(e) => {
              setIcon(e)
              setShowIconPicker(false)
            }}
          />
        )}
        {error && <p className="error">{error}</p>}
        <div style={{ marginTop: 12 }}>
          {visibleTypes.map((t) =>
            editingId === t.id ? (
              <div key={t.id} style={{ padding: '6px 8px', borderRadius: 8, marginBottom: 4, background: colorForClass(t.name) }}>
                <div className="inline-fields">
                  <button
                    type="button"
                    className="link-button"
                    style={{ fontSize: 18 }}
                    onClick={() => setShowEditIconPicker((v) => !v)}
                    aria-label={`Cambiar icono de ${t.name}`}
                  >
                    {editIcon}
                  </button>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ flex: 1 }} />
                  <button type="button" className="link-button" onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
                    ✓
                  </button>
                  <button type="button" className="link-button" onClick={() => setEditingId(null)}>
                    ✕
                  </button>
                </div>
                {showEditIconPicker && (
                  <EmojiPickerGrid
                    onPick={(e) => {
                      setEditIcon(e)
                      setShowEditIconPicker(false)
                    }}
                  />
                )}
              </div>
            ) : (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: 8,
                  marginBottom: 4,
                  background: colorForClass(t.name),
                  fontSize: 14,
                }}
              >
                <span>
                  {t.icon} {t.name}
                </span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="link-button" onClick={() => startEdit(t)} aria-label={`Editar ${t.name}`}>
                    ✏️
                  </button>
                  <ConfirmIconButton
                    icon="✕"
                    className="link-button"
                    ariaLabel={`Eliminar clase ${t.name}`}
                    onConfirm={() => handleDelete(t.id)}
                  />
                </span>
              </div>
            ),
          )}
          {visibleTypes.length === 0 && <p className="muted">Todavía no hay ninguna.</p>}
        </div>
      </div>
    </div>
  )
}
