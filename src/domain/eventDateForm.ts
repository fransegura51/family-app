// Eventos — formulario de FECHA con hora y estado (puro). Patrón ÚNICO para «Celebración», «Ceremonia y
// celebración» y cada momento: primero se pone la fecha, luego la hora (opcional) y, con la fecha ya puesta, se
// indica si es provisional o confirmada; nada se guarda hasta pulsar «Guardar fecha», y se guarda todo junto.
//
// «Todavía no lo sabemos» NO es un tercer estado de la fecha: significa «no tenemos fecha» y es una alternativa a
// ponerla. Provisional / Confirmada solo existen cuando hay una fecha.
export type DateChoice = 'provisional' | 'confirmada'

export const DATE_CHOICES: { value: DateChoice; label: string }[] = [
  { value: 'provisional', label: '◷ Provisional' },
  { value: 'confirmada', label: '✓ Confirmada' },
]

export const DATE_FIELD_LABEL = '📅 Fecha'
export const TIME_FIELD_LABEL = '🕐 Hora (opcional)'
export const DATE_STATUS_QUESTION = '¿Esta fecha es provisional o confirmada?'
export const MISSING_DATE_MESSAGE = 'Elige primero una fecha.'
export const MISSING_STATUS_MESSAGE = 'Indica si la fecha es provisional o confirmada.'

export interface DateDraft {
  date: string
  time: string
  // null = el usuario todavía no ha elegido: una fecha NUEVA nunca llega preseleccionada.
  status: DateChoice | null
}

// Valida antes de guardar: nunca se guarda un estado sin fecha ni una fecha sin estado, y nunca se inventa
// ninguno de los dos. La hora no se valida: puede faltar.
export function validateDateDraft(draft: Pick<DateDraft, 'date' | 'status'>): string | null {
  if (!draft.date) return MISSING_DATE_MESSAGE
  if (!draft.status) return MISSING_STATUS_MESSAGE
  return null
}

// Lo que se escribe, todo en una sola operación. Hora vacía = null (se BORRA la anterior; nunca 00:00, 12:00 ni
// la hora actual).
export function dateDraftToPatch(draft: DateDraft): { dateStatus: DateChoice; eventDate: string; eventTime: string | null } {
  return { dateStatus: draft.status as DateChoice, eventDate: draft.date, eventTime: draft.time ? draft.time : null }
}

// Borrador inicial a partir de lo guardado. Con fecha guardada se muestra su estado real; sin fecha, todo vacío
// y SIN estado preseleccionado.
export function dateDraftFromSaved(saved: { eventDate: string | null; eventTime: string | null; dateStatus: 'pendiente' | DateChoice }): DateDraft {
  if (!saved.eventDate || saved.dateStatus === 'pendiente') return { date: '', time: '', status: null }
  return { date: saved.eventDate, time: saved.eventTime ? saved.eventTime.slice(0, 5) : '', status: saved.dateStatus }
}

// ¿Hay algo que guardar? Sin fecha guardada, cualquier borrador es nuevo; con fecha, solo si cambia algo.
export function isDateDraftDirty(saved: { eventDate: string | null; eventTime: string | null; dateStatus: 'pendiente' | DateChoice }, draft: DateDraft): boolean {
  const base = dateDraftFromSaved(saved)
  if (!saved.eventDate || saved.dateStatus === 'pendiente') return Boolean(draft.date || draft.time || draft.status)
  return base.date !== draft.date || base.time !== draft.time || base.status !== draft.status
}
