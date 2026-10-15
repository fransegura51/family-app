// Comunidad PEPA — el PUENTE entre las recetas PRIVADAS de la Cocina y las recetas PÚBLICAS de Comunidad (CMN-§5). Código puro: sin red, sin React.
//
//  - Publicar: receta privada → borrador de receta pública (copia INDEPENDIENTE: nunca lleva ids ni datos de la familia).
//  - Importar: receta pública → datos para crear una copia EDITABLE en la Cocina de la familia (con el createRecipe de siempre).
//  - Actualizar: versión nueva de una receta importada → datos para actualizar la copia (updateRecipe), conservando lo que la familia añadió (foto, etiquetas).
import { isValidServings } from '@/domain/recipeServings'
import { dedupeStepNumbers } from '@/domain/recipeSteps'
import type { PublicRecipe, RecipeDraftInput, RecipeIngredient } from '@/domain/community'
import { MAX_TITLE } from '@/domain/community'
import { diffRecipes, normalizeKey, splitSteps, type DiffRecipe, type RecipeDiff } from '@/domain/communityRecipeDiff'
import type { Recipe } from '@/domain/types'

// Texto EXACTO del consentimiento (casilla obligatoria antes de publicar). Nunca se publica una receta privada sin marcarla.
export const RECIPE_CONSENT_TEXT = 'Entiendo que esta receta será pública, la podrá leer cualquier persona y no incluirá datos de mi familia'

// Límites que el servidor vuelve a comprobar (migración 0265, private.community_clean_recipe).
export const MAX_RECIPE_INGREDIENTS = 80
export const MAX_INGREDIENT_NAME = 120
export const MAX_INGREDIENT_FIELD = 30
export const MAX_RECIPE_TAGS = 12
export const MAX_TAG_LENGTH = 30
export const MIN_TITLE = 3

// ---- Pasos

// Pasos de las notas de una receta privada («1. Pelar…\n2. Cortar…»). Si son texto libre, cada línea es un paso. Se quita la numeración (también la repetida
// «1. 1. …» de recetas importadas de internet) para poder volver a numerar siempre igual.
export function stepsFromNotes(notes: string | null | undefined): string[] {
  return splitSteps(dedupeStepNumbers(notes ?? ''))
}

// Pasos → texto numerado, una línea por paso («1. …»). Los saltos de línea DENTRO de un paso se convierten en espacios para que cada línea sea un paso.
export function stepsToText(steps: string[]): string {
  return steps
    .map((s) => s.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((s, i) => `${i + 1}. ${s}`)
    .join('\n')
}

// Texto de pasos público → notas de la Cocina (la Cocina espera una lista numerada, o la trata como texto libre).
export function notesFromSteps(stepsText: string | null | undefined): string {
  return stepsToText(splitSteps(stepsText))
}

// ---- Ingredientes

// Las comas separan los tres campos en el texto de ingredientes de la Cocina («nombre, cantidad, unidad»): un nombre o una unidad con comas se ven con
// espacios y una cantidad como «1,5» pasa a «1.5» (igual que el resto de PEPA, que guarda los decimales con punto).
export function ingredientLine(i: RecipeIngredient): string {
  const name = i.name.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  const quantity = (i.quantity ?? '').replace(/(\d),(\d)/g, '$1.$2').replace(/,/g, ' ').trim()
  const unit = (i.unit ?? '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
  return [name, quantity, unit].join(', ')
}

export function ingredientLinesFromPublic(ingredients: RecipeIngredient[]): string[] {
  return ingredients.filter((i) => i.name.trim()).map(ingredientLine)
}

// ---- Receta privada → borrador público

// Normaliza un borrador de receta pública: recorta espacios y longitudes, quita ingredientes vacíos, etiquetas en minúsculas sin repetir (como las guarda el
// servidor), raciones solo si son válidas y pasos numerados una línea por paso. Lo que se enseña en la vista previa es EXACTAMENTE lo que se publicará.
export function cleanRecipeDraft(draft: RecipeDraftInput): RecipeDraftInput {
  const ingredients = draft.ingredients
    .map((i) => ({
      name: (i.name ?? '').trim().slice(0, MAX_INGREDIENT_NAME),
      quantity: (i.quantity ?? '').trim().slice(0, MAX_INGREDIENT_FIELD),
      unit: (i.unit ?? '').trim().slice(0, MAX_INGREDIENT_FIELD),
    }))
    .filter((i) => i.name)
  const tags: string[] = []
  for (const raw of draft.tags) {
    const t = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH)
    if (t && !tags.includes(t)) tags.push(t)
  }
  return {
    servings: isValidServings(draft.servings) ? draft.servings : null,
    ingredients,
    steps: notesFromSteps(draft.steps),
    tags: tags.slice(0, MAX_RECIPE_TAGS),
  }
}

// Receta privada de la Cocina → borrador de receta pública. NO se copia ningún id, ni familia, ni foto (la foto se copia aparte y solo si la persona lo elige).
export function privateRecipeToDraft(recipe: Recipe): { title: string; recipe: RecipeDraftInput } {
  return {
    title: recipe.title.trim().slice(0, MAX_TITLE),
    recipe: cleanRecipeDraft({
      servings: recipe.servings ?? null,
      ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '' })),
      steps: stepsToText(stepsFromNotes(recipe.notes)),
      tags: recipe.tags,
    }),
  }
}

