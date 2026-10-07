// Un evento puede tener varios recordatorios, cada uno "X antes" en la
// unidad que se quiera (antes solo había un valor fijo: 10/30 min, 1
// hora o 1 día). Todo se guarda como minutos en la base de datos — las
// unidades solo existen aquí, en la capa de presentación.

export type ReminderUnit = 'minutos' | 'horas' | 'dias' | 'semanas' | 'meses' | 'anos'

// Un recordatorio cuenta hacia atrás desde que EMPIEZA el evento (lo
// normal) o desde que TERMINA — "que me avise media hora antes de
// recogerlo" cuenta desde el final, no desde el principio.
export type ReminderAnchor = 'start' | 'end'

export interface EventReminder {
  minutesBefore: number
  anchor: ReminderAnchor
}

interface UnitInfo {
  unit: ReminderUnit
  perMinutes: number
  singular: string
  plural: string
}

// Mes/año usan una aproximación fija (30 y 365 días) — igual de "exacto"
// que ya era "1 día antes" respecto a duración real de un mes/año, no
// hace falta aritmética de calendario para un recordatorio.
const UNITS: UnitInfo[] = [
  { unit: 'anos', perMinutes: 60 * 24 * 365, singular: 'año', plural: 'años' },
  { unit: 'meses', perMinutes: 60 * 24 * 30, singular: 'mes', plural: 'meses' },
  { unit: 'semanas', perMinutes: 60 * 24 * 7, singular: 'semana', plural: 'semanas' },
  { unit: 'dias', perMinutes: 60 * 24, singular: 'día', plural: 'días' },
  { unit: 'horas', perMinutes: 60, singular: 'hora', plural: 'horas' },
  { unit: 'minutos', perMinutes: 1, singular: 'minuto', plural: 'minutos' },
]

export const REMINDER_UNIT_OPTIONS: { value: ReminderUnit; label: string }[] = UNITS.map((u) => ({
  value: u.unit,
  label: u.plural,
}))

// Atajos habituales para añadir con un toque, sin pasar por "cantidad + unidad".
export const REMINDER_PRESETS = [10, 30, 60, 1440, 10080, 43200, 525600]

export function reminderMinutesFrom(amount: number, unit: ReminderUnit): number {
  const info = UNITS.find((u) => u.unit === unit)!
  return Math.max(1, Math.round(amount * info.perMinutes))
}

// Inverso de reminderMinutesFrom, para volver a mostrar en el editor un recordatorio personalizado ya
// guardado: la unidad más grande que divide exacto (misma idea que reminderLabel), nunca minutos sueltos
// si se puede expresar en algo más natural. Solo para minutos > 0 (0 es "El mismo día", un preset, no un
// personalizado).
export function unitAndAmountFromMinutes(minutesBefore: number): { amount: number; unit: ReminderUnit } {
  for (const u of UNITS) {
    if (minutesBefore % u.perMinutes === 0) return { amount: minutesBefore / u.perMinutes, unit: u.unit }
  }
  return { amount: minutesBefore, unit: 'minutos' }
}

// Un recordatorio lógico es (ancla, minutos). Compara los que ya tiene un evento con los que se quieren
// guardar y devuelve solo lo que cambia de verdad: lo que ya existe conserva su id (no se borra ni se vuelve a
// crear), lo repetido en la base se limpia y lo que se pide y no existe se añade.
export interface StoredReminder extends EventReminder {
  id: string
}

export function planReminderChanges(existing: StoredReminder[], wanted: EventReminder[]): { toInsert: EventReminder[]; deleteIds: string[] } {
  const keyOf = (r: EventReminder) => `${r.anchor}:${r.minutesBefore}`
  const wantedKeys = new Set(wanted.map(keyOf))
  const keptKeys = new Set<string>()
  const deleteIds: string[] = []
  for (const r of existing) {
    const key = keyOf(r)
    if (wantedKeys.has(key) && !keptKeys.has(key)) keptKeys.add(key)
    else deleteIds.push(r.id)
  }
  const inserted = new Set<string>()
  const toInsert: EventReminder[] = []
  for (const r of wanted) {
    const key = keyOf(r)
    if (keptKeys.has(key) || inserted.has(key)) continue
    inserted.add(key)
    toInsert.push({ minutesBefore: r.minutesBefore, anchor: r.anchor })
  }
  return { toInsert, deleteIds }
}

// Etiqueta legible eligiendo la unidad más grande que divide exacto
// (600 -> "10 horas", no "600 minutos"); si no encaja en ninguna, cae a
// minutos sin más. Siempre dice explícitamente si cuenta desde el
// principio o desde el final — con los dos tipos mezclados en el mismo
// evento, dejarlo implícito confundiría.
export function reminderLabel(minutesBefore: number, anchor: ReminderAnchor = 'start'): string {
  // 0 es "en el momento mismo" — nunca "0 años"/"0 minutos", que no dice nada.
  if (minutesBefore === 0) return anchor === 'end' ? 'justo cuando termine' : 'el mismo día'
  const suffix = anchor === 'end' ? 'antes de que termine' : 'antes de que empiece'
  for (const u of UNITS) {
    if (minutesBefore % u.perMinutes === 0) {
      const n = minutesBefore / u.perMinutes
      return `${n} ${n === 1 ? u.singular : u.plural} ${suffix}`
    }
  }
  return `${minutesBefore} min ${suffix}`
}
