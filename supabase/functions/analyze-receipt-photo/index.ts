import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Lee un ticket de compra con Gemini (nivel gratuito de Google AI
// Studio) en vez de OCR carácter-a-carácter (Tesseract se dejaba
// productos en tickets arrugados o con letra pequeña — un modelo que
// "ve" la foto entera entiende mucho mejor la disposición típica de un
// ticket español). Misma clave que ya usa analyze-fridge-photo, guardada
// en Vault, nunca en el cliente.

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

interface ReceiptItem {
  name: string
  quantity: number
  price: number
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

    const { imageBase64, mimeType } = await req.json()
    if (!imageBase64 || !mimeType) return json({ error: "missing image" }, 400)

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: geminiKey, error: keyError } = await adminClient.rpc("get_app_secret", {
      p_name: "gemini_api_key",
    })
    if (keyError || !geminiKey) return json({ error: "service not configured" }, 500)

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "Lee este ticket de compra español y extrae sus datos. Responde ÚNICAMENTE un objeto JSON " +
                    "con esta forma exacta, sin texto adicional ni markdown:\n" +
                    '{"store": "nombre del establecimiento o null", "date": "YYYY-MM-DD o null", ' +
                    '"total": numero_o_null, "items": [{"name": "producto", "quantity": numero, "price": numero}]}\n' +
                    "Incluye en items TODAS las líneas de producto que veas, una por cada producto comprado " +
                    "(no líneas de total, subtotal, IVA, cambio o forma de pago). " +
                    "IMPORTANTE — nunca calcules ni multipliques tú los números: usa siempre el importe en euros " +
                    "que aparece IMPRESO como el pagado por esa línea (normalmente el último número de la línea, " +
                    "el más a la derecha). Hay tres formatos típicos, y 'quantity' significa cosas distintas en cada uno:\n" +
                    "1) Línea simple, un solo precio (p. ej. 'Pan 1,80'): quantity=1, price=el precio impreso.\n" +
                    "2) Varias unidades del mismo producto, con cantidad ENTERA al principio (p. ej. " +
                    "'2 Bolsa patatas 3,00 6,00'): quantity=2 (el número entero de unidades), price=6.00 " +
                    "(el importe TOTAL de la línea, el último número), NUNCA el precio unitario (3,00).\n" +
                    "3) Producto vendido por PESO, con un peso en kg y un precio por kg (p. ej. " +
                    "'Solomillo cerdo — 0,495 kg x 10,25 €/kg — 5,07'): esto NO es una cantidad de unidades — " +
                    "usa quantity=1 y price=el importe final en euros realmente cobrado (5,07 en ese ejemplo), " +
                    "IGNORA el peso en kg y el precio por kg, no los uses para calcular nada.\n" +
                    "Si tienes cualquier duda sobre una línea, usa quantity=1 y el último número en euros de la " +
                    "línea como price — es preferible eso a inventar una cantidad. Los precios en euros, como " +
                    "número con punto decimal.",
                },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            },
          ],
        }),
      },
    )

    if (!geminiRes.ok) {
      const detail = await geminiRes.text()
      return json({ error: "gemini_error", detail }, 502)
    }

    const geminiJson = await geminiRes.json()
    const rawText: string = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"

    let store: string | null = null
    let date: string | null = null
    let total: number | null = null
    let items: ReceiptItem[] = []
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(cleaned)
      store = typeof parsed.store === "string" ? parsed.store : null
      date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null
      total = typeof parsed.total === "number" ? parsed.total : null
      if (Array.isArray(parsed.items)) {
        items = parsed.items
          .filter(
            (it: unknown): it is { name: unknown; quantity: unknown; price: unknown } =>
              typeof it === "object" && it !== null,
          )
          .map((it: { name: unknown; quantity: unknown; price: unknown }) => {
            const quantity = typeof it.quantity === "number" ? it.quantity : Number(it.quantity)
            return {
              name: typeof it.name === "string" ? it.name : "",
              quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
              price: typeof it.price === "number" ? it.price : Number(it.price),
            }
          })
          .filter((it: ReceiptItem) => it.name.trim() && Number.isFinite(it.price))
      }
    } catch {
      // Se devuelve vacío; el cliente ya avisa de revisar antes de guardar.
    }

    return json({ store, date, total, items })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