// Frases que impiden publicar (vacío = se puede). Las reglas son las mismas que aplica el servidor, para avisar ANTES de enviar.
export function recipePublishProblems(title: string, draft: RecipeDraftInput): string[] {
  const problems: string[] = []
  if (title.trim().length < MIN_TITLE) problems.push('Escribe un nombre para la receta (mínimo 3 letras).')
  if (title.trim().length > MAX_TITLE) problems.push(`El nombre es demasiado largo (máximo ${MAX_TITLE} letras).`)
  const clean = cleanRecipeDraft(draft)
  if (clean.ingredients.length === 0) problems.push('La receta necesita al menos un ingrediente con nombre.')
  if (draft.ingredients.filter((i) => i.name.trim()).length > MAX_RECIPE_INGREDIENTS) problems.push(`Puede tener como máximo ${MAX_RECIPE_INGREDIENTS} ingredientes.`)
  return problems
}

export interface PublishCheck {
  consent: boolean
  topicId: string | null
  title: string
  draft: RecipeDraftInput
}

// Regla de publicación: NUNCA sin la casilla de consentimiento marcada, y con tema, nombre válido e ingredientes.
export function canPublishRecipe(c: PublishCheck): boolean {
  return c.consent === true && !!c.topicId && recipePublishProblems(c.title, c.draft).length === 0
}

// ---- Receta pública → Cocina privada

// Datos para crear la copia editable con createRecipe(). La foto (si hay) la copia el botón de importar y se pasa en imagePath.
export function publicRecipeToKitchenInput(title: string, recipe: Pick<PublicRecipe, 'servings' | 'ingredients' | 'steps' | 'tags'>, imagePath: string | null) {
  return {
    title: title.trim().slice(0, MAX_TITLE),
    notes: notesFromSteps(recipe.steps),
    ingredientLines: ingredientLinesFromPublic(recipe.ingredients),
    tags: recipe.tags,
    imagePath,
    servings: isValidServings(recipe.servings) ? recipe.servings : null,
    servingsSource: null as string | null,
  }
}

// ---- Actualización voluntaria de una copia importada

// Etiquetas al actualizar: las de la versión nueva + las que la familia añadió por su cuenta (las que NO estaban en la versión que importó).
export function mergeTagsOnUpdate(privateTags: string[], importedTags: string[], currentTags: string[]): string[] {
  const imported = new Set(importedTags.map(normalizeKey))
  const out = [...currentTags]
  for (const t of privateTags) {
    if (!imported.has(normalizeKey(t)) && !out.some((x) => normalizeKey(x) === normalizeKey(t))) out.push(t)
  }
  return out
}

// Datos para updateRecipe() de la copia privada con la versión nueva. Se conservan la foto de la familia y sus etiquetas propias.
export function recipeUpdateToKitchenInput(privateRecipe: Recipe, current: DiffRecipe, imported: DiffRecipe | null) {
  const sameServings = (privateRecipe.servings ?? null) === (current.servings ?? null)
  const newServings = isValidServings(current.servings) ? current.servings : null
  return {
    title: current.title.trim().slice(0, MAX_TITLE) || privateRecipe.title,
    notes: notesFromSteps(current.steps),
    ingredientLines: ingredientLinesFromPublic(current.ingredients),
    tags: mergeTagsOnUpdate(privateRecipe.tags, imported?.tags ?? [], current.tags),
    imagePath: privateRecipe.imagePath,
    servings: sameServings ? (privateRecipe.servings ?? null) : newServings,
    // Si las raciones no cambian se conserva el texto original de la fuente; si cambian, deja de valer.
    servingsSource: sameServings ? (privateRecipe.servingsSource ?? null) : null,
  }
}

// La receta privada como «versión comparable» (para saber si la familia ha cambiado su copia respecto a lo que importó).
export function privateRecipeToDiffRecipe(recipe: Recipe): DiffRecipe {
  const d = privateRecipeToDraft(recipe)
  return { title: d.title, servings: d.recipe.servings, ingredients: d.recipe.ingredients, steps: d.recipe.steps, tags: d.recipe.tags }
}

// ¿Ha cambiado la familia su copia (título, ingredientes o pasos) desde que la importó? Las etiquetas y las raciones no cuentan: se tocan a menudo y no avisan.
// Sirve para decir con claridad «al actualizar se pierden tus cambios».
export function privateCopyEditedSinceImport(recipe: Recipe, imported: DiffRecipe): boolean {
  const d: RecipeDiff = diffRecipes(imported, privateRecipeToDiffRecipe(recipe))
  return d.titleChanged !== null || d.ingredientsAdded.length > 0 || d.ingredientsRemoved.length > 0 || d.ingredientsChanged.length > 0 || d.stepOps.some((o) => o.type !== 'same')
}

// ---- Presentación

// 1,5 · 250 · 0,33 (coma decimal, como el resto de PEPA, y sin ceros sobrantes).
export function formatScaledQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded).replace('.', ',')
}

// Fecha corta en español para «Actualizada el …».
export function formatRecipeDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Alias público del autor (nunca nombre real): cuenta eliminada o sin alias tienen su propio texto.
export function authorLabel(authorAlias: string | null, authorDeleted: boolean): string {
  if (authorDeleted) return 'Usuario eliminado'
  return authorAlias ?? 'Alguien'
}
