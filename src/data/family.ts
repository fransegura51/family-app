import { supabase } from '@/data/supabaseClient'
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

export async function deleteFamilyMember(id: string): Promise<void> {
  const { error } = await supabase.from('family_members').delete().eq('id', id)
  if (error) throw error
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
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${familyId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('member-photos').upload(path, file)
  if (uploadError) throw uploadError

  const { error } = await supabase.from('family_members').update({ photo_path: path }).eq('id', memberId)
  if (error) throw error
}

export async function getMemberPhotoUrl(photoPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('member-photos').createSignedUrl(photoPath, 3600)
  if (error) throw error
  return data.signedUrl
}

// Toda consulta pasa por aquí en vez de tocar `supabase` desde ui/.
// RLS ya garantiza el aislamiento por family_id en el backend — este
// módulo no necesita (ni debe) volver a filtrar por familia en el cliente.
export async function listFamilyMembers(): Promise<FamilyMember[]> {
  const { data, error } = await supabase
    .from('family_members')
    .select('id, family_id, name, avatar, color, member_type, birth_date, permissions, linked_profile_id, photo_path')
    .order('created_at', { ascending: true })

  if (error) throw error

  return data.map((row) => ({
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    memberType: row.member_type,
    birthDate: row.birth_date,
    permissions: row.permissions ?? {},
    linkedProfileId: row.linked_profile_id,
    photoPath: row.photo_path,
  }))
}
