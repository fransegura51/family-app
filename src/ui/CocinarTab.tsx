import { useEffect, useRef, useState } from 'react'
import { draftFromImportedRecipe, findRecipesWithIngredients } from '@/domain/cookFromSaved'
import { describeCookIdeas, parseIngredientList, type CookIdeaData } from '@/domain/cookIdeas'
import { errorMessage } from '@/domain/errorMessage'
import type { Recipe } from '@/domain/types'
import { handleDialogReply } from '@/pepa/dialog'
import { latestCookIdeas, onCookIdeas, rememberCookIdeas, type CookIdeasResult, type WebRecipeHit } from '@/pepa/cookIdeasStore'
import { ingredientsFlowFor, type KitchenOutcome } from '@/pepa/kitchen'
import type { ActionProposal } from '@/pepa/actions/types'
import type { RecipeRequest } from '@/pepa/recentContext'
import { AiUnavailableError } from '@/services/aiClient'
import { searchCookpadRecipes } from '@/services/cookpadSearch'
import { importRecipeFromUrl } from '@/services/recipeUrlImport'
import { isDictationSupported, listenContinuous, speakAsync, type ListenSession } from '@/services/voice'
import { requestCookIdeas } from '@/services/whatToCook'
import { showToast } from '@/state/toast'
import { ActionConfirmSheet } from '@/ui/ActionConfirmSheet'
import { RecipeDraftSheet } from '@/ui/RecipeDraftSheet'
import { StoreQuestionSheet } from '@/ui/StoreQuestionSheet'
import { listRecipes } from '@/data/food'

// «¿Qué cocino hoy?» — La cocina de Pepa. La persona dice o escribe lo que tiene en casa («pepino, lechuga y tomate», «lentejas y calabacín») y:
//   1. PRIMERO se buscan, sin IA y sin coste, sus recetas ya guardadas que se pueden hacer con eso (domain/cookFromSaved.ts) y recetas de internet
//      (Cookpad, también gratis; se pueden guardar en Recetas con la tarjeta de siempre);
//   2. y, SOLO si la persona lo pide con el botón, la IA propone hasta 3 platos con su receta completa, que se pueden guardar en Recetas con la tarjeta de siempre
//      (revisar, cambiar raciones, editar y guardar; después se ofrece añadir los ingredientes a la compra).
// Pepa también lo hace por voz desde «Hablar con PEPA» («tengo pepino, lechuga y tomate, ¿qué puedo cocinar?») y deja aquí lo que cuenta.
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

