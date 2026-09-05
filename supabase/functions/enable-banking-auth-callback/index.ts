import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Enable Banking redirige aquí el navegador tras la autorización en la
// web del banco, con ?code=&state=. Sin sesión (el navegador sigue un
// redirect del banco, no un fetch de la app) — la identidad de la
// familia viaja en el propio `state`, igual que
// google-calendar-oauth-callback. Cambia el code por una sesión, guarda
// las cuentas autorizadas, y vuelve a la app.
//
// El mapeo exacto de los campos de cada cuenta (IBAN, nombre...) es la
// mejor suposición a partir de la documentación pública de Enable
// Banking — se guarda también la respuesta cruda en "raw" para no
// perder nada mientras se verifica con datos reales del sandbox.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
// URL pública de la app — a donde se vuelve tras conectar (o fallar).
const APP_RETURN_URL = "https://fransegura51.github.io/family-app/familia"

function redirectTo(status: "connected" | "error", detail?: string): Response {
  const url = new URL(APP_RETURN_URL)
  url.searchParams.set("bank", status)
  if (detail) url.searchParams.set("detail", detail)
  return new Response(null, { status: 302, headers: { Location: url.toString() } })
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
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get("code")
    const stateRaw = url.searchParams.get("state")
    const authError = url.searchParams.get("error")
    if (authError) return redirectTo("error", authError)
    if (!code || !stateRaw) return redirectTo("error", "missing_code")

    let familyId: string
    try {
      const state = JSON.parse(atob(stateRaw))
      familyId = state.familyId
      if (!familyId) throw new Error("bad state")
    } catch {
      return redirectTo("error", "bad_state")
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const [{ data: applicationId }, { data: privateKey }] = await Promise.all([
      admin.rpc("get_app_secret", { p_name: "enablebanking_application_id" }),
      admin.rpc("get_app_secret", { p_name: "enablebanking_private_key" }),
    ])
    if (!applicationId || !privateKey) return redirectTo("error", "not_configured")

    const jwt = await signEnableBankingJWT(applicationId, privateKey)
    const sessionRes = await fetch("https://api.enablebanking.com/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
    if (!sessionRes.ok) return redirectTo("error", "session_exchange_failed")
    const sessionJson = await sessionRes.json()

    const { data: connection, error: connectionError } = await admin
      .from("bank_connections")
      .insert({
        family_id: familyId,
        aspsp_name: sessionJson.aspsp?.name ?? "?",
        aspsp_country: sessionJson.aspsp?.country ?? "?",
        session_id: sessionJson.session_id,
        valid_until: sessionJson.access?.valid_until ?? null,
      })
      .select("id")
      .single()
    if (connectionError) return redirectTo("error", "save_failed")

    const accounts = Array.isArray(sessionJson.accounts) ? sessionJson.accounts : []
    for (const acc of accounts) {
      await admin.from("bank_accounts").insert({
        connection_id: connection.id,
        account_uid: acc.uid ?? acc.account_id ?? crypto.randomUUID(),
        iban: acc.account_id?.iban ?? acc.iban ?? null,
        name: acc.name ?? acc.product ?? null,
        currency: acc.currency ?? null,
        raw: acc,
      })
    }

    return redirectTo("connected")
  } catch (err) {
    console.error(err)
    return redirectTo("error", "internal")
  }
})
