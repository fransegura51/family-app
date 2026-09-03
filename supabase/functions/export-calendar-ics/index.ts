import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Exporta el calendario de la app en formato iCal, para que Google
// Calendar (Android/iPhone) o Apple Calendar se SUSCRIBAN a esta URL —
// petición real: "quiero que todos los datos que hayan en el calendario
// de la app se pasen al calendario del móvil". Es la dirección
// pública (protegida por un token largo, no por sesión — quien la pide
// es el propio Google/Apple, que no tiene ni puede tener un login de la
// app) — sin login no hay forma de exigir autenticación normal, igual
// que la "dirección secreta en formato iCal" que Google da para lo
// mismo en sentido contrario.
//
// OJO — límite real que no se puede evitar desde aquí: Google Calendar
// y Apple Calendar deciden ELLOS cada cuánto vuelven a mirar una
// suscripción por URL (normalmente una vez al día, a veces más tarde) —
// no hay forma de forzarles a mirar cada hora aunque esta función esté
// siempre al día. Un cambio hecho en la app puede tardar en verse en el
// móvil, aunque el dato ya esté disponible aquí al momento.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// Ventana de ocurrencias a exportar — bastante pasado para no perder
// contexto reciente, bastante futuro para que sirva de verdad como
// calendario, sin arriesgarse a generar miles de líneas por una
// repetición sin fin.
const WINDOW_START_DAYS = -90
const WINDOW_END_DAYS = 550

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const BYDAY_TO_JS_DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function parseRecurrenceRule(rule: string) {
  const parts = Object.fromEntries(rule.split(";").map((p) => p.split("=") as [string, string]))
  const byDay = (parts.BYDAY ?? "")
    .split(",")
    .map((code) => BYDAY_TO_JS_DAY[code])
    .filter((n): n is number => n !== undefined)
  const interval = Number(parts.INTERVAL)
  return {
    freq: parts.FREQ ?? "",
    byDay,
    skipHolidays: parts.SKIPHOLIDAYS === "1",
    until: parts.UNTIL ?? null,
    interval: Number.isFinite(interval) && interval > 1 ? interval : 1,
  }
}

// Copia fiel de expandOccurrences (src/domain/calendar.ts) — Deno no
// puede importar código del frontend, así que se replica aquí, igual
// que ya se hizo para sync-external-calendars-cron.
function expandOccurrences(
  event: { startAt: string; recurrenceRule: string | null; exceptionDates: string[] },
  rangeStartStr: string,
  rangeEndStr: string,
  holidayDates: Set<string>,
): string[] {
  const startDate = toDateStr(new Date(event.startAt))
  if (!event.recurrenceRule) {
    return startDate >= rangeStartStr && startDate <= rangeEndStr ? [startDate] : []
  }

  const rangeStart = new Date(rangeStartStr + "T00:00")
  const rangeEnd = new Date(rangeEndStr + "T00:00")
  const cursor = new Date(startDate + "T00:00")
  const results: string[] = []
  const { freq, byDay, skipHolidays, until, interval } = parseRecurrenceRule(event.recurrenceRule)

  let guard = 0
  if (freq === "WEEKLY" && byDay.length > 0) {
    const dayCursor = new Date(rangeStart < cursor ? cursor : rangeStart)
    while (dayCursor <= rangeEnd && guard < 5000) {
      const dateStr = toDateStr(dayCursor)
      if (dateStr >= startDate && byDay.includes(dayCursor.getDay())) results.push(dateStr)
      dayCursor.setDate(dayCursor.getDate() + 1)
      guard++
    }
  } else if (freq === "DAILY" || freq === "WEEKLY") {
    const stepDays = (freq === "DAILY" ? 1 : 7) * interval
    while (cursor < rangeStart && guard < 5000) {
      cursor.setDate(cursor.getDate() + stepDays)
      guard++
    }
    while (cursor <= rangeEnd && guard < 5000) {
      results.push(toDateStr(cursor))
      cursor.setDate(cursor.getDate() + stepDays)
      guard++
    }
  } else if (freq === "MONTHLY") {
    while (cursor < rangeStart && guard < 500) {
      cursor.setMonth(cursor.getMonth() + interval)
      guard++
    }
    while (cursor <= rangeEnd && guard < 500) {
      results.push(toDateStr(cursor))
      cursor.setMonth(cursor.getMonth() + interval)
      guard++
    }
  } else if (freq === "YEARLY") {
    while (cursor < rangeStart && guard < 200) {
      cursor.setFullYear(cursor.getFullYear() + interval)
      guard++
    }
    while (cursor <= rangeEnd && guard < 200) {
      results.push(toDateStr(cursor))
      cursor.setFullYear(cursor.getFullYear() + interval)
      guard++
    }
  }

  return results.filter((d) => {
    if (until && d > until) return false
    if (skipHolidays && holidayDates.has(d)) return false
    if (event.exceptionDates.includes(d)) return false
    return true
  })
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
}

function icsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function icsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "")
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00")
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")
    if (!token) return new Response("missing token", { status: 400 })

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: tokenRow, error: tokenError } = await admin
      .from("calendar_export_tokens")
      .select("family_id")
      .eq("token", token)
      .maybeSingle()
    if (tokenError || !tokenRow) return new Response("not found", { status: 404 })

    const familyId = tokenRow.family_id as string

    const [{ data: events }, { data: eventMembers }, { data: reminders }, { data: familyMembers }, { data: holidayFeeds }] =
      await Promise.all([
        admin
          .from("calendar_events")
          .select("id, title, description, start_at, end_at, all_day, recurrence_rule, exception_dates")
          .eq("family_id", familyId),
        admin.from("calendar_event_members").select("event_id, member_id"),
        admin.from("calendar_event_reminders").select("event_id, minutes_before, anchor"),
        admin.from("family_members").select("id, name").eq("family_id", familyId),
        admin.from("external_calendar_feeds").select("id").eq("family_id", familyId).eq("is_holiday_calendar", true),
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
      const { data: holidayEvents } = await admin
        .from("external_calendar_events")
        .select("start_at")
        .in("feed_id", feedIds)
      holidayDates = new Set((holidayEvents ?? []).map((e) => toDateStr(new Date(e.start_at as string))))
    }

    const today = new Date()
    const rangeStart = toDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() + WINDOW_START_DAYS))
    const rangeEnd = toDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() + WINDOW_END_DAYS))

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Family App//Calendario familiar//ES",
      "CALSCALE:GREGORIAN",
      "X-WR-CALNAME:Family App",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ]

    for (const ev of events ?? []) {
      const id = ev.id as string
      const startAt = ev.start_at as string
      const endAt = ev.end_at as string | null
      const allDay = ev.all_day as boolean
      const occurrences = expandOccurrences(
        {
          startAt,
          recurrenceRule: ev.recurrence_rule as string | null,
          exceptionDates: (ev.exception_dates as string[]) ?? [],
        },
        rangeStart,
        rangeEnd,
        holidayDates,
      )

      const timeOfDayStart = new Date(startAt)
      const timeOfDayEnd = endAt ? new Date(endAt) : null
      const durationMs = timeOfDayEnd ? timeOfDayEnd.getTime() - timeOfDayStart.getTime() : 60 * 60 * 1000

      const memberNames = membersByEvent.get(id) ?? []
      const descParts: string[] = []
      if (ev.description) descParts.push(ev.description as string)
      if (memberNames.length > 0) descParts.push(`Para: ${memberNames.join(", ")}`)
      const description = descParts.join("\\n")

      for (const occDate of occurrences) {
        lines.push("BEGIN:VEVENT")
        lines.push(`UID:${id}-${occDate}@family-app.fransegura51.github.io`)
        lines.push(`SUMMARY:${icsEscape(ev.title as string)}`)
        if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`)

        if (allDay) {
          lines.push(`DTSTART;VALUE=DATE:${icsDate(occDate)}`)
          lines.push(`DTEND;VALUE=DATE:${icsDate(addDaysStr(occDate, 1))}`)
        } else {
          // Se recoloca la hora del evento original sobre el DÍA de esta
          // ocurrencia (para las repeticiones) — misma hora, día distinto.
          const occStart = new Date(`${occDate}T00:00:00`)
          occStart.setHours(timeOfDayStart.getHours(), timeOfDayStart.getMinutes(), timeOfDayStart.getSeconds())
          const occEnd = new Date(occStart.getTime() + durationMs)
          lines.push(`DTSTART:${icsUtc(occStart.toISOString())}`)
          lines.push(`DTEND:${icsUtc(occEnd.toISOString())}`)
        }

        for (const r of remindersByEvent.get(id) ?? []) {
          lines.push("BEGIN:VALARM")
          lines.push("ACTION:DISPLAY")
          lines.push(`DESCRIPTION:${icsEscape(ev.title as string)}`)
          lines.push(r.anchor === "end" ? `TRIGGER;RELATED=END:-PT${r.minutesBefore}M` : `TRIGGER:-PT${r.minutesBefore}M`)
          lines.push("END:VALARM")
        }

        lines.push("END:VEVENT")
      }
    }

    lines.push("END:VCALENDAR")

    return new Response(lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="family-app.ics"',
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    return new Response(`error: ${String(err)}`, { status: 500 })
  }
})
