import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// FASE 7.1 (F7-001) — antes esta función llamaba a Gemini directamente (sin ai_gate: sin interruptor, sin
// tope diario, sin restricción a cuentas adultas, sin quedar registrada en ai_usage_daily). Ahora pasa por el
// mismo propósito que ya usan pepa-intent/split-grocery-list/recipe-generate, con TODO el mismo control.
//
// Mismo prompt exacto de siempre (Skill de lectura de tickets españoles: columnas CANT/PVP/TOTAL, productos
// por peso, cantidad entera al principio de la línea...) — este archivo NO cambia cómo se lee un ticket,
// solo QUIÉN puede pedirlo y cuánto. Lo usan analyze-receipt-photo (usuario con sesión) y
// mercadona-ticket-webhook (automatización por token de familia): un único sitio con el prompt y el parseo,
// para no mantenerlo escrito dos veces.

export interface ReceiptPhotoInput {
  imageBase64: string
  mimeType: string
}

export interface ReceiptPhotoItem {
  name: string
  quantity: number
  price: number
}

export interface ReceiptPhotoOutput {
  store: string | null
  date: string | null
  total: number | null
  items: ReceiptPhotoItem[]
}

export const RECEIPT_PHOTO_PROMPT =
  'Lee este ticket de compra español y extrae sus datos. Responde ÚNICAMENTE un objeto JSON ' +
  'con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"store": "nombre del establecimiento o null", "date": "YYYY-MM-DD o null", ' +
  '"total": numero_o_null, "items": [{"name": "producto", "quantity": numero, "price": numero}]}\n' +
  'Incluye en items TODAS las líneas de producto que veas, una por cada producto comprado ' +
  '(no líneas de total, subtotal, IVA, cambio o forma de pago). ' +
  'IMPORTANTE — nunca calcules ni multipliques tú los números: usa siempre el importe en euros ' +
  'que aparece IMPRESO como el pagado por esa línea (normalmente el último número de la línea, ' +
  'el más a la derecha). Hay cuatro formatos típicos, y \'quantity\' significa cosas distintas en cada uno:\n' +
  "1) Línea simple, un solo precio (p. ej. 'Pan 1,80'): quantity=1, price=el precio impreso.\n" +
  '2) Varias unidades del mismo producto, con cantidad ENTERA al principio (p. ej. ' +
  "'2 Bolsa patatas 3,00 6,00'): quantity=2 (el número entero de unidades), price=6.00 " +
  '(el importe TOTAL de la línea, el último número), NUNCA el precio unitario (3,00).\n' +
  '3) Ticket con columnas CANT | DESCRIPCION | PVP | TOTAL: la columna CANT suele venir ' +
  'escrita con coma y dos decimales AUNQUE sea un número entero de unidades (p. ej. ' +
  "'3,00  CERVEZA ESTRELLA  1,10  3,30' significa 3 unidades a 1,10€ cada una, 3,30€ en total) — " +
  'quantity=el número de la columna CANT redondeado a entero (3, no 3,00), price=el importe de ' +
  'la columna TOTAL (el último número, 3,30), NUNCA el de la columna PVP (1,10, ese es el precio ' +
  'de una sola unidad, no lo uses como price). No confundas esta columna CANT con un precio: si ' +
  'el ticket tiene columnas CANT/PVP/TOTAL, el primer número de la línea es SIEMPRE cantidad, ' +
  'nunca dinero.\n' +
  '4) Producto vendido por PESO, con un peso en kg y un precio por kg (p. ej. ' +
  "'Solomillo cerdo — 0,495 kg x 10,25 €/kg — 5,07'): esto NO es una cantidad de unidades — " +
  'usa quantity=1 y price=el importe final en euros realmente cobrado (5,07 en ese ejemplo), ' +
  'IGNORA el peso en kg y el precio por kg, no los uses para calcular nada.\n' +
  'Si tienes cualquier duda sobre una línea, usa quantity=1 y el último número en euros de la ' +
  'línea como price — es preferible eso a inventar una cantidad. Los precios en euros, como ' +
  'número con punto decimal.'

// Nunca lanza: si Gemini no devuelve JSON válido, se devuelve vacío (el cliente ya avisa de revisar antes de
// guardar) — mismo comportamiento de siempre, no un 502 "ai_invalid_output".
export function parseReceiptPhotoOutput(rawText: string): ReceiptPhotoOutput {
  const parsed = asRecord(parseJsonLoose(rawText))
  if (!parsed) return { store: null, date: null, total: null, items: [] }
  const store = typeof parsed.store === 'string' ? parsed.store : null
  const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null
  const total = typeof parsed.total === 'number' ? parsed.total : null
  let items: ReceiptPhotoItem[] = []
  if (Array.isArray(parsed.items)) {
    items = parsed.items
      .filter((it: unknown): it is { name: unknown; quantity: unknown; price: unknown } => typeof it === 'object' && it !== null)
      .map((it: { name: unknown; quantity: unknown; price: unknown }) => {
        const quantity = typeof it.quantity === 'number' ? it.quantity : Number(it.quantity)
        return {
          name: typeof it.name === 'string' ? it.name : '',
          // Redondeado: la columna CANT de algunos tickets viene como "3,00", que a veces Gemini devuelve con
          // ruido decimal (2.98, 3.01...) — nunca debería contar como fracción de unidad.
          quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : 1,
          price: typeof it.price === 'number' ? it.price : Number(it.price),
        }
      })
      .filter((it: ReceiptPhotoItem) => it.name.trim() && Number.isFinite(it.price))
  }
  return { store, date, total, items }
}

export const receiptPhotoSpec: AiPurposeSpec<ReceiptPhotoInput, ReceiptPhotoOutput> = {
  purpose: 'analyze-receipt-photo',
  maxOutputTokens: 4096,

  readInput(body) {
    const { imageBase64, mimeType } = body
    if (typeof imageBase64 !== 'string' || !imageBase64 || typeof mimeType !== 'string' || !mimeType) return { ok: false, error: 'missing image' }
    return { ok: true, input: { imageBase64, mimeType } }
  },

  buildParts({ imageBase64, mimeType }) {
    return [{ text: RECEIPT_PHOTO_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }]
  },

  parseOutput(rawText) {
    return parseReceiptPhotoOutput(rawText)
  },
}
