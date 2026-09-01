// Reconoce una fecha dicha en español ("el 9 de septiembre", "el día 9
// de septiembre") en cualquier punto de una frase — compartido entre
// quien pregunta por una fecha concreta a Pepa y (en el futuro, si hace
// falta) el resto del reconocimiento de calendario, para no mantener el
// mismo patrón de fecha duplicado en varios sitios.

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

export const MONTHS = [
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

const NUMBER_PATTERN = `(\\d{1,2}|treinta y uno|${Object.keys(NUMBER_WORDS).join('|')})`

function wordToNumber(word: string): number {
  if (/^\d+$/.test(word)) return Number(word)
  if (word === 'treinta y uno') return 31
  return NUMBER_WORDS[word] ?? NaN
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export interface SpokenDateMatch {
  date: string // YYYY-MM-DD
  matchText: string
}

// `text` debe venir ya normalizado (minúsculas, sin acentos — ver
// domain/voiceQuery.ts normalize()). Igual que en el resto de la app:
// si la fecha ya pasó este año, se asume el año que viene.
export function extractSpokenDate(text: string, today: Date): SpokenDateMatch | null {
  const dateRe = new RegExp(`\\b(?:el d[ií]a |el |d[ií]a )?${NUMBER_PATTERN} de (${MONTHS.join('|')})\\b`)
  const m = text.match(dateRe)
  if (!m) return null

  const day = wordToNumber(m[1])
  const monthIndex = MONTHS.indexOf(m[2])
  if (Number.isNaN(day) || day < 1 || day > 31 || monthIndex < 0) return null

  let year = today.getFullYear()
  let candidate = new Date(year, monthIndex, day)
  if (candidate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    year += 1
    candidate = new Date(year, monthIndex, day)
  }
  const date = `${candidate.getFullYear()}-${pad2(candidate.getMonth() + 1)}-${pad2(candidate.getDate())}`
  return { date, matchText: m[0] }
}
