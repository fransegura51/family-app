import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  normalizeFields,
  retentionExpiry,
  todayIn,
  validateAnswers,
  type AnswerValue,
  type FormField,
} from "../_shared/groups/formSchema.ts"

// «Gestión de grupos» → «Solicitar datos» (migración 0356). Formulario PÚBLICO para una persona SIN cuenta PEPA. Mismo patrón que event-rsvp y group-fund-public: esta función solo devuelve
// JSON; lo pinta GroupFormPublicScreen (ruta pública de la SPA, "/?formulario=TOKEN"). verify_jwt = false (la llamada no lleva Authorization).
//
// Autenticación: el token secreto del enlace (group_form_recipients.token, revocable). Con el rol de servicio, así que aquí se define a mano qué es público y qué NO lo es NUNCA:
//   · Se enseña el formulario (quién lo pide, para qué, las preguntas) y, a quien ya respondió, SUS respuestas ordinarias. Los datos delicados ya guardados NO se devuelven nunca.
//   · No se enseña nada de otras personas ni de otras respuestas. El enlace de una persona es de esa persona; el general pide el nombre del alumno y deja la respuesta «por revisar».
//   · Una respuesta solo completa la ficha de un participante si el campo estaba VACÍO; si hay otro valor queda como propuesta pendiente de confirmar por quien gestiona el grupo.
//   · Los datos delicados van a una tabla sin lectura normal, con fecha de eliminación (la de quien organiza o una anterior que elija quien responde).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const BUCKET = "group-form-files"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } })
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function underRateLimit(admin: ReturnType<typeof createClient>, req: Request, scopeKey: string, limit: number): Promise<boolean> {
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "").split(",")[0].trim() || "unknown"
  const byIp = await admin.rpc("rsvp_rate_limit_hit", { p_key: "gfp_ip:" + (await sha256Hex(ip)), p_limit: 90, p_window_seconds: 600 })
  if (byIp.error || byIp.data !== true) return false
  const byScope = await admin.rpc("rsvp_rate_limit_hit", { p_key: "gfp:" + (await sha256Hex(scopeKey)), p_limit: limit, p_window_seconds: 600 })
  return !byScope.error && byScope.data === true
}

const fold = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

interface RecipientRow {
  id: string
  form_id: string
  participant_id: string | null
  kind: "participante" | "general"
  active: boolean
}
interface FormRow {
  id: string
  group_id: string
  title: string
  requester_name: string
  requester_contact: string | null
  purpose: string
  intro: string | null
  fields: unknown
  status: "borrador" | "abierto" | "cerrado"
  deadline: string | null
  retention_max: string | null
}

