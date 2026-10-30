import { supabase } from '@/data/supabaseClient'
import {
  normalizeFields,
  type DeletionRequest,
  type FormField,
  type FormItem,
  type FormRecipient,
  type FormResponse,
  type MapsTo,
  type Proposal,
} from '@/domain/groupForms'

// «Solicitar datos» (migración 0356). Los permisos los hace cumplir el servidor: aquí solo se pide y se pinta lo que llega. Los DATOS DELICADOS no se leen con una consulta normal:
// solo con `readSensitive` (quien creó el formulario), que además deja constancia.

/* eslint-disable @typescript-eslint/no-explicit-any */
const FORM_COLS = 'id, group_id, created_by, title, requester_name, requester_contact, purpose, intro, fields, status, deadline, retention_max, retention_history, published_at, created_at'

const toForm = (r: any): FormItem => ({
  id: r.id,
  groupId: r.group_id,
  createdBy: r.created_by,
  title: r.title,
  requesterName: r.requester_name,
  requesterContact: r.requester_contact,
  purpose: r.purpose,
  intro: r.intro,
  fields: normalizeFields(r.fields).fields,
  status: r.status,
  deadline: r.deadline,
  retentionMax: r.retention_max,
  retentionHistory: Array.isArray(r.retention_history) ? r.retention_history : [],
  publishedAt: r.published_at,
  createdAt: r.created_at,
})
const toRecipient = (r: any): FormRecipient => ({ id: r.id, formId: r.form_id, participantId: r.participant_id, kind: r.kind, token: r.token, active: r.active })
const toResponse = (r: any): FormResponse => ({
  id: r.id,
  formId: r.form_id,
  recipientId: r.recipient_id,
  participantId: r.participant_id,
  claimedName: r.claimed_name,
  status: r.status,
  answers: r.answers ?? {},
  proposals: (Array.isArray(r.proposals) ? r.proposals : []) as Proposal[],
  submittedAt: r.submitted_at,
})
const toDeletion = (r: any): DeletionRequest => ({ id: r.id, responseId: r.response_id, reason: r.reason, status: r.status, legalReason: r.legal_reason, requestedAt: r.requested_at })
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface FormInput {
  title: string
  requesterName: string
  requesterContact: string | null
  purpose: string
  intro: string | null
  fields: FormField[]
  deadline: string | null
}

export async function listForms(groupId: string): Promise<FormItem[]> {
  const { data, error } = await supabase.from('group_forms').select(FORM_COLS).eq('group_id', groupId).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return (data ?? []).map(toForm)
}

