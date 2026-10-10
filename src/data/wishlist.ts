// "Lista de deseos" (Pequeños Grandes, Fases 12-16 del prompt maestro consolidado, autorización directa
// del usuario 2026-10-10, migración 0239) — capa de datos del lado FAMILIA (con cuenta). El secreto real
// de una reserva vive en RLS: ni el destinatario de la lista ni ningún 'child' pueden leerla, aunque este
// archivo la consulte sin más (el servidor ya le devuelve 0 filas a quien no deba verlas). El lado
// invitado (sin cuenta) vive aparte, en supabase/functions/wishlist-guest.
import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import type { Wishlist, WishlistItem, WishlistItemReservation } from '@/domain/types'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return profileRow.family_id
}

// ---------------------------------------------------------------------
// Listas — por persona, año y celebración (fecha opcional).
// ---------------------------------------------------------------------

const WISHLIST_SELECT = 'id, family_id, owner_member_id, year, occasion, celebration_date, guest_token, created_by, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWishlist(r: any): Wishlist {
  return {
    id: r.id,
    familyId: r.family_id,
    ownerMemberId: r.owner_member_id,
    year: r.year,
    occasion: r.occasion,
    celebrationDate: r.celebration_date,
    guestToken: r.guest_token,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export async function listWishlists(): Promise<Wishlist[]> {
  const { data, error } = await supabase.from('wishlists').select(WISHLIST_SELECT).order('year', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapWishlist)
}

export async function addWishlist(input: { ownerMemberId: string; year: number; occasion: string; celebrationDate?: string | null }): Promise<string> {
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('wishlists')
    .insert({
      family_id: familyId,
      owner_member_id: input.ownerMemberId,
      year: input.year,
      occasion: input.occasion.trim(),
      celebration_date: input.celebrationDate ?? null,
      created_by: userResult.user?.id ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function updateWishlist(id: string, patch: { occasion?: string; celebrationDate?: string | null }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.occasion !== undefined) update.occasion = patch.occasion.trim()
  if (patch.celebrationDate !== undefined) update.celebration_date = patch.celebrationDate
  const { error } = await supabase.from('wishlists').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteWishlist(id: string): Promise<void> {
  const { error } = await supabase.from('wishlists').delete().eq('id', id)
  if (error) throw error
}

// Enlace público para invitados sin cuenta PEPA — mismo patrón ya en producción que
// getEventOpenRsvpUrl/regenerateEventOpenRsvpUrl (data/events.ts).
function appBaseUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL
}
function guestUrlFromToken(token: string): string {
  return `${appBaseUrl()}?deseos=${token}`
}

export async function getWishlistGuestUrl(wishlistId: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_wishlist_guest_token', { p_wishlist_id: wishlistId })
  if (error) throw error
  return guestUrlFromToken(data as string)
}

export async function regenerateWishlistGuestUrl(wishlistId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_wishlist_guest_token', { p_wishlist_id: wishlistId })
  if (error) throw error
  return guestUrlFromToken(data as string)
}

// ---------------------------------------------------------------------
// Regalos de una lista — descripción, fotografía, enlace y precio, todos opcionales salvo el nombre.
// ---------------------------------------------------------------------

const WISHLIST_ITEM_SELECT = 'id, wishlist_id, family_id, name, description, link, price, allow_joint, photo_storage_path, photo_original_name, photo_mime_type, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWishlistItem(r: any): WishlistItem {
  return {
    id: r.id,
    wishlistId: r.wishlist_id,
    familyId: r.family_id,
    name: r.name,
    description: r.description,
    link: r.link,
    price: r.price == null ? null : Number(r.price),
    allowJoint: r.allow_joint,
    photoStoragePath: r.photo_storage_path,
    photoOriginalName: r.photo_original_name,
    photoMimeType: r.photo_mime_type,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listWishlistItems(wishlistId: string): Promise<WishlistItem[]> {
  const { data, error } = await supabase.from('wishlist_items').select(WISHLIST_ITEM_SELECT).eq('wishlist_id', wishlistId).order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapWishlistItem)
}

export async function addWishlistItem(
  wishlistId: string,
  input: { name: string; description?: string | null; link?: string | null; price?: number | null; allowJoint?: boolean },
): Promise<string> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase
    .from('wishlist_items')
    .insert({
      wishlist_id: wishlistId,
      family_id: familyId,
      name: input.name.trim(),
      description: input.description ?? null,
      link: input.link ?? null,
      price: input.price ?? null,
      allow_joint: input.allowJoint ?? false,
      sort_order: Date.now(),
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function updateWishlistItem(
  id: string,
  patch: { name?: string; description?: string | null; link?: string | null; price?: number | null; allowJoint?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined) update.name = patch.name.trim()
  if (patch.description !== undefined) update.description = patch.description
  if (patch.link !== undefined) update.link = patch.link
  if (patch.price !== undefined) update.price = patch.price
  if (patch.allowJoint !== undefined) update.allow_joint = patch.allowJoint
  const { error } = await supabase.from('wishlist_items').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteWishlistItem(id: string): Promise<void> {
  const { error } = await supabase.from('wishlist_items').delete().eq('id', id)
  if (error) throw error
}

// Fotografía del regalo — mismo patrón ya en producción que saveProviderGlobalAttachment: comprime si es
// imagen, sube a un bucket privado por familia, una sola foto por regalo (sustituye y borra la anterior).
export async function saveWishlistItemPhoto(item: WishlistItem, file: File): Promise<void> {
  const prepared = file.type.startsWith('image/') ? await compressImageFile(file) : file
  const ext = prepared.name.split('.').pop() || 'jpg'
  const path = `${item.familyId}/${item.id}/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('wishlist_items').upload(path, prepared)
  if (uploadError) throw uploadError
  const previousPath = item.photoStoragePath
  const { error } = await supabase
    .from('wishlist_items')
    .update({ photo_storage_path: path, photo_original_name: file.name.slice(0, 160), photo_mime_type: prepared.type || file.type || null })
    .eq('id', item.id)
  if (error) {
    await supabase.storage.from('wishlist_items').remove([path])
    throw error
  }
  if (previousPath && previousPath !== path) await supabase.storage.from('wishlist_items').remove([previousPath])
}

export async function getWishlistItemPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('wishlist_items').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------
// Reservas — SECRETAS por RLS (migración 0239): un destinatario o un 'child' que consulten esto mismo
// reciben siempre 0 filas para los regalos de la lista que no deben ver, nunca un error ni un hueco
// visible en la interfaz. "Deshacer la propia reserva" marca undoneAt, nunca borra la fila.
// ---------------------------------------------------------------------

const RESERVATION_SELECT = 'id, item_id, family_id, reserved_by_member_id, reserved_by_guest_name, allow_joint, created_at, undone_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReservation(r: any): WishlistItemReservation {
  return {
    id: r.id,
    itemId: r.item_id,
    familyId: r.family_id,
    reservedByMemberId: r.reserved_by_member_id,
    reservedByGuestName: r.reserved_by_guest_name,
    allowJoint: r.allow_joint,
    createdAt: r.created_at,
    undoneAt: r.undone_at,
  }
}

// Una consulta por TODOS los regalos de una lista a la vez (en vez de uno por uno) — igual de correcto
// bajo RLS (cada fila sigue filtrada por la misma política) y evita N peticiones por lista.
export async function listWishlistReservationsForItems(itemIds: string[]): Promise<WishlistItemReservation[]> {
  if (itemIds.length === 0) return []
  const { data, error } = await supabase.from('wishlist_item_reservations').select(RESERVATION_SELECT).in('item_id', itemIds).is('undone_at', null)
  if (error) throw error
  return (data ?? []).map(mapReservation)
}

export async function reserveWishlistItem(itemId: string, allowJoint: boolean): Promise<void> {
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: memberRow, error: memberError } = await supabase.from('family_members').select('id').eq('linked_profile_id', userResult.user.id).maybeSingle()
  if (memberError) throw memberError
  if (!memberRow) throw new Error('No se ha podido identificar tu perfil')
  const { error } = await supabase
    .from('wishlist_item_reservations')
    .insert({ item_id: itemId, family_id: familyId, reserved_by_member_id: memberRow.id, allow_joint: allowJoint })
  if (error) throw error
}

export async function undoWishlistReservation(reservationId: string): Promise<void> {
  const { error } = await supabase.from('wishlist_item_reservations').update({ undone_at: new Date().toISOString() }).eq('id', reservationId)
  if (error) throw error
}
