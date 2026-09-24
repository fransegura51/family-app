import type { AiPurposeSpec } from '../types.ts'
import { asRecord, parseJsonLoose } from '../validate.ts'

// FASE 7.1 (F7-001) — antes esta función llamaba a Gemini directamente (sin ai_gate: sin interruptor, sin
// tope diario, sin restricción a cuentas adultas, sin quedar registrada en ai_usage_daily). Ahora pasa por el
// mismo propósito que ya usan pepa-intent/split-grocery-list/recipe-generate, con TODO el mismo control.
//
// Mismo prompt de siempre (Skill de lectura de tickets españoles: columnas CANT/PVP/TOTAL, productos por
// peso, cantidad entera al principio de la línea...) — este archivo NO cambia QUIÉN puede pedirlo ni cuánto,
// solo (Corrección PESO-1) cómo se representa una línea vendida por peso. Lo usan analyze-receipt-photo
// (usuario con sesión) y mercadona-ticket-webhook (automatización por token de familia): un único sitio con
// el prompt y el parseo, para no mantenerlo escrito dos veces.
//
// Corrección PESO — bug real demostrado con un ticket real de Mercadona (18/09/2026): "PEPINO" se vendía a
// 1,70 €/kg (1,554 kg, 2,64 € pagados), pero el prompt anterior ordenaba explícitamente IGNORAR el peso y el
// precio por kg, y quedaba guardado como si fuese "1 ud a 2,64 €/ud" — mezclando el importe pagado con el
// precio comparable. Ahora el esquema tiene un campo propio para cada cosa: `quantity` (unidades, o peso en
// kg), `unit` ('ud' o 'kg'), `unitPrice` (precio por unidad o por kg — la magnitud comparable de verdad) y
// `lineTotal` (el importe en euros realmente cobrado por la línea, para que el total del ticket nunca se
// altere). Gemini sigue sin calcular nada: en cualquier formato, los 4 valores son números YA IMPRESOS en el
// ticket — nunca una multiplicación/división hecha por el modelo.

export interface ReceiptPhotoInput {
  imageBase64: string
  mimeType: string
}

export type ReceiptPhotoUnit = 'ud' | 'kg'

