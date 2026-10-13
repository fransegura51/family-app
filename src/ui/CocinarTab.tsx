import { useEffect, useRef, useState } from 'react'
import { describeCookIdeas, parseIngredientList, type CookIdeaData } from '@/domain/cookIdeas'
import { errorMessage } from '@/domain/errorMessage'
import type { Recipe } from '@/domain/types'
import { handleDialogReply } from '@/pepa/dialog'
import { latestCookIdeas, onCookIdeas, rememberCookIdeas, type CookIdeasResult } from '@/pepa/cookIdeasStore'
import { ingredientsFlowFor, type KitchenOutcome } from '@/pepa/kitchen'
import type { ActionProposal } from '@/pepa/actions/types'
import type { RecipeRequest } from '@/pepa/recentContext'
import { AiUnavailableError } from '@/services/aiClient'
import { isDictationSupported, listenContinuous, speakAsync, type ListenSession } from '@/services/voice'
import { requestCookIdeas } from '@/services/whatToCook'
import { showToast } from '@/state/toast'
import { ActionConfirmSheet } from '@/ui/ActionConfirmSheet'
import { RecipeDraftSheet } from '@/ui/RecipeDraftSheet'
import { StoreQuestionSheet } from '@/ui/StoreQuestionSheet'
import { listRecipes } from '@/data/food'

// «¿Qué cocino hoy?» — La cocina de Pepa. La persona dice o escribe lo que tiene en casa («pepino, lechuga y tomate», «lentejas y calabacín») y la IA propone
// hasta 3 platos que se pueden hacer con ello, cada uno con su receta completa. Se pueden escuchar en voz alta y guardar en Recetas (con la tarjeta de
// siempre: revisar, cambiar raciones, editar y guardar; después se ofrece añadir los ingredientes a la compra). Pepa también lo hace por voz desde
// «Hablar con PEPA» («tengo pepino, lechuga y tomate, ¿qué puedo cocinar?») y deja aquí las ideas.
//
// Nada se guarda sin que la persona lo decida. A la IA solo viajan los ingredientes y las raciones (services/whatToCook.ts).

const SERVING_CHOICES = [1, 2, 3, 4, 5, 6, 8]

function aiErrorText(err: unknown): string {
  if (err instanceof AiUnavailableError) {
    if (err.reason === 'ai_disabled' || err.reason === 'purpose_disabled' || err.reason === 'family_disabled') return 'La IA está desactivada ahora mismo.'
    if (err.reason === 'not_adult_account') return 'Solo las cuentas de adultos pueden usar la IA.'
    if (err.reason === 'daily_cap') return 'Se ha alcanzado el límite diario de uso de la IA.'
  }
  return 'No he podido preparar ideas ahora mismo. Inténtalo de nuevo en un momento.'
}

