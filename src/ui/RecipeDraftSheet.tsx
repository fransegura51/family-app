import { useRef, useState } from 'react'
import { listRecipes } from '@/data/food'
import { errorMessage } from '@/domain/errorMessage'
import {
  draftToCreateParams,
  ingredientDisplay,
  ingredientsToText,
  RECIPE_TAG_OPTIONS,
  scaleDraft,
  SERVING_OPTIONS,
  stepsToText,
  textToIngredients,
  textToSteps,
  type RecipeCreateParams,
  type RecipeDraftData,
} from '@/domain/recipeDraft'
import { normalize } from '@/domain/voiceQuery'
import { proposeAction } from '@/pepa/actions/registry'
import type { ActionProposal } from '@/pepa/actions/types'
import { ingredientsProposalFor } from '@/pepa/kitchen'
import type { RecipeRequest } from '@/pepa/recentContext'
import { AiUnavailableError } from '@/services/aiClient'
import { requestRecipeDraft } from '@/services/recipeGenerate'

// Receta propuesta por la IA — de ofrecerla a guardarla:
//
//   offer      "No tienes esa receta guardada. ¿Quieres que te prepare una?"
//              (aquí se eligen las raciones; la IA solo se llama al aceptar)
//   generating pidiendo la propuesta
//   draft      se enseña; GUARDAR / EDITAR / CANCELAR (las raciones se pueden
//              cambiar y las cantidades se recalculan)
//   edit       corregir cualquier campo antes de guardar
//   saved      guardada; ofrece añadir los ingredientes a la lista de la compra
//   error      la IA ha fallado o la propuesta no era válida: se dice y nada se rompe
//
// Nada se guarda hasta pulsar Guardar, y guardar pasa por la acción recipe.create
// (validación estricta + la función de siempre). Un candado evita que un doble
// toque cree dos recetas.

type Step = 'offer' | 'generating' | 'draft' | 'edit' | 'error' | 'saved'

interface EditFields {
  title: string
  servings: string
  time: string
  ingredients: string
  steps: string
  tags: string[]
}

function aiErrorText(err: unknown): string {
  if (err instanceof AiUnavailableError) {
    if (err.reason === 'ai_disabled' || err.reason === 'purpose_disabled' || err.reason === 'family_disabled') return 'La IA está desactivada ahora mismo.'
    if (err.reason === 'not_adult_account') return 'Solo las cuentas de adultos pueden usar la IA.'
    if (err.reason === 'daily_cap') return 'Se ha alcanzado el límite diario de uso de la IA.'
  }
  return 'No he podido preparar la propuesta.'
}

function tagOptions(current: string[]): string[] {
  return [...new Set([...RECIPE_TAG_OPTIONS, ...current])]
}

