import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"
import { FCM_PREFIX, sendFcm, type FcmServiceAccount } from "./fcm.ts"

// Manda un Web Push a los dispositivos de UNA familia. Lo llama la propia base de datos (pg_net, ver
// migración 0186_server_side_automations.sql) en el instante en que alguien llega a un lugar, se va de
// él, o se cumple la hora de un aviso diario — petición real: "los avisos quiero que lleguen cuando
// Paco se mueva o cuando Jennifer se mueva". Sin JWT de usuario (la llama pg_net): autenticación por
// cabecera con el secreto compartido de Vault, igual que send-due-reminders.
//
// service_role no pasa por RLS: TODAS las consultas de abajo se limitan a la familia que llega en el
// cuerpo — es la única barrera entre familias.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Entrega de UN aviso: a los móviles de la app nativa (dirección «fcm:<token>») por Firebase, al resto por Web Push. Los errores llevan
// statusCode (404/410 = suscripción caducada), así que el código que borra suscripciones muertas sirve para los dos caminos.
// La cuenta de servicio de Firebase vive en el Vault (secreto fcm_service_account); sin ella, los móviles nativos no reciben avisos pero el
// resto sigue igual.
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
  family_id?: unknown
  exclude_member_id?: unknown
  only_profile_id?: unknown
  title?: unknown
  body?: unknown
  url?: unknown
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
    if (typeof input.family_id !== "string" || !UUID_RE.test(input.family_id)) return new Response("bad family_id", { status: 400 })
    if (typeof input.title !== "string" || typeof input.body !== "string") return new Response("bad payload", { status: 400 })
    const familyId = input.family_id
    const excludeMemberId = typeof input.exclude_member_id === "string" && UUID_RE.test(input.exclude_member_id) ? input.exclude_member_id : null
    const url = typeof input.url === "string" && input.url.startsWith("/") ? input.url : undefined

    // Quien se ha movido no necesita que le avisen de sí mismo: se excluye la cuenta ligada a ese
    // miembro (si la tiene). El filtro por family_id evita que un id de otra familia excluya a nadie.
    let excludeProfileId: string | null = null
    if (excludeMemberId) {
      const { data: member } = await supabaseAdmin
        .from("family_members")
        .select("linked_profile_id")
        .eq("id", excludeMemberId)
        .eq("family_id", familyId)
        .maybeSingle()
      excludeProfileId = (member?.linked_profile_id as string | null) ?? null
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin.from("profiles").select("id").eq("family_id", familyId)
    if (profilesError) throw profilesError
    // only_profile_id (aviso de prueba): solo a una persona — y solo si de verdad es de esta familia.
    const onlyProfileId = typeof input.only_profile_id === "string" && UUID_RE.test(input.only_profile_id) ? input.only_profile_id : null
    const profileIds = (profiles ?? [])
      .map((p) => p.id as string)
      .filter((id) => id !== excludeProfileId)
      .filter((id) => onlyProfileId === null || id === onlyProfileId)
    if (profileIds.length === 0) return Response.json({ targets: 0, sent: 0, expired: 0 })

    const { data: subs, error: subsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("profile_id", profileIds)
    if (subsError) throw subsError

    if (input.dry_run === true) return Response.json({ targets: subs?.length ?? 0, sent: 0, expired: 0, dry_run: true })

    const [{ data: vapidPublicKey }, { data: vapidPrivateKey }] = await Promise.all([
      supabaseAdmin.rpc("get_app_secret", { p_name: "vapid_public_key" }),
      supabaseAdmin.rpc("get_app_secret", { p_name: "vapid_private_key" }),
    ])
    webpush.setVapidDetails("mailto:family-app@example.com", vapidPublicKey as string, vapidPrivateKey as string)

    const payload = { title: input.title.slice(0, 120), body: input.body.slice(0, 300), url }
    let sent = 0
    let expired = 0
    // TTL corto + urgencia alta: un "Paco ha llegado a casa" de hace una hora ya no sirve, y sin
    // urgencia alta Android/iOS pueden retrasar el aviso mientras el móvil está en reposo.
    const options = { TTL: 3600, urgency: "high" as const }
    await Promise.all(
      (subs ?? []).map(async (s) => {
        try {
          await deliverPush({ endpoint: s.endpoint as string, p256dh: s.p256dh as string, auth: s.auth as string }, payload, options)
          sent++
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await supabaseAdmin.rpc("delete_push_subscription", { p_endpoint: s.endpoint })
            expired++
          } else {
            console.error("push send failed (family)", status, err)
          }
        }
      }),
    )

    return Response.json({ targets: subs?.length ?? 0, sent, expired })
  } catch (err) {
    console.error("[send-family-push] error:", String(err))
    return new Response("internal error", { status: 500 })
  }
})
