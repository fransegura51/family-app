// Preparativos: varios responsables (miembros de la familia y personas externas del evento).
// Las personas externas NO tienen cuenta ni acceso: pertenecen a un solo evento. Cada asignación externa guarda un
// snapshot (nombre y etiqueta), así que si la persona se borra conservando sus asignaciones la tarea sigue
// mostrándola como referencia histórica («María · Hermana») sin ser un usuario ficticio seleccionable.
import { supabase } from '@/data/supabaseClient'
import { updateEventTask } from '@/data/events'
import type { EventHelper } from '@/domain/types'

// Miembros de la familia: el principal (assigned_member_id) sigue siendo el primero de la lista, así el
// Calendario y las vistas que ya usan un solo responsable siguen funcionando igual.
export async function setEventTaskResponsibles(taskId: string, memberIds: string[]): Promise<void> {
  const { data: task, error: taskError } = await supabase.from('event_tasks').select('event_id, family_id').eq('id', taskId).single()
  if (taskError) throw taskError
  const { data: current, error: currentError } = await supabase.from('event_task_members').select('member_id').eq('task_id', taskId)
  if (currentError) throw currentError
  const existing = new Set((current ?? []).map((r) => r.member_id as string))
  const wanted = new Set(memberIds)
  const toRemove = [...existing].filter((id) => !wanted.has(id))
  const toAdd = memberIds.filter((id) => !existing.has(id))
  if (toRemove.length > 0) {
    const { error } = await supabase.from('event_task_members').delete().eq('task_id', taskId).in('member_id', toRemove)
    if (error) throw error
  }
  if (toAdd.length > 0) {
    const { error } = await supabase.from('event_task_members').insert(
      toAdd.map((memberId) => ({ task_id: taskId, member_id: memberId, event_id: task.event_id, family_id: task.family_id })),
    )
    if (error) throw error
  }
  // Principal = primero de la lista (compatibilidad con la sincronización de Calendario de un solo responsable).
  await updateEventTask(taskId, { assignedMemberId: memberIds[0] ?? null })
}

export async function listEventHelpers(eventId: string): Promise<EventHelper[]> {
  const { data, error } = await supabase.from('event_helpers').select('id, event_id, name, label').eq('event_id', eventId).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r) => ({ id: r.id as string, eventId: r.event_id as string, name: r.name as string, label: (r.label ?? null) as string | null }))
}

export async function addEventHelper(eventId: string, name: string, label: string | null): Promise<string> {
  const { data: event, error: eventError } = await supabase.from('events').select('family_id').eq('id', eventId).single()
  if (eventError) throw eventError
  const { data, error } = await supabase
    .from('event_helpers')
    .insert({ event_id: eventId, family_id: event.family_id, name: name.trim(), label: label?.trim() ? label.trim() : null })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function updateEventHelper(helperId: string, patch: { name: string; label: string | null }): Promise<void> {
  const { error } = await supabase.from('event_helpers').update({ name: patch.name.trim(), label: patch.label?.trim() ? patch.label.trim() : null }).eq('id', helperId)
  if (error) throw error
  // Los snapshots de las asignaciones activas se actualizan para que muestren el dato vigente.
  const { error: snapError } = await supabase
    .from('event_task_helpers')
    .update({ helper_name: patch.name.trim(), helper_label: patch.label?.trim() ? patch.label.trim() : null })
    .eq('helper_id', helperId)
  if (snapError) throw snapError
}

export async function countHelperAssignments(helperId: string): Promise<number> {
  const { count, error } = await supabase.from('event_task_helpers').select('id', { count: 'exact', head: true }).eq('helper_id', helperId)
  if (error) throw error
  return count ?? 0
}

// Borrado de una persona externa. 'keep' conserva las asignaciones como referencia histórica (snapshot, sin usuario);
// 'remove' quita también a esa persona de todas las tareas. Nunca se borra en silencio: lo decide quien llama.
export async function deleteEventHelper(helperId: string, mode: 'keep' | 'remove'): Promise<void> {
  if (mode === 'remove') {
    const { error } = await supabase.from('event_task_helpers').delete().eq('helper_id', helperId)
    if (error) throw error
  }
  const { error } = await supabase.from('event_helpers').delete().eq('id', helperId)
  if (error) throw error
}

// Asigna personas externas activas a una tarea. Las que ya estaban se mantienen; las quitadas se eliminan; las
// referencias históricas (helper_id null) no se tocan.
export async function setEventTaskHelpers(taskId: string, helperIds: string[]): Promise<void> {
  const { data: task, error: taskError } = await supabase.from('event_tasks').select('event_id, family_id').eq('id', taskId).single()
  if (taskError) throw taskError
  const { data: current, error: currentError } = await supabase.from('event_task_helpers').select('helper_id').eq('task_id', taskId).not('helper_id', 'is', null)
  if (currentError) throw currentError
  const existing = new Set((current ?? []).map((r) => r.helper_id as string))
  const wanted = new Set(helperIds)
  const toRemove = [...existing].filter((id) => !wanted.has(id))
  const toAdd = helperIds.filter((id) => !existing.has(id))
  if (toRemove.length > 0) {
    const { error } = await supabase.from('event_task_helpers').delete().eq('task_id', taskId).in('helper_id', toRemove)
    if (error) throw error
  }
  if (toAdd.length > 0) {
    const { data: helpers, error: helpersError } = await supabase
      .from('event_helpers')
      .select('id, name, label, event_id, family_id')
      .in('id', toAdd)
      .eq('event_id', task.event_id)
    if (helpersError) throw helpersError
    if ((helpers ?? []).length !== toAdd.length) throw new Error('Alguna persona externa ya no existe en este evento.')
    const { error } = await supabase.from('event_task_helpers').insert(
      (helpers ?? []).map((h) => ({
        task_id: taskId,
        helper_id: h.id,
        event_id: task.event_id,
        family_id: task.family_id,
        helper_name: h.name,
        helper_label: h.label ?? null,
      })),
    )
    if (error) throw error
  }
}
