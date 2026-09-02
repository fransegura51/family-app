import { supabase } from '@/data/supabaseClient'
import type { CalendarEvent } from '@/domain/types'
import type { EventReminder, ReminderAnchor } from '@/domain/reminders'

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
  exception_dates: string[]
  calendar_event_members: { member_id: string }[]
  calendar_event_reminders: { minutes_before: number; anchor: string }[]
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
    exceptionDates: row.exception_dates ?? [],
    reminders: row.calendar_event_reminders.map((r) => ({
      minutesBefore: r.minutes_before,
      anchor: r.anchor as ReminderAnchor,
    })),
    memberIds: row.calendar_event_members.map((m) => m.member_id),
  }
}

export async function listUpcomingEvents(): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select(
      'id, family_id, title, description, start_at, end_at, all_day, color, recurrence_rule, exception_dates, calendar_event_members(member_id), calendar_event_reminders(minutes_before, anchor)',
    )
    .order('start_at', { ascending: true })

  if (error) throw error
  return (data as unknown as EventRow[]).map(toEvent)
}

async function replaceReminders(eventId: string, reminders: EventReminder[]): Promise<void> {
  const { error: deleteError } = await supabase.from('calendar_event_reminders').delete().eq('event_id', eventId)
  if (deleteError) throw deleteError

  if (reminders.length > 0) {
    const { error: insertError } = await supabase.from('calendar_event_reminders').insert(
      reminders.map((r) => ({ event_id: eventId, minutes_before: r.minutesBefore, anchor: r.anchor })),
    )
    if (insertError) throw insertError
  }
}

export async function createEvent(input: {
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  recurrenceRule: string | null
  reminders: EventReminder[]
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
      end_at: input.endAt,
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
    const { error: reminderError } = await supabase.from('calendar_event_reminders').insert(
      input.reminders.map((r) => ({ event_id: event.id, minutes_before: r.minutesBefore, anchor: r.anchor })),
    )
    if (reminderError) throw reminderError
  }

  return event.id as string
}

export async function updateEvent(
  id: string,
  input: {
    title: string
    startAt: string
    endAt: string | null
    allDay: boolean
    recurrenceRule: string | null
    reminders: EventReminder[]
    memberIds: string[]
  },
): Promise<void> {
  const { error } = await supabase
    .from('calendar_events')
    .update({
      title: input.title,
      start_at: input.startAt,
      end_at: input.endAt,
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

// Borra solo una ocurrencia de un evento recurrente (p. ej. "este
// martes no hay entrenamiento") sin tocar el resto de la serie — se
// guarda como excepción (fecha a excluir), no se borra el evento.
export async function deleteEventOccurrence(id: string, dateStr: string): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from('calendar_events')
    .select('exception_dates')
    .eq('id', id)
    .single()
  if (fetchError) throw fetchError

  const next = Array.from(new Set([...(data.exception_dates ?? []), dateStr]))
  const { error } = await supabase.from('calendar_events').update({ exception_dates: next }).eq('id', id)
  if (error) throw error
}

export interface EventCompletion {
  eventId: string
  occurrenceDate: string
}

// Qué ocurrencias de qué eventos ya se han marcado como hechas — por
// ocurrencia (event_id + fecha), no por evento entero, así un evento
// recurrente se puede marcar hecho un día sin afectar a los demás.
export async function listEventCompletions(): Promise<EventCompletion[]> {
  const { data, error } = await supabase.from('calendar_event_completions').select('event_id, occurrence_date')
  if (error) throw error
  return data.map((r) => ({ eventId: r.event_id, occurrenceDate: r.occurrence_date }))
}

export async function completeEventOccurrence(eventId: string, occurrenceDate: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_event_completions')
    .insert({ event_id: eventId, occurrence_date: occurrenceDate })
  if (error) throw new Error(error.message)
}

export async function uncompleteEventOccurrence(eventId: string, occurrenceDate: string): Promise<void> {
  const { error } = await supabase
    .from('calendar_event_completions')
    .delete()
    .eq('event_id', eventId)
    .eq('occurrence_date', occurrenceDate)
  if (error) throw new Error(error.message)
}

export interface ReminderEvent {
  id: string
  title: string
  anchorAt: string // start_at o end_at del evento, según a qué cuente este recordatorio
  anchor: ReminderAnchor
  reminderMinutes: number
}

// Recordatorios activos (evento futuro, o su fin todavía por llegar si
// el recordatorio cuenta desde el fin). Se consulta periódicamente desde
// ReminderWatcher — no hay tabla de "notificaciones enviadas" en
// servidor porque el disparo es local a cada dispositivo/sesión.
export async function listActiveReminders(): Promise<ReminderEvent[]> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('calendar_event_reminders')
    .select('minutes_before, anchor, calendar_events!inner(id, title, start_at, end_at)')
    .gte('calendar_events.start_at', weekAgo)

  if (error) throw error
  return (
    data as unknown as {
      minutes_before: number
      anchor: string
      calendar_events: { id: string; title: string; start_at: string; end_at: string | null }
    }[]
  )
    .map((row) => {
      const anchor = row.anchor as ReminderAnchor
      const anchorAt = anchor === 'end' ? row.calendar_events.end_at : row.calendar_events.start_at
      return anchorAt
        ? {
            id: row.calendar_events.id,
            title: row.calendar_events.title,
            anchorAt,
            anchor,
            reminderMinutes: row.minutes_before,
          }
        : null
    })
    .filter((r): r is ReminderEvent => r !== null)
}
