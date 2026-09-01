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

// SKIPHOLIDAYS no es RFC 5545 — es una extensión propia para poder decir
// "de lunes a viernes, excepto festivos" sin montar un formato de
// excepciones completo (EXDATE). Los festivos concretos se resuelven
// aparte, contra el calendario externo de festivos que la familia haya
// enlazado (ver domain/calendar.ts expandOccurrences).
export function buildRecurrenceRule(freq: string, byDay: string[], skipHolidays = false): string | null {
  if (!freq) return null
  const parts = [`FREQ=${freq}`]
  if (freq === 'WEEKLY' && byDay.length > 0) parts.push(`BYDAY=${byDay.join(',')}`)
  if (skipHolidays) parts.push('SKIPHOLIDAYS=1')
  return parts.join(';')
}

export function parseRecurrenceRule(rule: string | null): { freq: string; byDay: string[]; skipHolidays: boolean } {
  if (!rule) return { freq: '', byDay: [], skipHolidays: false }
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=')))
  return {
    freq: parts.FREQ ?? '',
    byDay: parts.BYDAY ? parts.BYDAY.split(',') : [],
    skipHolidays: parts.SKIPHOLIDAYS === '1',
  }
}

export function recurrenceLabel(rule: string | null): string {
  const { freq, byDay, skipHolidays } = parseRecurrenceRule(rule)
  if (!freq) return ''
  const base = FREQ_OPTIONS.find((f) => f.value === freq)?.label ?? ''
  let label = base
  if (freq === 'WEEKLY' && byDay.length > 0) {
    const days = byDay.map((code) => WEEKDAY_LABELS[BYDAY_CODES.indexOf(code)]).join('')
    label = `${base} (${days})`
  }
  return skipHolidays ? `${label}, sin festivos` : label
}
