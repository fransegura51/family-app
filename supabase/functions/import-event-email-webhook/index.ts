import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

async function fetchGeminiWithRetry(model: string, key: string, body: unknown): Promise<Response> {
  const delaysMs = [4000, 8000]
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    )
    if (res.status !== 429 || attempt >= delaysMs.length) return res
    await new Promise((r) => setTimeout(r, delaysMs[attempt]))
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const body = await req.json()
    const token: string | null = typeof body.token === "string" ? body.token : null
    const subject: string = typeof body.subject === "string" ? body.subject : ""
    const bodyText: string = typeof body.bodyText === "string" ? body.bodyText : ""
    const receivedDate: string =
      typeof body.receivedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.receivedDate)
        ? body.receivedDate
        : new Date().toISOString().slice(0, 10)

    if (!token) return json({ error: "missing token" }, 401)
    if (!subject && !bodyText) return json({ error: "missing subject/bodyText" }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: family, error: familyError } = await admin
      .from("families")
      .select("id")
      .eq("amazon_webhook_token", token)
      .maybeSingle()
    if (familyError) throw familyError
    if (!family) return json({ error: "invalid token" }, 401)
    const familyId = family.id

    const { data: geminiKey, error: keyError } = await admin.rpc("get_app_secret", { p_name: "gemini_api_key" })
    if (keyError || !geminiKey) return json({ error: "service not configured" }, 500)

    const geminiRes = await fetchGeminiWithRetry("gemini-flash-lite-latest", geminiKey, {
      contents: [
        {
          parts: [
            {
              text:
                `Hoy es ${receivedDate}. Lee este correo (boletín escolar, confirmación de reserva, ` +
                "recordatorio de una cita...) y decide si describe UN evento con fecha concreta al que " +
                "apuntarse en un calendario. Responde ÚNICAMENTE un objeto JSON con esta forma exacta, " +
                "sin texto adicional ni markdown:\n" +
                '{"found": true_o_false, "title": "texto corto o null", "date": "YYYY-MM-DD o null", ' +
                '"allDay": true_o_false, "startTime": "HH:MM o null", "endTime": "HH:MM o null", ' +
                '"location": "texto o null"}\n' +
                'Pon "found":false si el correo no tiene una fecha concreta y clara (por ejemplo, es ' +
                "publicidad, una factura sin evento, o solo habla en general). Nunca inventes una fecha u " +
                "hora que no esté explícita o fácilmente deducible del texto (p. ej. \"mañana\", \"el " +
                "viernes que viene\" sí se puede calcular a partir de hoy). Si el correo da hora de inicio " +
                "pero no de fin, deja endTime a null y allDay a false. Si es un evento de todo el día " +
                "(vacaciones, día no lectivo...), pon allDay true y deja startTime/endTime a null.\n\n" +
                `Asunto: ${subject}\n\nCuerpo:\n${bodyText.slice(0, 6000)}`,
            },
          ],
        },
      ],
    })

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      return json({ error: "gemini_error", detail }, 502)
    }

    const geminiJson = await geminiRes.json()
    const rawText: string = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"
    const cleaned = rawText.replace(/```json|```/g, "").trim()
    const parsed = JSON.parse(cleaned)

    if (!parsed.found || typeof parsed.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
      return json({ ok: true, created: false, reason: "no_clear_event" })
    }

    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : subject || "Evento importado"
    const allDay = parsed.allDay === true || typeof parsed.startTime !== "string"
    const startAt = allDay
      ? new Date(`${parsed.date}T00:00:00`).toISOString()
      : new Date(`${parsed.date}T${parsed.startTime}:00`).toISOString()
    const endAt =
      !allDay && typeof parsed.endTime === "string" ? new Date(`${parsed.date}T${parsed.endTime}:00`).toISOString() : null

    const { data: event, error: eventError } = await admin
      .from("calendar_events")
      .insert({
        family_id: familyId,
        title,
        start_at: startAt,
        end_at: endAt,
        all_day: allDay,
        location_label: typeof parsed.location === "string" ? parsed.location : null,
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
