import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// pg_cron llama a esto cada hora (junto a sync-external-calendars-cron)
// para empujar los eventos de la app HACIA Google Calendar — sentido
// contrario a ese otro cron. A diferencia de la exportación por URL
// (export-calendar-ics), aquí SÍ se puede cumplir "cada hora" de
// verdad: es la propia app quien escribe en Google, no Google quien
// decide cuándo mirar. Un evento de la app = un evento nativo de
// Google (con su propio RRULE si se repite — Google expande la
// recurrencia solo, no hace falta generar cientos de instancias
// sueltas como en el .ics).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

function icsCompactDate(dateStr: string): string {
  return dateStr.replace(/-/g, "")
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Traduce nuestro recurrence_rule (RFC5545 + el SKIPHOLIDAYS=1 propio,
// que no es RRULE válido) a una RRULE que Google acepta tal cual, más
// si hay que excluir festivos.
function parseOurRule(rule: string): { freq: string; byDay: string | null; interval: number; until: string | null; skipHolidays: boolean } {
  const parts = Object.fromEntries(rule.split(";").map((p) => p.split("=") as [string, string]))
  const interval = Number(parts.INTERVAL)
  return {
    freq: parts.FREQ ?? "",
    byDay: parts.BYDAY ?? null,
    interval: Number.isFinite(interval) && interval > 1 ? interval : 1,
    until: parts.UNTIL ?? null,
    skipHolidays: parts.SKIPHOLIDAYS === "1",
  }
}

function buildGoogleRecurrence(
  rule: string,
  allDay: boolean,
  timeOfDay: { h: number; mi: number; s: number },
  holidayDates: Set<string>,
  exceptionDates: string[],
): string[] {
  const { freq, byDay, interval, until, skipHolidays } = parseOurRule(rule)
  const rruleParts = [`FREQ=${freq}`]
  if (byDay) rruleParts.push(`BYDAY=${byDay}`)
  if (interval > 1) rruleParts.push(`INTERVAL=${interval}`)
  if (until) {
    rruleParts.push(allDay ? `UNTIL=${icsCompactDate(until)}` : `UNTIL=${icsCompactDate(until)}T235959Z`)
  }
  const lines = [`RRULE:${rruleParts.join(";")}`]

  const excluded = new Set(exceptionDates)
  if (skipHolidays) for (const d of holidayDates) excluded.add(d)
  if (excluded.size > 0) {
    const values = [...excluded].map((d) => {
      if (allDay) return icsCompactDate(d)
      const hh = String(timeOfDay.h).padStart(2, "0")
      const mm = String(timeOfDay.mi).padStart(2, "0")
      const ss = String(timeOfDay.s).padStart(2, "0")
      return `${icsCompactDate(d)}T${hh}${mm}${ss}Z`
    })
    lines.push(allDay ? `EXDATE;VALUE=DATE:${values.join(",")}` : `EXDATE:${values.join(",")}`)
  }
  return lines
}

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })
  if (!res.ok) throw new Error(`refresh_failed_${res.status}`)
  const json = await res.json()
  return json.access_token as string
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

    const { data: clientId } = await admin.rpc("get_app_secret", { p_name: "google_oauth_client_id" })
    const { data: clientSecret } = await admin.rpc("get_app_secret", { p_name: "google_oauth_client_secret" })
    if (!clientId || !clientSecret) return new Response("not configured", { status: 500 })

    const { data: credentials, error: credsError } = await admin.from("google_calendar_credentials").select("*")
    if (credsError) throw credsError

    let familiesSynced = 0
    let familiesFailed = 0

    for (const cred of credentials ?? []) {
      const familyId = cred.family_id as string
      const memberId = cred.member_id as string
      try {
        const accessToken = await refreshAccessToken(clientId, clientSecret, cred.refresh_token as string)
        const calendarId = cred.google_calendar_id as string
        const gcalBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`

        const [{ data: events }, { data: eventMembers }, { data: reminders }, { data: familyMembers }, { data: holidayFeeds }, { data: mappings }] =
          await Promise.all([
            admin
              .from("calendar_events")
              .select("id, title, description, start_at, end_at, all_day, recurrence_rule, exception_dates, google_source_member_id")
              .eq("family_id", familyId),
            admin.from("calendar_event_members").select("event_id, member_id"),
            admin.from("calendar_event_reminders").select("event_id, minutes_before, anchor"),
            admin.from("family_members").select("id, name").eq("family_id", familyId),
            admin.from("external_calendar_feeds").select("id").eq("family_id", familyId).eq("is_holiday_calendar", true),
            admin.from("calendar_event_google_sync").select("event_id, google_event_id").eq("member_id", memberId),
          ])

        const memberNameById = new Map((familyMembers ?? []).map((m) => [m.id as string, m.name as string]))
        const membersByEvent = new Map<string, string[]>()
        for (const em of eventMembers ?? []) {
          const name = memberNameById.get(em.member_id as string)
          if (!name) continue
          const list = membersByEvent.get(em.event_id as string) ?? []
          list.push(name)
          membersByEvent.set(em.event_id as string, list)
        }
        const remindersByEvent = new Map<string, { minutesBefore: number; anchor: string }[]>()
        for (const r of reminders ?? []) {
          const list = remindersByEvent.get(r.event_id as string) ?? []
          list.push({ minutesBefore: r.minutes_before as number, anchor: r.anchor as string })
          remindersByEvent.set(r.event_id as string, list)
        }

        let holidayDates = new Set<string>()
        if ((holidayFeeds ?? []).length > 0) {
          const feedIds = (holidayFeeds ?? []).map((f) => f.id as string)
          const { data: holidayEvents } = await admin.from("external_calendar_events").select("start_at").in("feed_id", feedIds)
          holidayDates = new Set((holidayEvents ?? []).map((e) => toDateStr(new Date(e.start_at as string))))
        }

        const mappingByEvent = new Map((mappings ?? []).map((m) => [m.event_id as string, m.google_event_id as string]))
        const seenEventIds = new Set<string>()

        for (const ev of events ?? []) {
          // Lo que este mismo miembro importó de SU calendario de
          // Google no se le vuelve a mandar a su calendario "Family
          // App" — ya lo tiene en el principal, mandárselo otra vez
          // se vería duplicado. A los DEMÁS miembros conectados sí se
          // les manda, para que también lo vean.
          if (ev.google_source_member_id && ev.google_source_member_id === memberId) continue

          seenEventIds.add(ev.id as string)
          const allDay = ev.all_day as boolean
          const startAt = new Date(ev.start_at as string)
          const endAt = ev.end_at ? new Date(ev.end_at as string) : null
          const durationMs = endAt ? endAt.getTime() - startAt.getTime() : 60 * 60 * 1000

          const memberNames = membersByEvent.get(ev.id as string) ?? []
          const descParts: string[] = []
          if (ev.description) descParts.push(ev.description as string)
          if (memberNames.length > 0) descParts.push(`Para: ${memberNames.join(", ")}`)

          const body: Record<string, unknown> = {
            summary: ev.title,
            description: descParts.join("\n") || undefined,
            extendedProperties: { private: { family_app_event_id: ev.id } },
          }

          if (allDay) {
            const dateStr = toDateStr(startAt)
            const endDate = new Date(startAt)
            endDate.setDate(endDate.getDate() + 1)
            body.start = { date: dateStr }
            body.end = { date: toDateStr(endDate) }
          } else {
            body.start = { dateTime: startAt.toISOString() }
            body.end = { dateTime: new Date(startAt.getTime() + durationMs).toISOString() }
          }

          if (ev.recurrence_rule) {
            body.recurrence = buildGoogleRecurrence(
              ev.recurrence_rule as string,
              allDay,
              { h: startAt.getUTCHours(), mi: startAt.getUTCMinutes(), s: startAt.getUTCSeconds() },
              holidayDates,
              (ev.exception_dates as string[]) ?? [],
            )
          }

          const evReminders = remindersByEvent.get(ev.id as string) ?? []
          if (evReminders.length > 0) {
            body.reminders = {
              useDefault: false,
              overrides: evReminders.map((r) => ({
                method: "popup",
                minutes: r.anchor === "end" ? r.minutesBefore + Math.round(durationMs / 60000) : r.minutesBefore,
              })),
            }
          }

          const existingGoogleId = mappingByEvent.get(ev.id as string)
          if (existingGoogleId) {
            const res = await fetch(`${gcalBase}/${encodeURIComponent(existingGoogleId)}`, {
              method: "PATCH",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
            if (res.status === 404) {
              // Se borró a mano en Google — se recrea para no perderlo de la sincronización.
              const createRes = await fetch(gcalBase, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify(body),
              })
              if (createRes.ok) {
                const created = await createRes.json()
                await admin
                  .from("calendar_event_google_sync")
                  .upsert({ event_id: ev.id, member_id: memberId, google_event_id: created.id, updated_at: new Date().toISOString() })
              }
            }
          } else {
            const createRes = await fetch(gcalBase, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
            if (createRes.ok) {
              const created = await createRes.json()
              await admin
                .from("calendar_event_google_sync")
                .upsert({ event_id: ev.id, member_id: memberId, google_event_id: created.id, updated_at: new Date().toISOString() })
            }
          }
        }

        // Lo que ya no existe en la app pero seguía mapeado -> se borra
        // también de Google, y se limpia el mapeo.
        for (const [eventId, googleEventId] of mappingByEvent) {
          if (seenEventIds.has(eventId)) continue
          await fetch(`${gcalBase}/${encodeURIComponent(googleEventId)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          await admin.from("calendar_event_google_sync").delete().eq("event_id", eventId).eq("member_id", memberId)
        }

        await admin
          .from("google_calendar_credentials")
          .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
          .eq("member_id", memberId)
        familiesSynced++
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al sincronizar"
        await admin.from("google_calendar_credentials").update({ last_sync_error: message }).eq("member_id", memberId)
        familiesFailed++
      }
    }

    return Response.json({ checked: credentials?.length ?? 0, synced: familiesSynced, failed: familiesFailed })
  } catch (err) {
    console.error(err)
    return new Response("internal error", { status: 500 })
  }
})
