import { useId, useState, type ReactNode } from 'react'
import { RECIPE_TAG_OPTIONS } from '@/domain/recipeDraft'
import {
  addIngredientRowAfter,
  addStepRow,
  addTag,
  cleanTagInput,
  customTags,
  moveStepRow,
  removeIngredientRow,
  removeStepRow,
  SERVINGS_INVALID_TEXT,
  servingsTextInvalid,
  tagIsOn,
  tagsAtLimit,
  toggleTag,
  UNIT_SUGGESTIONS,
  updateIngredientRow,
  updateStepRow,
  type IngredientRow,
  type RecipeEditorLimits,
  type StepRow,
} from '@/domain/recipeEditor'

// EL editor de campos de receta de PEPA: una sola implementación que usan la Cocina (receta privada, con sus ingredientes en filas) y Comunidad (copia pública
// independiente). Es un componente CONTROLADO: no guarda nada por su cuenta, recibe las filas/textos y avisa de cada cambio. Quien lo usa pone lo suyo:
//  - la Cocina: título con historial, foto, buscar/importar de internet, «fuente» de las raciones (`servingsNote`), notas antiguas en texto libre (`legacyNotes`)
//    y el botón de guardar;
//  - Comunidad: la traducción a `RecipeDraftInput`, los límites del servidor (`limits`), la foto de portada y la publicación.
// Reglas y ayudantes puros: `src/domain/recipeEditor.ts`. Se pinta como un fragmento para que cada pantalla lo coloque dentro de su propio formulario (`.recipe-form`).

export interface RecipeEditorFieldsProps {
  // Raciones: el texto tal cual se escribe (vacío = no se sabe). La validación (1–50, enteros o medios) se avisa aquí mismo.
  servingsText: string
  onServingsTextChange: (text: string) => void
  // Hueco bajo las raciones (la Cocina enseña aquí la «Fuente» original de la receta importada).
  servingsNote?: ReactNode

  tags: string[]
  onTagsChange: (tags: string[]) => void
  // Etiquetas sugeridas; las demás de la receta salen aparte con una ✕ para quitarlas. Por defecto, las de siempre.
  tagOptions?: string[]

  ingredients: IngredientRow[]
  onIngredientsChange: (rows: IngredientRow[]) => void

  steps: StepRow[]
  onStepsChange: (rows: StepRow[]) => void
  // Recetas antiguas con la preparación en texto libre (no numerada): se editan tal cual en un solo cuadro en vez de convertirlas a pasos.
  legacyNotes?: { value: string; onChange: (text: string) => void }

  limits?: RecipeEditorLimits
  disabled?: boolean
  // Marcas `data-help-id` para la Ayuda (tutoriales «Enséñame»), una por bloque. No cambian nada visible; sin ellas, el componente se pinta igual que siempre.
  marks?: Partial<Record<'servings' | 'tags' | 'ingredients' | 'steps', { 'data-help-id': string }>>
}

