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
//
// PROTECCIÓN CONTRA DUPLICADOS (migración 0168) — incidente real: un timeout de Pipedream (~32s, límite 30s)
// hizo pensar que el ticket no se había procesado cuando SÍ se había guardado; un reenvío manual del mismo
// correo creó una segunda compra idéntica. Dos capas, ambas por familia:
//   CAPA A (sourceFileHash) — SHA-256 de los bytes del archivo tal cual llega, calculado ANTES de la IA:
//     detecta un reenvío/replay exacto sin gastar una llamada de IA ni volver a subir el PDF.
//   CAPA B (contentFingerprint) — SHA-256 de una huella lógica (familia+tienda+fecha+total+líneas
//     normalizadas), calculada DESPUÉS de la IA: cubre un PDF regenerado con bytes distintos para el mismo
//     ticket. Nunca se basa solo en tienda+fecha+total (dos compras reales podrían coincidir ahí).
// Las dos huellas se fijan en `receipts` SOLO al terminar de persistir el ticket completo (gasto + recibo +
// líneas) con éxito Y con un total real extraído por la IA (total != null) — nunca en un intento fallido, a
// medias, o sin lectura de IA (gate no permitido) — para que eso no deje
// una marca falsa que bloquee un reintento legítimo del mismo archivo (ver cleanupFailedAttempt). Los índices
// UNIQUE parciales de 0168 son la última línea de defensa: si dos ejecuciones concurrentes llegan ambas hasta
// el final, solo una consigue fijar la huella; la otra deshace lo que creó y responde duplicate:true (nunca
// 409 ni 500 para un duplicado detectado de verdad).

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
const UNIQUE_VIOLATION = "23505"

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// CAPA B: familia + tienda + fecha + total + líneas normalizadas (nombre/cantidad/unidad/precio unitario,
// ordenadas alfabéticamente para que el orden en que la IA devolvió las líneas no cambie la huella). Nunca
// familia+tienda+fecha+total a secas: dos compras reales de 153,60€ el mismo día deben dar huellas distintas
// (ver test "tickets distintos, mismo importe").
function buildContentFingerprintInput(familyId: string, receiptDate: string, total: number, items: readonly ReceiptPhotoItem[]): string {
  const normalizedLines = items
    .map((it) => `${it.name.trim().toLowerCase()}|${it.quantity}|${it.unit}|${it.unitPrice.toFixed(2)}`)
    .sort()
    .join(";")
  return `${familyId}|Mercadona|${receiptDate}|${total.toFixed(2)}|${normalizedLines}`
}

function errorCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined
}

// Deshace lo que esta ejecución había creado (recibo -> arrastra sus líneas por ON DELETE CASCADE-, gasto,
// archivo subido) cuando pierde la carrera contra otra ejecución concurrente, o cuando falla a medias. Best
// effort: un fallo aquí se registra pero nunca oculta el error/duplicado original que se va a responder.
async function cleanupFailedAttempt(
  admin: ReturnType<typeof createClient>,
  params: { receiptId: string | null; expenseId: string | null; storagePath: string | null },
) {
  try {
    if (params.receiptId) await admin.from("receipts").delete().eq("id", params.receiptId)
    if (params.expenseId) await admin.from("expenses").delete().eq("id", params.expenseId)
    if (params.storagePath) await admin.storage.from("receipts").remove([params.storagePath])
  } catch (cleanupErr) {
    console.error("[mercadona-ticket-webhook] fallo limpiando intento fallido/perdedor de la carrera:", cleanupErr)
  }
}

