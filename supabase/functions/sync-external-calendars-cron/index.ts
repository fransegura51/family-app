import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// pg_cron llama a esto cada hora (ver migración 0044) para sincronizar
// TODOS los calendarios externos de TODAS las familias solas, sin que
// nadie tenga que abrir la app ni tocar "Sincronizar ahora" — petición
// real: "quiero que los calendarios externos se sincronicen
// automáticamente cada hora". Autenticación propia por cabecera (no
// JWT de usuario, la llama pg_net), igual que send-due-reminders. El
// parseo de .ics es una copia de src/domain/icsParser.ts — Deno no
// puede importar directamente del frontend, así que vive aquí también;
// si se cambia uno, cambiar el otro.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

interface ParsedIcsEvent {
  uid: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  recurrenceRule: string | null
}

function unfold(text: string): string[] {
  const rawLines = text.split(/\r\n|\n|\r/)
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\")
}

function parseLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colonIdx = line.indexOf(":")
  if (colonIdx === -1) return null
  const head = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  const [name, ...paramParts] = head.split(";")
  const params: Record<string, string> = {}
  for (const p of paramParts) {
    const [k, v] = p.split("=")
    if (k && v) params[k.toUpperCase()] = v
  }
  return { name: name.toUpperCase(), params, value }
}

function parseIcsDate(value: string, isDateOnly: boolean): { iso: string; allDay: boolean } | null {
  const v = value.trim()
  if (isDateOnly || /^\d{8}$/.test(v)) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
    if (!m) return null
    const [, y, mo, d] = m
    return { iso: new Date(`${y}-${mo}-${d}T00:00:00`).toISOString(), allDay: true }
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  const iso = z
    ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toISOString()
    : new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).toISOString()
  return { iso, allDay: false }
}

const SUPPORTED_FREQ = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])

function normalizeIcsRRule(raw: string): string | null {
  const parts = Object.fromEntries(raw.split(";").map((p) => p.split("=") as [string, string]))
  const freq = parts.FREQ
  if (!freq || !SUPPORTED_FREQ.has(freq)) return null

  const out = [`FREQ=${freq}`]
  if (parts.BYDAY) out.push(`BYDAY=${parts.BYDAY}`)
  const interval = Number(parts.INTERVAL)
  if (Number.isFinite(interval) && interval > 1) out.push(`INTERVAL=${interval}`)
  if (parts.UNTIL) {
    const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/)
    if (m) out.push(`UNTIL=${m[1]}-${m[2]}-${m[3]}`)
  }
  return out.join(";")
}

function parseIcs(icsText: string): ParsedIcsEvent[] {
  const lines = unfold(icsText)
  const events: ParsedIcsEvent[] = []
  let current: Record<string, { params: Record<string, string>; value: string }> | null = null

  for (const rawLine of lines) {
    const line = parseLine(rawLine)
    if (!line) continue

    if (line.name === "BEGIN" && line.value === "VEVENT") {
      current = {}
      continue
    }
    if (line.name === "END" && line.value === "VEVENT") {
      if (current) {
        const uid = current.UID?.value ?? crypto.randomUUID()
        const summary = current.SUMMARY ? unescapeText(current.SUMMARY.value) : "(sin título)"
        const dtstart = current.DTSTART
        if (dtstart) {
          const start = parseIcsDate(dtstart.value, dtstart.params.VALUE === "DATE")
          if (start) {
            const dtend = current.DTEND
            const end = dtend ? parseIcsDate(dtend.value, dtend.params.VALUE === "DATE") : null
            const recurrenceRule = current.RRULE ? normalizeIcsRRule(current.RRULE.value) : null
            events.push({
              uid,
              title: summary,
              startAt: start.iso,
              endAt: end ? end.iso : null,
              allDay: start.allDay,
              recurrenceRule,
            })
          }
        }
      }
      current = null
      continue
    }
    if (current && line.name) {
      current[line.name] = { params: line.params, value: line.value }
    }
  }

  return events
}

Deno.serve(async (req) => {
  try {
    const providedSecret = req.headers.get("x-cron-secret")
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: expectedSecret, error: secretError } = await admin.rpc("get_app_secret", {
      p_name: "cron_shared_secret",
    })
    if (secretError || !providedSecret || providedSecret !== expectedSecret) {
      return new Response("unauthorized", { status: 401 })
    }

    const { data: feeds, error: feedsError } = await admin
      .from("external_calendar_feeds")
      .select("id, ics_url")
    if (feedsError) throw feedsError

    let synced = 0
    let failed = 0

    for (const feed of feeds ?? []) {
      try {
        const icsRes = await fetch(feed.ics_url as string)
        if (!icsRes.ok) throw new Error(`fetch_failed_${icsRes.status}`)
        const icsText = await icsRes.text()
        const parsed = parseIcs(icsText)

        const { error: deleteError } = await admin.from("external_calendar_events").delete().eq("feed_id", feed.id)
        if (deleteError) throw deleteError

        if (parsed.length > 0) {
          const { error: insertError } = await admin.from("external_calendar_events").insert(
            parsed.map((e) => ({
              feed_id: feed.id,
              uid: e.uid,
              title: e.title,
              start_at: e.startAt,
              end_at: e.endAt,
              all_day: e.allDay,
              recurrence_rule: e.recurrenceRule,
            })),
          )
          if (insertError) throw insertError
        }

        await admin
          .from("external_calendar_feeds")
          .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
          .eq("id", feed.id)
        synced++
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al sincronizar"
        await admin.from("external_calendar_feeds").update({ last_sync_error: message }).eq("id", feed.id)
        failed++
      }
    }

    return Response.json({ checked: feeds?.length ?? 0, synced, failed })
  } catch (err) {
    console.error(err)
    return new Response("internal error", { status: 500 })
  }
})
