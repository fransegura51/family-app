// Entiende una frase de calendario dictada o escrita — "el 3 de
// septiembre, cita con el dentista a las 19 horas para Eric, aviso un
// día antes" — sin ningún servicio de IA: solo patrones de fecha/hora en
// español. Es deliberadamente simple (no intenta entender cualquier
// frase libre) y siempre devuelve la fecha/hora que ha entendido para
// que la app la enseñe antes de guardar — si se equivoca, se nota al
// momento en vez de crear una cita en el día que no es.
import { normalize } from '@/domain/voiceQuery'
import { reminderMinutesFrom, type ReminderUnit } from '@/domain/reminders'

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

// Un número en la frase puede ser un dígito ("3") o una palabra
// ("tres" / "treinta y uno"); junta ambas formas en un solo patrón.
const NUMBER_PATTERN = `(\\d{1,2}|treinta y uno|${Object.keys(NUMBER_WORDS).join('|')})`

function wordToNumber(word: string): number {
  if (/^\d+$/.test(word)) return Number(word)
  if (word === 'treinta y uno') return 31
  return NUMBER_WORDS[word] ?? NaN
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export interface ParsedCalendarEntry {
  title: string
  date: string // YYYY-MM-DD
  time: string | null // HH:mm
  memberHint: string | null
  reminderMinutes: number | null
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
      const candidate = new Date(year, monthIndex, day)
      if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) year += 1
      date = `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
    }
    remaining = remaining.replace(dateMatch[0], ' ')
  }

  // "a las" es opcional — en habla natural es muy normal decir solo
  // "diecinueve horas" o "19 horas" sin el "a las" delante (bug real:
  // esa frase exacta no apuntaba ninguna hora). Se intenta primero con
  // "horas" como ancla (con o sin "a las" delante) y, si no hay "horas",
  // con "a las N" a secas (p. ej. "a las 7 de la tarde").
  let time: string | null = null
  const timeWithHorasRe = new RegExp(
    `,?\\s*\\b(?:a las\\s+)?${NUMBER_PATTERN}(?::(\\d{2})|\\s*y\\s*media)?\\s*horas?\\b`,
  )
  const timeWithALasRe = new RegExp(`,?\\s*\\ba las\\s+${NUMBER_PATTERN}(?::(\\d{2})|\\s*y\\s*media)?\\b`)
  const timeMatch = remaining.match(timeWithHorasRe) ?? remaining.match(timeWithALasRe)
  if (timeMatch) {
    let hour = wordToNumber(timeMatch[1])
    const minutes = timeMatch[2] ? Number(timeMatch[2]) : /y\s*media/.test(timeMatch[0]) ? 30 : 0
    if (!Number.isNaN(hour)) {
      const afterMatch = remaining.slice((timeMatch.index ?? 0) + timeMatch[0].length)
      if (hour < 12 && /^\s*de la tarde|^\s*de la noche/.test(afterMatch)) hour += 12
      if (hour >= 0 && hour <= 23) time = `${pad2(hour)}:${pad2(minutes)}`
    }
    remaining = remaining.replace(timeMatch[0], ' ')
    remaining = remaining.replace(/^\s*de la (tarde|noche|manana)\b/, ' ')
  }

  let memberHint: string | null = null
  const memberMatch = remaining.match(/\bpara (\w+)\b/)
  if (memberMatch) {
    memberHint = memberMatch[1]
    remaining = remaining.replace(memberMatch[0], ' ')
  }

  // "aviso 3 días antes", "avísame una semana antes", "aviso un mes
  // antes"... cualquier cantidad y unidad, no solo "hora"/"día" — y se
  // traga el "aviso"/"avísame" delante y la coma que suele precederlo
  // ("..., aviso un día antes") para que no se cuele en el título.
  let reminderMinutes: number | null = 60
  const reminderRe =
    /,?\s*(?:aviso|avisame)?\s*(?:(\d+)|un|una)?\s*(minutos?|horas?|dias?|semanas?|meses?|anos?)\s*antes\b/
  const reminderMatch = remaining.match(reminderRe)
  if (reminderMatch) {
    const amount = reminderMatch[1] ? Number(reminderMatch[1]) : 1
    const unit = UNIT_WORD_TO_UNIT[reminderMatch[2]]
    if (unit) reminderMinutes = reminderMinutesFrom(amount, unit)
    remaining = remaining.replace(reminderRe, ' ')
  }

  const TRIGGER_WORDS = ['marcame', 'marca', 'apunta', 'apuntame', 'anota', 'pon', 'ponme', 'agenda', 'programa', 'crea', 'anademe', 'anade']
  let title = remaining.replace(/\s+/g, ' ').trim()
  title = title.replace(/^[,;]\s*/, '').trim()
  for (const w of TRIGGER_WORDS) {
    title = title.replace(new RegExp(`^${w}\\b`), '').trim()
  }
  title = title.replace(/^[,;]\s*/, '').trim()
  title = title.charAt(0).toUpperCase() + title.slice(1)

  return { title: title || 'Cita', date, time, memberHint, reminderMinutes }
}
