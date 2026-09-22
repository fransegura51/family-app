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

// El texto de las tarjetas/etiquetas de evento siempre era blanco, fijo
// en el CSS — con un color de fondo claro (amarillo, verde pastel...)
// quedaba casi ilegible (bug real reportado). Un umbral fijo de
// luminosidad se quedaba corto para tonos intermedios (verde menta,
// lila claro, etc.), así que en vez de un corte único se calcula el
// contraste real (fórmula WCAG) contra negro y contra blanco, y se usa
// el que más resalte sobre ese color exacto.
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (channel: number) => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function readableTextColor(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return '#ffffff'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  const luminance = relativeLuminance(r, g, b)
  const contrastWithBlack = (luminance + 0.05) / 0.05
  const contrastWithWhite = 1.05 / (luminance + 0.05)
  return contrastWithBlack >= contrastWithWhite ? '#000000' : '#ffffff'
}

// Reposiciona la hora de un evento (posiblemente recurrente) sobre el
// DÍA de una ocurrencia concreta — para "Compartir" un evento semanal,
// por ejemplo, se manda la fecha del día que se está viendo, no la
// fecha original de creación de la serie. Mismo criterio que ya usa
// export-calendar-ics en el servidor.
export function occurrenceAt(
  event: { startAt: string; endAt: string | null; allDay: boolean },
  occurrenceDateStr: string,
): { startAt: string; endAt: string | null } {
  if (event.allDay) {
    return { startAt: new Date(occurrenceDateStr + 'T00:00').toISOString(), endAt: null }
  }
  const originalStart = new Date(event.startAt)
  const originalEnd = event.endAt ? new Date(event.endAt) : null
  const durationMs = originalEnd ? originalEnd.getTime() - originalStart.getTime() : 60 * 60 * 1000
  const occStart = new Date(occurrenceDateStr + 'T00:00')
  occStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds())
  const occEnd = new Date(occStart.getTime() + durationMs)
  return { startAt: occStart.toISOString(), endAt: occEnd.toISOString() }
}

// ── Posibles duplicados / conflictos horarios al crear un evento por voz ──
// (solo "Hablar con PEPA" de momento). Determinista, sin IA: primero tiene
// que coincidir la estructura (misma ocurrencia + misma hora de inicio +
// mismos destinatarios exactos) — el título SOLO desempata dentro de eso,
// nunca decide por sí solo (evita falsos positivos tipo "Dentista" /
// "Dentista Eric", que no comparten ni hora ni destinatarios exactos por
// definición si además de eso tuvieran que coincidir).

const TITLE_SAFE_ARTICLES = new Set(['el', 'la', 'los', 'las', 'un', 'una'])
// Distancia de edición MUY corta a propósito: solo para variaciones
// mínimas de dictado ("Sacar basura" / "Saca basura", caso real
// reportado, distancia 1) — nunca para títulos que simplemente se
// parecen ("Dentista" / "Dentista Eric" está a distancia 5, no cuela).
const TITLE_MAX_EDIT_DISTANCE = 2

// Minúsculas, sin acentos, sin puntuación, sin artículos sueltos ("la",
// "el"...) en cualquier posición — quitarlos es seguro porque nunca
// cambian DE QUÉ trata el título ("sacar la basura" es lo mismo que
// "sacar basura"), a diferencia de quitar cualquier otra palabra.
export function normalizeEventTitleForCompare(title: string): string {
  const stripped = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,;:!¡?¿]/g, '')
  return stripped
    .split(/\s+/)
    .filter((w) => w.length > 0 && !TITLE_SAFE_ARTICLES.has(w))
    .join(' ')
}

// Distancia de edición clásica (Levenshtein) — copia local pequeña y sin
// dependencias, igual criterio que ya usa matchMemberByHint en
// domain/voiceQuery.ts para nombres dictados, pero aquí con un umbral
// mucho más corto (ver TITLE_MAX_EDIT_DISTANCE).
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

// Se llama SOLO después de que fecha/hora/destinatarios ya coinciden —
// el título nunca decide un duplicado por sí solo.
export function titlesLikelyDuplicate(a: string, b: string): boolean {
  const na = normalizeEventTitleForCompare(a)
  const nb = normalizeEventTitleForCompare(b)
  if (na === nb) return true
  if (Math.abs(na.length - nb.length) > TITLE_MAX_EDIT_DISTANCE) return false
  return editDistance(na, nb) <= TITLE_MAX_EDIT_DISTANCE
}

