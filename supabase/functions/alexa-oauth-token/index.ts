import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Paso 2 del account linking de Alexa (servidor a servidor — llama Amazon, nunca un navegador, así
// que sin CORS). Alexa canjea aquí el `code` de un solo uso (creado por AlexaLinkScreen en la app,
// vía mint_alexa_auth_code) por el access_token duradero de la familia. Mismo patrón de
// client_id/secret en el Vault que ya usa google-calendar-oauth-callback, pero al revés: aquí
// NOSOTROS somos el proveedor OAuth, no el cliente.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

function oauthError(error: string, status = 400): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } })
}

function parseBasicAuth(header: string | null): { clientId: string; clientSecret: string } | null {
  if (!header?.startsWith("Basic ")) return null
  try {
    const decoded = atob(header.slice("Basic ".length))
    const sep = decoded.indexOf(":")
    if (sep < 0) return null
    return { clientId: decoded.slice(0, sep), clientSecret: decoded.slice(sep + 1) }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return oauthError("method_not_allowed", 405)

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const contentType = req.headers.get("content-type") ?? ""
    const bodyText = await req.text()
    const form = contentType.includes("application/x-www-form-urlencoded")
      ? new URLSearchParams(bodyText)
      : new URLSearchParams()

    // Alexa manda client_id/secret por HTTP Basic (lo que configuramos en la consola) — se admite
    // también como campos del formulario, por si alguna configuración los manda así en su lugar.
    const basic = parseBasicAuth(req.headers.get("authorization"))
    const clientId = basic?.clientId ?? form.get("client_id")
    const clientSecret = basic?.clientSecret ?? form.get("client_secret")

    const { data: expectedId } = await admin.rpc("get_app_secret", { p_name: "alexa_skill_client_id" })
    const { data: expectedSecret } = await admin.rpc("get_app_secret", { p_name: "alexa_skill_client_secret" })
    if (!expectedId || !expectedSecret) return oauthError("server_error", 500)
    if (clientId !== expectedId || clientSecret !== expectedSecret) return oauthError("invalid_client", 401)

    if (form.get("grant_type") !== "authorization_code") return oauthError("unsupported_grant_type")
    const code = form.get("code")
    if (!code) return oauthError("invalid_request")

    const { data: accessToken, error } = await admin.rpc("redeem_alexa_auth_code", { p_code: code })
    if (error || !accessToken) return oauthError("invalid_grant")

    return new Response(
      JSON.stringify({ access_token: accessToken, token_type: "Bearer", expires_in: 31536000 }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (err) {
    console.error("[alexa-oauth-token] error:", String(err))
    return oauthError("server_error", 500)
  }
})
