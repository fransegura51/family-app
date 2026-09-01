import { supabase } from '@/data/supabaseClient'
import type { CalendarEvent } from '@/domain/types'

interface EventRow {
  id: string
  family_id: string
  title: string
  description: string | null
  start_at: string
  end_at: string | null
  all_day: boolean
  color: string | null
  recurrence_rule: string | null
  calendar_event_members: { member_id: string }[]
  calendar_event_reminders: { minutes_before: number }[]
}

function toEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    color: row.color,
    recurrenceRule: row.recurrence_rule,
    reminders: row.calendar_event_reminders.map((r) => r.minutes_before),
    memberIds: row.calendar_event_members.map((m) => m.member_id),
  }
}

export async function listUpcomingEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(
      'id, family_id, title, description, start_at, end_at, all_day, color, recurrence_rule, calendar_event_members(member_id), calendar_event_reminders(minutes_before)',
    )
    .order('start_at', { ascending: true })

  if (error) throw error
  return (data as unknown as EventRow[]).map(toEvent)
}

async function replaceReminders(eventId: string, reminders: number[]): Promise<void> {
  const { error: deleteError } = await supabase.from('calendar_event_reminders').delete().eq('event_id', eventId)
  if (deleteError) throw deleteError

  if (reminders.length > 0) {
    const { error: insertError } = await supabase
      .from('calendar_event_reminders')
      .insert(reminders.map((minutesBefore) => ({ event_id: eventId, minutes_before: minutesBefore })))
    if (insertError) throw insertError
  }
}

export async function createEvent(input: {
  title: string
  startAt: string
  allDay: boolean
  recurrenceRule: string | null
  reminders: number[]
  memberIds: string[]
}): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', userResult.user.id)
    .single()
  if (profileError) throw profileError

  const { data: event, error } = await supabase
    .from('calendar_events')
    .insert({
      family_id: profileRow.family_id,
      title: input.title,
      start_at: input.startAt,
      all_day: input.allDay,
      recurrence_rule: input.recurrenceRule,
      created_by: userResult.user.id,
    })
    .select('id')
    .single()
  if (error) throw error

  if (input.memberIds.length > 0) {
    const { error: linkError } = await supabase
      .from('calendar_event_members')
      .insert(input.memberIds.map((memberId) => ({ event_id: event.id, member_id: memberId })))
    if (linkError) throw linkError
  }

  if (input.reminders.length > 0) {
    const { error: reminderError } = await supabase
      .from('calendar_event_reminders')
      .insert(input.reminders.map((minutesBefore) => ({ event_id: event.id, minutes_before: minutesBefore })))
    if (reminderError) throw reminderError
  }

  return event.id as string
}

export async function updateEvent(
  id: string,
  input: {
    title: string
    startAt: string
    allDay: boolean
    recurrenceRule: string | null
    reminders: number[]
    memberIds: string[]
  },
): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .update({
      title: input.title,
      start_at: input.startAt,
      all_day: input.allDay,
      recurrence_rule: input.recurrenceRule,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error

  // Sustituye la lista de miembros asociados: más simple y suficiente
  // para el volumen de eventos de una familia que un diff fino.
  const { error: deleteError } = await supabase
    .from('calendar_event_members')
    .delete()
    .eq('event_id', id)
  if (deleteError) throw deleteError

  if (input.memberIds.length > 0) {
    const { error: insertError } = await supabase
      .from('calendar_event_members')
      .insert(input.memberIds.map((memberId) => ({ event_id: id, member_id: memberId })))
    if (insertError) throw insertError
  }

  await replaceReminders(id, input.reminders)
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id)
  if (error) throw error
}

export interface ReminderEvent {
  id: string
  title: string
  startAt: string
  reminderMinutes: number
}

// Eventos futuros con recordatorio activo. Se consulta periódicamente
// desde ReminderWatcher — no hay tabla de "notificaciones enviadas" en
// servidor porque el disparo es local a cada dispositivo/sesión.
export async function listActiveReminders(): Promise<ReminderEvent[]> {
  const { data, error } = await supabase
    .from('calendar_event_reminders')
    .select('minutes_before, calendar_events!inner(id, title, start_at)')
    .gte('calendar_events.start_at', new Date().toISOString())

  if (error) throw error
  return (
    data as unknown as { minutes_before: number; calendar_events: { id: string; title: string; start_at: string } }[]
  ).map((row) => ({
    id: row.calendar_events.id,
    title: row.calendar_events.title,
    startAt: row.calendar_events.start_at,
    reminderMinutes: row.minutes_before,
  }))
}
