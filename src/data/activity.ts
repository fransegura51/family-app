import { supabase } from '@/data/supabaseClient'

export interface ActivityEntry {
  id: string
  tableName: string
  action: 'insert' | 'update' | 'delete'
  createdAt: string
  actorId: string | null
  actorName: string | null
  recordId: string | null
}

// Las entradas más recientes (de más nueva a más antigua). `before`: solo las anteriores a esa fecha (para «Ver más antiguas»). Se piden más de las que se enseñan porque una
// misma acción puede anotar varias filas seguidas y se agrupan al mostrarlas.
export async function listRecentActivity(limit = 200, before?: string): Promise<ActivityEntry[]> {
  let q = supabase.from('activity_log').select('id, table_name, action, created_at, actor_id, record_id, profiles(display_name)').order('created_at', { ascending: false }).limit(limit)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) throw error
  return (
    data as unknown as {
      id: string
      table_name: string
      action: string
      created_at: string
      actor_id: string | null
      record_id: string | null
      profiles: { display_name: string } | null
    }[]
  ).map((r) => ({
    id: r.id,
    tableName: r.table_name,
    action: r.action as ActivityEntry['action'],
    createdAt: r.created_at,
    actorId: r.actor_id,
    actorName: r.profiles?.display_name ?? null,
    recordId: r.record_id,
  }))
}

const NAME_COLUMN: Record<string, string> = { calendar_events: 'title', shopping_items: 'name', family_members: 'name' }

/**
 * Nombres de los elementos a los que se refieren las entradas (título del evento, producto, miembro), SOLO los que esta persona puede leer: la consulta pasa por las reglas de acceso
 * de siempre (un evento privado de otra persona no se ve, así que no sale su título). Lo borrado ya no se puede nombrar. Como mucho 3 consultas pequeñas, solo al abrir la pantalla.
 * Si algo falla, la actividad se enseña igual con el texto genérico.
 */
export async function resolveRecordNames(entries: ActivityEntry[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  for (const [table, column] of Object.entries(NAME_COLUMN)) {
    const ids = [...new Set(entries.filter((e) => e.tableName === table && e.action !== 'delete' && e.recordId).map((e) => e.recordId as string))].slice(0, 100)
    if (ids.length === 0) continue
    try {
      const { data } = await supabase.from(table).select(`id, ${column}`).in('id', ids)
      for (const row of (data ?? []) as unknown as Record<string, string>[]) if (row.id && row[column]) names.set(row.id, row[column])
    } catch {
      /* se enseña sin nombre */
    }
  }
  return names
}
