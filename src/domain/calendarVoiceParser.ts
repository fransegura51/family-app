// Entiende una frase de calendario dictada o escrita — "el 3 de
// septiembre, cita con el dentista a las 19 horas para Eric, aviso un
// día antes" — sin ningún servicio de IA: solo patrones de fecha/hora en
// español. Es deliberadamente simple (no intenta entender cualquier
// frase libre) y siempre devuelve la fecha/hora que ha entendido para
// que la app la enseñe antes de guardar — si se equivoca, se nota al
// momento en vez de crear una cita en el día que no es.
import { normalize } from '@/domain/voiceQuery'
import { reminderMinutesFrom, type ReminderAnchor, type ReminderUnit } from '@/domain/reminders'

const WEEKDAY_NAME_TO_CODE: Record<string, string> = {
  lunes: 'MO',
  martes: 'TU',
  miercoles: 'WE',
  jueves: 'TH',
  viernes: 'FR',
  sabado: 'SA',
  domingo: 'SU',
}
const WEEKDAY_NAMES_PATTERN = Object.keys(WEEKDAY_NAME_TO_CODE).join('|')

// Formas en singular/plural (ya sin acentos, tras normalize) que puede
// decir alguien para cada unidad de recordatorio.
const UNIT_WORD_TO_UNIT: Record<string, ReminderUnit> = {
  minuto: 'minutos',
  minutos: 'minutos',
  hora: 'horas',
  horas: 'horas',
  dia: 'dias',
  dias: 'dias',
  semana: 'semanas',
  semanas: 'semanas',
  mes: 'meses',
  meses: 'meses',
  ano: 'anos',
  anos: 'anos',
}

