// Preguntas sencillas que no necesitan datos de la familia ni IA: la hora, el día de hoy y cuántos días faltan para una fiesta (Navidad, Reyes…). Petición real
// (17/10/2026): «quiero que reconozca más cosas de las que reconoce, reconoce muy pocas por voz». Solo reglas, se contestan en el momento con el reloj del móvil.
import { normalize } from '@/domain/voiceQuery'

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// «Qué hora es», «dime la hora», «me dices la hora», «qué hora tenemos».
const TIME_RE = /\bque hora (?:es|son|tenemos)\b|\b(?:dime|me dices|me das|me puedes decir|puedes decirme) la hora\b/
// «Qué día es hoy», «a qué día estamos», «qué fecha es hoy», «qué día de la semana es hoy», «a cuánto estamos».
const DATE_RE = /\bque dia (?:es|estamos|de la semana es)(?: hoy)?\s*$|\ba que dia estamos\b|\bque fecha (?:es|tenemos|estamos)(?: hoy)?\b|\ba cuantos? estamos\b|\bque dia de la semana es hoy\b/
// «Cuántos días faltan para Navidad», «cuántos días quedan para Reyes», «cuánto falta para Nochevieja».
const COUNTDOWN_RE = /\bcuant[oa]s?\s+(?:dias?\s+)?(?:faltan?|quedan?|hay)\s+(?:para|hasta)\s+(?:la\s+|el\s+|los\s+)?(.+)$/

interface Holiday {
  label: string
  month: number // 0-11
  day: number
  words: RegExp
}
const HOLIDAYS: Holiday[] = [
  { label: 'Nochebuena', month: 11, day: 24, words: /^nochebuena$/ },
  { label: 'Navidad', month: 11, day: 25, words: /^navidad(?:es)?$/ },
  { label: 'Nochevieja', month: 11, day: 31, words: /^(?:nochevieja|fin de ano|fin de ano nuevo)$/ },
  { label: 'Año Nuevo', month: 0, day: 1, words: /^(?:ano nuevo|primero de ano)$/ },
  { label: 'el Día de Reyes', month: 0, day: 6, words: /^(?:reyes|dia de reyes|reyes magos|epifania)$/ },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function timeAnswer(now: Date): string {
  const h = now.getHours()
  const m = now.getMinutes()
  const hour12 = h % 12 === 0 ? 12 : h % 12
  const lead = hour12 === 1 ? 'Es la' : 'Son las'
  return `${lead} ${h}:${pad(m)}.`
}

function dateAnswer(now: Date): string {
  return `Hoy es ${WEEKDAYS[now.getDay()]}, ${now.getDate()} de ${MONTH_NAMES[now.getMonth()]} de ${now.getFullYear()}.`
}

function countdownAnswer(rawName: string, now: Date): string | null {
  const name = rawName.replace(/[?!.,;]+$/g, '').replace(/\s+(?:por favor|gracias)$/, '').trim()
  const holiday = HOLIDAYS.find((h) => h.words.test(name))
  if (!holiday) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let target = new Date(now.getFullYear(), holiday.month, holiday.day)
  if (target.getTime() < today.getTime()) target = new Date(now.getFullYear() + 1, holiday.month, holiday.day)
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  const when = `${holiday.day} de ${MONTH_NAMES[holiday.month]}`
  if (days === 0) return `¡Hoy es ${holiday.label}! (${when})`
  if (days === 1) return `Falta 1 día para ${holiday.label} (${when}).`
  return `Faltan ${days} días para ${holiday.label} (${when}).`
}

// null = la frase no es de estas.
export function answerGeneralQuestion(text: string, now: Date): string | null {
  const n = normalize(text).replace(/[¿?¡!]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!n) return null
  if (TIME_RE.test(n)) return timeAnswer(now)
  if (DATE_RE.test(n)) return dateAnswer(now)
  const countdown = COUNTDOWN_RE.exec(n)
  if (countdown) return countdownAnswer(countdown[1], now)
  return null
}
