import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// Eventos → «Menú del evento» — «Importar un menú desde foto o PDF». UN solo lector genérico para cualquier
// documento de comida (menú principal, menú infantil, cóctel, carta de bebidas, recena, propuesta de
// catering u otro): no hay un lector por tipo. La salida es SIEMPRE una propuesta que la familia revisa y
// corrige antes de guardar — esta función no guarda nada.
//
// REGLA FUNDAMENTAL: FIDELIDAD AL DOCUMENTO ORIGINAL ANTES QUE INTERPRETACIÓN. Se devuelve UNA lista plana en el
// MISMO ORDEN en que el documento lo presenta (de arriba abajo, y por columnas/bloques en el orden de lectura). La
// IA puede sugerir tipo y sección, pero NUNCA reordena, agrupa ni mueve nada por haberlo clasificado. Tampoco
// descarta texto con significado: lo dudoso se devuelve para que lo decida la persona.
// Nunca inventa platos, ingredientes, alérgenos, cantidades ni precios: solo transcribe lo que el documento dice.

export interface EventFoodDocumentInput {
  fileBase64: string
  mimeType: string
  kind: string
}

export interface EventFoodDocumentOutput {
  items: { text: string; kind: 'dish' | 'heading' | 'note' | 'skip'; section: string | null; note: string | null }[]
}

const SECTION_HINT = 'Aperitivo / picoteo, Entrantes, Primer plato, Plato principal, Guarniciones, Menú infantil, Postres, Tarta, Merienda, Cena, Recena, Bebidas, Otro'

const EVENT_FOOD_DOCUMENT_PROMPT =
  'Este es un documento de COMIDA o BEBIDA de un evento familiar (menú, carta, propuesta de catering, menú infantil, ' +
  'cóctel, recena, carta de bebidas...). Puede ser una foto de un papel, un PDF o una captura. Tu trabajo es solo ' +
  'TRANSCRIBIR lo que el documento dice, EN SU ORDEN ORIGINAL, de forma que una persona lo revise después.\n' +
  'Reglas estrictas:\n' +
  '- ORDEN: devuelve los elementos EXACTAMENTE en el orden en que aparecen en el documento, de arriba abajo (y, si hay ' +
  'columnas o bloques, en el orden natural de lectura). NUNCA reordenes, agrupes por tipo ni muevas un elemento porque ' +
  'creas que su categoría "va antes" o "va después": el orden del documento puede ser intencionado (horarios, momentos ' +
  'de la celebración, cambios de servicio) y tú no lo conoces. No ordenes alfabéticamente ni por sección.\n' +
  '- NUNCA inventes platos, ingredientes, alérgenos, cantidades, raciones ni precios. Si algo no está en el documento, no lo pongas.\n' +
  '- Cada elemento lleva "text" (tal como aparece, sin resumir), "kind" y, solo si es un plato, "section" sugerida.\n' +
  '- kind "dish": un plato o bebida concreta (p. ej. "Paella de marisco"). Si el documento añade una descripción o una ' +
  'advertencia EXPLÍCITA junto al plato (p. ej. "contiene frutos secos"), cópiala en "note"; si no, "note" es null.\n' +
  '- kind "heading": un encabezado, separador o frase con SIGNIFICADO que organiza el menú y no es un plato ' +
  '(p. ej. "Cena", "Cóctel de bienvenida", "Cambio de Tercio", "Segundo servicio", "Fin de fiesta"). Consérvalo en su posición.\n' +
  '- kind "note": un texto informativo con significado que acompaña al menú y no es un plato ni un encabezado.\n' +
  '- kind "skip": SOLO texto claramente prescindible del documento (título decorativo, nombre de los anfitriones o del ' +
  'evento, precio por persona, condiciones legales, datos de contacto). Aun así devuélvelo, en su posición: lo decidirá la persona. ' +
  'Ante la duda entre "skip" y "heading"/"note", elige "heading" o "note": nunca descartes texto con significado.\n' +
  `- "section" (solo para dish) es una SUGERENCIA de clasificación; si reconoces con claridad una de estas, usa exactamente ese nombre: ${SECTION_HINT}. ` +
  'Si no, usa el título que el propio documento da a ese bloque, o null. La sección NO influye en el orden.\n' +
  '- NO elimines elementos repetidos: el mismo plato puede aparecer en dos momentos distintos y ambos cuentan.\n' +
  'Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"items": [{"text": "texto del elemento", "kind": "dish|heading|note|skip", "section": "sugerencia o null", "note": "texto o null"}]}\n' +
  'Si el documento no tiene nada que ver con comida o bebida, o no se puede leer casi nada, responde {"items": []}.'

const KINDS = ['dish', 'heading', 'note', 'skip'] as const

export const eventFoodDocumentSpec: AiPurposeSpec<EventFoodDocumentInput, EventFoodDocumentOutput> = {
  purpose: 'analyze-event-food-document',
  // Un menú de banquete largo puede tener decenas de elementos: margen amplio para que el JSON nunca quede cortado.
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

  // Nunca lanza: una respuesta rara del modelo se traduce en «no se ha leído nada», nunca en un error. CONSERVA el orden
  // recibido y no deduplica.
  parseOutput(rawText) {
    const empty: EventFoodDocumentOutput = { items: [] }
    const parsed = asRecord(parseJsonLoose(rawText))
    if (!parsed) return empty

    const clean = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')
    const items: EventFoodDocumentOutput['items'] = []
    if (Array.isArray(parsed.items)) {
      for (const raw of parsed.items.slice(0, 300)) {
        const rec = asRecord(raw)
        const text = clean(typeof raw === 'string' ? raw : rec?.text, 200)
        if (!text) continue
        const kind = typeof rec?.kind === 'string' && (KINDS as readonly string[]).includes(rec.kind) ? (rec.kind as (typeof KINDS)[number]) : 'dish'
        items.push({ text, kind, section: kind === 'dish' ? clean(rec?.section, 80) || null : null, note: clean(rec?.note, 300) || null })
      }
    }
    return { items }
  },
}
