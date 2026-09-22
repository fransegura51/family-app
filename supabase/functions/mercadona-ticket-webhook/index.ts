import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { partitionTicketLines } from "./ticketLines.ts"
import { createProvider, secretNameFor } from "../_shared/ai/providers.ts"
import { AiProviderError } from "../_shared/ai/types.ts"
import { receiptPhotoSpec, parseReceiptPhotoOutput, type ReceiptPhotoItem } from "../_shared/ai/purposes/receiptPhoto.ts"

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
//
// FASE 7.1 (F7-001) — antes llamaba a Gemini directamente, sin ningún control (ni interruptor, ni tope
// diario, ni registro de uso): ahora pasa por ai_gate_family (mismas reglas que ai_gate, EXCEPTO la
// comprobación de cuenta adulta, que no aplica a una automatización sin usuario — ver 0153_ai_gate_family.sql).
// El AUTH del webhook (token de familia) sigue siendo obligatorio y va SIEMPRE antes: ai_gate_family nunca lo
// sustituye, solo decide si esa familia YA autenticada puede gastar una llamada de IA ahora mismo. Si no puede
// (apagado, tope diario...), el ticket se guarda igual, sin leer — mismo comportamiento de siempre cuando
// Gemini fallaba: nunca se pierde el archivo por un fallo de lectura. El prompt y el parseo son los mismos de
// analyze-receipt-photo, compartidos desde _shared/ai/purposes/receiptPhoto.ts (un solo sitio, no dos copias).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    // La columna es uuid: un token con otra forma haría fallar la consulta
    // (500 con el error de Postgres) en vez de un 401 limpio.
    if (!UUID_RE.test(token)) return json({ error: "invalid token" }, 401)
    if (!fileBase64) return json({ error: "missing fileBase64" }, 400)
    // Auditoría de seguridad: sin tope, un token filtrado permitiría
    // llenar el storage de la familia con archivos enormes. Un ticket
    // real ocupa unos pocos cientos de KB; 10 MB es más que de sobra.
    if (fileBase64.length > 14_000_000) return json({ error: "file too large" }, 413)
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return json({ error: "unsupported mimeType" }, 415)
    }

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

    // 2) ¿Puede esta familia gastar una llamada de IA ahora mismo? Si no, se sigue igual: el ticket se
    // guarda sin leer (fecha de hoy, sin importe ni productos), nunca se pierde el archivo.
    let date: string | null = null
    let total: number | null = null
    let items: ReceiptPhotoItem[] = []
    const { data: gate, error: gateError } = await admin.rpc("ai_gate_family", {
      p_family: familyId,
      p_purpose: "mercadona-ticket-webhook",
    })
    const gateAllowed = !gateError && gate?.allowed === true
    if (gateError) console.error("[mercadona-ticket-webhook] ai_gate_family no disponible, se sigue sin leer con IA:", gateError.message)

    if (gateAllowed) {
      const providerName = typeof gate.provider === "string" && gate.provider ? gate.provider : "gemini"
      const model = typeof gate.model === "string" && gate.model ? gate.model : "gemini-flash-lite-latest"
      const { data: geminiKey, error: keyError } = await admin.rpc("get_app_secret", { p_name: secretNameFor(providerName) })
      if (keyError || !geminiKey) return json({ error: "service not configured" }, 500)

      let tokensIn = 0
      let tokensOut = 0
      let aiFailed = false
      try {
        const provider = createProvider(providerName, geminiKey)
        const result = await provider.generate({
          model,
          parts: receiptPhotoSpec.buildParts({ imageBase64: fileBase64, mimeType }),
          maxOutputTokens: receiptPhotoSpec.maxOutputTokens,
        })
        tokensIn = result.tokensIn
        tokensOut = result.tokensOut
        const parsed = parseReceiptPhotoOutput(result.text)
        date = parsed.date
        total = parsed.total
        items = parsed.items
      } catch (err) {
        aiFailed = true
        console.error("[mercadona-ticket-webhook] fallo del proveedor:", err instanceof AiProviderError ? err.status : "unknown")
      }
      const { error: usageError } = await admin.rpc("ai_record_usage", {
        p_family: familyId,
        p_purpose: "mercadona-ticket-webhook",
        p_tokens_in: tokensIn,
        p_tokens_out: tokensOut,
        p_error: aiFailed,
      })
      if (usageError) console.error("[mercadona-ticket-webhook] no se pudo anotar el uso:", usageError.message)
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
          source: "ticket",
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

    // Las líneas que no son productos (PARKING de Mercadona...) se descartan ANTES de crear producto o precio. El ticket (archivo,
    // gasto y total) se guarda íntegro. La regla es la misma que usa la app (ticketLines.ts, copia idéntica) y la base de datos la refuerza
    // con un trigger en product_prices.
    const { products: productItems, skipped: skippedItems } = partitionTicketLines("Mercadona", items)

    for (const item of productItems) {
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

    return json({ ok: true, receiptId: receipt.id, itemsSaved: productItems.length, itemsSkippedNonProduct: skippedItems.length })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
