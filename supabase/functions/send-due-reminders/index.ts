import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import webpush from "npm:web-push@3.6.7"

// Recordatorios con la app cerrada: pg_cron llama a esta función cada
// minuto (ver migración 0005_schedule_reminder_cron.sql). Autenticación
// propia por cabecera (no JWT de usuario, la llama pg_net) — el secreto
// compartido vive en Vault, nunca en el código.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  try {
    const providedSecret = req.headers.get("x-cron-secret")
    const { data: expectedSecret, error: secretError } = await supabaseAdmin.rpc(
      "get_app_secret",
      { p_name: "cron_shared_secret" },
    )
    if (secretError || !providedSecret || providedSecret !== expectedSecret) {
      return new Response("unauthorized", { status: 401 })
    }

    const [{ data: vapidPublicKey }, { data: vapidPrivateKey }] = await Promise.all([
      supabaseAdmin.rpc("get_app_secret", { p_name: "vapid_public_key" }),
      supabaseAdmin.rpc("get_app_secret", { p_name: "vapid_private_key" }),
    ])

    webpush.setVapidDetails(
      "mailto:family-app@example.com",
      vapidPublicKey as string,
      vapidPrivateKey as string,
    )

    const { data: reminders, error } = await supabaseAdmin.rpc("claim_due_reminders")
    if (error) throw error

    let sent = 0
    let expired = 0

    for (const r of reminders ?? []) {
      const time = new Date(r.out_anchor_at).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })
      // Un recordatorio "de fin" (p. ej. "recógelo") tiene que decir
      // "Termina", no "Empieza" — si no, el aviso de ir a recoger a
      // alguien diría la hora de inicio y confundiría más que ayudar.
      const body = r.out_anchor === "end" ? `Termina a las ${time}` : `Empieza a las ${time}`
      try {
        await webpush.sendNotification(
          {
            endpoint: r.out_endpoint,
            keys: { p256dh: r.out_p256dh, auth: r.out_auth },
          },
          JSON.stringify({ title: r.out_event_title, body }),
        )
        sent++
      } catch (err) {
        // 404/410: la suscripción ya no es válida (navegador desinstalado,
        // permiso revocado, etc.) — la borramos para no reintentar en vano.
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await supabaseAdmin.rpc("delete_push_subscription", { p_endpoint: r.out_endpoint })
          expired++
        } else {
          console.error("push send failed", status, err)
        }
      }
    }

    return Response.json({ checked: reminders?.length ?? 0, sent, expired })
  } catch (err) {
    console.error(err)
    return new Response("internal error", { status: 500 })
  }
})
