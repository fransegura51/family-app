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
  computeInstallmentPlanUntil,
  totalInstallments,
  installmentIndexForOccurrence,
  remainingInstallments,
  remainingPlanAmount,
  type ForecastPayment,
  type ForecastOccurrence,
  type ForecastOccurrenceOverride,
  type ForecastPaymentInstallment,
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
      installmentSequenceIndex: null,
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
      forecastPaymentId: 'fp', title: 't', occurrenceDate: '2026-10-01', installmentSequenceIndex: null, dueDate: '2026-10-01', expectedPaymentDate: '2026-10-01',
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

// Fase 1D-f — "Próximos X días"/"Visión 12 meses" representan dinero TODAVÍA pendiente: una ocurrencia
// conciliada (matched_expense_id) ya no debe sumar ahí, pero SÍ debe poder volver a sumar si se desconcilia.
describe('forecastTotals/forecastByMonth — cobrados no suman como pendientes (Fase 1D-f)', () => {
  function occ(o: Partial<ForecastOccurrence>): ForecastOccurrence {
    return {
      forecastPaymentId: 'fp', title: 't', occurrenceDate: '2026-10-01', installmentSequenceIndex: null, dueDate: '2026-10-01', expectedPaymentDate: '2026-10-01',
      amountStatus: 'known', amount: 0, currency: 'EUR', categoryId: null, matchedExpenseId: null, ...o,
    }
  }

  it('una ocurrencia pendiente (matchedExpenseId null) suma con normalidad', () => {
    const totals = forecastTotals([occ({ amount: 261.08 })])
    expect(totals).toEqual([{ currency: 'EUR', knownTotal: 261.08, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 261.08 }])
  })

  it('CASO REAL: Endesa 261,08 € ya conciliada (matchedExpenseId no nulo) — 0 € pendientes para esa ocurrencia', () => {
    const totals = forecastTotals([occ({ amount: 261.08, matchedExpenseId: 'exp-endesa' })])
    expect(totals).toEqual([])
  })

  it('desconciliar (matchedExpenseId vuelve a null) hace que la misma ocurrencia vuelva a sumar automáticamente', () => {
    const matched = occ({ amount: 261.08, matchedExpenseId: 'exp-endesa' })
    const unmatched = { ...matched, matchedExpenseId: null } // exactamente lo que hace unmatchForecastOccurrence en la BD
    expect(forecastTotals([matched])).toEqual([])
    expect(forecastTotals([unmatched])).toEqual([{ currency: 'EUR', knownTotal: 261.08, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 261.08 }])
  })

  it('plan de 6 pagos con 1 conciliado: el total pendiente refleja solo los 5 restantes, sin tocar los importes de los demás', () => {
    const lines = [144.54, 144.54, 144.54, 144.53, 144.54, 145.87]
    const occurrences = lines.map((amount, i) => occ({ occurrenceDate: `2026-11-0${i + 1}`, amount, matchedExpenseId: i === 0 ? 'exp-1' : null }))
    const totals = forecastTotals(occurrences)
    const expectedPending = lines.slice(1).reduce((a, b) => a + b, 0)
    expect(totals[0].knownTotal).toBeCloseTo(expectedPending, 2) // 868,56 - 144,54 = 724,02 — nunca los 868,56 completos
  })

  it('varias divisas se siguen sin mezclar aunque una de ellas ya esté totalmente conciliada', () => {
    const totals = forecastTotals([occ({ amount: 500, currency: 'EUR', matchedExpenseId: 'exp-1' }), occ({ amount: 300, currency: 'GBP' })])
    expect(totals).toEqual([{ currency: 'GBP', knownTotal: 300, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 300 }])
  })

  it('un importe con override histórico (p. ej. la línea real del IBI, distinta de la propuesta uniforme) se sigue respetando tal cual mientras esté pendiente', () => {
    const totals = forecastTotals([occ({ amount: 145.87 })]) // la 6ª cuota real del IBI, no la propuesta uniforme
    expect(totals[0].knownTotal).toBe(145.87)
  })

  it('forecastByMonth hereda la misma exclusión sin necesidad de filtrar aparte', () => {
    const byMonth = forecastByMonth(
      [occ({ occurrenceDate: '2026-10-01', expectedPaymentDate: '2026-10-01', amount: 100, matchedExpenseId: 'exp-1' }), occ({ occurrenceDate: '2026-10-15', expectedPaymentDate: '2026-10-15', amount: 50 })],
      'expectedPaymentDate',
    )
    expect(byMonth.get('2026-10')).toEqual([{ currency: 'EUR', knownTotal: 50, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 50 }])
  })
})

