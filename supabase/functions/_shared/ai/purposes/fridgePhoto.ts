import type { AiPurposeSpec } from '../types.ts'
import { parseJsonLoose } from '../validate.ts'

// FASE 7.1 (F7-001) — antes llamaba a Gemini directamente, sin ai_gate. Mismo prompt exacto de siempre.
// Nota de auditoría (Fase 7.0, F7-010): hoy no hay ninguna pantalla que llame a esta función (la Skill de
// Inventario/FatSecret se quitó del frontend) — sigue viva porque el servidor no puede borrarse desde aquí.
// Se corrige igualmente para que, si se reactivase, ya nazca con el mismo control que el resto de la IA.

export interface FridgePhotoInput {
  imageBase64: string
  mimeType: string
}

export interface FridgePhotoOutput {
  items: string[]
}

const MAX_ITEMS = 60
const MAX_ITEM_LEN = 80

const FRIDGE_PHOTO_PROMPT =
  'Enumera los alimentos y productos visibles en esta foto de una nevera, congelador o despensa. ' +
  'Responde ÚNICAMENTE un array JSON de strings en español, cada uno un nombre corto de producto ' +
  '(ejemplo: ["leche", "huevos", "tomates", "yogures"]). Sin texto adicional ni markdown, solo el array JSON.'

export const fridgePhotoSpec: AiPurposeSpec<FridgePhotoInput, FridgePhotoOutput> = {
  purpose: 'analyze-fridge-photo',
  maxOutputTokens: 1024,

  readInput(body) {
    const { imageBase64, mimeType } = body
    if (typeof imageBase64 !== 'string' || !imageBase64 || typeof mimeType !== 'string' || !mimeType) return { ok: false, error: 'missing image' }
    return { ok: true, input: { imageBase64, mimeType } }
  },

  buildParts({ imageBase64, mimeType }) {
    return [{ text: FRIDGE_PHOTO_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }]
  },

  // Nunca lanza: si Gemini no devuelve un array JSON válido, se devuelve vacío — mismo comportamiento de
  // siempre, no un 502 "ai_invalid_output".
  parseOutput(rawText) {
    const parsed = parseJsonLoose(rawText)
    if (!Array.isArray(parsed)) return { items: [] }
    const items = parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim().slice(0, MAX_ITEM_LEN))
      .slice(0, MAX_ITEMS)
    return { items }
  },
}
