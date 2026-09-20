// "Hablar con PEPA": decide, solo con reglas, qué se está pidiendo cuando no
// hay un botón que lo diga — preguntar por el calendario, preguntar por la
// compra, apuntar a la compra o apuntar en el calendario. Los botones de
// siempre (Pepa/Apuntar × Calendario/Compra) no usan esto: ellos ya saben el
// destino por el botón. Si nada encaja con claridad devuelve 'unknown' y
// entonces se prueba la IA (solo para entender preguntas) o se pide otra forma
// de decirlo. Las cosas de Cocina se resuelven ANTES de llegar aquí.
import { extractSpokenDate } from '@/domain/spokenDate'
import { findKnownStore, isUnsupportedDelete, looksLikeSaveInstruction, normalize } from '@/domain/voiceQuery'

export type TalkRoute = 'delete' | 'ask_shopping' | 'ask_calendar' | 'add_shopping' | 'add_calendar' | 'unknown'

const QUESTION_START = /^(?:que|cual|cuales|cuando|cuanto|cuantos|cuantas|hay|dime|me queda|quedan?)\b/
const QUESTION_INSIDE = /\b(?:que tengo|que tenemos|que tiene|que hay|que toca|que me queda|que nos queda)\b/
const QUESTION_HAVE = /^(?:tengo|tenemos|tiene|tienen)\s+(?:algo|alguna|algun|nada|planes|citas?|eventos?)\b/
// "Tengo que comprar leche", "necesito pan": son encargos, no preguntas, aunque
// empiecen como una.
const BUY_STATEMENT = /\b(?:tengo que|hay que|necesito|necesitamos|quiero|tenemos que)\s+comprar\b|^comprar?\b/
const SHOP_WORDS = /\b(?:compra|compras|comprar|lista|supermercado)\b/
const CAL_QUESTION_WORDS = /\b(?:hoy|manana|semana|proxim[oa]|siguiente|agenda|calendario|cita|citas|evento|eventos|tareas|hacer|ahora|tengo|tenemos|tiene|toca|pendiente)\b/
const DATE_WORDS = /\b(?:hoy|manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/
const TIME_WORDS = /\ba las\b|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*horas?\b/

export function routeTalk(text: string, knownStores: string[], today: Date): TalkRoute {
  if (isUnsupportedDelete(text)) return 'delete'
  const n = normalize(text)
  const startsWithSave = looksLikeSaveInstruction(text)
  // "Qué tengo que comprar" es una pregunta; "tengo que comprar pan", un encargo.
  const buyStatement = BUY_STATEMENT.test(n) && !QUESTION_START.test(n) && !/[?¿]/.test(text)
  const shopping = SHOP_WORDS.test(n) || findKnownStore(text, knownStores) !== null
  const questionShaped = QUESTION_START.test(n) || QUESTION_INSIDE.test(n) || QUESTION_HAVE.test(n) || /[?¿]/.test(text)
  const isQuestion = !startsWithSave && !buyStatement && questionShaped

  if (isQuestion) {
    if (shopping) return 'ask_shopping'
    if (CAL_QUESTION_WORDS.test(n) || DATE_WORDS.test(n) || extractSpokenDate(n, today)) return 'ask_calendar'
    return 'unknown'
  }
  if (shopping) return 'add_shopping'
  if (DATE_WORDS.test(n) || TIME_WORDS.test(n) || extractSpokenDate(n, today) || /\bcalendario\b/.test(n)) return 'add_calendar'
  return 'unknown'
}
