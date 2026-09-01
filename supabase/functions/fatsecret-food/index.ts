import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Proxy hacia la API de FatSecret (módulo Alimentación/menús, Fase 5 de
// la skill organizador-familiar). Las llamadas SIEMPRE salen desde aquí,
// nunca desde el cliente — el Client ID/Secret viven en Vault y no se
// exponen jamás al navegador. Se exige JWT de usuario real (aunque no se
// use para nada más) para que solo la propia familia autenticada pueda
// gastar cuota del plan gratuito.
//
// Cachea en food_cache los detalles nutricionales ya consultados (los
// datos de un alimento no cambian) para no repetir food.get de más y
// quedarse cómodamente por debajo del límite del plan gratuito, tal y
// como pide la skill.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

interface FoodSearchResult {
  id: string
  name: string
  description: string
}

interface FoodDetail {
  id: string
  name: string
  brand: string | null
  servingDescription: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
}

async function getFatSecretToken(clientId: string, clientSecret: string): Promise<string> {
  const basic = btoa(`${clientId}:${clientSecret}`)
  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=basic",
  })
  if (!res.ok) throw new Error(`fatsecret_token_error: ${await res.text()}`)
  const data = await res.json()
  return data.access_token as string
}

// La API de FatSecret (heredada de XML) no envuelve en array una
// colección de un solo elemento — puede venir como objeto suelto u
// objeto con .food/.serving, o como array. Esto normaliza siempre a array.
function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)

    const body = await req.json()
    const action = body.action as string

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    if (action === "search") {
      const query = typeof body.query === "string" ? body.query.trim() : ""
      if (!query) return json({ error: "missing query" }, 400)

      const { data: clientId, error: idErr } = await adminClient.rpc("get_app_secret", { p_name: "FATSECRET_CLIENT_ID" })
      const { data: clientSecret, error: secErr } = await adminClient.rpc("get_app_secret", { p_name: "FATSECRET_CLIENT_SECRET" })
      if (idErr || secErr || !clientId || !clientSecret) return json({ error: "service not configured" }, 500)

      const token = await getFatSecretToken(clientId, clientSecret)
      const params = new URLSearchParams({
        method: "foods.search",
        search_expression: query,
        format: "json",
        max_results: "15",
      })
      const res = await fetch(`https://platform.fatsecret.com/rest/server.api?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return json({ error: "fatsecret_error", detail: await res.text() }, 502)
      const data = await res.json()

      if (data.error) return json({ error: "fatsecret_error", detail: data.error.message ?? String(data.error) }, 502)

      const foods = asArray(data.foods?.food)
      const results: FoodSearchResult[] = foods.map((f: Record<string, unknown>) => ({
        id: String(f.food_id),
        name: String(f.food_name ?? ""),
        description: String(f.food_description ?? ""),
      }))
      return json({ results })
    }

    if (action === "get") {
      const foodId = typeof body.foodId === "string" ? body.foodId.trim() : ""
      if (!foodId) return json({ error: "missing foodId" }, 400)

      const { data: cached } = await adminClient
        .from("food_cache")
        .select("fatsecret_food_id, name, brand, serving_description, calories, protein_g, carbs_g, fat_g")
        .eq("fatsecret_food_id", foodId)
        .maybeSingle()

      if (cached) {
        const detail: FoodDetail = {
          id: cached.fatsecret_food_id,
          name: cached.name,
          brand: cached.brand,
          servingDescription: cached.serving_description,
          calories: cached.calories,
          proteinG: cached.protein_g,
          carbsG: cached.carbs_g,
          fatG: cached.fat_g,
        }
        return json({ detail, fromCache: true })
      }

      const { data: clientId, error: idErr } = await adminClient.rpc("get_app_secret", { p_name: "FATSECRET_CLIENT_ID" })
      const { data: clientSecret, error: secErr } = await adminClient.rpc("get_app_secret", { p_name: "FATSECRET_CLIENT_SECRET" })
      if (idErr || secErr || !clientId || !clientSecret) return json({ error: "service not configured" }, 500)

      const token = await getFatSecretToken(clientId, clientSecret)
      const params = new URLSearchParams({ method: "food.get.v2", food_id: foodId, format: "json" })
      const res = await fetch(`https://platform.fatsecret.com/rest/server.api?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return json({ error: "fatsecret_error", detail: await res.text() }, 502)
      const data = await res.json()
      if (data.error) return json({ error: "fatsecret_error", detail: data.error.message ?? String(data.error) }, 502)

      const food = data.food
      if (!food) return json({ error: "not_found" }, 404)

      const servings = asArray(food.servings?.serving)
      const serving = servings[0] ?? {}

      const detail: FoodDetail = {
        id: String(food.food_id ?? foodId),
        name: String(food.food_name ?? ""),
        brand: food.brand_name ? String(food.brand_name) : null,
        servingDescription: serving.serving_description ? String(serving.serving_description) : null,
        calories: numOrNull(serving.calories),
        proteinG: numOrNull(serving.protein),
        carbsG: numOrNull(serving.carbohydrate),
        fatG: numOrNull(serving.fat),
      }

      await adminClient.from("food_cache").upsert({
        fatsecret_food_id: detail.id,
        name: detail.name,
        brand: detail.brand,
        serving_description: detail.servingDescription,
        calories: detail.calories,
        protein_g: detail.proteinG,
        carbs_g: detail.carbsG,
        fat_g: detail.fatG,
      })

      return json({ detail, fromCache: false })
    }

    return json({ error: "unknown action" }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
