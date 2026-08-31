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
  reminder_minutes: number | null
  calendar_event_members: { member_id: string }[]
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
    reminderMinutes: row.reminder_minutes,
    memberIds: row.calendar_event_members.map((m) => m.member_id),
  }
}

export async function listUpcomingEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(
      'id, family_id, title, description, start_at, end_at, all_day, color, recurrence_rule, reminder_minutes, calendar_event_members(member_id)',
    )
    .order('start_at', { ascending: true })

  if (error) throw error
  return (data as unknown as EventRow[]).map(toEvent)
}

export async function createEvent(input: {
  title: string
  startAt: string
  allDay: boolean
  recurrenceRule: string | null
  reminderMinutes: number | null
  memberIds: string[]
}): Promise<void> {
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
      reminder_minutes: input.reminderMinutes,
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
}

export async function updateEvent(
  id: string,
  input: {
    title: string
    startAt: string
    allDay: boolean
    recurrenceRule: string | null
    reminderMinutes: number | null
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
      reminder_minutes: input.reminderMinutes,
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
    .from('calendar_events')
    .select('id, title, start_at, reminder_minutes')
    .not('reminder_minutes', 'is', null)
    .gte('start_at', new Date().toISOString())

  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    startAt: row.start_at,
    reminderMinutes: row.reminder_minutes as number,
  }))
}
