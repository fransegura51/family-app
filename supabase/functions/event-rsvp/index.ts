import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Módulo Eventos (PEPA Events) — Fase 2. Página pública de RSVP: el
// invitado no necesita cuenta ni la app instalada.
//
// Bug real: esta función servía HTML en crudo directamente (para que
// el invitado nunca arrancase la SPA) — pero Supabase reescribe la
// cabecera Content-Type de CUALQUIER función edge a "text/plain" y le
// añade una Content-Security-Policy en modo sandbox (para que ninguna
// función pueda servir HTML "de verdad" bajo el dominio compartido
// *.supabase.co, por riesgo de phishing entre proyectos de distintos
// clientes) — así que el móvil trataba la página como un archivo para
// descargar ("event-rsvp.txt") en vez de abrirla. Esta función ahora
// solo devuelve JSON; quien la sirve de verdad es RsvpScreen (ver
// src/ui/RsvpScreen.tsx), una ruta pública de la propia SPA (bypasa el
// login en App.tsx) — enlace de la forma
// "https://.../family-app/?rsvp=TOKEN", por la RAÍZ ("/"), que en
// GitHub Pages es un archivo real sin el truco de 404.html de por
// medio (mismo motivo que el regreso del banco vuelve siempre a "/":
// el salto doble 404→index tras un enlace externo largo en móvil, con
// la red recién "despertando", es justo el más frágil de todos).
//
// Autenticación: el token de 24 bytes en la URL (event_guests.rsvp_token,
// mismo patrón que calendar_export_tokens) es la única identificación —
// sin JWT, con el rol de servicio, así que aquí hay que reimplementar a
// mano qué es público (evento, invitado, su propia respuesta) y qué NO
// lo es nunca (presupuesto, regalos recibidos, notas internas, otros
// invitados).
//
// verify_jwt = false a propósito — mismo motivo que
// sync-external-calendars-cron: la llamada no lleva Authorization.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
}

const DUAL_LOCATION_TYPES = new Set(["comunion", "bautizo", "boda"])

interface EventRow {
  id: string
  family_id: string
  type: string
  title: string
  date_status: string
  event_date: string | null
  event_time: string | null
  venue_label: string | null
  ceremony_location_label: string | null
  ceremony_time: string | null
  celebration_location_label: string | null
  rsvp_deadline: string | null
  status: string
}

