import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Primer paso de "Conectar banco": el cliente llama con su sesión, aquí
// se arma la URL de autorización de Enable Banking (con el family_id
// metido en `state`, mismo patrón que google-calendar-oauth-start) y se
// devuelve como JSON — la propia pestaña hace window.location.href =
// url para saltar a la web del banco. No funciona hasta que la propia
// app (no cada familia) tenga su aplicación creada en
// enablebanking.com y su application_id / clave privada guardados en
// Vault (enablebanking_application_id / enablebanking_private_key) —
// devuelve "not_configured" mientras tanto.

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

// Enable Banking firma sus peticiones con un JWT RS256 propio (no es el
// JWT de Supabase) — cabecera con "kid" = application_id, firmado con
// la clave privada .pem que da su panel de control al crear la
// aplicación. Ver docs.enablebanking.com/api/quick-start.
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

    const { aspspName, aspspCountry, iban: rawIban } = await req.json()
    if (!aspspName || !aspspCountry) return json({ error: "missing aspspName/aspspCountry" }, 400)
    // IBAN opcional. Caso real (Caja Rural Central / hub Ruralvía): con el
    // consentimiento "global" (sin cuentas) el banco autoriza la sesión
    // pero devuelve CERO cuentas — comprobado 12 veces seguidas contra la
    // API de Enable Banking (status AUTHORIZED, accounts: []), mientras
    // que Sabadell sí las devuelve con la misma petición. La propia doc
    // de Enable Banking avisa: "if not set behaviour depends on the
    // bank". Con el IBAN concreto se pide un consentimiento "dedicado" a
    // esa cuenta, que es lo que estos hubs sí saben devolver.
    const iban = typeof rawIban === "string" ? rawIban.replace(/\s+/g, "").toUpperCase() : ""
    if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return json({ error: "iban_invalid" }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("family_id")
      .eq("id", userData.user.id)
      .single()
    if (profileError || !profile) return json({ error: "no family" }, 400)

    const [{ data: applicationId }, { data: privateKey }] = await Promise.all([
      admin.rpc("get_app_secret", { p_name: "enablebanking_application_id" }),
      admin.rpc("get_app_secret", { p_name: "enablebanking_private_key" }),
    ])
    if (!applicationId || !privateKey) return json({ error: "not_configured" }, 500)

    const jwt = await signEnableBankingJWT(applicationId, privateKey)
    const state = btoa(JSON.stringify({ familyId: profile.family_id, profileId: userData.user.id }))
    const redirectUrl = `${SUPABASE_URL}/functions/v1/enable-banking-auth-callback`
    const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

    const authRes = await fetch("https://api.enablebanking.com/auth", {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        access: iban
          ? { valid_until: validUntil, accounts: [{ iban }], balances: true, transactions: true }
          : { valid_until: validUntil },
        aspsp: { name: aspspName, country: aspspCountry },
        state,
        redirect_url: redirectUrl,
        psu_type: "personal",
      }),
    })
    if (!authRes.ok) {
      const detail = await authRes.text()
      return json({ error: "enablebanking_error", detail }, 502)
    }
    const authJson = await authRes.json()

    return json({ url: authJson.url })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
