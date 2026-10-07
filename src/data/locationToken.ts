// Código personal de OwnTracks por miembro (ubicación con la app cerrada). Migración 0213: en la base solo queda la
// huella del código; se enseña UNA vez al generarlo. Generarlo de nuevo invalida el anterior.
import { supabase } from '@/data/supabaseClient'

export interface LocationTokenStatus {
  memberId: string
  createdAt: string
  lastUsedAt: string | null
}

export function ownTracksEndpointUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/owntracks-ingest`
}

export async function createMemberLocationToken(memberId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_member_location_token', { p_member_id: memberId })
  if (error) throw error
  return data as string
}

export async function revokeMemberLocationToken(memberId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_member_location_token', { p_member_id: memberId })
  if (error) throw error
}

export async function listMemberLocationTokenStatus(): Promise<LocationTokenStatus[]> {
  const { data, error } = await supabase.rpc('list_member_location_token_status')
  if (error) throw error
  return (data as { member_id: string; created_at: string; last_used_at: string | null }[]).map((r) => ({
    memberId: r.member_id,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }))
}
