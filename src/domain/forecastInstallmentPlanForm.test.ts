import { describe, expect, it } from 'vitest'
import {
  buildRecurrenceRuleFromFormState,
  formatSpanishDate,
  INSTALLMENT_COUNT_MAX,
  INSTALLMENT_COUNT_MIN,
  parseRecurrenceRuleToFormState,
  resolvedFreqInterval,
  validateInstallmentCount,
  type ForecastRecurrenceFormState,
} from './forecastInstallmentPlanForm'

function state(overrides: Partial<ForecastRecurrenceFormState> = {}): ForecastRecurrenceFormState {
  return {
    repeats: true,
    freqOption: 'monthly',
    customFreq: 'MONTHLY',
    customInterval: '1',
    untilMode: 'count',
    installmentCount: '6',
    untilDate: '',
    ...overrides,
  }
}

describe('resolvedFreqInterval', () => {
  it('mapea las 4 frecuencias predefinidas', () => {
    expect(resolvedFreqInterval('monthly', 'MONTHLY', '1')).toEqual({ freq: 'MONTHLY', interval: 1 })
    expect(resolvedFreqInterval('every_3_months', 'MONTHLY', '1')).toEqual({ freq: 'MONTHLY', interval: 3 })
    expect(resolvedFreqInterval('every_6_months', 'MONTHLY', '1')).toEqual({ freq: 'MONTHLY', interval: 6 })
    expect(resolvedFreqInterval('yearly', 'MONTHLY', '1')).toEqual({ freq: 'YEARLY', interval: 1 })
  })

  it('personalizado usa los campos libres', () => {
    expect(resolvedFreqInterval('custom', 'WEEKLY', '2')).toEqual({ freq: 'WEEKLY', interval: 2 })
  })
})

describe('validateInstallmentCount', () => {
  it('acepta el rango válido (2..60)', () => {
    expect(validateInstallmentCount('2')).toEqual({ ok: true, count: 2 })
    expect(validateInstallmentCount('6')).toEqual({ ok: true, count: 6 })
    expect(validateInstallmentCount('60')).toEqual({ ok: true, count: 60 })
  })

  it('rechaza 0', () => {
    expect(validateInstallmentCount('0')).toEqual({ ok: false, message: 'El número de cuotas debe estar entre 2 y 60.' })
  })

  it('rechaza 1 (mínimo real es 2 — con 1 no es un plan, es un pago único)', () => {
    expect(validateInstallmentCount('1')).toEqual({ ok: false, message: 'El número de cuotas debe estar entre 2 y 60.' })
  })

  it('rechaza 61 (por encima del máximo)', () => {
    expect(validateInstallmentCount('61')).toEqual({ ok: false, message: 'El número de cuotas debe estar entre 2 y 60.' })
  })

  it('rechaza negativos', () => {
    expect(validateInstallmentCount('-3').ok).toBe(false)
  })

  it('rechaza decimales', () => {
    expect(validateInstallmentCount('6.5').ok).toBe(false)
  })

  it('rechaza vacío y no numérico', () => {
    expect(validateInstallmentCount('').ok).toBe(false)
    expect(validateInstallmentCount('seis').ok).toBe(false)
  })

  it('mensaje humano, sin jerga técnica', () => {
    const result = validateInstallmentCount('0')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).not.toMatch(/RRULE|UNTIL|FREQ|INTERVAL/i)
    }
  })

  it('constantes exportadas coinciden con el mensaje (2 y 60)', () => {
    expect(INSTALLMENT_COUNT_MIN).toBe(2)
    expect(INSTALLMENT_COUNT_MAX).toBe(60)
  })
})

