import { describe, expect, it } from 'vitest'
import {
  buildFinitePlanSubmission,
  buildRecurrenceRuleFromFormState,
  formatSpanishDate,
  INSTALLMENT_COUNT_MAX,
  INSTALLMENT_COUNT_MIN,
  parseFinitePlanLinesFromSaved,
  parseRecurrenceRuleToFormState,
  proposeFinitePlanLines,
  resolvedFreqInterval,
  validateInstallmentCount,
  type ForecastPlanLineFormRow,
  type ForecastRecurrenceFormState,
} from './forecastInstallmentPlanForm'
import type { ForecastOccurrenceOverride } from './forecast'

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

// Ajuste UX tras certificación móvil — CASO REAL: "IBI y Residuos 2026", importe TOTAL, 6 pagos
// mensuales desde el 05/11/2026. Los importes reales (verdad, según instrucción explícita) son
// 144,54 / 144,54 / 144,54 / 144,53 / 144,54 / 145,87 — suman 868,56 € (no 867,56 € como se dijo al
// principio; se usan los importes individuales, no esa cifra). El cargo 2 cae el 07/12, no el 05/12
// "puro" de la frecuencia mensual — es el caso de override de fecha pedido explícitamente.
const IBI_DUE_DATE = '2026-11-05'
const IBI_REAL_LINES: ForecastPlanLineFormRow[] = [
  { date: '2026-11-05', amountStatus: 'known', amount: '144.54', amountEstimatedBasis: '' },
  { date: '2026-12-07', amountStatus: 'known', amount: '144.54', amountEstimatedBasis: '' },
  { date: '2027-01-05', amountStatus: 'known', amount: '144.54', amountEstimatedBasis: '' },
  { date: '2027-02-05', amountStatus: 'known', amount: '144.53', amountEstimatedBasis: '' },
  { date: '2027-03-05', amountStatus: 'known', amount: '144.54', amountEstimatedBasis: '' },
  { date: '2027-04-05', amountStatus: 'known', amount: '145.87', amountEstimatedBasis: '' },
]
const IBI_REAL_TOTAL = 868.56