interface GuestRow {
  id: string
  display_name: string
  adults_count: number
  children_count: number
  invite_scope: string | null
  rsvp_status: string
  rsvp_adults_count: number | null
  rsvp_children_count: number | null
  rsvp_note: string | null
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

// Solo los campos públicos — nunca presupuesto, pagos, regalos
// recibidos, notas internas ni otros invitados.
function publicEvent(event: EventRow) {
  const lines: { icon: string; label: string }[] = []
  if (event.date_status === "pendiente" || !event.event_date) {
    lines.push({ icon: "📅", label: "Fecha todavía por confirmar" })
  } else {
    const label = event.date_status === "provisional" ? "Fecha provisional" : "Fecha"
    const time = event.event_time ? ` a las ${event.event_time.slice(0, 5)}` : ""
    lines.push({ icon: "📅", label: `${label}: ${event.event_date}${time}` })
  }
  return {
    type: event.type,
    title: event.title,
    dateStatus: event.date_status,
    infoLines: lines,
    rsvpDeadline: event.rsvp_deadline,
    status: event.status,
  }
}

function locationLines(event: EventRow, guest: Pick<GuestRow, "invite_scope"> | null): { icon: string; label: string }[] {
  const lines: { icon: string; label: string }[] = []
  if (DUAL_LOCATION_TYPES.has(event.type)) {
    const scope = guest?.invite_scope ?? "ambas"
    if (scope !== "solo_celebracion" && event.ceremony_location_label) {
      lines.push({
        icon: "🕊️",
        label: `Ceremonia: ${event.ceremony_location_label}${event.ceremony_time ? " · " + event.ceremony_time.slice(0, 5) : ""}`,
      })
    }
    if (scope !== "solo_ceremonia" && event.celebration_location_label) {
      lines.push({ icon: "🎉", label: `Celebración: ${event.celebration_location_label}` })
    }
  } else if (event.venue_label) {
    lines.push({ icon: "📍", label: event.venue_label })
  }
  return lines
}

const EVENT_SELECT =
  "id, family_id, type, title, date_status, event_date, event_time, venue_label, ceremony_location_label, ceremony_time, celebration_location_label, rsvp_deadline, status"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")
    const openToken = url.searchParams.get("open")
    if (!token && !openToken) return json({ error: "not_found" }, 404)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Enlace abierto — sin invitado previo, quien lo usa crea su propia fila.
    if (openToken) {
      const { data: event } = await admin.from("events").select(EVENT_SELECT).eq("open_rsvp_token", openToken).maybeSingle()
      if (!event) return json({ error: "not_found" }, 404)

      if (req.method === "POST") {
        const body = await req.json().catch(() => null)
        const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : ""
        if (!name) return json({ error: "missing_name" }, 400)
        const clamp = (n: unknown) => Math.max(0, Math.min(50, Math.round(Number(n)) || 0))
        const note = typeof body.note === "string" ? body.note.slice(0, 300) || null : null

        const { error } = await admin.from("event_guests").insert({
          event_id: event.id,
          family_id: event.family_id,
          display_name: name,
          adults_count: clamp(body.adults) || 1,
          children_count: clamp(body.children),
          rsvp_status: "confirmado",
          rsvp_adults_count: clamp(body.adults) || 1,
          rsvp_children_count: clamp(body.children),
          rsvp_note: note,
          rsvp_responded_at: new Date().toISOString(),
          sort_order: Date.now(),
        })
        if (error) return json({ error: "save_failed" }, 500)
        return json({ ok: true })
      }

      const ev = event as EventRow
      if (ev.status === "archivado") return json({ state: "archived", event: publicEvent(ev) })
      return json({
        state: "open_form",
        event: { ...publicEvent(ev), infoLines: [...publicEvent(ev).infoLines, ...locationLines(ev, null)] },
      })
    }

    const { data: guest } = await admin
      .from("event_guests")
      .select("id, event_id, display_name, adults_count, children_count, invite_scope, rsvp_status, rsvp_adults_count, rsvp_children_count, rsvp_note")
      .eq("rsvp_token", token)
      .maybeSingle()
    if (!guest) return json({ error: "not_found" }, 404)

    const { data: event } = await admin.from("events").select(EVENT_SELECT).eq("id", guest.event_id).maybeSingle()
    if (!event) return json({ error: "not_found" }, 404)
    const ev = event as EventRow
    const g = guest as GuestRow

    if (req.method === "POST") {
      const body = await req.json().catch(() => null)
      const validStatuses = ["pendiente", "confirmado", "no_asiste", "no_seguro"]
      const status = body && validStatuses.includes(body.status) ? body.status : null
      if (!status) return json({ error: "bad_status" }, 400)

      const clamp = (n: unknown) => Math.max(0, Math.min(50, Math.round(Number(n)) || 0))
      const note = typeof body.note === "string" ? body.note.slice(0, 300) || null : null

      const { error } = await admin
        .from("event_guests")
        .update({
          rsvp_status: status,
          rsvp_responded_at: new Date().toISOString(),
          rsvp_adults_count: status === "confirmado" ? clamp(body.adults) : null,
          rsvp_children_count: status === "confirmado" ? clamp(body.children) : null,
          rsvp_note: note,
        })
        .eq("id", g.id)
      if (error) return json({ error: "save_failed" }, 500)
      return json({ ok: true })
    }

    if (ev.status === "archivado") return json({ state: "archived", event: publicEvent(ev) })
    return json({
      state: "form",
      event: { ...publicEvent(ev), infoLines: [...publicEvent(ev).infoLines, ...locationLines(ev, g)] },
      guest: {
        displayName: g.display_name,
        adultsCount: g.adults_count,
        childrenCount: g.children_count,
        rsvpStatus: g.rsvp_status,
        rsvpAdultsCount: g.rsvp_adults_count,
        rsvpChildrenCount: g.rsvp_children_count,
        rsvpNote: g.rsvp_note,
      },
    })
  } catch (err) {
    console.error(err)
    return json({ error: "server_error" }, 500)
  }
})
