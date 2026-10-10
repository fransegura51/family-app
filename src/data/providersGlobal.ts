// PEPA Eventos — prompt maestro, Parte A: registro GLOBAL de proveedores (por familia, nunca por evento)
// — migración 0224. "Un proveedor descartado para una boda puede volver a ser útil para un cumpleaños o
// una comunión": providers_global nunca se filtra por evento, y event_provider_links es solo el estado
// "interesado/descartado" de un proveedor global DENTRO de un evento concreto, sin afectar a los demás.
//
// Decisión explícita (el usuario, tras preguntárselo): esto NUNCA toca el significado de las FK que ya
// apuntan a event_providers (event_payments/event_task_groups/event_task_group_resolutions/
// event_task_group_offers/event_decision_providers.provider_id) — event_providers solo gana una
// referencia nueva (global_provider_id, ver data/events.ts) a la ficha de aquí.
import { supabase } from '@/data/supabaseClient'
import { addEventProvider, listEventProviders } from '@/data/events'
import { compressImageFile } from '@/domain/imageCompression'
import type { EventProvider, EventProviderLink, EventProviderLinkStatus, ProviderGlobal } from '@/domain/types'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return profileRow.family_id
}

const PROVIDER_GLOBAL_SELECT =
  'id, family_id, name, type, contact_person, phone, email, website, address, notes, archived, created_at, attachment_storage_path, attachment_original_name, attachment_mime_type'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProviderGlobal(r: any): ProviderGlobal {
  return {
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    type: r.type,
    contactPerson: r.contact_person,
    phone: r.phone,
    email: r.email,
    website: r.website,
    address: r.address,
    notes: r.notes,
    archived: r.archived,
    createdAt: r.created_at,
    attachmentStoragePath: r.attachment_storage_path,
    attachmentOriginalName: r.attachment_original_name,
    attachmentMimeType: r.attachment_mime_type,
  }
}

// Toda la agenda de la familia — nunca filtrado por evento (A2: "consultar todos los proveedores de la
// familia"). El filtrado por evento ("de interés / todos / descartados") vive en listEventProviderLinks.
export async function listProvidersGlobal(): Promise<ProviderGlobal[]> {
  const { data, error } = await supabase.from('providers_global').select(PROVIDER_GLOBAL_SELECT).order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapProviderGlobal)
}

export interface ProviderGlobalInput {
  name: string
  type?: string | null
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  address?: string | null
  notes?: string | null
}

export async function addProviderGlobal(input: ProviderGlobalInput): Promise<ProviderGlobal> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase
    .from('providers_global')
    .insert({
      family_id: familyId,
      name: input.name.trim(),
      type: input.type ?? null,
      contact_person: input.contactPerson ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      website: input.website ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
    })
    .select(PROVIDER_GLOBAL_SELECT)
    .single()
  if (error) throw error
  return mapProviderGlobal(data)
}

