// Previsión de pagos — Fase 1D-b: puente puro entre el formulario ("¿Se repite? / Frecuencia / ¿Hasta
// cuándo?") y recurrence_rule. NO es una entidad nueva ni añade semántica: compone exclusivamente las
// funciones ya existentes y cerradas de domain/forecast.ts (Fase 1B/1C/1D-a) — parseForecastRecurrenceRule,
// buildForecastRecurrenceRule, parseForecastRecurrenceOption, computeInstallmentPlanUntil,
// totalInstallments. Vive fuera de FinanceScreen.tsx únicamente para poder probarse con valores reales
// (redondeo de fechas, ida y vuelta 6↔8 cuotas, validación) sin necesitar renderizar ningún componente.
import {
  buildForecastRecurrenceRule,
  computeInstallmentPlanUntil,
  occurrenceForCycle,
  parseForecastRecurrenceOption,
  parseForecastRecurrenceRule,
  totalInstallments,
  type ForecastAmountStatus,
  type ForecastCustomRecurrence,
  type ForecastOccurrenceOverride,
  type ForecastRecurrenceOption,
} from './forecast'
import { centsToEurosString, distributeTotalCentsEvenly, eurosStringToCents } from './forecastMoneyCents'

export type ForecastUntilMode = 'forever' | 'count' | 'date'

export interface ForecastRecurrenceFormState {
  repeats: boolean
  // Nunca vale 'none' de verdad (eso ya lo cubre `repeats: false`) — se reutiliza el tipo tal cual para
  // poder usar RECURRENCE_OPTION_LABELS/RECURRENCE_SHORT_LABEL de la UI sin traducir dos veces.
  freqOption: ForecastRecurrenceOption
  customFreq: ForecastCustomRecurrence['freq']
  customInterval: string
  untilMode: ForecastUntilMode
  installmentCount: string
  untilDate: string
}

const DEFAULT_FORM_STATE: ForecastRecurrenceFormState = {
  repeats: false,
  freqOption: 'monthly',
  customFreq: 'MONTHLY',
  customInterval: '1',
  untilMode: 'forever',
  installmentCount: '',
  untilDate: '',
}

export const INSTALLMENT_COUNT_MIN = 2
export const INSTALLMENT_COUNT_MAX = 60

// freqOption (lo que ve el usuario) -> {freq, interval} (lo que entiende el motor). "Personalizado" usa
// los campos libres ya existentes desde Fase 1C; el resto son las 4 frecuencias predefinidas de siempre.
export function resolvedFreqInterval(
  freqOption: ForecastRecurrenceOption,
  customFreq: ForecastCustomRecurrence['freq'],
  customInterval: string,
): { freq: ForecastCustomRecurrence['freq']; interval: number } {
  switch (freqOption) {
    case 'monthly':
      return { freq: 'MONTHLY', interval: 1 }
    case 'every_3_months':
      return { freq: 'MONTHLY', interval: 3 }
    case 'every_6_months':
      return { freq: 'MONTHLY', interval: 6 }
    case 'yearly':
      return { freq: 'YEARLY', interval: 1 }
    case 'custom':
      return { freq: customFreq, interval: Math.max(1, Math.round(Number(customInterval) || 1)) }
    case 'none':
      // No debería invocarse con 'none' — repeats=false ya cubre ese caso antes de llegar aquí. Valor
      // de repliegue seguro, nunca se usa su resultado.
      return { freq: 'MONTHLY', interval: 1 }
  }
}

export function validateInstallmentCount(raw: string): { ok: true; count: number } | { ok: false; message: string } {
  const trimmed = raw.trim()
  const n = Number(trimmed)
  const message = `El número de cuotas debe estar entre ${INSTALLMENT_COUNT_MIN} y ${INSTALLMENT_COUNT_MAX}.`
  if (trimmed === '' || !Number.isInteger(n) || n < INSTALLMENT_COUNT_MIN || n > INSTALLMENT_COUNT_MAX) return { ok: false, message }
  return { ok: true, count: n }
}

// Construye el recurrence_rule final. `installmentCount` debe venir ya validado por
// validateInstallmentCount (null si untilMode no es 'count'). Siempre pasa por buildForecastRecurrenceRule
// con la forma {freq, interval, until} — con interval=1 y until=null produce EXACTAMENTE el mismo string
// que las opciones predefinidas de Fase 1C (verificado con el propio Seguro Coche Ibiza en los tests),
// así que un pago existente que no cambia de recurrencia nunca ve su recurrence_rule reescrito.
export function buildRecurrenceRuleFromFormState(
  state: Pick<ForecastRecurrenceFormState, 'repeats' | 'freqOption' | 'customFreq' | 'customInterval' | 'untilMode' | 'untilDate'>,
  dueDate: string,
  installmentCount: number | null,
): string | null {
  if (!state.repeats) return null
  const { freq, interval } = resolvedFreqInterval(state.freqOption, state.customFreq, state.customInterval)
  let until: string | null = null
  if (state.untilMode === 'count' && installmentCount != null) {
    until = computeInstallmentPlanUntil(dueDate, freq, interval, installmentCount)
  } else if (state.untilMode === 'date') {
    until = state.untilDate || null
  }
  return buildForecastRecurrenceRule('custom', { freq, interval, until })
}

