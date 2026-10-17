// Ajustes de avisos por persona: zona horaria, avisos de tareas (hoy y atrasadas, 0283) y franja de avisos personales de Comunidad (tabla user_notification_prefs, 0260).
// Lógica pura: valores por defecto, validación y lista de zonas horarias.

export interface NotificationPrefs {
  timezone: string
  // Avisos de tareas (0283): dos resúmenes diarios independientes, cada uno con su interruptor y su hora «HH:MM» (24 h, en la zona horaria de la persona).
  taskTodayEnabled: boolean
  taskTodayTime: string
  taskOverdueEnabled: boolean
  taskOverdueTime: string
  personalCommunityMode: 'any' | 'window'
  personalWindowStart: string
  personalWindowEnd: string
  // Sugerencias de Comunidad («Para ti en Comunidad»): activadas por defecto, una cada N horas (solo salen entre 08:00 y 21:00 de la zona de la persona).
  communitySuggestionsEnabled: boolean
  communitySuggestionEveryHours: number
}

// Límites que también impone la base de datos (check 6-720) y valor por defecto (≈ una cada 48 h, COM-144).
export const COMMUNITY_SUGGESTION_MIN_HOURS = 6
export const COMMUNITY_SUGGESTION_MAX_HOURS = 720
export const COMMUNITY_SUGGESTION_DEFAULT_HOURS = 48

// Quien no ha guardado nada empieza en Europe/Madrid con los dos avisos de tareas activados: las de hoy a las 08:00 y las atrasadas a las 09:00 (los mismos valores por
// defecto que usa el servidor; quien ya había elegido hora para el resumen único conserva su elección para «hoy», ver 0283).
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  timezone: 'Europe/Madrid',
  taskTodayEnabled: true,
  taskTodayTime: '08:00',
  taskOverdueEnabled: false,
  taskOverdueTime: '09:00',
  personalCommunityMode: 'any',
  personalWindowStart: '08:00',
  personalWindowEnd: '21:00',
  communitySuggestionsEnabled: true,
  communitySuggestionEveryHours: COMMUNITY_SUGGESTION_DEFAULT_HOURS,
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
