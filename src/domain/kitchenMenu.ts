// Lógica pura de Cocina para Pepa: encontrar la receta de la que se habla y
// redactar la respuesta a "¿qué cenamos hoy?". Sin acceso a datos: recibe
// las recetas y el menú ya cargados, así se prueba sin base de datos.
import { kitchenDateLabel } from '@/domain/kitchenQuery'
import { normalize } from '@/domain/voiceQuery'
import type { MealType, MenuEntry, Recipe } from '@/domain/types'

export const MEAL_LABELS: Record<MealType, string> = {
  desayuno: 'desayuno',
  comida: 'comida',
  merienda: 'merienda',
  cena: 'cena',
  snack: 'snack',
}

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'a', 'al', 'en', 'un', 'una', 'receta'])

function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem)
}

export interface RecipeMatch {
  recipe: Recipe
  // 3 = mismo nombre; 2 = todas las palabras dichas están en el título;
  // 1 = el título entero está dentro de lo dicho.
  score: 1 | 2 | 3
}

// "tortilla" encuentra "Tortilla de patata"; "patatas" encuentra "Patata
// cocida". Ordena de más a menos parecido y, a igualdad, el título más corto.
export function findRecipeMatches(query: string, recipes: Recipe[]): RecipeMatch[] {
  const queryTokens = tokens(query)
  if (queryTokens.length === 0) return []
  const normalizedQuery = normalize(query).trim()

  const matches: RecipeMatch[] = []
  for (const recipe of recipes) {
    const titleTokens = tokens(recipe.title)
    if (titleTokens.length === 0) continue
    let score: RecipeMatch['score'] | null = null
    if (normalize(recipe.title).trim() === normalizedQuery) score = 3
    else if (queryTokens.every((t) => titleTokens.includes(t))) score = 2
    else if (titleTokens.every((t) => queryTokens.includes(t))) score = 1
    if (score !== null) matches.push({ recipe, score })
  }
  matches.sort((a, b) => b.score - a.score || a.recipe.title.length - b.recipe.title.length || a.recipe.title.localeCompare(b.recipe.title))
  return matches.slice(0, 5)
}

export function menuEntryText(entry: MenuEntry, recipes: Recipe[]): string | null {
  if (entry.recipeId) {
    const recipe = recipes.find((r) => r.id === entry.recipeId)
    if (recipe) return recipe.title
  }
  const text = entry.freeText?.trim()
  return text ? text : null
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

function deLabel(label: string): string {
  return label.startsWith('el ') ? `del ${label.slice(3)}` : `de ${label}`
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export interface MenuAnswer {
  text: string
  recipeIds: string[]
}

export function buildMenuAnswer(params: { date: string; meals: MealType[]; entries: MenuEntry[]; recipes: Recipe[]; today: Date }): MenuAnswer {
  const { date, meals, entries, recipes, today } = params
  const label = kitchenDateLabel(date, today)
  const recipeIds: string[] = []

  const dishesFor = (meal: MealType): string[] => {
    const dishes: string[] = []
    for (const entry of entries) {
      if (entry.entryDate !== date || entry.mealType !== meal) continue
      const text = menuEntryText(entry, recipes)
      if (!text) continue
      dishes.push(text)
      if (entry.recipeId) recipeIds.push(entry.recipeId)
    }
    return dishes
  }

  if (meals.length === 1) {
    const dishes = dishesFor(meals[0])
    const article = meals[0] === 'desayuno' || meals[0] === 'snack' ? 'el' : 'la'
    const text =
      dishes.length > 0
        ? `Para ${article} ${MEAL_LABELS[meals[0]]} ${deLabel(label)}: ${joinNatural(dishes)}.`
        : `No hay nada apuntado para ${article} ${MEAL_LABELS[meals[0]]} ${deLabel(label)}.`
    return { text, recipeIds }
  }

  const parts = meals.map((meal) => {
    const dishes = dishesFor(meal)
    return `${capitalize(MEAL_LABELS[meal])}: ${dishes.length > 0 ? joinNatural(dishes) : 'sin apuntar'}.`
  })
  return { text: `${capitalize(label)}. ${parts.join(' ')}`, recipeIds }
}
