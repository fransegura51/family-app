// Previsión de pagos — Fase 1D-b: puente puro entre el formulario ("¿Se repite? / Frecuencia / ¿Hasta
// cuándo?") y recurrence_rule. NO es una entidad nueva ni añade semántica: compone exclusivamente las
// funciones ya existentes y cerradas de domain/forecast.ts (Fase 1B/1C/1D-a) — parseForecastRecurrenceRule,
// buildForecastRecurrenceRule, parseForecastRecurrenceOption, computeInstallmentPlanUntil,
// totalInstallments. Vive fuera de FinanceScreen.tsx únicamente para poder probarse con valores reales
// (redondeo de fechas, ida y vuelta 6↔8 cuotas, validación) sin necesitar renderizar ningún componente.
import {
  buildForecastRecurrenceRule,
  computeInstallmentPlanUntil,
  parseForecastRecurrenceOption,
  parseForecastRecurrenceRule,
  totalInstallments,
  type ForecastCustomRecurrence,
  type ForecastRecurrenceOption,
} from './forecast'

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