export interface ReceiptPhotoItem {
  name: string
  // Nº de unidades compradas, o el peso EXACTO en kg (con decimales) cuando unit === 'kg'. Nunca redondeado
  // en el caso de peso — sí se sigue redondeando a entero en el caso de unidades (ver parseReceiptPhotoOutput).
  quantity: number
  unit: ReceiptPhotoUnit
  // Precio por unidad, o precio por kg cuando unit === 'kg' — la magnitud comparable entre compras.
  unitPrice: number
  // Importe en euros REALMENTE cobrado por esa línea (impreso en el ticket) — nunca se reconstruye
  // multiplicando quantity × unitPrice, para no arrastrar redondeos: es el propio número impreso.
  lineTotal: number
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
  '"total": numero_o_null, "items": [{"name": "producto", "quantity": numero, "unit": "ud" o "kg", ' +
  '"unitPrice": numero, "lineTotal": numero}]}\n' +
  'Incluye en items TODAS las líneas de producto que veas, una por cada producto comprado ' +
  '(no líneas de total, subtotal, IVA, cambio o forma de pago). ' +
  'IMPORTANTE — nunca calcules ni multipliques ni dividas tú los números: cada campo es SIEMPRE un ' +
  'número que aparece IMPRESO tal cual en esa línea del ticket, nunca algo que tengas que derivar. ' +
  '"lineTotal" es siempre el importe en euros realmente cobrado por esa línea (normalmente el último ' +
  'número, el más a la derecha).\n' +
  '"unit" es "kg" ÚNICAMENTE cuando la propia línea del ticket demuestre explícitamente una venta por ' +
  'peso (un peso variable en kg y un precio por kg impresos, ver formato 4 más abajo). En cualquier otro ' +
  'caso usa siempre "ud" — incluido cuando el NOMBRE del producto menciona un peso o tamaño ' +
  '(p. ej. "GUACAMOLE 500 GR", "AGUA 1,5L", "ACEITE 1L"): eso es solo el tamaño del envase, no una venta ' +
  'por peso variable, y no es prueba de nada — la única evidencia válida es la propia línea del ticket, ' +
  'nunca el nombre del producto. Ante la duda, "ud".\n' +
  'Hay cuatro formatos típicos:\n' +
  "1) Línea simple, un solo precio (p. ej. 'Pan 1,80'): quantity=1, unit=\"ud\", unitPrice=1.80, " +
  'lineTotal=1.80 (el único número impreso, en los dos campos).\n' +
  '2) Varias unidades del mismo producto, con cantidad ENTERA al principio y dos precios impresos ' +
  "(p. ej. '2 Bolsa patatas 3,00 6,00'): quantity=2 (el número entero de unidades), unit=\"ud\", " +
  'unitPrice=3.00 (el precio impreso de una unidad, NUNCA el importe total), lineTotal=6.00 (el importe ' +
  'TOTAL de la línea, el último número). Si esa línea no imprime el precio de una unidad por separado, ' +
  'solo el total, pon unitPrice=null (nunca lo calcules tú).\n' +
  '3) Ticket con columnas CANT | DESCRIPCION | PVP | TOTAL: la columna CANT suele venir ' +
  'escrita con coma y dos decimales AUNQUE sea un número entero de unidades (p. ej. ' +
  "'3,00  CERVEZA ESTRELLA  1,10  3,30' significa 3 unidades a 1,10€ cada una, 3,30€ en total) — " +
  'quantity=el número de la columna CANT redondeado a entero (3, no 3,00), unit="ud", unitPrice=el ' +
  'importe de la columna PVP (1,10), lineTotal=el importe de la columna TOTAL (el último número, 3,30). ' +
  'No confundas esta columna CANT con un precio: si el ticket tiene columnas CANT/PVP/TOTAL, el primer ' +
  'número de la línea es SIEMPRE cantidad, nunca dinero.\n' +
  '4) Producto vendido por PESO, con un peso variable en kg y un precio por kg impresos en la misma ' +
  "línea (p. ej. 'Solomillo cerdo — 0,495 kg x 10,25 €/kg — 5,07', o un ticket con el peso y el precio " +
  "por kg en columnas separadas): quantity=el peso EXACTO en kg tal como aparece impreso (0.495, con " +
  'todos sus decimales, NUNCA redondeado a un número entero — un peso nunca es 1), unit="kg", ' +
  'unitPrice=el precio por kg impreso (10.25), lineTotal=el importe final en euros realmente cobrado ' +
  '(5.07). Si el peso está impreso en gramos, conviértelo tú a kg (dividir entre 1000, p. ej. 495 g = ' +
  '0.495) — kg es la única unidad de peso válida aquí, nunca gramos. Los tres números (peso, precio/kg, ' +
  'importe) están siempre impresos por separado: extráelos tal cual, nunca los ignores ni derives uno de otro.\n' +
  'Si tienes cualquier duda sobre una línea y no puedes distinguir con seguridad un formato de venta ' +
  'por peso, usa quantity=1, unit="ud" y el último número en euros de la línea como unitPrice y como ' +
  'lineTotal — es preferible eso a inventar un peso o un precio por kg que no ves con seguridad. ' +
  'Los números, con punto decimal.'

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
      .filter((it: unknown): it is Record<string, unknown> => typeof it === 'object' && it !== null)
      .map((it: Record<string, unknown>) => {
        // Validación ESTRICTA, sin parsear texto libre: SOLO el literal exacto 'kg' cuenta como venta por
        // peso — cualquier otra cosa (ausente, "Kg", "gr", "unidad"...) es "ud". Nunca se infiere por el
        // nombre del producto: si Gemini no lo marcó explícitamente, es "ud".
        const unit: ReceiptPhotoUnit = it.unit === 'kg' ? 'kg' : 'ud'
        const rawQuantity = typeof it.quantity === 'number' ? it.quantity : Number(it.quantity)
        const quantity =
          unit === 'kg'
            ? // Peso: se conserva el decimal exacto — un peso NUNCA se redondea a un número entero.
              Number.isFinite(rawQuantity) && rawQuantity > 0
              ? rawQuantity
              : 1
            : // Unidades: mismo redondeo protector de siempre (la columna CANT a veces llega con ruido decimal).
              Number.isFinite(rawQuantity) && rawQuantity > 0
              ? Math.round(rawQuantity)
              : 1
        const rawLineTotal = typeof it.lineTotal === 'number' ? it.lineTotal : Number(it.lineTotal)
        // Compatibilidad: una respuesta con el esquema antiguo (campo "price", el importe total de la
        // línea, sin "lineTotal") nunca debe romper el parser — se acepta igual como importe de línea.
        const legacyPrice = typeof it.price === 'number' ? it.price : Number(it.price)
        const lineTotal = Number.isFinite(rawLineTotal) ? rawLineTotal : legacyPrice
        const rawUnitPrice = typeof it.unitPrice === 'number' ? it.unitPrice : Number(it.unitPrice)
        // Si el modelo no ha podido leer un precio unitario impreso por separado (formato 2 sin desglose),
        // se deriva del importe total — nunca al revés: el importe impreso siempre manda sobre el derivado.
        const unitPrice = Number.isFinite(rawUnitPrice) && rawUnitPrice > 0 ? rawUnitPrice : quantity > 0 ? lineTotal / quantity : lineTotal
        return {
          name: typeof it.name === 'string' ? it.name : '',
          quantity,
          unit,
          unitPrice,
          lineTotal,
        }
      })
      .filter((it: ReceiptPhotoItem) => it.name.trim() && Number.isFinite(it.lineTotal) && Number.isFinite(it.unitPrice))
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
