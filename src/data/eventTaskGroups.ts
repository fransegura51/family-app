// Preparativos — "🗂️ Encargos" (migración 0212, extendida en 0215): agrupación organizativa de tareas
// relacionadas (p. ej. "Flores": ramo, prendidos, decoración, recoger). UN grupo principal por tarea.
// Desde 0215, un encargo puede RESOLVERSE (proveedor real + precio total opcional, reutilizando
// event_providers/event_payments tal cual — nunca event_budget_items, ver cabecera de esa migración).
// Desde 0223 (Parte B Fase 6), un encargo puede recibir varias OFERTAS para comparar antes de resolverlo
// — ver EventTaskGroupOffer en domain/types.ts: solo información, nunca un compromiso económico. Desde
// 0225 (Fase 5) una oferta puede existir SIN encargo (grupo); ver las funciones "sueltas" más abajo.
import { compressImageFile } from '@/domain/imageCompression'
import { supabase } from '@/data/supabaseClient'
import type { EventTaskGroup, EventTaskGroupOffer, EventTaskGroupOfferItem, EventTaskGroupOfferStatus, EventTaskGroupResolution, EventTaskGroupResolutionMethod } from '@/domain/types'

// events.ts importa de aquí (findOrCreateEventTaskGroupByKind) y providersGlobal.ts importa de events.ts
// — para no crear un ciclo, esta función se repite tal cual (igual que ya hace providersGlobal.ts en vez
// de importarla de events.ts).
async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return profileRow.family_id
}

const GROUP_SELECT = 'id, event_id, name, sort_order, kind, resolved_at, resolution_method, resolution_note, provider_id, provider_name, payment_id, offer_id'

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
    offerId: r.offer_id,
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
// ni ningún otro encargo — desde la Fase 7 (Parte C3, decisión explícita del usuario) "contratar" (esta
// función) y "completar tareas" son acciones totalmente separadas: resolver un encargo YA NO completa
// ninguna tarea por su cuenta, cada tarea se marca hecha individualmente como cualquier otra. Las columnas
// de event_task_groups siguen reflejando solo la resolución MÁS RECIENTE (igual que siempre, para no
// romper nada que ya las lea), pero AHORA cada resolución queda ADEMÁS como una fila nueva en
// event_task_group_resolutions — nunca se sobrescribe ni se borra una resolución anterior. Resolver dos
// veces el mismo encargo (p. ej. tras añadirle un complemento nuevo después de ya resuelto) conserva
// intacta la primera: proveedor, importe y método anteriores siguen consultables en el histórico.
export async function resolveEventTaskGroup(
  groupId: string,
  input: {
    method: EventTaskGroupResolutionMethod
    note?: string | null
    providerId?: string | null
    providerName?: string | null
    paymentId?: string | null
    // Fase 7 (Parte C2) — de qué oferta viene esta resolución, si viene de alguna (trazabilidad).
    offerId?: string | null
  },
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
      offer_id: input.offerId ?? null,
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
    offer_id: input.offerId ?? null,
    resolved_at: resolvedAt,
  })
  if (historyError) throw historyError
}

const GROUP_RESOLUTION_SELECT = 'id, group_id, method, note, provider_id, provider_name, payment_id, offer_id, resolved_at'

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
    offerId: r.offer_id,
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
  'id, group_id, event_id, family_id, provider_id, global_provider_id, provider_name, amount, scope_included, scope_excluded, offer_date, valid_until, conditions, notes, status, attachment_storage_path, attachment_original_name, attachment_mime_type, supersedes_offer_id, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOffer(r: any): EventTaskGroupOffer {
  return {
    id: r.id,
    groupId: r.group_id,
    eventId: r.event_id,
    familyId: r.family_id,
    providerId: r.provider_id,
    globalProviderId: r.global_provider_id,
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
    supersedesOfferId: r.supersedes_offer_id,
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
  // Fase 6 (Parte B4) — marcar esta oferta nueva como revisión de una anterior, sin fusionarlas.
  supersedesOfferId?: string | null
}

