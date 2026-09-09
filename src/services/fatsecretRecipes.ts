// Llama a la función de servidor "fatsecret-food" (acciones recipeSearch
// / recipeGet) — petición real: "quiero recetas con fotos... si la
// tenemos que sacar de FatSecret que tenemos el API, la sacamos de
// ahí... son gratuitas". Mismas credenciales que ya usaba el módulo de
// alimentos (food.search/food.get), del plan Basic gratis de FatSecret.
//
// OJO, comprobado en su documentación oficial: los datos de recetas del
// plan gratis vienen en inglés/EE.UU. — la localización a español es
// una función Premier de pago. Por eso se ofrece como fuente adicional
// junto a Wikibooks (en español), no como sustituta.
import { supabase } from '@/data/supabaseClient'

export interface FatSecretRecipeResult {
  id: string
  name: string
  description: string
  imageUrl: string | null
}

export interface FatSecretRecipeDetail {
  id: string
  name: string
  imageUrl: string | null
  ingredients: string[]
  directions: string[]
}

async function callFatSecret(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/fatsecret-food`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('No se pudo buscar en FatSecret ahora mismo.')
  return res.json()
}

export async function searchFatSecretRecipes(query: string): Promise<FatSecretRecipeResult[]> {
  const json = await callFatSecret({ action: 'recipeSearch', query })
  const results = Array.isArray(json.results) ? json.results : []
  return results.map((r) => ({
    id: String((r as Record<string, unknown>).id ?? ''),
    name: String((r as Record<string, unknown>).name ?? ''),
    description: String((r as Record<string, unknown>).description ?? ''),
    imageUrl: (r as Record<string, unknown>).imageUrl ? String((r as Record<string, unknown>).imageUrl) : null,
  }))
}

export async function getFatSecretRecipe(recipeId: string): Promise<FatSecretRecipeDetail> {
  const json = await callFatSecret({ action: 'recipeGet', recipeId })
  const d = json.detail as Record<string, unknown> | undefined
  if (!d) throw new Error('No se pudo traer esa receta.')
  return {
    id: String(d.id ?? recipeId),
    name: String(d.name ?? ''),
    imageUrl: d.imageUrl ? String(d.imageUrl) : null,
    ingredients: Array.isArray(d.ingredients) ? d.ingredients.filter((i): i is string => typeof i === 'string') : [],
    directions: Array.isArray(d.directions) ? d.directions.filter((i): i is string => typeof i === 'string') : [],
  }
}
