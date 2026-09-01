// Repetición de tareas y eventos — RRULE simplificado (FREQ + BYDAY
// opcional para semanal), compartido entre Tareas y Calendario para no
// duplicar la misma lógica en dos sitios.
import { WEEKDAY_LABELS } from '@/domain/calendar'

export const FREQ_OPTIONS = [
  { value: '', label: 'No se repite' },
  { value: 'DAILY', label: 'Cada día' },
  { value: 'WEEKLY', label: 'Cada semana' },
  { value: 'MONTHLY', label: 'Cada mes' },
  { value: 'YEARLY', label: 'Cada año' },
]

// Mismo orden que WEEKDAY_LABELS (L M X J V S D) pero en código RFC 5545,
// para poder montar "FREQ=WEEKLY;BYDAY=MO,TU,..." a partir de los chips
// que el usuario marque (p. ej. "los martes", "de lunes a viernes").
export const BYDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

// SKIPHOLIDAYS y UNTIL no son (del todo) RFC 5545 — UNTIL sí existe en
// el estándar pero normalmente lleva hora; aquí se guarda como fecha
// simple (YYYY-MM-DD) porque es lo único que pide la app: "repetir cada
// día, pero no para siempre — hasta el 7 de febrero". Sin esto, una
// tarea/evento diario se repetía indefinidamente (limitado solo por el
// tope de seguridad de expandOccurrences, ~10 años).
export function buildRecurrenceRule(
  freq: string,
  byDay: string[],
  skipHolidays = false,
  until: string | null = null,
): string | null {
  if (!freq) return null
  const parts = [`FREQ=${freq}`]
  if (freq === 'WEEKLY' && byDay.length > 0) parts.push(`BYDAY=${byDay.join(',')}`)
  if (until) parts.push(`UNTIL=${until}`)
  if (skipHolidays) parts.push('SKIPHOLIDAYS=1')
  return parts.join(';')
}

export function parseRecurrenceRule(
  rule: string | null,
): { freq: string; byDay: string[]; skipHolidays: boolean; until: string | null } {
  if (!rule) return { freq: '', byDay: [], skipHolidays: false, until: null }
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=')))
  return {
    freq: parts.FREQ ?? '',
    byDay: parts.BYDAY ? parts.BYDAY.split(',') : [],
    skipHolidays: parts.SKIPHOLIDAYS === '1',
    until: parts.UNTIL ?? null,
  }
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function recurrenceLabel(rule: string | null): string {
  const { freq, byDay, skipHolidays, until } = parseRecurrenceRule(rule)
  if (!freq) return ''
  const base = FREQ_OPTIONS.find((f) => f.value === freq)?.label ?? ''
  let label = base
  if (freq === 'WEEKLY' && byDay.length > 0) {
    const days = byDay.map((code) => WEEKDAY_LABELS[BYDAY_CODES.indexOf(code)]).join('')
    label = `${base} (${days})`
  }
  if (until) label = `${label}, hasta ${formatShortDate(until)}`
  return skipHolidays ? `${label}, sin festivos` : label
}