// Devuelve la oferta completa (no solo el id) — quien llama la necesita entera para poder subirle un
// adjunto justo después de crearla (saveEventTaskGroupOfferAttachment pide family_id/group_id).
export async function addEventTaskGroupOffer(groupId: string, input: EventTaskGroupOfferInput): Promise<EventTaskGroupOffer> {
  const { data: group, error: groupError } = await supabase.from('event_task_groups').select('family_id, event_id').eq('id', groupId).single()
  if (groupError) throw groupError
  const { data, error } = await supabase
    .from('event_task_group_offers')
    .insert({
      group_id: groupId,
      event_id: group.event_id,
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
      supersedes_offer_id: input.supersedesOfferId ?? null,
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
  if (patch.supersedesOfferId !== undefined) update.supersedes_offer_id = patch.supersedesOfferId
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

// ---------------------------------------------------------------------
// Ofertas SUELTAS (migración 0225, Parte B1) — sin encargo todavía. Se registran desde el registro
// global de proveedores (sin evento) o desde Proveedores de un evento (con evento, sin encargo). Nunca
// crean ni completan nada por sí solas; linkLooseTaskGroupOfferToGroup es la única forma de que pasen a
// estar ligadas a un encargo, y sigue siendo una acción explícita de la familia, nunca automática.
// ---------------------------------------------------------------------

// Ofertas de un proveedor concreto sin encargo: pasando eventId, las de ESE evento; sin eventId, las
// puramente globales (registradas desde el registro, sin ningún evento de por medio).
export async function listLooseOffersForProvider(globalProviderId: string, eventId?: string | null): Promise<EventTaskGroupOffer[]> {
  let query = supabase.from('event_task_group_offers').select(OFFER_SELECT).eq('global_provider_id', globalProviderId).is('group_id', null)
  query = eventId ? query.eq('event_id', eventId) : query.is('event_id', null)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapOffer)
}

// Todas las ofertas sueltas de un evento (cualquier proveedor) — para "Encargos": poder vincular una
// oferta ya registrada a un encargo concreto sin tener que volver a escribirla.
export async function listLooseOffersForEvent(eventId: string): Promise<EventTaskGroupOffer[]> {
  const { data, error } = await supabase.from('event_task_group_offers').select(OFFER_SELECT).eq('event_id', eventId).is('group_id', null).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapOffer)
}

export interface LooseEventTaskGroupOfferInput extends EventTaskGroupOfferInput {
  globalProviderId: string
  eventId?: string | null
}

// Family_id: si hay evento, el del evento (consistente con addEventTaskGroupOffer); si es puramente
// global, la familia actual (igual que providersGlobal.ts).
export async function addLooseTaskGroupOffer(input: LooseEventTaskGroupOfferInput): Promise<EventTaskGroupOffer> {
  let resolvedFamilyId: string
  if (input.eventId) {
    const { data: event, error: eventError } = await supabase.from('events').select('family_id').eq('id', input.eventId).single()
    if (eventError) throw eventError
    resolvedFamilyId = event.family_id
  } else {
    resolvedFamilyId = await currentFamilyId()
  }
  const { data, error } = await supabase
    .from('event_task_group_offers')
    .insert({
      group_id: null,
      event_id: input.eventId ?? null,
      family_id: resolvedFamilyId,
      provider_id: input.providerId ?? null,
      global_provider_id: input.globalProviderId,
      provider_name: input.providerName.trim(),
      amount: input.amount,
      scope_included: input.scopeIncluded ?? null,
      scope_excluded: input.scopeExcluded ?? null,
      offer_date: input.offerDate ?? null,
      valid_until: input.validUntil ?? null,
      conditions: input.conditions ?? null,
      notes: input.notes ?? null,
      supersedes_offer_id: input.supersedesOfferId ?? null,
    })
    .select(OFFER_SELECT)
    .single()
  if (error) throw error
  return mapOffer(data)
}

// Vincular una oferta suelta a un encargo concreto — la única forma de que una oferta pase de "suelta" a
// pertenecer a un encargo; acción explícita de la familia, nunca automática ni al crear/seleccionar la
// oferta. Si la oferta todavía no tenía evento (una suelta puramente global), toma el del encargo.
export async function linkLooseTaskGroupOfferToGroup(offer: EventTaskGroupOffer, groupId: string): Promise<void> {
  const { data: group, error: groupError } = await supabase.from('event_task_groups').select('event_id').eq('id', groupId).single()
  if (groupError) throw groupError
  const { error } = await supabase
    .from('event_task_group_offers')
    .update({ group_id: groupId, event_id: offer.eventId ?? group.event_id })
    .eq('id', offer.id)
  if (error) throw error
}

// Documento adjunto opcional (presupuesto en PDF/foto de un proveedor) — se sube y se enlaza a una oferta
// YA creada, nunca al crearla (igual que saveEventFoodDocument: nunca se sube un archivo que la familia
// pueda acabar descartando sin llegar a guardar la oferta). Un único adjunto por oferta; subir uno nuevo
// sustituye al anterior y borra el archivo viejo del storage.
export async function saveEventTaskGroupOfferAttachment(offer: EventTaskGroupOffer, file: File): Promise<EventTaskGroupOffer> {
  const prepared = file.type.startsWith('image/') ? await compressImageFile(file) : file
  const ext = prepared.name.split('.').pop() || (prepared.type === 'application/pdf' ? 'pdf' : 'jpg')
  // La política de storage solo exige que el primer segmento sea la familia (ver migración 0223); el
  // resto es libre — una oferta suelta (sin encargo) usa su evento, o "global" si tampoco tiene evento.
  const path = `${offer.familyId}/${offer.groupId ?? offer.eventId ?? 'global'}/${crypto.randomUUID()}.${ext}`
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

// ---------------------------------------------------------------------
// Servicios estructurados de una oferta (migración 0227, Parte B2) — desglose OPCIONAL de amount, nunca
// lo sustituye. subtotal es siempre el dato autoritativo de la línea (nunca se recalcula en el servidor).
// ---------------------------------------------------------------------

const OFFER_ITEM_SELECT = 'id, offer_id, family_id, name, description, quantity, unit, unit_price, subtotal, is_package, selected, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOfferItem(r: any): EventTaskGroupOfferItem {
  return {
    id: r.id,
    offerId: r.offer_id,
    familyId: r.family_id,
    name: r.name,
    description: r.description,
    quantity: r.quantity === null ? null : Number(r.quantity),
    unit: r.unit,
    unitPrice: r.unit_price === null ? null : Number(r.unit_price),
    subtotal: r.subtotal === null ? null : Number(r.subtotal),
    isPackage: r.is_package,
    selected: r.selected,
    sortOrder: Number(r.sort_order),
    createdAt: r.created_at,
  }
}

export async function listEventTaskGroupOfferItems(offerId: string): Promise<EventTaskGroupOfferItem[]> {
  const { data, error } = await supabase.from('event_task_group_offer_items').select(OFFER_ITEM_SELECT).eq('offer_id', offerId).order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapOfferItem)
}

