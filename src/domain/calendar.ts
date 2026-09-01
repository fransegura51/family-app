// Generación de la cuadrícula de un mes (lunes-domingo, semanas
// completas incluyendo días del mes anterior/siguiente para rellenar).
// Sin dependencias de framework — solo fechas.

export interface MonthDay {
  dateStr: string // YYYY-MM-DD
  day: number
  inMonth: boolean
  isToday: boolean
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getMonthGridDays(year: number, month: number): MonthDay[] {
  const todayStr = toDateStr(new Date())
  const firstOfMonth = new Date(year, month, 1)
  // getDay(): 0=domingo..6=sábado. Queremos que la semana empiece en lunes.
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - firstWeekday)

  const days: MonthDay[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    const dateStr = toDateStr(d)
    days.push({
      dateStr,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      isToday: dateStr === todayStr,
    })
  }
  return days
}

// Códigos de día RFC 5545 (BYDAY) — MO=lunes..SU=domingo — mapeados al
// valor de Date.getDay() (0=domingo..6=sábado) para poder comparar.
const BYDAY_TO_JS_DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function parseRecurrenceRule(
  rule: string,
): { freq: string; byDay: number[]; skipHolidays: boolean; until: string | null; interval: number } {
  const parts = Object.fromEntries(
    rule.split(';').map((p) => p.split('=') as [string, string]),
  )
  const byDay = (parts.BYDAY ?? '')
    .split(',')
    .map((code) => BYDAY_TO_JS_DAY[code])
    .filter((n): n is number => n !== undefined)
  const interval = Number(parts.INTERVAL)
  return {
    freq: parts.FREQ ?? '',
    byDay,
    skipHolidays: parts.SKIPHOLIDAYS === '1',
    until: parts.UNTIL ?? null,
    interval: Number.isFinite(interval) && interval > 1 ? interval : 1,
  }
}

// Ocurrencias de un evento/tarea dentro de un rango [rangeStartStr, rangeEndStr]
// (YYYY-MM-DD, ambos incluidos). Sin recurrencia, solo su propia fecha si
// cae en el rango. Con recurrencia diaria/semanal/mensual/anual, expande
// las repeticiones — necesario para que algo semanal aparezca en más de
// un día de la cuadrícula del mes. FREQ=WEEKLY admite BYDAY (p. ej.
// "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" para "de lunes a viernes"); sin
// BYDAY cae cada 7 días desde la fecha de inicio, como antes.
export function expandOccurrences(
  event: { startAt: string; recurrenceRule: string | null; exceptionDates?: string[] },
  rangeStartStr: string,
  rangeEndStr: string,
  holidayDates?: Set<string>,
): string[] {
  // OJO: nunca event.startAt.slice(0, 10) — startAt es un ISO en UTC, y
  // recortarlo así desplaza un día cuando la hora local cae en las
  // primeras horas (bug real detectado probando la cuadrícula: un evento
  // guardado a medianoche local aparecía el día anterior). Hay que pasar
  // por Date y leer los componentes en hora LOCAL, igual que en
  // EditEventForm/ReminderWatcher.
  const startDate = toDateStr(new Date(event.startAt))

  if (!event.recurrenceRule) {
    return startDate >= rangeStartStr && startDate <= rangeEndStr ? [startDate] : []
  }

  const rangeStart = new Date(rangeStartStr + 'T00:00')
  const rangeEnd = new Date(rangeEndStr + 'T00:00')
  const cursor = new Date(startDate + 'T00:00')
  const results: string[] = []
  const { freq, byDay, skipHolidays, until, interval } = parseRecurrenceRule(event.recurrenceRule)

  // Límite de seguridad: nunca iterar más de ~10 años de ocurrencias.
  let guard = 0
  if (freq === 'WEEKLY' && byDay.length > 0) {
    // No cae cada 7 días desde el inicio, sino en cada día de la semana
    // marcado (p. ej. "de lunes a viernes") a partir de la fecha de
    // inicio — hay que recorrer día a día, no de 7 en 7. INTERVAL no se
    // aplica aquí: los preajustes no combinan "días laborables" con
    // "cada N semanas".
    const dayCursor = new Date(rangeStart < cursor ? cursor : rangeStart)
    while (dayCursor <= rangeEnd && guard < 5000) {
      const dateStr = toDateStr(dayCursor)
      if (dateStr >= startDate && byDay.includes(dayCursor.getDay())) {
        results.push(dateStr)
      }
      dayCursor.setDate(dayCursor.getDate() + 1)
      guard++
    }
  } else if (freq === 'DAILY' || freq === 'WEEKLY') {
    const stepDays = (freq === 'DAILY' ? 1 : 7) * interval
    while (cursor < rangeStart && guard < 5000) {
      cursor.setDate(cursor.getDate() + stepDays)
      guard++
    }
    while (cursor <= rangeEnd && guard < 5000) {
      results.push(toDateStr(cursor))
      cursor.setDate(cursor.getDate() + stepDays)
      guard++
    }
  } else if (freq === 'MONTHLY') {
    while (cursor < rangeStart && guard < 500) {
      cursor.setMonth(cursor.getMonth() + interval)
      guard++
    }
    while (cursor <= rangeEnd && guard < 500) {
      results.push(toDateStr(cursor))
      cursor.setMonth(cursor.getMonth() + interval)
      guard++
    }
  } else if (freq === 'YEARLY') {
    while (cursor < rangeStart && guard < 200) {
      cursor.setFullYear(cursor.getFullYear() + interval)
      guard++
    }
    while (cursor <= rangeEnd && guard < 200) {
      results.push(toDateStr(cursor))
      cursor.setFullYear(cursor.getFullYear() + interval)
      guard++
    }
  }

  // "Excepto festivos" (contra el calendario de festivos enlazado, si lo
  // hay) y "borrar solo este día" (excepciones propias del evento) son
  // dos motivos de exclusión distintos, pero se aplican igual: quitar
  // esa fecha de las ocurrencias generadas.
  const exceptionDates = event.exceptionDates
  return results.filter((d) => {
    if (until && d > until) return false
    if (skipHolidays && holidayDates?.has(d)) return false
    if (exceptionDates?.includes(d)) return false
    return true
  })
}

// Colores a mostrar como puntitos en la cuadrícula del mes para un
// evento — uno POR CADA miembro asignado (un evento con varios miembros
// se ve con el color de cada uno, no solo del primero, bug real
// detectado probando: un evento de Jennifer y Eric solo pintaba el
// color de Jennifer). Si el evento tiene un color propio explícito, ese
// manda; si no tiene miembros ni color, cae en gris.
export function eventDotColors(
  event: { color: string | null; memberIds: string[] },
  memberColorById: Map<string, string>,
): string[] {
  if (event.color) return [event.color]
  if (event.memberIds.length > 0) {
    return event.memberIds.map((id) => memberColorById.get(id)).filter((c): c is string => !!c)
  }
  return ['#9ca3af']
}

export const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]
