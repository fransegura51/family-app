import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// pg_cron llama a esto cada hora (junto a sync-calendar-to-google-cron,
// el sentido contrario) para traer lo que cada miembro conectado haya
// apuntado en SU calendario PRINCIPAL de Google hacia calendar_events —
// petición real: "cuando ponga cosas en el calendario de Google...
// quiero que Pepa también las vea, y también me lo diga... que se ponga
// del color de Paco, no en gris". Al entrar como un evento normal
// (calendar_events, con calendar_event_members apuntando al miembro que
// lo trajo) ya funciona con todo lo que existe sin tocar nada más: el
// color por miembro, las preguntas de Pepa, marcar "hecho" y borrar una
// ocurrencia ya sabían hacerlo.
//
// Solo se lee el calendario "primary" de cada miembro (no el
// secundario "Family App" que la propia app crea para escribir) — así
// no hay riesgo de reimportarse a sí misma. Lo que SÍ se toca al
// actualizar un evento ya importado es el contenido que viene de
// Google (título, hora, repetición); lo que se haya hecho DENTRO de la
// app sobre ese evento (recordatorios, "hecho", ocurrencias borradas)
// no se toca nunca.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const SUPPORTED_FREQ = new Set(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"])

function parseGoogleRecurrence(recurrence: string[] | undefined): { rule: string | null; exceptionDates: string[] } {
  if (!recurrence || recurrence.length === 0) return { rule: null, exceptionDates: [] }

  let rule: string | null = null
  const exceptionDates: string[] = []

  for (const line of recurrence) {
    if (line.startsWith("RRULE:")) {
      const parts = Object.fromEntries(line.slice(6).split(";").map((p) => p.split("=") as [string, string]))
      const freq = parts.FREQ
      if (!freq || !SUPPORTED_FREQ.has(freq)) continue
      const out = [`FREQ=${freq}`]
      if (parts.BYDAY) out.push(`BYDAY=${parts.BYDAY}`)
      const interval = Number(parts.INTERVAL)
      if (Number.isFinite(interval) && interval > 1) out.push(`INTERVAL=${interval}`)
      if (parts.UNTIL) {
        const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/)
        if (m) out.push(`UNTIL=${m[1]}-${m[2]}-${m[3]}`)
      }
      rule = out.join(";")
    } else if (line.startsWith("EXDATE")) {
      const value = line.slice(line.indexOf(":") + 1)
      for (const v of value.split(",")) {
        const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
        if (m) exceptionDates.push(`${m[1]}-${m[2]}-${m[3]}`)
      }
    }
  }
  return { rule, exceptionDates }
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

interface GoogleEventItem {
  id: string
  status?: string
  summary?: string
  description?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  recurrence?: string[]
}

async function fetchAllPrimaryEvents(accessToken: string): Promise<GoogleEventItem[]> {
  const items: GoogleEventItem[] = []
  let pageToken: string | undefined
  do {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events")
    url.searchParams.set("singleEvents", "false")
    url.searchParams.set("maxResults", "250")
    url.searchParams.set("showDeleted", "true")
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`list_failed_${res.status}`)
    const json = await res.json()
    items.push(...(json.items ?? []))
    pageToken = json.nextPageToken
  } while (pageToken)
  return items
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

    let membersSynced = 0
    let membersFailed = 0

    for (const cred of credentials ?? []) {
      const familyId = cred.family_id as string
      const memberId = cred.member_id as string
      try {
        const accessToken = await refreshAccessToken(clientId, clientSecret, cred.refresh_token as string)
        const items = await fetchAllPrimaryEvents(accessToken)

        const { data: mappings } = await admin
          .from("google_calendar_imported_events")
          .select("google_event_id, event_id")
          .eq("member_id", memberId)
        const mappingByGoogleId = new Map((mappings ?? []).map((m) => [m.google_event_id as string, m.event_id as string]))
        const seenGoogleIds = new Set<string>()

        for (const item of items) {
          seenGoogleIds.add(item.id)
          const existingEventId = mappingByGoogleId.get(item.id)

          if (item.status === "cancelled") {
            if (existingEventId) await admin.from("calendar_events").delete().eq("id", existingEventId)
            continue
          }
          if (!item.start) continue

          const allDay = !!item.start.date
          const startAt = allDay ? new Date(`${item.start.date}T00:00:00Z`).toISOString() : new Date(item.start.dateTime!).toISOString()
          const endAt = item.end
            ? allDay
              ? new Date(`${item.end.date}T00:00:00Z`).toISOString()
              : new Date(item.end.dateTime!).toISOString()
            : null
          const { rule, exceptionDates } = parseGoogleRecurrence(item.recurrence)

          const eventFields = {
            family_id: familyId,
            title: item.summary || "(sin título)",
            description: item.description ?? null,
            start_at: startAt,
            end_at: endAt,
            all_day: allDay,
            recurrence_rule: rule,
            exception_dates: exceptionDates,
            google_source_member_id: memberId,
          }

          let eventId = existingEventId
          if (eventId) {
            await admin.from("calendar_events").update(eventFields).eq("id", eventId)
          } else {
            const { data: created, error: createError } = await admin
              .from("calendar_events")
              .insert(eventFields)
              .select("id")
              .single()
            if (createError || !created) continue
            eventId = created.id as string
            await admin.from("google_calendar_imported_events").insert({
              member_id: memberId,
              google_event_id: item.id,
              event_id: eventId,
            })
          }

          // Para que salga con el color del miembro y Pepa sepa "para
          // quién" es — igual que cualquier evento creado a mano.
          await admin
            .from("calendar_event_members")
            .upsert({ event_id: eventId, member_id: memberId }, { onConflict: "event_id,member_id" })
        }

        // Lo que ya no aparece en Google (borrado hace tiempo, fuera de
        // la ventana en la que Google sigue avisando de "cancelled")
        // se borra también aquí.
        for (const [googleId, eventId] of mappingByGoogleId) {
          if (seenGoogleIds.has(googleId)) continue
          await admin.from("calendar_events").delete().eq("id", eventId)
        }

        await admin
          .from("google_calendar_credentials")
          .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
          .eq("member_id", memberId)
        membersSynced++
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al sincronizar"
        await admin.from("google_calendar_credentials").update({ last_sync_error: message }).eq("member_id", memberId)
        membersFailed++
      }
    }

    return Response.json({ checked: credentials?.length ?? 0, synced: membersSynced, failed: membersFailed })
  } catch (err) {
    console.error(err)
    return new Response("internal error", { status: 500 })
  }
})
