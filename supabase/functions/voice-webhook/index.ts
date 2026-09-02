import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

// Control por voz desde el coche (petición real: "usar el botón del
// volante... IFTTT como puente... para poder añadir cosas a la lista
// de la compra o crear eventos en el calendario sin tocar el móvil").
// IFTTT llama aquí con el texto dictado y un token propio de la
// familia (nunca un JWT de usuario — IFTTT no inicia sesión en la
// app), así que esta función usa el cliente de servicio y resuelve la
// familia ella misma a partir de ese token. El texto se interpreta con
// Gemini (mismo patrón gratuito que ya usa pepa-intent) para decidir
// si es un producto de la compra o una cita, y guarda el resultado
// directamente — nunca inventa que ha guardado algo si la escritura
// falla de verdad.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

// Convierte fecha+hora LOCAL de España a instante UTC real, con el
// desfase correcto según la época del año (verano/invierno) — mismo
// problema que ya se resolvió al migrar tareas a eventos (migración
// 0040): construir la fecha tratándola como UTC de partida y luego
// restarle el desfase real de Europe/Madrid para ese día.
function madridToUtcIso(dateStr: string, timeStr: string): string {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" }).formatToParts(
    naive,
  )
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1"
  const match = offsetPart.match(/GMT([+-]\d+)/)
  const offsetHours = match ? Number(match[1]) : 1
  return new Date(naive.getTime() - offsetHours * 3_600_000).toISOString()
}

function todayMadridIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date())
}

interface ParsedCommand {
  action: "shopping" | "calendar" | "none"
  store: string | null
  items: string[]
  eventTitle: string | null
  eventDate: string | null
  eventTime: string | null
}

async function classify(text: string, today: string, knownStores: string[], geminiKey: string): Promise<ParsedCommand> {
  const prompt =
    "Interpretas un aviso de voz dictado desde el coche (Google Assistant/Siri) para una app familiar en " +
    `español. Hoy es ${today} (YYYY-MM-DD). El texto dictado es:\n"${text}"\n\n` +
    "Responde ÚNICAMENTE un objeto JSON, sin texto adicional ni markdown, con esta forma exacta:\n" +
    '{"action": "shopping" | "calendar" | "none", "store": "nombre de tienda o null", ' +
    '"items": ["producto1", "producto2"], "eventTitle": "texto o null", ' +
    '"eventDate": "YYYY-MM-DD o null", "eventTime": "HH:mm o null"}\n\n' +
    "- action=\"shopping\" si pide apuntar uno o más productos en la lista de la compra. \"items\" es la lista " +
    "de productos dichos (sin el nombre de la tienda dentro). Si nombra una tienda, ponla en \"store\" tal cual " +
    `se ha dicho; estas son las tiendas ya conocidas de la familia, prioriza una de ellas si encaja: ${knownStores.join(", ") || "(ninguna todavía)"}.\n` +
    "- action=\"calendar\" si pide apuntar una cita/evento en el calendario. \"eventTitle\" es de qué es la " +
    "cita, sin la fecha/hora dentro. Calcula eventDate en YYYY-MM-DD (si no dice fecha, usa hoy; si el día ya " +
    "pasó este año, usa el año que viene). eventTime en HH:mm si dice una hora, si no null (todo el día).\n" +
    "- action=\"none\" si no es ninguna de las dos cosas o no se entiende.\n" +
    "No inventes un producto o una cita que no se haya dicho."

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  )
  if (!res.ok) throw new Error("gemini_error")

  const geminiJson = await res.json()
  const rawText: string = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"
  const cleaned = rawText.replace(/```json|```/g, "").trim()
  const parsed = JSON.parse(cleaned)

  return {
    action: ["shopping", "calendar", "none"].includes(parsed.action) ? parsed.action : "none",
    store: typeof parsed.store === "string" && parsed.store.trim() ? parsed.store.trim() : null,
    items: Array.isArray(parsed.items) ? parsed.items.filter((i: unknown) => typeof i === "string" && i.trim()) : [],
    eventTitle: typeof parsed.eventTitle === "string" && parsed.eventTitle.trim() ? parsed.eventTitle.trim() : null,
    eventDate:
      typeof parsed.eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.eventDate) ? parsed.eventDate : null,
    eventTime: typeof parsed.eventTime === "string" && /^\d{2}:\d{2}$/.test(parsed.eventTime) ? parsed.eventTime : null,
  }
}

