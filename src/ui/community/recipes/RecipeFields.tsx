import { useId, useState } from 'react'
import type { RecipeDraftInput, RecipeIngredient } from '@/domain/community'
import { RECIPE_TAG_OPTIONS } from '@/domain/recipeDraft'
import { isValidServings } from '@/domain/recipeServings'
import { MAX_RECIPE_INGREDIENTS, MAX_RECIPE_TAGS, MAX_TAG_LENGTH, stepsFromNotes, stepsToText } from '@/domain/communityRecipeBridge'
import '@/ui/community/recipes/communityRecipes.css'

// Campos de la receta del editor de publicaciones de Comunidad. NO es un editor nuevo: usa los mismos campos, las mismas clases de estilo y los mismos
// ayudantes que el formulario de receta de la Cocina (raciones entre 1 y 50 con medios puntos, ingredientes «nombre · cantidad · unidad» uno por fila, pasos
// numerados que se pueden subir y bajar, etiquetas). Lo que la Cocina hace además (buscar recetas en internet, foto, guardado) no aplica aquí: la foto de la
// publicación y el guardado los gestiona el editor de publicaciones.
const UNIT_SUGGESTIONS = ['g', 'kg', 'ml', 'l', 'unidades', 'cucharadas', 'cucharaditas', 'tazas', 'pizca', 'dientes', 'lonchas']

interface IngRow extends RecipeIngredient {
  id: string
}
interface StepRow {
  id: string
  text: string
}

let rowSeq = 0
const newIng = (over: Partial<RecipeIngredient> = {}): IngRow => ({ id: `cing-${++rowSeq}`, name: '', quantity: '', unit: '', ...over })
const newStep = (text = ''): StepRow => ({ id: `cstep-${++rowSeq}`, text })

interface Local {
  // Huella del valor que recibimos o enviamos la última vez: si el padre nos da OTRO valor (p. ej. al cargar un borrador) se reconstruyen las filas.
  key: string
  ing: IngRow[]
  steps: StepRow[]
  servingsText: string
}

function fromValue(value: RecipeDraftInput): Local {
  const steps = stepsFromNotes(value.steps)
  return {
    key: JSON.stringify(value),
    ing: value.ingredients.length > 0 ? value.ingredients.map((i) => newIng(i)) : [newIng(), newIng(), newIng()],
    steps: steps.length > 0 ? steps.map((s) => newStep(s)) : [newStep(), newStep()],
    servingsText: value.servings === null ? '' : String(value.servings),
  }
}

function toValue(local: Pick<Local, 'ing' | 'steps' | 'servingsText'>, tags: string[]): RecipeDraftInput {
  const text = local.servingsText.trim().replace(',', '.')
  const parsed = text === '' ? null : Number(text)
  return {
    servings: isValidServings(parsed) ? parsed : null,
    // Las filas en blanco se quedan en pantalla pero no viajan en el valor.
    ingredients: local.ing.filter((r) => r.name.trim()).map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit })),
    steps: stepsToText(local.steps.map((s) => s.text)),
    tags,
  }
}

