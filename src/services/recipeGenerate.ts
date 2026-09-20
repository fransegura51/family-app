// Pide a la IA una PROPUESTA de receta (nunca se guarda desde aquí). Pasa por la
// capa central de IA (función "recipe-generate"), no llama a ningún proveedor por
// su cuenta.
//
// Qué viaja a la IA: el nombre del plato, las raciones y las preferencias que la
// persona ha dicho expresamente (sin gluten, vegetariana...). Nada más: ni
// nombres de familiares (si el plato llevara alguno, se sustituye por un alias),
// ni calendario, ni finanzas, ni datos de otros módulos.
import { draftFromAi, draftToCreateParams, type RecipeDraftData } from '@/domain/recipeDraft'
import { proposeAction } from '@/pepa/actions/registry'
import { callAiFunction, loadAliasMap } from '@/services/aiClient'

export interface RecipeDraftRequest {
  dish: string
  servings: number
  preferences: string[]
}

interface AiRecipeResponse {
  title: string
  servings: number
  timeMinutes: number | null
  ingredients: { name: string; quantity: number | null; unit: string | null }[]
  steps: string[]
  tags: string[]
}

export class InvalidRecipeError extends Error {
  constructor() {
    super('La propuesta de receta no es válida')
  }
}

export async function requestRecipeDraft(request: RecipeDraftRequest): Promise<RecipeDraftData> {
  const alias = await loadAliasMap()
  const json = (await callAiFunction('recipe-generate', {
    dish: alias.aliasize(request.dish),
    servings: request.servings,
    preferences: request.preferences,
  })) as Partial<AiRecipeResponse> | null

  // Segunda comprobación en el cliente, con las mismas reglas que se usarán
  // para guardar: si no pasa, no se enseña.
  if (!json || typeof json.title !== 'string' || !Array.isArray(json.ingredients) || !Array.isArray(json.steps) || !Array.isArray(json.tags)) {
    throw new InvalidRecipeError()
  }
  const draft = draftFromAi({ ...(json as AiRecipeResponse), title: alias.restore(json.title), servings: request.servings })
  const check = proposeAction('recipe.create', draftToCreateParams(draft), { recipes: [], menuEntries: [], shoppingItemNames: [], members: [], today: new Date() })
  if (!check.ok) throw new InvalidRecipeError()
  return draft
}
