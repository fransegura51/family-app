import { describe, expect, it } from 'vitest'
import {
  stepMonthsClamped,
  expandForecastOccurrences,
  computeForecastReminderDate,
  forecastTotals,
  forecastByMonth,
  nextForecastOccurrence,
  buildForecastRecurrenceRule,
  parseForecastRecurrenceOption,
  isForecastPaymentFinished,
  formatForecastAmount,
  type ForecastPayment,
  type ForecastOccurrence,
  type ForecastOccurrenceOverride,
} from './forecast'

function payment(overrides: Partial<ForecastPayment> = {}): ForecastPayment {
  return {
    id: 'fp-1',
    familyId: 'fam-1',
    title: 'Seguro coche',
    categoryId: 'cat-1',
    provider: null,
    notes: null,
    amountStatus: 'known',
    amount: 642,
    amountEstimatedBasis: null,
    currency: 'EUR',
    dueDate: '2026-11-15',
    expectedPaymentDate: null,
    recurrenceRule: null,
    bankAccountId: null,
    ownerMemberId: null,
    showInCalendar: true,
    calendarEventId: null,
    active: true,
    ...overrides,
  }
}

describe('stepMonthsClamped', () => {
  it('recorta al último día del mes de destino cuando el día original no existe', () => {
    expect(stepMonthsClamped('2026-01-31', 1)).toBe('2026-02-28') // no bisiesto
    expect(stepMonthsClamped('2026-01-31', 2)).toBe('2026-03-31') // vuelve a 31, no se queda en 28
    expect(stepMonthsClamped('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('29 de febrero: recorta en años no bisiestos, vuelve a 29 en el siguiente bisiesto — sin cambiar el ancla', () => {
    expect(stepMonthsClamped('2028-02-29', 12)).toBe('2029-02-28')
    expect(stepMonthsClamped('2028-02-29', 24)).toBe('2030-02-28')
    expect(stepMonthsClamped('2028-02-29', 36)).toBe('2031-02-28')
    expect(stepMonthsClamped('2028-02-29', 48)).toBe('2032-02-29')
    // Crítico: cada llamada parte SIEMPRE del ancla original 2028-02-29, nunca del resultado anterior
    // (2029-02-28 no se convierte en la nueva ancla) — por eso 2032 vuelve a dar 29, no 28.
  })

  it('meses negativos (recordatorios "antes de")', () => {
    expect(stepMonthsClamped('2027-03-31', -1)).toBe('2027-02-28')
    expect(stepMonthsClamped('2028-03-31', -1)).toBe('2028-02-29') // bisiesto
  })
})

describe('expandForecastOccurrences — MONTHLY financiero (CASO 1 / sección 32)', () => {
  it('31 enero -> 28/29 feb -> 31 mar -> 30 abr -> 31 may -> 30 jun, sin drift', () => {
    const p = payment({ dueDate: '2027-01-31', expectedPaymentDate: '2027-02-05', recurrenceRule: 'FREQ=MONTHLY' })
    const occ = expandForecastOccurrences(p, [], '2027-01-01', '2027-06-30')
    expect(occ.map((o) => o.dueDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30'])
    expect(occ.map((o) => o.expectedPaymentDate)).toEqual(['2027-02-05', '2027-03-05', '2027-04-05', '2027-05-05', '2027-06-05', '2027-07-05'])
  })

  it('año bisiesto: el ciclo de febrero da 29, no 28', () => {
    const p = payment({ dueDate: '2028-01-31', expectedPaymentDate: null, recurrenceRule: 'FREQ=MONTHLY' })
    const occ = expandForecastOccurrences(p, [], '2028-01-01', '2028-03-31')
    expect(occ.map((o) => o.dueDate)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
  })
})

describe('expandForecastOccurrences — YEARLY financiero, 29/02 (CASO 2/3/B.1/B.2/B.3)', () => {
  it('CASO 2: due=29/02/2028, payment=05/03/2028, YEARLY, 2028-2033', () => {
    const p = payment({ dueDate: '2028-02-29', expectedPaymentDate: '2028-03-05', recurrenceRule: 'FREQ=YEARLY' })
    const occ = expandForecastOccurrences(p, [], '2028-01-01', '2033-12-31')
    expect(occ.map((o) => o.dueDate)).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29', '2033-02-28'])
    expect(occ.map((o) => o.expectedPaymentDate)).toEqual(['2028-03-05', '2029-03-05', '2030-03-05', '2031-03-05', '2032-03-05', '2033-03-05'])
  })

  it('CASO 3: due=payment=29/02/2028, YEARLY — ambas series alineadas', () => {
    const p = payment({ dueDate: '2028-02-29', expectedPaymentDate: '2028-02-29', recurrenceRule: 'FREQ=YEARLY' })
    const occ = expandForecastOccurrences(p, [], '2028-01-01', '2033-12-31')
    const expected = ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29', '2033-02-28']
    expect(occ.map((o) => o.dueDate)).toEqual(expected)
    expect(occ.map((o) => o.expectedPaymentDate)).toEqual(expected)
  })
})

describe('expandForecastOccurrences — pago antes del vencimiento (CASO B / §4 de 1A.1)', () => {
  it('expected_payment_date puede ser anterior a due_date, y la distancia se conserva cada año', () => {
    const p = payment({ dueDate: '2026-11-15', expectedPaymentDate: '2026-11-10', recurrenceRule: 'FREQ=YEARLY' })
    const occ = expandForecastOccurrences(p, [], '2026-01-01', '2028-12-31')
    expect(occ.map((o) => o.dueDate)).toEqual(['2026-11-15', '2027-11-15', '2028-11-15'])
    expect(occ.map((o) => o.expectedPaymentDate)).toEqual(['2026-11-10', '2027-11-10', '2028-11-10'])
  })
})

describe('expandForecastOccurrences — INTERVAL (CASO 4/5)', () => {
  it('CASO 4: MONTHLY;INTERVAL=3, día 31, 6 ocurrencias', () => {
    const p = payment({ dueDate: '2027-01-31', recurrenceRule: 'FREQ=MONTHLY;INTERVAL=3' })
    const occ = expandForecastOccurrences(p, [], '2027-01-01', '2028-12-31')
    expect(occ.slice(0, 6).map((o) => o.dueDate)).toEqual(['2027-01-31', '2027-04-30', '2027-07-31', '2027-10-31', '2028-01-31', '2028-04-30'])
  })

  it('CASO 5: YEARLY;INTERVAL=2, ancla 29/02, 5 ocurrencias', () => {
    const p = payment({ dueDate: '2028-02-29', recurrenceRule: 'FREQ=YEARLY;INTERVAL=2' })
    const occ = expandForecastOccurrences(p, [], '2028-01-01', '2036-12-31')
    expect(occ.slice(0, 5).map((o) => o.dueDate)).toEqual(['2028-02-29', '2030-02-28', '2032-02-29', '2034-02-28', '2036-02-29'])
  })
})

describe('expandForecastOccurrences — UNTIL (CASO 6)', () => {
  it('el ciclo cuyo due_date supera UNTIL queda fuera por completo', () => {
    const p = payment({ dueDate: '2027-01-31', recurrenceRule: 'FREQ=MONTHLY;INTERVAL=3;UNTIL=2027-10-31' })
    const occ = expandForecastOccurrences(p, [], '2027-01-01', '2028-12-31')
    expect(occ.map((o) => o.dueDate)).toEqual(['2027-01-31', '2027-04-30', '2027-07-31', '2027-10-31'])
  })
})

describe('expected_payment_date: antes / igual / después / null', () => {
  it('null se resuelve como igual a due_date', () => {
    const p = payment({ dueDate: '2026-09-30', expectedPaymentDate: null, recurrenceRule: null })
    const occ = expandForecastOccurrences(p, [], '2026-09-01', '2026-09-30')
    expect(occ[0].expectedPaymentDate).toBe('2026-09-30')
  })

  it('posterior a due_date', () => {
    const p = payment({ dueDate: '2026-11-15', expectedPaymentDate: '2026-12-03', recurrenceRule: null })
    const occ = expandForecastOccurrences(p, [], '2026-11-01', '2026-12-31')
    expect(occ[0].dueDate).toBe('2026-11-15')
    expect(occ[0].expectedPaymentDate).toBe('2026-12-03')
  })
})

describe('computeForecastReminderDate — mes natural (CASO A / §19)', () => {
  it('31/03/2027, 1 mes antes -> 28/02/2027 (no bisiesto)', () => {
    expect(computeForecastReminderDate('2027-03-31', { value: 1, unit: 'months' })).toBe('2027-02-28')
  })

  it('31/03/2028, 1 mes antes -> 29/02/2028 (bisiesto)', () => {
    expect(computeForecastReminderDate('2028-03-31', { value: 1, unit: 'months' })).toBe('2028-02-29')
  })

  it('2 meses antes', () => {
    expect(computeForecastReminderDate('2027-03-31', { value: 2, unit: 'months' })).toBe('2027-01-31')
  })

  it('2 semanas: duración fija de 14 días', () => {
    expect(computeForecastReminderDate('2026-09-30', { value: 2, unit: 'weeks' })).toBe('2026-09-16')
  })

  it('CASO C: IBI 30/09/2026, avisos 1 mes y 2 semanas', () => {
    expect(computeForecastReminderDate('2026-09-30', { value: 1, unit: 'months' })).toBe('2026-08-30')
    expect(computeForecastReminderDate('2026-09-30', { value: 2, unit: 'weeks' })).toBe('2026-09-16')
  })
})

describe('skipped, override de importe, override de fecha, snapshot conciliado, inactivo', () => {
  const base = payment({ dueDate: '2026-11-15', expectedPaymentDate: '2026-11-10', recurrenceRule: 'FREQ=YEARLY' })

  function override(o: Partial<ForecastOccurrenceOverride>): ForecastOccurrenceOverride {
    return {
      id: 'ov-1',
      forecastPaymentId: 'fp-1',
      occurrenceDate: '2027-11-15',
      dueDateOverride: null,
      expectedPaymentDateOverride: null,
      amountStatus: null,
      amount: null,
      amountEstimatedBasis: null,
      skipped: false,
      matchedExpenseId: null,
      ...o,
    }
  }

  it('skipped: esa ocurrencia desaparece, las demás siguen', () => {
    const occ = expandForecastOccurrences(base, [override({ skipped: true })], '2026-01-01', '2028-12-31')
    expect(occ.map((o) => o.dueDate)).toEqual(['2026-11-15', '2028-11-15'])
  })

  it('override de importe: solo afecta a esa ocurrencia', () => {
    const occ = expandForecastOccurrences(base, [override({ amountStatus: 'known', amount: 700 })], '2026-01-01', '2028-12-31')
    expect(occ.find((o) => o.dueDate === '2027-11-15')?.amount).toBe(700)
    expect(occ.find((o) => o.dueDate === '2026-11-15')?.amount).toBe(642)
  })

  it('override de due date (vencimiento distinto solo esa vez)', () => {
    const occ = expandForecastOccurrences(base, [override({ dueDateOverride: '2027-11-20' })], '2026-01-01', '2028-12-31')
    expect(occ.find((o) => o.occurrenceDate === '2027-11-15')?.dueDate).toBe('2027-11-20')
  })

  it('override de expected payment date (cargo distinto solo esa vez, ej: vence 15/11 pero en 2027 cobra 28/11)', () => {
    const occ = expandForecastOccurrences(base, [override({ expectedPaymentDateOverride: '2027-11-28' })], '2026-01-01', '2028-12-31')
    expect(occ.find((o) => o.occurrenceDate === '2027-11-15')?.expectedPaymentDate).toBe('2027-11-28')
  })

  it('ocurrencia conciliada (matched_expense_id + snapshot): editar el padre después no la cambia', () => {
    const conciliada = override({ amountStatus: 'known', amount: 681, matchedExpenseId: 'exp-1' })
    const paymentEditado = { ...base, amount: 900 } // el usuario cambió el padre a 900€ más tarde
    const occ = expandForecastOccurrences(paymentEditado, [conciliada], '2026-01-01', '2028-12-31')
    expect(occ.find((o) => o.occurrenceDate === '2027-11-15')?.amount).toBe(681) // congelado, no 900
    expect(occ.find((o) => o.dueDate === '2026-11-15')?.amount).toBe(900) // el resto sí sigue la regla actual
  })

  it('forecast_payment inactivo: no produce ninguna ocurrencia', () => {
    const occ = expandForecastOccurrences({ ...base, active: false }, [], '2026-01-01', '2028-12-31')
    expect(occ).toEqual([])
  })
})

describe('forecastTotals — known/estimated/unknown, multidivisa (CASO F / §21)', () => {
  function occ(o: Partial<ForecastOccurrence>): ForecastOccurrence {
    return {
      forecastPaymentId: 'fp', title: 't', occurrenceDate: '2026-10-01', dueDate: '2026-10-01', expectedPaymentDate: '2026-10-01',
      amountStatus: 'known', amount: 0, currency: 'EUR', categoryId: null, matchedExpenseId: null, ...o,
    }
  }

  it('caso obligatorio: 500+100 EUR conocido/estimado + 1 EUR desconocido, 300 GBP conocido + 1 GBP desconocido', () => {
    const totals = forecastTotals([
      occ({ amountStatus: 'known', amount: 500, currency: 'EUR' }),
      occ({ amountStatus: 'estimated', amount: 100, currency: 'EUR' }),
      occ({ amountStatus: 'unknown', amount: null, currency: 'EUR' }),
      occ({ amountStatus: 'known', amount: 300, currency: 'GBP' }),
      occ({ amountStatus: 'unknown', amount: null, currency: 'GBP' }),
    ])
    expect(totals).toEqual([
      { currency: 'EUR', knownTotal: 500, estimatedTotal: 100, unknownCount: 1, knownPlusEstimatedTotal: 600 },
      { currency: 'GBP', knownTotal: 300, estimatedTotal: 0, unknownCount: 1, knownPlusEstimatedTotal: 300 },
    ])
    // Nunca existe un "900" ni un "800": nunca se suman EUR y GBP.
  })

  it('unknown nunca se convierte en 0 en el total conocido+estimado', () => {
    const totals = forecastTotals([occ({ amountStatus: 'unknown', amount: null })])
    expect(totals[0].knownPlusEstimatedTotal).toBe(0)
    expect(totals[0].unknownCount).toBe(1) // el 0 del total nunca oculta que hay 1 pago sin importe
  })

  it('solo known suma; solo estimated suma pero queda identificado aparte', () => {
    const totals = forecastTotals([occ({ amountStatus: 'known', amount: 1200 })])
    expect(totals).toEqual([{ currency: 'EUR', knownTotal: 1200, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 1200 }])
  })
})

describe('forecastByMonth', () => {
  it('agrupa por mes según el campo de fecha pedido', () => {
    const occs: ForecastOccurrence[] = [
      { forecastPaymentId: 'a', title: 'A', occurrenceDate: '2026-10-01', dueDate: '2026-10-01', expectedPaymentDate: '2026-11-03', amountStatus: 'known', amount: 100, currency: 'EUR', categoryId: null, matchedExpenseId: null },
      { forecastPaymentId: 'b', title: 'B', occurrenceDate: '2026-11-05', dueDate: '2026-11-05', expectedPaymentDate: '2026-11-05', amountStatus: 'known', amount: 50, currency: 'EUR', categoryId: null, matchedExpenseId: null },
    ]
    const byDue = forecastByMonth(occs, 'dueDate')
    expect([...byDue.keys()]).toEqual(['2026-10', '2026-11'])
    const byPayment = forecastByMonth(occs, 'expectedPaymentDate')
    expect([...byPayment.keys()]).toEqual(['2026-11']) // ambas caen en noviembre si se agrupa por pago
    expect(byPayment.get('2026-11')?.[0].knownPlusEstimatedTotal).toBe(150)
  })
})

describe('nextForecastOccurrence', () => {
  it('devuelve la siguiente ocurrencia a partir de hoy', () => {
    const p = payment({ dueDate: '2026-01-15', recurrenceRule: 'FREQ=MONTHLY' })
    const next = nextForecastOccurrence(p, [], '2026-06-01')
    expect(next?.dueDate).toBe('2026-06-15')
  })

  // Fase 1B.1 — certificación: casos exigidos para el avance automático de la proyección visual en
  // Calendario (send-due-reminders/index.ts duplica esta misma búsqueda "siguiente ocurrencia desde
  // hoy" en Deno; este es el algoritmo de referencia, ya cubierto por estos tests).

  it('YEARLY normal: la siguiente ocurrencia tras pasar la actual', () => {
    const p = payment({ dueDate: '2026-03-31', recurrenceRule: 'FREQ=YEARLY' })
    expect(nextForecastOccurrence(p, [], '2026-03-31')?.dueDate).toBe('2026-03-31') // el mismo día, aún no ha pasado
    expect(nextForecastOccurrence(p, [], '2027-04-01')?.dueDate).toBe('2028-03-31') // pasó -> siguiente año
  })

  it('YEARLY 29/02: recorta a 28 en años no bisiestos, sin desplazar el ancla', () => {
    const p = payment({ dueDate: '2024-02-29', recurrenceRule: 'FREQ=YEARLY' })
    expect(nextForecastOccurrence(p, [], '2026-01-01')?.dueDate).toBe('2026-02-28')
    expect(nextForecastOccurrence(p, [], '2027-03-01')?.dueDate).toBe('2028-02-29') // vuelve a 29 en el siguiente bisiesto
  })

  it('MONTHLY día 31: cada mes corto recorta, pero el mes siguiente vuelve a 31 (nunca se queda en día 3)', () => {
    const p = payment({ dueDate: '2026-01-31', recurrenceRule: 'FREQ=MONTHLY' })
    expect(nextForecastOccurrence(p, [], '2026-02-01')?.dueDate).toBe('2026-02-28')
    expect(nextForecastOccurrence(p, [], '2026-03-01')?.dueDate).toBe('2026-03-31')
    expect(nextForecastOccurrence(p, [], '2026-04-01')?.dueDate).toBe('2026-04-30')
  })

  it('MONTHLY día 30: idéntico patrón, sin drift', () => {
    const p = payment({ dueDate: '2026-01-30', recurrenceRule: 'FREQ=MONTHLY' })
    expect(nextForecastOccurrence(p, [], '2026-02-01')?.dueDate).toBe('2026-02-28')
    expect(nextForecastOccurrence(p, [], '2026-03-01')?.dueDate).toBe('2026-03-30')
  })

  it('skipped: salta directamente a la siguiente ocurrencia real, nunca muestra la saltada', () => {
    // 31 enero / 28 febrero (skipped) / 31 marzo — tras pasar el 31 de enero debe ir a marzo, no a febrero.
    const p = payment({ dueDate: '2026-01-31', recurrenceRule: 'FREQ=MONTHLY' })
    const overrides: ForecastOccurrenceOverride[] = [
      {
        id: 'ov-skip',
        forecastPaymentId: 'fp-1',
        occurrenceDate: '2026-02-28',
        dueDateOverride: null,
        expectedPaymentDateOverride: null,
        amountStatus: null,
        amount: null,
        amountEstimatedBasis: null,
        skipped: true,
        matchedExpenseId: null,
      },
    ]
    expect(nextForecastOccurrence(p, overrides, '2026-02-01')?.dueDate).toBe('2026-03-31')
  })

  it('due_date_override: la proyección de esa ocurrencia usa la fecha del override, no la de la regla pura', () => {
    const p = payment({ dueDate: '2026-01-31', recurrenceRule: 'FREQ=MONTHLY' })
    const overrides: ForecastOccurrenceOverride[] = [
      {
        id: 'ov-date',
        forecastPaymentId: 'fp-1',
        occurrenceDate: '2026-03-31',
        dueDateOverride: '2026-03-28',
        expectedPaymentDateOverride: null,
        amountStatus: null,
        amount: null,
        amountEstimatedBasis: null,
        skipped: false,
        matchedExpenseId: null,
      },
    ]
    expect(nextForecastOccurrence(p, overrides, '2026-03-01')?.dueDate).toBe('2026-03-28')
  })
})

describe('buildForecastRecurrenceRule / parseForecastRecurrenceOption (Fase 1C, selector amigable)', () => {
  it('mapea las 4 opciones predefinidas + "no se repite"', () => {
    expect(buildForecastRecurrenceRule('none', null)).toBeNull()
    expect(buildForecastRecurrenceRule('monthly', null)).toBe('FREQ=MONTHLY')
    expect(buildForecastRecurrenceRule('every_3_months', null)).toBe('FREQ=MONTHLY;INTERVAL=3')
    expect(buildForecastRecurrenceRule('every_6_months', null)).toBe('FREQ=MONTHLY;INTERVAL=6')
    expect(buildForecastRecurrenceRule('yearly', null)).toBe('FREQ=YEARLY')
  })

  it('personalizado: frecuencia + intervalo + fin opcional, nada más', () => {
    expect(buildForecastRecurrenceRule('custom', { freq: 'WEEKLY', interval: 2, until: null })).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(buildForecastRecurrenceRule('custom', { freq: 'MONTHLY', interval: 1, until: '2028-12-31' })).toBe('FREQ=MONTHLY;UNTIL=2028-12-31')
    expect(buildForecastRecurrenceRule('custom', null)).toBeNull()
  })

  it('parseForecastRecurrenceOption es la inversa exacta para las predefinidas', () => {
    expect(parseForecastRecurrenceOption(null)).toEqual({ option: 'none', custom: null })
    expect(parseForecastRecurrenceOption('FREQ=MONTHLY')).toEqual({ option: 'monthly', custom: null })
    expect(parseForecastRecurrenceOption('FREQ=MONTHLY;INTERVAL=3')).toEqual({ option: 'every_3_months', custom: null })
    expect(parseForecastRecurrenceOption('FREQ=MONTHLY;INTERVAL=6')).toEqual({ option: 'every_6_months', custom: null })
    expect(parseForecastRecurrenceOption('FREQ=YEARLY')).toEqual({ option: 'yearly', custom: null })
  })

  it('cualquier regla no predefinida (otro INTERVAL, UNTIL, WEEKLY/DAILY) se reconoce como "custom", nunca se aproxima', () => {
    expect(parseForecastRecurrenceOption('FREQ=MONTHLY;INTERVAL=2')).toEqual({ option: 'custom', custom: { freq: 'MONTHLY', interval: 2, until: null } })
    expect(parseForecastRecurrenceOption('FREQ=YEARLY;UNTIL=2030-01-01')).toEqual({ option: 'custom', custom: { freq: 'YEARLY', interval: 1, until: '2030-01-01' } })
    expect(parseForecastRecurrenceOption('FREQ=WEEKLY')).toEqual({ option: 'custom', custom: { freq: 'WEEKLY', interval: 1, until: null } })
  })
})

describe('isForecastPaymentFinished (Fase 1C, cierre de serie)', () => {
  it('serie YEARLY con UNTIL ya superado: finalizada', () => {
    const p = payment({ dueDate: '2024-03-31', recurrenceRule: 'FREQ=YEARLY;UNTIL=2026-03-31' })
    expect(isForecastPaymentFinished(p, [], '2026-04-01')).toBe(true)
    expect(isForecastPaymentFinished(p, [], '2026-03-31')).toBe(false) // la última ocurrencia real es justo hoy, todavía no ha pasado
  })

  it('pago puntual cuyo único vencimiento ya pasó: finalizado', () => {
    const p = payment({ dueDate: '2026-01-10', recurrenceRule: null })
    expect(isForecastPaymentFinished(p, [], '2026-01-11')).toBe(true)
    expect(isForecastPaymentFinished(p, [], '2026-01-10')).toBe(false)
  })

  it('serie sin UNTIL: nunca finalizada', () => {
    const p = payment({ dueDate: '2026-01-31', recurrenceRule: 'FREQ=MONTHLY' })
    expect(isForecastPaymentFinished(p, [], '2030-01-01')).toBe(false)
  })

  it('pago inactivo: nunca se marca como "finalizado" (es un estado distinto, desactivado)', () => {
    const p = payment({ dueDate: '2024-03-31', recurrenceRule: 'FREQ=YEARLY;UNTIL=2026-03-31', active: false })
    expect(isForecastPaymentFinished(p, [], '2026-04-01')).toBe(false)
  })
})

describe('formatForecastAmount (Fase 1C, multidivisa)', () => {
  it('formatea EUR y GBP con su símbolo real, nunca sumados', () => {
    expect(formatForecastAmount(1245, 'EUR')).toContain('€')
    expect(formatForecastAmount(1245, 'EUR')).toContain('1245')
    expect(formatForecastAmount(300, 'GBP')).toContain('300')
  })

  it('código de divisa mal formado: degrada con gracia en vez de reventar la pantalla', () => {
    expect(formatForecastAmount(50, 'EU')).toBe('50.00 EU')
  })
})