export function RecipeFields({ value, onChange, disabled }: { value: RecipeDraftInput; onChange: (next: RecipeDraftInput) => void; disabled?: boolean }) {
  const uid = useId()
  const [local, setLocal] = useState<Local>(() => fromValue(value))
  const [newTag, setNewTag] = useState('')
  // Si el valor de fuera ya no es el que enviamos nosotros, se reconstruyen las filas desde él (estado derivado durante el render, sin efectos).
  let current = local
  const incomingKey = JSON.stringify(value)
  if (local.key !== incomingKey) {
    current = fromValue(value)
    setLocal(current)
  }

  function emit(patch: Partial<Pick<Local, 'ing' | 'steps' | 'servingsText'>>, tags: string[] = value.tags) {
    const merged = { ing: current.ing, steps: current.steps, servingsText: current.servingsText, ...patch }
    const next = toValue(merged, tags)
    setLocal({ ...merged, key: JSON.stringify(next) })
    onChange(next)
  }

  const servingsInvalid = current.servingsText.trim() !== '' && !isValidServings(Number(current.servingsText.trim().replace(',', '.')))
  const tagKeys = value.tags.map((t) => t.toLowerCase())

  function toggleTag(tag: string) {
    const lower = tag.toLowerCase()
    if (tagKeys.includes(lower)) emit({}, value.tags.filter((t) => t.toLowerCase() !== lower))
    else if (value.tags.length < MAX_RECIPE_TAGS) emit({}, [...value.tags, lower])
  }

  function addNewTag() {
    const t = newTag.trim().toLowerCase().slice(0, MAX_TAG_LENGTH)
    if (!t) return
    if (!tagKeys.includes(t) && value.tags.length < MAX_RECIPE_TAGS) emit({}, [...value.tags, t])
    setNewTag('')
  }

  function updateIng(id: string, patch: Partial<RecipeIngredient>) {
    emit({ ing: current.ing.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  }

  function addIngAfter(id: string | null) {
    if (current.ing.length >= MAX_RECIPE_INGREDIENTS) return
    const at = id ? current.ing.findIndex((r) => r.id === id) + 1 : current.ing.length
    emit({ ing: [...current.ing.slice(0, at), newIng(), ...current.ing.slice(at)] })
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= current.steps.length) return
    const next = [...current.steps]
    ;[next[index], next[target]] = [next[target], next[index]]
    emit({ steps: next })
  }

  const customTags = value.tags.filter((t) => !RECIPE_TAG_OPTIONS.some((o) => o.toLowerCase() === t.toLowerCase()))

  return (
    <div className="recipe-form community-recipe-fields" aria-label="Datos de la receta">
      <div className="recipe-field">
        <label className="recipe-field-label" htmlFor={`${uid}-servings`}>
          Raciones (opcional)
        </label>
        <input
          id={`${uid}-servings`}
          type="number"
          inputMode="decimal"
          min={1}
          max={50}
          step={0.5}
          value={current.servingsText}
          onChange={(e) => emit({ servingsText: e.target.value })}
          placeholder="¿Para cuántas personas es?"
          disabled={disabled}
          aria-invalid={servingsInvalid}
        />
        {servingsInvalid && <p className="error">Las raciones deben ser un número entre 1 y 50, entero o con medio punto (6,5), o déjalo vacío.</p>}
      </div>

      <div className="recipe-field">
        <span className="recipe-field-label">Etiquetas</span>
        <div className="filter-row">
          {RECIPE_TAG_OPTIONS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={'chip' + (tagKeys.includes(tag.toLowerCase()) ? ' chip-active' : '')}
              aria-pressed={tagKeys.includes(tag.toLowerCase())}
              onClick={() => toggleTag(tag)}
              disabled={disabled}
            >
              {tag}
            </button>
          ))}
          {customTags.map((tag) => (
            <button key={tag} type="button" className="chip chip-active" aria-label={`Quitar la etiqueta ${tag}`} onClick={() => toggleTag(tag)} disabled={disabled}>
              {tag} ✕
            </button>
          ))}
        </div>
        <div className="recipe-inline-row">
          <input
            type="text"
            value={newTag}
            maxLength={MAX_TAG_LENGTH}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addNewTag()
              }
            }}
            placeholder="Nueva etiqueta"
            aria-label="Nueva etiqueta"
            disabled={disabled}
          />
          <button type="button" onClick={addNewTag} disabled={disabled || !newTag.trim() || value.tags.length >= MAX_RECIPE_TAGS}>
            Añadir
          </button>
        </div>
        {value.tags.length >= MAX_RECIPE_TAGS && <p className="muted">Máximo {MAX_RECIPE_TAGS} etiquetas.</p>}
      </div>

      <div className="recipe-field">
        <span className="recipe-field-label">Ingredientes</span>
        {current.ing.map((r, i) => (
          <div key={r.id} className="recipe-ing-row">
            <input
              className="recipe-ing-name"
              type="text"
              value={r.name}
              maxLength={120}
              onChange={(e) => updateIng(r.id, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addIngAfter(r.id)
                }
              }}
              placeholder="Ingrediente"
              aria-label={`Ingrediente ${i + 1}`}
              disabled={disabled}
            />
            <input
              className="recipe-ing-qty"
              type="text"
              inputMode="decimal"
              value={r.quantity}
              maxLength={30}
              onChange={(e) => updateIng(r.id, { quantity: e.target.value })}
              placeholder="Cant."
              aria-label={`Cantidad del ingrediente ${i + 1}`}
              disabled={disabled}
            />
            <input
              className="recipe-ing-unit"
              type="text"
              list={`${uid}-units`}
              value={r.unit}
              maxLength={30}
              onChange={(e) => updateIng(r.id, { unit: e.target.value })}
              placeholder="Unidad"
              aria-label={`Unidad del ingrediente ${i + 1}`}
              disabled={disabled}
            />
            <button
              type="button"
              className="recipe-row-remove"
              aria-label={`Quitar el ingrediente ${i + 1}`}
              disabled={disabled}
              onClick={() => emit({ ing: current.ing.length > 1 ? current.ing.filter((x) => x.id !== r.id) : [newIng()] })}
            >
              ✕
            </button>
          </div>
        ))}
        <datalist id={`${uid}-units`}>
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <button type="button" className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => addIngAfter(null)} disabled={disabled || current.ing.length >= MAX_RECIPE_INGREDIENTS}>
          + Añadir ingrediente
        </button>
      </div>

      <div className="recipe-field">
        <span className="recipe-field-label">Preparación</span>
        {current.steps.map((st, i) => (
          <div key={st.id} className="recipe-step-row">
            <span className="recipe-step-num" aria-hidden="true">
              {i + 1}
            </span>
            <textarea
              rows={2}
              value={st.text}
              onChange={(e) => emit({ steps: current.steps.map((x) => (x.id === st.id ? { ...x, text: e.target.value } : x)) })}
              placeholder={i === 0 ? 'Describe el primer paso…' : 'Siguiente paso…'}
              aria-label={`Paso ${i + 1}`}
              disabled={disabled}
            />
            <div className="recipe-step-actions">
              <button type="button" className="recipe-row-remove" aria-label={`Subir el paso ${i + 1}`} disabled={disabled || i === 0} onClick={() => moveStep(i, -1)}>
                ↑
              </button>
              <button type="button" className="recipe-row-remove" aria-label={`Bajar el paso ${i + 1}`} disabled={disabled || i === current.steps.length - 1} onClick={() => moveStep(i, 1)}>
                ↓
              </button>
              <button
                type="button"
                className="recipe-row-remove"
                aria-label={`Quitar el paso ${i + 1}`}
                disabled={disabled}
                onClick={() => emit({ steps: current.steps.length > 1 ? current.steps.filter((x) => x.id !== st.id) : [newStep()] })}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => emit({ steps: [...current.steps, newStep()] })} disabled={disabled}>
          + Añadir paso
        </button>
      </div>
    </div>
  )
}
