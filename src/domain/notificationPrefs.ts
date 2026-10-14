// Ajustes de avisos por persona: zona horaria, resumen diario de tareas y franja de avisos personales de Comunidad (tabla user_notification_prefs, 0260).
// Lógica pura: valores por defecto, validación y lista de zonas horarias.

export interface NotificationPrefs {
  timezone: string
  dailySummaryEnabled: boolean
  dailySummaryTime: string // «HH:MM»
  personalCommunityMode: 'any' | 'window'
  personalWindowStart: string
  personalWindowEnd: string
}

// Quien ya existe empieza en Europe/Madrid, a las 08:00, con el resumen activado.
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  timezone: 'Europe/Madrid',
  dailySummaryEnabled: true,
  dailySummaryTime: '08:00',
  personalCommunityMode: 'any',
  personalWindowStart: '08:00',
  personalWindowEnd: '21:00',
}

// null = el comportamiento de siempre (asignados + administradores) hasta que un administrador elija otro modo.
export type TaskNotifyMode = 'all' | 'assigned' | null

export const TASK_NOTIFY_MODE_OPTIONS: { value: 'all' | 'assigned'; label: string; help: string }[] = [
  { value: 'all', label: 'Todos los miembros activos', help: 'Los avisos de tareas y eventos llegan a todas las cuentas activas de la familia.' },
  {
    value: 'assigned',
    label: 'Solo los miembros asignados',
    help: 'Solo avisan a quien tenga asignada la tarea o el evento. Si lo asignado es un menor sin cuenta, avisan a todos los adultos con cuenta.',
  },
]

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value)
}

export function isValidTimezone(value: string): boolean {
  if (!value) return false
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: value })
    return true
  } catch {
    return false
  }
}

// Zona horaria del dispositivo (para la primera vez que una persona nueva guarda sus ajustes).
export function detectDeviceTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz && isValidTimezone(tz) ? tz : DEFAULT_NOTIFICATION_PREFS.timezone
  } catch {
    return DEFAULT_NOTIFICATION_PREFS.timezone
  }
}

// Zonas que ofrece el selector: todas las del navegador si las conoce; si no, una lista corta de Europa y América.
const FALLBACK_TIMEZONES = [
  'Europe/Madrid',
  'Atlantic/Canary',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Zurich',
  'Europe/Dublin',
  'Europe/Athens',
  'Europe/Warsaw',
  'America/Mexico_City',
  'America/Bogota',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'America/Los_Angeles',
]

export function listTimezones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone')
    if (supported && supported.length > 0) {
      // Las zonas españolas primero, luego el resto por orden alfabético.
      const first = ['Europe/Madrid', 'Atlantic/Canary']
      return [...first.filter((z) => supported.includes(z)), ...supported.filter((z) => !first.includes(z))]
    }
  } catch {
    // Sin soporte: lista corta.
  }
  return FALLBACK_TIMEZONES
}

// «Europe/Madrid (GMT+2)» para que se entienda la diferencia en el selector.
export function timezoneLabel(zone: string, now: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('es-ES', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(now).find((p) => p.type === 'timeZoneName')
    return part ? `${zone.replace(/_/g, ' ')} (${part.value})` : zone.replace(/_/g, ' ')
  } catch {
    return zone
  }
}
