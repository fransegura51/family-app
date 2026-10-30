import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

// «Gestión de grupos» → «Solicitar datos»: ELIMINA los datos delicados cuya fecha de conservación ha vencido, junto con sus archivos del almacenamiento privado (migración 0356).
//   · Cron diario (cabecera x-cron-secret contra el secreto `cron_shared_secret`): limpia todos los formularios.
//   · Una persona con sesión que creó el formulario ({formId}): limpia solo ese (justo después de ejecutar una petición de eliminación anticipada).
// Solo elimina lo que ya figura como caducado (expires_at <= hoy en Madrid: se elimina el propio día de la fecha, de madrugada); nunca decide por su cuenta qué borrar. Se elimina lo guardado en PEPA: las copias que ya descargó o envió
// alguien fuera de PEPA, y las copias de seguridad del servicio hasta que se renueven, no están bajo su control.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const BUCKET = "group-form-files"
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization, x-cron-secret, apikey" }

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } })

// Fecha de hoy («YYYY-MM-DD») en Madrid, igual que _shared/groups/formSchema.ts (todayIn): aquí en línea para que esta función no dependa de nada más.
function todayIn(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS })
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const body = await req.json().catch(() => ({}))
  let onlyForm: string | null = null

  const cron = req.headers.get("x-cron-secret")
  if (cron) {
    const { data: expected } = await admin.rpc("get_app_secret", { p_name: "cron_shared_secret" })
    if (typeof expected !== "string" || !expected || !timingSafeEqual(cron, expected)) return json({ error: "unauthorized" }, 401)
  } else {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
    const formId = typeof body?.formId === "string" ? body.formId : ""
    if (!jwt || !/^[0-9a-f-]{36}$/i.test(formId)) return json({ error: "unauthorized" }, 401)
    const { data: u } = await admin.auth.getUser(jwt)
    if (!u?.user) return json({ error: "unauthorized" }, 401)
    const { data: f } = await admin.from("group_forms").select("created_by").eq("id", formId).maybeSingle()
    if (!f || f.created_by !== u.user.id) return json({ error: "unauthorized" }, 401)
    onlyForm = formId
  }

  const today = todayIn(new Date())
  let q = admin.from("group_form_sensitive").select("id, value").lte("expires_at", today).limit(500)
  if (onlyForm) q = q.eq("form_id", onlyForm)
  const { data: due, error } = await q
  if (error) return json({ error: "query_failed" }, 500)
  const files: string[] = []
  for (const row of due ?? []) if (Array.isArray(row.value)) files.push(...(row.value as unknown[]).filter((p): p is string => typeof p === "string"))
  // Primero los archivos (si falla, no se borra el registro y se reintenta mañana), después las filas.
  if (files.length > 0) {
    const { error: re } = await admin.storage.from(BUCKET).remove(files)
    if (re) return json({ error: "storage_failed" }, 500)
  }
  const ids = (due ?? []).map((r) => r.id as string)
  if (ids.length > 0) await admin.from("group_form_sensitive").delete().in("id", ids)
  return json({ ok: true, rows: ids.length, files: files.length })
})
