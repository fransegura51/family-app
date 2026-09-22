import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// FASE 7.1 (F7-001) — antes llamaba a Gemini directamente, sin ningún control. Mismo prompt exacto de
// siempre: si Gemini no encuentra una fecha con la que quedarse tranquilo, NO se inventa un evento — se
// devuelve found:false (mismo principio que el resto de la app: no inventar datos que no están claros).
// A diferencia de las otras automatizaciones, esta SÍ lanzaba antes si el JSON venía mal formado (un 500 que
// podía hacer que el workflow externo reintentara el mismo correo sin parar); ahora, igual que el resto de
// propósitos de IA de la app, un JSON inválido se trata como "no encontrado", nunca como un error del webhook.

export interface EventFromEmailInput {
  subject: string
  bodyText: string
  receivedDate: string
}

export interface EventFromEmailOutput {
  found: boolean
  title: string | null
  date: string | null
  allDay: boolean
  startTime: string | null
  endTime: string | null
  location: string | null
}

const MAX_BODY = 6000

export const eventFromEmailSpec: AiPurposeSpec<EventFromEmailInput, EventFromEmailOutput> = {
  purpose: 'import-event-email-webhook',
  maxOutputTokens: 512,

  readInput(body) {
    const subject = typeof body.subject === 'string' ? body.subject : ''
    const bodyText = typeof body.bodyText === 'string' ? body.bodyText : ''
    const receivedDate =
      typeof body.receivedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.receivedDate)
        ? body.receivedDate
        : new Date().toISOString().slice(0, 10)
    if (!subject && !bodyText) return { ok: false, error: 'missing subject/bodyText' }
    return { ok: true, input: { subject, bodyText, receivedDate } }
  },

  buildParts({ subject, bodyText, receivedDate }) {
    const prompt =
      `Hoy es ${receivedDate}. Lee este correo (boletín escolar, confirmación de reserva, ` +
      'recordatorio de una cita...) y decide si describe UN evento con fecha concreta al que ' +
      'apuntarse en un calendario. Responde ÚNICAMENTE un objeto JSON con esta forma exacta, ' +
      'sin texto adicional ni markdown:\n' +
      '{"found": true_o_false, "title": "texto corto o null", "date": "YYYY-MM-DD o null", ' +
      '"allDay": true_o_false, "startTime": "HH:MM o null", "endTime": "HH:MM o null", ' +
      '"location": "texto o null"}\n' +
      'Pon "found":false si el correo no tiene una fecha concreta y clara (por ejemplo, es ' +
      'publicidad, una factura sin evento, o solo habla en general). Nunca inventes una fecha u ' +
      'hora que no esté explícita o fácilmente deducible del texto (p. ej. "mañana", "el ' +
      'viernes que viene" sí se puede calcular a partir de hoy). Si el correo da hora de inicio ' +
      'pero no de fin, deja endTime a null y allDay a false. Si es un evento de todo el día ' +
      '(vacaciones, día no lectivo...), pon allDay true y deja startTime/endTime a null.\n\n' +
      `Asunto: ${subject}\n\nCuerpo:\n${bodyText.slice(0, MAX_BODY)}`
    return [{ text: prompt }]
  },

  // Nunca lanza: un JSON inválido o sin fecha clara se trata como "no encontrado" — nunca un 500 del webhook.
  parseOutput(rawText) {
    const parsed = asRecord(parseJsonLoose(rawText))
    const notFound: EventFromEmailOutput = { found: false, title: null, date: null, allDay: false, startTime: null, endTime: null, location: null }
    if (!parsed) return notFound
    if (parsed.found !== true || typeof parsed.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) return notFound
    const title = typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : null
    const startTime = typeof parsed.startTime === 'string' ? parsed.startTime : null
    const allDay = parsed.allDay === true || startTime === null
    const endTime = !allDay && typeof parsed.endTime === 'string' ? parsed.endTime : null
    const location = typeof parsed.location === 'string' ? parsed.location : null
    return { found: true, title, date: parsed.date, allDay, startTime: allDay ? null : startTime, endTime, location }
  },
}
