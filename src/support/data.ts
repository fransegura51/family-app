import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import type {
  SupportAdminRow,
  SupportAttachment,
  SupportEvent,
  SupportKind,
  SupportMessage,
  SupportPriority,
  SupportStats,
  SupportStatus,
  SupportTicket,
} from '@/support/types'
import { attachmentPath, safeExtension, validateAttachment } from '@/support/validate'

// Capa de datos del Soporte técnico (migración 0310). Las TABLAS solo se leen (la RLS enseña a cada persona lo suyo y a la administración de PEPA todo); TODA escritura pasa por
// funciones del servidor que validan longitudes, límites diarios y pertenencia. Nada de esto se usa mientras SUPPORT_ENABLED sea false (src/support/flags.ts).
const TICKET_COLUMNS =
  'id, requester_id, family_id, kind, section, subject, status, priority, assignee_id, context, user_unread, admin_unread, message_count, created_at, updated_at, last_message_at'

interface TicketRow {
  id: string
  requester_id: string
  family_id: string
  kind: SupportKind
  section: string
  subject: string
  status: SupportStatus
  priority: SupportPriority
  assignee_id: string | null
  context: Record<string, string> | null
  user_unread: boolean
  admin_unread: boolean
  message_count: number
  created_at: string
  updated_at: string
  last_message_at: string
}

const mapTicket = (r: TicketRow): SupportTicket => ({
  id: r.id,
  requesterId: r.requester_id,
  familyId: r.family_id,
  kind: r.kind,
  section: r.section,
  subject: r.subject,
  status: r.status,
  priority: r.priority,
  assigneeId: r.assignee_id,
  context: r.context ?? {},
  userUnread: r.user_unread,
  adminUnread: r.admin_unread,
  messageCount: r.message_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastMessageAt: r.last_message_at,
})

interface MessageRow {
  id: string
  ticket_id: string
  author_kind: SupportMessage['authorKind']
  author_id: string | null
  visibility: SupportMessage['visibility']
  body: string
  responder: string
  created_at: string
}

const mapMessage = (r: MessageRow): SupportMessage => ({
  id: r.id,
  ticketId: r.ticket_id,
  authorKind: r.author_kind,
  authorId: r.author_id,
  visibility: r.visibility,
  body: r.body,
  responder: r.responder,
  createdAt: r.created_at,
})

// ---- Lectura (persona usuaria)
export async function listMyTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase.from('support_tickets').select(TICKET_COLUMNS).order('last_message_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data as TicketRow[]).map(mapTicket)
}

export async function getTicket(id: string): Promise<SupportTicket | null> {
  const { data, error } = await supabase.from('support_tickets').select(TICKET_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapTicket(data as TicketRow) : null
}

export async function listMessages(ticketId: string): Promise<SupportMessage[]> {
  const { data, error } = await supabase
    .from('support_messages')
    .select('id, ticket_id, author_kind, author_id, visibility, body, responder, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as MessageRow[]).map(mapMessage)
}

export async function listAttachments(ticketId: string): Promise<SupportAttachment[]> {
  const { data, error } = await supabase
    .from('support_attachments')
    .select('id, ticket_id, message_id, storage_path, file_name, mime_type, size_bytes, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, ticketId: r.ticket_id, messageId: r.message_id, storagePath: r.storage_path, fileName: r.file_name, mimeType: r.mime_type, sizeBytes: r.size_bytes, createdAt: r.created_at }))
}

export async function listTicketEvents(ticketId: string): Promise<SupportEvent[]> {
  const { data, error } = await supabase
    .from('support_ticket_events')
    .select('id, ticket_id, actor_kind, event, from_value, to_value, visible_to_user, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data.map((r) => ({ id: r.id, ticketId: r.ticket_id, actorKind: r.actor_kind, event: r.event, fromValue: r.from_value, toValue: r.to_value, visibleToUser: r.visible_to_user, createdAt: r.created_at }))
}

export async function attachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('support-attachments').createSignedUrl(storagePath, 600)
  if (error) throw error
  return data.signedUrl
}

// ---- Escritura (persona usuaria): solo a través de funciones del servidor
export async function createTicket(input: { kind: SupportKind; section: string; subject: string; body: string; context: Record<string, string> }): Promise<string> {
  const { data, error } = await supabase.rpc('support_create_ticket', { p_kind: input.kind, p_section: input.section, p_subject: input.subject.trim(), p_body: input.body.trim(), p_context: input.context })
  if (error) throw error
  return data as string
}

export async function postMessage(ticketId: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('support_post_message', { p_ticket: ticketId, p_body: body.trim() })
  if (error) throw error
  return data as string
}

export async function confirmResolution(ticketId: string, resolved: boolean): Promise<SupportStatus> {
  const { data, error } = await supabase.rpc('support_confirm_resolution', { p_ticket: ticketId, p_resolved: resolved })
  if (error) throw error
  return data as SupportStatus
}

export async function markTicketRead(ticketId: string): Promise<void> {
  const { error } = await supabase.rpc('support_mark_read', { p_ticket: ticketId })
  if (error) throw error
}

// El mensaje inicial de una incidencia recién creada (para colgarle los adjuntos).
export async function firstMessageId(ticketId: string): Promise<string | null> {
  const { data, error } = await supabase.from('support_messages').select('id').eq('ticket_id', ticketId).eq('author_kind', 'user').order('created_at', { ascending: true }).limit(1)
  if (error) throw error
  return data?.[0]?.id ?? null
}

// Sube los adjuntos al almacenamiento PRIVADO y los registra en el servidor. Las fotos se comprimen antes de subirlas. Devuelve los que no se pudieron guardar (con el motivo) en vez de
// fallar la incidencia entera: el mensaje ya está enviado y la persona puede volver a adjuntar.
export async function attachFiles(ticket: Pick<SupportTicket, 'id' | 'familyId'>, messageId: string, files: File[]): Promise<{ failed: Array<{ name: string; reason: string }> }> {
  const failed: Array<{ name: string; reason: string }> = []
  for (const original of files) {
    const bad = validateAttachment(original)
    if (bad) {
      failed.push({ name: original.name, reason: bad })
      continue
    }
    try {
      const file = original.type.startsWith('image/') ? await compressImageFile(original) : original
      const path = attachmentPath(ticket.familyId, ticket.id, crypto.randomUUID(), safeExtension(file.name, file.type || original.type))
      const { error: upErr } = await supabase.storage.from('support-attachments').upload(path, file, { contentType: file.type || original.type, upsert: false })
      if (upErr) throw upErr
      const { error } = await supabase.rpc('support_register_attachment', { p_ticket: ticket.id, p_message: messageId, p_path: path, p_name: original.name, p_mime: file.type || original.type, p_size: file.size })
      if (error) {
        await supabase.storage.from('support-attachments').remove([path]) // no dejar archivos huérfanos si el servidor lo rechaza
        throw error
      }
    } catch {
      failed.push({ name: original.name, reason: 'No se ha podido subir.' })
    }
  }
  return { failed }
}

// ---- Administración de PEPA (cuentas propietarias): las funciones comprueban el permiso en el servidor
export async function adminListTickets(filters: { status?: SupportStatus | null; section?: string | null; priority?: SupportPriority | null; assignee?: string | null } = {}): Promise<SupportAdminRow[]> {
  const { data, error } = await supabase.rpc('support_admin_list', { p_status: filters.status ?? null, p_section: filters.section ?? null, p_priority: filters.priority ?? null, p_assignee: filters.assignee ?? null, p_limit: 200 })
  if (error) throw error
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    requesterName: (r.requester_name as string | null) ?? null,
    familyName: (r.family_name as string | null) ?? null,
    kind: r.kind as SupportKind,
    section: r.section as string,
    subject: r.subject as string,
    status: r.status as SupportStatus,
    priority: r.priority as SupportPriority,
    assigneeId: (r.assignee_id as string | null) ?? null,
    assigneeName: (r.assignee_name as string | null) ?? null,
    createdAt: r.created_at as string,
    lastMessageAt: r.last_message_at as string,
    adminUnread: Boolean(r.admin_unread),
    messageCount: Number(r.message_count),
    duplicateOf: (r.duplicate_of as string | null) ?? null,
  }))
}

