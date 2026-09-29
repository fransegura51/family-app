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
    result.paidInstallments == null
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
  categoryName: string | null
  dueDate?: string
  recurrenceRule?: string
  installmentAmounts?: number[] | null
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

  // Importe de cuota: el explícito si lo hay; si no, el total repartido entre el número de cuotas (mismo
  // criterio que ya usa el formulario manual para "Importe TOTAL" repartido en planLines); si tampoco hay
  // cuotas, el total tal cual (pago único). Sin ninguno de los tres, null — "Pendiente", nunca inventado.
  let amount: number | null = null
  if (scan.installmentAmount != null) amount = scan.installmentAmount
  else if (scan.totalAmount != null && scan.installmentCount != null && scan.installmentCount > 0) amount = Math.round((scan.totalAmount / scan.installmentCount) * 100) / 100
  else if (scan.totalAmount != null) amount = scan.totalAmount

  // Solo con periodicidad Y fecha de primera cuota se puede construir una recurrencia real — sin fecha de
  // ancla no hay dónde anclarla, y ForecastPaymentPrefill.dueDate ya queda sin rellenar en ese caso.
  let recurrenceRule: string | undefined
  let installmentAmounts: number[] | null | undefined
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
    categoryName: null,
    dueDate: scan.firstDueDate ?? undefined,
    recurrenceRule,
    installmentAmounts,
  }
}
