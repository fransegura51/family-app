import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// «Gestión de grupos» → Importar participantes desde foto o PDF (una lista de clase, de equipo…). El móvil convierte cada página de un PDF en imagen ANTES de enviarla:
// aquí solo llega una imagen. La salida es SIEMPRE una propuesta editable; esta función no guarda nada.
// REGLA FUNDAMENTAL: transcribir, no interpretar. Nunca inventa nombres ni teléfonos, y nunca asigna un teléfono a una persona si no está claro en su misma fila.

export interface ParticipantsDocumentInput {
  imageBase64: string
  mimeType: string
}
export interface ParticipantsDocumentRow {
  name: string
  surname: string | null
  guardian: string | null
  phone: string | null
  email: string | null
  uncertain: boolean
}
export interface ParticipantsDocumentOutput {
  rows: ParticipantsDocumentRow[]
}

const PROMPT =
  'Esta imagen contiene una LISTA DE PERSONAS (por ejemplo los alumnos de una clase o los jugadores de un equipo), a veces con una tabla de columnas: ' +
  'nombre del alumno o participante, apellidos, nombre de la madre/padre/tutor, teléfono, correo electrónico. Tu trabajo es solo TRANSCRIBIR cada fila, ' +
  'en el MISMO ORDEN en que aparece.\n' +
  'Reglas estrictas:\n' +
  '- Una fila de la tabla = una persona. NUNCA mezcles datos de filas distintas: el teléfono de una fila pertenece a la persona de ESA fila.\n' +
  '- NUNCA inventes nombres, teléfonos ni correos. Si un dato no está en la fila, pon null.\n' +
  '- "name" es el nombre de la persona que forma parte del grupo (el niño, la jugadora…) y "surname" sus apellidos. Si la tabla tiene columnas separadas de nombre y apellidos, respétalas. ' +
  'Si en una sola celda viene escrito «Apellidos, Nombre» (por ejemplo «Aboutaleb Bassry, Seifeddine»), separa: "surname": "Aboutaleb Bassry", "name": "Seifeddine". ' +
  'Respeta los nombres y apellidos compuestos («García de la Fuente», «María José»). Si el nombre y los apellidos vienen juntos SIN coma y no puedes saber dónde se separan, pon todo en "name" y "surname": null: NO adivines. Nunca cambies acentos.\n' +
  '- "guardian" es el nombre de la madre, padre o tutor si la tabla lo indica (columnas como Madre, Padre, Madre/padre, Tutor, Responsable, Familiar). Si hay dos columnas (madre y padre) usa la que tenga valor; si hay las dos, ponlas juntas separadas por " / ".\n' +
  '- "phone": transcribe el teléfono tal cual, con sus dígitos; no lo completes ni lo corrijas. Si hay varios teléfonos en la fila, pon el primero y marca "uncertain": true.\n' +
  '- Si una palabra o cifra es DUDOSA, está tachada, cortada o ilegible, pon tu mejor lectura y "uncertain": true.\n' +
  '- Ignora títulos, fechas, números de lista (1, 2, 3…), logotipos y filas de cabecera de la tabla.\n' +
  'Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"rows": [{"name": "Eric García", "surname": null, "guardian": "Jennifer", "phone": "612 345 678", "email": null, "uncertain": false}]}\n' +
  'Si la imagen no contiene ninguna lista de personas o no se puede leer casi nada, responde {"rows": []}.'

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max)
  return s || null
}

export const participantsDocumentSpec: AiPurposeSpec<ParticipantsDocumentInput, ParticipantsDocumentOutput> = {
  purpose: 'analyze-participants-document',
  maxOutputTokens: 8192,
  purposeDailyCap: 60,

  readInput(body) {
    const { imageBase64, mimeType } = body
    if (typeof imageBase64 !== 'string' || !imageBase64 || typeof mimeType !== 'string' || !mimeType.startsWith('image/')) return { ok: false, error: 'missing image' }
    return { ok: true, input: { imageBase64, mimeType } }
  },

  buildParts({ imageBase64, mimeType }) {
    return [{ text: PROMPT }, { inlineData: { mimeType, data: imageBase64 } }]
  },

  // Nunca lanza: una respuesta rara del modelo se traduce en «no se ha leído nada». Conserva el orden y no deduplica.
  parseOutput(rawText) {
    const parsed = asRecord(parseJsonLoose(rawText))
    if (!parsed || !Array.isArray(parsed.rows)) return { rows: [] }
    const rows: ParticipantsDocumentRow[] = []
    for (const raw of parsed.rows.slice(0, 300)) {
      const r = asRecord(raw)
      if (!r) continue
      const name = str(r.name, 120)
      if (!name) continue
      rows.push({ name, surname: str(r.surname, 120), guardian: str(r.guardian, 120), phone: str(r.phone, 40), email: str(r.email, 160), uncertain: r.uncertain === true })
    }
    return { rows }
  },
}
