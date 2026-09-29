// Previsión de pagos — "Importar desde foto o documento": puente puro entre lo que extrae la IA
// (analyze-forecast-document) y ForecastPaymentPrefill (FinanceScreen.tsx), el MISMO mecanismo de
// propuesta-revisable que ya usa la detección de patrones bancarios (forecastRecurrenceDetection.ts) — no
// se inventa una segunda forma de "proponer un pago previsto". Vive fuera de FinanceScreen.tsx para poder
// probarse con valores reales (huecos, periodicidades, cuotas desiguales) sin renderizar nada — mismo
// motivo que forecastInstallmentPlanForm.ts.
//
// Principio explícito (igual que forecastRecurrenceDetection.ts): DOCUMENTO → EXTRACCIÓN (IA) → PROPUESTA
// → REVISIÓN → CONFIRMACIÓN → PREVISIÓN. La IA nunca guarda nada; estas funciones nunca llaman a
// createForecastPayment ni a ningún dato real — solo transforman.
import { buildForecastRecurrenceRule, computeInstallmentPlanUntil, type ForecastCustomRecurrence } from './forecast'

export interface ForecastDocumentScanResult {
  provider: string | null
  concept: string | null
  totalAmount: number | null
  installmentCount: number | null
  installmentAmount: number | null
  installmentAmounts: number[] | null
  firstDueDate: string | null
  periodicity: 'mensual' | 'semanal' | 'trimestral' | 'anual' | null
  lastDueDate: string | null
  paidInstallments: number | null
  // BUG REAL (documento SUMA — aplazamiento tributario, 2026-09-29): fechas de cada cuota, en orden, SOLO
  // cuando el documento las lista explícitamente en su propio "cuadro de amortización" — nunca calculadas.
  // Sin este campo, un calendario con una fecha irregular (p. ej. la 2ª cuota el día 7 en vez del día 5)
  // era IMPOSIBLE de representar: el motor solo conocía firstDueDate + periodicidad, y regeneraba TODAS
  // las fechas siguientes por recurrencia pura, borrando cualquier excepción real del documento.
  installmentDueDates: string[] | null
}

export function isEmptyForecastDocumentScan(result: ForecastDocumentScanResult): boolean {
  return (
    result.provider == null &&
    result.concept == null &&
    result.totalAmount == null &&
    result.installmentCount == null &&
    result.installmentAmount == null &&
    result.installmentAmounts == null &&
    result.firstDueDate == null &&
    result.periodicity == null &&
    result.lastDueDate == null &&
    result.paidInstallments == null &&
    result.installmentDueDates == null
  )
}

const PERIODICITY_TO_FREQ: Record<NonNullable<ForecastDocumentScanResult['periodicity']>, { freq: ForecastCustomRecurrence['freq']; interval: number }> = {
  mensual: { freq: 'MONTHLY', interval: 1 },
  semanal: { freq: 'WEEKLY', interval: 1 },
  trimestral: { freq: 'MONTHLY', interval: 3 },
  anual: { freq: 'YEARLY', interval: 1 },
}

// CAPA B de la protección de duplicados (ver migración 0171 y mercadona-ticket-webhook para el mismo
// patrón con tickets) — huella lógica del documento YA interpretado, para detectar el mismo documento
// aunque el archivo en sí sea técnicamente distinto (un PDF re-descargado, una foto repetida). Solo se
// construye cuando hay AL MENOS entidad/concepto Y (importe O fecha) — nunca a partir de un escaneo casi
// vacío, que coincidiría por igual con cualquier otro documento igual de vacío (falso positivo).
// A diferencia de mercadona-ticket-webhook (cliente admin, sin RLS: necesita family_id EN la propia huella
// para no comparar entre familias distintas), este flujo siempre pasa por el cliente normal — la consulta
// (findForecastPaymentByContentFingerprint, data/forecast.ts) y el índice único (family_id,
// content_fingerprint) ya aíslan por familia por sí solos, así que no hace falta repetirlo aquí.
export function buildForecastContentFingerprintBasis(scan: ForecastDocumentScanResult): string | null {
  const label = (scan.provider ?? scan.concept)?.trim().toLowerCase()
  if (!label) return null
  if (scan.totalAmount == null && scan.installmentAmount == null && scan.firstDueDate == null) return null
  const amount = scan.totalAmount ?? scan.installmentAmount
  return `${label}|${amount != null ? amount.toFixed(2) : ''}|${scan.firstDueDate ?? ''}|${scan.installmentCount ?? ''}`
}

