import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// Eventos → Comida y bebida — «Importar un menú desde foto o PDF». UN solo lector genérico para cualquier
// documento de comida (menú principal, menú infantil, cóctel, carta de bebidas, recena, propuesta de
// catering u otro): no hay un lector por tipo. La salida es SIEMPRE una propuesta que la familia revisa y
// corrige antes de guardar — esta función no guarda nada. Nunca inventa platos, ingredientes, alérgenos,
// cantidades ni precios: solo organiza lo que el propio documento dice.

export interface EventFoodDocumentInput {
  fileBase64: string
  mimeType: string
  kind: string
}

export interface EventFoodDocumentOutput {
  sections: { section: string; dishes: { name: string; note: string | null }[] }[]
  extraNotes: string[]
}

const SECTION_HINT = 'Aperitivo / picoteo, Entrantes, Primer plato, Plato principal, Guarniciones, Menú infantil, Postres, Tarta, Merienda, Cena, Recena, Bebidas, Otro'

const EVENT_FOOD_DOCUMENT_PROMPT =
  'Este es un documento de COMIDA o BEBIDA de un evento familiar (menú, carta, propuesta de catering, menú infantil, ' +
  'cóctel, recena, carta de bebidas...). Puede ser una foto de un papel, un PDF o una captura. Tu trabajo es solo ' +
  'ORGANIZAR lo que el documento dice, de forma que una persona lo revise después.\n' +
  'Reglas estrictas:\n' +
  '- NUNCA inventes platos, ingredientes, alérgenos, cantidades, raciones ni precios. Si algo no está en el documento, no lo pongas.\n' +
  '- Un plato es solo su nombre tal como aparece (p. ej. "Paella de marisco"). Si el documento añade una descripción o ' +
  'una advertencia EXPLÍCITA junto al plato (p. ej. "contiene frutos secos"), puedes copiarla en "note"; si no, "note" es null.\n' +
  '- Agrupa los platos en las secciones que el propio documento usa. Si puedes reconocer con claridad una de estas ' +
  `secciones habituales, usa exactamente ese nombre: ${SECTION_HINT}. Si no encaja ninguna, conserva el título tal cual lo escribe el documento.\n` +
  '- Los precios por persona, las condiciones, los horarios y cualquier texto que NO sea un plato o una bebida ' +
  'concreta van en "extraNotes" (frases cortas), nunca como plato.\n' +
  'Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"sections": [{"section": "nombre de la sección", "dishes": [{"name": "nombre del plato", "note": "texto o null"}]}], ' +
  '"extraNotes": ["texto corto"]}\n' +
  'Si el documento no tiene nada que ver con comida o bebida, o no se puede leer casi nada, responde ' +
  '{"sections": [], "extraNotes": []}.'

export const eventFoodDocumentSpec: AiPurposeSpec<EventFoodDocumentInput, EventFoodDocumentOutput> = {
  purpose: 'analyze-event-food-document',
  // Un menú de banquete largo puede tener decenas de platos: margen amplio para que el JSON nunca quede cortado.
  maxOutputTokens: 8192,

  readInput(body) {
    const { fileBase64, mimeType, kind } = body
    if (typeof fileBase64 !== 'string' || !fileBase64 || typeof mimeType !== 'string' || !mimeType) return { ok: false, error: 'missing file' }
    return { ok: true, input: { fileBase64, mimeType, kind: typeof kind === 'string' ? kind.slice(0, 40) : 'otro' } }
  },

  buildParts({ fileBase64, mimeType, kind }) {
    const context = kind === 'menu_infantil' ? ' (es un MENÚ INFANTIL)' : kind === 'bebidas' ? ' (es una CARTA DE BEBIDAS)' : ''
    return [{ text: EVENT_FOOD_DOCUMENT_PROMPT + (context ? `\nContexto${context}.` : '') }, { inlineData: { mimeType, data: fileBase64 } }]
  },

  // Nunca lanza: una respuesta rara del modelo se traduce en «no se ha leído nada», nunca en un error.
  parseOutput(rawText) {
    const empty: EventFoodDocumentOutput = { sections: [], extraNotes: [] }
    const parsed = asRecord(parseJsonLoose(rawText))
    if (!parsed) return empty

    const clean = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')
    const sections: EventFoodDocumentOutput['sections'] = []
    if (Array.isArray(parsed.sections)) {
      for (const raw of parsed.sections.slice(0, 30)) {
        const rec = asRecord(raw)
        if (!rec || !Array.isArray(rec.dishes)) continue
        const dishes: { name: string; note: string | null }[] = []
        for (const d of rec.dishes.slice(0, 80)) {
          const dish = asRecord(d)
          const name = clean(typeof d === 'string' ? d : dish?.name, 160)
          if (!name) continue
          dishes.push({ name, note: clean(dish?.note, 300) || null })
        }
        if (dishes.length > 0) sections.push({ section: clean(rec.section, 80) || 'Otro', dishes })
      }
    }
    const extraNotes = Array.isArray(parsed.extraNotes) ? parsed.extraNotes.map((n) => clean(n, 300)).filter(Boolean).slice(0, 10) : []
    return { sections, extraNotes }
  },
}
