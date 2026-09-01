import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Proxy hacia la API de FatSecret (módulo Alimentación/menús, Fase 5 de
// la skill organizador-familiar). Las llamadas SIEMPRE salen desde aquí,
// nunca desde el cliente — el Consumer Key/Secret viven en Vault y no se
// exponen jamás al navegador. Se exige JWT de usuario real (aunque no se
// use para nada más) para que solo la propia familia autenticada pueda
// gastar cuota del plan gratuito.
//
// FatSecret firma OAuth 2.0 (client_credentials) exige una IP en lista
// blanca, y las Edge Functions de Supabase no tienen IP fija (bug real
// detectado en producción: "Invalid IP address detected"). Por eso se
// usa aquí el método clásico OAuth 1.0a de dos piernas (firma
// HMAC-SHA1 con Consumer Key/Secret) — CUIDADO: son credenciales
// DISTINTAS de las de OAuth 2.0 (Client ID/Secret), hay que generarlas
// aparte en el panel de FatSecret y guardarlas también en Vault.
//
// Cachea en food_cache los detalles nutricionales ya consultados (los
// datos de un alimento no cambian) para no repetir food.get de más y
// quedarse cómodamente por debajo del límite del plan gratuito, tal y
// como pide la skill.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const FATSECRET_API_URL = "https://platform.fatsecret.com/rest/server.api"

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

// Percent-encoding estricto RFC 3986 que exige OAuth 1.0 — encodeURIComponent
// por sí solo no escapa !*'(), así que hay que rematarlo a mano.
function oauthEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
}

function base64FromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ])
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data))
  return base64FromBuffer(sig)
}

// Firma en dos piernas (sin token de usuario, solo Consumer Key/Secret) —
// es lo que FatSecret llama "OAuth 1.0 sin autorización de usuario",
// pensado justo para acceso de servidor a servidor como este.
async function fatSecretSignedUrl(
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
  }
  const allParams: Record<string, string> = { ...params, ...oauthParams }
  const sortedKeys = Object.keys(allParams).sort()
  const paramString = sortedKeys.map((k) => `${oauthEncode(k)}=${oauthEncode(allParams[k])}`).join("&")
  const baseString = `GET&${oauthEncode(FATSECRET_API_URL)}&${oauthEncode(paramString)}`
  const signingKey = `${oauthEncode(consumerSecret)}&`
  const signature = await hmacSha1(signingKey, baseString)

  const finalParams: Record<string, string> = { ...allParams, oauth_signature: signature }
  const queryString = Object.keys(finalParams)
    .map((k) => `${oauthEncode(k)}=${oauthEncode(finalParams[k])}`)
    .join("&")
  return `${FATSECRET_API_URL}?${queryString}`
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

      const url = await fatSecretSignedUrl(
        { method: "foods.search", search_expression: query, format: "json", max_results: "15" },
        clientId,
        clientSecret,
      )
      const res = await fetch(url)
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

      const url = await fatSecretSignedUrl({ method: "food.get.v2", food_id: foodId, format: "json" }, clientId, clientSecret)
      const res = await fetch(url)
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