// Inversa de buildRecurrenceRuleFromFormState — para precargar el formulario al editar. Reconstruye
// "número de pagos" SOLO cuando el UNTIL guardado coincide EXACTAMENTE con "N cuotas desde due_date"
// (round-trip verificado con computeInstallmentPlanUntil + totalInstallments, las mismas funciones de
// Fase 1D-a): si alguien fijó una fecha suelta que no cae en un ciclo exacto, se muestra tal cual como
// "Fecha concreta" — nunca se reescribe silenciosamente el UNTIL guardado con solo abrir y volver a
// guardar el formulario sin tocar nada.
export function parseRecurrenceRuleToFormState(recurrenceRule: string | null, dueDate: string): ForecastRecurrenceFormState {
  if (!recurrenceRule) return { ...DEFAULT_FORM_STATE }
  const parsed = parseForecastRecurrenceRule(recurrenceRule)
  if (!parsed) return { ...DEFAULT_FORM_STATE } // regla no reconocida por el motor — no debería pasar con datos reales

  const freqOnlyRule = buildForecastRecurrenceRule('custom', { freq: parsed.freq, interval: parsed.interval, until: null })
  const { option: freqOption } = parseForecastRecurrenceOption(freqOnlyRule)
  const base = { repeats: true, freqOption, customFreq: parsed.freq, customInterval: String(parsed.interval) }

  if (!parsed.until) return { ...base, untilMode: 'forever', installmentCount: '', untilDate: '' }

  const count = totalInstallments({ dueDate, recurrenceRule })
  const roundTrips = count != null && computeInstallmentPlanUntil(dueDate, parsed.freq, parsed.interval, count) === parsed.until
  if (roundTrips && count != null) {
    return { ...base, untilMode: 'count', installmentCount: String(count), untilDate: parsed.until }
  }
  return { ...base, untilMode: 'date', installmentCount: '', untilDate: parsed.until }
}

// DD/MM/YYYY — solo para la vista previa nueva de esta fase (petición explícita: no tocar cómo se
// muestran las fechas en el resto de Previsión, ni cómo se almacenan — esto es puramente visual).
export function formatSpanishDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

// ── Ajuste UX tras certificación móvil — "Importe TOTAL" del plan, con propuesta de reparto editable
// línea a línea, en vez de "importe por cuota" repetido N veces. UNA línea == UN ciclo del plan finito
// (occurrence_date de forecast_occurrences); nunca forecast_payment_installments — esa tabla es solo
// para el cobro fraccionado POR CICLO de una obligación recurrente (Fase 1D-c), un concepto distinto. ──

export interface ForecastPlanLineFormRow {
  date: string
  amountStatus: ForecastAmountStatus
  amount: string
  amountEstimatedBasis: string
}

// Propuesta inicial: N fechas reales (el mismo motor que ya usa el resto de Previsión, nunca a mano) +
// reparto del total en céntimos enteros. Con total "Pendiente" (unknown), cada línea propuesta también
// queda "Pendiente" — nunca se inventa un importe para poder repartir algo que no se conoce.
export function proposeFinitePlanLines(
  dueDate: string,
  freq: ForecastCustomRecurrence['freq'],
  interval: number,
  count: number,
  totalStatus: ForecastAmountStatus,
  totalAmount: number | null,
  totalBasis: string | null,
): ForecastPlanLineFormRow[] {
  const dates = Array.from({ length: count }, (_, i) => occurrenceForCycle(dueDate, { freq, interval, until: null }, i))
  if (totalStatus === 'unknown' || totalAmount == null) {
    return dates.map((date) => ({ date, amountStatus: 'unknown', amount: '', amountEstimatedBasis: '' }))
  }
  const totalCents = eurosStringToCents(String(totalAmount)) ?? 0
  const centsPerLine = distributeTotalCentsEvenly(totalCents, count)
  return dates.map((date, i) => ({
    date,
    amountStatus: totalStatus,
    amount: centsToEurosString(centsPerLine[i]),
    amountEstimatedBasis: totalStatus === 'estimated' ? (totalBasis ?? '') : '',
  }))
}

