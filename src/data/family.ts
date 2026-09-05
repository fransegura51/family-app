import { supabase } from '@/data/supabaseClient'
import { compressImageFile } from '@/domain/imageCompression'
import type { FamilyMember, MemberType } from '@/domain/types'

// Crea la familia + el perfil admin del usuario actual, de forma atómica,
// vía la función `create_family` (SECURITY DEFINER, ver
// supabase/migrations/0002_create_family_bootstrap.sql). No hay INSERT
// directo posible en families/profiles desde el cliente — evita que un
// usuario se una a la familia de otro manipulando family_id (Skill 27).
export async function createFamily(familyName: string, displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_family', {
    p_family_name: familyName,
    p_display_name: displayName,
  })
  if (error) throw error
  return data as string
}

// Código de invitación de un solo uso (24h) para que un miembro ya
// existente en la familia (p. ej. Paco, hasta ahora sin cuenta propia)
// se cree su propio usuario y quede enlazado a su perfil, en vez de
// crear una familia nueva desde cero. Solo el admin puede generarlo.
export async function generateMemberInviteCode(memberId: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_member_invite_code', { p_member_id: memberId })
  if (error) throw error
  return data as string
}

// Se llama justo después de auth.signUp(), con sesión ya activa pero
// sin `profiles` row todavía — enlaza esa cuenta nueva al miembro cuyo
// código coincide, en vez de pasar por create_family().
export async function joinFamilyWithCode(code: string, displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_family_with_code', {
    p_code: code,
    p_display_name: displayName,
  })
  if (error) throw error
  return data as string
}

export async function addFamilyMember(input: {
  name: string
  memberType: MemberType
  color: string
  birthDate: string | null
}): Promise<void> {
  // family_id no se pasa desde el cliente: la política RLS de INSERT ya
  // exige family_id = current_family_id(), así que lo fijamos igual aquí
  // para que el insert cumpla el check, pero el aislamiento real lo da RLS.
  const { data: profile } = await supabase.auth.getUser()
  if (!profile.user) throw new Error('No autenticado')

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', profile.user.id)
    .single()
  if (profileError) throw profileError

  const { error } = await supabase.from('family_members').insert({
    family_id: profileRow.family_id,
    name: input.name,
    member_type: input.memberType,
    color: input.color,
    birth_date: input.birthDate,
  })
  if (error) throw error
}

export async function updateFamilyMember(
  id: string,
  input: { name: string; memberType: MemberType; color: string; birthDate: string | null },
): Promise<void> {
  const { error } = await supabase
    .from('family_members')
    .update({
      name: input.name,
      member_type: input.memberType,
      color: input.color,
      birth_date: input.birthDate,
    })
    .eq('id', id)
  if (error) throw error
}

// Edición rápida solo de la fecha, para el botón "Editar" de la
// pestaña Cumpleaños — sin pasar por el formulario completo de Familia.
export async function updateFamilyMemberBirthDate(id: string, birthDate: string | null): Promise<void> {
  const { error } = await supabase.from('family_members').update({ birth_date: birthDate }).eq('id', id)
  if (error) throw error
}

export async function setFamilyMemberBirthdayFavorite(id: string, favorite: boolean): Promise<void> {
  const { error } = await supabase.from('family_members').update({ birthday_favorite: favorite }).eq('id', id)
  if (error) throw error
}

export async function deleteFamilyMember(id: string): Promise<void> {
  const { error } = await supabase.from('family_members').delete().eq('id', id)
  if (error) throw error
}

// Arrastrar con el dedo para cambiar el orden de la familia (petición
// real: "los miembros de la familia los cojo y los puedo arrastrar y
// poner primero Jennifer, luego Paco...") — mismo patrón que
// reorderShoppingItems.
export async function reorderFamilyMembers(orderedIds: string[]): Promise<void> {
  const base = Date.now()
  const { error } = await supabase
    .from('family_members')
    .upsert(orderedIds.map((id, index) => ({ id, sort_order: base + index })))
  if (error) throw new Error(error.message)
}

// Foto de perfil por miembro — para identificarlos visualmente en toda
// la app (chips, mapa de ubicación...) en vez de solo el emoji. Storage
// privado propio (bucket member-photos), igual patrón que Galería.
async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (error) throw error
  return profileRow.family_id
}

export async function uploadMemberPhoto(memberId: string, file: File): Promise<void> {
  const familyId = await currentFamilyId()
  const compressed = await compressImageFile(file)
  const ext = compressed.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('member-photos').upload(path, compressed)
  if (uploadError) throw uploadError

  const { error } = await supabase.from('family_members').update({ photo_path: path }).eq('id', memberId)
  if (error) throw error
}

export async function getMemberPhotoUrl(photoPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('member-photos').createSignedUrl(photoPath, 3600)
  if (error) throw error
  return data.signedUrl
}

// Token secreto de la familia para el webhook de pedidos de Amazon
// (Outlook reenvía el email a Pipedream, que llama a nuestra función
// con este token en vez de un login) — solo el admin puede verlo o
// regenerarlo, vía la política ya existente "families: admin update".
export async function getAmazonWebhookToken(): Promise<string> {
  const familyId = await currentFamilyId()
  const { data, error } = await supabase.from('families').select('amazon_webhook_token').eq('id', familyId).single()
  if (error) throw error
  return data.amazon_webhook_token
}

export async function regenerateAmazonWebhookToken(): Promise<string> {
  const familyId = await currentFamilyId()
  const token = crypto.randomUUID()
  const { error } = await supabase.from('families').update({ amazon_webhook_token: token }).eq('id', familyId)
  if (error) throw error
  return token
}

// Toda consulta pasa por aquí en vez de tocar `supabase` desde ui/.
// RLS ya garantiza el aislamiento por family_id en el backend — este
// módulo no necesita (ni debe) volver a filtrar por familia en el cliente.
export async function listFamilyMembers(): Promise<FamilyMember[]> {
  const { data, error } = await supabase
    .from('family_members')
    .select(
      'id, family_id, name, avatar, color, member_type, birth_date, birthday_favorite, permissions, linked_profile_id, photo_path',
    )
    .order('sort_order', { ascending: true })

  if (error) throw error

  return data.map((row) => ({
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    memberType: row.member_type,
    birthDate: row.birth_date,
    birthdayFavorite: row.birthday_favorite,
    permissions: row.permissions ?? {},
    linkedProfileId: row.linked_profile_id,
    photoPath: row.photo_path,
  }))
}