export function CocinarTab({ onOpenRecipes }: { onOpenRecipes?: () => void }) {
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

  // Si Pepa acaba de contar algo por voz, aquí aparece (y los ingredientes se rellenan).
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

  function stopListening() {
    sessionRef.current?.stop()
    sessionRef.current = null
    setListening(false)
  }

  // Paso 1, gratis: las recetas ya guardadas que se pueden hacer con lo que hay.
  async function searchSaved() {
    if (lockRef.current) return
    stopListening()
    const ingredients = parseIngredientList(text)
    if (ingredients.length === 0) {
      setError('Escribe o di qué ingredientes tienes, por ejemplo: «pepino, lechuga y tomate».')
      return
    }
    lockRef.current = true
    setBusy(true)
    setError(null)
    try {
      // Recetas guardadas + internet (Cookpad), a la vez y gratis; si internet falla, se sigue con lo guardado.
      const [recipes, web] = await Promise.all([listRecipes(), searchCookpadRecipes(ingredients.slice(0, 3).join(' ')).catch(() => [] as WebRecipeHit[])])
      const saved = findRecipesWithIngredients(ingredients, recipes)
      const next: CookIdeasResult = { ingredients, servings, ideas: [], saved, web: web.filter((w) => w.title && w.url).slice(0, 5) }
      rememberCookIdeas(next)
      setResult(next)
    } catch (err) {
      setError(errorMessage(err, 'No he podido mirar tus recetas ahora mismo.'))
    } finally {
      lockRef.current = false
      setBusy(false)
    }
  }

  // Paso 2, con IA: solo si la persona lo pide.
  async function askAi() {
    if (lockRef.current || !result) return
    lockRef.current = true
    setBusy(true)
    setError(null)
    try {
      const ideas = await requestCookIdeas({ ingredients: result.ingredients, servings, preferences: [] })
      const next: CookIdeasResult = { ...result, servings, ideas }
      rememberCookIdeas(next)
      setResult(next)
    } catch (err) {
      setError(aiErrorText(err))
    } finally {
      lockRef.current = false
      setBusy(false)
    }
  }

  // Receta de internet → se lee su ficha (sin IA), se convierte en borrador y se revisa/guarda con la tarjeta de siempre.
  async function saveWeb(hit: WebRecipeHit) {
    if (lockRef.current) return
    lockRef.current = true
    setBusy(true)
    setError(null)
    try {
      const imported = await importRecipeFromUrl(hit.url)
      if (imported.ingredients.length === 0 || !imported.instructions.trim()) {
        setError('Esa página no trae la receta completa en un formato que se pueda leer. Ábrela con «Ver» y cópiala a mano si te gusta.')
        return
      }
      const draft = draftFromImportedRecipe({ ...imported, title: imported.title || hit.title }, servings)
      setRecipeRequest({ dish: draft.title, servings: draft.servings, preferences: [], draft })
    } catch (err) {
      setError(errorMessage(err, 'No he podido leer esa receta.'))
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
        <p className="muted">Dime qué ingredientes tienes en casa y miro qué puedes cocinar con tus recetas guardadas y con recetas de internet. Si quieres más ideas, se las pido a la IA.</p>
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
        <button type="button" onClick={() => void searchSaved()} disabled={busy || text.trim() === ''}>
          🔍 Buscar qué cocinar (gratis)
        </button>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          También puedes decírselo a Pepa: «tengo pepino, lechuga y tomate, ¿qué puedo cocinar?». Buscar en tus recetas y en internet es gratis; la IA solo se usa si pulsas su botón (solo cuentas de adultos).
        </p>
      </div>

      {result && (
        <div className="event-list" style={{ marginTop: 12 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            📖 De tus recetas guardadas
          </h3>
          {result.saved.length === 0 && (
            <p className="muted">
              No tienes ninguna receta guardada que se pueda hacer con {result.ingredients.slice(0, 5).join(', ')}
              {result.ingredients.length > 5 ? ' y más' : ''}.
            </p>
          )}
          {result.saved.map((match) => (
            <div key={match.recipe.id} className="card" style={{ marginTop: 8 }}>
              <strong>{match.recipe.title}</strong>
              <p className="muted" style={{ margin: '4px 0' }}>
                Usa: {match.have.join(', ')}. {match.missing.length === 0 ? '✅ Tienes todo lo necesario.' : `Te faltaría: ${match.missing.join(', ')}.`}
              </p>
              {onOpenRecipes && (
                <button type="button" className="link-button" onClick={onOpenRecipes}>
                  Abrir mis recetas
                </button>
              )}
            </div>
          ))}

          <h3 className="section-title" style={{ margin: '12px 0 0' }}>
            🌐 Recetas de internet (gratis)
          </h3>
          {result.web.length === 0 && <p className="muted">No he encontrado recetas en internet con eso ahora mismo.</p>}
          {result.web.map((hit) => (
            <div key={hit.id || hit.url} className="card" style={{ marginTop: 8 }}>
              <strong>{hit.title}</strong>
              <div className="inline-fields" style={{ marginTop: 6 }}>
                <a className="link-button" href={hit.url} target="_blank" rel="noopener noreferrer">
                  🔗 Ver
                </a>
                <button type="button" className="link-button" onClick={() => void saveWeb(hit)} disabled={busy}>
                  💾 Guardar en mis recetas
                </button>
              </div>
            </div>
          ))}

          <div className="inline-fields" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <h3 className="section-title" style={{ margin: 0 }}>
              💡 Ideas de la IA
            </h3>
            {result.ideas.length > 0 && (
              <button type="button" className="link-button" onClick={() => void speakAsync(describeCookIdeas(result.ingredients, result.ideas))}>
                🔊 Escuchar
              </button>
            )}
          </div>
          {result.ideas.length === 0 && (
            <button type="button" onClick={() => void askAi()} disabled={busy}>
              {busy ? 'Pensando qué puedes cocinar…' : '💡 Pedir ideas a la IA'}
            </button>
          )}
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
