// Módulo Eventos (PEPA Events) — capa de datos de la Fase 0 (motor
// común + tareas). Las demás tablas satélite (invitados, presupuesto,
// menú, proveedores, pagos...) creadas en la migración 0106 se
// acompañan de sus propias funciones cuando llegue su fase — ver plan
// en C:\Users\Usuario\.claude\plans\zany-wishing-brook.md.
import { supabase } from '@/data/supabaseClient'
import { generateAutoTasks } from '@/domain/events'
import type { EventModuleKey, EventTask, EventType, FamilyEvent } from '@/domain/types'

async function currentFamilyId(): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')
  const { data: profileRow, error } = await supabase.from('profiles').select('family_id').eq('id', userResult.user.id).single()
  if (error) throw error
  return profileRow.family_id
}

const EVENT_SELECT =
  'id, family_id, type, subtype, title, date_status, event_date, event_time, venue_label, venue_type, ceremony_location_label, ceremony_location_latitude, ceremony_location_longitude, ceremony_time, celebration_location_label, celebration_location_latitude, celebration_location_longitude, theme, details, enabled_modules, status, tag_id, calendar_event_id, rsvp_deadline, open_rsvp_token, created_by, created_at, updated_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(r: any): FamilyEvent {
  return {
    id: r.id,
    familyId: r.family_id,
    type: r.type,
    subtype: r.subtype,
    title: r.title,
    dateStatus: r.date_status,
    eventDate: r.event_date,
    eventTime: r.event_time,
    venueLabel: r.venue_label,
    venueType: r.venue_type,
    ceremonyLocationLabel: r.ceremony_location_label,
    ceremonyLocationLatitude: r.ceremony_location_latitude,
    ceremonyLocationLongitude: r.ceremony_location_longitude,
    ceremonyTime: r.ceremony_time,
    celebrationLocationLabel: r.celebration_location_label,
    celebrationLocationLatitude: r.celebration_location_latitude,
    celebrationLocationLongitude: r.celebration_location_longitude,
    theme: r.theme,
    details: r.details ?? {},
    enabledModules: r.enabled_modules ?? [],
    status: r.status,
    tagId: r.tag_id,
    calendarEventId: r.calendar_event_id,
    rsvpDeadline: r.rsvp_deadline,
    openRsvpToken: r.open_rsvp_token,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listEvents(includeArchived = false): Promise<FamilyEvent[]> {
  let query = supabase.from('events').select(EVENT_SELECT).order('event_date', { ascending: true, nullsFirst: false })
  if (!includeArchived) query = query.eq('status', 'planificacion')
  const { data, error } = await query
  if (error) throw error
  return data.map(mapEvent)
}

export async function getEvent(id: string): Promise<FamilyEvent> {
  const { data, error } = await supabase.from('events').select(EVENT_SELECT).eq('id', id).single()
  if (error) throw error
  return mapEvent(data)
}

// Busca una etiqueta de Economía con ese nombre exacto o la crea —
// evita chocar con el unique(family_id, name) si el usuario ya tenía
// una etiqueta igual (p. ej. al duplicar un evento de años anteriores
// con el mismo título).
async function findOrCreateEventTag(familyId: string, name: string): Promise<string> {
  const trimmed = name.trim().slice(0, 60)
  const { data: existing } = await supabase.from('tags').select('id').eq('family_id', familyId).eq('name', trimmed).maybeSingle()
  if (existing) return existing.id
  const { data: created, error } = await supabase
    .from('tags')
    .insert({ family_id: familyId, name: trimmed, color: '#4C6EF5', sort_order: Date.now() })
    .select('id')
    .single()
  if (error) throw error
  return created.id
}

export async function createEvent(input: {
  type: EventType
  subtype?: string | null
  title: string
  dateStatus: 'pendiente' | 'provisional' | 'confirmada'
  eventDate?: string | null
  details?: Record<string, unknown>
  enabledModules: EventModuleKey[]
}): Promise<string> {
  const familyId = await currentFamilyId()
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')

  const tagId = await findOrCreateEventTag(familyId, input.title)

  const { data: event, error } = await supabase
    .from('events')
    .insert({
      family_id: familyId,
      type: input.type,
      subtype: input.subtype ?? null,
      title: input.title.trim(),
      date_status: input.dateStatus,
      event_date: input.eventDate ?? null,
      details: input.details ?? {},
      enabled_modules: input.enabledModules,
      tag_id: tagId,
      created_by: userResult.user.id,
    })
    .select('id')
    .single()
  if (error) throw error

  const tasks = generateAutoTasks(input.type, input.eventDate ?? null)
  if (tasks.length > 0) {
    const { error: tasksError } = await supabase.from('event_tasks').insert(
      tasks.map((t, i) => ({
        event_id: event.id,
        family_id: familyId,
        title: t.title,
        due_date: t.dueDate,
        source: 'auto',
        sort_order: i,
      })),
    )
    if (tasksError) throw tasksError
  }

  return event.id
}

export async function updateEvent(
  id: string,
  patch: Partial<{
    title: string
    dateStatus: 'pendiente' | 'provisional' | 'confirmada'
    eventDate: string | null
    eventTime: string | null
    venueLabel: string | null
    venueType: string | null
    theme: string | null
    details: Record<string, unknown>
    enabledModules: EventModuleKey[]
    ceremonyLocationLabel: string | null
    ceremonyTime: string | null
    celebrationLocationLabel: string | null
    rsvpDeadline: string | null
  }>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.dateStatus !== undefined) update.date_status = patch.dateStatus
  if (patch.eventDate !== undefined) update.event_date = patch.eventDate
  if (patch.eventTime !== undefined) update.event_time = patch.eventTime
  if (patch.venueLabel !== undefined) update.venue_label = patch.venueLabel
  if (patch.venueType !== undefined) update.venue_type = patch.venueType
  if (patch.theme !== undefined) update.theme = patch.theme
  if (patch.details !== undefined) update.details = patch.details
  if (patch.enabledModules !== undefined) update.enabled_modules = patch.enabledModules
  if (patch.ceremonyLocationLabel !== undefined) update.ceremony_location_label = patch.ceremonyLocationLabel
  if (patch.ceremonyTime !== undefined) update.ceremony_time = patch.ceremonyTime
  if (patch.celebrationLocationLabel !== undefined) update.celebration_location_label = patch.celebrationLocationLabel
  if (patch.rsvpDeadline !== undefined) update.rsvp_deadline = patch.rsvpDeadline
  const { error } = await supabase.from('events').update(update).eq('id', id)
  if (error) throw error
}