export async function loadForm(id: string): Promise<FormItem | null> {
  const { data, error } = await supabase.from('group_forms').select(FORM_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toForm(data) : null
}

export interface FormDetail {
  form: FormItem
  recipients: FormRecipient[]
  responses: FormResponse[]
  deletions: DeletionRequest[]
  /** Qué datos delicados hay guardados y hasta cuándo, SIN su contenido (por respuesta y pregunta). */
  sensitive: { responseId: string; fieldId: string; expiresAt: string }[]
}

export async function loadFormDetail(id: string): Promise<FormDetail | null> {
  const form = await loadForm(id)
  if (!form) return null
  const [rec, resp, del, sens] = await Promise.all([
    supabase.from('group_form_recipients').select('id, form_id, participant_id, kind, token, active').eq('form_id', id).limit(5000),
    supabase.from('group_form_responses').select('id, form_id, recipient_id, participant_id, claimed_name, status, answers, proposals, submitted_at').eq('form_id', id).order('submitted_at', { ascending: false }).limit(5000),
    supabase.from('group_form_deletion_requests').select('id, response_id, reason, status, legal_reason, requested_at').eq('form_id', id).order('requested_at', { ascending: false }).limit(500),
    supabase.rpc('form_sensitive_overview', { p_form: id }),
  ])
  for (const r of [rec, resp, del, sens]) if (r.error) throw r.error
  return {
    form,
    recipients: (rec.data ?? []).map(toRecipient),
    responses: (resp.data ?? []).map(toResponse),
    deletions: (del.data ?? []).map(toDeletion),
    sensitive: ((sens.data ?? []) as { response_id: string; field_id: string; expires_at: string }[]).map((s) => ({ responseId: s.response_id, fieldId: s.field_id, expiresAt: s.expires_at })),
  }
}

export async function createForm(groupId: string, input: FormInput): Promise<string> {
  const { data, error } = await supabase
    .from('group_forms')
    .insert({
      group_id: groupId,
      title: input.title.trim(),
      requester_name: input.requesterName.trim(),
      requester_contact: input.requesterContact?.trim() || null,
      purpose: input.purpose.trim(),
      intro: input.intro?.trim() || null,
      fields: input.fields,
      deadline: input.deadline,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function updateForm(id: string, input: FormInput): Promise<void> {
  const { error } = await supabase
    .from('group_forms')
    .update({
      title: input.title.trim(),
      requester_name: input.requesterName.trim(),
      requester_contact: input.requesterContact?.trim() || null,
      purpose: input.purpose.trim(),
      intro: input.intro?.trim() || null,
      fields: input.fields,
      deadline: input.deadline,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteForm(id: string): Promise<void> {
  const { error } = await supabase.from('group_forms').delete().eq('id', id)
  if (error) throw error
}

export async function publishForm(id: string, participantIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('publish_group_form', { p_form: id, p_participants: participantIds })
  if (error) throw error
  return Number((data as { created: number }).created)
}
export async function setFormStatus(id: string, status: 'abierto' | 'cerrado'): Promise<void> {
  const { error } = await supabase.rpc('set_group_form_status', { p_form: id, p_status: status })
  if (error) throw error
}
export async function setRecipientActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_form_recipient_active', { p_recipient: id, p_active: active })
  if (error) throw error
}
/** Fija (o cambia) la fecha máxima de conservación. Acortarla se aplica ya a lo recogido; alargarla NO (cada persona aceptó su fecha). */
export async function setFormRetention(id: string, date: string): Promise<number> {
  const { data, error } = await supabase.rpc('set_form_retention', { p_form: id, p_date: date })
  if (error) throw error
  return Number((data as { shortened: number }).shortened)
}

export async function readSensitive(responseId: string): Promise<{ fieldId: string; value: unknown; expiresAt: string }[]> {
  const { data, error } = await supabase.rpc('read_form_sensitive', { p_response: responseId })
  if (error) throw error
  return data as { fieldId: string; value: unknown; expiresAt: string }[]
}
export async function resolveDeletion(requestId: string, action: 'eliminar' | 'conservar', reason: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_form_deletion', { p_request: requestId, p_action: action, p_reason: reason })
  if (error) throw error
}
export async function resolveProposal(responseId: string, field: MapsTo, apply: boolean): Promise<void> {
  const { error } = await supabase.rpc('resolve_form_proposal', { p_response: responseId, p_field: field, p_apply: apply })
  if (error) throw error
}
export async function assignResponse(responseId: string, participantId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_form_response', { p_response: responseId, p_participant: participantId })
  if (error) throw error
}

/** Enlace temporal (5 minutos) para ver un archivo adjunto. Las políticas de almacenamiento deciden quién puede. */
export async function fileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('group-form-files').createSignedUrl(path, 300)
  if (error || !data) throw error ?? new Error('No se puede abrir el archivo')
  return data.signedUrl
}

/** Lanza ya la limpieza de lo caducado (tras ejecutar una petición de eliminación anticipada). Solo la acepta quien creó el formulario. */
export async function purgeNow(formId: string): Promise<void> {
  const { data: s } = await supabase.auth.getSession()
  const token = s.session?.access_token
  if (!token) throw new Error('No autenticado')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/purge-group-form-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ formId }),
  })
  if (!res.ok) throw new Error('No se han podido eliminar los archivos ahora; se eliminarán esta noche.')
}

// ------------------------------------------------------------------------------------------------------------- plantillas propias
export interface SavedTemplate {
  id: string
  name: string
  definition: { title: string; purpose: string; intro: string | null; fields: FormField[] }
}
export async function listTemplates(): Promise<SavedTemplate[]> {
  const { data, error } = await supabase.from('group_form_templates').select('id, name, definition').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id as string, name: r.name as string, definition: { ...(r.definition as SavedTemplate['definition']), fields: normalizeFields((r.definition as { fields?: unknown }).fields).fields } }))
}
export async function saveTemplate(name: string, def: { title: string; purpose: string; intro: string | null; fields: FormField[] }): Promise<void> {
  const { error } = await supabase.from('group_form_templates').insert({ name: name.trim(), definition: def })
  if (error) throw error
}
export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('group_form_templates').delete().eq('id', id)
  if (error) throw error
}
