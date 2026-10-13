// Pide a la IA ideas de platos con los ingredientes que la persona tiene (función «what-to-cook»; nunca se guarda nada desde aquí). Pasa por la capa
// central de IA (aiClient), no llama a ningún proveedor por su cuenta.
//
// Qué viaja a la IA: SOLO la lista de ingredientes, las raciones y las preferencias dichas expresamente. Nada más: ningún nombre de familiar, calendario,
// finanzas ni datos de otros módulos.
import { draftFromAi, draftToCreateParams } from '@/domain/recipeDraft'
import type { CookIdeaData } from '@/domain/cookIdeas'
import { proposeAction } from '@/pepa/actions/registry'
import { callAiFunction } from '@/services/aiClient'

export interface CookIdeasRequest {
  ingredients: string[]
  servings: number
  preferences: string[]
}

export class InvalidCookIdeasError extends Error {
  constructor() {
    super('Las ideas de cocina no son válidas')
  }
}

interface AiIdea {
  title?: unknown
  summary?: unknown
  missing?: unknown
  recipe?: { title?: unknown; servings?: unknown; timeMinutes?: unknown; ingredients?: unknown; steps?: unknown; tags?: unknown }
}

export async function requestCookIdeas(request: CookIdeasRequest): Promise<CookIdeaData[]> {
  const json = (await callAiFunction('what-to-cook', {
    ingredients: request.ingredients,
    servings: request.servings,
    preferences: request.preferences,
  })) as { ideas?: AiIdea[] } | null

  if (!json || !Array.isArray(json.ideas)) throw new InvalidCookIdeasError()
  const ideas: CookIdeaData[] = []
  for (const raw of json.ideas) {
    const r = raw?.recipe
    if (!r || typeof r.title !== 'string' || !Array.isArray(r.ingredients) || !Array.isArray(r.steps) || !Array.isArray(r.tags)) continue
    const draft = draftFromAi({
      title: r.title,
      servings: request.servings,
      timeMinutes: typeof r.timeMinutes === 'number' ? r.timeMinutes : null,
      ingredients: r.ingredients as { name: string; quantity: number | null; unit: string | null }[],
      steps: r.steps as string[],
      tags: r.tags as string[],
    })
    // Segunda comprobación en el cliente, con las mismas reglas que se usarán para guardar: si no pasa, no se enseña.
    const check = proposeAction('recipe.create', draftToCreateParams(draft), { recipes: [], menuEntries: [], shoppingItemNames: [], members: [], today: new Date() })
    if (!check.ok) continue
    ideas.push({
      title: draft.title,
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      missing: Array.isArray(raw.missing) ? raw.missing.filter((m): m is string => typeof m === 'string').slice(0, 4) : [],
      recipe: draft,
    })
  }
  if (ideas.length === 0) throw new InvalidCookIdeasError()
  return ideas
}