describe('buildRecurrenceRuleFromFormState — CASO REAL: IBI + basura, 6 cuotas mensuales desde noviembre', () => {
  it('construye FREQ=MONTHLY;UNTIL=<fecha de la 6ª cuota>, cruzando de año', () => {
    const rule = buildRecurrenceRuleFromFormState(state({ untilMode: 'count' }), '2027-11-08', 6)
    expect(rule).toBe('FREQ=MONTHLY;UNTIL=2028-04-08')
  })

  it('2 cuotas', () => {
    expect(buildRecurrenceRuleFromFormState(state(), '2027-11-08', 2)).toBe('FREQ=MONTHLY;UNTIL=2027-12-08')
  })

  it('día 31: la serie no se rompe (recorte de fin de mes ya probado en 1D-a, aquí solo se compone)', () => {
    expect(buildRecurrenceRuleFromFormState(state(), '2026-01-31', 6)).toBe('FREQ=MONTHLY;UNTIL=2026-06-30')
  })

  it('día 30', () => {
    expect(buildRecurrenceRuleFromFormState(state(), '2026-01-30', 3)).toBe('FREQ=MONTHLY;UNTIL=2026-03-30')
  })

  it('29 de febrero (año bisiesto)', () => {
    expect(buildRecurrenceRuleFromFormState(state(), '2024-01-29', 3)).toBe('FREQ=MONTHLY;UNTIL=2024-03-29')
  })

  it('frecuencia Anual', () => {
    expect(buildRecurrenceRuleFromFormState(state({ freqOption: 'yearly' }), '2027-01-10', 3)).toBe('FREQ=YEARLY;UNTIL=2029-01-10')
  })

  it('frecuencia Personalizada (semanal, cada 2)', () => {
    // 4 cuotas cada 2 semanas desde el 10 de enero: cuota 4 = ciclo 3 = 10 ene + 7×2×3 = 42 días → 21 feb.
    expect(buildRecurrenceRuleFromFormState(state({ freqOption: 'custom', customFreq: 'WEEKLY', customInterval: '2' }), '2027-01-10', 4)).toBe(
      'FREQ=WEEKLY;INTERVAL=2;UNTIL=2027-02-21',
    )
  })

  it('¿Hasta cuándo? = Hasta que lo desactive → sin UNTIL, indistinguible de la recurrencia indefinida de siempre', () => {
    expect(buildRecurrenceRuleFromFormState(state({ untilMode: 'forever' }), '2027-11-08', null)).toBe('FREQ=MONTHLY')
  })

  it('¿Hasta cuándo? = Fecha concreta → usa la fecha tal cual', () => {
    expect(buildRecurrenceRuleFromFormState(state({ untilMode: 'date', untilDate: '2028-06-30' }), '2027-11-08', null)).toBe('FREQ=MONTHLY;UNTIL=2028-06-30')
  })

  it('¿Se repite? = No → recurrence_rule null, pago único, sin importar el resto del estado', () => {
    expect(buildRecurrenceRuleFromFormState(state({ repeats: false }), '2027-11-08', 6)).toBeNull()
  })

  it('REGRESIÓN — mismo string EXACTO que las opciones predefinidas de Fase 1C cuando no hay plazos (interval=1, sin UNTIL)', () => {
    expect(buildRecurrenceRuleFromFormState(state({ freqOption: 'yearly', untilMode: 'forever' }), '2027-06-08', null)).toBe('FREQ=YEARLY')
    expect(buildRecurrenceRuleFromFormState(state({ freqOption: 'monthly', untilMode: 'forever' }), '2027-06-08', null)).toBe('FREQ=MONTHLY')
    expect(buildRecurrenceRuleFromFormState(state({ freqOption: 'every_3_months', untilMode: 'forever' }), '2027-06-08', null)).toBe('FREQ=MONTHLY;INTERVAL=3')
    expect(buildRecurrenceRuleFromFormState(state({ freqOption: 'every_6_months', untilMode: 'forever' }), '2027-06-08', null)).toBe('FREQ=MONTHLY;INTERVAL=6')
  })
})

