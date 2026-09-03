import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Respaldo con IA (Gemini, nivel gratuito — misma clave que ya usan
// analyze-receipt-photo/analyze-fridge-photo) para el botón 🐣 Pepa
// cuando el reconocimiento local por patrones no entiende la pregunta.
// Petición real: "si le digo 'tengo nueve de septiembre' en vez de
// 'qué tengo el nueve de septiembre', me dice que no lo entiende" —
// los patrones a mano nunca cubren todas las formas de decir lo mismo;
// un modelo de lenguaje sí generaliza. Se llama solo cuando el
// reconocimiento local (gratis, instantáneo) ya ha fallado, para
// gastar lo mínimo posible de la cuota gratuita.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

// gemini-flash-lite-latest da 1500 peticiones/día gratis, pero solo 15 por
// MINUTO — compartidas entre las 4 funciones que usan IA. Reintentar unos
// segundos después (el cupo de minuto se resetea solo) evita que un pico
// puntual de uso familiar se traduzca en un fallo silencioso.
async function fetchGeminiWithRetry(model: string, key: string, body: unknown): Promise<Response> {
  const delaysMs = [4000, 8000]
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    )
    if (res.status !== 429 || attempt >= delaysMs.length) return res
    await new Promise((r) => setTimeout(r, delaysMs[attempt]))
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "unauthorized" }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401)

    const { text, today } = await req.json()
    if (typeof text !== "string" || !text.trim()) return json({ error: "missing text" }, 400)
    if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return json({ error: "missing today" }, 400)

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: geminiKey, error: keyError } = await adminClient.rpc("get_app_secret", {
      p_name: "gemini_api_key",
    })
    if (keyError || !geminiKey) return json({ error: "service not configured" }, 500)

    const prompt =
      "Eres el clasificador de preguntas de \"Pepa\", el asistente por voz de una app familiar en español. " +
      `Hoy es ${today} (YYYY-MM-DD). Alguien le ha dicho esta frase a Pepa, pulsando el botón de PREGUNTAR ` +
      "(así que casi seguro es una pregunta, no un encargo para guardar algo):\n" +
      `"${text}"\n\n` +
      "Responde ÚNICAMENTE un objeto JSON, sin texto adicional ni markdown, con esta forma exacta:\n" +
      '{"intent": "tasks_today" | "next_calendar_event" | "shopping_list" | "none", ' +
      '"explicitDate": "YYYY-MM-DD o null", "when": "today" | "tomorrow", "memberHint": "nombre o null", ' +
      '"storeHint": "nombre de tienda o null", "nowOnly": true|false}\n\n' +
      "Significado de cada intent:\n" +
      "- tasks_today: pregunta qué hay que hacer, tareas o citas de un día — hoy, mañana, o una fecha concreta " +
      "('el nueve de septiembre', 'tengo nueve de septiembre', 'qué me queda por hacer el 25 de diciembre'...). " +
      "Si menciona una fecha concreta, calcula explicitDate en YYYY-MM-DD (si ese día ya pasó este año, usa el " +
      "año que viene) y deja when=\"today\". Si no menciona fecha, when es \"today\" o \"tomorrow\" según toque, " +
      "explicitDate=null.\n" +
      "- next_calendar_event: pregunta por la próxima cita/evento del calendario en general, sin decir un día " +
      "concreto ('lo siguiente que tengo', 'cuál es mi próxima cita').\n" +
      "- shopping_list: pregunta qué hay en la lista de la compra ('qué tengo pendiente de comprar', 'qué tengo " +
      "en la lista de la compra de Mercadona'...). Si nombra una tienda concreta, ponla en storeHint tal cual " +
      "se ha dicho (p. ej. \"Mercadona\"); si no, storeHint=null.\n" +
      "- none: no es ninguna pregunta reconocible de las anteriores.\n\n" +
      "memberHint: si nombra a alguien en concreto de quién pregunta, su nombre; si no, null.\n" +
      "nowOnly: true SOLO si pregunta explícitamente \"ahora\" (desde este momento en adelante); false en cualquier otro caso."

    const geminiRes = await fetchGeminiWithRetry("gemini-flash-lite-latest", geminiKey, {
      contents: [{ parts: [{ text: prompt }] }],
    })

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      return json({ error: "gemini_error", detail }, 502)
    }

    const geminiJson = await geminiRes.json()
    const rawText: string = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"

    let intent = "none"
    let explicitDate: string | null = null
    let when: "today" | "tomorrow" = "today"
    let memberHint: string | null = null
    let storeHint: string | null = null
    let nowOnly = false
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(cleaned)
      if (["tasks_today", "next_calendar_event", "shopping_list", "none"].includes(parsed.intent)) {
        intent = parsed.intent
      }
      explicitDate = typeof parsed.explicitDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.explicitDate) ? parsed.explicitDate : null
      when = parsed.when === "tomorrow" ? "tomorrow" : "today"
      memberHint = typeof parsed.memberHint === "string" && parsed.memberHint.trim() ? parsed.memberHint.trim() : null
      storeHint = typeof parsed.storeHint === "string" && parsed.storeHint.trim() ? parsed.storeHint.trim() : null
      nowOnly = parsed.nowOnly === true
    } catch {
      // se devuelve "none" — el cliente ya avisa de que no se ha entendido.
    }

    return json({ intent, explicitDate, when, memberHint, storeHint, nowOnly })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
