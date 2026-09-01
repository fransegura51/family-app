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

// Ocurrencias de un evento dentro de un rango [rangeStartStr, rangeEndStr]
// (YYYY-MM-DD, ambos incluidos). Sin recurrencia, solo su propia fecha si
// cae en el rango. Con recurrencia simple diaria/semanal/mensual, expande
// las repeticiones — necesario para que un evento semanal aparezca en
// más de un día de la cuadrícula del mes.
export function expandOccurrences(
  event: { startAt: string; recurrenceRule: string | null },
  rangeStartStr: string,
  rangeEndStr: string,
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
  const stepDays = event.recurrenceRule === 'FREQ=DAILY' ? 1 : event.recurrenceRule === 'FREQ=WEEKLY' ? 7 : null

  // Límite de seguridad: nunca iterar más de ~10 años de ocurrencias.
  let guard = 0
  if (stepDays) {
    while (cursor < rangeStart && guard < 5000) {
      cursor.setDate(cursor.getDate() + stepDays)
      guard++
    }
    while (cursor <= rangeEnd && guard < 5000) {
      results.push(toDateStr(cursor))
      cursor.setDate(cursor.getDate() + stepDays)
      guard++
    }
  } else if (event.recurrenceRule === 'FREQ=MONTHLY') {
    while (cursor < rangeStart && guard < 500) {
      cursor.setMonth(cursor.getMonth() + 1)
      guard++
    }
    while (cursor <= rangeEnd && guard < 500) {
      results.push(toDateStr(cursor))
      cursor.setMonth(cursor.getMonth() + 1)
      guard++
    }
  }
  return results
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
