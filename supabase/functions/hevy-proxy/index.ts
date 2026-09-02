import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Proxy hacia la API de Hevy (Salud física) — la clave de API vive en
// hevy_credentials, una por familia (cuenta Pro personal, no un
// secreto de toda la app), y solo esta función de servidor la lee
// jamás. Se exige JWT de usuario real para que solo la propia familia
// autenticada pueda usar su propia clave.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const HEVY_API_URL = "https://api.hevyapp.com/v1"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
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

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("family_id")
      .eq("id", userData.user.id)
      .single()
    if (profileError || !profile) return json({ error: "no_profile" }, 400)

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: cred, error: credError } = await adminClient
      .from("hevy_credentials")
      .select("api_key")
      .eq("family_id", profile.family_id)
      .maybeSingle()
    if (credError) return json({ error: "db_error" }, 500)
    if (!cred) return json({ error: "not_configured" }, 400)

    const body = await req.json()
    const action = body.action as string

    async function hevyFetch(path: string) {
      return fetch(`${HEVY_API_URL}${path}`, { headers: { "api-key": cred.api_key } })
    }

    if (action === "test") {
      const res = await hevyFetch("/user/info")
      if (!res.ok) return json({ ok: false, status: res.status })
      const data = await res.json()
      return json({ ok: true, name: data?.data?.name ?? null })
    }

    if (action === "list_workouts") {
      const page = Number.isInteger(body.page) && body.page > 0 ? body.page : 1
      const res = await hevyFetch(`/workouts?page=${page}&pageSize=10`)
      if (res.status === 401) return json({ error: "invalid_key" }, 401)
      if (!res.ok) return json({ error: "hevy_error", detail: await res.text() }, 502)
      const data = await res.json()
      return json({ workouts: data.workouts ?? [], page: data.page ?? page, pageCount: data.page_count ?? 1 })
    }

    return json({ error: "unknown action" }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