// Para DUPLICADOS: mismos destinatarios EXACTOS ("Toda la familia" contra
// "Toda la familia", o el mismo miembro contra sí mismo) — [] = toda la
// familia, no es un valor especial, es la ausencia de miembros concretos.
export function memberSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

// Para CONFLICTOS: basta con que los conjuntos se CRUCEN. "Toda la
// familia" ([]) se trata como "incluye a cualquiera", así que: toda la
// familia-toda la familia cruzan, toda la familia-Paco cruzan, Paco-Paco
// cruzan, Eric-Paco NO cruzan.
export function memberSetsMayCoincide(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true
  return a.some((id) => b.includes(id))
}

// Solapamiento real de intervalos semiabiertos [start, end) — 19:00–20:00
// contra 20:00–21:00 NO solapan; 19:00–20:00 contra 19:30–20:30 sí.
export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime()
}

// Forma mínima de un evento ya existente que hace falta para comprobar
// duplicados/conflictos — cualquier CalendarEvent real encaja aquí sin
// conversión (estructural, no se importa el tipo para no acoplar este
// archivo, que a propósito no depende de nada más, a domain/types).
export interface ScheduleEvent {
  id: string
  title: string
  startAt: string
  endAt: string | null
  allDay: boolean
  recurrenceRule: string | null
  exceptionDates?: string[]
  memberIds: string[]
}

// El evento que se está a punto de crear, todavía sin guardar.
export interface ScheduleCandidate {
  title: string
  date: string // YYYY-MM-DD
  time: string | null // HH:mm; null = todo el día
  endTime: string | null // HH:mm
  memberIds: string[]
}

export type ScheduleWarning = { kind: 'duplicate' | 'conflict'; event: ScheduleEvent }

// Busca posibles duplicados/conflictos entre `candidate` y los eventos ya
// existentes de la familia — determinista, sin IA. Solo mira la fecha del
// candidato: para eventos recurrentes existentes expande ÚNICAMENTE esa
// fecha (expandOccurrences con rango de un solo día, nunca meses/años) y
// reposiciona su hora con occurrenceAt, respetando exception_dates.
//
// "Todo el día" NUNCA entra en conflicto automático con un evento con
// hora (dos cosas muy distintas: "Vacaciones" todo el día y "Dentista" a
// las 17:00 no tienen por qué chocar) — solo se avisa de un posible
// DUPLICADO cuando los dos son de todo el día.
export function findScheduleWarnings(candidate: ScheduleCandidate, existingEvents: ScheduleEvent[]): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = []
  const candidateAllDay = candidate.time === null
  const candidateStartAt = candidate.time ? new Date(`${candidate.date}T${candidate.time}`).toISOString() : null
  const candidateEndAt = candidateStartAt
    ? candidate.endTime
      ? new Date(`${candidate.date}T${candidate.endTime}`).toISOString()
      : new Date(new Date(candidateStartAt).getTime() + 60 * 60 * 1000).toISOString() // misma convención que occurrenceAt: sin hora de fin, 1h
    : null

  for (const existing of existingEvents) {
    if (expandOccurrences(existing, candidate.date, candidate.date).length === 0) continue
    const sameRecipients = memberSetsEqual(candidate.memberIds, existing.memberIds)

    if (candidateAllDay || existing.allDay) {
      if (candidateAllDay && existing.allDay && sameRecipients && titlesLikelyDuplicate(candidate.title, existing.title)) {
        warnings.push({ kind: 'duplicate', event: existing })
      }
      continue
    }

    const occ = occurrenceAt(existing, candidate.date)
    if (!candidateStartAt || !candidateEndAt || !occ.endAt) continue // aquí ninguno es allDay: nunca debería faltar

    if (occ.startAt === candidateStartAt && sameRecipients && titlesLikelyDuplicate(candidate.title, existing.title)) {
      warnings.push({ kind: 'duplicate', event: existing })
      continue // el mismo evento existente no cuenta también como conflicto aparte
    }
    if (memberSetsMayCoincide(candidate.memberIds, existing.memberIds) && intervalsOverlap(candidateStartAt, candidateEndAt, occ.startAt, occ.endAt)) {
      warnings.push({ kind: 'conflict', event: existing })
    }
  }
  return warnings
}

// Petición real: "en todo el calendario los fines de semana
// diferenciarlos con un color" — a partir del propio dateStr (no de la
// posición en la rejilla), para que valga igual en Mes, Semana, 3 días
// y Día sin depender de en qué columna caiga.
export function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00`).getDay()
  return day === 0 || day === 6
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