describe('proposeFinitePlanLines — CASO REAL: IBI y Residuos, importe total, 6 pagos mensuales', () => {
  it('propone 6 fechas reales (motor, no a mano) y reparte el total en céntimos', () => {
    const lines = proposeFinitePlanLines(IBI_DUE_DATE, 'MONTHLY', 1, 6, 'known', IBI_REAL_TOTAL, null)
    expect(lines.map((l) => l.date)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05'])
    // 868,56 € / 6 es exacto (144,76 € × 6) — la PROPUESTA es uniforme; el usuario la corrige a los
    // importes reales del recibo (irregulares) a mano, línea a línea.
    expect(lines.every((l) => l.amount === '144.76')).toBe(true)
    expect(lines.reduce((sum, l) => sum + Number(l.amount), 0)).toBeCloseTo(868.56, 2)
  })

  it('total con resto no exacto: la última línea absorbe el resto, igual que distributeTotalCentsEvenly', () => {
    const lines = proposeFinitePlanLines('2027-11-08', 'MONTHLY', 1, 6, 'known', 867.56, null)
    expect(lines.map((l) => l.amount)).toEqual(['144.59', '144.59', '144.59', '144.59', '144.59', '144.61'])
  })

  it('total Pendiente (unknown): las 6 líneas propuestas también quedan Pendientes, nunca 0 €', () => {
    const lines = proposeFinitePlanLines(IBI_DUE_DATE, 'MONTHLY', 1, 6, 'unknown', null, null)
    expect(lines.every((l) => l.amountStatus === 'unknown' && l.amount === '')).toBe(true)
  })

  it('total Estimado: cada línea propuesta hereda el estado y la basis', () => {
    const lines = proposeFinitePlanLines(IBI_DUE_DATE, 'MONTHLY', 1, 3, 'estimated', 300, 'recibo del año pasado')
    expect(lines.every((l) => l.amountStatus === 'estimated' && l.amountEstimatedBasis === 'recibo del año pasado')).toBe(true)
  })
})

describe('buildFinitePlanSubmission — detecta overrides de fecha e importe, sin duplicar líneas iguales', () => {
  it('CASO REAL: las 6 líneas reales del IBI difieren todas del reparto uniforme propuesto (144,76 €) → 6 overrides, uno con fecha propia', () => {
    const submission = buildFinitePlanSubmission(IBI_DUE_DATE, 'MONTHLY', 1, IBI_REAL_LINES, 'known', IBI_REAL_TOTAL, null)
    expect(submission.parentAmountStatus).toBe('known')
    expect(submission.parentAmount).toBe(144.76) // la base del reparto propuesto — valor por defecto, casi nunca visible
    expect(submission.overrides).toHaveLength(6)
    const cargo2 = submission.overrides.find((o) => o.occurrenceDate === '2026-12-05')
    expect(cargo2?.dueDateOverride).toBe('2026-12-07') // el override de fecha pedido explícitamente
    expect(cargo2?.amount).toBe(144.54)
    const totalOverridden = submission.overrides.reduce((sum, o) => sum + (o.amount ?? 0), 0)
    expect(totalOverridden).toBeCloseTo(868.56, 2)
  })

  it('caso uniforme (846 € / 6 = 141 € exactos, el IBI original de 1D-b): SIN overrides si el usuario no toca nada', () => {
    const lines = proposeFinitePlanLines('2027-11-08', 'MONTHLY', 1, 6, 'known', 846, null)
    const submission = buildFinitePlanSubmission('2027-11-08', 'MONTHLY', 1, lines, 'known', 846, null)
    expect(submission.parentAmount).toBe(141)
    expect(submission.overrides).toHaveLength(0)
  })

  it('edición de UNA sola línea: solo esa línea genera override, el resto sigue heredando del padre', () => {
    const lines = proposeFinitePlanLines('2027-11-08', 'MONTHLY', 1, 6, 'known', 846, null)
    const edited = lines.map((l, i) => (i === 2 ? { ...l, amount: '200' } : l))
    const submission = buildFinitePlanSubmission('2027-11-08', 'MONTHLY', 1, edited, 'known', 846, null)
    expect(submission.overrides).toHaveLength(1)
    expect(submission.overrides[0].amount).toBe(200)
  })

  it('cambiar solo la fecha de una línea (05/12 → 07/12), importe igual: override únicamente de fecha, amountStatus null', () => {
    const lines = proposeFinitePlanLines(IBI_DUE_DATE, 'MONTHLY', 1, 6, 'known', 846, null) // reparto uniforme 141 € para simplificar el caso
    const edited = lines.map((l, i) => (i === 1 ? { ...l, date: '2026-12-07' } : l))
    const submission = buildFinitePlanSubmission(IBI_DUE_DATE, 'MONTHLY', 1, edited, 'known', 846, null)
    expect(submission.overrides).toHaveLength(1)
    expect(submission.overrides[0].dueDateOverride).toBe('2026-12-07')
    expect(submission.overrides[0].amountStatus).toBeNull() // el importe no cambió, no hace falta guardarlo también
  })

  it('estimated: la basis de cada línea distinta viaja en su propio override', () => {
    const lines = proposeFinitePlanLines(IBI_DUE_DATE, 'MONTHLY', 1, 2, 'estimated', 300, 'recibo del año pasado')
    const edited = lines.map((l, i) => (i === 0 ? { ...l, amount: '180', amountEstimatedBasis: 'factura provisional' } : l))
    const submission = buildFinitePlanSubmission(IBI_DUE_DATE, 'MONTHLY', 1, edited, 'estimated', 300, 'recibo del año pasado')
    const changed = submission.overrides.find((o) => o.occurrenceDate === IBI_DUE_DATE)
    expect(changed?.amount).toBe(180)
    expect(changed?.amountEstimatedBasis).toBe('factura provisional')
  })

  it('total Estimado: el padre guarda su propia basis (nunca null) — si no, violaría la restricción real de la BD que exige basis cuando amount_status=estimated (forecast_payments_estimated_needs_basis)', () => {
    const lines = proposeFinitePlanLines(IBI_DUE_DATE, 'MONTHLY', 1, 3, 'estimated', 300, 'recibo del año pasado')
    const submission = buildFinitePlanSubmission(IBI_DUE_DATE, 'MONTHLY', 1, lines, 'estimated', 300, 'recibo del año pasado')
    expect(submission.parentAmountStatus).toBe('estimated')
    expect(submission.parentAmountEstimatedBasis).toBe('recibo del año pasado')
  })

  it('unknown: sin importe que repartir, ninguna línea sin tocar genera override de importe', () => {
    const lines = proposeFinitePlanLines(IBI_DUE_DATE, 'MONTHLY', 1, 3, 'unknown', null, null)
    const submission = buildFinitePlanSubmission(IBI_DUE_DATE, 'MONTHLY', 1, lines, 'unknown', null, null)
    expect(submission.parentAmount).toBeNull()
    expect(submission.overrides).toHaveLength(0)
  })
})

describe('parseFinitePlanLinesFromSaved — reconstrucción, sin que el usuario sepa qué era override', () => {
  it('CASO REAL: reconstruye las 6 líneas reales tal cual a partir de lo guardado (base + overrides)', () => {
    const submission = buildFinitePlanSubmission(IBI_DUE_DATE, 'MONTHLY', 1, IBI_REAL_LINES, 'known', IBI_REAL_TOTAL, null)
    const overrides: ForecastOccurrenceOverride[] = submission.overrides.map((o, i) => ({
      id: `ov-${i}`,
      forecastPaymentId: 'fp-ibi',
      occurrenceDate: o.occurrenceDate,
      installmentSequenceIndex: null,
      dueDateOverride: o.dueDateOverride,
      expectedPaymentDateOverride: null,
      amountStatus: o.amountStatus,
      amount: o.amount,
      amountEstimatedBasis: o.amountEstimatedBasis,
      skipped: false,
      matchedExpenseId: null,
    }))
    const reconstructed = parseFinitePlanLinesFromSaved(
      IBI_DUE_DATE,
      'MONTHLY',
      1,
      6,
      submission.parentAmountStatus,
      submission.parentAmount,
      submission.parentAmountEstimatedBasis,
      overrides,
    )
    expect(reconstructed).toEqual(IBI_REAL_LINES)
  })

  it('sin overrides: todas las líneas heredan el importe base del padre', () => {
    const reconstructed = parseFinitePlanLinesFromSaved('2027-11-08', 'MONTHLY', 1, 6, 'known', 141, null, [])
    expect(reconstructed.every((l) => l.amount === '141' && l.amountStatus === 'known')).toBe(true)
    expect(reconstructed.map((l) => l.date)).toEqual(['2027-11-08', '2027-12-08', '2028-01-08', '2028-02-08', '2028-03-08', '2028-04-08'])
  })

  it('ignora overrides de cargos sueltos (installmentSequenceIndex distinto de null) — eso es Fase 1D-c, no un plan finito', () => {
    const splitOverride: ForecastOccurrenceOverride = {
      id: 'ov-split',
      forecastPaymentId: 'fp',
      occurrenceDate: '2027-11-08',
      installmentSequenceIndex: 1, // de un CARGO, no del ciclo — no debe aplicarse aquí
      dueDateOverride: '2099-01-01',
      expectedPaymentDateOverride: null,
      amountStatus: 'known',
      amount: 999,
      amountEstimatedBasis: null,
      skipped: false,
      matchedExpenseId: null,
    }
    const reconstructed = parseFinitePlanLinesFromSaved('2027-11-08', 'MONTHLY', 1, 2, 'known', 141, null, [splitOverride])
    expect(reconstructed[0].date).toBe('2027-11-08') // no contaminado por el override de cargo suelto
    expect(reconstructed[0].amount).toBe('141')
  })
})
