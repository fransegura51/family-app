import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Descarga el texto .ics de un calendario externo (Google/Outlook/
// Apple...) — solo hace falta esta función porque el navegador no puede
// leer esas URLs directamente por CORS. No hay ningún secreto que
// proteger aquí (la URL ya es del propio usuario), así que se usa el
// cliente "como el usuario que llama" para todo: RLS ya garantiza que
// solo puede leer feeds de su propia familia.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

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

    const { feedId } = await req.json()
    if (!feedId) return json({ error: "missing feedId" }, 400)

    // RLS ya limita esto a feeds de la propia familia del usuario.
    const { data: feed, error: feedError } = await userClient
      .from("external_calendar_feeds")
      .select("ics_url")
      .eq("id", feedId)
      .single()
    if (feedError || !feed) return json({ error: "feed_not_found" }, 404)

    const icsRes = await fetch(feed.ics_url)
    if (!icsRes.ok) return json({ error: "fetch_failed", status: icsRes.status }, 502)

    const icsText = await icsRes.text()
    return json({ icsText })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