export function RecipeEditorFields({
  servingsText,
  onServingsTextChange,
  servingsNote,
  tags,
  onTagsChange,
  tagOptions = RECIPE_TAG_OPTIONS,
  ingredients,
  onIngredientsChange,
  steps,
  onStepsChange,
  legacyNotes,
  limits = {},
  disabled,
  marks,
}: RecipeEditorFieldsProps) {
  const uid = useId()
  const [newTag, setNewTag] = useState('')
  const servingsInvalid = servingsTextInvalid(servingsText)
  const atTagLimit = tagsAtLimit(tags, limits)
  const atIngredientLimit = limits.maxIngredients !== undefined && ingredients.length >= limits.maxIngredients

  function submitNewTag() {
    if (!cleanTagInput(newTag, limits)) return
    onTagsChange(addTag(tags, newTag, limits))
    setNewTag('')
  }

  return (
    <>
      <div className="recipe-field" {...marks?.servings}>
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
          value={servingsText}
          onChange={(e) => onServingsTextChange(e.target.value)}
          placeholder="¿Para cuántas personas es?"
          disabled={disabled}
          aria-invalid={servingsInvalid}
        />
        {servingsInvalid && <p className="error">{SERVINGS_INVALID_TEXT}</p>}
        {servingsNote}
      </div>

      <div className="recipe-field" {...marks?.tags}>
        <span className="recipe-field-label">Etiquetas</span>
        <div className="filter-row">
          {tagOptions.map((tag) => {
            const on = tagIsOn(tags, tag, limits)
            return (
              <button key={tag} type="button" className={'chip' + (on ? ' chip-active' : '')} aria-pressed={on} onClick={() => onTagsChange(toggleTag(tags, tag, limits))} disabled={disabled}>
                {tag}
              </button>
            )
          })}
          {customTags(tags, tagOptions, limits).map((tag) => (
            <button key={tag} type="button" className="chip chip-active" aria-label={`Quitar la etiqueta ${tag}`} onClick={() => onTagsChange(toggleTag(tags, tag, limits))} disabled={disabled}>
              {tag} ✕
            </button>
          ))}
        </div>
        <div className="recipe-inline-row">
          <input
            type="text"
            value={newTag}
            maxLength={limits.maxTagLength}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitNewTag()
              }
            }}
            placeholder="Nueva etiqueta"
            aria-label="Nueva etiqueta"
            disabled={disabled}
          />
          <button type="button" onClick={submitNewTag} disabled={disabled || !newTag.trim() || atTagLimit}>
            Añadir
          </button>
        </div>
        {atTagLimit && <p className="muted">Máximo {limits.maxTags} etiquetas.</p>}
      </div>

      <div className="recipe-field" {...marks?.ingredients}>
        <span className="recipe-field-label">Ingredientes</span>
        {ingredients.map((r, i) => (
          <div key={r.id} className="recipe-ing-row">
            <input
              className="recipe-ing-name"
              type="text"
              value={r.name}
              maxLength={limits.maxIngredientName}
              onChange={(e) => onIngredientsChange(updateIngredientRow(ingredients, r.id, { name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onIngredientsChange(addIngredientRowAfter(ingredients, r.id, limits.maxIngredients))
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
              maxLength={limits.maxIngredientField}
              onChange={(e) => onIngredientsChange(updateIngredientRow(ingredients, r.id, { quantity: e.target.value }))}
              placeholder="Cant."
              aria-label={`Cantidad del ingrediente ${i + 1}`}
              disabled={disabled}
            />
            <input
              className="recipe-ing-unit"
              type="text"
              list={`${uid}-units`}
              value={r.unit}
              maxLength={limits.maxIngredientField}
              onChange={(e) => onIngredientsChange(updateIngredientRow(ingredients, r.id, { unit: e.target.value }))}
              placeholder="Unidad"
              aria-label={`Unidad del ingrediente ${i + 1}`}
              disabled={disabled}
            />
            <button type="button" className="recipe-row-remove" aria-label={`Quitar el ingrediente ${i + 1}`} disabled={disabled} onClick={() => onIngredientsChange(removeIngredientRow(ingredients, r.id))}>
              ✕
            </button>
          </div>
        ))}
        <datalist id={`${uid}-units`}>
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <button
          type="button"
          className="link-button"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => onIngredientsChange(addIngredientRowAfter(ingredients, null, limits.maxIngredients))}
          disabled={disabled || atIngredientLimit}
        >
          + Añadir ingrediente
        </button>
      </div>

      {legacyNotes ? (
        <div className="recipe-field">
          <label className="recipe-field-label" htmlFor={`${uid}-notes`}>
            Preparación / notas
          </label>
          <textarea id={`${uid}-notes`} rows={6} value={legacyNotes.value} onChange={(e) => legacyNotes.onChange(e.target.value)} disabled={disabled} />
        </div>
      ) : (
        <div className="recipe-field" {...marks?.steps}>
          <span className="recipe-field-label">Preparación</span>
          {steps.map((st, i) => (
            <div key={st.id} className="recipe-step-row">
              <span className="recipe-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <textarea
                rows={2}
                value={st.text}
                onChange={(e) => onStepsChange(updateStepRow(steps, st.id, e.target.value))}
                placeholder={i === 0 ? 'Describe el primer paso…' : 'Siguiente paso…'}
                aria-label={`Paso ${i + 1}`}
                disabled={disabled}
              />
              <div className="recipe-step-actions">
                <button type="button" className="recipe-row-remove" aria-label={`Subir el paso ${i + 1}`} disabled={disabled || i === 0} onClick={() => onStepsChange(moveStepRow(steps, i, -1))}>
                  ↑
                </button>
                <button type="button" className="recipe-row-remove" aria-label={`Bajar el paso ${i + 1}`} disabled={disabled || i === steps.length - 1} onClick={() => onStepsChange(moveStepRow(steps, i, 1))}>
                  ↓
                </button>
                <button type="button" className="recipe-row-remove" aria-label={`Quitar el paso ${i + 1}`} disabled={disabled} onClick={() => onStepsChange(removeStepRow(steps, st.id))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => onStepsChange(addStepRow(steps))} disabled={disabled}>
            + Añadir paso
          </button>
        </div>
      )}
    </>
  )
}

// Caja del nombre de la receta, igual en la Cocina y en la hoja de publicar de Comunidad. Con `label` lleva etiqueta visible; sin ella, un aria-label.
// `suggestions` (la Cocina: sus búsquedas anteriores) se ofrece como lista de ayuda al escribir.
export function RecipeTitleField({
  value,
  onChange,
  label,
  ariaLabel = 'Título',
  placeholder,
  suggestions,
  maxLength,
  required,
  large = true,
  disabled,
  helpId,
}: {
  value: string
  onChange: (text: string) => void
  label?: string
  ariaLabel?: string
  placeholder?: string
  suggestions?: string[]
  maxLength?: number
  required?: boolean
  // Letra grande (la Cocina); la hoja de publicar de Comunidad usa la normal.
  large?: boolean
  disabled?: boolean
  /** Marca `data-help-id` para la Ayuda; no cambia nada visible. */
  helpId?: string
}) {
  const uid = useId()
  return (
    <div className="recipe-field" data-help-id={helpId}>
      {label && (
        <label className="recipe-field-label" htmlFor={`${uid}-title`}>
          {label}
        </label>
      )}
      <input
        id={`${uid}-title`}
        className={large ? 'recipe-title-input' : undefined}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        required={required}
        placeholder={placeholder}
        list={suggestions ? `${uid}-title-list` : undefined}
        autoComplete="off"
        aria-label={label ? undefined : ariaLabel}
        disabled={disabled}
      />
      {suggestions && (
        <datalist id={`${uid}-title-list`}>
          {suggestions.map((q) => (
            <option key={q} value={q} />
          ))}
        </datalist>
      )}
    </div>
  )
}

