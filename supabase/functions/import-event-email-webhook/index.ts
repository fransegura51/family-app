import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { createProvider, secretNameFor } from "../_shared/ai/providers.ts"
import { AiProviderError } from "../_shared/ai/types.ts"
import { eventFromEmailSpec, type EventFromEmailOutput } from "../_shared/ai/purposes/eventFromEmail.ts"

// Reenviar correo → evento en el calendario (petición real: "Reenviar
// correo... reenvía correos, PDF y mucho más, y crearemos los eventos
// por ti", formato de referencia FamilyWall). Mismo mecanismo que ya
// usan Amazon y Mercadona: un workflow externo (Outlook reenvía a
// Pipedream, que llama aquí) — sin sesión de usuario posible, así que
// va sin verificación de JWT y se autentica con el mismo token secreto
// de familia (families.amazon_webhook_token, ya compartido por las
// otras dos automatizaciones).
//
// Si Gemini no encuentra una fecha con la que quedarse tranquilo, NO
// se inventa un evento — se devuelve sin crear nada (mismo principio
// que el resto de la app: no inventar datos que no están claros).
//
// FASE 7.1 (F7-001) — antes llamaba a Gemini directamente, sin ningún control (ni interruptor, ni tope
// diario, ni registro de uso). Ahora pasa por ai_gate_family (mismas reglas que ai_gate, EXCEPTO la
// comprobación de cuenta adulta, que no aplica a una automatización sin usuario — ver 0153_ai_gate_family.sql).
// El AUTH del webhook (token de familia) sigue siendo obligatorio y va SIEMPRE antes: ai_gate_family nunca lo
// sustituye. Si la familia no puede gastar una llamada de IA ahora mismo, no se crea ningún evento (igual que
// si Gemini no encontrara una fecha clara) — nunca un error del webhook por eso.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

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
    const body = await req.json()
    const token: string | null = typeof body.token === "string" ? body.token : null
    const read = eventFromEmailSpec.readInput(typeof body === "object" && body !== null ? body : {})

    if (!token) return json({ error: "missing token" }, 401)
    if (!read.ok) return json({ error: read.error }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // 1) Autenticar el webhook (token -> familia). SIEMPRE antes de tocar la IA.
    const { data: family, error: familyError } = await admin
      .from("families")
      .select("id")
      .eq("amazon_webhook_token", token)
      .maybeSingle()
    if (familyError) throw familyError
    if (!family) return json({ error: "invalid token" }, 401)
    const familyId = family.id

    // 2) ¿Puede esta familia gastar una llamada de IA ahora mismo? Si no, no se crea ningún evento — igual
    // que si Gemini no encontrara una fecha clara, nunca un error.
    const { data: gate, error: gateError } = await admin.rpc("ai_gate_family", {
      p_family: familyId,
      p_purpose: eventFromEmailSpec.purpose,
    })
    if (gateError) console.error("[import-event-email-webhook] ai_gate_family no disponible, se sigue sin leer con IA:", gateError.message)
    if (gateError || gate?.allowed !== true) {
      return json({ ok: true, created: false, reason: gate?.allowed === false ? String(gate.reason ?? "ai_not_allowed") : "ai_not_allowed" })
    }

    const providerName = typeof gate.provider === "string" && gate.provider ? gate.provider : "gemini"
    const model = typeof gate.model === "string" && gate.model ? gate.model : "gemini-flash-lite-latest"
    const { data: geminiKey, error: keyError } = await admin.rpc("get_app_secret", { p_name: secretNameFor(providerName) })
    if (keyError || !geminiKey) return json({ error: "service not configured" }, 500)

    let parsed: EventFromEmailOutput = { found: false, title: null, date: null, allDay: false, startTime: null, endTime: null, location: null }
    let tokensIn = 0
    let tokensOut = 0
    let aiFailed = false
    try {
      const provider = createProvider(providerName, geminiKey)
      const result = await provider.generate({
        model,
        parts: eventFromEmailSpec.buildParts(read.input),
        maxOutputTokens: eventFromEmailSpec.maxOutputTokens,
      })
      tokensIn = result.tokensIn
      tokensOut = result.tokensOut
      parsed = eventFromEmailSpec.parseOutput(result.text, read.input)
    } catch (err) {
      aiFailed = true
      console.error("[import-event-email-webhook] fallo del proveedor:", err instanceof AiProviderError ? err.status : "unknown")
    }
    const { error: usageError } = await admin.rpc("ai_record_usage", {
      p_family: familyId,
      p_purpose: eventFromEmailSpec.purpose,
      p_tokens_in: tokensIn,
      p_tokens_out: tokensOut,
      p_error: aiFailed,
    })
    if (usageError) console.error("[import-event-email-webhook] no se pudo anotar el uso:", usageError.message)

    if (!parsed.found || !parsed.date) {
      return json({ ok: true, created: false, reason: aiFailed ? "ai_provider_error" : "no_clear_event" })
    }

    const title = parsed.title ?? (read.input.subject || "Evento importado")
    const allDay = parsed.allDay
    const startAt = allDay ? new Date(`${parsed.date}T00:00:00`).toISOString() : new Date(`${parsed.date}T${parsed.startTime}:00`).toISOString()
    const endAt = !allDay && parsed.endTime ? new Date(`${parsed.date}T${parsed.endTime}:00`).toISOString() : null

    const { data: event, error: eventError } = await admin
      .from("calendar_events")
      .insert({
        family_id: familyId,
        title,
        start_at: startAt,
        end_at: endAt,
        all_day: allDay,
        location_label: parsed.location,
        note: "Importado reenviando un correo.",
      })
      .select("id")
      .single()
    if (eventError) throw eventError

    // Mismos recordatorios por defecto que el resto de la app — 1 día
    // y 2 horas antes, para no dejarlo sin ningún aviso.
    const { error: reminderError } = await admin.from("calendar_event_reminders").insert([
      { event_id: event.id, minutes_before: 1440, anchor: "start" },
      { event_id: event.id, minutes_before: 120, anchor: "start" },
    ])
    if (reminderError) throw reminderError

    return json({ ok: true, created: true, eventId: event.id, title, date: parsed.date })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
