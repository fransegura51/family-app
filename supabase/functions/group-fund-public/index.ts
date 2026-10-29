import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { summarizeFund, type EntryKind, type MemberState, type ContributionType } from "../_shared/groups/fundSummary.ts"

// «Gestión de grupos» → enlaces de consulta de un bote (migración 0352). Página pública para una familia SIN cuenta PEPA. Mismo patrón que event-rsvp y wishlist-guest: esta función
// solo devuelve JSON; quien lo pinta es GroupFundPublicScreen (ruta pública de la SPA, "/?bote=TOKEN"). verify_jwt = false (la llamada no lleva Authorization).
//
// Autenticación: el token secreto del enlace (fund_share_links.token, revocable). Con el rol de servicio, así que aquí se define a mano qué es público y qué NO lo es NUNCA:
//   · enlace «general»: SOLO totales (previsto, recaudado, pendiente, cuántas personas han pagado). Ningún nombre, teléfono, correo, alias ni movimiento.
//   · enlace «participante»: SOLO lo suyo (su nombre identificativo, lo que se le pide, lo que lleva pagado). Nada de otras personas ni de los movimientos del bote.
//   · «Ya he pagado» solo crea un AVISO pendiente de verificar: nunca un ingreso ni marca a nadie como pagado.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

// Mismo mecanismo ya en producción que event-rsvp y wishlist-guest (rsvp_rate_limit_hit), con su propio espacio de claves.
async function underRateLimit(admin: ReturnType<typeof createClient>, req: Request, scopeKey: string, limit: number): Promise<boolean> {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "").split(",")[0].trim() || "unknown"
  const byIp = await admin.rpc("rsvp_rate_limit_hit", { p_key: "gf_ip:" + (await sha256Hex(ip)), p_limit: 60, p_window_seconds: 600 })
  if (byIp.error || byIp.data !== true) return false
  const byScope = await admin.rpc("rsvp_rate_limit_hit", { p_key: "gf:" + (await sha256Hex(scopeKey)), p_limit: limit, p_window_seconds: 600 })
  return !byScope.error && byScope.data === true
}

interface LinkRow {
  id: string
  fund_id: string
  kind: "general" | "participante"
  participant_id: string | null
  active: boolean
}
interface FundRow {
  id: string
  group_id: string
  name: string
  contribution_type: ContributionType
  default_amount: number | null
  status: "abierto" | "cerrado"
  readonly_history: boolean
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")
    if (!token || token.length < 16 || token.length > 128) return json({ error: "not_found" }, 404)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    if (!(await underRateLimit(admin, req, "tok:" + token, req.method === "POST" ? 10 : 60))) return json({ error: "rate_limited" }, 429)

    const { data: linkData } = await admin.from("fund_share_links").select("id, fund_id, kind, participant_id, active").eq("token", token).maybeSingle()
    const link = linkData as LinkRow | null
    if (!link || !link.active) return json({ error: "not_found" }, 404)
    const { data: fundData } = await admin
      .from("group_funds")
      .select("id, group_id, name, contribution_type, default_amount, status, readonly_history")
      .eq("id", link.fund_id)
      .maybeSingle()
    const fund = fundData as FundRow | null
    if (!fund) return json({ error: "not_found" }, 404)
    const { data: groupData } = await admin.from("groups").select("name, period_label, archived_at").eq("id", fund.group_id).maybeSingle()
    const groupName = (groupData?.name as string | undefined) ?? ""

    const [{ data: members }, { data: entries }] = await Promise.all([
      admin.from("fund_members").select("participant_id, state, required_amount").eq("fund_id", fund.id).limit(5000),
      admin.from("fund_entries").select("id, kind, amount, voided_at").eq("fund_id", fund.id).limit(20000),
    ])
    const entryIds = (entries ?? []).map((e) => e.id as string)
    const allocs: { entryId: string; participantId: string; amount: number }[] = []
    for (let i = 0; i < entryIds.length; i += 200) {
      const { data } = await admin.from("fund_entry_allocations").select("entry_id, participant_id, amount").in("entry_id", entryIds.slice(i, i + 200))
      for (const a of data ?? []) allocs.push({ entryId: a.entry_id as string, participantId: a.participant_id as string, amount: Number(a.amount) })
    }
    const summary = summarizeFund(
      { contributionType: fund.contribution_type, defaultAmount: fund.default_amount === null ? null : Number(fund.default_amount) },
      (members ?? []).map((m) => ({ participantId: m.participant_id as string, state: m.state as MemberState, requiredAmount: m.required_amount === null ? null : Number(m.required_amount) })),
      (entries ?? []).map((e) => ({ id: e.id as string, kind: e.kind as EntryKind, amount: Number(e.amount), voided: !!e.voided_at })),
      allocs,
    )
    const closed = fund.status === "cerrado" || fund.readonly_history || !!groupData?.archived_at

    if (link.kind === "general") {
      if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405)
      const obliged = summary.rows.filter((r) => r.state === "participa").length
      return json({
        kind: "general",
        fundName: fund.name,
        groupName,
        contributionType: fund.contribution_type,
        closed,
        expected: summary.expected,
        collected: summary.collected,
        pending: summary.pending,
        paidCount: summary.counts.pagado,
        totalCount: obliged,
      })
    }

    // Enlace de una persona: SOLO lo suyo.
    const row = summary.rows.find((r) => r.participantId === link.participant_id)
    const { data: person } = await admin.from("group_participants").select("name, surname").eq("id", link.participant_id as string).maybeSingle()
    if (!row || !person) return json({ error: "not_found" }, 404)
    const personName = [person.name, person.surname].filter(Boolean).join(" ")

    if (req.method === "GET") {
      return json({
        kind: "participante",
        fundName: fund.name,
        groupName,
        participantName: personName,
        contributionType: fund.contribution_type,
        closed,
        state: row.state,
        status: row.status,
        required: row.required,
        paid: row.paid,
        pending: row.pending,
        canNotify: !closed && row.state === "participa" && fund.contribution_type !== "voluntaria" && row.pending > 0,
      })
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => null)
      if (body?.action !== "paid") return json({ error: "bad_request" }, 400)
      if (closed || row.state !== "participa") return json({ error: "closed" }, 409)
      const { count } = await admin
        .from("fund_payment_notices")
        .select("id", { count: "exact", head: true })
        .eq("fund_id", fund.id)
        .eq("participant_id", link.participant_id as string)
        .eq("status", "pendiente")
      if ((count ?? 0) >= 3) return json({ ok: true, already: true })
      const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, 200) : ""
      const { error } = await admin.from("fund_payment_notices").insert({ fund_id: fund.id, participant_id: link.participant_id, note: note || null })
      if (error) return json({ error: "save_failed" }, 500)
      return json({ ok: true })
    }
    return json({ error: "method_not_allowed" }, 405)
  } catch (_e) {
    return json({ error: "server_error" }, 500)
  }
})
