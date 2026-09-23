import { describe, expect, it } from 'vitest'
import {
  buildInstallmentTemplatesFromForm,
  daysBetweenDates,
  parseInstallmentTemplatesToForm,
  proposeSplitCharges,
  SPLIT_CHARGE_COUNT_MAX,
  SPLIT_CHARGE_COUNT_MIN,
  validateSplitChargeCount,
  type ForecastSplitChargeFormRow,
} from './forecastInstallmentSplitForm'
import { stepDays, type ForecastPaymentInstallment } from './forecast'

describe('daysBetweenDates', () => {
  it('caso real: renovación 08/06/2027, cargo 1 el 10/06 (2 días), cargo 2 el 10/07 (32 días)', () => {
    expect(daysBetweenDates('2027-06-08', '2027-06-10')).toBe(2)
    expect(daysBetweenDates('2027-06-08', '2027-07-10')).toBe(32)
  })

  it('cruza de año', () => {
    expect(daysBetweenDates('2027-12-20', '2028-01-09')).toBe(20)
  })

  it('cruza un año bisiesto (incluye el 29 de febrero)', () => {
    expect(daysBetweenDates('2028-02-01', '2028-03-01')).toBe(29) // 2028 es bisiesto
    expect(daysBetweenDates('2027-02-01', '2027-03-01')).toBe(28) // 2027 no lo es
  })

  it('misma fecha: 0 días', () => {
    expect(daysBetweenDates('2027-06-08', '2027-06-08')).toBe(0)
  })

  it('es la inversa exacta de stepDays — round-trip sin pérdida, sin importar el mes/año', () => {
    const cases: [string, number][] = [
      ['2027-06-08', 2],
      ['2027-06-08', 32],
      ['2027-12-20', 20],
      ['2024-01-15', 45],
      ['2026-01-31', 400],
    ]
    for (const [from, days] of cases) {
      const to = stepDays(from, days)
      expect(daysBetweenDates(from, to)).toBe(days)
    }
  })
})

describe('validateSplitChargeCount', () => {
  it('acepta el rango válido (2..12)', () => {
    expect(validateSplitChargeCount('2')).toEqual({ ok: true, count: 2 })
    expect(validateSplitChargeCount('12')).toEqual({ ok: true, count: 12 })
  })

  it('rechaza 0, 1, 13, negativos, decimales y vacío — mensaje humano', () => {
    for (const raw of ['0', '1', '13', '-2', '2.5', '', 'dos']) {
      const result = validateSplitChargeCount(raw)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toBe('El número de cobros debe estar entre 2 y 12.')
        expect(result.message).not.toMatch(/RRULE|FREQ|INTERVAL|offset/i)
      }
    }
  })

  it('constantes exportadas', () => {
    expect(SPLIT_CHARGE_COUNT_MIN).toBe(2)
    expect(SPLIT_CHARGE_COUNT_MAX).toBe(12)
  })
})

