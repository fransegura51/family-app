import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// Recibe el ticket digital de Mercadona que llega por email (PDF
// adjunto) — un workflow externo (Outlook reenvía el correo de
// ticket_digital@mail.mercadona.com a Pipedream, que saca el adjunto y
// llama a este webhook con el PDF en base64) — no hay sesión de usuario
// posible aquí, así que va sin verificación de JWT (verify_jwt=false) y
// se autentica con el mismo token secreto de familia que ya usa el
// webhook de Amazon (families.amazon_webhook_token). A diferencia de
// Amazon, aquí SÍ se guarda el archivo de verdad (como una foto de
// ticket normal, con su borrado a los 3 meses ya existente) y se lee
// con el mismo prompt de Gemini que "Subir ticket" (analyze-receipt-photo).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

// gemini-flash-lite-latest da 1500 peticiones/día gratis, pero solo 15 por
// MINUTO — compartidas entre las funciones que usan IA. Mismo reintento
// que analyze-receipt-photo.
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

interface ReceiptItem {
  name: string
  quantity: number
  price: number
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })

  try {
    const body = await req.json()
    const token: string | null = typeof body.token === "string" ? body.token : null
    const fileBase64: string | null = typeof body.fileBase64 === "string" ? body.fileBase64 : null
    const mimeType: string = typeof body.mimeType === "string" ? body.mimeType : "application/pdf"

    if (!token) return json({ error: "missing token" }, 401)
    if (!fileBase64) return json({ error: "missing fileBase64" }, 400)

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
                "Lee este ticket de compra español y extrae sus datos. Responde ÚNICAMENTE un objeto JSON " +
                "con esta forma exacta, sin texto adicional ni markdown:\n" +
                '{"store": "nombre del establecimiento o null", "date": "YYYY-MM-DD o null", ' +
                '"total": numero_o_null, "items": [{"name": "producto", "quantity": numero, "price": numero}]}\n' +
                "Incluye en items TODAS las líneas de producto que veas, una por cada producto comprado " +
                "(no líneas de total, subtotal, IVA, cambio o forma de pago). " +
                "IMPORTANTE — nunca calcules ni multipliques tú los números: usa siempre el importe en euros " +
                "que aparece IMPRESO como el pagado por esa línea (normalmente el último número de la línea, " +
                "el más a la derecha). Hay cuatro formatos típicos, y 'quantity' significa cosas distintas en cada uno:\n" +
                "1) Línea simple, un solo precio (p. ej. 'Pan 1,80'): quantity=1, price=el precio impreso.\n" +
                "2) Varias unidades del mismo producto, con cantidad ENTERA al principio (p. ej. " +
                "'2 Bolsa patatas 3,00 6,00'): quantity=2 (el número entero de unidades), price=6.00 " +
                "(el importe TOTAL de la línea, el último número), NUNCA el precio unitario (3,00).\n" +
                "3) Ticket con columnas CANT | DESCRIPCION | PVP | TOTAL: la columna CANT suele venir " +
                "escrita con coma y dos decimales AUNQUE sea un número entero de unidades (p. ej. " +
                "'3,00  CERVEZA ESTRELLA  1,10  3,30' significa 3 unidades a 1,10€ cada una, 3,30€ en total) — " +
                "quantity=el número de la columna CANT redondeado a entero (3, no 3,00), price=el importe de " +
                "la columna TOTAL (el último número, 3,30), NUNCA el de la columna PVP (1,10, ese es el precio " +
                "de una sola unidad, no lo uses como price). No confundas esta columna CANT con un precio: si " +
                "el ticket tiene columnas CANT/PVP/TOTAL, el primer número de la línea es SIEMPRE cantidad, " +
                "nunca dinero.\n" +
                "4) Producto vendido por PESO, con un peso en kg y un precio por kg (p. ej. " +
                "'Solomillo cerdo — 0,495 kg x 10,25 €/kg — 5,07'): esto NO es una cantidad de unidades — " +
                "usa quantity=1 y price=el importe final en euros realmente cobrado (5,07 en ese ejemplo), " +
                "IGNORA el peso en kg y el precio por kg, no los uses para calcular nada.\n" +
                "Si tienes cualquier duda sobre una línea, usa quantity=1 y el último número en euros de la " +
                "línea como price — es preferible eso a inventar una cantidad. Los precios en euros, como " +
                "número con punto decimal.",
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

    let date: string | null = null
    let total: number | null = null
    let items: ReceiptItem[] = []
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim()
      const parsed = JSON.parse(cleaned)
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
              quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1,
              price: typeof it.price === "number" ? it.price : Number(it.price),
            }
          })
          .filter((it: ReceiptItem) => it.name.trim() && Number.isFinite(it.price))
      }
    } catch {
      // Se guarda el ticket igualmente (foto/PDF + fecha de hoy si no se
      // pudo leer), para no perder el archivo aunque falle la lectura.
    }

    const receiptDate = date ?? new Date().toISOString().slice(0, 10)
    const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] || "jpg"
    const path = `${familyId}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await admin.storage
      .from("receipts")
      .upload(path, base64ToBytes(fileBase64), { contentType: mimeType })
    if (uploadError) throw uploadError

    let expenseId: string | null = null
    if (total != null) {
      const { data: expense, error: expenseError } = await admin
        .from("expenses")
        .insert({
          family_id: familyId,
          expense_date: receiptDate,
          amount: total,
          category: "Alimentación",
          store: "Mercadona",
          kind: "real",
        })
        .select("id")
        .single()
      if (expenseError) throw expenseError
      expenseId = expense.id
    }

    const { data: receipt, error: receiptError } = await admin
      .from("receipts")
      .insert({
        family_id: familyId,
        storage_path: path,
        store: "Mercadona",
        receipt_date: receiptDate,
        total_amount: total,
        expense_id: expenseId,
        category: "Alimentación",
      })
      .select("id")
      .single()
    if (receiptError) throw receiptError

    for (const item of items) {
      const normalizedName = item.name.trim().toLowerCase()
      const { data: product, error: productError } = await admin
        .from("products")
        .upsert(
          { family_id: familyId, normalized_name: normalizedName, display_name: item.name.trim() },
          { onConflict: "family_id,normalized_name" },
        )
        .select("id")
        .single()
      if (productError) throw productError

      // "price" es el importe TOTAL de la línea (Skill del prompt de
      // arriba) — se divide entre las unidades para guardar siempre el
      // precio por unidad, igual que "Subir ticket" a mano.
      const unitPrice = item.quantity > 0 ? item.price / item.quantity : item.price

      const { error: priceError } = await admin.from("product_prices").insert({
        product_id: product.id,
        price: unitPrice,
        store: "Mercadona",
        quantity: String(item.quantity),
        unit: null,
        recorded_date: receiptDate,
        receipt_id: receipt.id,
      })
      if (priceError) throw priceError
    }

    return json({ ok: true, receiptId: receipt.id, itemsSaved: items.length })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
