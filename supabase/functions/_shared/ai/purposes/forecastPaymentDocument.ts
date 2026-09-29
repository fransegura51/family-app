import type { AiPurposeSpec } from '../types.ts'
import { asCleanString, asIsoDate, asRecord, parseJsonLoose } from '../validate.ts'

// Previsión de pagos — "Importar desde foto o documento" (financiación de una compra, préstamo/crédito,
// compra fraccionada, calendario de cuotas, factura con pagos futuros, contrato con vencimientos...).
// Mismo espíritu que documentExpiry (un documento familiar genérico, pocos campos, nunca inventar) más
// que receiptPhoto (que desglosa líneas de ticket) — aquí no hay "líneas de producto", hay una serie de
// cuotas. La salida se usa SIEMPRE como propuesta editable (ForecastPaymentPrefill, FinanceScreen.tsx) —
// esta función nunca guarda nada, y el propio formulario de Previsión ya existente es la pantalla de
// revisión: no hace falta una pantalla nueva.

export interface ForecastPaymentDocumentInput {
  fileBase64: string
  mimeType: string
}

export interface ForecastPaymentDocumentOutput {
  provider: string | null
  concept: string | null
  totalAmount: number | null
  installmentCount: number | null
  // Importe de cuota asumiendo que todas son iguales (el caso normal: "12 cuotas de 100€").
  installmentAmount: number | null
  // Solo cuando el documento indica EXPLÍCITAMENTE importes de cuota distintos entre sí, en orden — nunca
  // una invención: si no se puede leer cada importe por separado, se deja null y manda installmentAmount.
  installmentAmounts: number[] | null
  firstDueDate: string | null
  periodicity: 'mensual' | 'semanal' | 'trimestral' | 'anual' | null
  lastDueDate: string | null
  paidInstallments: number | null
}

const FORECAST_PAYMENT_DOCUMENT_PROMPT =
  'Este es un documento de financiación, préstamo, crédito, compra fraccionada, calendario de cuotas, ' +
  'factura con pagos futuros o contrato con vencimientos (puede ser una foto de un documento en papel, ' +
  'un PDF, o una captura de una app o web). Busca ÚNICAMENTE los datos que aparezcan con claridad o se ' +
  'puedan calcular sin ambigüedad — NUNCA inventes ni calcules un dato que no esté respaldado por el ' +
  'propio documento. Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni ' +
  'markdown:\n' +
  '{"provider": "entidad/comercio/acreedor, o null", ' +
  '"concept": "de qué es el pago (p. ej. \'Financiación lavadora\', \'Préstamo coche\'), o null", ' +
  '"totalAmount": número (importe total financiado o pendiente) o null, ' +
  '"installmentCount": número entero de cuotas TOTALES (pagadas + pendientes) o null, ' +
  '"installmentAmount": número (importe de cada cuota, si todas son iguales) o null, ' +
  '"installmentAmounts": [números] SOLO si el documento lista cada cuota con un importe distinto, en ' +
  'orden — si todas son iguales o no se pueden leer una a una, usa null aquí (y usa installmentAmount), ' +
  '"firstDueDate": "YYYY-MM-DD" de la primera cuota (o la próxima cuota pendiente si el documento no dice ' +
  'la primera), o null, ' +
  '"periodicity": una de "mensual", "semanal", "trimestral", "anual", o null si no se indica u otra, ' +
  '"lastDueDate": "YYYY-MM-DD" de la última cuota, SOLO si aparece explícitamente en el documento (nunca ' +
  'la calcules tú a partir de las demás) — o null, ' +
  '"paidInstallments": número entero de cuotas YA abonadas, SOLO si el documento lo indica con claridad ' +
  '(p. ej. un recibo de "cuota 4 de 12") — o null}\n' +
  'Si el documento no tiene nada que ver con un pago financiado/aplazado, o no se puede leer casi nada, ' +
  'deja todos los campos en null.'

export const forecastPaymentDocumentSpec: AiPurposeSpec<ForecastPaymentDocumentInput, ForecastPaymentDocumentOutput> = {
  purpose: 'analyze-forecast-document',
  maxOutputTokens: 768,

  readInput(body) {
    const { fileBase64, mimeType } = body
    if (typeof fileBase64 !== 'string' || !fileBase64 || typeof mimeType !== 'string' || !mimeType) return { ok: false, error: 'missing file' }
    return { ok: true, input: { fileBase64, mimeType } }
  },

  buildParts({ fileBase64, mimeType }) {
    return [{ text: FORECAST_PAYMENT_DOCUMENT_PROMPT }, { inlineData: { mimeType, data: fileBase64 } }]
  },

  // Nunca lanza: si Gemini no devuelve JSON válido (o casi nada útil), se devuelve todo en null — el
  // cliente lo interpreta como "no se pudo extraer nada" y ofrece volver al formulario manual (mismo
  // criterio que documentExpiry: nunca un 502 por una respuesta rara del modelo).
  parseOutput(rawText) {
    const empty: ForecastPaymentDocumentOutput = {
      provider: null,
      concept: null,
      totalAmount: null,
      installmentCount: null,
      installmentAmount: null,
      installmentAmounts: null,
      firstDueDate: null,
      periodicity: null,
      lastDueDate: null,
      paidInstallments: null,
    }
    const parsed = asRecord(parseJsonLoose(rawText))
    if (!parsed) return empty

    const asPositiveNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)
    const asPositiveInt = (value: unknown): number | null => {
      const n = asPositiveNumber(value)
      return n != null && Number.isInteger(n) ? n : null
    }
    const installmentAmounts =
      Array.isArray(parsed.installmentAmounts) && parsed.installmentAmounts.length > 1 && parsed.installmentAmounts.every((v) => asPositiveNumber(v) != null)
        ? (parsed.installmentAmounts as number[])
        : null

    return {
      provider: asCleanString(parsed.provider, 120),
      concept: asCleanString(parsed.concept, 120),
      totalAmount: asPositiveNumber(parsed.totalAmount),
      installmentCount: asPositiveInt(parsed.installmentCount),
      installmentAmount: asPositiveNumber(parsed.installmentAmount),
      installmentAmounts,
      firstDueDate: asIsoDate(parsed.firstDueDate),
      periodicity: (['mensual', 'semanal', 'trimestral', 'anual'] as const).includes(parsed.periodicity as never) ? (parsed.periodicity as ForecastPaymentDocumentOutput['periodicity']) : null,
      lastDueDate: asIsoDate(parsed.lastDueDate),
      paidInstallments: asPositiveInt(parsed.paidInstallments),
    }
  },
}
