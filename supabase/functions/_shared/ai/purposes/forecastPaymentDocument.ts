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
  // BUG REAL (documento SUMA, 2026-09-29): fecha de cada cuota, en orden, SOLO cuando el propio documento
  // las lista una a una en su calendario/cuadro de amortización — nunca calculada. Sin este campo, una
  // fecha irregular en el calendario real (una cuota que cae dos días más tarde que las demás) se perdía
  // siempre, porque el motor solo sabía anclar la primera fecha y repetir por periodicidad pura.
  installmentDueDates: string[] | null
}

const FORECAST_PAYMENT_DOCUMENT_PROMPT =
  'Este es un documento de financiación, préstamo, crédito, compra fraccionada, calendario de cuotas, ' +
  'factura con pagos futuros o contrato con vencimientos (puede ser una foto de un documento en papel, ' +
  'un PDF, o una captura de una app o web). Busca ÚNICAMENTE los datos que aparezcan con claridad o se ' +
  'puedan calcular sin ambigüedad — NUNCA inventes ni calcules un dato que no esté respaldado por el ' +
  'propio documento.\n' +
  'Si el documento incluye un CALENDARIO, CUADRO DE AMORTIZACIÓN o TABLA DE CUOTAS explícito (columnas ' +
  'como fecha de cargo, importe de cuota, número de cuota...), esa tabla manda sobre cualquier otro ' +
  'número del documento: usa sus fechas e importes de cuota reales, fila a fila, en vez de un resumen o ' +
  'un texto suelto en otra parte del documento. Dentro de esa tabla, si hay varias columnas de importe ' +
  '(p. ej. "deuda", "intereses", "importe de cargo/total"), usa el importe que REALMENTE se cobrará de ' +
  'cada cuota (el total de esa fila, normalmente la última columna) para installmentAmount/' +
  'installmentAmounts — nunca una columna parcial como solo el principal o solo los intereses.\n' +
  '"totalAmount" es el importe total financiado, adeudado o pendiente ANTES de repartirlo en cuotas (p. ' +
  'ej. la fila "Total deuda" o el importe total de la compra/financiación) — NUNCA el importe de una sola ' +
  'cuota, aunque una cuota individual se le parezca en magnitud. Si el documento no da un total explícito ' +
  'pero sí una tabla de cuotas, dejar totalAmount en null es preferible a adivinarlo.\n' +
  'Responde ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto adicional ni markdown:\n' +
  '{"provider": "el organismo/entidad/comercio/acreedor real (p. ej. el nombre de la empresa o ' +
  'administración que emite el documento), o null", ' +
  '"concept": "una descripción breve y útil de a qué corresponde el pago (p. ej. \'Financiación lavadora\', ' +
  '\'Préstamo coche\', \'Aplazamiento de deuda tributaria\') — NUNCA copies literalmente el título/' +
  'encabezado administrativo del documento si no es en sí mismo una descripción útil (p. ej. si el título ' +
  'es \'Solicitud de Aplazamiento o fraccionamiento\', el concepto debería describir de qué deuda se trata, ' +
  'no repetir ese título), o null si no se puede determinar con confianza", ' +
  '"totalAmount": número (importe total, ver arriba) o null, ' +
  '"installmentCount": número entero de cuotas TOTALES (pagadas + pendientes) o null, ' +
  '"installmentAmount": número (importe real de cada cuota, si todas son iguales) o null, ' +
  '"installmentAmounts": [números] con el importe real de CADA cuota, en el mismo orden que aparecen en el ' +
  'documento, SOLO si el documento las lista una a una (da igual que sean todas iguales o distintas) — si ' +
  'no hay una tabla/calendario que las liste, usa null aquí (y usa installmentAmount si se puede inferir), ' +
  '"firstDueDate": "YYYY-MM-DD" de la primera cuota (o la próxima cuota pendiente si el documento no dice ' +
  'la primera), o null, ' +
  '"periodicity": una de "mensual", "semanal", "trimestral", "anual", o null si no se indica u otra, ' +
  '"lastDueDate": "YYYY-MM-DD" de la última cuota, SOLO si aparece explícitamente en el documento (nunca ' +
  'la calcules tú a partir de las demás) — o null, ' +
  '"paidInstallments": número entero de cuotas YA abonadas, SOLO si el documento lo indica con claridad ' +
  '(p. ej. un recibo de "cuota 4 de 12") — o null, ' +
  '"installmentDueDates": ["YYYY-MM-DD", ...] con la fecha real de CADA cuota, en el mismo orden que el ' +
  'documento, SOLO si el documento las lista una a una — no las calcules a partir de la primera fecha y la ' +
  'periodicidad: si el documento no lista cada fecha por separado, deja esto en null}\n' +
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
      installmentDueDates: null,
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
    const installmentDueDates =
      Array.isArray(parsed.installmentDueDates) && parsed.installmentDueDates.length > 1 && parsed.installmentDueDates.every((v) => asIsoDate(v) != null)
        ? (parsed.installmentDueDates as string[])
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
      installmentDueDates,
    }
  },
}
