import { supabase } from '@/data/supabaseClient'
import type { ActivityRow } from '@/domain/usageActivity'

// Actividad de uso por cuenta y personas por familia — solo propietarias de la app (migración 0226): a cualquier otra persona las
// funciones le devuelven 0 filas, igual que list_app_usage().
export interface OwnerFamilyRow {
  familyId: string
  familyName: string
  createdAt: string
  membersTotal: number
  membersWithAccount: number
}

export async function listAppUsageActivity(days = 30): Promise<ActivityRow[]> {
  const { data, error } = await supabase.rpc('list_app_usage_activity', { p_days: days })
  if (error) throw error
  return (data as { profile_id: string; family_id: string; section: string; hits: number; days_used: number; last_day: string }[]).map((r) => ({
    profileId: r.profile_id,
    familyId: r.family_id,
    section: r.section,
    hits: Number(r.hits),
    daysUsed: r.days_used,
    lastDay: r.last_day,
  }))
}

export async function listAppOwnerFamilies(): Promise<OwnerFamilyRow[]> {
  const { data, error } = await supabase.rpc('list_app_owner_families')
  if (error) throw error
  return (data as { family_id: string; family_name: string; created_at: string; members_total: number; members_with_account: number }[]).map((r) => ({
    familyId: r.family_id,
    familyName: r.family_name,
    createdAt: r.created_at,
    membersTotal: r.members_total,
    membersWithAccount: r.members_with_account,
  }))
}
