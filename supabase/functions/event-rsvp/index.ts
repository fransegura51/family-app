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

// Parte B (migración 0189) — desglose OPCIONAL de personas con nombre dentro de esta unidad invitada
// (event_guest_members, ya existente desde 0164). Solo se usa aquí cuando la unidad lo tiene: el flujo de
// enlace abierto (openToken, crea la unidad sobre la marcha) nunca tiene personas desglosadas todavía, así
// que no participa de nada de esto.
interface GuestMemberRow {
  id: string
  name: string
  person_type: string
  rsvp_attending: boolean | null
  menu_option_id: string | null
}

// Opciones de menú seleccionables (event_menu_options) — solo se exponen cuando la decisión "¿elegirán
// menú en la invitación?" (event_decisions, invitados.menu_invitacion) está en "sí" Y la unidad tiene
// personas desglosadas; si no hay opciones todavía (fase "Comida y celebración" sin construir) o la
// decisión no es "sí", el RSVP no bloquea ni inventa nada.
interface MenuOptionRow {
  id: string
  name: string
  // Fase "Comida y bebida" (migración 0192): a quién va dirigida la opción. 'todos' por defecto, así que
  // cualquier opción anterior sigue viéndola todo el mundo.
  audience: string
}

// Una opción dirigida a 'adultos' o 'ninos' solo se ofrece a esa clase de persona. Una persona de tipo
// desconocido solo ve (y solo puede elegir) opciones para 'todos' — nunca se adivina.
function optionAppliesToPerson(audience: string | null | undefined, personType: string | null | undefined): boolean {
  const a = audience ?? "todos"
  if (a === "adultos") return personType === "adulto"
  if (a === "ninos") return personType === "nino"
  return true
}