export function CocinarTab() {
  const [text, setText] = useState('')
  const [servings, setServings] = useState(4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CookIdeasResult | null>(() => latestCookIdeas())
  const [recipeRequest, setRecipeRequest] = useState<RecipeRequest | null>(null)
  const [followProposal, setFollowProposal] = useState<ActionProposal | null>(null)
  const [followStore, setFollowStore] = useState<{ recipe: Recipe; recipes: Recipe[]; stores: string[] } | null>(null)
  const [listening, setListening] = useState(false)
  const sessionRef = useRef<ListenSession | null>(null)
  const lockRef = useRef(false)

  // Si Pepa acaba de contar ideas por voz, aquí aparecen (y los ingredientes se rellenan).
  useEffect(
    () =>
      onCookIdeas(() => {
        const latest = latestCookIdeas()
        if (!latest) return
        setResult(latest)
        setText(latest.ingredients.join(', '))
        setServings(latest.servings)
      }),
    [],
  )
  useEffect(() => {
    const latest = latestCookIdeas()
    if (latest) {
      setText(latest.ingredients.join(', '))
      setServings(latest.servings)
    }
    return () => sessionRef.current?.stop()
  }, [])

  function toggleListening() {
    if (listening) {
      sessionRef.current?.stop()
      sessionRef.current = null
      setListening(false)
      return
    }
    setError(null)
    setListening(true)
    sessionRef.current = listenContinuous({
      onTranscript: (spoken) => setText(spoken),
      onError: (message) => {
        setError(message)
        setListening(false)
        sessionRef.current = null
      },
    })
  }

  async function search() {
    if (lockRef.current) return
    sessionRef.current?.stop()
    sessionRef.current = null
    setListening(false)
    const ingredients = parseIngredientList(text)
    if (ingredients.length === 0) {
      setError('Escribe o di qué ingredientes tienes, por ejemplo: «pepino, lechuga y tomate».')
      return
    }
    lockRef.current = true
    setBusy(true)
    setError(null)
    try {
      const ideas = await requestCookIdeas({ ingredients, servings, preferences: [] })
      const next = { ingredients, servings, ideas }
      rememberCookIdeas(next)
      setResult(next)
    } catch (err) {
      setError(aiErrorText(err))
    } finally {
      lockRef.current = false
      setBusy(false)
    }
  }

  function openIdea(idea: CookIdeaData) {
    setRecipeRequest({ dish: idea.title, servings: idea.recipe.servings, preferences: [], draft: idea.recipe })
  }

  function followUp(outcome: KitchenOutcome) {
    setRecipeRequest(null)
    if (outcome.kind === 'proposal') setFollowProposal(outcome.proposal)
    else if (outcome.kind === 'store-question') setFollowStore({ recipe: outcome.recipe, recipes: outcome.recipes, stores: outcome.stores })
    else if (outcome.kind === 'answer') showToast(outcome.text, 4000)
  }

  async function chooseStore(store: string | null): Promise<string | null> {
    if (!followStore) return null
    try {
      const recipes = followStore.recipes.length > 0 ? followStore.recipes : await listRecipes()
      const outcome = await ingredientsFlowFor(followStore.recipe, recipes, new Date(), { conversation: true, store })
      setFollowStore(null)
      if (outcome.kind === 'proposal') setFollowProposal(outcome.proposal)
      return outcome.text
    } catch (err) {
      showToast(errorMessage(err, 'No he podido preparar los ingredientes.'), 4000)
      return null
    }
  }

  const replyToSheet = async (reply: string): Promise<string | null> => {
    const handled = await handleDialogReply(reply)
    return handled.handled ? handled.message ?? null : 'Usa los botones de la tarjeta.'
  }

  return (
    <div>
      <div className="card member-form">
        <h2>🥘 ¿Qué cocino hoy?</h2>
        <p className="muted">Dime qué ingredientes tienes en casa y te propongo qué puedes cocinar, con su receta para guardarla.</p>
        <label>
          Tengo…
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="pepino, lechuga, tomate…  o  lentejas y calabacín"
            disabled={busy}
          />
        </label>
        <div className="inline-fields" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            Para
            <select value={servings} onChange={(e) => setServings(Number(e.target.value))} disabled={busy}>
              {SERVING_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'persona' : 'personas'}
                </option>
              ))}
            </select>
          </label>
          {isDictationSupported() && (
            <button type="button" className="link-button" onClick={toggleListening} disabled={busy}>
              {listening ? '⏹️ Parar de escuchar' : '🎤 Decirlo con la voz'}
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <button type="button" onClick={() => void search()} disabled={busy || text.trim() === ''}>
          {busy ? 'Pensando qué puedes cocinar…' : '🍳 ¿Qué puedo cocinar?'}
        </button>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          También puedes decírselo a Pepa: «tengo pepino, lechuga y tomate, ¿qué puedo cocinar?». Usa la IA (solo cuentas de adultos).
        </p>
      </div>

      {result && (
        <div className="event-list" style={{ marginTop: 12 }}>
          <div className="inline-fields" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              Con {result.ingredients.slice(0, 5).join(', ')}
              {result.ingredients.length > 5 ? ' y más' : ''} puedes hacer:
            </h3>
            <button type="button" className="link-button" onClick={() => void speakAsync(describeCookIdeas(result.ingredients, result.ideas))}>
              🔊 Escuchar
            </button>
          </div>
          {result.ideas.map((idea, index) => (
            <div key={`${idea.title}-${index}`} className="card" style={{ marginTop: 8 }}>
              <strong>
                {index + 1}. {idea.title}
              </strong>
              {idea.recipe.timeMinutes ? <span className="muted"> · {idea.recipe.timeMinutes} min</span> : null}
              {idea.summary && <p style={{ margin: '4px 0' }}>{idea.summary}</p>}
              {idea.missing.length > 0 && <p className="muted" style={{ margin: '4px 0' }}>Te faltaría: {idea.missing.join(', ')}.</p>}
              <button type="button" onClick={() => openIdea(idea)}>
                📖 Ver la receta y guardarla
              </button>
            </div>
          ))}
        </div>
      )}

      {recipeRequest && (
        <RecipeDraftSheet
          request={recipeRequest}
          onClose={() => setRecipeRequest(null)}
          onReply={replyToSheet}
          onSaved={(message) => showToast(`✅ ${message}`, 4000)}
          onFollowUp={followUp}
        />
      )}

      {followStore && (
        <StoreQuestionSheet
          recipeTitle={followStore.recipe.title}
          stores={followStore.stores}
          onChoose={chooseStore}
          onCancel={() => setFollowStore(null)}
          onReply={replyToSheet}
        />
      )}

      {followProposal && (
        <ActionConfirmSheet
          proposal={followProposal}
          onReply={replyToSheet}
          onCancel={() => setFollowProposal(null)}
          onDone={(message) => {
            setFollowProposal(null)
            showToast(`✅ ${message}`, 4000)
          }}
        />
      )}
    </div>
  )
}
