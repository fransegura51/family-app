import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Estadísticas de Cloudflare Web Analytics para la pestaña Estadísticas del
// panel /admin de pepafamilyapp.es. Solo responde a la administradora (RPC
// is_pepa_web_admin con su sesión). La clave de Cloudflare vive aquí, en los
// secretos de la función, y nunca llega al navegador.
//
// Secretos que necesita (Supabase → Edge Functions → Secrets):
//   CF_API_TOKEN   token de API de Cloudflare con permiso Account Analytics: Read
//   CF_ACCOUNT_ID  identificador de la cuenta de Cloudflare
//   CF_SITE_TAG    el "token" del snippet de Web Analytics de pepafamilyapp.es

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })
}

const QUERY = `
query ($account: String!, $site: String!, $from: Time!, $to: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      byDay: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $site, datetime_geq: $from, datetime_leq: $to }, limit: 60, orderBy: [date_ASC]) {
        count
        sum { visits }
        dimensions { date }
      }
      byCountry: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $site, datetime_geq: $from, datetime_leq: $to }, limit: 8, orderBy: [count_DESC]) {
        count
        dimensions { countryName }
      }
      byReferrer: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $site, datetime_geq: $from, datetime_leq: $to }, limit: 8, orderBy: [count_DESC]) {
        count
        dimensions { refererHost }
      }
      byPath: rumPageloadEventsAdaptiveGroups(filter: { siteTag: $site, datetime_geq: $from, datetime_leq: $to }, limit: 8, orderBy: [count_DESC]) {
        count
        dimensions { requestPath }
      }
    }
  }
}`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })

  const url = Deno.env.get("SUPABASE_URL")
  const anon = Deno.env.get("SUPABASE_ANON_KEY")
  if (!url || !anon) return json({ error: "Falta la configuración de Supabase." }, 500)

  const sb = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
  const { data: isAdmin } = await sb.rpc("is_pepa_web_admin")
  if (isAdmin !== true) return json({ error: "No autorizado." }, 403)

  const token = Deno.env.get("CF_API_TOKEN")
  const account = Deno.env.get("CF_ACCOUNT_ID")
  const site = Deno.env.get("CF_SITE_TAG")
  if (!token || !account || !site) return json({ configured: false })

  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { account, site, from: from.toISOString(), to: to.toISOString() } }),
    })
    const body = await res.json()
    if (!res.ok || body.errors?.length) {
      return json({ configured: true, error: body.errors?.[0]?.message ?? `Cloudflare respondió ${res.status}` })
    }
    const acc = body.data?.viewer?.accounts?.[0]
    if (!acc) return json({ configured: true, error: "Cloudflare no devolvió datos para esa cuenta." })
    return json({
      configured: true,
      days: (acc.byDay ?? []).map((r: any) => ({ day: r.dimensions.date, views: r.count, visits: r.sum?.visits ?? 0 })),
      countries: (acc.byCountry ?? []).map((r: any) => ({ name: r.dimensions.countryName || "Desconocido", views: r.count })),
      referrers: (acc.byReferrer ?? []).map((r: any) => ({ name: r.dimensions.refererHost || "Directo", views: r.count })),
      paths: (acc.byPath ?? []).map((r: any) => ({ name: r.dimensions.requestPath || "/", views: r.count })),
    })
  } catch (e) {
    return json({ configured: true, error: e instanceof Error ? e.message : "No se pudo consultar Cloudflare." })
  }
})
