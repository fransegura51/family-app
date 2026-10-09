// Preparativos — "🗂️ Encargos" (migración 0212, extendida en 0215): agrupación organizativa de tareas
// relacionadas (p. ej. "Flores": ramo, prendidos, decoración, recoger). UN grupo principal por tarea.
// Desde 0215, un encargo puede RESOLVERSE (proveedor real + precio total opcional, reutilizando
// event_providers/event_payments tal cual — nunca event_budget_items, ver cabecera de esa migración).
// Desde 0223 (Parte B Fase 6), un encargo puede recibir varias OFERTAS para comparar antes de resolverlo
// — ver EventTaskGroupOffer en domain/types.ts: solo información, nunca un compromiso económico.
import { compressImageFile } from '@/domain/imageCompression'
import { supabase } from '@/data/supabaseClient'
import type { EventTaskGroup, EventTaskGroupOffer, EventTaskGroupOfferStatus, EventTaskGroupResolution, EventTaskGroupResolutionMethod } from '@/domain/types'

const GROUP_SELECT = 'id, event_id, name, sort_order, kind, resolved_at, resolution_method, resolution_note, provider_id, provider_name, payment_id'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGroup(r: any): EventTaskGroup {
  return {
    id: r.id,
    eventId: r.event_id,
    name: r.name,
    sortOrder: r.sort_order,
    kind: r.kind,
    resolvedAt: r.resolved_at,
    resolutionMethod: r.resolution_method,
    resolutionNote: r.resolution_note,
    providerId: r.provider_id,
    providerName: r.provider_name,
    paymentId: r.payment_id,
  }
}

// Postgres: violación de unicidad — mismo criterio que usa events.ts para create_task concurrentes.
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

export async function listEventTaskGroups(eventId: string): Promise<EventTaskGroup[]> {
  const { data, error } = await supabase.from('event_task_groups').select(GROUP_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapGroup)
}

export async function addEventTaskGroup(eventId: string, name: string): Promise<string> {
  const { data: event, error: eventError } = await supabase.from('events').select('family_id').eq('id', eventId).single()
  if (eventError) throw eventError
  const { data, error } = await supabase
    .from('event_task_groups')
    .insert({ event_id: eventId, family_id: event.family_id, name: name.trim(), sort_order: Date.now() })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function renameEventTaskGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.from('event_task_groups').update({ name: name.trim() }).eq('id', groupId)
  if (error) throw error
}

// Borrar un encargo NUNCA borra sus tareas: el FK ON DELETE SET NULL (migración 0212) las deja sin
// encargo, exactamente como estaban antes de agruparlas — nunca una limpieza en cascada.
export async function deleteEventTaskGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('event_task_groups').delete().eq('id', groupId)
  if (error) throw error
}

export async function countTasksInGroup(groupId: string): Promise<number> {
  const { count, error } = await supabase.from('event_tasks').select('id', { count: 'exact', head: true }).eq('group_id', groupId)
  if (error) throw error
  return count ?? 0
}

// Asocia/desasocia una tarea de un encargo (null = quitarla del grupo sin borrar la tarea). Un único
// UPDATE sobre event_tasks.group_id — nunca toca título, fecha, responsables, prioridad, nota,
// Calendario ni recordatorios.
export async function setEventTaskGroup(taskId: string, groupId: string | null): Promise<void> {
  const { error } = await supabase.from('event_tasks').update({ group_id: groupId }).eq('id', taskId)
  if (error) throw error
}

// Auto-agrupación EN ORIGEN (Tanda Encargos v2): idempotente por (event_id, kind) — kind es el
// identificador INTERNO estable (nunca el name, que la familia puede renombrar), así que reconoce el
// mismo encargo aunque ya lo hayan renombrado. Si dos creaciones concurrentes chocan contra el índice
// único, se relee la fila ya creada por la otra en vez de fallar.
export async function findOrCreateEventTaskGroupByKind(eventId: string, familyId: string, kind: string, defaultName: string): Promise<string> {
  const { data: existing, error: selectError } = await supabase.from('event_task_groups').select('id').eq('event_id', eventId).eq('kind', kind).maybeSingle()
  if (selectError) throw selectError
  if (existing) return existing.id as string
  const { data, error } = await supabase
    .from('event_task_groups')
    .insert({ event_id: eventId, family_id: familyId, name: defaultName, kind, sort_order: Date.now() })
    .select('id')
    .single()
  if (error) {
    if (isUniqueViolation(error)) {
      const { data: retry, error: retryError } = await supabase.from('event_task_groups').select('id').eq('event_id', eventId).eq('kind', kind).single()
      if (retryError) throw retryError
      return retry.id as string
    }
    throw error
  }
  return data.id as string
}

