import { supabase } from '@/data/supabaseClient'

// Panel de administración de la app (no de una familia) — solo Jennifer
// y Paco (profiles.is_app_owner, ver 0085_app_owner_usage_panel.sql).
// list_app_usage() ya hace el control de acceso en el propio servidor:
// si quien llama no es app owner, devuelve 0 filas sin más.
export interface AppUsageRow {
  familyId: string
  familyName: string
  profileId: string
  displayName: string
  role: string
  email: string
  createdAt: string
  lastSignInAt: string | null
  hasPush: boolean
}

export async function listAppUsage(): Promise<AppUsageRow[]> {
  const { data, error } = await supabase.rpc('list_app_usage')
  if (error) throw error
  return (
    data as {
      family_id: string
      family_name: string
      profile_id: string
      display_name: string
      role: string
      email: string
      created_at: string
      last_sign_in_at: string | null
      has_push: boolean
    }[]
  ).map((r) => ({
    familyId: r.family_id,
    familyName: r.family_name,
    profileId: r.profile_id,
    displayName: r.display_name,
    role: r.role,
    email: r.email,
    createdAt: r.created_at,
    lastSignInAt: r.last_sign_in_at,
    hasPush: r.has_push,
  }))
}
