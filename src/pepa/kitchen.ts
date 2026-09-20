// Cocina para Pepa, solo con reglas y los datos que ya existen (recetas y
// menú semanal; no hay inventario). Consultar responde sin confirmar;
// cualquier cosa que escriba se convierte en una propuesta que el usuario
// tiene que confirmar en la tarjeta (ver pepa/actions).
import { listFamilyMembers } from '@/data/family'
import { listMenuEntries, listRecipes } from '@/data/food'
import { listShoppingItems } from '@/data/shopping'
import { listShoppingStores } from '@/data/shoppingStores'
import { buildMenuAnswer, findRecipeMatches, MEAL_LABELS } from '@/domain/kitchenMenu'
import { kitchenDateLabel, parseKitchenIntent, type KitchenIntent } from '@/domain/kitchenQuery'
import { extractTrailingStore } from '@/domain/talkParse'
import type { MealType, MenuEntry, Recipe } from '@/domain/types'
import { findKnownStore, normalize } from '@/domain/voiceQuery'
import { proposeAction } from '@/pepa/actions/registry'
import type { ActionContext, ActionProposal } from '@/pepa/actions/types'
import { pendingRecipeRequest, recentRecipeIds, rememberRecipeRequest, rememberRecipes, type RecipeRequest } from '@/pepa/recentContext'

export type KitchenOutcome =
  | { kind: 'answer'; text: string }
  | { kind: 'proposal'; text: string; proposal: ActionProposal }
  // "No tienes esa receta guardada. ¿Quieres que te prepare una?": abre la tarjeta de receta propuesta.
  | { kind: 'recipe-offer'; text: string; request: RecipeRequest }
  // "¿En qué tienda quieres añadirlos?": ofrece las tiendas REALES de la familia y "sin tienda".
  | { kind: 'store-question'; text: string; recipe: Recipe; recipes: Recipe[]; stores: string[] }

