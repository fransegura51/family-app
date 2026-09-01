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

// Toda consulta pasa por aquí en vez de tocar `supabase` desde ui/.
// RLS ya garantiza el aislamiento por family_id en el backend — este
// módulo no necesita (ni debe) volver a filtrar por familia en el cliente.
export async function listFamilyMembers(): Promise<FamilyMember[]> {
  const { data, error } = await supabase
    .from('family_members')
    .select('id, family_id, name, avatar, color, member_type, birth_date, permissions, linked_profile_id')
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
  }))
}
