// Un evento puede tener varios recordatorios, cada uno "X antes" en la
// unidad que se quiera (antes solo había un valor fijo: 10/30 min, 1
// hora o 1 día). Todo se guarda como minutos en la base de datos — las
// unidades solo existen aquí, en la capa de presentación.

export type ReminderUnit = 'minutos' | 'horas' | 'dias' | 'semanas' | 'meses' | 'anos'

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

// Etiqueta legible eligiendo la unidad más grande que divide exacto
// (600 -> "10 horas", no "600 minutos"); si no encaja en ninguna, cae a
// minutos sin más.
export function reminderLabel(minutesBefore: number): string {
  for (const u of UNITS) {
    if (minutesBefore % u.perMinutes === 0) {
      const n = minutesBefore / u.perMinutes
      return `${n} ${n === 1 ? u.singular : u.plural} antes`
    }
  }
  return `${minutesBefore} min antes`
}
