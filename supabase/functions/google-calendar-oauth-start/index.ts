import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Primer paso de "Conectar con Google": el cliente llama esto con su
// sesión, aquí se arma la URL de consentimiento de Google (con el
// family_id metido en `state`) y se devuelve como JSON — la propia
// pestaña hace `window.location.href = url` para saltar a Google. No
// se redirige directamente desde aquí porque hace falta la cabecera
// Authorization del usuario para saber de qué familia es, y una
// navegación normal del navegador no puede mandar cabeceras.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

const SCOPE = "https://www.googleapis.com/auth/calendar"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return new Response("unauthorized", { status: 401, headers: CORS_HEADERS })

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return new Response("unauthorized", { status: 401, headers: CORS_HEADERS })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("family_id")
      .eq("id", userData.user.id)
      .single()
    if (profileError || !profile) return new Response("no family", { status: 400, headers: CORS_HEADERS })

    // Cada miembro conecta SU PROPIA cuenta de Google — hace falta el
    // family_members.id de quien llama (no solo su perfil de login),
    // porque lo que importe de Google se le atribuye a él (color,
    // "para: <nombre>" al preguntarle a Pepa...).
    const { data: member, error: memberError } = await admin
      .from("family_members")
      .select("id")
      .eq("linked_profile_id", userData.user.id)
      .single()
    if (memberError || !member) return new Response("no member", { status: 400, headers: CORS_HEADERS })

    const { data: clientId, error: clientIdError } = await admin.rpc("get_app_secret", {
      p_name: "google_oauth_client_id",
    })
    if (clientIdError || !clientId) {
      return new Response(JSON.stringify({ error: "not_configured" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const state = btoa(JSON.stringify({ familyId: profile.family_id, memberId: member.id, profileId: userData.user.id }))
    const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-oauth-callback`

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    authUrl.searchParams.set("client_id", clientId)
    authUrl.searchParams.set("redirect_uri", redirectUri)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("scope", SCOPE)
    authUrl.searchParams.set("access_type", "offline")
    authUrl.searchParams.set("prompt", "consent")
    authUrl.searchParams.set("state", state)

    return new Response(JSON.stringify({ url: authUrl.toString() }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})