export interface ForecastDocumentPrefillFields {
  title: string
  amount: number | null
  amountEstimatedBasis: string
  // BUG REAL (documento SUMA): cuando el total leído no cuadra con la suma/reparto de las cuotas, se avisa
  // aquí en vez de proponer en silencio un número que podría estar mal — nunca bloquea el guardado, solo
  // informa (ver validación aritmética, más abajo).
  amountReviewNote: string | null
  categoryName: string | null
  dueDate?: string
  recurrenceRule?: string
  installmentAmounts?: number[] | null
  installmentDueDates?: string[] | null
}

const COHERENCE_TOLERANCE_ABS = 5
const COHERENCE_TOLERANCE_RATIO = 0.15

// ¿Dos estimaciones independientes del mismo importe total son razonablemente compatibles? No exige que
// coincidan al céntimo (puede haber intereses/comisiones no representados) — solo descarta una
// contradicción evidente (p. ej. "el total son 144,76€" y a la vez "hay 6 cuotas de ~144€ cada una", que
// implican un total real de ~868€: un factor ×6 de diferencia, no un redondeo).
function amountsRoughlyMatch(a: number, b: number): boolean {
  const diff = Math.abs(a - b)
  return diff <= COHERENCE_TOLERANCE_ABS || diff <= Math.max(a, b) * COHERENCE_TOLERANCE_RATIO
}

