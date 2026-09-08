// Buzón de sugerencias — cada familia ve y crea las suyas; la familia
// dueña de la app (ver migración 0078) ve las de todas para poder
// revisarlas y aplicarlas.
import { supabase } from '@/data/supabaseClient'
import type { Suggestion } from '@/domain/types'

function mapRow(r: {
  id: string
  family_id: string
  profile_id: string | null
  message: string
  status: string
  admin_note: string | null
  created_at: string
}): Suggestion {
  return {
    id: r.id,
    familyId: r.family_id,
    profileId: r.profile_id,
    message: r.message,
    status: r.status as Suggestion['status'],
    adminNote: r.admin_note,
    createdAt: r.created_at,
  }
}

// Devuelve las de la propia familia, o TODAS si quien pregunta es la
// familia dueña de la app (lo decide la RLS de la tabla, no el cliente).
export async function listSuggestions(): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from('suggestions')
    .select('id, family_id, profile_id, message, status, admin_note, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapRow)
}

export async function createSuggestion(message: string): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError
  const { error } = await supabase.from('suggestions').insert({
    family_id: profileRow.family_id,
    profile_id: userResult.user.id,
    message: message.trim(),
  })
  if (error) throw error
}

export async function withdrawSuggestion(id: string): Promise<void> {
  const { error } = await supabase.from('suggestions').delete().eq('id', id)
  if (error) throw error
}

// Solo funciona para la familia dueña (RLS) — marcar como aplicada o
// descartada, con una nota opcional para quien la dejó.
export async function updateSuggestionStatus(
  id: string,
  status: 'aplicada' | 'descartada',
  adminNote?: string,
): Promise<void> {
  const update: Record<string, unknown> = { status }
  if (adminNote !== undefined) update.admin_note = adminNote || null
  const { error } = await supabase.from('suggestions').update(update).eq('id', id)
  if (error) throw error
}

// Nombre de la familia que dejó una sugerencia — solo devuelve algo si
// quien pregunta es la familia dueña (ver 0079_suggestions_family_name.sql).
export async function getFamilyNameForSuggestion(familyId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_family_name_for_suggestion', { p_family_id: familyId })
  if (error) throw error
  return data
}
