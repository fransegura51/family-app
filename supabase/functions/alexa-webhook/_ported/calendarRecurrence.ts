// Copia fiel de expandOccurrences/parseRecurrenceRule — EXACTAMENTE la misma copia ya probada y
// desplegada en supabase/functions/export-calendar-ics/index.ts (Deno no puede importar código del
// frontend). Se repite aquí en vez de importar entre funciones porque cada Edge Function se
// despliega como un paquete aparte.

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const BYDAY_TO_JS_DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function parseRecurrenceRule(rule: string) {
  const parts = Object.fromEntries(rule.split(';').map((p) => p.split('=') as [string, string]))
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

export function expandOccurrences(
  event: { startAt: string; recurrenceRule: string | null; exceptionDates: string[] },
  rangeStartStr: string,
  rangeEndStr: string,
  holidayDates: Set<string> = new Set(),
): string[] {
  const startDate = toDateStr(new Date(event.startAt))
  if (!event.recurrenceRule) {
    return startDate >= rangeStartStr && startDate <= rangeEndStr ? [startDate] : []
  }

  const rangeStart = new Date(rangeStartStr + 'T00:00')
  const rangeEnd = new Date(rangeEndStr + 'T00:00')
  const cursor = new Date(startDate + 'T00:00')
  const results: string[] = []
  const { freq, byDay, skipHolidays, until, interval } = parseRecurrenceRule(event.recurrenceRule)

  let guard = 0
  if (freq === 'WEEKLY' && byDay.length > 0) {
    const dayCursor = new Date(rangeStart < cursor ? cursor : rangeStart)
    while (dayCursor <= rangeEnd && guard < 5000) {
      const dateStr = toDateStr(dayCursor)
      if (dateStr >= startDate && byDay.includes(dayCursor.getDay())) results.push(dateStr)
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

  return results.filter((d) => {
    if (until && d > until) return false
    if (skipHolidays && holidayDates.has(d)) return false
    if (event.exceptionDates.includes(d)) return false
    return true
  })
}
