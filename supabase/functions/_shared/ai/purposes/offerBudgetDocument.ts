import type { AiPurposeSpec } from '../types.ts'
import { asCleanString, asIsoDate, asRecord, parseJsonLoose } from '../validate.ts'

// PEPA Eventos, prompt maestro — Fase 6, Parte B3: "Importar presupuesto" (foto o PDF de un proveedor) →
// propuesta de oferta + servicios estructurados (B2), que la familia revisa y corrige antes de guardar.
// Mismo patrón que providerContactDocument.ts: un único lector, SIEMPRE una propuesta, nunca guarda nada.
// REGLA FUNDAMENTAL: nunca inventar un dato, una cantidad o un precio que no esté impreso con claridad en
// el documento; los números de cada línea son SIEMPRE los que aparecen impresos, nunca calculados por el
// modelo (igual que receiptPhoto.ts) — "Pack básico de flores: 300€" no implica cantidad=1/precio=300 si
// no está impreso así; en ese caso isPackage=true y quantity/unitPrice quedan null.

export interface OfferBudgetDocumentInput {
  fileBase64: string
  mimeType: string
}

export interface OfferBudgetDocumentItem {
  name: string
  description: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  subtotal: number | null
  isPackage: boolean
}

export interface OfferBudgetDocumentOutput {
  providerName: string | null
  amount: number | null
  offerDate: string | null
  validUntil: string | null
  conditions: string | null
  notes: string | null
  items: OfferBudgetDocumentItem[]
}

const OFFER_BUDGET_DOCUMENT_PROMPT =
  'Este documento (foto o PDF) es un PRESUPUESTO u OFERTA de un proveedor para un evento familiar (floristería, ' +
  'catering, fotógrafo, DJ, local, etc.). Tu trabajo es EXTRAER los datos para que una persona los revise después.\n' +
  'Reglas estrictas:\n' +
  '- NUNCA inventes ni completes ningún dato. Si un campo no aparece con claridad, null.\n' +
  '- NUNCA calcules, multipliques ni dividas tú ningún número: cada cantidad/precio es SIEMPRE el que aparece ' +
  'impreso tal cual en el documento.\n' +
  '- "providerName": el nombre comercial del proveedor que emite el presupuesto, si aparece.\n' +
  '- "amount": el importe TOTAL final del presupuesto (el que de verdad habría que pagar), tal como aparece ' +
  'impreso — nunca la suma de las líneas calculada por ti, aunque creas que coinciden.\n' +
  '- "offerDate": la fecha del propio presupuesto (cuándo se emitió), formato YYYY-MM-DD, o null.\n' +
  '- "validUntil": la fecha de validez de la oferta si aparece, formato YYYY-MM-DD, o null.\n' +
  '- "conditions": condiciones de pago, señal, cancelación o similar, tal como aparecen resumidas, o null.\n' +
  '- "notes": cualquier otra nota relevante que no encaje en los campos anteriores, o null.\n' +
  '- "items": una línea por cada servicio/producto presupuestado. Para cada línea:\n' +
  '  - "name": el nombre del servicio/producto, breve.\n' +
  '  - "description": detalle adicional de esa línea si lo hay, o null.\n' +
  '  - "quantity"/"unit": SOLO si la propia línea imprime una cantidad y una unidad con claridad (p. ej. "3 ' +
  'horas", "50 ud"). Si no hay cantidad impresa, ambos null.\n' +
  '  - "unitPrice": SOLO si la línea imprime un precio por unidad separado del subtotal. Si no, null.\n' +
  '  - "subtotal": el importe de esa línea tal como aparece impreso, o null si la línea no tiene un importe ' +
  'propio (p. ej. es solo un título de sección).\n' +
  '  - "isPackage": true cuando la línea es un paquete/precio cerrado sin un desglose real de cantidad × precio ' +
  '(p. ej. "Pack básico — 300€" sin que se pueda saber a qué correspondería "una unidad"); en ese caso deja ' +
  'quantity/unit/unitPrice en null y solo rellena subtotal. false en cualquier otro caso.\n' +
  'Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"providerName": "texto o null", "amount": numero_o_null, "offerDate": "YYYY-MM-DD o null", ' +
  '"validUntil": "YYYY-MM-DD o null", "conditions": "texto o null", "notes": "texto o null", ' +
  '"items": [{"name": "texto", "description": "texto o null", "quantity": numero_o_null, "unit": "texto o null", ' +
  '"unitPrice": numero_o_null, "subtotal": numero_o_null, "isPackage": true_o_false}]}\n' +
  'Si el documento no es un presupuesto ni tiene datos legibles, responde con todos los campos en null e items ' +
  'como lista vacía.'

function asPositiveNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// Nunca lanza: una respuesta ilegible se trata igual que "no se pudo leer nada" (todo null, items vacío).
export function parseOfferBudgetDocumentOutput(rawText: string): OfferBudgetDocumentOutput {
  const empty: OfferBudgetDocumentOutput = { providerName: null, amount: null, offerDate: null, validUntil: null, conditions: null, notes: null, items: [] }
  const parsed = asRecord(parseJsonLoose(rawText))
  if (!parsed) return empty
  let items: OfferBudgetDocumentItem[] = []
  if (Array.isArray(parsed.items)) {
    items = parsed.items
      .filter((it: unknown): it is Record<string, unknown> => typeof it === 'object' && it !== null)
      .map((it: Record<string, unknown>) => ({
        name: asCleanString(it.name, 160) ?? '',
        description: asCleanString(it.description, 2000),
        quantity: asPositiveNumber(it.quantity),
        unit: asCleanString(it.unit, 40),
        unitPrice: asPositiveNumber(it.unitPrice),
        subtotal: asPositiveNumber(it.subtotal),
        isPackage: it.isPackage === true,
      }))
      .filter((it: OfferBudgetDocumentItem) => it.name.trim())
  }
  return {
    providerName: asCleanString(parsed.providerName, 160),
    amount: asPositiveNumber(parsed.amount),
    offerDate: asIsoDate(parsed.offerDate),
    validUntil: asIsoDate(parsed.validUntil),
    conditions: asCleanString(parsed.conditions, 2000),
    notes: asCleanString(parsed.notes, 2000),
    items,
  }
}

export const offerBudgetDocumentSpec: AiPurposeSpec<OfferBudgetDocumentInput, OfferBudgetDocumentOutput> = {
  purpose: 'analyze-offer-budget-document',
  maxOutputTokens: 4096,

  readInput(body) {
    const { fileBase64, mimeType } = body
    if (typeof fileBase64 !== 'string' || !fileBase64 || typeof mimeType !== 'string' || !mimeType) return { ok: false, error: 'missing file' }
    return { ok: true, input: { fileBase64, mimeType } }
  },

  buildParts({ fileBase64, mimeType }) {
    return [{ text: OFFER_BUDGET_DOCUMENT_PROMPT }, { inlineData: { mimeType, data: fileBase64 } }]
  },

  parseOutput(rawText) {
    return parseOfferBudgetDocumentOutput(rawText)
  },
}
