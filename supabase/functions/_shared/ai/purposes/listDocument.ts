import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// «Mis listas» → Importar desde foto o PDF. El móvil recorta la zona elegida (y convierte las páginas de un PDF en imagen) ANTES de
// enviarla: aquí solo llega esa imagen. La salida es SIEMPRE una propuesta editable; esta función no guarda nada.
// REGLA FUNDAMENTAL: transcribir, no interpretar. Nunca inventa elementos, cantidades ni fechas.

export interface ListDocumentInput {
  imageBase64: string
  mimeType: string
  kind: 'tareas' | 'ideas' | 'comparativa'
}
export interface ListDocumentOutput {
  items: { text: string; depth: 0 | 1; uncertain: boolean }[]
}

const KIND_HINT: Record<ListDocumentInput['kind'], string> = {
  tareas: 'Es una lista de TAREAS: un elemento por tarea o por línea con casilla o viñeta.',
  ideas: 'Es una lista de IDEAS o anotaciones: un elemento por idea o por línea; las ideas largas se conservan enteras.',
  comparativa: 'Es una COMPARATIVA (pros y contras u opciones): un elemento por cada punto, sin mezclar ni resumir columnas distintas.',
}

const PROMPT =
  'Esta imagen contiene una LISTA escrita a mano, impresa o capturada de una pantalla. Tu trabajo es solo TRANSCRIBIR los elementos de la lista, ' +
  'en el MISMO ORDEN en que aparecen (de arriba abajo y, si hay columnas, en el orden natural de lectura).\n' +
  'Reglas estrictas:\n' +
  '- NUNCA inventes elementos, cantidades, fechas ni nombres. Si algo no está en la imagen, no lo pongas. No completes ni corrijas el sentido.\n' +
  '- Quita viñetas, numeración y casillas del principio de cada línea, pero NO cambies el resto del texto.\n' +
  '- Si una palabra o línea es DUDOSA o ilegible, ponla igualmente con tu mejor lectura y "uncertain": true; si no se lee nada, usa el texto "(ilegible)" con "uncertain": true.\n' +
  '- "depth": 1 solo si el elemento es claramente un SUBELEMENTO sangrado de otro anterior; si no, 0. Nunca más de un nivel.\n' +
  '- No resumas, no agrupes ni elimines repetidos: cada línea es un elemento.\n' +
  '- Ignora títulos decorativos, fechas de la hoja, logotipos y marcas de agua que no sean elementos de la lista.\n' +
  'Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"items": [{"text": "texto", "depth": 0, "uncertain": false}]}\n' +
  'Si la imagen no contiene ninguna lista o no se puede leer casi nada, responde {"items": []}.'

const KINDS = ['tareas', 'ideas', 'comparativa'] as const

export const listDocumentSpec: AiPurposeSpec<ListDocumentInput, ListDocumentOutput> = {
  purpose: 'analyze-list-document',
  maxOutputTokens: 4096,
  purposeDailyCap: 60,

  readInput(body) {
    const { imageBase64, mimeType, kind } = body
    if (typeof imageBase64 !== 'string' || !imageBase64 || typeof mimeType !== 'string' || !mimeType.startsWith('image/')) return { ok: false, error: 'missing image' }
    const k = (KINDS as readonly string[]).includes(kind as string) ? (kind as ListDocumentInput['kind']) : 'tareas'
    return { ok: true, input: { imageBase64, mimeType, kind: k } }
  },

  buildParts({ imageBase64, mimeType, kind }) {
    return [{ text: `${PROMPT}\n${KIND_HINT[kind]}` }, { inlineData: { mimeType, data: imageBase64 } }]
  },

  // Nunca lanza: una respuesta rara del modelo se traduce en «no se ha leído nada». Conserva el orden y no deduplica.
  parseOutput(rawText) {
    const empty: ListDocumentOutput = { items: [] }
    const parsed = asRecord(parseJsonLoose(rawText))
    if (!parsed || !Array.isArray(parsed.items)) return empty
    const items: ListDocumentOutput['items'] = []
    for (const raw of parsed.items.slice(0, 200)) {
      const rec = asRecord(raw)
      const text = (typeof raw === 'string' ? raw : typeof rec?.text === 'string' ? rec.text : '').replace(/\s+/g, ' ').trim().slice(0, 500)
      if (!text) continue
      items.push({ text, depth: rec?.depth === 1 && items.length > 0 ? 1 : 0, uncertain: rec?.uncertain === true })
    }
    return { items }
  },
}