async function findExistingReceiptId(
  admin: ReturnType<typeof createClient>,
  familyId: string,
  sourceFileHash: string,
  contentFingerprint: string | null,
): Promise<string | null> {
  const { data: byHash } = await admin.from("receipts").select("id").eq("family_id", familyId).eq("source_file_hash", sourceFileHash).maybeSingle()
  if (byHash) return byHash.id
  if (contentFingerprint) {
    const { data: byFingerprint } = await admin
      .from("receipts")
      .select("id")
      .eq("family_id", familyId)
      .eq("content_fingerprint", contentFingerprint)
      .maybeSingle()
    if (byFingerprint) return byFingerprint.id
  }
  return null
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

    // 2) CAPA A — hash del archivo tal cual llegó, ANTES de la IA: un reenvío/replay exacto del mismo
    // archivo para esta familia ni gasta IA ni vuelve a subir el PDF.
    const fileBytes = base64ToBytes(fileBase64)
    const sourceFileHash = await sha256Hex(fileBytes)
    const { data: existingByHash, error: existingByHashError } = await admin
      .from("receipts")
      .select("id")
      .eq("family_id", familyId)
      .eq("source_file_hash", sourceFileHash)
      .maybeSingle()
    if (existingByHashError) throw existingByHashError
    if (existingByHash) return json({ ok: true, duplicate: true, receiptId: existingByHash.id, itemsSaved: 0 })

    // 3) ¿Puede esta familia gastar una llamada de IA ahora mismo? Si no, se sigue igual: el ticket se
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

    // 4) CAPA B — huella lógica del ticket ya interpretado, solo si la IA extrajo un total: cubre el caso de
    // un PDF regenerado (bytes distintos, mismo ticket) que sourceFileHash no puede ver. Si ya existe, ni
    // siquiera se sube el archivo de nuevo.
    let contentFingerprint: string | null = null
    if (total != null) {
      contentFingerprint = await sha256Hex(new TextEncoder().encode(buildContentFingerprintInput(familyId, receiptDate, total, items)))
      const { data: existingByFingerprint, error: existingByFingerprintError } = await admin
        .from("receipts")
        .select("id")
        .eq("family_id", familyId)
        .eq("content_fingerprint", contentFingerprint)
        .maybeSingle()
      if (existingByFingerprintError) throw existingByFingerprintError
      if (existingByFingerprint) return json({ ok: true, duplicate: true, receiptId: existingByFingerprint.id, itemsSaved: 0 })
    }

    // 5) Ya sabemos que no es un duplicado conocido: ahora sí se sube el archivo.
    const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] || "jpg"
    const path = `${familyId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await admin.storage.from("receipts").upload(path, fileBytes, { contentType: mimeType })
    if (uploadError) throw uploadError

    // 6) Persistencia: recibo primero (sin expense_id ni huellas todavía), luego gasto, luego líneas. Las
    // huellas se fijan al final (paso 7), nunca aquí: si algo falla a medias, este recibo queda sin huella y
    // un reintento del mismo archivo no lo confunde con "ya procesado".
    let receiptId: string | null = null
    let expenseId: string | null = null
    try {
      const { data: receipt, error: receiptError } = await admin
        .from("receipts")
        .insert({
          family_id: familyId,
          storage_path: path,
          store: "Mercadona",
          receipt_date: receiptDate,
          total_amount: total,
          expense_id: null,
          category: "Alimentación",
        })
        .select("id")
        .single()
      if (receiptError) throw receiptError
      receiptId = receipt.id

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

        const { error: linkError } = await admin.from("receipts").update({ expense_id: expenseId }).eq("id", receiptId)
        if (linkError) throw linkError
      }

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

        // Corrección PESO-2 — item.unitPrice/unit ya vienen correctamente separados del prompt (peso.ts):
        // "ud" = precio por unidad, "kg" = precio por kg (nunca el importe total de la línea, que solo se usa
        // para derivar unitPrice cuando el ticket no imprime un precio unitario por separado — ver
        // receiptPhoto.ts). Sin división aquí: sea cual sea la unidad, item.unitPrice YA es la magnitud
        // comparable de verdad, igual que "Subir ticket" a mano.
        const { error: priceError } = await admin.from("product_prices").insert({
          product_id: product.id,
          price: item.unitPrice,
          store: "Mercadona",
          quantity: String(item.quantity),
          unit: item.unit,
          recorded_date: receiptDate,
          receipt_id: receiptId,
        })
        if (priceError) throw priceError
      }

      // 7) Todo persistido con éxito: fijar las huellas ahora — pero SOLO si la IA extrajo un total real
      // (total != null). Si la IA falló o no se pudo gastar (gate no permitido), este recibo se guarda igual
      // (nunca se pierde el archivo) pero SIN huella: si no se marca, un reintento posterior del mismo
      // archivo vuelve a intentar la IA en vez de creerse "ya procesado" por un intento que no llegó a leer
      // nada (la marca falsa que exige evitar el requisito de reintentos). Este UPDATE, cuando se ejecuta, es
      // el guardián atómico final (los índices UNIQUE parciales de 0168) contra una ejecución concurrente que
      // haya llegado hasta aquí con el mismo archivo/ticket.
      if (total != null) {
        const { error: fingerprintError } = await admin
          .from("receipts")
          .update({ source_file_hash: sourceFileHash, content_fingerprint: contentFingerprint })
          .eq("id", receiptId)
        if (fingerprintError) throw fingerprintError
      }

      return json({ ok: true, receiptId, itemsSaved: productItems.length, itemsSkippedNonProduct: skippedItems.length })
    } catch (persistErr) {
      await cleanupFailedAttempt(admin, { receiptId, expenseId, storagePath: path })
      if (errorCode(persistErr) === UNIQUE_VIOLATION) {
        const winnerId = await findExistingReceiptId(admin, familyId, sourceFileHash, contentFingerprint)
        if (winnerId) return json({ ok: true, duplicate: true, receiptId: winnerId, itemsSaved: 0 })
      }
      throw persistErr
    }
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
