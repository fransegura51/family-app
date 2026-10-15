// Enlace profundo a Calendario (INC-14): lógica pura que lee y construye las direcciones que usan los avisos.
//
//   /calendario?evento=<uuid>&fecha=AAAA-MM-DD   → abre ese día y marca ese evento o tarea (la ocurrencia concreta si es una serie)
//   /calendario?fecha=AAAA-MM-DD&tareas=1        → abre ese día y baja al bloque «Tareas» (resumen diario)
//
// Los avisos los genera el servidor (recordatorios, asignación de tareas, resumen diario), pero la dirección puede llegar manipulada: el uuid y la fecha se
// validan aquí antes de usarse y cualquier otra cosa se ignora. Nunca se usa texto de la dirección como HTML ni como consulta.
import { isUuid } from './notificationDeepLink'

// Parámetros que consume Calendario (y quita de la dirección una vez usados).
export const CALENDAR_LINK_PARAMS = ['evento', 'fecha', 'tareas']

export interface CalendarDeepLink {
  // uuid válido del evento o tarea, o null.
  eventId: string | null
  // Fecha válida AAAA-MM-DD, o null.
  date: string | null
  // true = bajar al bloque de tareas del día (resumen diario).
  focusTasks: boolean
  // true = la dirección traía «evento» pero no era un uuid: se avisa con amabilidad en vez de ignorarlo en silencio.
  invalidEvent: boolean
}

// Una fecha real AAAA-MM-DD (rechaza 2026-02-30, 2026-13-01, textos…). Años razonables para no dar vueltas con valores absurdos.
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (y < 2000 || y > 2100) return false
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// null = la dirección no trae nada de esto (Calendario se abre como siempre).
export function parseCalendarDeepLink(search: string): CalendarDeepLink | null {
  const params = new URLSearchParams(search)
  const rawEvent = params.get('evento')
  const rawDate = params.get('fecha')
  const rawTasks = params.get('tareas')
  if (rawEvent === null && rawDate === null && rawTasks === null) return null
  return {
    eventId: isUuid(rawEvent) ? rawEvent.toLowerCase() : null,
    date: isIsoDate(rawDate) ? rawDate : null,
    focusTasks: rawTasks === '1',
    invalidEvent: rawEvent !== null && !isUuid(rawEvent),
  }
}

// Direcciones que generan los avisos (las mismas que escriben el servidor: migraciones 0261/0262 y la función send-due-reminders). null si los datos no valen.
export function calendarEventLink(eventId: string, date: string): string | null {
  if (!isUuid(eventId) || !isIsoDate(date)) return null
  return `/calendario?evento=${eventId.toLowerCase()}&fecha=${date}`
}

export function calendarTasksLink(date: string): string | null {
  return isIsoDate(date) ? `/calendario?fecha=${date}&tareas=1` : null
}

// De las fechas en las que ocurre un evento, la que toca abrir: la pedida si existe; si no, la primera posterior; si no hay ninguna posterior, la última anterior.
// (Una tarea repetitiva asignada hace tiempo apunta a «hoy» y se abre en su próxima ocurrencia.) null si no hay ninguna.
export function pickOccurrenceDate(occurrences: string[], wanted: string): string | null {
  if (occurrences.length === 0) return null
  const sorted = [...occurrences].sort()
  const onOrAfter = sorted.find((d) => d >= wanted)
  return onOrAfter ?? sorted[sorted.length - 1]
}

// Suma días a una fecha AAAA-MM-DD (en UTC, sin husos ni cambios de hora de por medio).
export function addDaysIso(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}