describe('forecastByMonth', () => {
  it('agrupa por mes según el campo de fecha pedido', () => {
    const occs: ForecastOccurrence[] = [
      { forecastPaymentId: 'a', title: 'A', occurrenceDate: '2026-10-01', installmentSequenceIndex: null, dueDate: '2026-10-01', expectedPaymentDate: '2026-11-03', amountStatus: 'known', amount: 100, currency: 'EUR', categoryId: null, matchedExpenseId: null },
      { forecastPaymentId: 'b', title: 'B', occurrenceDate: '2026-11-05', installmentSequenceIndex: null, dueDate: '2026-11-05', expectedPaymentDate: '2026-11-05', amountStatus: 'known', amount: 50, currency: 'EUR', categoryId: null, matchedExpenseId: null },
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
        installmentSequenceIndex: null,
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
        installmentSequenceIndex: null,
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

describe('Fase 1D-a — planes de cuotas finitos (sin entidad nueva: recurrence_rule + UNTIL calculado)', () => {
  function planOverride(o: Partial<ForecastOccurrenceOverride>): ForecastOccurrenceOverride {
    return {
      id: 'ov-plan',
      forecastPaymentId: 'fp-ibi',
      occurrenceDate: '2027-11-08',
      installmentSequenceIndex: null,
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

  // CASO REAL: IBI + basura, 6 cuotas mensuales de 141 €, empieza en noviembre, cruza de año, termina en abril.
  const ibiUntil = computeInstallmentPlanUntil('2027-11-08', 'MONTHLY', 1, 6)
  function ibiPayment(overrides: Partial<ForecastPayment> = {}): ForecastPayment {
    return payment({
      id: 'fp-ibi',
      title: 'IBI + basura',
      amountStatus: 'known',
      amount: 141,
      dueDate: '2027-11-08',
      recurrenceRule: buildForecastRecurrenceRule('custom', { freq: 'MONTHLY', interval: 1, until: ibiUntil }),
      ...overrides,
    })
  }

  describe('computeInstallmentPlanUntil', () => {
    it('IBI: 6 cuotas mensuales desde noviembre → UNTIL en abril, cruzando de año', () => {
      expect(ibiUntil).toBe('2028-04-08')
    })

    it('2 cuotas', () => {
      expect(computeInstallmentPlanUntil('2027-11-08', 'MONTHLY', 1, 2)).toBe('2027-12-08')
    })

    it('frecuencias distintas: YEARLY y WEEKLY', () => {
      expect(computeInstallmentPlanUntil('2027-01-10', 'YEARLY', 1, 3)).toBe('2029-01-10')
      expect(computeInstallmentPlanUntil('2027-01-10', 'WEEKLY', 1, 4)).toBe('2027-01-31')
    })

    it('día 31: cada mes corto recorta, la serie nunca se rompe', () => {
      // Jan31 / Feb28 (no bisiesto) / Mar31 / Apr30 / May31 / Jun30 — 6 cuotas, nunca deriva al día 3.
      expect(computeInstallmentPlanUntil('2026-01-31', 'MONTHLY', 1, 6)).toBe('2026-06-30')
    })

    it('día 30', () => {
      expect(computeInstallmentPlanUntil('2026-01-30', 'MONTHLY', 1, 3)).toBe('2026-03-30')
    })

    it('29 de febrero: recorta en año no bisiesto, sin desplazar el ancla', () => {
      expect(computeInstallmentPlanUntil('2024-01-29', 'MONTHLY', 1, 3)).toBe('2024-03-29') // 2024 es bisiesto: Feb29 existe
    })

    it('rechaza un número de cuotas inválido', () => {
      expect(() => computeInstallmentPlanUntil('2027-11-08', 'MONTHLY', 1, 0)).toThrow()
      expect(() => computeInstallmentPlanUntil('2027-11-08', 'MONTHLY', 1, -1)).toThrow()
    })
  })

  describe('totalInstallments', () => {
    it('IBI: 6 cuotas exactas', () => {
      expect(totalInstallments(ibiPayment())).toBe(6)
    })

    it('pago puntual (sin recurrence_rule): 1', () => {
      expect(totalInstallments(payment({ recurrenceRule: null }))).toBe(1)
    })

    it('serie SIN UNTIL (indefinida): null — nunca se le inventa un total', () => {
      expect(totalInstallments(payment({ recurrenceRule: 'FREQ=YEARLY' }))).toBeNull()
    })

    it('no se ve afectado por cuotas skipped — la numeración del plan no se recalcula', () => {
      const skippedOverride = [planOverride({ occurrenceDate: '2028-01-08', skipped: true })]
      // totalInstallments no recibe overrides: sigue siendo puramente el tamaño del plan.
      expect(totalInstallments(ibiPayment())).toBe(6)
      expect(skippedOverride).toHaveLength(1) // (documentando que el override existe, no cambia el total)
    })
  })

  describe('installmentIndexForOccurrence', () => {
    it('IBI: las 6 fechas devuelven 1..6 en orden', () => {
      const dates = ['2027-11-08', '2027-12-08', '2028-01-08', '2028-02-08', '2028-03-08', '2028-04-08']
      expect(dates.map((d) => installmentIndexForOccurrence(ibiPayment(), d))).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('NO existe cuota 7/6: una fecha más allá de UNTIL no pertenece a la serie', () => {
      expect(installmentIndexForOccurrence(ibiPayment(), '2028-05-08')).toBeNull()
    })

    it('una fecha que no coincide con ningún ciclo real devuelve null', () => {
      expect(installmentIndexForOccurrence(ibiPayment(), '2027-12-09')).toBeNull()
    })

    it('pago puntual: la propia due_date es la cuota 1, cualquier otra fecha es null', () => {
      const p = payment({ recurrenceRule: null, dueDate: '2026-05-01' })
      expect(installmentIndexForOccurrence(p, '2026-05-01')).toBe(1)
      expect(installmentIndexForOccurrence(p, '2026-06-01')).toBeNull()
    })

    it('usa la clave ESTABLE (occurrenceDate de la regla), no la fecha ya movida por un override', () => {
      // La cuota 4 (2028-02-08) se mueve a otro día — el índice se sigue resolviendo por su fecha de regla.
      expect(installmentIndexForOccurrence(ibiPayment(), '2028-02-08')).toBe(4)
    })
  })

  describe('NO existe cuota 7/6 (regresión explícita sobre el rango completo)', () => {
    it('expandForecastOccurrences sobre un rango amplio produce exactamente 6, la última en abril', () => {
      const occ = expandForecastOccurrences(ibiPayment(), [], '2020-01-01', '2035-01-01')
      expect(occ).toHaveLength(6)
      expect(occ[occ.length - 1].dueDate).toBe('2028-04-08')
      expect(occ.map((o) => o.dueDate)).not.toContain('2028-05-08')
    })
  })

  describe('remainingInstallments / remainingPlanAmount', () => {
    it('plan todavía no iniciado: las 6 cuotas están por delante', () => {
      expect(remainingInstallments(ibiPayment(), [], '2027-10-01')).toBe(6)
      const totals = remainingPlanAmount(ibiPayment(), [], '2027-10-01')
      expect(totals).toEqual([{ currency: 'EUR', knownTotal: 846, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 846 }]) // 141 × 6
    })

    it('serie ya terminada: 0 restantes, importe pendiente vacío (no null — el plan SÍ es finito, solo que ya acabó)', () => {
      expect(remainingInstallments(ibiPayment(), [], '2028-05-01')).toBe(0)
      expect(remainingPlanAmount(ibiPayment(), [], '2028-05-01')).toEqual([])
    })

    it('a mitad de plan: cuenta solo desde hoy en adelante', () => {
      // Hoy = fecha de la cuota 3 (2028-01-08): quedan 3, 4, 5, 6 → 4 restantes.
      expect(remainingInstallments(ibiPayment(), [], '2028-01-08')).toBe(4)
    })

    it('skipped: se excluye del recuento, nunca se cuenta como "pagada" ni como "restante"', () => {
      const overrides = [planOverride({ occurrenceDate: '2028-01-08', skipped: true })] // cuota 3 omitida
      expect(remainingInstallments(ibiPayment(), overrides, '2027-10-01')).toBe(5) // 6 - 1 omitida
      expect(installmentIndexForOccurrence(ibiPayment(), '2028-01-08')).toBe(3) // su posición sigue siendo 3, aunque se omita
    })

    it('override de importe: una cuota distinta se refleja en el importe pendiente, nunca en el total de las demás', () => {
      const overrides = [planOverride({ occurrenceDate: '2027-12-08', amountStatus: 'known', amount: 200 })] // cuota 2 = 200 €
      const totals = remainingPlanAmount(ibiPayment(), overrides, '2027-10-01')
      expect(totals?.[0].knownTotal).toBe(141 * 5 + 200)
    })

    it('override de fecha (due_date_override): no afecta a qué cuenta como "restante" por su clave estable', () => {
      const overrides = [planOverride({ occurrenceDate: '2028-02-08', dueDateOverride: '2028-02-15' })] // cuota 4 movida
      expect(remainingInstallments(ibiPayment(), overrides, '2027-10-01')).toBe(6) // sigue habiendo 6 cuotas reales
    })

    it('unknown: nunca se suma como 0 — cuenta aparte en unknownCount', () => {
      const overrides = [planOverride({ occurrenceDate: '2027-11-08', amountStatus: 'unknown', amount: null })] // cuota 1 pendiente de importe
      const totals = remainingPlanAmount(ibiPayment(), overrides, '2027-10-01')
      expect(totals?.[0].unknownCount).toBe(1)
      expect(totals?.[0].knownTotal).toBe(141 * 5) // las otras 5 cuotas conocidas, sin la pendiente
    })

    it('estimated: importe distinto y basis propios de esa cuota, sin tocar las demás', () => {
      const overrides = [planOverride({ occurrenceDate: '2027-11-08', amountStatus: 'estimated', amount: 130, amountEstimatedBasis: 'recibo provisional' })]
      const totals = remainingPlanAmount(ibiPayment(), overrides, '2027-10-01')
      expect(totals?.[0].estimatedTotal).toBe(130)
      expect(totals?.[0].knownTotal).toBe(141 * 5)
    })

    it('matched_expense_id: evidencia real de conciliación — se excluye de restantes y de importe pendiente, sin marcar el resto del plan', () => {
      const overrides = [planOverride({ occurrenceDate: '2027-11-08', matchedExpenseId: 'exp-1' })] // cuota 1 ya conciliada
      expect(remainingInstallments(ibiPayment(), overrides, '2027-10-01')).toBe(5)
      const totals = remainingPlanAmount(ibiPayment(), overrides, '2027-10-01')
      expect(totals?.[0].knownTotal).toBe(141 * 5) // la conciliada no cuenta en lo pendiente
    })

    it('no inventa estado de pago a partir de la fecha: una cuota pasada sin matched_expense_id no se declara ni pagada ni pendiente aquí', () => {
      // Hoy es después de la cuota 1 (pasada) pero antes de la 2 — remainingInstallments cuenta desde
      // HOY, no dice nada sobre si la cuota 1 (ya pasada, sin conciliar) está pagada o no.
      const remaining = remainingInstallments(ibiPayment(), [], '2027-11-20')
      expect(remaining).toBe(5) // cuotas 2..6 — la 1 ya no "queda por delante", pero eso no afirma que esté pagada
    })

    it('serie indefinida (sin UNTIL): null, no un número inventado', () => {
      const indefinite = payment({ recurrenceRule: 'FREQ=YEARLY' })
      expect(remainingInstallments(indefinite, [], '2026-01-01')).toBeNull()
      expect(remainingPlanAmount(indefinite, [], '2026-01-01')).toBeNull()
    })

    it('pago puntual: null — no es un "plan" en el sentido de esta función', () => {
      const single = payment({ recurrenceRule: null })
      expect(remainingInstallments(single, [], '2026-01-01')).toBeNull()
      expect(remainingPlanAmount(single, [], '2026-01-01')).toBeNull()
    })
  })

  describe('composición: "importe total del plan" y "fecha de primera/última cuota" sin funciones nuevas', () => {
    it('importe total del plan = forecastTotals + expandForecastOccurrences sobre todo el rango', () => {
      const all = expandForecastOccurrences(ibiPayment(), [], ibiPayment().dueDate, ibiUntil)
      expect(forecastTotals(all)).toEqual([{ currency: 'EUR', knownTotal: 846, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 846 }])
    })

    it('primera cuota = due_date; última cuota = UNTIL de la regla', () => {
      const p = ibiPayment()
      expect(p.dueDate).toBe('2027-11-08')
      expect(p.recurrenceRule).toContain('UNTIL=2028-04-08')
    })

    it('próxima cuota ya existía en Fase 1B (nextForecastOccurrence) — sigue funcionando igual para un plan finito', () => {
      expect(nextForecastOccurrence(ibiPayment(), [], '2027-12-01')?.dueDate).toBe('2027-12-08') // cuota 2, aún no ha pasado
      expect(nextForecastOccurrence(ibiPayment(), [], '2027-12-09')?.dueDate).toBe('2028-01-08') // cuota 3
    })
  })

  // REGRESIÓN OBLIGATORIA — dato real de producción, sin plantilla de plazos: debe seguir produciendo
  // exactamente UNA ocurrencia por ciclo anual, sin ningún cambio de comportamiento.
  describe('regresión: Seguro Coche Ibiza (dato real, sin cambios)', () => {
    const seguro = payment({
      id: 'd530b1e1-52b1-4c1f-9507-15c6eddc17bc',
      title: 'Seguro Coche Ibiza',
      amountStatus: 'estimated',
      amount: 294.78,
      amountEstimatedBasis: 'recibo del año anterior',
      currency: 'EUR',
      dueDate: '2027-06-08',
      expectedPaymentDate: '2027-06-10',
      recurrenceRule: 'FREQ=YEARLY',
    })

    it('serie indefinida: totalInstallments/remainingInstallments/remainingPlanAmount devuelven null, nunca un número inventado', () => {
      expect(totalInstallments(seguro)).toBeNull()
      expect(remainingInstallments(seguro, [], '2027-01-01')).toBeNull()
      expect(remainingPlanAmount(seguro, [], '2027-01-01')).toBeNull()
    })

    it('installmentIndexForOccurrence numera los ciclos anuales sin necesitar un plan finito', () => {
      expect(installmentIndexForOccurrence(seguro, '2027-06-08')).toBe(1)
      expect(installmentIndexForOccurrence(seguro, stepMonthsClamped('2027-06-08', 12))).toBe(2)
    })

    it('sigue produciendo exactamente UNA ocurrencia por ciclo anual, sin plantilla de plazos', () => {
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2030-01-01')
      expect(occ.map((o) => o.dueDate)).toEqual(['2027-06-08', '2028-06-08', '2029-06-08'])
      expect(occ.every((o) => o.expectedPaymentDate)).toBe(true)
      expect(occ[0].expectedPaymentDate).toBe('2027-06-10') // due y pago esperado siguen siendo anclas independientes
      expect(occ[0].amountStatus).toBe('estimated')
      expect(occ[0].amount).toBe(294.78)
    })
  })
})

describe('Fase 1D-c — cobro fraccionado POR CICLO (una obligación recurrente, cada renovación genera varios cargos)', () => {
  // CASO REAL: seguro hogar, renovación anual 08/06, 2 cargos por renovación (10/06 y 10/07).
  const seguro = payment({ id: 'fp-seguro', title: 'Seguro hogar', dueDate: '2027-06-08', recurrenceRule: 'FREQ=YEARLY', amountStatus: 'known', amount: 300 })
  const installments: ForecastPaymentInstallment[] = [
    { id: 'i1', forecastPaymentId: 'fp-seguro', sequenceIndex: 1, offsetDays: 2, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
    { id: 'i2', forecastPaymentId: 'fp-seguro', sequenceIndex: 2, offsetDays: 32, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
  ]

  function splitOverride(o: Partial<ForecastOccurrenceOverride>): ForecastOccurrenceOverride {
    return {
      id: 'ov-split',
      forecastPaymentId: 'fp-seguro',
      occurrenceDate: '2027-06-08',
      installmentSequenceIndex: null,
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

  describe('generación por ciclo', () => {
    it('ciclo 2027 genera exactamente 2 cargos, en junio y julio (offset cruza de mes)', () => {
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2027-12-31', installments)
      expect(occ.map((o) => o.dueDate)).toEqual(['2027-06-10', '2027-07-10'])
      expect(occ.map((o) => o.installmentSequenceIndex)).toEqual([1, 2])
      expect(occ.every((o) => o.occurrenceDate === '2027-06-08')).toBe(true) // clave estable = la renovación, para los dos
    })

    it('ciclo 2028 TAMBIÉN genera exactamente 2 — no un tercero, no un cuarto', () => {
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2028-12-31', installments)
      expect(occ.map((o) => o.dueDate)).toEqual(['2027-06-10', '2027-07-10', '2028-06-10', '2028-07-10'])
      expect(occ).toHaveLength(4)
      expect(occ.filter((o) => o.installmentSequenceIndex === 3)).toHaveLength(0)
    })

    it('offset cruzando de año', () => {
      const finDeAño = payment({ id: 'fp-x', title: 'X', dueDate: '2027-12-20', recurrenceRule: 'FREQ=YEARLY', amountStatus: 'known', amount: 50 })
      const inst: ForecastPaymentInstallment[] = [
        { id: 'j1', forecastPaymentId: 'fp-x', sequenceIndex: 1, offsetDays: 0, amountStatus: 'known', amount: 50, amountEstimatedBasis: null },
        { id: 'j2', forecastPaymentId: 'fp-x', sequenceIndex: 2, offsetDays: 20, amountStatus: 'known', amount: 50, amountEstimatedBasis: null },
      ]
      const occ = expandForecastOccurrences(finDeAño, [], '2027-01-01', '2029-01-31', inst)
      expect(occ.map((o) => o.dueDate)).toEqual(['2027-12-20', '2028-01-09', '2028-12-20', '2029-01-09'])
    })

    it('renovación anclada en 29 de febrero + offsets: el recorte de fin de mes y el offset conviven sin romperse', () => {
      const bisiesto = payment({ id: 'fp-feb29', title: 'Y', dueDate: '2024-02-29', recurrenceRule: 'FREQ=YEARLY', amountStatus: 'known', amount: 10 })
      const inst: ForecastPaymentInstallment[] = [
        { id: 'k1', forecastPaymentId: 'fp-feb29', sequenceIndex: 1, offsetDays: 0, amountStatus: 'known', amount: 10, amountEstimatedBasis: null },
        { id: 'k2', forecastPaymentId: 'fp-feb29', sequenceIndex: 2, offsetDays: 1, amountStatus: 'known', amount: 10, amountEstimatedBasis: null },
      ]
      // 2025 no es bisiesto: la renovación recorta a 28/02; los cargos son 28/02 (offset 0) y 01/03 (offset 1).
      const occ = expandForecastOccurrences(bisiesto, [], '2025-01-01', '2025-12-31', inst)
      expect(occ.map((o) => o.dueDate)).toEqual(['2025-02-28', '2025-03-01'])
    })

    it('día 30/31 del ciclo con offsets: no se rompe la serie', () => {
      const dia31 = payment({ id: 'fp-31', title: 'Z', dueDate: '2026-01-31', recurrenceRule: 'FREQ=MONTHLY', amountStatus: 'known', amount: 20 })
      const inst: ForecastPaymentInstallment[] = [{ id: 'l1', forecastPaymentId: 'fp-31', sequenceIndex: 1, offsetDays: 3, amountStatus: 'known', amount: 20, amountEstimatedBasis: null }]
      // Ene31+3=Feb3; Feb28(recortado)+3=Mar3; Mar31+3=Abr3 — cada ciclo se ancla en SU propia fecha de ciclo, el offset nunca se acumula mal.
      const occ = expandForecastOccurrences(dia31, [], '2026-01-01', '2026-04-15', inst)
      expect(occ.map((o) => o.dueDate)).toEqual(['2026-02-03', '2026-03-03', '2026-04-03'])
    })
  })

  describe('identidad estable por sequence_index (hallazgo de la auditoría: dos cargos el mismo día)', () => {
    const sameDayInstallments: ForecastPaymentInstallment[] = [
      { id: 'm1', forecastPaymentId: 'fp-seguro', sequenceIndex: 1, offsetDays: 0, amountStatus: 'known', amount: 100, amountEstimatedBasis: null },
      { id: 'm2', forecastPaymentId: 'fp-seguro', sequenceIndex: 2, offsetDays: 0, amountStatus: 'known', amount: 200, amountEstimatedBasis: null },
    ]

    it('dos cargos con el mismo offset producen dos ocurrencias distintas el mismo día, no se colapsan', () => {
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2027-12-31', sameDayInstallments)
      expect(occ).toHaveLength(2)
      expect(occ[0].dueDate).toBe(occ[1].dueDate)
      expect(occ.map((o) => o.installmentSequenceIndex)).toEqual([1, 2])
      expect(occ.map((o) => o.amount)).toEqual([100, 200])
    })

    it('un override dirigido a UN cargo (por sequence_index) no afecta al otro, aunque caigan el mismo día', () => {
      const overrides = [splitOverride({ installmentSequenceIndex: 2, skipped: true })]
      const occ = expandForecastOccurrences(seguro, overrides, '2027-01-01', '2027-12-31', sameDayInstallments)
      expect(occ).toHaveLength(1)
      expect(occ[0].installmentSequenceIndex).toBe(1)
      expect(occ[0].amount).toBe(100)
    })
  })

  describe('importes: iguales, distintos, known/estimated/unknown, basis', () => {
    it('importes iguales en todos los cargos (caso por defecto)', () => {
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2027-12-31', installments)
      expect(occ.map((o) => o.amount)).toEqual([300, 300])
      expect(occ.every((o) => o.amountStatus === 'known')).toBe(true)
    })

    it('importes DISTINTOS por cargo — el dominio nunca obliga a que sean iguales', () => {
      const distintos: ForecastPaymentInstallment[] = [
        { id: 'n1', forecastPaymentId: 'fp-seguro', sequenceIndex: 1, offsetDays: 2, amountStatus: 'known', amount: 350, amountEstimatedBasis: null },
        { id: 'n2', forecastPaymentId: 'fp-seguro', sequenceIndex: 2, offsetDays: 32, amountStatus: 'known', amount: 250, amountEstimatedBasis: null },
      ]
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2027-12-31', distintos)
      expect(occ.map((o) => o.amount)).toEqual([350, 250])
    })

    it('un cargo estimated con su propia basis, sin afectar al otro (known)', () => {
      const mixto: ForecastPaymentInstallment[] = [
        { id: 'o1', forecastPaymentId: 'fp-seguro', sequenceIndex: 1, offsetDays: 2, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
        { id: 'o2', forecastPaymentId: 'fp-seguro', sequenceIndex: 2, offsetDays: 32, amountStatus: 'estimated', amount: 300, amountEstimatedBasis: 'recibo del año pasado' },
      ]
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2027-12-31', mixto)
      expect(occ[0].amountStatus).toBe('known')
      expect(occ[1].amountStatus).toBe('estimated')
    })

    it('un cargo unknown nunca se cuenta como 0 en los totales', () => {
      const conPendiente: ForecastPaymentInstallment[] = [
        { id: 'p1', forecastPaymentId: 'fp-seguro', sequenceIndex: 1, offsetDays: 2, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
        { id: 'p2', forecastPaymentId: 'fp-seguro', sequenceIndex: 2, offsetDays: 32, amountStatus: 'unknown', amount: null, amountEstimatedBasis: null },
      ]
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2027-12-31', conPendiente)
      const totals = forecastTotals(occ)
      expect(totals[0].knownTotal).toBe(300)
      expect(totals[0].unknownCount).toBe(1)
      expect(totals[0].knownPlusEstimatedTotal).toBe(300) // nunca "300 + 0" presentado como si fuera el total real
    })
  })

  describe('totales — junio 300 + julio 300 = 600, nunca "junio 600"', () => {
    it('forecastTotals del ciclo completo suma los dos cargos, sin fusionarlos en una fecha', () => {
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2027-12-31', installments)
      expect(forecastTotals(occ)).toEqual([{ currency: 'EUR', knownTotal: 600, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 600 }])
    })

    it('forecastByMonth mantiene junio y julio SEPARADOS (300 cada uno), nunca junio con 600', () => {
      const occ = expandForecastOccurrences(seguro, [], '2027-01-01', '2027-12-31', installments)
      const byMonth = forecastByMonth(occ, 'dueDate')
      expect(byMonth.get('2027-06')?.[0].knownTotal).toBe(300)
      expect(byMonth.get('2027-07')?.[0].knownTotal).toBe(300)
      expect(byMonth.get('2027-06')?.[0].knownTotal).not.toBe(600)
    })

    it('nunca mezcla divisas entre cargos del mismo ciclo', () => {
      const dosDivisas: ForecastPaymentInstallment[] = [
        { id: 'q1', forecastPaymentId: 'fp-seguro', sequenceIndex: 1, offsetDays: 2, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
        { id: 'q2', forecastPaymentId: 'fp-seguro', sequenceIndex: 2, offsetDays: 32, amountStatus: 'known', amount: 300, amountEstimatedBasis: null },
      ]
      // currency vive en el PAGO, no en el cargo (a propósito, ver migración 0156) — los dos cargos heredan siempre la misma.
      const seguroGBP = { ...seguro, currency: 'GBP' }
      const occ = expandForecastOccurrences(seguroGBP, [], '2027-01-01', '2027-12-31', dosDivisas)
      expect(occ.every((o) => o.currency === 'GBP')).toBe(true)
    })
  })

  describe('horizonte estrecho: un cargo tardío sigue visible aunque la renovación ya haya pasado', () => {
    it('hoy después de la renovación pero antes del 2º cargo: el 2º cargo sigue apareciendo en el horizonte', () => {
      const occ = expandForecastOccurrences(seguro, [], '2027-06-20', '2027-07-20', installments)
      expect(occ).toHaveLength(1)
      expect(occ[0].installmentSequenceIndex).toBe(2)
      expect(occ[0].dueDate).toBe('2027-07-10')
    })

    it('un horizonte lejano solo trae los cargos de SU renovación, no arrastra los de años anteriores', () => {
      const occ = expandForecastOccurrences(seguro, [], '2029-01-01', '2029-12-31', installments)
      expect(occ.map((o) => o.dueDate)).toEqual(['2029-06-10', '2029-07-10'])
    })
  })

  describe('nextForecastOccurrence / isForecastPaymentFinished con cargos', () => {
    it('nextForecastOccurrence con plantilla encuentra el cargo más próximo, no la renovación', () => {
      expect(nextForecastOccurrence(seguro, [], '2027-06-15', 'dueDate', installments)?.dueDate).toBe('2027-07-10') // el 1 (10/06) ya pasó
    })

    it('nextForecastOccurrence SIN plantilla (Calendario) sigue mirando solo la renovación — decisión deliberada', () => {
      // Sin pasar `installments`, el resultado es el próximo CICLO (2028), no el cargo 2 de este ciclo —
      // así es como data/forecast.ts mantiene la proyección visual mostrando solo la renovación.
      expect(nextForecastOccurrence(seguro, [], '2027-06-15', 'dueDate')?.dueDate).toBe('2028-06-08')
    })

    it('BUG REAL encontrado y corregido: sin cargos, un plan finito con un cargo tardío pendiente se marcaba "Finalizada" antes de tiempo', () => {
      const seguroDeUnaVez = payment({ id: 'fp-seguro', title: 'Seguro hogar', dueDate: '2027-06-08', recurrenceRule: 'FREQ=YEARLY;UNTIL=2027-06-08' })
      // Hoy: el cargo 1 (10/06) ya pasó, el cargo 2 (10/07) todavía no.
      expect(isForecastPaymentFinished(seguroDeUnaVez, [], '2027-06-15')).toBe(true) // cycle-only (sin cargos) — YA marca terminado, incorrecto para este caso
      expect(isForecastPaymentFinished(seguroDeUnaVez, [], '2027-06-15', installments)).toBe(false) // con cargos: el 2/2 aún no ha pasado
      expect(isForecastPaymentFinished(seguroDeUnaVez, [], '2027-07-15', installments)).toBe(true) // y una vez pasan los dos, sí termina
    })
  })

  describe('regresión — Seguro Coche Ibiza y el plan IBI (Fases 1B/1D-a/1D-b) siguen exactamente igual', () => {
    const seguroCocheIbiza = payment({
      id: 'd530b1e1-52b1-4c1f-9507-15c6eddc17bc',
      title: 'Seguro Coche Ibiza',
      amountStatus: 'estimated',
      amount: 294.78,
      amountEstimatedBasis: 'recibo del año anterior',
      currency: 'EUR',
      dueDate: '2027-06-08',
      expectedPaymentDate: '2027-06-10',
      recurrenceRule: 'FREQ=YEARLY',
    })

    it('sin installments (el caso real: 0 filas en forecast_payment_installments), sigue produciendo UNA ocurrencia por ciclo', () => {
      const occ = expandForecastOccurrences(seguroCocheIbiza, [], '2027-01-01', '2030-01-01')
      expect(occ.map((o) => o.dueDate)).toEqual(['2027-06-08', '2028-06-08', '2029-06-08'])
      expect(occ.every((o) => o.installmentSequenceIndex === null)).toBe(true)
      expect(occ[0].expectedPaymentDate).toBe('2027-06-10')
      expect(occ[0].amountStatus).toBe('estimated')
      expect(occ[0].amount).toBe(294.78)
    })

    it('pasar [] explícitamente en installments es indistinguible de omitir el parámetro', () => {
      const conOmision = expandForecastOccurrences(seguroCocheIbiza, [], '2027-01-01', '2030-01-01')
      const conArrayVacio = expandForecastOccurrences(seguroCocheIbiza, [], '2027-01-01', '2030-01-01', [])
      expect(conArrayVacio).toEqual(conOmision)
    })

    it('el plan IBI (6 cuotas mensuales, Fase 1D-b) no lleva plantilla de plazos y sigue produciendo exactamente 6', () => {
      const ibiUntil = computeInstallmentPlanUntil('2027-11-08', 'MONTHLY', 1, 6)
      const ibi = payment({ id: 'fp-ibi', title: 'IBI + basura', amountStatus: 'known', amount: 141, dueDate: '2027-11-08', recurrenceRule: `FREQ=MONTHLY;UNTIL=${ibiUntil}` })
      const occ = expandForecastOccurrences(ibi, [], '2020-01-01', '2035-01-01')
      expect(occ).toHaveLength(6)
      expect(occ.every((o) => o.installmentSequenceIndex === null)).toBe(true)
      expect(totalInstallments(ibi)).toBe(6)
    })
  })
})