// "📋 Preguntas a los invitados" (migración 0190) — capacidad genérica, deliberadamente aparte de la
// elección de menú. Solo se exponen las preguntas ACTIVAS; scope "persona" responde cada
// event_guest_members, scope "invitacion" responde la propia unidad (member_id siempre null).
interface GuestQuestionRow {
  id: string
  prompt: string
  scope: string
  required: boolean
}
interface GuestQuestionOptionRow {
  id: string
  question_id: string
  label: string
}
interface GuestQuestionAnswerRow {
  question_id: string
  member_id: string | null
  option_id: string | null
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

// Fallback heredado — se mantiene INTACTA, byte a byte: es el camino que debe seguir funcionando
// exactamente igual para cualquier evento que todavía no tenga event_moments reales (Fase 1/Cierre Fase 2).
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

// Cierre de Fase 2 — cuando el evento ya tiene event_moments reales, la página pública debe leer de ahí,
// no de los campos heredados (que pueden haber quedado desactualizados en cuanto se edita un momento
// desde la nueva UI de Gestionar evento/Configurador). Solo se exponen los campos que el invitado
// necesita (título, fecha, hora, lugar mostrado, dirección legible cuando existe) — nunca coordenadas,
// nunca place_id (esta página hoy no pinta ningún mapa; exponerlos sin que nada los use sería "campo
// interno de más" sin sentido), nunca ningún otro campo interno. Un momento nunca se identifica por su
// título literal: solo se usa como texto. Cierre de Fase 2 (Google Maps): location_address se añade a la
// consulta, pero NO como campo nuevo del JSON público — se concatena dentro del mismo "label" de texto
// que ya existía, mismo criterio que momentsLocationLines en src/domain/events.ts.
interface MomentRow {
  id: string
  title: string
  moment_date: string | null
  moment_time: string | null
  location_label: string | null
  location_address: string | null
  // Migración 0193: estado de la fecha de este momento; null = hereda el del evento.
  date_status: string | null
}

function momentsLocationLines(moments: MomentRow[], eventDateStatus: string): { icon: string; label: string }[] {
  const lines: { icon: string; label: string }[] = []
  let lastDate: string | null = null
  for (const m of moments) {
    if (m.moment_date && m.moment_date !== lastDate) {
      const weekday = new Date(`${m.moment_date}T00:00`).toLocaleDateString("es-ES", { weekday: "long" })
      const [y, mo, d] = m.moment_date.split("-")
      // Una fecha provisional nunca debe parecer cerrada: sin estado propio hereda el del evento.
      const status = m.date_status === "provisional" || m.date_status === "confirmada" ? m.date_status : eventDateStatus === "confirmada" ? "confirmada" : "provisional"
      const provisional = status === "provisional" ? " (fecha provisional)" : ""
      lines.push({ icon: "📅", label: `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d}/${mo}/${y}${provisional}` })
      lastDate = m.moment_date
    }
    const time = m.moment_time ? ` · ${m.moment_time.slice(0, 5)}` : ""
    const location = m.location_label ? `: ${m.location_label}${m.location_address ? " — " + m.location_address : ""}` : ""
    lines.push({ icon: "📍", label: `${m.title}${location}${time}` })
  }
  return lines
}

// Compatibilidad — mismo criterio que resolveGuestInvitedMoments (src/domain/events.ts, Fase 1): enlaces
// explícitos de event_guest_moments mandan siempre que existan; sin ellos, se deriva de invite_scope. Esa
// comparación de título SOLO tiene sentido aquí porque el backfill de la Fase 1 nombró esos 2 momentos
// heredados literalmente "Ceremonia"/"Celebración" — no es una regla general de identificar por título.
function visibleMomentsForGuest(moments: MomentRow[], guestMomentIds: Set<string> | null, inviteScope: string | null): MomentRow[] {
  if (guestMomentIds && guestMomentIds.size > 0) return moments.filter((m) => guestMomentIds.has(m.id))
  const scope = inviteScope ?? "ambas"
  if (scope === "solo_ceremonia") return moments.filter((m) => m.title === "Ceremonia")
  if (scope === "solo_celebracion") return moments.filter((m) => m.title === "Celebración")
  return moments
}

async function resolveLocationLines(
  admin: ReturnType<typeof createClient>,
  event: EventRow,
  guest: Pick<GuestRow, "invite_scope"> | null,
  guestId: string | null,
): Promise<{ icon: string; label: string }[]> {
  const { data: momentsData } = await admin
    .from("event_moments")
    .select("id, title, moment_date, moment_time, location_label, location_address, date_status")
    .eq("event_id", event.id)
    .order("sort_order", { ascending: true })
  const moments = (momentsData ?? []) as MomentRow[]
  if (moments.length === 0) return locationLines(event, guest)

  let guestMomentIds: Set<string> | null = null
  if (guestId) {
    const { data: links } = await admin.from("event_guest_moments").select("moment_id").eq("guest_id", guestId)
    guestMomentIds = new Set((links ?? []).map((l) => l.moment_id as string))
  }
  return momentsLocationLines(visibleMomentsForGuest(moments, guestMomentIds, guest?.invite_scope ?? null), event.date_status)
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
      const openLines = await resolveLocationLines(admin, ev, null, null)
      return json({
        state: "open_form",
        event: { ...publicEvent(ev), infoLines: [...publicEvent(ev).infoLines, ...openLines] },
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

      // member_id de ESTE invitado — calculado una sola vez, lo reutilizan tanto la elección de menú por
      // persona (Parte B) como las respuestas a preguntas personalizadas (scope "persona") de más abajo.
      let ownMemberTypes: Map<string, string> | null = null
      async function resolveOwnMemberTypes(): Promise<Map<string, string>> {
        if (!ownMemberTypes) {
          const { data: ownMembersData } = await admin.from("event_guest_members").select("id, person_type").eq("guest_id", g.id)
          ownMemberTypes = new Map((ownMembersData ?? []).map((m) => [m.id as string, m.person_type as string]))
        }
        return ownMemberTypes
      }
      async function resolveOwnMemberIds(): Promise<Set<string>> {
        return new Set((await resolveOwnMemberTypes()).keys())
      }

      // Elección por persona (Parte B, migración 0189) — solo si la unidad tiene personas desglosadas y el
      // cuerpo trae de verdad un array "members"; sin RLS aquí (rol de servicio), así que la pertenencia de
      // cada member_id a ESTE invitado, y de cada menu_option_id a ESTE evento, se comprueba a mano.
      if (Array.isArray(body.members) && body.members.length > 0) {
        const ownTypes = await resolveOwnMemberTypes()
        const own = new Set(ownTypes.keys())
        let validOptions: Map<string, string> | null = null

        for (const entry of body.members) {
          const memberId = typeof entry?.id === "string" ? entry.id : null
          if (!memberId || !own.has(memberId)) continue
          const attending = typeof entry.attending === "boolean" ? entry.attending : null
          let menuOptionId: string | null = typeof entry.menuOptionId === "string" ? entry.menuOptionId : null
          if (menuOptionId) {
            if (!validOptions) {
              const { data: optionsData } = await admin.from("event_menu_options").select("id, audience").eq("event_id", ev.id)
              validOptions = new Map((optionsData ?? []).map((o) => [o.id as string, o.audience as string]))
            }
            // La opción debe existir en ESTE evento y estar dirigida a esta clase de persona (adulto/niño).
            if (!validOptions.has(menuOptionId) || !optionAppliesToPerson(validOptions.get(menuOptionId), ownTypes.get(memberId))) menuOptionId = null
          }
          await admin.from("event_guest_members").update({ rsvp_attending: attending, menu_option_id: menuOptionId }).eq("id", memberId)
        }
      }

      // "📋 Preguntas a los invitados" (migración 0190) — capacidad genérica, totalmente aparte de la
      // elección de menú. Cada entrada se valida a mano, sin confiar nunca en lo que manda el cliente:
      // la pregunta debe ser de ESTE evento y estar activa; si es scope "persona", member_id debe ser de
      // ESTE invitado (mismo resolveOwnMemberIds de arriba); si es "invitacion", nunca lleva member_id; la
      // opción elegida debe pertenecer a ESA pregunta. Nunca genera Preparativo/Presupuesto/Proveedor —
      // solo recoge información.
      if (Array.isArray(body.questionAnswers) && body.questionAnswers.length > 0) {
        const { data: activeQuestionsData } = await admin.from("event_guest_questions").select("id, scope, required").eq("event_id", ev.id).eq("active", true)
        const questionsById = new Map((activeQuestionsData ?? []).map((q) => [q.id as string, q as { id: string; scope: string; required: boolean }]))

        for (const entry of body.questionAnswers) {
          const questionId = typeof entry?.questionId === "string" ? entry.questionId : null
          const question = questionId ? questionsById.get(questionId) : undefined
          if (!question) continue
          const optionId = typeof entry.optionId === "string" ? entry.optionId : null
          if (!optionId) continue
          const { data: validOption } = await admin.from("event_guest_question_options").select("id").eq("id", optionId).eq("question_id", question.id).maybeSingle()
          if (!validOption) continue

          let memberId: string | null = null
          if (question.scope === "persona") {
            const candidate = typeof entry.memberId === "string" ? entry.memberId : null
            const own = await resolveOwnMemberIds()
            if (!candidate || !own.has(candidate)) continue
            memberId = candidate
          }

          let existingQuery = admin.from("event_guest_question_answers").select("id").eq("question_id", question.id)
          existingQuery = memberId ? existingQuery.eq("member_id", memberId) : existingQuery.is("member_id", null).eq("guest_id", g.id)
          const { data: existing } = await existingQuery.maybeSingle()
          if (existing) {
            await admin.from("event_guest_question_answers").update({ option_id: optionId, updated_at: new Date().toISOString() }).eq("id", existing.id)
          } else {
            await admin.from("event_guest_question_answers").insert({
              question_id: question.id,
              event_id: ev.id,
              family_id: ev.family_id,
              guest_id: g.id,
              member_id: memberId,
              option_id: optionId,
            })
          }
        }
      }

      return json({ ok: true })
    }

    if (ev.status === "archivado") return json({ state: "archived", event: publicEvent(ev) })
    const guestLines = await resolveLocationLines(admin, ev, g, g.id)

    const { data: membersData } = await admin
      .from("event_guest_members")
      .select("id, name, person_type, rsvp_attending, menu_option_id")
      .eq("guest_id", g.id)
      .order("sort_order", { ascending: true })
    const members = (membersData ?? []) as GuestMemberRow[]

    // Ajuste de UX (tras validación manual) — esta misma clave ("invitados.menu_invitacion") ahora envuelve
    // la pregunta genérica "¿Preguntas para los invitados?"; "sí" por sí solo ya no implica menú, salvo en
    // filas GUARDADAS ANTES de este ajuste (wantsMenu ausente) — exactamente lo que significaba entonces
    // "sí" sin ambigüedad. Mismo criterio que effectiveWantsMenu en src/domain/eventGuestDecisions.ts.
    const { data: menuDecision } = await admin
      .from("event_decisions")
      .select("answer")
      .eq("event_id", ev.id)
      .eq("block_key", "invitados")
      .eq("question_key", "invitados.menu_invitacion")
      .maybeSingle()
    const menuAnswer = menuDecision?.answer as { choice?: string; wantsMenu?: boolean } | null
    const menuChoiceActive = menuAnswer?.choice === "si" && menuAnswer?.wantsMenu !== false

    let menuOptions: MenuOptionRow[] = []
    if (menuChoiceActive && members.length > 0) {
      const { data: optionsData } = await admin.from("event_menu_options").select("id, name, audience").eq("event_id", ev.id).order("sort_order", { ascending: true })
      menuOptions = (optionsData ?? []) as MenuOptionRow[]
    }

    // "📋 Preguntas a los invitados" — solo las ACTIVAS, con sus opciones y la respuesta que esta unidad
    // (o sus personas, si scope "persona") ya hubiera guardado antes.
    const { data: guestQuestionsData } = await admin
      .from("event_guest_questions")
      .select("id, prompt, scope, required")
      .eq("event_id", ev.id)
      .eq("active", true)
      .order("sort_order", { ascending: true })
    const guestQuestions = (guestQuestionsData ?? []) as GuestQuestionRow[]

    let guestQuestionOptions: GuestQuestionOptionRow[] = []
    let guestQuestionAnswers: GuestQuestionAnswerRow[] = []
    if (guestQuestions.length > 0) {
      const questionIds = guestQuestions.map((q) => q.id)
      const [{ data: optionsData }, { data: answersData }] = await Promise.all([
        admin.from("event_guest_question_options").select("id, question_id, label").in("question_id", questionIds).order("sort_order", { ascending: true }),
        admin.from("event_guest_question_answers").select("question_id, member_id, option_id").eq("guest_id", g.id).in("question_id", questionIds),
      ])
      guestQuestionOptions = (optionsData ?? []) as GuestQuestionOptionRow[]
      guestQuestionAnswers = (answersData ?? []) as GuestQuestionAnswerRow[]
    }

    return json({
      state: "form",
      event: { ...publicEvent(ev), infoLines: [...publicEvent(ev).infoLines, ...guestLines] },
      guest: {
        displayName: g.display_name,
        adultsCount: g.adults_count,
        childrenCount: g.children_count,
        rsvpStatus: g.rsvp_status,
        rsvpAdultsCount: g.rsvp_adults_count,
        rsvpChildrenCount: g.rsvp_children_count,
        rsvpNote: g.rsvp_note,
        members: members.map((m) => ({ id: m.id, name: m.name, personType: m.person_type, rsvpAttending: m.rsvp_attending, menuOptionId: m.menu_option_id })),
        menuOptions: menuOptions.map((o) => ({ id: o.id, name: o.name, audience: o.audience })),
        questions: guestQuestions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          scope: q.scope,
          required: q.required,
          options: guestQuestionOptions.filter((o) => o.question_id === q.id).map((o) => ({ id: o.id, label: o.label })),
          answers: guestQuestionAnswers.filter((a) => a.question_id === q.id).map((a) => ({ memberId: a.member_id, optionId: a.option_id })),
        })),
      },
    })
  } catch (err) {
    console.error(err)
    return json({ error: "server_error" }, 500)
  }
})
