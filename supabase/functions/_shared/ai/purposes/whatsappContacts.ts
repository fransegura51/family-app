import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// «Gestión de grupos» → Importar contactos desde capturas de WhatsApp (lista de participantes de un grupo de WhatsApp, información de un grupo, un chat…).
// La salida es SIEMPRE una propuesta editable; esta función no guarda nada. REGLA FUNDAMENTAL: transcribir, no interpretar. Nunca inventa teléfonos ni relaciones.

export interface WhatsappContactsInput {
  imageBase64: string
  mimeType: string
}
export interface WhatsappContactRow {
  whatsappName: string | null
  phone: string | null
  guardian: string | null
  student: string | null
  uncertain: boolean
}
export interface WhatsappContactsOutput {
  rows: WhatsappContactRow[]
}

const PROMPT =
  'Esta imagen es una CAPTURA DE PANTALLA DE WHATSAPP: normalmente la lista de participantes de un grupo (nombres y, a veces, teléfonos), la información de un grupo o un chat. ' +
  'Tu trabajo es solo TRANSCRIBIR cada contacto visible, en el MISMO ORDEN en que aparece.\n' +
  'Reglas estrictas:\n' +
  '- Un contacto = una fila. NUNCA mezcles datos de contactos distintos.\n' +
  '- "whatsappName" es el nombre tal como se ve en WhatsApp, EXACTO (con emojis, apodos, mayúsculas y símbolos). Si solo se ve un teléfono (contacto no guardado), "whatsappName" es null.\n' +
  '- "phone": transcribe el teléfono tal cual, con sus dígitos y prefijo si lo trae; no lo completes ni lo corrijas. Si no se ve ningún teléfono, null. NUNCA inventes un teléfono.\n' +
  '- "guardian" (padre, madre o tutor) y "student" (alumno relacionado) SOLO si el propio nombre lo dice de forma explícita (por ejemplo «Mamá de Eric», «Padre de Lucía G.»: guardian = el nombre que aparece antes de «de» si lo hay, student = «Eric»). Si no se dice, null en ambos. No deduzcas nada.\n' +
  '- Ignora a quien aparece como «Tú», los estados, las horas, los mensajes, las fotos y cualquier texto que no sea un contacto.\n' +
  '- Si algo está cortado, borroso o es dudoso, pon tu mejor lectura y "uncertain": true.\n' +
  'Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"rows": [{"whatsappName": "Mamá de Eric ❤️", "phone": "+34 612 345 678", "guardian": null, "student": "Eric", "uncertain": false}]}\n' +
  'Si la imagen no contiene ningún contacto de WhatsApp o no se puede leer casi nada, responde {"rows": []}.'

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max)
  return s || null
}

export const whatsappContactsSpec: AiPurposeSpec<WhatsappContactsInput, WhatsappContactsOutput> = {
  purpose: 'analyze-whatsapp-contacts',
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
    const rows: WhatsappContactRow[] = []
    for (const raw of parsed.rows.slice(0, 300)) {
      const r = asRecord(raw)
      if (!r) continue
      const whatsappName = str(r.whatsappName, 160)
      const phone = str(r.phone, 40)
      if (!whatsappName && !phone) continue
      rows.push({ whatsappName, phone, guardian: str(r.guardian, 160), student: str(r.student, 160), uncertain: r.uncertain === true })
    }
    return { rows }
  },
}
