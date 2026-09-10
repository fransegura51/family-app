import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// "Desconectar" en Economía > Banco. Antes el cliente solo marcaba la
// fila como "revoked" y el consentimiento seguía vivo en Enable Banking
// y en el banco (bug real: 12 sesiones autorizadas huérfanas de Caja
// Rural acumuladas en un solo día). Aquí se cierra de verdad con
// DELETE /sessions/{id} ("PSU's bank consent will be closed
// automatically if possible", según su doc) y solo después se marca en
// nuestra tabla. Si Enable Banking ya la da por caducada (401
// EXPIRED_SESSION) se considera cerrada igualmente.

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

    const { connectionId } = await req.json()
    if (typeof connectionId !== "string" || !connectionId) return json({ error: "missing connectionId" }, 400)

    // La conexión tiene que ser de la familia de quien llama — se
    // comprueba con el cliente del usuario (RLS por family_id), no con
    // el service role.
    const { data: connection, error: connectionError } = await userClient
      .from("bank_connections")
      .select("id, session_id, status")
      .eq("id", connectionId)
      .maybeSingle()
    if (connectionError) return json({ error: connectionError.message }, 500)
    if (!connection) return json({ error: "not_found" }, 404)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    let closedRemotely = false
    if (connection.session_id) {
      const [{ data: applicationId }, { data: privateKey }] = await Promise.all([
        admin.rpc("get_app_secret", { p_name: "enablebanking_application_id" }),
        admin.rpc("get_app_secret", { p_name: "enablebanking_private_key" }),
      ])
      if (applicationId && privateKey) {
        const jwt = await signEnableBankingJWT(applicationId, privateKey)
        const res = await fetch(`https://api.enablebanking.com/sessions/${connection.session_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${jwt}` },
        })
        closedRemotely = res.ok || res.status === 401 || res.status === 404
        if (!closedRemotely) {
          const detail = await res.text()
          return json({ error: "enablebanking_error", detail }, 502)
        }
      }
    }

    const { error: updateError } = await admin
      .from("bank_connections")
      .update({ status: "revoked" })
      .eq("id", connectionId)
    if (updateError) return json({ error: updateError.message }, 500)

    return json({ ok: true, closedRemotely })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