// Resolución de un encargo (migración 0215, historial añadido en 0220): nunca toca las tareas del encargo
// (eso lo decide y ejecuta quien llama, completando solo sus tareas PENDIENTES actuales) ni ningún otro
// encargo. Las columnas de event_task_groups siguen reflejando solo la resolución MÁS RECIENTE (igual que
// siempre, para no romper nada que ya las lea), pero AHORA cada resolución queda ADEMÁS como una fila
// nueva en event_task_group_resolutions — nunca se sobrescribe ni se borra una resolución anterior.
// Resolver dos veces el mismo encargo (p. ej. tras añadirle un complemento nuevo después de ya resuelto)
// conserva intacta la primera: proveedor, importe y método anteriores siguen consultables en el histórico.
export async function resolveEventTaskGroup(
  groupId: string,
  input: { method: EventTaskGroupResolutionMethod; note?: string | null; providerId?: string | null; providerName?: string | null; paymentId?: string | null },
): Promise<void> {
  const { data: group, error: groupError } = await supabase.from('event_task_groups').select('family_id').eq('id', groupId).single()
  if (groupError) throw groupError
  const resolvedAt = new Date().toISOString()
  const { error } = await supabase
    .from('event_task_groups')
    .update({
      resolved_at: resolvedAt,
      resolution_method: input.method,
      resolution_note: input.note ?? null,
      provider_id: input.providerId ?? null,
      provider_name: input.providerName ?? null,
      payment_id: input.paymentId ?? null,
    })
    .eq('id', groupId)
  if (error) throw error
  const { error: historyError } = await supabase.from('event_task_group_resolutions').insert({
    group_id: groupId,
    family_id: group.family_id,
    method: input.method,
    note: input.note ?? null,
    provider_id: input.providerId ?? null,
    provider_name: input.providerName ?? null,
    payment_id: input.paymentId ?? null,
    resolved_at: resolvedAt,
  })
  if (historyError) throw historyError
}

const GROUP_RESOLUTION_SELECT = 'id, group_id, method, note, provider_id, provider_name, payment_id, resolved_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGroupResolution(r: any): EventTaskGroupResolution {
  return {
    id: r.id,
    groupId: r.group_id,
    method: r.method,
    note: r.note,
    providerId: r.provider_id,
    providerName: r.provider_name,
    paymentId: r.payment_id,
    resolvedAt: r.resolved_at,
  }
}

// Histórico completo de resoluciones de un encargo, de la más antigua a la más reciente — para poder
// mostrar "antes resuelto: Floristería X · 150 €" aunque el encargo tenga ahora algo nuevo pendiente.
export async function listEventTaskGroupResolutions(groupId: string): Promise<EventTaskGroupResolution[]> {
  const { data, error } = await supabase.from('event_task_group_resolutions').select(GROUP_RESOLUTION_SELECT).eq('group_id', groupId).order('resolved_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapGroupResolution)
}

// ---------------------------------------------------------------------
// Ofertas de un encargo (migración 0223, Parte B Fase 6) — comparar antes de resolver. SOLO información:
// elegir una ("seleccionada") nunca crea un event_payment ni toca event_budget_items, eso sigue pasando
// exclusivamente en resolveEventTaskGroup de arriba.
// ---------------------------------------------------------------------

const OFFER_SELECT =
  'id, group_id, family_id, provider_id, provider_name, amount, scope_included, scope_excluded, offer_date, valid_until, conditions, notes, status, attachment_storage_path, attachment_original_name, attachment_mime_type, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOffer(r: any): EventTaskGroupOffer {
  return {
    id: r.id,
    groupId: r.group_id,
    familyId: r.family_id,
    providerId: r.provider_id,
    providerName: r.provider_name,
    amount: Number(r.amount),
    scopeIncluded: r.scope_included,
    scopeExcluded: r.scope_excluded,
    offerDate: r.offer_date,
    validUntil: r.valid_until,
    conditions: r.conditions,
    notes: r.notes,
    status: r.status,
    attachmentStoragePath: r.attachment_storage_path,
    attachmentOriginalName: r.attachment_original_name,
    attachmentMimeType: r.attachment_mime_type,
    createdAt: r.created_at,
  }
}

// De más reciente a más antigua — al comparar, la última oferta (p. ej. una revisión de precio del mismo
// proveedor) interesa más arriba que la primera.
export async function listEventTaskGroupOffers(groupId: string): Promise<EventTaskGroupOffer[]> {
  const { data, error } = await supabase.from('event_task_group_offers').select(OFFER_SELECT).eq('group_id', groupId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapOffer)
}

export interface EventTaskGroupOfferInput {
  providerId?: string | null
  providerName: string
  amount: number
  scopeIncluded?: string | null
  scopeExcluded?: string | null
  offerDate?: string | null
  validUntil?: string | null
  conditions?: string | null
  notes?: string | null
}

