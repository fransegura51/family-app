import { supabase } from '@/data/supabaseClient'

export interface ActivityEntry {
  id: string
  tableName: string
  action: 'insert' | 'update' | 'delete'
  createdAt: string
  actorName: string | null
}

export async function listRecentActivity(limit = 50): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, table_name, action, created_at, profiles(display_name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as unknown as { id: string; table_name: string; action: string; created_at: string; profiles: { display_name: string } | null }[]).map(
    (r) => ({
      id: r.id,
      tableName: r.table_name,
      action: r.action as ActivityEntry['action'],
      createdAt: r.created_at,
      actorName: r.profiles?.display_name ?? null,
    }),
  )
}
