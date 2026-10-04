// Eventos ↔ Calendario — qué hay que hacer en el Calendario cuando cambia la fecha de un evento (puro).
//
// Una sola representación lógica: events.calendar_event_id apunta a UN compromiso de calendar_events. Reglas:
//  · Solo una fecha CONFIRMADA crea el compromiso (una provisional no se apunta sola en el Calendario).
//  · Si el compromiso ya existe, se mantiene al día con la fecha/hora/título/lugar del evento aunque la fecha
//    pase a provisional: es el MISMO compromiso, nunca se duplica ni se borra por un simple cambio de estado.
//  · Cambiar solo Provisional ↔ Confirmada no cambia nada del compromiso → no se escribe (idempotente).
//  · Sin fecha (se quitó, o «Todavía no lo sabemos») el compromiso se elimina y se limpia el enlace: no queda
//    una entrada antigua del evento en el Calendario.
//
// BUG que corrige este módulo: la hora de un evento llega de la base de datos como «HH:MM:SS» («17:00:00») y
// el código antiguo construía `${fecha}T${hora}:00` → «2027-02-20T17:00:00:00», una fecha-hora INVÁLIDA para
// Postgres. Por eso cualquier fecha CONFIRMADA CON HORA fallaba al anotarse en el Calendario («No se pudo
// anotar la fecha en el calendario») aunque el evento sí se guardaba. Sin hora (todo el día) nunca fallaba.
export interface CalendarEntryValues {
  startAt: string
  allDay: boolean
}

// Todo el día: medianoche UTC (así se han guardado siempre estos compromisos; el Calendario muestra el día).
// Con hora: el INSTANTE real de esa hora local del dispositivo (mismo criterio que crear un evento a mano en
// Calendario: new Date(`${fecha}T${hora}`).toISOString()). Acepta «HH:MM» y «HH:MM:SS».
export function calendarEntryFor(eventDate: string, eventTime: string | null): CalendarEntryValues {
  if (!eventTime) return { startAt: `${eventDate}T00:00:00.000Z`, allDay: true }
  return { startAt: new Date(`${eventDate}T${eventTime.slice(0, 5)}:00`).toISOString(), allDay: false }
}

export interface LinkedCalendarRow {
  start_at: string
  all_day: boolean
  title: string
  location_label: string | null
}

// ¿El compromiso ya refleja el evento? Se comparan INSTANTES (no textos): «2027-02-20 16:00:00+00» y
// «2027-02-20T16:00:00.000Z» son lo mismo.
export function calendarRowMatches(
  row: LinkedCalendarRow,
  event: { title: string; eventDate: string; eventTime: string | null; venueLabel: string | null },
): boolean {
  const desired = calendarEntryFor(event.eventDate, event.eventTime)
  return (
    new Date(row.start_at).getTime() === new Date(desired.startAt).getTime() &&
    Boolean(row.all_day) === desired.allDay &&
    row.title === event.title &&
    (row.location_label ?? null) === (event.venueLabel ?? null)
  )
}

export type CalendarRowState = 'missing' | 'matches' | 'differs'
export type CalendarSyncAction = 'none' | 'create' | 'update' | 'remove' | 'clear_link'

export function planCalendarSync(input: {
  archived: boolean
  eventDate: string | null
  dateStatus: 'pendiente' | 'provisional' | 'confirmada'
  linkedId: string | null
  // Estado del compromiso enlazado (solo si hay enlace; el llamador lo consulta).
  rowState: CalendarRowState | null
}): CalendarSyncAction {
  if (input.archived) return 'none'
  const hasDate = Boolean(input.eventDate) && input.dateStatus !== 'pendiente'
  if (!hasDate) {
    if (!input.linkedId) return 'none'
    return input.rowState === 'missing' ? 'clear_link' : 'remove'
  }
  if (input.linkedId) {
    if (input.rowState === 'missing') return input.dateStatus === 'confirmada' ? 'create' : 'clear_link'
    return input.rowState === 'matches' ? 'none' : 'update'
  }
  return input.dateStatus === 'confirmada' ? 'create' : 'none'
}
