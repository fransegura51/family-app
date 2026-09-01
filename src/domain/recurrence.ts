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

const FREQ_UNIT: Record<string, { singular: string; plural: string }> = {
  DAILY: { singular: 'día', plural: 'días' },
  WEEKLY: { singular: 'semana', plural: 'semanas' },
  MONTHLY: { singular: 'mes', plural: 'meses' },
  YEARLY: { singular: 'año', plural: 'años' },
}

// Mismo orden que WEEKDAY_LABELS (L M X J V S D) pero en código RFC 5545,
// para poder montar "FREQ=WEEKLY;BYDAY=MO,TU,..." a partir de los chips
// que el usuario marque (p. ej. "los martes", "de lunes a viernes").
export const BYDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

// SKIPHOLIDAYS, UNTIL e INTERVAL no son (del todo) RFC 5545 — UNTIL e
// INTERVAL sí existen en el estándar (aunque UNTIL normalmente lleva
// hora; aquí se guarda como fecha simple YYYY-MM-DD, que es lo único
// que pide la app). INTERVAL es cada cuántas unidades se repite ("cada
// 2 semanas" = FREQ=WEEKLY;INTERVAL=2); por defecto 1, y solo se
// escribe en la regla cuando es mayor que 1. Sin UNTIL, una tarea/
// evento diario se repetía indefinidamente (limitado solo por el tope
// de seguridad de expandOccurrences, ~10 años).
export function buildRecurrenceRule(
  freq: string,
  byDay: string[],
  skipHolidays = false,
  until: string | null = null,
  interval = 1,
): string | null {
  if (!freq) return null
  const parts = [`FREQ=${freq}`]
  if (freq === 'WEEKLY' && byDay.length > 0) parts.push(`BYDAY=${byDay.join(',')}`)
  if (interval > 1) parts.push(`INTERVAL=${interval}`)
  if (until) parts.push(`UNTIL=${until}`)
  if (skipHolidays) parts.push('SKIPHOLIDAYS=1')
  return parts.join(';')
}

export function parseRecurrenceRule(
  rule: string | null,
): { freq: string; byDay: string[]; skipHolidays: boolean; until: string | null; interval: number } {
  if (!rule) return { freq: '', byDay: [], skipHolidays: false, until: null, interval: 1 }
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=')))
  const interval = Number(parts.INTERVAL)
  return {
    freq: parts.FREQ ?? '',
    byDay: parts.BYDAY ? parts.BYDAY.split(',') : [],
    skipHolidays: parts.SKIPHOLIDAYS === '1',
    until: parts.UNTIL ?? null,
    interval: Number.isFinite(interval) && interval > 1 ? interval : 1,
  }
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function recurrenceLabel(rule: string | null): string {
  const { freq, byDay, skipHolidays, until, interval } = parseRecurrenceRule(rule)
  if (!freq) return ''
  const base = FREQ_OPTIONS.find((f) => f.value === freq)?.label ?? ''
  const unit = FREQ_UNIT[freq]
  let label = interval > 1 && unit ? `Cada ${interval} ${unit.plural}` : base
  if (freq === 'WEEKLY' && byDay.length > 0) {
    const days = byDay.map((code) => WEEKDAY_LABELS[BYDAY_CODES.indexOf(code)]).join('')
    label = `${label} (${days})`
  }
  if (until) label = `${label}, hasta ${formatShortDate(until)}`
  return skipHolidays ? `${label}, sin festivos` : label
}

// Preajustes al estilo de otras apps de calendario familiar: en vez de
// obligar a elegir frecuencia + días de la semana por separado cada
// vez, las combinaciones más habituales son un solo toque. "Todos los
// días laborables" cubre el caso más pedido (colegio, rutinas de
// lunes a viernes) sin tener que marcar los 5 chips a mano.
export interface RecurrencePreset {
  key: string
  label: string
  freq: string
  byDay: string[]
  interval: number
}

export const RECURRENCE_PRESETS: RecurrencePreset[] = [
  { key: 'none', label: 'Ninguno', freq: '', byDay: [], interval: 1 },
  { key: 'daily', label: 'Todos los días', freq: 'DAILY', byDay: [], interval: 1 },
  { key: 'weekdays', label: 'Todos los días laborables', freq: 'WEEKLY', byDay: ['MO', 'TU', 'WE', 'TH', 'FR'], interval: 1 },
  { key: 'weekly', label: 'Todas las semanas', freq: 'WEEKLY', byDay: [], interval: 1 },
  { key: 'biweekly', label: 'Cada 2 semanas', freq: 'WEEKLY', byDay: [], interval: 2 },
  { key: 'monthly', label: 'Todos los meses', freq: 'MONTHLY', byDay: [], interval: 1 },
  { key: 'yearly', label: 'Todos los años', freq: 'YEARLY', byDay: [], interval: 1 },
]

function sameByDay(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

// Averigua qué preajuste corresponde a una regla ya guardada (para
// dejarlo marcado al editar) — null si no encaja con ninguno (p. ej.
// "martes y jueves" sueltos), y entonces la pantalla cae en el modo
// manual de siempre.
export function matchRecurrencePreset(freq: string, byDay: string[], interval: number): RecurrencePreset | null {
  return RECURRENCE_PRESETS.find((p) => p.freq === freq && p.interval === interval && sameByDay(p.byDay, byDay)) ?? null
}
