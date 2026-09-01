// Llama a la función de servidor "fatsecret-food" (Fase 5, skill
// organizador-familiar) para buscar alimentos y leer sus datos
// nutricionales reales en vez de estimarlos a mano. El Client ID/Secret
// de FatSecret nunca pasan por aquí: viven en Supabase Vault y solo los
// lee la función de servidor.
import { supabase } from '@/data/supabaseClient'

export interface FoodSearchResult {
  id: string
  name: string
  description: string
}

export interface FoodDetail {
  id: string
  name: string
  brand: string | null
  servingDescription: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
}

async function callFatSecret(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('No autenticado')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
  const res = await fetch(`${supabaseUrl}/functions/v1/fatsecret-food`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('No se pudo consultar FatSecret')
  return res.json()
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const json = await callFatSecret({ action: 'search', query })
  return Array.isArray(json.results) ? (json.results as FoodSearchResult[]) : []
}

export async function getFoodDetail(foodId: string): Promise<FoodDetail> {
  const json = await callFatSecret({ action: 'get', foodId })
  return json.detail as FoodDetail
}
