// Cocina para Pepa, solo con reglas y los datos que ya existen (recetas y
// menú semanal; no hay inventario). Consultar responde sin confirmar;
// cualquier cosa que escriba se convierte en una propuesta que el usuario
// tiene que confirmar en la tarjeta (ver pepa/actions).
import { listMenuEntries, listRecipes } from '@/data/food'
import { listShoppingItems } from '@/data/shopping'
import { buildMenuAnswer, findRecipeMatches, MEAL_LABELS } from '@/domain/kitchenMenu'
import { kitchenDateLabel, parseKitchenIntent, type KitchenIntent } from '@/domain/kitchenQuery'
import type { MealType, MenuEntry, Recipe } from '@/domain/types'
import { proposeAction } from '@/pepa/actions/registry'
import type { ActionContext, ActionProposal } from '@/pepa/actions/types'
import { recentRecipeIds, rememberRecipes } from '@/pepa/recentContext'

export type KitchenOutcome = { kind: 'answer'; text: string } | { kind: 'proposal'; text: string; proposal: ActionProposal }

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
  const context: ActionContext = { recipes, menuEntries: entries, shoppingItemNames: [], today }
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

async function handleIngredients(intent: Extract<KitchenIntent, { kind: 'ingredients' }>, today: Date): Promise<KitchenOutcome> {
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
  const recipe = candidates[0]
  if (recipe.ingredients.length === 0) return { kind: 'answer', text: `«${recipe.title}» no tiene ingredientes apuntados.` }

  const items = await listShoppingItems()
  const shoppingItemNames = items.filter((i) => i.status !== 'comprado').map((i) => i.name)
  const context: ActionContext = { recipes, menuEntries: [], shoppingItemNames, today }
  const result = proposeAction('menu.ingredients_to_shopping', { recipeId: recipe.id, ingredientIds: recipe.ingredients.map((i) => i.id) }, context)
  if (!result.ok) return { kind: 'answer', text: `No he podido preparar eso: ${result.errors[0]}` }
  rememberRecipes([recipe.id])
  return {
    kind: 'proposal',
    proposal: result.proposal,
    text: `Voy a añadir a la lista de la compra los ingredientes de «${recipe.title}». Revisa cuáles en la tarjeta y pulsa Añadir.`,
  }
}

// mode 'ask': viene de un botón "🐣 Pepa" (solo preguntas) — solo se
// contestan consultas; cualquier otra cosa sigue su camino de siempre.
// mode 'create': viene de un botón "🎤 Apuntar" — además, lo que escribiría
// se prepara como propuesta.
// Devuelve null si la frase no es de Cocina: todo sigue como antes.
export async function handleKitchenText(text: string, mode: 'ask' | 'create', today: Date = new Date()): Promise<KitchenOutcome | null> {
  const intent = parseKitchenIntent(text, today)
  if (!intent) return null
  if (intent.kind === 'menu_query') return handleMenuQuery(intent, today)
  if (mode === 'ask') return null
  return intent.kind === 'menu_set' ? handleMenuSet(intent, today) : handleIngredients(intent, today)
}
