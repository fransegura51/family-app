import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Separa una lista de la compra dictada de un tirón, sin pausas ni
// comas claras entre producto y producto ("patata lechuga lentejas
// agua vino"), en productos sueltos — petición real: "esto me lo sigue
// poniendo todo junto... yo quiero que me lo ponga cada producto en
// una línea". splitEntries (por comas/"y") ya cubre el caso con pausas
// o "y" de por medio; esto es el respaldo para cuando no hay ninguna
// señal de puntuación que usar. Hace falta entender el propio idioma
// para no partir un producto de varias palabras ("pan Bimbo", "papel
// higiénico") en dos — por eso es un modelo de lenguaje y no otra
// heurística más. Se llama solo cuando el troceo local por comas/"y"
// ya ha dejado un solo trozo con más de una palabra, para gastar lo
// mínimo posible de la cuota gratuita.

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
// MINUTO — compartidas entre las 4 funciones que usan IA. Si dos personas
// de la familia usan Pepa/foto de ticket/lista a la vez, o alguien dicta
// varias listas seguidas, se puede agotar ese cupo de un minuto aunque
// sobre cupo de sobra en el del día. Reintentar unos segundos después
// (el cupo de minuto se resetea solo) evita que ese pico puntual se
// traduzca en un fallo silencioso para quien lo está usando.
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

    const { text } = await req.json()
    if (typeof text !== "string" || !text.trim()) return json({ error: "missing text" }, 400)

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: geminiKey, error: keyError } = await adminClient.rpc("get_app_secret", {
      p_name: "gemini_api_key",
    })
    if (keyError || !geminiKey) return json({ error: "service not configured" }, 500)

    const prompt =
      "Esto es una lista de la compra dictada por voz de un tirón, en español, sin comas ni pausas claras entre " +
      `producto y producto:\n"${text}"\n\n` +
      "Sepárala en productos sueltos. Cada producto es lo que se compraría como una sola cosa en el " +
      "supermercado — un nombre de marca o un adjetivo pegado al producto NO es un producto aparte (\"pan " +
      "Bimbo\" es UN producto, \"papel higiénico\" es UN producto, \"leche entera\" es UN producto), pero " +
      "productos distintos dichos seguidos SÍ se separan (\"patata lechuga\" son DOS productos: \"patata\" y " +
      "\"lechuga\"). No inventes ni quites ningún producto, no cambies el orden.\n\n" +
      'Responde ÚNICAMENTE un objeto JSON, sin texto adicional ni markdown: {"items": ["producto1", "producto2"]}'

    const geminiRes = await fetchGeminiWithRetry("gemini-flash-lite-latest", geminiKey, {
      contents: [{ parts: [{ text: prompt }] }],
    })
    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      return json({ error: "gemini_error", detail }, 502)
    }

    const geminiJson = await geminiRes.json()
    const rawText: string = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"

    let items: string[] = [text.trim()]
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        const cleanItems = parsed.items.filter((i: unknown) => typeof i === "string" && i.trim()).map((i: string) => i.trim())
        if (cleanItems.length > 0) items = cleanItems
      }
    } catch {
      // Si la IA no devuelve JSON válido, se deja tal cual como un solo
      // producto — igual que se guardaba antes de intentar separarlo.
    }

    return json({ items })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