// Orden de recuperación de requisitos (Parte A6) — "conservar la imagen o documento original" de la
// importación con IA. Mismo patrón, ya en producción, que saveEventTaskGroupOfferAttachment (migración
// 0223): comprime si es imagen, sube a un bucket privado por familia, un único adjunto por proveedor
// (subir uno nuevo sustituye al anterior y borra el archivo viejo del storage).
export async function saveProviderGlobalAttachment(provider: ProviderGlobal, file: File): Promise<ProviderGlobal> {
  const prepared = file.type.startsWith('image/') ? await compressImageFile(file) : file
  const ext = prepared.name.split('.').pop() || (prepared.type === 'application/pdf' ? 'pdf' : 'jpg')
  const path = `${provider.familyId}/${provider.id}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('providers_global').upload(path, prepared)
  if (uploadError) throw uploadError
  const previousPath = provider.attachmentStoragePath
  const { data, error } = await supabase
    .from('providers_global')
    .update({
      attachment_storage_path: path,
      attachment_original_name: file.name.slice(0, 160),
      attachment_mime_type: prepared.type || file.type || null,
    })
    .eq('id', provider.id)
    .select(PROVIDER_GLOBAL_SELECT)
    .single()
  if (error) {
    await supabase.storage.from('providers_global').remove([path])
    throw error
  }
  if (previousPath && previousPath !== path) await supabase.storage.from('providers_global').remove([previousPath])
  return mapProviderGlobal(data)
}

export async function getProviderGlobalAttachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('providers_global').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function updateProviderGlobal(id: string, patch: Partial<ProviderGlobalInput> & { archived?: boolean }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.type !== undefined) update.type = patch.type
  if (patch.contactPerson !== undefined) update.contact_person = patch.contactPerson
  if (patch.phone !== undefined) update.phone = patch.phone
  if (patch.email !== undefined) update.email = patch.email
  if (patch.website !== undefined) update.website = patch.website
  if (patch.address !== undefined) update.address = patch.address
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.archived !== undefined) update.archived = patch.archived
  const { error } = await supabase.from('providers_global').update(update).eq('id', id)
  if (error) throw error
}

// Cuántos eventos distintos tienen este proveedor vinculado — "habitual" (A2) se calcula a partir de
// esto (≥2 eventos) en vez de guardar una marca aparte que se podría desincronizar.
export async function countProviderGlobalEventLinks(globalProviderId: string): Promise<number> {
  const { count, error } = await supabase.from('event_provider_links').select('id', { count: 'exact', head: true }).eq('global_provider_id', globalProviderId)
  if (error) throw error
  return count ?? 0
}

const LINK_SELECT = 'id, event_id, family_id, global_provider_id, status, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLink(r: any): EventProviderLink {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    globalProviderId: r.global_provider_id,
    status: r.status,
    createdAt: r.created_at,
  }
}

// Vínculos de ESTE evento con el registro global — "de interés" (por defecto) o "descartado", nunca
// oculta el proveedor del registro global (A3).
export async function listEventProviderLinks(eventId: string): Promise<EventProviderLink[]> {
  const { data, error } = await supabase.from('event_provider_links').select(LINK_SELECT).eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapLink)
}

// Vincular un proveedor YA existente del registro global a este evento — idempotente (si ya estaba
// vinculado, no duplica la fila, por el unique(event_id, global_provider_id) de la migración 0224).
export async function linkProviderToEvent(eventId: string, globalProviderId: string): Promise<EventProviderLink> {
  const familyId = await currentFamilyId()
  const { data: existing, error: selectError } = await supabase
    .from('event_provider_links')
    .select(LINK_SELECT)
    .eq('event_id', eventId)
    .eq('global_provider_id', globalProviderId)
    .maybeSingle()
  if (selectError) throw selectError
  if (existing) return mapLink(existing)
  const { data, error } = await supabase
    .from('event_provider_links')
    .insert({ event_id: eventId, family_id: familyId, global_provider_id: globalProviderId })
    .select(LINK_SELECT)
    .single()
  if (error) throw error
  return mapLink(data)
}

// Vincular desde el registro global (A3) es UNA acción para la familia, pero por debajo conserva las dos
// piezas que ya existían: el vínculo de interés/descartado (arriba) Y una ficha event_providers
// utilizable en Pagos/Resolver encargo/Decisiones — esas 5 FK siguen señalando a event_providers, nunca
// al registro global directamente (ver cabecera del fichero). Si ya existía una ficha event_providers
// para este proveedor global en este evento, la reutiliza; si no, crea una NUEVA copiando los datos
// actuales del registro global — snapshot, igual que ya hace providerName en pagos/encargos: si el
// registro global cambia después, el histórico ya guardado en este evento no se mueve solo.
export async function linkProviderGlobalToEvent(eventId: string, globalProvider: ProviderGlobal): Promise<{ link: EventProviderLink; eventProvider: EventProvider }> {
  const link = await linkProviderToEvent(eventId, globalProvider.id)
  const existingEventProviders = await listEventProviders(eventId)
  const existing = existingEventProviders.find((p) => p.globalProviderId === globalProvider.id)
  if (existing) return { link, eventProvider: existing }
  const newId = await addEventProvider(eventId, {
    name: globalProvider.name,
    type: globalProvider.type,
    contactPerson: globalProvider.contactPerson,
    phone: globalProvider.phone,
    email: globalProvider.email,
    website: globalProvider.website,
    address: globalProvider.address,
    globalProviderId: globalProvider.id,
  })
  const refreshed = await listEventProviders(eventId)
  const created = refreshed.find((p) => p.id === newId)
  if (!created) throw new Error('No se pudo enlazar el proveedor')
  return { link, eventProvider: created }
}

// "Descartar"/"Recuperar" (A3) — nunca borra el vínculo, solo cambia su estado dentro de ESTE evento.
export async function setEventProviderLinkStatus(linkId: string, status: EventProviderLinkStatus): Promise<void> {
  const { error } = await supabase.from('event_provider_links').update({ status }).eq('id', linkId)
  if (error) throw error
}

// "Desvincular sin eliminar globalmente" (A3) — borra SOLO el vínculo con este evento; providers_global
// (y su historial en otros eventos) no se toca.
export async function unlinkProviderFromEvent(linkId: string): Promise<void> {
  const { error } = await supabase.from('event_provider_links').delete().eq('id', linkId)
  if (error) throw error
}

function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Parte A5 (prompt maestro) — "al escribir un nombre... sugerir proveedores ya registrados" y "detectar
// posibles duplicados, pero nunca fusionarlos automáticamente sin confirmación". Una coincidencia EXACTA
// (tras normalizar mayúsculas/acentos) se trata como el mismo proveedor sin preguntar; una coincidencia
// PARCIAL (uno contiene al otro) se ofrece para confirmar, nunca se fusiona sola.
export function findProviderGlobalMatch(providers: ProviderGlobal[], name: string): { exact: ProviderGlobal | null; similar: ProviderGlobal | null } {
  const normalized = normalizeProviderName(name)
  if (!normalized) return { exact: null, similar: null }
  let similar: ProviderGlobal | null = null
  for (const p of providers) {
    const pNorm = normalizeProviderName(p.name)
    if (pNorm === normalized) return { exact: p, similar: null }
    if (!similar && pNorm.length >= 4 && normalized.length >= 4 && (pNorm.includes(normalized) || normalized.includes(pNorm))) similar = p
  }
  return { exact: null, similar }
}
