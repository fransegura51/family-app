import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"
import { FCM_PREFIX, sendFcm, type FcmServiceAccount } from "./fcm.ts"

// Manda un aviso a UNA persona (todos los móviles que tenga dados de alta). Lo llama la propia base de datos (pg_net, ver migración
// 0260_notifications_center.sql: private.dispatch_user_push) cuando crea un aviso dirigido: aviso de asignación de una tarea, resumen diario de
// tareas, avisos de Comunidad… Sin JWT de usuario: autenticación por cabecera con el secreto compartido de Vault, igual que send-family-push.
//
// service_role no pasa por RLS: la ÚNICA persona a la que se manda es la que llega en profile_id, y solo se leen SUS suscripciones. Nunca hay un camino
// que envíe a toda una familia desde aquí.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

let fcmServiceAccountPromise: Promise<FcmServiceAccount | null> | null = null
function loadFcmServiceAccount(): Promise<FcmServiceAccount | null> {
  fcmServiceAccountPromise ??= (async () => {
    const { data, error } = await supabaseAdmin.rpc("get_app_secret", { p_name: "fcm_service_account" })
    if (error || !data) return null
    try {
      const parsed = JSON.parse(data as string) as FcmServiceAccount
      return parsed.client_email && parsed.private_key && parsed.project_id ? parsed : null
    } catch {
      return null
    }
  })()
  return fcmServiceAccountPromise
}

async function deliverPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; tag?: string; url?: string },
  options: { TTL: number; urgency: "high" },
): Promise<void> {
  if (sub.endpoint.startsWith(FCM_PREFIX)) {
    const sa = await loadFcmServiceAccount()
    if (!sa) throw Object.assign(new Error("FCM sin configurar (falta el secreto fcm_service_account)"), { statusCode: 0 })
    await sendFcm(sa, sub.endpoint.slice(FCM_PREFIX.length), { ...payload, ttlSeconds: options.TTL })
    return
  }
  await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), options)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Body {
  profile_id?: unknown
  title?: unknown
  body?: unknown
  url?: unknown
  tag?: unknown
  dry_run?: unknown
}

Deno.serve(async (req) => {
  try {
    const providedSecret = req.headers.get("x-cron-secret")
    const { data: expectedSecret, error: secretError } = await supabaseAdmin.rpc("get_app_secret", { p_name: "cron_shared_secret" })
    if (secretError || !providedSecret || providedSecret !== expectedSecret) {
      return new Response("unauthorized", { status: 401 })
    }

    const input = (await req.json()) as Body
    if (typeof input.profile_id !== "string" || !UUID_RE.test(input.profile_id)) return new Response("bad profile_id", { status: 400 })
    if (typeof input.title !== "string" || typeof input.body !== "string") return new Response("bad payload", { status: 400 })
    const url = typeof input.url === "string" && input.url.startsWith("/") && !input.url.startsWith("//") ? input.url : undefined
    const tag = typeof input.tag === "string" && input.tag.length > 0 ? input.tag.slice(0, 120) : undefined

    const { data: subs, error: subsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("profile_id", input.profile_id)
    if (subsError) throw subsError

    if (input.dry_run === true) return Response.json({ targets: subs?.length ?? 0, sent: 0, expired: 0, dry_run: true })
    if (!subs || subs.length === 0) return Response.json({ targets: 0, sent: 0, expired: 0, failed: 0 })

    const [{ data: vapidPublicKey }, { data: vapidPrivateKey }] = await Promise.all([
      supabaseAdmin.rpc("get_app_secret", { p_name: "vapid_public_key" }),
      supabaseAdmin.rpc("get_app_secret", { p_name: "vapid_private_key" }),
    ])
    webpush.setVapidDetails("mailto:family-app@example.com", vapidPublicKey as string, vapidPrivateKey as string)

    const payload = { title: input.title.slice(0, 120), body: input.body.slice(0, 300), url, tag }
    let sent = 0
    let expired = 0
    let failed = 0
    const options = { TTL: 3600, urgency: "high" as const }
    await Promise.all(
      subs.map(async (s) => {
        try {
          await deliverPush({ endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string }, payload, options)
          sent++
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await supabaseAdmin.rpc("delete_push_subscription", { p_endpoint: s.endpoint })
            expired++
          } else {
            failed++
            console.error("push send failed (user)", status, err)
          }
        }
      }),
    )

    // Si había a quién avisar y NO llegó a nadie por un fallo (no por suscripciones caducadas), 502: el buzón de la base de datos lo reintenta.
    if (failed > 0 && sent === 0) return Response.json({ targets: subs.length, sent, expired, failed }, { status: 502 })
    return Response.json({ targets: subs.length, sent, expired, failed })
  } catch (err) {
    console.error("[send-user-push] error:", String(err))
    return new Response("internal error", { status: 500 })
  }
})