const NUMBER_WORDS: Record<string, number> = {
  cero: 0,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// Del 21 al 29 (y del 16 al 19, más raro pero igual de válido), un
// número se puede decir pegado ("veintiséis") o separado ("veinte y
// seis") — las dos formas son igual de naturales al hablar, y el
// dictado del móvil no siempre elige la misma (bug real: "el
// veintiséis de septiembre" dictado como "veinte y seis" no
// coincidía con nada de NUMBER_WORDS, la fecha se perdía en silencio y
// la cita se apuntaba en la fecha por defecto — HOY — en vez del día
// que de verdad se dijo). Se genera aparte, combinando la decena con
// cada unidad, en vez de tener que acordarse de añadir cada forma
// suelta a mano.
const UNIT_WORDS: Record<string, number> = {
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
}
const TEN_BASES: Record<string, number> = { diez: 10, veinte: 20 }
const COMPOUND_NUMBER_PATTERN = `(?:${Object.keys(TEN_BASES).join('|')})\\s+y\\s+(?:${Object.keys(UNIT_WORDS).join('|')})`

// Un número en la frase puede ser un dígito ("3") o una palabra
// ("tres" / "treinta y uno" / "veinte y seis"); junta todas las formas
// en un solo patrón.
const NUMBER_PATTERN = `(\\d{1,2}|treinta y uno|${COMPOUND_NUMBER_PATTERN}|${Object.keys(NUMBER_WORDS).join('|')})`

function wordToNumber(word: string): number {
  if (/^\d+$/.test(word)) return Number(word)
  if (word === 'treinta y uno') return 31
  const compound = word.match(/^(diez|veinte)\s+y\s+(\w+)$/)
  if (compound) {
    const unit = UNIT_WORDS[compound[2]]
    if (unit !== undefined) return TEN_BASES[compound[1]] + unit
  }
  return NUMBER_WORDS[word] ?? NaN
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Interpreta un match de hora ("19", "7" + "de la tarde", "7:30", "y
// media") y consume del texto tanto la hora como el "de la tarde/noche"
// que la siga, esté donde esté (no solo al principio del texto — bug
// real: con cualquier cosa delante de la hora, "de la tarde" se quedaba
// colgando en el título).
function extractHour(
  remaining: string,
  match: RegExpMatchArray,
): { time: string | null; remaining: string } {
  let hour = wordToNumber(match[1])
  const minutes = match[2] ? Number(match[2]) : /y\s*media/.test(match[0]) ? 30 : 0
  const afterMatch = remaining.slice((match.index ?? 0) + match[0].length)
  const dayPartMatch = afterMatch.match(/^\s*de la (tarde|noche|manana)\b/)
  let time: string | null = null
  if (!Number.isNaN(hour)) {
    if (hour < 12 && dayPartMatch && dayPartMatch[1] !== 'manana') hour += 12
    if (hour >= 0 && hour <= 23) time = `${pad2(hour)}:${pad2(minutes)}`
  }
  const fullSpan = match[0] + (dayPartMatch ? dayPartMatch[0] : '')
  return { time, remaining: remaining.replace(fullSpan, ' ') }
}

export interface ParsedCalendarEntry {
  title: string
  date: string // YYYY-MM-DD
  time: string | null // HH:mm, hora de inicio
  endTime: string | null // HH:mm, hora de fin (opcional)
  memberHint: string | null
  reminders: { minutesBefore: number; anchor: ReminderAnchor }[]
  dateExplicit: boolean // true si la frase decía una fecha; false si "date" es solo el valor por defecto
  recurrenceRule: string | null // "FREQ=WEEKLY;BYDAY=TU" si se dijo "todos los martes" (o varios días)
}

// `today` se pasa desde fuera (en vez de usar `new Date()` aquí) para que
// esta función siga siendo pura y fácil de testear con una fecha fija.
export function parseCalendarEntry(text: string, today: Date): ParsedCalendarEntry {
  const n = normalize(text)
  let remaining = n

  // "el día 27...", "el 27...", "día 27..." — las tres formas son
  // igual de naturales al hablar (bug real: "día 27 de..." sin "el"
  // delante dejaba "dia" suelto en el título).
  let date = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
  const dateRe = new RegExp(`\\b(?:el d[ií]a |el |d[ií]a )?${NUMBER_PATTERN} de (${MONTHS.join('|')})\\b`)
  const dateMatch = remaining.match(dateRe)
  if (dateMatch) {
    const day = wordToNumber(dateMatch[1])
    const monthIndex = MONTHS.indexOf(dateMatch[2])
    if (!Number.isNaN(day) && day >= 1 && day <= 31 && monthIndex >= 0) {
      let year = today.getFullYear()
      // Si esa fecha ya pasó este año, se asume que es el año que viene
      // (igual que con los cumpleaños) — decir "el 3 de enero" en
      // diciembre casi seguro se refiere al enero próximo.
      let candidate = new Date(year, monthIndex, day)
      if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
        year += 1
        candidate = new Date(year, monthIndex, day)
      }
      // El constructor de 3 argumentos "desborda" solo un día que no
      // existe (p. ej. "31 de abril" -> 1 de mayo) en vez de dejarlo
      // inválido — hay que leer el día/mes/año YA normalizados de vuelta
      // del objeto Date, no los que dijo la frase, o la fecha construida
      // a mano podía no existir de verdad y reventar más adelante al
      // convertirla a ISO (bug real: un día que no existe en ese mes
      // hacía fallar todo el apunte con un error genérico).
      date = `${candidate.getFullYear()}-${pad2(candidate.getMonth() + 1)}-${pad2(candidate.getDate())}`
    }
    remaining = remaining.replace(dateMatch[0], ' ')
  }
  const dateExplicit = !!dateMatch

  // "todos los martes", "cada martes y jueves", "todas las semanas el
  // viernes" — repite en los días de la semana indicados. La fecha
  // (de hoy o del día que tengas abierto) se usa como ancla desde la
  // que empieza a repetirse, igual que ya hace "cada semana" a mano.
  let recurrenceRule: string | null = null
  const recurrenceRe = new RegExp(
    `\\b(?:todos los|todas las semanas el|cada)\\s+(${WEEKDAY_NAMES_PATTERN})((?:\\s*(?:,|y)\\s*(?:${WEEKDAY_NAMES_PATTERN}))*)`,
  )
  const recurrenceMatch = remaining.match(recurrenceRe)
  if (recurrenceMatch) {
    const dayNames = recurrenceMatch[0].match(new RegExp(WEEKDAY_NAMES_PATTERN, 'g')) ?? []
    const codes = [...new Set(dayNames.map((d) => WEEKDAY_NAME_TO_CODE[d]))]
    if (codes.length > 0) recurrenceRule = `FREQ=WEEKLY;BYDAY=${codes.join(',')}`
    remaining = remaining.replace(recurrenceMatch[0], ' ')
  }

  let memberHint: string | null = null
  const memberMatch = remaining.match(/\bpara (\w+)\b/)
  if (memberMatch) {
    memberHint = memberMatch[1]
    remaining = remaining.replace(memberMatch[0], ' ')
  }

  // La hora de FIN se saca antes que la de inicio y con un ancla propia
  // ("termina"/"hasta") para no confundirla con la hora de inicio ni con
  // la del recordatorio — "entrenamiento fútbol a las 18 horas, termina
  // a las 19 horas".
  let endTime: string | null = null
  const endTimeRe = new RegExp(
    `,?\\s*\\b(?:termina|hasta)(?:\\s+(?:a\\s+)?las)?\\s+${NUMBER_PATTERN}(?::(\\d{2})|\\s*y\\s*media)?\\s*horas?\\b`,
  )
  const endTimeMatch = remaining.match(endTimeRe)
  if (endTimeMatch) {
    const result = extractHour(remaining, endTimeMatch)
    endTime = result.time
    remaining = result.remaining
  }

  // El recordatorio se saca ANTES que la hora de inicio a propósito:
  // "aviso una hora antes" tiene la misma forma que una hora del día
  // ("N horas"), así que si se buscara la hora primero, esa frase de
  // recordatorio se colaba como si fuera la hora de la cita (bug real:
  // "a las 7 de la tarde ... aviso una hora antes" ponía la cita a la
  // 1:00, no a las 19:00). Puede haber más de un recordatorio en la
  // misma frase ("avisa una hora antes de que empiece y media hora
  // antes de que termine"), y cada uno puede anclarse al principio o al
  // final del evento — "recuérdame para recogerlo" cuenta desde que
  // termina, no desde que empieza.
  // "media hora antes" (0,5) es tan natural como "una hora antes" — sin
  // esto, "media" no encajaba en ningún número reconocido y la frase
  // entera de recordatorio se quedaba sin capturar.
  const reminderRe =
    /,?\s*(?:aviso|avisame|avisa)?\s*(?:(\d+)|(un|una|media|medio))?\s*(minutos?|horas?|dias?|semanas?|meses?|anos?)\s*antes(?:\s+de\s+(?:que\s+)?(empiece|empezar|termine|terminar|acabe|acabar))?\b/g
  const reminderMatches = [...remaining.matchAll(reminderRe)]
  const reminders: { minutesBefore: number; anchor: ReminderAnchor }[] = []
  for (const m of reminderMatches) {
    const amount = m[1] ? Number(m[1]) : m[2] === 'media' || m[2] === 'medio' ? 0.5 : 1
    const unit = UNIT_WORD_TO_UNIT[m[3]]
    if (!unit) continue
    const anchor: ReminderAnchor = m[4] && /^(termine|terminar|acabe|acabar)$/.test(m[4]) ? 'end' : 'start'
    reminders.push({ minutesBefore: reminderMinutesFrom(amount, unit), anchor })
  }
  if (reminders.length === 0) reminders.push({ minutesBefore: 60, anchor: 'start' })
  remaining = remaining.replace(reminderRe, ' ')

  // "a las" es opcional — en habla natural es muy normal decir solo
  // "diecinueve horas" o "19 horas" sin el "a las" delante (bug real:
  // esa frase exacta no apuntaba ninguna hora). Se intenta primero con
  // "horas" como ancla (con o sin "a las" delante) y, si no hay "horas",
  // con "a las N" a secas (p. ej. "a las 7 de la tarde"). Para cuando el
  // texto tiene ambas formas sueltas se queda con la que aparece antes
  // en la frase.
  let time: string | null = null
  const timeWithHorasRe = new RegExp(
    `,?\\s*\\b(?:a las\\s+)?${NUMBER_PATTERN}(?::(\\d{2})|\\s*y\\s*media)?\\s*horas?\\b`,
  )
  const timeWithALasRe = new RegExp(`,?\\s*\\ba las\\s+${NUMBER_PATTERN}(?::(\\d{2})|\\s*y\\s*media)?\\b`)
  const matchHoras = remaining.match(timeWithHorasRe)
  const matchALas = remaining.match(timeWithALasRe)
  const timeMatch =
    !matchHoras ? matchALas : !matchALas ? matchHoras : (matchHoras.index ?? 0) <= (matchALas.index ?? 0) ? matchHoras : matchALas
  if (timeMatch) {
    const result = extractHour(remaining, timeMatch)
    time = result.time
    remaining = result.remaining
  }

  // "Pepa, ponme en el calendario que tengo el cumpleaños de mi mujer" —
  // ahora que se puede hablar con Pepa desde cualquier pantalla y ella
  // sola te lleva al calendario, esta forma de pedirlo ("ponme en el
  // calendario QUE TENGO...") es la más natural — pero antes solo se
  // quitaba el verbo suelto del principio ("ponme"), dejando "en el
  // calendario que tengo el" colado dentro del título (bug real:
  // confirmaba "En el calendario que tengo el cumpleaños..." en vez de
  // "Cumpleaños..."). Se quita también la coletilla completa, no solo
  // el verbo.
  const TRIGGER_WORDS = ['marcame', 'marca', 'apunta', 'apuntame', 'anota', 'pon', 'ponme', 'agenda', 'programa', 'crea', 'anademe', 'anade']
  let title = remaining.replace(/\s+/g, ' ').trim()
  title = title.replace(/^[,;]\s*/, '').trim()
  for (const w of TRIGGER_WORDS) {
    title = title.replace(new RegExp(`^${w}\\b`), '').trim()
  }
  title = title.replace(/^(en el calendario)?\s*(que)?\s*(tengo)?\s*(el|la|los|las|un|una)?\s*/, '').trim()
  title = title.replace(/^[,;]\s*/, '').trim()
  title = title.charAt(0).toUpperCase() + title.slice(1)

  return { title: title || 'Cita', date, time, endTime, memberHint, reminders, dateExplicit, recurrenceRule }
}
