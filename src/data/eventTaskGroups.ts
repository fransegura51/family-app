// Preparativos — "🗂️ Encargos" (migración 0212): agrupación organizativa de tareas relacionadas (p. ej.
// "Flores": ramo, prendidos, decoración, recoger). UN grupo principal por tarea. Deliberadamente SIN
// ninguna relación con Proveedores/Presupuesto — ver cabecera de la migración y el informe de la tanda.
import { supabase } from '@/data/supabaseClient'
import type { EventTaskGroup } from '@/domain/types'

const GROUP_SELECT = 'id, event_id, name, sort_order'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGroup(r: any): EventTaskGroup {
  return { id: r.id, eventId: r.event_id, name: r.name, sortOrder: r.sort_order }
}

export async function listEventTaskGroups(eventId: string): Promise<EventTaskGroup[]> {
  const { data, error } = await supabase.from('event_task_groups').select(GROUP_SELECT).eq('event_id', eventId).order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapGroup)
}

export async function addEventTaskGroup(eventId: string, name: string): Promise<string> {
  const { data: event, error: eventError } = await supabase.from('events').select('family_id').eq('id', eventId).single()
  if (eventError) throw eventError
  const { data, error } = await supabase
    .from('event_task_groups')
    .insert({ event_id: eventId, family_id: event.family_id, name: name.trim(), sort_order: Date.now() })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function renameEventTaskGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.from('event_task_groups').update({ name: name.trim() }).eq('id', groupId)
  if (error) throw error
}

// Borrar un encargo NUNCA borra sus tareas: el FK ON DELETE SET NULL (migración 0212) las deja sin
// encargo, exactamente como estaban antes de agruparlas — nunca una limpieza en cascada.
export async function deleteEventTaskGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('event_task_groups').delete().eq('id', groupId)
  if (error) throw error
}

export async function countTasksInGroup(groupId: string): Promise<number> {
  const { count, error } = await supabase.from('event_tasks').select('id', { count: 'exact', head: true }).eq('group_id', groupId)
  if (error) throw error
  return count ?? 0
}

// Asocia/desasocia una tarea de un encargo (null = quitarla del grupo sin borrar la tarea). Un único
// UPDATE sobre event_tasks.group_id — nunca toca título, fecha, responsables, prioridad, nota,
// Calendario ni recordatorios.
export async function setEventTaskGroup(taskId: string, groupId: string | null): Promise<void> {
  const { error } = await supabase.from('event_tasks').update({ group_id: groupId }).eq('id', taskId)
  if (error) throw error
}