export function RecipeDraftSheet({
  request,
  onClose,
  onSaved,
  onOfferIngredients,
}: {
  request: RecipeRequest
  onClose: () => void
  onSaved: (message: string) => void
  onOfferIngredients: (proposal: ActionProposal) => void
}) {
  const [step, setStep] = useState<Step>('offer')
  const [servings, setServings] = useState(request.servings)
  const [draft, setDraft] = useState<RecipeDraftData | null>(null)
  const [viewServings, setViewServings] = useState(request.servings)
  const [fields, setFields] = useState<EditFields | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedTitle, setSavedTitle] = useState('')
  const lockRef = useRef(false)
  const savedRef = useRef(false)

  const servingChoices = [...new Set([...SERVING_OPTIONS, servings])].sort((a, b) => a - b)
  const scaled = draft ? scaleDraft(draft, viewServings) : null

  async function generate() {
    if (lockRef.current) return
    lockRef.current = true
    setError(null)
    setStep('generating')
    try {
      const result = await requestRecipeDraft({ dish: request.dish, servings, preferences: request.preferences })
      setDraft(result)
      setViewServings(result.servings)
      setStep('draft')
    } catch (err) {
      setError(aiErrorText(err))
      setStep('error')
    } finally {
      lockRef.current = false
    }
  }

  async function save(params: RecipeCreateParams) {
    if (lockRef.current || savedRef.current) return
    lockRef.current = true
    setBusy(true)
    setError(null)
    try {
      const recipes = await listRecipes()
      const result = proposeAction('recipe.create', params, { recipes, menuEntries: [], shoppingItemNames: [], members: [], today: new Date() })
      if (!result.ok) throw new Error(result.errors[0])
      const message = await result.proposal.confirm(result.proposal.initialSelection)
      savedRef.current = true
      setSavedTitle(params.title)
      setStep('saved')
      onSaved(message)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la receta'))
    } finally {
      lockRef.current = false
      setBusy(false)
    }
  }

  function startEdit() {
    if (!scaled) return
    setFields({
      title: scaled.title,
      servings: String(scaled.servings),
      time: scaled.timeMinutes === null ? '' : String(scaled.timeMinutes),
      ingredients: ingredientsToText(scaled.ingredients),
      steps: stepsToText(scaled.steps),
      tags: scaled.tags,
    })
    setError(null)
    setStep('edit')
  }

  // Convierte lo escrito en la edición en un borrador; null si no tiene sentido.
  function fieldsToDraft(f: EditFields): RecipeDraftData | null {
    const servingsNumber = Number(f.servings)
    if (!Number.isInteger(servingsNumber) || servingsNumber < 1 || servingsNumber > 20) {
      setError('Las raciones tienen que ser un número entero entre 1 y 20.')
      return null
    }
    const time = f.time.trim() === '' ? null : Number(f.time)
    if (time !== null && (!Number.isInteger(time) || time < 1 || time > 1440)) {
      setError('El tiempo tiene que ser un número de minutos entre 1 y 1440 (o déjalo vacío).')
      return null
    }
    return {
      title: f.title,
      servings: servingsNumber,
      timeMinutes: time,
      ingredients: textToIngredients(f.ingredients),
      steps: textToSteps(f.steps),
      tags: f.tags,
    }
  }

  function backFromEdit() {
    if (!fields) return
    const next = fieldsToDraft(fields)
    if (!next) return
    setError(null)
    setDraft(next)
    setViewServings(next.servings)
    setStep('draft')
  }

  function saveFromEdit() {
    if (!fields) return
    const next = fieldsToDraft(fields)
    if (!next) return
    void save(draftToCreateParams(next))
  }

  async function offerIngredients() {
    if (lockRef.current) return
    lockRef.current = true
    setBusy(true)
    setError(null)
    try {
      const recipes = await listRecipes()
      const created = [...recipes].reverse().find((r) => normalize(r.title).trim() === normalize(savedTitle).trim())
      if (!created) throw new Error('No encuentro la receta que se acaba de guardar.')
      const outcome = await ingredientsProposalFor(created, recipes, new Date())
      if (outcome.kind !== 'proposal') throw new Error(outcome.text)
      onOfferIngredients(outcome.proposal)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo preparar la lista de la compra'))
      lockRef.current = false
      setBusy(false)
    }
  }

  const canDismiss = step !== 'generating' && !busy

  return (
    <div className="modal-overlay action-confirm-overlay" onClick={canDismiss ? onClose : undefined}>
      <div className="modal-sheet" role="dialog" aria-label={`Receta de ${request.dish}`} onClick={(e) => e.stopPropagation()}>
        {step === 'offer' && (
          <>
            <h3 style={{ margin: '0 0 8px' }}>🍲 {request.dish}</h3>
            <p style={{ margin: '4px 0' }}>No tienes esa receta guardada. ¿Quieres que te prepare una?</p>
            {request.preferences.length > 0 && <p className="muted">Teniendo en cuenta: {request.preferences.join(', ')}.</p>}
            <div className="action-confirm-choice">
              <span className="muted">¿Para cuántas raciones?</span>
              <div className="filter-row" role="radiogroup" aria-label="Raciones">
                {servingChoices.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={servings === n}
                    className={`chip${servings === n ? ' chip-active' : ''}`}
                    onClick={() => setServings(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              A la IA solo se le envía el nombre del plato, las raciones y esas preferencias. La receta se te enseña antes de guardarla.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={generate} style={{ flex: 1 }}>
                Sí, prepárala
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                No, gracias
              </button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <>
            <h3 style={{ margin: '0 0 8px' }}>🍲 {request.dish}</h3>
            <p className="muted">Preparando la propuesta para {servings} raciones…</p>
          </>
        )}

        {step === 'error' && (
          <>
            <h3 style={{ margin: '0 0 8px' }}>🍲 {request.dish}</h3>
            <p className="error">{error}</p>
            <p className="muted">Puedes intentarlo de nuevo, o crear la receta a mano en Cocina.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={generate} style={{ flex: 1 }}>
                Intentarlo de nuevo
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        )}

        {step === 'draft' && scaled && (
          <>
            <h3 style={{ margin: '0 0 4px' }}>📖 {scaled.title}</h3>
            <p className="muted" style={{ margin: '0 0 8px' }}>
              {scaled.timeMinutes !== null ? `⏱ ${scaled.timeMinutes} min aproximados · ` : ''}
              {scaled.tags.join(', ')}
            </p>
            <p className="action-confirm-warning">🤖 Receta preparada por IA: revísala antes de guardar.</p>
            <div className="action-confirm-choice">
              <span className="muted">Raciones</span>
              <div className="filter-row" role="radiogroup" aria-label="Raciones">
                {[...new Set([...SERVING_OPTIONS, viewServings])]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={viewServings === n}
                      className={`chip${viewServings === n ? ' chip-active' : ''}`}
                      onClick={() => setViewServings(n)}
                    >
                      {n}
                    </button>
                  ))}
              </div>
            </div>
            <h4 style={{ margin: '12px 0 4px' }}>Ingredientes</h4>
            <ul className="recipe-draft-list">
              {scaled.ingredients.map((ing, i) => (
                <li key={`${ing.name}-${i}`}>{ingredientDisplay(ing)}</li>
              ))}
            </ul>
            <h4 style={{ margin: '12px 0 4px' }}>Preparación</h4>
            <ol className="recipe-draft-list">
              {scaled.steps.map((text, i) => (
                <li key={i}>{text}</li>
              ))}
            </ol>
            {error && <p className="error">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <button type="button" onClick={() => void save(draftToCreateParams(scaled))} disabled={busy} style={{ flex: 1 }}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="link-button" onClick={startEdit} disabled={busy}>
                Editar
              </button>
              <button type="button" className="link-button" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {step === 'edit' && fields && (
          <>
            <h3 style={{ margin: '0 0 8px' }}>✏️ Editar receta</h3>
            <label className="recipe-draft-field">
              Nombre
              <input type="text" value={fields.title} onChange={(e) => setFields({ ...fields, title: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label className="recipe-draft-field" style={{ flex: 1 }}>
                Raciones
                <input type="number" min={1} max={20} value={fields.servings} onChange={(e) => setFields({ ...fields, servings: e.target.value })} />
              </label>
              <label className="recipe-draft-field" style={{ flex: 1 }}>
                Minutos
                <input type="number" min={1} max={1440} value={fields.time} onChange={(e) => setFields({ ...fields, time: e.target.value })} />
              </label>
            </div>
            <label className="recipe-draft-field">
              Ingredientes (uno por línea: nombre, cantidad, unidad — decimales con punto)
              <textarea rows={7} value={fields.ingredients} onChange={(e) => setFields({ ...fields, ingredients: e.target.value })} />
            </label>
            <label className="recipe-draft-field">
              Pasos (uno por línea)
              <textarea rows={8} value={fields.steps} onChange={(e) => setFields({ ...fields, steps: e.target.value })} />
            </label>
            <span className="muted">Etiquetas</span>
            <div className="filter-row">
              {tagOptions(fields.tags).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`chip${fields.tags.includes(tag) ? ' chip-active' : ''}`}
                  onClick={() => setFields({ ...fields, tags: fields.tags.includes(tag) ? fields.tags.filter((t) => t !== tag) : [...fields.tags, tag].slice(0, 3) })}
                >
                  {tag}
                </button>
              ))}
            </div>
            {error && <p className="error">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <button type="button" onClick={saveFromEdit} disabled={busy} style={{ flex: 1 }}>
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
              <button type="button" className="link-button" onClick={backFromEdit} disabled={busy}>
                Volver
              </button>
              <button type="button" className="link-button" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {step === 'saved' && (
          <>
            <h3 style={{ margin: '0 0 8px' }}>✅ Receta guardada</h3>
            <p style={{ margin: '4px 0' }}>«{savedTitle}» ya está en tus recetas.</p>
            <p style={{ margin: '8px 0' }}>¿Quieres añadir los ingredientes a la lista de la compra?</p>
            {error && <p className="error">{error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={offerIngredients} disabled={busy} style={{ flex: 1 }}>
                Sí, añadirlos
              </button>
              <button type="button" className="link-button" onClick={onClose} disabled={busy}>
                No, gracias
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