export async function adminReply(ticketId: string, body: string, internal: boolean, newStatus: SupportStatus | null): Promise<string> {
  const { data, error } = await supabase.rpc('support_admin_reply', { p_ticket: ticketId, p_body: body.trim(), p_internal: internal, p_new_status: newStatus })
  if (error) throw error
  return data as string
}

export async function adminSetStatus(ticketId: string, status: SupportStatus): Promise<void> {
  const { error } = await supabase.rpc('support_admin_set_status', { p_ticket: ticketId, p_status: status })
  if (error) throw error
}

export async function adminAssign(ticketId: string, assignee: string | null): Promise<void> {
  const { error } = await supabase.rpc('support_admin_assign', { p_ticket: ticketId, p_assignee: assignee })
  if (error) throw error
}

export async function adminSetPriority(ticketId: string, priority: SupportPriority): Promise<void> {
  const { error } = await supabase.rpc('support_admin_set_priority', { p_ticket: ticketId, p_priority: priority })
  if (error) throw error
}

export async function adminMarkRead(ticketId: string): Promise<void> {
  const { error } = await supabase.rpc('support_admin_mark_read', { p_ticket: ticketId })
  if (error) throw error
}

export async function adminSimilar(ticketId: string): Promise<Array<{ id: string; subject: string; status: SupportStatus; section: string; kind: SupportKind; createdAt: string }>> {
  const { data, error } = await supabase.rpc('support_admin_similar', { p_ticket: ticketId })
  if (error) throw error
  return (data as Array<Record<string, unknown>>).map((r) => ({ id: r.id as string, subject: r.subject as string, status: r.status as SupportStatus, section: r.section as string, kind: r.kind as SupportKind, createdAt: r.created_at as string }))
}

export async function adminOwners(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase.rpc('support_admin_owners')
  if (error) throw error
  return (data as Array<{ id: string; display_name: string | null }>).map((r) => ({ id: r.id, name: r.display_name ?? 'Administración' }))
}

export async function adminStats(): Promise<SupportStats> {
  const { data, error } = await supabase.rpc('support_admin_stats')
  if (error) throw error
  const d = data as Record<string, unknown>
  return {
    total: Number(d.total ?? 0),
    abiertas: Number(d.abiertas ?? 0),
    sinLeer: Number(d.sin_leer ?? 0),
    porEstado: (d.por_estado as Record<string, number>) ?? {},
    porSeccion: (d.por_seccion as Record<string, number>) ?? {},
    creadas30Dias: Number(d.creadas_30_dias ?? 0),
    horasPrimeraRespuesta: d.horas_primera_respuesta == null ? null : Number(d.horas_primera_respuesta),
  }
}
