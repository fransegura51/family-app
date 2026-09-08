import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Lista de bancos (ASPSPs) de un país, para el selector de "Conectar
// banco" — sin esto habría que escribir el nombre exacto del banco a
// mano, y Enable Banking lo rechaza si no coincide carácter a carácter.

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

function base64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function signEnableBankingJWT(applicationId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: "JWT", alg: "RS256", kid: applicationId }
  const payload = { iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "")
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64url(signature)}`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)

    const url = new URL(req.url)
    const country = url.searchParams.get("country")
    if (!country) return json({ error: "missing country" }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const [{ data: applicationId }, { data: privateKey }] = await Promise.all([
      admin.rpc("get_app_secret", { p_name: "enablebanking_application_id" }),
      admin.rpc("get_app_secret", { p_name: "enablebanking_private_key" }),
    ])
    if (!applicationId || !privateKey) return json({ error: "not_configured" }, 500)

    const jwt = await signEnableBankingJWT(applicationId, privateKey)
    const res = await fetch(`https://api.enablebanking.com/aspsps?country=${encodeURIComponent(country)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    if (!res.ok) return json({ error: "enablebanking_error", detail: await res.text() }, 502)
    const data = await res.json()
    const aspsps = (Array.isArray(data.aspsps) ? data.aspsps : [])
      .filter((a: { psu_types?: string[] }) => a.psu_types?.includes("personal"))
      .map((a: { name: string; country: string; logo?: string }) => ({ name: a.name, country: a.country, logo: a.logo ?? null }))
      .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))

    return json({ aspsps })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
