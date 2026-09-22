import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// FASE 7.1 (F7-001) — antes llamaba a Gemini directamente, sin ai_gate. Mismo prompt exacto de siempre
// (documento familiar: DNI, carnet, pasaporte, tarjeta sanitaria, seguro, ITV...); solo cambia que ahora pasa
// por la puerta común (interruptor, tope diario, cuenta adulta, registro de uso).

export interface DocumentExpiryInput {
  fileBase64: string
  mimeType: string
}

export interface DocumentExpiryOutput {
  expiryDate: string | null
  documentType: string | null
}

const DOCUMENT_EXPIRY_PROMPT =
  'Este es un documento familiar (DNI, carnet de conducir, pasaporte, tarjeta sanitaria, ' +
  'seguro, pegatina de ITV, contrato u otro parecido). Busca su fecha de caducidad o ' +
  "vencimiento (puede venir como 'CADUCA', 'VALIDEZ', 'VÁLIDO HASTA', 'VENCE', fecha ITV " +
  'próxima revisión, o similar) y qué tipo de documento es. Responde ÚNICAMENTE un objeto ' +
  'JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"expiryDate": "YYYY-MM-DD o null si no se ve ninguna fecha de caducidad", ' +
  '"documentType": "nombre corto del documento (p. ej. \'DNI\', \'Carnet de conducir\', ' +
  "'Seguro del coche') o null si no se reconoce\"}\n" +
  'Si el documento no tiene fecha de caducidad (p. ej. un certificado de nacimiento) o no ' +
  'se distingue con claridad, usa expiryDate:null — nunca inventes ni calcules una fecha.'

export const documentExpirySpec: AiPurposeSpec<DocumentExpiryInput, DocumentExpiryOutput> = {
  purpose: 'analyze-document-expiry',
  maxOutputTokens: 512,

  readInput(body) {
    const { fileBase64, mimeType } = body
    if (typeof fileBase64 !== 'string' || !fileBase64 || typeof mimeType !== 'string' || !mimeType) return { ok: false, error: 'missing file' }
    return { ok: true, input: { fileBase64, mimeType } }
  },

  buildParts({ fileBase64, mimeType }) {
    return [{ text: DOCUMENT_EXPIRY_PROMPT }, { inlineData: { mimeType, data: fileBase64 } }]
  },

  // Nunca lanza: si Gemini no devuelve JSON válido, se devuelve vacío (el cliente deja los campos como
  // estaban) — mismo comportamiento de siempre, no un 502 "ai_invalid_output".
  parseOutput(rawText) {
    const parsed = asRecord(parseJsonLoose(rawText))
    if (!parsed) return { expiryDate: null, documentType: null }
    const expiryDate = typeof parsed.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiryDate) ? parsed.expiryDate : null
    const documentType = typeof parsed.documentType === 'string' && parsed.documentType.trim() ? parsed.documentType.trim() : null
    return { expiryDate, documentType }
  },
}
