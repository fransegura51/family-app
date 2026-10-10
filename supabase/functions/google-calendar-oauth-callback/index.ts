import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Google redirige aquí el navegador tras el consentimiento, con ?code=
// y el ?state= que se mandó en google-calendar-oauth-start. Sin sesión
// (es el navegador siguiendo un redirect de Google, no un fetch de la
// app) — la identidad de la familia viaja en el propio `state`, no por
// Authorization. Cambia el code por tokens, crea (o reutiliza) un
// calendario secundario "Family App" dentro de Google Calendar del
// usuario — así lo que la app escribe no se mezcla con sus citas
// propias — y guarda el refresh_token. Termina redirigiendo de vuelta
// a la app.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
// URL pública de la app — a donde se vuelve tras conectar (o fallar).
// GitHub Pages, con el basename del router (ver App.tsx).
const APP_RETURN_URL = "https://fransegura51.github.io/family-app/calendario"

// Conexión iniciada desde la APP NATIVA (el cliente manda native y viaja en el state): al terminar se vuelve por la página puente de PEPA
// (public/volver-app.html), que abre la app con es.pepafamilyapp.app://open/…; desde el navegador se vuelve a la web como siempre.
const APP_BRIDGE_URL = "https://fransegura51.github.io/family-app/volver-app.html"

function readAppFlag(stateRaw: string | null): boolean {
  if (!stateRaw) return false
  try {
    return JSON.parse(atob(stateRaw)).app === true
  } catch {
    return false
  }
}

function redirectTo(status: "connected" | "error", detail?: string, fromApp = false): Response {
  const url = new URL(APP_RETURN_URL)
  url.searchParams.set("google", status)
  if (detail) url.searchParams.set("detail", detail)
  if (fromApp) {
    const bridge = new URL(APP_BRIDGE_URL)
    bridge.searchParams.set("to", `/calendario${url.search}`)
    return new Response(null, { status: 302, headers: { Location: bridge.toString() } })
  }
  return new Response(null, { status: 302, headers: { Location: url.toString() } })
}

Deno.serve(async (req) => {
  // Se decide al leer el state, pero se declara fuera del try para que también valga en el catch de errores inesperados.
  let fromApp = false
  const back = (status: "connected" | "error", detail?: string) => redirectTo(status, detail, fromApp)
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get("code")
    const stateRaw = url.searchParams.get("state")
    const oauthError = url.searchParams.get("error")
    fromApp = readAppFlag(stateRaw)
    if (oauthError) return back("error", oauthError)
    if (!code || !stateRaw) return back("error", "missing_code")

    let familyId: string
    let memberId: string
    let profileId: string
    try {
      const state = JSON.parse(atob(stateRaw))
      familyId = state.familyId
      memberId = state.memberId
      profileId = state.profileId
      if (!familyId || !memberId || !profileId) throw new Error("bad state")
    } catch {
      return back("error", "bad_state")
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: clientId } = await admin.rpc("get_app_secret", { p_name: "google_oauth_client_id" })
    const { data: clientSecret } = await admin.rpc("get_app_secret", { p_name: "google_oauth_client_secret" })
    if (!clientId || !clientSecret) return back("error", "not_configured")

    const redirectUri = `${SUPABASE_URL}/functions/v1/google-calendar-oauth-callback`
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })
    if (!tokenRes.ok) return back("error", "token_exchange_failed")
    const tokenJson = await tokenRes.json()
    const accessToken = tokenJson.access_token as string
    const refreshToken = tokenJson.refresh_token as string | undefined
    if (!refreshToken) return back("error", "no_refresh_token")

    // Busca un calendario secundario "Family App" ya creado en una
    // conexión anterior; si no hay, lo crea. Así una reconexión no deja
    // calendarios duplicados en su cuenta de Google.
    const listRes = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    let googleCalendarId: string | null = null
    if (listRes.ok) {
      const listJson = await listRes.json()
      const existing = (listJson.items ?? []).find((c: { summary?: string }) => c.summary === "Family App")
      if (existing) googleCalendarId = existing.id
    }
    if (!googleCalendarId) {
      const createRes = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ summary: "Family App", description: "Calendario de la app familiar" }),
      })
      if (!createRes.ok) return back("error", "calendar_create_failed")
      const createJson = await createRes.json()
      googleCalendarId = createJson.id
    }

    const { error: upsertError } = await admin.from("google_calendar_credentials").upsert({
      member_id: memberId,
      family_id: familyId,
      refresh_token: refreshToken,
      google_calendar_id: googleCalendarId,
      connected_by: profileId,
      updated_at: new Date().toISOString(),
      last_sync_error: null,
    })
    if (upsertError) return back("error", "save_failed")

    return back("connected")
  } catch (err) {
    console.error(err)
    return back("error", "internal")
  }
})