describe('parseRecurrenceRuleToFormState — reconstrucción al editar', () => {
  it('IBI (6 cuotas, ida y vuelta): reconstruye "Número de pagos: 6", no "Fecha concreta"', () => {
    const form = parseRecurrenceRuleToFormState('FREQ=MONTHLY;UNTIL=2028-04-08', '2027-11-08')
    expect(form).toEqual({ repeats: true, freqOption: 'monthly', customFreq: 'MONTHLY', customInterval: '1', untilMode: 'count', installmentCount: '6', untilDate: '2028-04-08' })
  })

  it('editar 6 → 8 cuotas: recalcula UNTIL, sin dejar ocurrencias fantasma (no se materializa nada)', () => {
    const original = parseRecurrenceRuleToFormState('FREQ=MONTHLY;UNTIL=2028-04-08', '2027-11-08')
    expect(original.installmentCount).toBe('6')
    const newRule = buildRecurrenceRuleFromFormState(original, '2027-11-08', 8)
    expect(newRule).toBe('FREQ=MONTHLY;UNTIL=2028-06-08')
    // y la reconstrucción de ESE nuevo rule vuelve a dar 8, no 6 ni ningún resto del valor anterior.
    expect(parseRecurrenceRuleToFormState(newRule, '2027-11-08').installmentCount).toBe('8')
  })

  it('editar 8 → 4 cuotas: recalcula UNTIL hacia atrás correctamente', () => {
    const rule8 = 'FREQ=MONTHLY;UNTIL=2028-06-08' // 8 cuotas desde 2027-11-08
    const newRule = buildRecurrenceRuleFromFormState(parseRecurrenceRuleToFormState(rule8, '2027-11-08'), '2027-11-08', 4)
    expect(newRule).toBe('FREQ=MONTHLY;UNTIL=2028-02-08')
    expect(parseRecurrenceRuleToFormState(newRule, '2027-11-08').installmentCount).toBe('4')
  })

  it('una fecha "Hasta cuándo" que NO cae en un ciclo exacto se reconstruye como Fecha concreta, nunca se reescribe sola', () => {
    // Mensual desde el 8, pero UNTIL cae en día 25 — no es "N cuotas exactas".
    const form = parseRecurrenceRuleToFormState('FREQ=MONTHLY;UNTIL=2027-12-25', '2027-11-08')
    expect(form.untilMode).toBe('date')
    expect(form.untilDate).toBe('2027-12-25')
    expect(form.installmentCount).toBe('')
    // Y reconstruir el rule desde este estado reproduce EXACTAMENTE el mismo string — no lo altera.
    expect(buildRecurrenceRuleFromFormState(form, '2027-11-08', null)).toBe('FREQ=MONTHLY;UNTIL=2027-12-25')
  })

  it('serie sin UNTIL: untilMode "forever"', () => {
    expect(parseRecurrenceRuleToFormState('FREQ=MONTHLY', '2027-11-08').untilMode).toBe('forever')
  })

  it('pago único (sin recurrence_rule): repeats=false, estado por defecto', () => {
    expect(parseRecurrenceRuleToFormState(null, '2027-11-08')).toEqual({
      repeats: false,
      freqOption: 'monthly',
      customFreq: 'MONTHLY',
      customInterval: '1',
      untilMode: 'forever',
      installmentCount: '',
      untilDate: '',
    })
  })

  it('REGRESIÓN — Seguro Coche Ibiza: FREQ=YEARLY sin UNTIL se reconstruye como "Anual" + "Hasta que lo desactive", nunca como plan de cuotas', () => {
    const form = parseRecurrenceRuleToFormState('FREQ=YEARLY', '2027-06-08')
    expect(form.repeats).toBe(true)
    expect(form.freqOption).toBe('yearly')
    expect(form.untilMode).toBe('forever')
    expect(form.installmentCount).toBe('')
    // Volver a construir el rule sin tocar nada reproduce el string EXACTO — el recurrence_rule real no cambia.
    expect(buildRecurrenceRuleFromFormState(form, '2027-06-08', null)).toBe('FREQ=YEARLY')
  })

  it('cada 3 / cada 6 meses se reconstruyen sin caer en "Personalizado"', () => {
    expect(parseRecurrenceRuleToFormState('FREQ=MONTHLY;INTERVAL=3', '2027-01-01').freqOption).toBe('every_3_months')
    expect(parseRecurrenceRuleToFormState('FREQ=MONTHLY;INTERVAL=6', '2027-01-01').freqOption).toBe('every_6_months')
  })

  it('una regla verdaderamente personalizada (INTERVAL=2 semanal) se reconstruye como "custom" con sus valores reales', () => {
    const form = parseRecurrenceRuleToFormState('FREQ=WEEKLY;INTERVAL=2', '2027-01-01')
    expect(form.freqOption).toBe('custom')
    expect(form.customFreq).toBe('WEEKLY')
    expect(form.customInterval).toBe('2')
  })
})

describe('formatSpanishDate', () => {
  it('YYYY-MM-DD → DD/MM/YYYY, solo visual', () => {
    expect(formatSpanishDate('2027-06-08')).toBe('08/06/2027')
    expect(formatSpanishDate('2028-04-08')).toBe('08/04/2028')
  })
})
