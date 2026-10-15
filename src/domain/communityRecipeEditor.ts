// Comunidad PEPA — lo que es PROPIO de Comunidad en el editor de recetas compartido con la Cocina. Código puro.
// El editor (campos, filas, etiquetas, raciones) es el mismo (`recipeEditor.ts` + `src/ui/recipeEditor/RecipeEditorFields.tsx`); aquí solo se traduce entre la
// copia pública (`RecipeDraftInput`: raciones, ingredientes {nombre, cantidad, unidad}, pasos en texto numerado y etiquetas) y las filas que se editan.
import type { RecipeDraftInput } from '@/domain/community'
import {
  MAX_INGREDIENT_FIELD,
  MAX_INGREDIENT_NAME,
  MAX_RECIPE_INGREDIENTS,
  MAX_RECIPE_TAGS,
  MAX_TAG_LENGTH,
  stepsFromNotes,
  stepsToText,
} from '@/domain/communityRecipeBridge'
import { filledIngredients, ingredientRowsFrom, stepRowsFrom, validServings, type IngredientRow, type RecipeEditorLimits, type StepRow } from '@/domain/recipeEditor'

// Los mismos límites que vuelve a comprobar el servidor (migración 0265): el editor avisa ANTES de enviar.
export const COMMUNITY_RECIPE_LIMITS: RecipeEditorLimits = {
  maxIngredients: MAX_RECIPE_INGREDIENTS,
  maxIngredientName: MAX_INGREDIENT_NAME,
  maxIngredientField: MAX_INGREDIENT_FIELD,
  maxTags: MAX_RECIPE_TAGS,
  maxTagLength: MAX_TAG_LENGTH,
  tagCase: 'lower',
}

// Lo que el editor tiene en pantalla para una copia pública.
export interface CommunityEditorRows {
  ingredients: IngredientRow[]
  steps: StepRow[]
  servingsText: string
}

// Copia pública → filas para editar (con filas en blanco si no hay nada).
export function draftToEditorRows(value: RecipeDraftInput): CommunityEditorRows {
  return {
    ingredients: ingredientRowsFrom(value.ingredients),
    steps: stepRowsFrom(stepsFromNotes(value.steps)),
    servingsText: value.servings === null ? '' : String(value.servings),
  }
}

// Filas → copia pública. Las filas de ingredientes en blanco no viajan; las raciones inválidas tampoco (el editor las marca en pantalla).
export function editorRowsToDraft(rows: CommunityEditorRows, tags: string[]): RecipeDraftInput {
  return {
    servings: validServings(rows.servingsText),
    ingredients: filledIngredients(rows.ingredients).map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit })),
    steps: stepsToText(rows.steps.map((s) => s.text)),
    tags,
  }
}