const COLUMN_OF: Record<string, string> = { surname: "surname", guardianName: "guardian_name", phone: "phone", email: "email" }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS })
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get("token")
    if (!token || token.length < 16 || token.length > 128) return json({ error: "not_found" }, 404)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    if (!(await underRateLimit(admin, req, "tok:" + token, req.method === "POST" ? 20 : 60))) return json({ error: "rate_limited" }, 429)

    const { data: rec } = await admin.from("group_form_recipients").select("id, form_id, participant_id, kind, active").eq("token", token).maybeSingle()
    const recipient = rec as RecipientRow | null
    if (!recipient || !recipient.active) return json({ error: "not_found" }, 404)
    const { data: formData } = await admin
      .from("group_forms")
      .select("id, group_id, title, requester_name, requester_contact, purpose, intro, fields, status, deadline, retention_max")
      .eq("id", recipient.form_id)
      .maybeSingle()
    const form = formData as FormRow | null
    if (!form || form.status === "borrador") return json({ error: "not_found" }, 404)
    const fields: FormField[] = normalizeFields(form.fields).fields
    const today = todayIn(new Date())
    const closed = form.status === "cerrado" || (!!form.deadline && form.deadline < today)
    const { data: groupData } = await admin.from("groups").select("name, archived_at").eq("id", form.group_id).maybeSingle()
    const groupName = (groupData?.name as string | undefined) ?? ""
    const sensitiveIds = new Set(fields.filter((f) => f.sensitive).map((f) => f.id))

    // Respuesta existente de ESTA persona (enlace personal).
    let existing: { id: string; answers: Record<string, AnswerValue>; proposals: unknown; retention_max_at_answer: string | null } | null = null
    if (recipient.kind === "participante") {
      const { data } = await admin.from("group_form_responses").select("id, answers, proposals, retention_max_at_answer").eq("recipient_id", recipient.id).maybeSingle()
      existing = (data as typeof existing) ?? null
    }

    if (req.method === "GET") {
      let personName: string | null = null
      if (recipient.participant_id) {
        const { data: p } = await admin.from("group_participants").select("name, surname").eq("id", recipient.participant_id).maybeSingle()
        personName = p ? [p.name, p.surname].filter(Boolean).join(" ") : null
      }
      let agreedExpires: string | null = null
      let deletion: { status: string; legalReason: string | null } | null = null
      if (existing) {
        const { data: sens } = await admin.from("group_form_sensitive").select("expires_at").eq("response_id", existing.id)
        const dates = (sens ?? []).map((s) => s.expires_at as string).sort()
        agreedExpires = dates[0] ?? null
        const { data: dr } = await admin.from("group_form_deletion_requests").select("status, legal_reason").eq("response_id", existing.id).order("requested_at", { ascending: false }).limit(1).maybeSingle()
        if (dr) deletion = { status: dr.status as string, legalReason: (dr.legal_reason as string | null) ?? null }
      }
      return json({
        kind: recipient.kind,
        title: form.title,
        requesterName: form.requester_name,
        requesterContact: form.requester_contact,
        groupName,
        purpose: form.purpose,
        intro: form.intro,
        deadline: form.deadline,
        closed: closed || !!groupData?.archived_at,
        personName,
        fields: fields.map((f) => ({ id: f.id, type: f.type, label: f.label, help: f.help, required: f.required, options: f.options, sensitive: f.sensitive })),
        retention: sensitiveIds.size > 0 && form.retention_max ? { max: form.retention_max, today } : null,
        answered: !!existing,
        previous: existing ? existing.answers : null,
        sensitiveStored: existing ? [...sensitiveIds].filter(() => agreedExpires !== null) : [],
        agreedExpires,
        retentionChangedSinceAnswer: !!existing && !!existing.retention_max_at_answer && existing.retention_max_at_answer !== form.retention_max,
        retentionMax: form.retention_max,
        deletion,
      })
    }

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405)
    if (closed || groupData?.archived_at) return json({ error: "closed" }, 409)

    // ------------------------------------------------------------------------------------------------ subir un archivo
    const ctype = req.headers.get("content-type") ?? ""
    if (ctype.includes("multipart/form-data")) {
      const fd = await req.formData()
      const fieldId = String(fd.get("fieldId") ?? "")
      const file = fd.get("file")
      const field = fields.find((f) => f.id === fieldId && f.type === "archivo")
      if (!field || !(file instanceof File)) return json({ error: "bad_request" }, 400)
      const ext = ALLOWED_UPLOAD_TYPES[file.type]
      if (!ext) return json({ error: "file_type" }, 415)
      if (file.size > MAX_UPLOAD_BYTES || file.size === 0) return json({ error: "file_size" }, 413)
      const path = `${form.id}/${recipient.id}/${field.id}-${crypto.randomUUID()}.${ext}`
      const { error } = await admin.storage.from(BUCKET).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false })
      if (error) return json({ error: "upload_failed" }, 500)
      return json({ ok: true, path })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return json({ error: "bad_request" }, 400)

    // ------------------------------------------------------------------------------------------------ pedir la eliminación anticipada
    if (body.action === "request_deletion") {
      if (!existing) return json({ error: "nothing_to_delete" }, 404)
      const { count } = await admin.from("group_form_sensitive").select("id", { count: "exact", head: true }).eq("response_id", existing.id)
      if ((count ?? 0) === 0) return json({ error: "nothing_to_delete" }, 404)
      const { count: open } = await admin.from("group_form_deletion_requests").select("id", { count: "exact", head: true }).eq("response_id", existing.id).eq("status", "pendiente")
      if ((open ?? 0) > 0) return json({ ok: true, already: true })
      const reason = typeof body.reason === "string" ? body.reason.replace(/\s+/g, " ").trim().slice(0, 500) : ""
      const { error } = await admin.from("group_form_deletion_requests").insert({ response_id: existing.id, form_id: form.id, reason: reason || null })
      if (error) return json({ error: "save_failed" }, 500)
      return json({ ok: true })
    }

    if (body.action !== "submit") return json({ error: "bad_request" }, 400)

    // ------------------------------------------------------------------------------------------------ enviar la respuesta
    const check = validateAnswers(fields, body.answers, `${form.id}/${recipient.id}/`)
    if (Object.keys(check.errors).length > 0) return json({ error: "invalid", errors: check.errors }, 422)

    let claimedName: string | null = null
    if (recipient.kind === "general") {
      claimedName = typeof body.studentName === "string" ? body.studentName.replace(/\s+/g, " ").trim().slice(0, 160) : ""
      if (claimedName.length < 2) return json({ error: "invalid", errors: { studentName: "Escribe el nombre de la persona a la que se refiere." } }, 422)
    }

    const ordinary: Record<string, AnswerValue> = {}
    const sensitive: Record<string, AnswerValue> = {}
    for (const [k, v] of Object.entries(check.clean)) (sensitiveIds.has(k) ? sensitive : ordinary)[k] = v

    let expires: string | null = null
    if (Object.keys(sensitive).length > 0) {
      if (body.consent !== true) return json({ error: "consent_required" }, 422)
      if (!form.retention_max || form.retention_max <= today) return json({ error: "retention_missing" }, 409)
      const chosen = typeof body.retentionDate === "string" ? body.retentionDate : null
      expires = retentionExpiry(form.retention_max, chosen, today)
    }

    // A qué persona corresponde: la del enlace personal; en el general, solo si el nombre escrito coincide con UNA persona (y aun así queda «por revisar»).
    let participantId = recipient.participant_id
    if (!participantId && claimedName) {
      const { data: people } = await admin.from("group_participants").select("id, name, surname").eq("group_id", form.group_id).is("left_at", null).limit(2000)
      const key = fold(claimedName)
      const found = (people ?? []).filter((p) => fold([p.name, p.surname].filter(Boolean).join(" ")) === key)
      if (found.length === 1) participantId = found[0].id as string
    }

    // Cambios propuestos para la ficha (solo enlace personal): campo vacío → se completa; igual → nada; distinto → pendiente de confirmar.
    const proposals: { field: string; value: string; current: string | null; status: string }[] = []
    if (recipient.participant_id) {
      const { data: person } = await admin.from("group_participants").select("surname, guardian_name, phone, email").eq("id", recipient.participant_id).maybeSingle()
      const prev = (existing?.proposals as { field: string; value: string; status: string }[] | undefined) ?? []
      const patch: Record<string, string> = {}
      for (const f of fields) {
        if (!f.mapsTo || f.sensitive) continue
        const v = ordinary[f.id]
        if (typeof v !== "string" || !v.trim()) continue
        const col = COLUMN_OF[f.mapsTo]
        const current = ((person as Record<string, string | null> | null)?.[col] ?? null) as string | null
        const same = !!current && fold(current) === fold(v)
        let status: string
        if (!current) {
          patch[col] = v
          status = "aplicado"
        } else if (same) status = "igual"
        else status = prev.some((p) => p.field === f.mapsTo && p.value === v && p.status === "ignorado") ? "ignorado" : "conflicto"
        proposals.push({ field: f.mapsTo, value: v, current, status })
      }
      if (Object.keys(patch).length > 0) await admin.from("group_participants").update(patch).eq("id", recipient.participant_id)
    }

    const row = {
      form_id: form.id,
      recipient_id: recipient.id,
      participant_id: participantId,
      claimed_name: claimedName,
      status: recipient.kind === "general" ? "revisar" : "recibida",
      answers: ordinary,
      proposals,
      retention_max_at_answer: form.retention_max,
      updated_at: new Date().toISOString(),
    }
    let responseId: string
    if (existing) {
      const { error } = await admin.from("group_form_responses").update(row).eq("id", existing.id)
      if (error) return json({ error: "save_failed" }, 500)
      responseId = existing.id
    } else {
      if (recipient.kind === "general") {
        const { count } = await admin.from("group_form_responses").select("id", { count: "exact", head: true }).eq("recipient_id", recipient.id)
        if ((count ?? 0) >= 400) return json({ error: "too_many" }, 429)
      }
      const { data, error } = await admin.from("group_form_responses").insert(row).select("id").single()
      if (error || !data) return json({ error: "save_failed" }, 500)
      responseId = data.id as string
    }

    // Datos delicados: se guardan (o se actualizan) con SU fecha; los que ya no se contestan se eliminan, con sus archivos.
    const { data: oldSens } = await admin.from("group_form_sensitive").select("id, field_id, value").eq("response_id", responseId)
    const keepIds = new Set(Object.keys(sensitive))
    const oldFiles: string[] = []
    for (const o of oldSens ?? []) {
      const incoming = sensitive[o.field_id as string]
      if (!keepIds.has(o.field_id as string)) {
        if (Array.isArray(o.value)) oldFiles.push(...(o.value as string[]))
        await admin.from("group_form_sensitive").delete().eq("id", o.id)
      } else if (Array.isArray(o.value) && Array.isArray(incoming)) {
        oldFiles.push(...(o.value as string[]).filter((p) => !(incoming as string[]).includes(p)))
      }
    }
    for (const [fieldId, value] of Object.entries(sensitive)) {
      const chosen = typeof body.retentionDate === "string" && expires && expires === body.retentionDate ? expires : null
      const { error } = await admin
        .from("group_form_sensitive")
        .upsert({ response_id: responseId, form_id: form.id, field_id: fieldId, value, expires_at: expires, chosen_date: chosen }, { onConflict: "response_id,field_id" })
      if (error) return json({ error: "save_failed" }, 500)
    }
    if (oldFiles.length > 0) await admin.storage.from(BUCKET).remove(oldFiles)

    return json({ ok: true, expires })
  } catch (_e) {
    return json({ error: "server_error" }, 500)
  }
})