// Construye la propuesta editable a partir de lo extraído — SIEMPRE que isEmptyForecastDocumentScan sea
// false (si lo es, no hay nada que proponer; el llamador ya lo comprueba antes). Nunca calcula ni inventa
// un dato que el documento no diera: cada pieza se prefill solo si su propio campo de origen existe.
export function buildForecastDocumentPrefillFields(scan: ForecastDocumentScanResult): ForecastDocumentPrefillFields {
  // Título: concepto y entidad son informaciones distintas (p. ej. "Financiación lavadora" — "El Corte
  // Inglés") — se combinan cuando hay las dos; con solo una, esa sola; sin ninguna, una etiqueta genérica
  // (nunca vacío: forecast_payments exige título no vacío, y es solo una ETIQUETA que el usuario revisa y
  // puede renombrar, no un dato financiero inventado).
  const title = scan.concept && scan.provider ? `${scan.concept} — ${scan.provider}` : (scan.concept ?? scan.provider ?? 'Pago importado')

  // Se construye un plan finito (varias fechas reales) exactamente cuando ForecastPaymentForm también lo
  // construiría — mismo criterio que el bloque de recurrencia de más abajo. Es la condición clave del
  // arreglo: cuando SÍ se construye un plan, "amount" tiene que significar el TOTAL a repartir (igual que
  // en el formulario manual), nunca un importe ya dividido por cuota — si aquí se dividiera, el propio
  // formulario (proposeFinitePlanLines) lo volvería a dividir al proponer el plan.
  const willBuildInstallmentPlan = scan.periodicity != null && scan.firstDueDate != null && scan.installmentCount != null && scan.installmentCount >= 2

  // Validación aritmética: si hay más de una fuente independiente del total (el propio "totalAmount" leído,
  // y el total que implican las cuotas — su suma, o importe×número), y no cuadran razonablemente, PEPA no
  // sabe cuál es la correcta. Nunca elige en silencio: se avisa para que el usuario lo revise antes de
  // guardar (petición explícita — "eso es una contradicción evidente y debe marcarse para revisión").
  const impliedTotalFromAmounts = scan.installmentAmounts ? scan.installmentAmounts.reduce((sum, v) => sum + v, 0) : null
  const impliedTotalFromSingleAmount = scan.installmentAmount != null && scan.installmentCount != null ? scan.installmentAmount * scan.installmentCount : null
  const impliedTotal = impliedTotalFromAmounts ?? impliedTotalFromSingleAmount
  let amountReviewNote: string | null = null
  if (scan.totalAmount != null && impliedTotal != null && !amountsRoughlyMatch(scan.totalAmount, impliedTotal)) {
    amountReviewNote = `El total leído (${scan.totalAmount.toFixed(2)} €) no coincide con lo que suman las cuotas (${impliedTotal.toFixed(2)} €) — revisa los importes antes de guardar.`
  }

  let amount: number | null = null
  if (willBuildInstallmentPlan) {
    // El total explícito manda; si no hay total pero sí cuotas (iguales o distintas), el total es lo que
    // ellas implican — nunca "el importe de una cuota" tal cual, porque el formulario lo trataría como el
    // TOTAL del plan y lo repartiría entre todas otra vez.
    if (scan.totalAmount != null) amount = scan.totalAmount
    else if (impliedTotal != null) amount = impliedTotal
  } else {
    // Sin plan de varias fechas que construir (falta periodicidad, fecha de primera cuota, o solo hay una
    // cuota): el importe representa un único pago. El explícito de cuota manda; si no, y solo si se conoce
    // el total y el número de cuotas (sin poder repartirlas en el tiempo), se ofrece el importe medio como
    // estimación — avisando de que es un promedio, no un dato leído directamente.
    if (scan.installmentAmount != null) amount = scan.installmentAmount
    else if (scan.totalAmount != null && scan.installmentCount != null && scan.installmentCount > 0) {
      amount = Math.round((scan.totalAmount / scan.installmentCount) * 100) / 100
      amountReviewNote =
        amountReviewNote ?? 'Importe medio por cuota calculado a partir del total y el número de cuotas — no se pudo construir el calendario porque falta la fecha o la periodicidad.'
    } else if (scan.totalAmount != null) amount = scan.totalAmount
  }

  // Solo con periodicidad Y fecha de primera cuota se puede construir una recurrencia real — sin fecha de
  // ancla no hay dónde anclarla, y ForecastPaymentPrefill.dueDate ya queda sin rellenar en ese caso.
  let recurrenceRule: string | undefined
  let installmentAmounts: number[] | null | undefined
  let installmentDueDates: string[] | null | undefined
  if (scan.periodicity && scan.firstDueDate) {
    const { freq, interval } = PERIODICITY_TO_FREQ[scan.periodicity]
    if (scan.installmentCount != null && scan.installmentCount >= 2) {
      const until = computeInstallmentPlanUntil(scan.firstDueDate, freq, interval, scan.installmentCount)
      recurrenceRule = buildForecastRecurrenceRule('custom', { freq, interval, until }) ?? undefined
      // Cuotas de importe DISTINTO detectadas explícitamente en el documento — nunca se fuerza el reparto
      // uniforme si el propio documento ya decía otra cosa (y el número de importes coincide con el
      // número de cuotas: si no coincide, se descarta por prudencia — mejor un reparto uniforme editable
      // que una lista mal alineada con las fechas reales).
      if (scan.installmentAmounts && scan.installmentAmounts.length === scan.installmentCount) {
        installmentAmounts = scan.installmentAmounts
      }
      // Fechas de cada cuota, SOLO si el documento las listaba una a una y coinciden en número — mismo
      // criterio de prudencia que installmentAmounts. Sin esto, una fecha irregular (p. ej. la 2ª cuota
      // desplazada un par de días) se perdía siempre: el calendario se regeneraba entero por recurrencia.
      if (scan.installmentDueDates && scan.installmentDueDates.length === scan.installmentCount) {
        installmentDueDates = scan.installmentDueDates
      }
    } else {
      // Periodicidad conocida, número de cuotas NO — recurrencia abierta ("No lo sé todavía" en el
      // formulario, mismo estado que ya usa una propuesta bancaria sin histórico suficiente).
      recurrenceRule = buildForecastRecurrenceRule('custom', { freq, interval, until: null }) ?? undefined
    }
  }

  return {
    title,
    amount,
    // "estimado, importe de un documento" — mismo criterio que amountEstimatedBasis siempre exige un
    // texto humano cuando el estado es 'estimated' (el formulario decide amountStatus según si amount es
    // null o no, ver ForecastPaymentForm); aquí solo se deja lista la explicación.
    amountEstimatedBasis: 'Importe leído de un documento importado — revisa que sea correcto.',
    amountReviewNote,
    categoryName: null,
    dueDate: scan.firstDueDate ?? undefined,
    recurrenceRule,
    installmentAmounts,
    installmentDueDates,
  }
}
