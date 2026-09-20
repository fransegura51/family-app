import type { AiPurposeSpec } from '../types.ts'
import { asCleanString, asIsoDate, asRecord, parseJsonLoose, pickEnum } from '../validate.ts'

// Respaldo con IA para el botón 🐣 Pepa cuando el reconocimiento local por
// patrones no entiende la pregunta. Petición real: "si le digo 'tengo nueve
// de septiembre' en vez de 'qué tengo el nueve de septiembre', me dice que
// no lo entiende" — los patrones a mano nunca cubren todas las formas de
// decir lo mismo. Se llama solo cuando el reconocimiento local (gratis,
// instantáneo) ya ha fallado. El prompt es el mismo de siempre; lo nuevo es
// que la respuesta se valida de forma estricta.

export const INTENTS = ['tasks_today', 'next_calendar_event', 'shopping_list', 'none'] as const

export interface PepaIntentInput {
  text: string
  today: string
}

export interface PepaIntentOutput {
  intent: (typeof INTENTS)[number]
  explicitDate: string | null
  when: 'today' | 'tomorrow'
  memberHint: string | null
  storeHint: string | null
  nowOnly: boolean
}

const MAX_TEXT = 1000

export const pepaIntentSpec: AiPurposeSpec<PepaIntentInput, PepaIntentOutput> = {
  purpose: 'pepa-intent',

  readInput(body) {
    const { text, today } = body
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'missing text' }
    if (text.length > MAX_TEXT) return { ok: false, error: 'text too long' }
    if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, error: 'missing today' }
    return { ok: true, input: { text, today } }
  },

  buildParts({ text, today }) {
    const prompt =
      'Eres el clasificador de preguntas de "Pepa", el asistente por voz de una app familiar en español. ' +
      `Hoy es ${today} (YYYY-MM-DD). Alguien le ha dicho esta frase a Pepa, pulsando el botón de PREGUNTAR ` +
      '(así que casi seguro es una pregunta, no un encargo para guardar algo):\n' +
      `"${text}"\n\n` +
      'Responde ÚNICAMENTE un objeto JSON, sin texto adicional ni markdown, con esta forma exacta:\n' +
      '{"intent": "tasks_today" | "next_calendar_event" | "shopping_list" | "none", ' +
      '"explicitDate": "YYYY-MM-DD o null", "when": "today" | "tomorrow", "memberHint": "nombre o null", ' +
      '"storeHint": "nombre de tienda o null", "nowOnly": true|false}\n\n' +
      'Significado de cada intent:\n' +
      '- tasks_today: pregunta qué hay que hacer, tareas o citas de un día — hoy, mañana, o una fecha concreta ' +
      "('el nueve de septiembre', 'tengo nueve de septiembre', 'qué me queda por hacer el 25 de diciembre'...). " +
      'Si menciona una fecha concreta, calcula explicitDate en YYYY-MM-DD (si ese día ya pasó este año, usa el ' +
      'año que viene) y deja when="today". Si no menciona fecha, when es "today" o "tomorrow" según toque, ' +
      'explicitDate=null.\n' +
      '- next_calendar_event: pregunta por la próxima cita/evento del calendario en general, sin decir un día ' +
      "concreto ('lo siguiente que tengo', 'cuál es mi próxima cita').\n" +
      "- shopping_list: pregunta qué hay en la lista de la compra ('qué tengo pendiente de comprar', 'qué tengo " +
      "en la lista de la compra de Mercadona'...). Si nombra una tienda concreta, ponla en storeHint tal cual " +
      'se ha dicho (p. ej. "Mercadona"); si no, storeHint=null.\n' +
      '- none: no es ninguna pregunta reconocible de las anteriores.\n\n' +
      'memberHint: si nombra a alguien en concreto de quién pregunta, su nombre; si no, null.\n' +
      'nowOnly: true SOLO si pregunta explícitamente "ahora" (desde este momento en adelante); false en cualquier otro caso.'
    return [{ text: prompt }]
  },

  parseOutput(rawText) {
    const parsed = asRecord(parseJsonLoose(rawText)) ?? {}
    return {
      intent: pickEnum(parsed.intent, INTENTS, 'none'),
      explicitDate: asIsoDate(parsed.explicitDate),
      when: parsed.when === 'tomorrow' ? 'tomorrow' : 'today',
      memberHint: asCleanString(parsed.memberHint, 60),
      storeHint: asCleanString(parsed.storeHint, 80),
      nowOnly: parsed.nowOnly === true,
    }
  },
}
