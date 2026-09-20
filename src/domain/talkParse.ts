// Preparación de lo que se dice con "Hablar con PEPA" para apuntarlo — sin
// guardar nada: solo devuelve los datos que luego se enseñan en la tarjeta de
// confirmación. Reutiliza los parsers de siempre (parseCalendarEntry,
// extractShoppingStore...) y solo añade lo que faltaba para hablar de forma
// natural sin botón: días de la semana ("el viernes"), horas sin "de la tarde"
// ("a las cinco") y limpiar verbos y preposiciones sueltas.
import { parseCalendarEntry } from '@/domain/calendarVoiceParser'
import { findDateInText } from '@/domain/kitchenQuery'
import { extractSpokenDate } from '@/domain/spokenDate'
import { findMemberInText, matchMemberByHint, normalize, stripListFillers } from '@/domain/voiceQuery'

// ---------------------------------------------------------------------
// Compra
// ---------------------------------------------------------------------

const LEADING_BUY_VERBS = /^(?:a[ñn]ade(?:me)?|agrega(?:me)?|mete|comprar?|(?:necesito|necesitamos|quiero)(?:\s+comprar)?|(?:tengo|tenemos|hay) que comprar)\s+/i
const SHOPPING_PLACE_TAIL = /\b(?:a|en|para|de)\s+(?:la\s+)?(?:lista(?:\s+de\s+la\s+compra)?|compras?)\b/gi
const TRAILING_PREPOSITION = /[\s,]+(?:a|en|para|de|al|del)\s*$/i

// Deja solo los productos: quita el verbo del principio ("añade", "apunta",
// "necesito comprar"), "a la lista de la compra" y una preposición que se
// quede colgando tras quitar el nombre de la tienda ("... pan a").
export function cleanShoppingText(text: string): string {
  let result = stripListFillers(text.trim())
  result = result.replace(LEADING_BUY_VERBS, '')
  result = result.replace(SHOPPING_PLACE_TAIL, ' ')
  result = result.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 3; i++) result = result.replace(TRAILING_PREPOSITION, '').trim()
  return result.replace(/^[,;:.]\s*/, '').replace(/[,;:.]\s*$/, '').trim()
}

// ---------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------

export interface PreparedCalendarEntry {
  title: string
  date: string
  time: string | null
  endTime: string | null
  memberId: string | null
  recurrenceRule: string | null
  reminders: { minutesBefore: number; anchor: 'start' | 'end' }[]
  notes: string[]
}

const TRAILING_TITLE_WORDS = /\s+(?:de|del|para|con|a|al|en|el|la|los|las|y)$/i

function tidyTitle(title: string): string {
  let out = title.replace(/\s+/g, ' ').trim().replace(/^[,;:.]\s*/, '').replace(/[,;:.]\s*$/, '')
  for (let i = 0; i < 3; i++) out = out.replace(TRAILING_TITLE_WORDS, '').trim()
  return out
}

// parseCalendarEntry trabaja sobre texto sin acentos ("reunion"); aquí se
// recuperan tal como se dijeron ("reunión").
function restoreAccents(title: string, original: string): string {
  const byNormalized = new Map<string, string>()
  for (const token of original.split(/\s+/)) {
    const clean = token.replace(/^[¿¡"'(]+|[.,;:!?)"']+$/g, '')
    if (clean) byNormalized.set(normalize(clean), clean.toLowerCase())
  }
  return title
    .split(' ')
    .map((word) => byNormalized.get(word.toLowerCase()) ?? word)
    .join(' ')
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const RECURRENCE_PHRASE = /\b(?:todos los|todas las semanas el|cada)\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)/

export function prepareCalendarFromText(text: string, today: Date, members: { id: string; name: string }[]): PreparedCalendarEntry {
  const orig = text.normalize('NFC').trim()
  const n = normalize(orig)
  const notes: string[] = []

  // El parser de siempre entiende "el 9 de octubre" pero no "el viernes" ni
  // "mañana": esas se resuelven aquí y se quitan de la frase para que no se
  // cuelen en el título. Las repeticiones ("todos los martes") se dejan
  // tal cual: son suyas.
  let workText = orig
  let relativeDate: string | null = null
  if (!extractSpokenDate(n, today) && !RECURRENCE_PHRASE.test(n) && n.length === orig.length) {
    const ref = findDateInText(n, today, true)
    if (ref) {
      relativeDate = ref.date
      workText = `${orig.slice(0, ref.start)} ${orig.slice(ref.end)}`
    }
  }

  const parsed = parseCalendarEntry(workText, today)
  const date = !parsed.dateExplicit && relativeDate ? relativeDate : parsed.date

  // Sin "de la mañana/tarde/noche", una hora de la 1 a las 7 casi seguro es de
  // la tarde ("dentista a las cinco"). Se dice en la tarjeta para poder
  // corregirlo antes de guardar.
  let time = parsed.time
  if (time && !/\b(?:de la manana|de la madrugada|de la tarde|de la noche|am|pm)\b/.test(n)) {
    const hour = Number(time.slice(0, 2))
    if (hour >= 1 && hour <= 7) {
      time = `${String(hour + 12).padStart(2, '0')}${time.slice(2)}`
      notes.push(`Entendido como las ${time} (tarde). Si es de la mañana, cancela y dilo con "de la mañana".`)
    }
  }

  let title = parsed.title
  let member = parsed.memberHint ? matchMemberByHint(parsed.memberHint, members) : null
  if (!member) {
    const found = findMemberInText(title, members)
    if (found) {
      member = found
      const nameRe = new RegExp(`\\b${found.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      title = title.replace(nameRe, '')
    }
  }
  title = capitalize(restoreAccents(tidyTitle(title), orig)) || 'Cita'

  // Un recordatorio "al terminar" no tiene sentido sin hora de fin (mismo
  // criterio que el apunte de siempre).
  const reminders = parsed.reminders.map((r) => ({ ...r, anchor: r.anchor === 'end' && !parsed.endTime ? ('start' as const) : r.anchor }))

  return {
    title,
    date,
    time,
    endTime: parsed.endTime,
    memberId: member?.id ?? null,
    recurrenceRule: parsed.recurrenceRule,
    reminders,
    notes,
  }
}