// Reconstruye las líneas al editar un plan ya guardado: fecha/importe/estado "puros" de cada ciclo
// (occurrenceForCycle + el importe base del padre — la "línea normal" del reparto), sustituidos por su
// override real cuando existe (forecast_occurrences con installmentSequenceIndex=null, la fila del
// CICLO completo — nunca una de un cargo suelto, eso es Fase 1D-c). El usuario nunca ve "esto es un
// override, esto no es" — solo ve el plan real tal como quedó guardado.
export function parseFinitePlanLinesFromSaved(
  dueDate: string,
  freq: ForecastCustomRecurrence['freq'],
  interval: number,
  count: number,
  parentStatus: ForecastAmountStatus,
  parentAmount: number | null,
  parentAmountEstimatedBasis: string | null,
  overrides: ForecastOccurrenceOverride[],
): ForecastPlanLineFormRow[] {
  const overrideByOccurrenceDate = new Map(overrides.filter((o) => o.installmentSequenceIndex == null).map((o) => [o.occurrenceDate, o]))
  return Array.from({ length: count }, (_, i) => {
    const pureDate = occurrenceForCycle(dueDate, { freq, interval, until: null }, i)
    const override = overrideByOccurrenceDate.get(pureDate)
    const date = override?.dueDateOverride ?? pureDate
    const amountStatus = override?.amountStatus ?? parentStatus
    const hasOwnAmount = !!override?.amountStatus
    const amount = hasOwnAmount ? (override!.amount != null ? String(override!.amount) : '') : parentAmount != null ? String(parentAmount) : ''
    const amountEstimatedBasis = hasOwnAmount ? override!.amountEstimatedBasis ?? '' : parentAmountEstimatedBasis ?? ''
    return { date, amountStatus, amount, amountEstimatedBasis: amountStatus === 'estimated' ? amountEstimatedBasis : '' }
  })
}

export interface FinitePlanOverrideDraft {
  occurrenceDate: string
  dueDateOverride: string | null
  amountStatus: ForecastAmountStatus | null
  amount: number | null
  amountEstimatedBasis: string | null
}

export interface FinitePlanSubmission {
  parentAmountStatus: ForecastAmountStatus
  parentAmount: number | null
  parentAmountEstimatedBasis: string | null
  overrides: FinitePlanOverrideDraft[]
}

// A partir de las líneas (ya editadas o no por el usuario) construye lo que hay que guardar: el importe
// "base" del padre (la primera línea del reparto propuesto — sirve de valor por defecto, casi nunca se
// muestra ya que casi todas las líneas reales del caso del IBI llevan su propio override) y UN override
// por cada línea que difiera de ese valor base (fecha, estado o importe) — nunca uno por cada línea
// sin más: si el usuario no toca nada, la línea final (la del resto del reparto) es la única distinta.
export function buildFinitePlanSubmission(
  dueDate: string,
  freq: ForecastCustomRecurrence['freq'],
  interval: number,
  lines: ForecastPlanLineFormRow[],
  totalStatus: ForecastAmountStatus,
  totalAmount: number | null,
  totalBasis: string | null,
): FinitePlanSubmission {
  const pureDates = lines.map((_, i) => occurrenceForCycle(dueDate, { freq, interval, until: null }, i))
  let baseAmount: number | null = null
  if (totalStatus !== 'unknown' && totalAmount != null && lines.length > 0) {
    const totalCents = eurosStringToCents(String(totalAmount)) ?? 0
    baseAmount = distributeTotalCentsEvenly(totalCents, lines.length)[0] / 100
  }
  const parentAmountStatus = totalStatus
  const parentAmount = totalStatus === 'unknown' ? null : (baseAmount ?? totalAmount)
  // Cuando el TOTAL es Estimado, el padre también queda con status='estimated' — la restricción
  // forecast_payments_estimated_needs_basis (migración 0155) exige entonces una basis no nula, así que
  // el padre hereda la basis del propio total (el formulario ya obliga a rellenarla antes de guardar).
  const parentAmountEstimatedBasis = parentAmountStatus === 'estimated' ? totalBasis?.trim() || null : null

  const overrides: FinitePlanOverrideDraft[] = []
  lines.forEach((line, i) => {
    const pureDate = pureDates[i]
    const dateChanged = line.date !== pureDate
    const lineAmountCents = line.amountStatus === 'unknown' ? null : (eurosStringToCents(line.amount) ?? 0)
    const baseAmountCents = parentAmount != null ? (eurosStringToCents(String(parentAmount)) ?? 0) : null
    const lineBasis = line.amountStatus === 'estimated' ? line.amountEstimatedBasis.trim() || null : null
    const basisChanged = line.amountStatus === 'estimated' && lineBasis !== parentAmountEstimatedBasis
    const amountChanged = line.amountStatus !== parentAmountStatus || lineAmountCents !== baseAmountCents || basisChanged
    if (!dateChanged && !amountChanged) return
    overrides.push({
      occurrenceDate: pureDate,
      dueDateOverride: dateChanged ? line.date : null,
      amountStatus: amountChanged ? line.amountStatus : null,
      amount: amountChanged ? (lineAmountCents != null ? lineAmountCents / 100 : null) : null,
      amountEstimatedBasis: amountChanged ? lineBasis : null,
    })
  })
  return { parentAmountStatus, parentAmount, parentAmountEstimatedBasis, overrides }
}