export interface EventTaskGroupOfferItemInput {
  name: string
  description?: string | null
  quantity?: number | null
  unit?: string | null
  unitPrice?: number | null
  subtotal?: number | null
  isPackage?: boolean
  selected?: boolean
}

// family_id se lee de la propia oferta (nunca inventado) — mismo criterio que addEventTaskGroupOffer.
export async function addEventTaskGroupOfferItem(offer: EventTaskGroupOffer, input: EventTaskGroupOfferItemInput): Promise<EventTaskGroupOfferItem> {
  const { data, error } = await supabase
    .from('event_task_group_offer_items')
    .insert({
      offer_id: offer.id,
      family_id: offer.familyId,
      name: input.name.trim(),
      description: input.description ?? null,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      unit_price: input.unitPrice ?? null,
      subtotal: input.subtotal ?? null,
      is_package: input.isPackage ?? false,
      selected: input.selected ?? true,
      sort_order: Date.now(),
    })
    .select(OFFER_ITEM_SELECT)
    .single()
  if (error) throw error
  return mapOfferItem(data)
}

export async function updateEventTaskGroupOfferItem(id: string, patch: Partial<EventTaskGroupOfferItemInput>): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.description !== undefined) update.description = patch.description
  if (patch.quantity !== undefined) update.quantity = patch.quantity
  if (patch.unit !== undefined) update.unit = patch.unit
  if (patch.unitPrice !== undefined) update.unit_price = patch.unitPrice
  if (patch.subtotal !== undefined) update.subtotal = patch.subtotal
  if (patch.isPackage !== undefined) update.is_package = patch.isPackage
  if (patch.selected !== undefined) update.selected = patch.selected
  const { error } = await supabase.from('event_task_group_offer_items').update(update).eq('id', id)
  if (error) throw error
}

// "Seleccionar"/"Quitar de seleccionadas" — solo información para comparar, nunca toca la oferta ni crea
// nada; varias líneas pueden estar seleccionadas a la vez (a diferencia de status de la oferta).
export async function setEventTaskGroupOfferItemSelected(id: string, selected: boolean): Promise<void> {
  const { error } = await supabase.from('event_task_group_offer_items').update({ selected }).eq('id', id)
  if (error) throw error
}

export async function deleteEventTaskGroupOfferItem(id: string): Promise<void> {
  const { error } = await supabase.from('event_task_group_offer_items').delete().eq('id', id)
  if (error) throw error
}
