// «¿Qué cocino hoy?» SIN IA: qué recetas YA GUARDADAS de la familia se pueden hacer con lo que hay en casa. Solo reglas, sin red y sin coste. La IA es un
// segundo paso opcional (services/whatToCook.ts), que se pide aparte.
import type { RecipeDraftData } from '@/domain/recipeDraft'
import type { Recipe } from '@/domain/types'
import { normalize } from '@/domain/voiceQuery'

// Cosas que se dan por hechas en cualquier cocina: no cuentan como «te faltaría».
const STAPLES = new Set(['sal', 'aceite', 'agua', 'pimienta', 'vinagre', 'aceite de oliva', 'sal fina', 'sal gorda'])
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'a', 'al', 'en', 'un', 'una', 'unos', 'unas', 'para', 'al gusto'])
const MAX_MISSING = 3
const MAX_RESULTS = 5

// «tomates» → «tomat», «lentejas» → «lentej», «pimientos» → «pimient»: quita el plural y la última vocal, para que «tomate» y «tomates» coincidan.
function stem(word: string): string {
  let w = word
  if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1)
  if (w.length > 3 && /[aeiou]$/.test(w)) w = w.slice(0, -1)
  return w
}

function tokensOf(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem)
}

function isStaple(name: string): boolean {
  return STAPLES.has(normalize(name).trim())
}

// ¿«tengo» (lo que dice la persona) es el mismo ingrediente que `needed` (el de la receta)? «tomate» ≈ «tomate triturado»; «pimiento rojo» ≈ «pimiento».
function sameIngredient(have: string, needed: string): boolean {
  const a = tokensOf(have)
  const b = tokensOf(needed)
  if (a.length === 0 || b.length === 0) return false
  return a.every((t) => b.includes(t)) || b.every((t) => a.includes(t))
}

export interface SavedRecipeMatch {
  recipe: Recipe
  // Lo que la persona dice que tiene y la receta usa.
  have: string[]
  // Ingredientes de la receta que no tiene (sin contar sal, aceite, agua…).
  missing: string[]
}

export function findRecipesWithIngredients(have: string[], recipes: Recipe[]): SavedRecipeMatch[] {
  const matches: SavedRecipeMatch[] = []
  for (const recipe of recipes) {
    const needed = recipe.ingredients.map((i) => i.name).filter((name) => name.trim() !== '' && !isStaple(name))
    if (needed.length === 0) continue
    const usedHave = new Set<string>()
    const missing: string[] = []
    for (const name of needed) {
      const owned = have.find((h) => sameIngredient(h, name))
      if (owned) usedHave.add(owned)
      else if (!missing.some((m) => normalize(m) === normalize(name))) missing.push(name)
    }
    if (usedHave.size === 0 || missing.length > MAX_MISSING) continue
    matches.push({ recipe, have: [...usedHave], missing })
  }
  // Primero las que se pueden hacer ya (nada que falte), después las que más ingredientes aprovechan y, a igualdad, el título más corto.
  matches.sort((a, b) => a.missing.length - b.missing.length || b.have.length - a.have.length || a.recipe.title.length - b.recipe.title.length)
  return matches.slice(0, MAX_RESULTS)
}

function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

// Lo que Pepa dice en voz alta de tus recetas guardadas y de las que ha encontrado en internet (todo gratis). Siempre termina ofreciendo la IA (paso aparte).
export function describeSavedMatches(have: string[], matches: SavedRecipeMatch[], webTitles: string[] = []): string {
  const withWhat = listWords(have.slice(0, 6)) + (have.length > 6 ? ' y más' : '')
  if (matches.length === 0 && webTitles.length === 0) {
    return `No tienes ninguna receta guardada que se pueda hacer con ${withWhat}, y no he encontrado nada en internet. ¿Quieres que le pida ideas a la IA?`
  }
  const parts: string[] = []
  if (matches.length > 0) {
    const saved = matches.slice(0, 3).map((m) => (m.missing.length === 0 ? `${m.recipe.title}, que tienes entera` : `${m.recipe.title}, te faltaría ${listWords(m.missing)}`))
    parts.push(`De tus recetas guardadas, con ${withWhat} puedes hacer: ${listWords(saved)}.`)
  } else {
    parts.push(`No tienes ninguna receta guardada que se pueda hacer con ${withWhat}.`)
  }
  if (webTitles.length > 0) parts.push(`En internet he encontrado: ${listWords(webTitles.slice(0, 3))}.`)
  parts.push('Las tienes en pantalla. Si quieres más ideas, dime «pídeselas a la IA».')
  return parts.join(' ')
}

export interface ImportedRecipeLike {
  title: string
  ingredients: string[]
  instructions: string
  servings: number | null
}

const MAX_DRAFT_INGREDIENTS = 30
const MAX_DRAFT_STEPS = 20
const MAX_INGREDIENT_NAME = 60
const MAX_STEP = 400

// Una receta leída de internet (import-recipe-url) → borrador para revisar y guardar con la tarjeta de siempre. Los ingredientes llegan como frases libres
// («2 tomates grandes»): se dejan tal cual como nombre (sin comas, que separan los campos al guardar). Si trae más pasos o más texto de los que admite la
// receta guardada, se une lo que sobra al último paso, para no perder nada (se puede editar en la tarjeta).
export function draftFromImportedRecipe(recipe: ImportedRecipeLike, fallbackServings: number): RecipeDraftData {
  const ingredients = recipe.ingredients
    .map((line) => line.replace(/[,\n]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_DRAFT_INGREDIENTS)
    .map((name) => ({ name: name.slice(0, MAX_INGREDIENT_NAME), quantity: null, quantityText: null, unit: null }))
  let steps = recipe.instructions
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\s*[.)-]\s*/, '').trim())
    .filter((line) => line.length > 0)
  if (steps.length > MAX_DRAFT_STEPS) steps = [...steps.slice(0, MAX_DRAFT_STEPS - 1), steps.slice(MAX_DRAFT_STEPS - 1).join(' ')]
  steps = steps.map((step) => (step.length > MAX_STEP ? `${step.slice(0, MAX_STEP - 1)}…` : step))
  const servings = recipe.servings !== null && Number.isInteger(recipe.servings) && recipe.servings >= 1 && recipe.servings <= 20 ? recipe.servings : fallbackServings
  return { title: recipe.title.trim().slice(0, 80), servings, timeMinutes: null, ingredients, steps, tags: [] }
}
