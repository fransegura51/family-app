// Preparativos — "🗂️ Encargos" (migración 0212, extendida en 0215): agrupación organizativa de tareas
// relacionadas (p. ej. "Flores": ramo, prendidos, decoración, recoger). UN grupo principal por tarea.
// Desde 0215, un encargo puede RESOLVERSE (proveedor real + precio total opcional, reutilizando
// event_providers/event_payments tal cual — nunca event_budget_items, ver cabecera de esa migración).
import { supabase } from '@/data/supabaseClient'
import type { EventTaskGroup, EventTaskGroupResolution, EventTaskGroupResolutionMethod } from '@/domain/types'

const GROUP_SELECT = 'id, event_id, name, sort_order, kind, resolved_at, resolution_method, resolution_note, provider_id, provider_name, payment_id'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGroup(r: any): EventTaskGroup {
  return {
    id: r.id,
    eventId: r.event_id,
    name: r.name,
    sortOrder: r.sort_order,
    kind: r.kind,
    resolvedAt: r.resolved_at,
    resolutionMethod: r.resolution_method,
    resolutionNote: r.resolution_note,
    providerId: r.provider_id,
    providerName: r.provider_name,
    paymentId: r.payment_id,
  }
}

// Postgres: violación de unicidad — mismo criterio que usa events.ts para create_task concurrentes.
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
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

// Auto-agrupación EN ORIGEN (Tanda Encargos v2): idempotente por (event_id, kind) — kind es el
// identificador INTERNO estable (nunca el name, que la familia puede renombrar), así que reconoce el
// mismo encargo aunque ya lo hayan renombrado. Si dos creaciones concurrentes chocan contra el índice
// único, se relee la fila ya creada por la otra en vez de fallar.
export async function findOrCreateEventTaskGroupByKind(eventId: string, familyId: string, kind: string, defaultName: string): Promise<string> {
  const { data: existing, error: selectError } = await supabase.from('event_task_groups').select('id').eq('event_id', eventId).eq('kind', kind).maybeSingle()
  if (selectError) throw selectError
  if (existing) return existing.id as string
  const { data, error } = await supabase
    .from('event_task_groups')
    .insert({ event_id: eventId, family_id: familyId, name: defaultName, kind, sort_order: Date.now() })
    .select('id')
    .single()
  if (error) {
    if (isUniqueViolation(error)) {
      const { data: retry, error: retryError } = await supabase.from('event_task_groups').select('id').eq('event_id', eventId).eq('kind', kind).single()
      if (retryError) throw retryError
      return retry.id as string
    }
    throw error
  }
  return data.id as string
}

// Resolución de un encargo (migración 0215, historial añadido en 0220): nunca toca las tareas del encargo
// (eso lo decide y ejecuta quien llama, completando solo sus tareas PENDIENTES actuales) ni ningún otro
// encargo. Las columnas de event_task_groups siguen reflejando solo la resolución MÁS RECIENTE (igual que
// siempre, para no romper nada que ya las lea), pero AHORA cada resolución queda ADEMÁS como una fila
// nueva en event_task_group_resolutions — nunca se sobrescribe ni se borra una resolución anterior.
// Resolver dos veces el mismo encargo (p. ej. tras añadirle un complemento nuevo después de ya resuelto)
// conserva intacta la primera: proveedor, importe y método anteriores siguen consultables en el histórico.
export async function resolveEventTaskGroup(
  groupId: string,
  input: { method: EventTaskGroupResolutionMethod; note?: string | null; providerId?: string | null; providerName?: string | null; paymentId?: string | null },
): Promise<void> {
  const { data: group, error: groupError } = await supabase.from('event_task_groups').select('family_id').eq('id', groupId).single()
  if (groupError) throw groupError
  const resolvedAt = new Date().toISOString()
  const { error } = await supabase
    .from('event_task_groups')
    .update({
      resolved_at: resolvedAt,
      resolution_method: input.method,
      resolution_note: input.note ?? null,
      provider_id: input.providerId ?? null,
      provider_name: input.providerName ?? null,
      payment_id: input.paymentId ?? null,
    })
    .eq('id', groupId)
  if (error) throw error
  const { error: historyError } = await supabase.from('event_task_group_resolutions').insert({
    group_id: groupId,
    family_id: group.family_id,
    method: input.method,
    note: input.note ?? null,
    provider_id: input.providerId ?? null,
    provider_name: input.providerName ?? null,
    payment_id: input.paymentId ?? null,
    resolved_at: resolvedAt,
  })
  if (historyError) throw historyError
}

const GROUP_RESOLUTION_SELECT = 'id, group_id, method, note, provider_id, provider_name, payment_id, resolved_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGroupResolution(r: any): EventTaskGroupResolution {
  return {
    id: r.id,
    groupId: r.group_id,
    method: r.method,
    note: r.note,
    providerId: r.provider_id,
    providerName: r.provider_name,
    paymentId: r.payment_id,
    resolvedAt: r.resolved_at,
  }
}

// Histórico completo de resoluciones de un encargo, de la más antigua a la más reciente — para poder
// mostrar "antes resuelto: Floristería X · 150 €" aunque el encargo tenga ahora algo nuevo pendiente.
export async function listEventTaskGroupResolutions(groupId: string): Promise<EventTaskGroupResolution[]> {
  const { data, error } = await supabase.from('event_task_group_resolutions').select(GROUP_RESOLUTION_SELECT).eq('group_id', groupId).order('resolved_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapGroupResolution)
}