async function notifyFamily(admin: ReturnType<typeof createClient>, familyId: string, title: string, body: string) {
  try {
    const [{ data: vapidPublicKey }, { data: vapidPrivateKey }] = await Promise.all([
      admin.rpc("get_app_secret", { p_name: "vapid_public_key" }),
      admin.rpc("get_app_secret", { p_name: "vapid_private_key" }),
    ])
    if (!vapidPublicKey || !vapidPrivateKey) return
    webpush.setVapidDetails("mailto:family-app@example.com", vapidPublicKey as string, vapidPrivateKey as string)

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, profiles!inner(family_id)")
      .eq("profiles.family_id", familyId)

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          JSON.stringify({ title, body }),
        )
      } catch {
        // Un dispositivo con la suscripción caducada no debe impedir
        // avisar a los demás — el aviso ya se ha guardado de verdad,
        // esto es solo la notificación de cortesía.
      }
    }
  } catch {
    // Sin VAPID configurado o sin suscripciones no pasa nada — el
    // aviso ya se ha guardado, solo se pierde la notificación.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405)

  try {
    const body = await req.json()
    const token = typeof body.token === "string" ? body.token.trim() : ""
    const text = typeof body.text === "string" ? body.text.trim() : ""
    if (!token) return json({ error: "falta el token" }, 401)
    if (!text) return json({ error: "falta el texto" }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data: tokenRow, error: tokenError } = await admin
      .from("voice_webhook_tokens")
      .select("family_id")
      .eq("token", token)
      .maybeSingle()
    if (tokenError || !tokenRow) return json({ error: "token no válido" }, 401)
    const familyId = tokenRow.family_id as string

    await admin.from("voice_webhook_tokens").update({ last_used_at: new Date().toISOString() }).eq("token", token)

    const { data: geminiKey, error: keyError } = await admin.rpc("get_app_secret", { p_name: "gemini_api_key" })
    if (keyError || !geminiKey) return json({ error: "servicio no configurado" }, 500)

    const { data: storeRows } = await admin.from("shopping_stores").select("name").eq("family_id", familyId)
    const knownStores = (storeRows ?? []).map((r) => r.name as string)

    const parsed = await classify(text, todayMadridIso(), knownStores, geminiKey as string)

    if (parsed.action === "shopping" && parsed.items.length > 0) {
      const { error: insertError } = await admin.from("shopping_items").insert(
        parsed.items.map((name) => ({
          family_id: familyId,
          name,
          store: parsed.store,
          quantity: null,
          unit: null,
        })),
      )
      if (insertError) return json({ error: "no se pudo guardar en la lista de la compra" }, 500)

      const storeLabel = parsed.store ? ` (${parsed.store})` : ""
      const confirmation = `Apuntado${storeLabel}: ${parsed.items.join(", ")}`
      await notifyFamily(admin, familyId, "Pepa (coche)", confirmation)
      return json({ ok: true, action: "shopping", saved: parsed.items, store: parsed.store })
    }

    if (parsed.action === "calendar" && parsed.eventTitle && parsed.eventDate) {
      const allDay = !parsed.eventTime
      const startAt = allDay ? madridToUtcIso(parsed.eventDate, "00:00") : madridToUtcIso(parsed.eventDate, parsed.eventTime!)

      const { error: insertError } = await admin.from("calendar_events").insert({
        family_id: familyId,
        title: parsed.eventTitle,
        start_at: startAt,
        all_day: allDay,
      })
      if (insertError) return json({ error: "no se pudo guardar en el calendario" }, 500)

      const dateLabel = new Date(parsed.eventDate + "T00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" })
      const timeLabel = parsed.eventTime ? ` a las ${parsed.eventTime}` : ""
      const confirmation = `${parsed.eventTitle} — ${dateLabel}${timeLabel}`
      await notifyFamily(admin, familyId, "Pepa (coche)", confirmation)
      return json({ ok: true, action: "calendar", title: parsed.eventTitle, date: parsed.eventDate, time: parsed.eventTime })
    }

    return json({ ok: false, error: "no he entendido el aviso" }, 200)
  } catch (err) {
    console.error(err)
    return json({ error: "internal error" }, 500)
  }
})
