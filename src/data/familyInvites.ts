import { supabase } from '@/data/supabaseClient'

export interface FamilyInvite {
  code: string
  note: string | null
  createdAt: string
  expiresAt: string
  usedByFamily: string | null
  usedAt: string | null
}

// Solo la dueña de la app (is_app_owner) — ver 0093_family_invites.sql.
export async function generateFamilyInvite(note: string): Promise<string> {
  const { data, error } = await supabase.rpc('generate_family_invite', { p_note: note.trim() || null })
  if (error) throw error
  return data as string
}

export async function listFamilyInvites(): Promise<FamilyInvite[]> {
  const { data, error } = await supabase
    .from('family_invites')
    .select('code, note, created_at, expires_at, used_by_family, used_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((r) => ({
    code: r.code,
    note: r.note,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    usedByFamily: r.used_by_family,
    usedAt: r.used_at,
  }))
}

export async function deleteFamilyInvite(code: string): Promise<void> {
  const { error } = await supabase.from('family_invites').delete().eq('code', code)
  if (error) throw error
}