// Petición de la Skill: "relative tasks update when event date
// changes" — solo toca las tareas generadas automáticamente (source
// 'auto'), buscándolas por título exacto de la plantilla; una tarea
// auto que el usuario haya renombrado deja de recalcularse sola (no
// hay forma de saber cuál era sin guardar una clave de plantilla, y no
// merece la pena para este alcance).
export async function recalculateAutoTasks(eventId: string, type: EventType, eventDate: string | null): Promise<void> {
  const templates = generateAutoTasks(type, eventDate)
  const results = await Promise.all(
    templates.map((t) =>
      supabase.from('event_tasks').update({ due_date: t.dueDate }).eq('event_id', eventId).eq('source', 'auto').eq('title', t.title),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)
}

export async function archiveEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').update({ status: 'archivado' }).eq('id', id)
  if (error) throw error
}

export async function unarchiveEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').update({ status: 'planificacion' }).eq('id', id)
  if (error) throw error
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

// Duplicar — petición de la Skill: copia la estructura (tipo, título,
// módulos, sitio, tema, datos del tipo) pero NUNCA estado transaccional
// viejo (invitados/RSVP/gastos), y genera una checklist nueva desde
// cero. Útil para el cumpleaños del año que viene.
export async function duplicateEvent(id: string): Promise<string> {
  const original = await getEvent(id)
  return createEvent({
    type: original.type,
    subtype: original.subtype,
    title: original.title,
    dateStatus: 'pendiente',
    eventDate: null,
    details: original.details,
    enabledModules: original.enabledModules,
  })
}

// ---------------------------------------------------------------------
// Preparativos / tareas
// ---------------------------------------------------------------------

const TASK_SELECT = 'id, event_id, family_id, title, done, due_date, source, sort_order, created_at'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTask(r: any): EventTask {
  return {
    id: r.id,
    eventId: r.event_id,
    familyId: r.family_id,
    title: r.title,
    done: r.done,
    dueDate: r.due_date,
    source: r.source,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }
}

export async function listEventTasks(eventId: string): Promise<EventTask[]> {
  const { data, error } = await supabase
    .from('event_tasks')
    .select(TASK_SELECT)
    .eq('event_id', eventId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data.map(mapTask)
}

export async function addEventTask(eventId: string, title: string, dueDate: string | null = null): Promise<void> {
  const familyId = await currentFamilyId()
  const { error } = await supabase
    .from('event_tasks')
    .insert({ event_id: eventId, family_id: familyId, title: title.trim(), due_date: dueDate, source: 'manual', sort_order: Date.now() })
  if (error) throw error
}

export async function updateEventTask(id: string, patch: { title?: string; done?: boolean; dueDate?: string | null }): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title.trim()
  if (patch.done !== undefined) update.done = patch.done
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate
  const { error } = await supabase.from('event_tasks').update(update).eq('id', id)
  if (error) throw error
}

export async function deleteEventTask(id: string): Promise<void> {
  const { error } = await supabase.from('event_tasks').delete().eq('id', id)
  if (error) throw error
}
