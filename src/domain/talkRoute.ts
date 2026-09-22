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
// "Añade leche y pan a Mercadona": aunque la tienda no esté dada de alta ni se diga "compra",
// añadir/agregar/meter algo sin fecha ni hora es, casi siempre, la lista de la compra.
const SHOPPING_VERBS = /^(?:anade(?:me)?|agrega(?:me)?|mete)\b/
const TIME_WORDS = /\ba las\b|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*horas?\b/
// "compra"/"compras" (sustantivo/imperativo), "lista" o "supermercado", o una tienda YA DADA DE ALTA: señal
// FUERTE de Compras, gana siempre aunque la frase también tenga fecha ("añade pan para mañana a la lista
// de la compra" sigue siendo Compras). A propósito NO incluye "comprar" (el verbo en infinitivo): ese verbo
// es AMBIGUO, aparece igual en un encargo sin fecha ("tengo que comprar pan") que en un aviso de Calendario
// con fecha/hora clara ("apunta mañana a las seis de la tarde comprar pan") — bug real reportado: estos dos
// últimos se apuntaban en Compras con el texto entero como nombre de producto. Por eso "comprar" a secas
// solo decide Compras cuando, más abajo, no hay ninguna fecha/hora (ver el orden de comprobaciones).
const STRONG_SHOP_WORDS = /\b(?:compra|compras|lista|supermercado)\b/

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
  const strongShopping = STRONG_SHOP_WORDS.test(n) || findKnownStore(text, knownStores) !== null
  if (strongShopping) return 'add_shopping'
  if (DATE_WORDS.test(n) || TIME_WORDS.test(n) || extractSpokenDate(n, today) || /\bcalendario\b/.test(n)) return 'add_calendar'
  if (shopping) return 'add_shopping'
  if (SHOPPING_VERBS.test(n)) return 'add_shopping'
  return 'unknown'
}