describe('buildInstallmentTemplatesFromForm — fechas humanas -> offset interno', () => {
  it('CASO REAL: seguro hogar, 2 cargos con fecha absoluta', () => {
    const charges: ForecastSplitChargeFormRow[] = [
      { date: '2027-06-10', amountStatus: 'known', amount: '300', amountEstimatedBasis: '' },
      { date: '2027-07-10', amountStatus: 'known', amount: '300', amountEstimatedBasis: '' },
    ]
    const templates = buildInstallmentTemplatesFromForm('2027-06-08', charges)
    expect(templates).toEqual([
      { sequenceIndex: 1, offsetDays: 2, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
      { sequenceIndex: 2, offsetDays: 32, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
    ])
  })

  it('importes distintos por cargo', () => {
    const charges: ForecastSplitChargeFormRow[] = [
      { date: '2027-06-10', amountStatus: 'known', amount: '350', amountEstimatedBasis: '' },
      { date: '2027-07-10', amountStatus: 'known', amount: '250', amountEstimatedBasis: '' },
    ]
    const templates = buildInstallmentTemplatesFromForm('2027-06-08', charges)
    expect(templates.map((t) => t.amount)).toEqual([350, 250])
  })

  it('unknown nunca guarda un amount (aunque el campo de texto tuviera algo)', () => {
    const charges: ForecastSplitChargeFormRow[] = [{ date: '2027-06-10', amountStatus: 'unknown', amount: '300', amountEstimatedBasis: '' }]
    expect(buildInstallmentTemplatesFromForm('2027-06-08', charges)[0].amount).toBeNull()
  })

  it('estimated exige/guarda su propia basis', () => {
    const charges: ForecastSplitChargeFormRow[] = [{ date: '2027-06-10', amountStatus: 'estimated', amount: '300', amountEstimatedBasis: 'recibo del año pasado' }]
    const t = buildInstallmentTemplatesFromForm('2027-06-08', charges)[0]
    expect(t.amountStatus).toBe('estimated')
    expect(t.amountEstimatedBasis).toBe('recibo del año pasado')
  })

  it('una fecha anterior al vencimiento se recorta a offset 0, nunca negativo', () => {
    const charges: ForecastSplitChargeFormRow[] = [{ date: '2027-06-01', amountStatus: 'known', amount: '100', amountEstimatedBasis: '' }]
    expect(buildInstallmentTemplatesFromForm('2027-06-08', charges)[0].offsetDays).toBe(0)
  })

  it('sequenceIndex sigue el orden de las filas del formulario (1-indexado)', () => {
    const charges: ForecastSplitChargeFormRow[] = [
      { date: '2027-06-10', amountStatus: 'known', amount: '100', amountEstimatedBasis: '' },
      { date: '2027-07-10', amountStatus: 'known', amount: '100', amountEstimatedBasis: '' },
      { date: '2027-08-10', amountStatus: 'known', amount: '100', amountEstimatedBasis: '' },
    ]
    expect(buildInstallmentTemplatesFromForm('2027-06-08', charges).map((t) => t.sequenceIndex)).toEqual([1, 2, 3])
  })
})

describe('parseInstallmentTemplatesToForm — reconstrucción al editar', () => {
  it('reconstruye las fechas humanas a partir del offset guardado, en orden', () => {
    const installments: ForecastPaymentInstallment[] = [
      { id: 'i2', forecastPaymentId: 'fp', sequenceIndex: 2, offsetDays: 32, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
      { id: 'i1', forecastPaymentId: 'fp', sequenceIndex: 1, offsetDays: 2, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
    ]
    const form = parseInstallmentTemplatesToForm('2027-06-08', installments)
    expect(form).toEqual([
      { date: '2027-06-10', amountStatus: 'known', amount: '300', amountEstimatedBasis: '' },
      { date: '2027-07-10', amountStatus: 'known', amount: '300', amountEstimatedBasis: '' },
    ])
  })

  it('ida y vuelta exacta: construir desde el formulario y volver a parsear reproduce las mismas fechas/importes', () => {
    const originalCharges: ForecastSplitChargeFormRow[] = [
      { date: '2027-06-10', amountStatus: 'known', amount: '350', amountEstimatedBasis: '' },
      { date: '2027-07-10', amountStatus: 'estimated', amount: '250', amountEstimatedBasis: 'recibo anterior' },
    ]
    const templates = buildInstallmentTemplatesFromForm('2027-06-08', originalCharges)
    const asInstallments: ForecastPaymentInstallment[] = templates.map((t, i) => ({ id: `id-${i}`, forecastPaymentId: 'fp', ...t }))
    const roundTripped = parseInstallmentTemplatesToForm('2027-06-08', asInstallments)
    expect(roundTripped).toEqual(originalCharges)
  })

  it('unknown reconstruye con importe vacío, no "null" como texto', () => {
    const installments: ForecastPaymentInstallment[] = [{ id: 'i1', forecastPaymentId: 'fp', sequenceIndex: 1, offsetDays: 0, amountStatus: 'unknown', amount: null, amountEstimatedBasis: null }]
    expect(parseInstallmentTemplatesToForm('2027-06-08', installments)[0].amount).toBe('')
  })
})

describe('editar el número de cargos (2 → 3 → 2) sin dejar hijos fantasma', () => {
  it('el dominio simplemente refleja lo que se le pasa — más filas = más cargos, menos filas = menos, sin materializar nada aparte', () => {
    const dueDate = '2027-06-08'
    const two: ForecastSplitChargeFormRow[] = [
      { date: '2027-06-10', amountStatus: 'known', amount: '150', amountEstimatedBasis: '' },
      { date: '2027-07-10', amountStatus: 'known', amount: '150', amountEstimatedBasis: '' },
    ]
    const three: ForecastSplitChargeFormRow[] = [...two, { date: '2027-08-10', amountStatus: 'known', amount: '150', amountEstimatedBasis: '' }]
    expect(buildInstallmentTemplatesFromForm(dueDate, two)).toHaveLength(2)
    expect(buildInstallmentTemplatesFromForm(dueDate, three)).toHaveLength(3)
    expect(buildInstallmentTemplatesFromForm(dueDate, two)).toHaveLength(2) // volver a 2 no arrastra nada de la versión de 3
  })
})

describe('proposeSplitCharges — ajuste UX tras certificación móvil: importe TOTAL del ciclo, sin "mismo importe/diferentes"', () => {
  it('CASO REAL: seguro hogar, 600 € totales del ciclo repartidos en 2 cobros', () => {
    const charges = proposeSplitCharges('2027-06-08', 2, 'known', 600, null)
    expect(charges).toEqual([
      { date: '2027-06-08', amountStatus: 'known', amount: '300.00', amountEstimatedBasis: '' },
      { date: '2027-06-08', amountStatus: 'known', amount: '300.00', amountEstimatedBasis: '' },
    ])
  })

  it('total con resto: la última línea absorbe el resto (mismo criterio que el plan finito)', () => {
    const charges = proposeSplitCharges('2027-06-08', 3, 'known', 100, null)
    expect(charges.map((c) => c.amount)).toEqual(['33.33', '33.33', '33.34'])
  })

  it('total Pendiente (unknown): todas las líneas propuestas quedan Pendientes', () => {
    const charges = proposeSplitCharges('2027-06-08', 2, 'unknown', null, null)
    expect(charges.every((c) => c.amountStatus === 'unknown' && c.amount === '')).toBe(true)
  })

  it('total Estimado: cada línea hereda estado y basis', () => {
    const charges = proposeSplitCharges('2027-06-08', 2, 'estimated', 600, 'recibo del año pasado')
    expect(charges.every((c) => c.amountStatus === 'estimated' && c.amountEstimatedBasis === 'recibo del año pasado')).toBe(true)
  })

  it('todas las fechas propuestas empiezan en la fecha de vencimiento — el usuario las ajusta a mano (sin patrón periódico como en un plan finito)', () => {
    const charges = proposeSplitCharges('2027-06-08', 2, 'known', 600, null)
    expect(charges.every((c) => c.date === '2027-06-08')).toBe(true)
  })
})