function pickDefaultMeal(entries: MenuEntry[], date: string): MealType {
  const busy = (meal: MealType) => entries.some((e) => e.entryDate === date && e.mealType === meal)
  return (['comida', 'cena'] as MealType[]).find((m) => !busy(m)) ?? 'comida'
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

async function handleMenuQuery(intent: Extract<KitchenIntent, { kind: 'menu_query' }>, today: Date): Promise<KitchenOutcome> {
  const [entries, recipes] = await Promise.all([listMenuEntries(intent.date, intent.date), listRecipes()])
  const answer = buildMenuAnswer({ date: intent.date, meals: intent.meals, entries, recipes, today })
  rememberRecipes(answer.recipeIds)
  return { kind: 'answer', text: answer.text }
}

async function handleMenuSet(intent: Extract<KitchenIntent, { kind: 'menu_set' }>, today: Date): Promise<KitchenOutcome | null> {
  const recipes = await listRecipes()
  const matches = findRecipeMatches(intent.dish, recipes)
  // Sin comida ni "menú" en la frase, solo es de Cocina si de verdad
  // coincide con una receta: "pon dentista el viernes" sigue siendo del
  // calendario.
  if (!intent.explicit && !matches.some((m) => m.score >= 2)) return null

  const entries = await listMenuEntries(intent.date, intent.date)
  const context: ActionContext = { recipes, menuEntries: entries, shoppingItemNames: [], members: [], today }
  const best = matches[0]?.recipe ?? null
  const dishText = capitalize(intent.dish)
  const result = proposeAction(
    'menu.set',
    {
      date: intent.date,
      mealType: intent.meal ?? pickDefaultMeal(entries, intent.date),
      recipeId: best?.id ?? null,
      dishText,
      alternatives: matches.map((m) => m.recipe.id),
    },
    context,
  )
  if (!result.ok) return { kind: 'answer', text: `No he podido preparar eso: ${result.errors[0]}` }
  const meal = MEAL_LABELS[intent.meal ?? pickDefaultMeal(entries, intent.date)]
  return {
    kind: 'proposal',
    proposal: result.proposal,
    text: `Voy a apuntar «${best?.title ?? dishText}» ${kitchenDateLabel(intent.date, today)}, en la ${meal}. Revísalo en la tarjeta y pulsa Guardar.`,
  }
}

// Tienda al añadir ingredientes (solo con "Hablar con PEPA"):
//   undefined = no se ha dicho -> se pregunta (si la familia tiene tiendas dadas de alta)
//   texto     = la tienda dicha ("a Mercadona")
//   null      = "sin tienda"
// Nunca se deduce una tienda por compras anteriores ni se inventa un nombre.
export type StoreSpec = string | null | undefined

export async function registeredStoreNames(): Promise<string[]> {
  try {
    return (await listShoppingStores()).map((s) => s.name)
  } catch {
    return []
  }
}

// `unknown`: una tienda dicha que la familia NO tiene dada de alta: no se da por buena.
async function detectStoreInText(text: string): Promise<{ store: StoreSpec; text: string; unknown?: string }> {
  const known = findKnownStore(text, await registeredStoreNames())
  if (known) return { store: known.store, text: known.text }
  if (/\bsin tienda\b/.test(normalize(text))) return { store: null, text: text.replace(/sin tienda/i, ' ') }
  let memberNames: string[] = []
  try {
    memberNames = (await listFamilyMembers()).map((m) => m.name)
  } catch {
    // sin nombres: solo se pierde el filtro de "a Eric"
  }
  const trailing = extractTrailingStore(text, memberNames)
  return trailing.store ? { store: undefined, text: trailing.text, unknown: trailing.store } : { store: undefined, text }
}

interface IngredientsOptions {
  conversation: boolean
  store: StoreSpec
  unknownStore?: string
}

async function handleIngredients(
  intent: Extract<KitchenIntent, { kind: 'ingredients' }>,
  today: Date,
  opts: IngredientsOptions = { conversation: false, store: undefined },
): Promise<KitchenOutcome> {
  const recipes = await listRecipes()
  let candidates: Recipe[] = []

  if (intent.recipeText) {
    const matches = findRecipeMatches(intent.recipeText, recipes)
    if (matches.length === 0) return { kind: 'answer', text: `No encuentro ninguna receta que se parezca a «${intent.recipeText}».` }
    // Si hay una mejor claramente, esa; si no, pregunta.
    candidates = matches[0].score > (matches[1]?.score ?? 0) || matches.length === 1 ? [matches[0].recipe] : matches.slice(0, 3).map((m) => m.recipe)
  } else if (intent.date) {
    const entries = await listMenuEntries(intent.date, intent.date)
    const ids = entries.filter((e) => e.recipeId && (!intent.meal || e.mealType === intent.meal)).map((e) => e.recipeId as string)
    candidates = recipes.filter((r) => new Set(ids).has(r.id))
    if (candidates.length === 0) {
      const what = intent.meal ? `para ${intent.meal === 'desayuno' ? 'el' : 'la'} ${MEAL_LABELS[intent.meal]} ` : ''
      return { kind: 'answer', text: `No hay ninguna receta apuntada ${what}${kitchenDateLabel(intent.date, today)}.` }
    }
  } else {
    const ids = new Set(recentRecipeIds())
    candidates = recipes.filter((r) => ids.has(r.id))
    if (candidates.length === 0) {
      return { kind: 'answer', text: '¿De qué receta? Dime, por ejemplo: «añade los ingredientes de la tortilla a la compra».' }
    }
  }

  if (candidates.length > 1) {
    return { kind: 'answer', text: `Tengo varias recetas posibles: ${candidates.map((r) => r.title).join(', ')}. Dime de cuál.` }
  }
  return ingredientsFlowFor(candidates[0], recipes, today, opts)
}

// Con conversación y sin tienda dicha: pregunta la tienda (si hay tiendas dadas de alta;
// si no hay ninguna, no hay nada que elegir y se sigue sin tienda, como siempre).
export async function ingredientsFlowFor(
  recipe: Recipe,
  recipes: Recipe[],
  today: Date,
  opts: IngredientsOptions & { intro?: string },
): Promise<KitchenOutcome> {
  if (recipe.ingredients.length === 0) return { kind: 'answer', text: `«${recipe.title}» no tiene ingredientes apuntados.` }
  if (opts.conversation && opts.store === undefined) {
    const stores = await registeredStoreNames()
    if (stores.length > 0) {
      rememberRecipes([recipe.id])
      const prefix = opts.unknownStore ? `No tengo ninguna tienda llamada «${opts.unknownStore}». ` : ''
      return { kind: 'store-question', text: `${prefix}¿En qué tienda quieres añadirlos?`, recipe, recipes, stores }
    }
  }
  return ingredientsProposalFor(recipe, recipes, today, opts.intro, opts.store ?? null, opts.conversation)
}

// La tarjeta de ingredientes → compra de una receta que ya existe (la de siempre).
// `withStoreChoice`: solo en conversación, la tarjeta ofrece elegir entre las tiendas reales.
export async function ingredientsProposalFor(
  recipe: Recipe,
  recipes: Recipe[],
  today: Date,
  intro?: string,
  store: string | null = null,
  withStoreChoice = false,
): Promise<KitchenOutcome> {
  if (recipe.ingredients.length === 0) return { kind: 'answer', text: `«${recipe.title}» no tiene ingredientes apuntados.` }

  const items = await listShoppingItems()
  const shoppingItemNames = items.filter((i) => i.status !== 'comprado').map((i) => i.name)
  const context: ActionContext = {
    recipes,
    menuEntries: [],
    shoppingItemNames,
    members: [],
    ...(withStoreChoice ? { storeNames: await registeredStoreNames() } : {}),
    today,
  }
  const params: Record<string, unknown> = { recipeId: recipe.id, ingredientIds: recipe.ingredients.map((i) => i.id) }
  if (store !== null || withStoreChoice) params.store = store
  const result = proposeAction('menu.ingredients_to_shopping', params, context)
  if (!result.ok) return { kind: 'answer', text: `No he podido preparar eso: ${result.errors[0]}` }
  rememberRecipes([recipe.id])
  return {
    kind: 'proposal',
    proposal: result.proposal,
    text:
      intro ??
      `Voy a añadir a la lista de la compra${store ? ` (${store})` : ''} los ingredientes de «${recipe.title}». Revisa cuáles en la tarjeta y pulsa Añadir.`,
  }
}

// Raciones por defecto cuando no se dicen: las personas de la familia (entre 2 y 8).
// Es solo un número; se puede cambiar antes de pedir y antes de guardar.
const FALLBACK_SERVINGS = 4
async function defaultServings(): Promise<number> {
  try {
    const members = await listFamilyMembers()
    return members.length >= 2 ? Math.min(8, members.length) : FALLBACK_SERVINGS
  } catch {
    return FALLBACK_SERVINGS
  }
}

// "Quiero hacer lentejas con chorizo y no tengo la receta": primero busca entre las
// recetas de la familia; solo si no hay ninguna que encaje se ofrece prepararla con IA
// (y la IA solo se llama cuando la persona acepta en la tarjeta).
async function handleRecipeRequest(intent: Extract<KitchenIntent, { kind: 'recipe_request' }>, today: Date): Promise<KitchenOutcome> {
  const recipes = await listRecipes()
  const best = findRecipeMatches(intent.dish, recipes).find((m) => m.score >= 2)
  if (best) {
    return ingredientsFlowFor(best.recipe, recipes, today, {
      conversation: true,
      store: undefined,
      intro: `Ya tienes «${best.recipe.title}» en tus recetas. Si quieres, añade sus ingredientes a la lista de la compra desde la tarjeta.`,
    })
  }
  const request: RecipeRequest = { dish: intent.dish, servings: intent.servings ?? (await defaultServings()), preferences: intent.preferences }
  rememberRecipeRequest(request)
  return { kind: 'recipe-offer', request, text: 'No tienes esa receta guardada. ¿Quieres que te prepare una?' }
}

// "Somos dos": solo cuenta si hay una petición de receta reciente.
function handleServingsOnly(intent: Extract<KitchenIntent, { kind: 'servings_only' }>): KitchenOutcome | null {
  const pending = pendingRecipeRequest()
  if (!pending) return null
  const request: RecipeRequest = { ...pending, servings: intent.servings }
  rememberRecipeRequest(request)
  return { kind: 'recipe-offer', request, text: `Vale, para ${intent.servings}. ¿Quieres que te prepare la receta de «${request.dish}»?` }
}

// mode 'ask': viene de un botón "🐣 Pepa" (solo preguntas) — solo se
// contestan consultas; cualquier otra cosa sigue su camino de siempre.
// mode 'create': viene de un botón "🎤 Apuntar" — además, lo que escribiría
// se prepara como propuesta.
// Devuelve null si la frase no es de Cocina: todo sigue como antes.
//
// options.recipeRequests: solo el botón "Hablar con PEPA" lo activa; con los botones de
// siempre las peticiones de receta no se tratan (se comportan como antes).
export async function handleKitchenText(
  text: string,
  mode: 'ask' | 'create',
  today: Date = new Date(),
  options: { recipeRequests?: boolean; conversation?: boolean } = {},
): Promise<KitchenOutcome | null> {
  // Con conversación, una tienda dicha en la frase ("...a Mercadona") se separa antes de
  // interpretar la receta, y decide si hace falta preguntar la tienda.
  let parseText = text
  let storeSpec: StoreSpec = undefined
  let unknownStore: string | undefined
  if (options.conversation && mode !== 'ask' && /ingredientes/.test(normalize(text))) {
    const detected = await detectStoreInText(text)
    storeSpec = detected.store
    unknownStore = detected.unknown
    parseText = detected.text
  }
  const intent = parseKitchenIntent(parseText, today)
  if (!intent) return null
  if (intent.kind === 'menu_query') return handleMenuQuery(intent, today)
  if (intent.kind === 'recipe_request' || intent.kind === 'servings_only') {
    if (!options.recipeRequests) return null
    return intent.kind === 'recipe_request' ? handleRecipeRequest(intent, today) : handleServingsOnly(intent)
  }
  if (mode === 'ask') return null
  return intent.kind === 'menu_set' ? handleMenuSet(intent, today) : handleIngredients(intent, today, { conversation: !!options.conversation, store: storeSpec, unknownStore })
}
