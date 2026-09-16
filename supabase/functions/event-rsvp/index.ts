import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Módulo Eventos (PEPA Events) — Fase 2. Página pública de RSVP: el
// invitado no necesita cuenta ni la app instalada (petición explícita
// de la Skill), así que esta función sirve HTML en crudo directamente
// (igual que export-calendar-ics sirve un .ics en crudo) en vez de ser
// una ruta más de la SPA — evita de raíz la fragilidad ya conocida de
// GitHub Pages con enlaces profundos justo después de un salto externo
// (bug real visto varias veces esta sesión con otros redirects).
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
const APP_URL = "https://fransegura51.github.io/family-app/"

const EVENT_TYPE_LABEL: Record<string, string> = {
  cumpleanos: "🎂 Cumpleaños",
  comunion: "⛪ Comunión",
  bautizo: "👶 Bautizo",
  celebracion: "🎉 Celebración",
  boda: "💍 Boda íntima",
  personalizado: "✨ Evento",
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 40px; background: #f4f5fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2233; }
  .card { max-width: 460px; margin: 0 auto; background: white; border-radius: 20px; padding: 28px 22px; box-shadow: 0 10px 30px rgba(30,35,80,0.08); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #6b7085; font-size: 14px; line-height: 1.5; }
  .guest-for { display: inline-block; background: #eef0ff; color: #4C6EF5; font-weight: 600; font-size: 13px; padding: 6px 12px; border-radius: 999px; margin-bottom: 14px; }
  .info-line { font-size: 15px; margin: 6px 0; }
  fieldset { border: none; padding: 0; margin: 18px 0 0; }
  legend { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
  .status-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .status-options label { display: flex; align-items: center; gap: 6px; border: 2px solid #e4e6f2; border-radius: 12px; padding: 10px; font-size: 14px; cursor: pointer; }
  .status-options input { accent-color: #4C6EF5; }
  .counts-row { display: flex; gap: 10px; margin-top: 12px; }
  .counts-row label { flex: 1; font-size: 13px; }
  input[type="number"], textarea { width: 100%; margin-top: 4px; padding: 10px; border-radius: 10px; border: 1px solid #d8dae8; font-size: 15px; font-family: inherit; }
  textarea { resize: vertical; min-height: 60px; }
  button[type="submit"] { width: 100%; margin-top: 18px; background: #4C6EF5; color: white; border: none; border-radius: 12px; padding: 14px; font-size: 16px; font-weight: 600; cursor: pointer; }
  button[type="submit"]:disabled { opacity: 0.6; }
  .not-for-me { display: block; text-align: center; margin-top: 14px; font-size: 13px; color: #6b7085; background: none; border: none; text-decoration: underline; cursor: pointer; }
  .thanks { text-align: center; padding: 12px 0; }
  .thanks .big { font-size: 40px; }
  footer { text-align: center; margin-top: 22px; font-size: 12px; color: #9a9db0; }
  footer a { color: #6b7fe0; text-decoration: none; }
  #msg { display: none; }
</style>
</head>
<body>
${body}
<footer>Organizado con <a href="${APP_URL}">PEPA 🎉</a></footer>
</body>
</html>`
}

function notFoundPage(): string {
  return pageShell(
    "Invitación no encontrada",
    `<div class="card"><h1>😕 Enlace no válido</h1><p class="muted">Este enlace de invitación no existe o ya no está activo. Pide a quien te lo mandó que te pase uno nuevo.</p></div>`,
  )
}

function archivedPage(event: EventRow): string {
  return pageShell(
    event.title,
    `<div class="card"><h1>${EVENT_TYPE_LABEL[event.type] ?? "🎉"} ${escapeHtml(event.title)}</h1><p class="muted">Este evento ya ha terminado — gracias por tu respuesta en su momento.</p></div>`,
  )
}

function dateLine(event: EventRow): string {
  if (event.date_status === "pendiente" || !event.event_date) return "📅 Fecha todavía por confirmar"
  const label = event.date_status === "provisional" ? "Fecha provisional" : "Fecha"
  const time = event.event_time ? ` a las ${event.event_time.slice(0, 5)}` : ""
  return `📅 ${label}: ${event.event_date}${time}`
}

function locationLines(event: EventRow, guest: GuestRow): string[] {
  const lines: string[] = []
  if (DUAL_LOCATION_TYPES.has(event.type)) {
    const scope = guest.invite_scope ?? "ambas"
    if (scope !== "solo_celebracion" && event.ceremony_location_label) {
      lines.push(`🕊️ Ceremonia: ${escapeHtml(event.ceremony_location_label)}${event.ceremony_time ? " · " + event.ceremony_time.slice(0, 5) : ""}`)
    }
    if (scope !== "solo_ceremonia" && event.celebration_location_label) {
      lines.push(`🎉 Celebración: ${escapeHtml(event.celebration_location_label)}`)
    }
  } else if (event.venue_label) {
    lines.push(`📍 ${escapeHtml(event.venue_label)}`)
  }
  return lines
}

function formPage(event: EventRow, guest: GuestRow): string {
  const infoLines = [dateLine(event), ...locationLines(event, guest)]
  const deadline = event.rsvp_deadline ? `<p class="muted">Por favor, responde antes del ${event.rsvp_deadline}.</p>` : ""
  const statuses: { value: string; label: string }[] = [
    { value: "confirmado", label: "✅ Confirmo" },
    { value: "no_asiste", label: "❌ No podré ir" },
    { value: "no_seguro", label: "🤔 No estoy seguro" },
    { value: "pendiente", label: "⏳ Todavía no sé" },
  ]

  return pageShell(
    event.title,
    `<div class="card" id="form-card">
  <div class="guest-for">Invitación para: ${escapeHtml(guest.display_name)}</div>
  <h1>${EVENT_TYPE_LABEL[event.type] ?? "🎉"} ${escapeHtml(event.title)}</h1>
  ${infoLines.map((l) => `<p class="info-line">${l}</p>`).join("")}
  ${deadline}
  <form id="rsvp-form">
    <fieldset>
      <legend>¿Vais a poder venir?</legend>
      <div class="status-options">
        ${statuses
          .map(
            (s) =>
              `<label><input type="radio" name="status" value="${s.value}" ${guest.rsvp_status === s.value ? "checked" : ""}>${s.label}</label>`,
          )
          .join("")}
      </div>
    </fieldset>
    <div class="counts-row" id="counts-row" style="display:${guest.rsvp_status === "confirmado" ? "flex" : "none"}">
      <label>Adultos<input type="number" min="0" max="50" id="adults" value="${guest.rsvp_adults_count ?? guest.adults_count}"></label>
      <label>Niños<input type="number" min="0" max="50" id="children" value="${guest.rsvp_children_count ?? guest.children_count}"></label>
    </div>
    <label style="display:block; margin-top: 14px; font-size: 13px;">
      Nota (alergia, algún comentario...) — opcional
      <textarea id="note" maxlength="300">${escapeHtml(guest.rsvp_note ?? "")}</textarea>
    </label>
    <button type="submit" id="submit-btn">Enviar respuesta</button>
  </form>
  <button type="button" class="not-for-me" id="not-for-me-btn">Esta invitación no es para mí</button>
  <p id="msg" class="muted"></p>
</div>
<script>
  var form = document.getElementById('rsvp-form');
  var radios = form.querySelectorAll('input[name="status"]');
  var countsRow = document.getElementById('counts-row');
  function syncCounts() {
    var checked = form.querySelector('input[name="status"]:checked');
    countsRow.style.display = checked && checked.value === 'confirmado' ? 'flex' : 'none';
  }
  radios.forEach(function (r) { r.addEventListener('change', syncCounts); });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var checked = form.querySelector('input[name="status"]:checked');
    var status = checked ? checked.value : 'pendiente';
    var btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    fetch(window.location.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: status,
        adults: document.getElementById('adults').value,
        children: document.getElementById('children').value,
        note: document.getElementById('note').value,
      }),
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function () {
        document.getElementById('form-card').innerHTML =
          '<div class="thanks"><div class="big">🎉</div><h1>¡Gracias!</h1><p class="muted">Tu respuesta se ha guardado. Puedes volver a abrir este mismo enlace si necesitas cambiarla.</p></div>';
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Enviar respuesta';
        document.getElementById('msg').style.display = 'block';
        document.getElementById('msg').textContent = 'No se ha podido guardar — inténtalo otra vez en un momento.';
      });
  });

  document.getElementById('not-for-me-btn').addEventListener('click', function () {
    document.getElementById('form-card').innerHTML =
      '<h1>De acuerdo</h1><p class="muted">No hemos cambiado nada. Si crees que este enlace debería ser para ti, contacta con quien te lo mandó.</p>';
  });
</script>`,
  )
}

// Enlace abierto (Fase 4, opcional) — para eventos informales: quien
// lo recibe escribe su propio nombre y cuántos vienen, sin identidad
// previa (petición de la Skill: "type minimal identification and
// adult/child counts"). Cada envío crea un invitado nuevo, nunca
// actualiza uno existente (a diferencia del enlace personalizado).
function openFormPage(event: EventRow): string {
  const infoLines = [dateLine(event), ...locationLines(event, { invite_scope: null } as unknown as GuestRow)]
  const deadline = event.rsvp_deadline ? `<p class="muted">Por favor, responde antes del ${event.rsvp_deadline}.</p>` : ""
  return pageShell(
    event.title,
    `<div class="card" id="form-card">
  <h1>${EVENT_TYPE_LABEL[event.type] ?? "🎉"} ${escapeHtml(event.title)}</h1>
  ${infoLines.map((l) => `<p class="info-line">${l}</p>`).join("")}
  ${deadline}
  <form id="rsvp-form">
    <label style="display:block; margin-top: 14px; font-size: 13px;">
      Tu nombre (o el de tu familia/grupo)
      <input type="text" id="name" maxlength="120" required style="width:100%; margin-top:4px; padding:10px; border-radius:10px; border:1px solid #d8dae8; font-size:15px;">
    </label>
    <div class="counts-row">
      <label>Adultos<input type="number" min="0" max="50" id="adults" value="1"></label>
      <label>Niños<input type="number" min="0" max="50" id="children" value="0"></label>
    </div>
    <label style="display:block; margin-top: 14px; font-size: 13px;">
      Nota (alergia, algún comentario...) — opcional
      <textarea id="note" maxlength="300"></textarea>
    </label>
    <button type="submit" id="submit-btn">Confirmar asistencia</button>
  </form>
  <p id="msg" class="muted"></p>
</div>
<script>
  var form = document.getElementById('rsvp-form');
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = document.getElementById('name').value.trim();
    if (!name) return;
    var btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    fetch(window.location.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        adults: document.getElementById('adults').value,
        children: document.getElementById('children').value,
        note: document.getElementById('note').value,
      }),
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function () {
        document.getElementById('form-card').innerHTML =
          '<div class="thanks"><div class="big">🎉</div><h1>¡Gracias!</h1><p class="muted">Tu respuesta se ha guardado.</p></div>';
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Confirmar asistencia';
        document.getElementById('msg').style.display = 'block';
        document.getElementById('msg').textContent = 'No se ha podido guardar — inténtalo otra vez en un momento.';
      });
  });
</script>`,
  )
}

const EVENT_SELECT =
  "id, family_id, type, title, date_status, event_date, event_time, venue_label, ceremony_location_label, ceremony_time, celebration_location_label, rsvp_deadline, status"

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")
    const openToken = url.searchParams.get("open")
    if (!token && !openToken) return htmlResponse(notFoundPage(), 404)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Enlace abierto — sin invitado previo, quien lo usa crea su propia fila.
    if (openToken) {
      const { data: event } = await admin.from("events").select(EVENT_SELECT).eq("open_rsvp_token", openToken).maybeSingle()
      if (!event) return htmlResponse(notFoundPage(), 404)

      if (req.method === "POST") {
        const body = await req.json().catch(() => null)
        const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : ""
        if (!name) return jsonResponse({ error: "missing_name" }, 400)
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
        if (error) return jsonResponse({ error: "save_failed" }, 500)
        return jsonResponse({ ok: true })
      }

      if (event.status === "archivado") return htmlResponse(archivedPage(event as EventRow))
      return htmlResponse(openFormPage(event as EventRow))
    }

    const { data: guest } = await admin
      .from("event_guests")
      .select("id, event_id, display_name, adults_count, children_count, invite_scope, rsvp_status, rsvp_adults_count, rsvp_children_count, rsvp_note")
      .eq("rsvp_token", token)
      .maybeSingle()
    if (!guest) return htmlResponse(notFoundPage(), 404)

    const { data: event } = await admin.from("events").select(EVENT_SELECT).eq("id", guest.event_id).maybeSingle()
    if (!event) return htmlResponse(notFoundPage(), 404)

    if (req.method === "POST") {
      const body = await req.json().catch(() => null)
      const validStatuses = ["pendiente", "confirmado", "no_asiste", "no_seguro"]
      const status = body && validStatuses.includes(body.status) ? body.status : null
      if (!status) return jsonResponse({ error: "bad_status" }, 400)

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
        .eq("id", guest.id)
      if (error) return jsonResponse({ error: "save_failed" }, 500)
      return jsonResponse({ ok: true })
    }

    if (event.status === "archivado") return htmlResponse(archivedPage(event as EventRow))
    return htmlResponse(formPage(event as EventRow, guest as GuestRow))
  } catch (err) {
    console.error(err)
    return htmlResponse(pageShell("Error", `<div class="card"><h1>Algo ha fallado</h1><p class="muted">Inténtalo de nuevo en un momento.</p></div>`), 500)
  }
})
