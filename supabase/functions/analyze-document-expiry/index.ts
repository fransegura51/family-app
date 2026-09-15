import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Lee un documento (DNI, carnet de conducir, pasaporte, ITV, seguro,
// tarjeta sanitaria...) con Gemini para detectar sola su fecha de
// caducidad — petición real: "que Pepa detecte automáticamente la
// fecha de caducidad y la anote". Mismo patrón que analyze-receipt-photo
// (mismo modelo, misma clave en Vault, nunca en el cliente); a
// diferencia de un ticket, aquí también puede venir en PDF, que Gemini
// lee igual de bien como inline_data.

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
// MINUTO — compartidas entre las funciones que usan IA. Reintentar unos
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

    const { fileBase64, mimeType } = await req.json()
    if (!fileBase64 || !mimeType) return json({ error: "missing file" }, 400)

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: geminiKey, error: keyError } = await adminClient.rpc("get_app_secret", {
      p_name: "gemini_api_key",
    })
    if (keyError || !geminiKey) return json({ error: "service not configured" }, 500)

    const geminiRes = await fetchGeminiWithRetry("gemini-flash-lite-latest", geminiKey, {
      contents: [
        {
          parts: [
            {
              text:
                "Este es un documento familiar (DNI, carnet de conducir, pasaporte, tarjeta sanitaria, " +
                "seguro, pegatina de ITV, contrato u otro parecido). Busca su fecha de caducidad o " +
                "vencimiento (puede venir como 'CADUCA', 'VALIDEZ', 'VÁLIDO HASTA', 'VENCE', fecha ITV " +
                "próxima revisión, o similar) y qué tipo de documento es. Responde ÚNICAMENTE un objeto " +
                "JSON con esta forma exacta, sin texto adicional ni markdown:\n" +
                '{"expiryDate": "YYYY-MM-DD o null si no se ve ninguna fecha de caducidad", ' +
                '"documentType": "nombre corto del documento (p. ej. \'DNI\', \'Carnet de conducir\', ' +
                "'Seguro del coche') o null si no se reconoce\"}\n" +
                "Si el documento no tiene fecha de caducidad (p. ej. un certificado de nacimiento) o no " +
                "se distingue con claridad, usa expiryDate:null — nunca inventes ni calcules una fecha.",
            },
            { inline_data: { mime_type: mimeType, data: fileBase64 } },
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

    let expiryDate: string | null = null
    let documentType: string | null = null
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(cleaned)
      expiryDate = typeof parsed.expiryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiryDate) ? parsed.expiryDate : null
      documentType = typeof parsed.documentType === "string" && parsed.documentType.trim() ? parsed.documentType.trim() : null
    } catch {
      // Se devuelve vacío; el cliente deja los campos como estaban.
    }

    return json({ expiryDate, documentType })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