// Devuelve la oferta completa (no solo el id) — quien llama la necesita entera para poder subirle un
// adjunto justo después de crearla (saveEventTaskGroupOfferAttachment pide family_id/group_id).
export async function addEventTaskGroupOffer(groupId: string, input: EventTaskGroupOfferInput): Promise<EventTaskGroupOffer> {
  const { data: group, error: groupError } = await supabase.from('event_task_groups').select('family_id').eq('id', groupId).single()
  if (groupError) throw groupError
  const { data, error } = await supabase
    .from('event_task_group_offers')
    .insert({
      group_id: groupId,
      family_id: group.family_id,
      provider_id: input.providerId ?? null,
      provider_name: input.providerName.trim(),
      amount: input.amount,
      scope_included: input.scopeIncluded ?? null,
      scope_excluded: input.scopeExcluded ?? null,
      offer_date: input.offerDate ?? null,
      valid_until: input.validUntil ?? null,
      conditions: input.conditions ?? null,
      notes: input.notes ?? null,
    })
    .select(OFFER_SELECT)
    .single()
  if (error) throw error
  return mapOffer(data)
}

export async function updateEventTaskGroupOffer(id: string, patch: Partial<EventTaskGroupOfferInput>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.providerId !== undefined) update.provider_id = patch.providerId
  if (patch.providerName !== undefined) update.provider_name = patch.providerName.trim()
  if (patch.amount !== undefined) update.amount = patch.amount
  if (patch.scopeIncluded !== undefined) update.scope_included = patch.scopeIncluded
  if (patch.scopeExcluded !== undefined) update.scope_excluded = patch.scopeExcluded
  if (patch.offerDate !== undefined) update.offer_date = patch.offerDate
  if (patch.validUntil !== undefined) update.valid_until = patch.validUntil
  if (patch.conditions !== undefined) update.conditions = patch.conditions
  if (patch.notes !== undefined) update.notes = patch.notes
  const { error } = await supabase.from('event_task_group_offers').update(update).eq('id', id)
  if (error) throw error
}

// "Descartar"/"Volver a recibida" — cambio de estado simple, sin efectos sobre otras ofertas.
export async function setEventTaskGroupOfferStatus(id: string, status: Extract<EventTaskGroupOfferStatus, 'recibida' | 'descartada'>): Promise<void> {
  const { error } = await supabase.from('event_task_group_offers').update({ status }).eq('id', id)
  if (error) throw error
}

// "Seleccionar" — a lo sumo UNA oferta "seleccionada" por encargo, para que quede claro cuál es la
// elegida al comparar; las demás vuelven a "recibida" (nunca se descartan solas, por si se cambia de
// opinión). Nunca crea un pago ni toca el presupuesto — eso es cosa exclusiva de "Resolver encargo".
export async function selectEventTaskGroupOffer(id: string, groupId: string): Promise<void> {
  const { error: revertError } = await supabase
    .from('event_task_group_offers')
    .update({ status: 'recibida' })
    .eq('group_id', groupId)
    .eq('status', 'seleccionada')
  if (revertError) throw revertError
  const { error } = await supabase.from('event_task_group_offers').update({ status: 'seleccionada' }).eq('id', id)
  if (error) throw error
}

export async function deleteEventTaskGroupOffer(offer: EventTaskGroupOffer): Promise<void> {
  const { error } = await supabase.from('event_task_group_offers').delete().eq('id', offer.id)
  if (error) throw error
  if (offer.attachmentStoragePath) {
    await supabase.storage.from('event_task_group_offers').remove([offer.attachmentStoragePath])
  }
}

// Documento adjunto opcional (presupuesto en PDF/foto de un proveedor) — se sube y se enlaza a una oferta
// YA creada, nunca al crearla (igual que saveEventFoodDocument: nunca se sube un archivo que la familia
// pueda acabar descartando sin llegar a guardar la oferta). Un único adjunto por oferta; subir uno nuevo
// sustituye al anterior y borra el archivo viejo del storage.
export async function saveEventTaskGroupOfferAttachment(offer: EventTaskGroupOffer, file: File): Promise<EventTaskGroupOffer> {
  const prepared = file.type.startsWith('image/') ? await compressImageFile(file) : file
  const ext = prepared.name.split('.').pop() || (prepared.type === 'application/pdf' ? 'pdf' : 'jpg')
  const path = `${offer.familyId}/${offer.groupId}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('event_task_group_offers').upload(path, prepared)
  if (uploadError) throw uploadError
  const { data, error } = await supabase
    .from('event_task_group_offers')
    .update({
      attachment_storage_path: path,
      attachment_original_name: file.name.slice(0, 160),
      attachment_mime_type: prepared.type || file.type || null,
    })
    .eq('id', offer.id)
    .select(OFFER_SELECT)
    .single()
  if (error) {
    // No dejar un archivo huérfano si la fila no se pudo actualizar.
    await supabase.storage.from('event_task_group_offers').remove([path])
    throw error
  }
  if (offer.attachmentStoragePath) {
    await supabase.storage.from('event_task_group_offers').remove([offer.attachmentStoragePath])
  }
  return mapOffer(data)
}

export async function getEventTaskGroupOfferAttachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('event_task_group_offers').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}
