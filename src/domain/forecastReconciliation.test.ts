import { describe, expect, it } from 'vitest'
import { expandForecastOccurrences, type ForecastOccurrence, type ForecastOccurrenceOverride, type ForecastPayment } from './forecast'
import {
  findReconciliationCandidates,
  RECONCILIATION_CONFIDENCE_HIGH_MIN,
  RECONCILIATION_CONFIDENCE_MEDIUM_MIN,
  RECONCILIATION_DATE_WINDOW_DAYS,
  scoreReconciliationCandidate,
  type BankMovementForMatching,
  type ForecastPaymentContextForMatching,
  type OccurrenceForMatching,
} from './forecastReconciliation'

// CASO REAL de esta fase — IBI y Residuos, exactamente los mismos 6 pagos reales usados en las fases de
// UX anteriores (868,56 € exactos, la suma real de los 6 importes — ver forecastMoneyCents.test.ts /
// forecastInstallmentPlanForm.test.ts). Aquí sirven para probar la conciliación del cargo 1/6.
const IBI_OCCURRENCE: ForecastOccurrence = {
  forecastPaymentId: 'fp-ibi',
  title: 'IBI y Residuos',
  occurrenceDate: '2026-11-05',
  installmentSequenceIndex: null,
  dueDate: '2026-11-05',
  expectedPaymentDate: '2026-11-05',
  amountStatus: 'known',
  amount: 144.54,
  currency: 'EUR',
  categoryId: null,
  matchedExpenseId: null,
}
const ACCOUNT_A = 'account-aaaa'
const ACCOUNT_B = 'account-bbbb'
const PAYMENT_WITH_ACCOUNT: ForecastPaymentContextForMatching = { bankAccountId: ACCOUNT_A, title: 'IBI y Residuos', provider: null }
const PAYMENT_NO_ACCOUNT: ForecastPaymentContextForMatching = { bankAccountId: null, title: 'IBI y Residuos', provider: null }

function movement(overrides: Partial<BankMovementForMatching> = {}): BankMovementForMatching {
  return {
    bankTransactionId: 'bt-1',
    expenseId: 'exp-1',
    accountId: ACCOUNT_A,
    date: '2026-11-05',
    amount: 144.54,
    currency: 'EUR',
    description: 'SUMA GESTION TRIBUTARIA',
    isIncome: false,
    ...overrides,
  }
}

describe('scoreReconciliationCandidate — CASO REAL: SUMA (IBI 1/6)', () => {
  it('1) misma cuenta + mismo importe + misma fecha → candidato fuerte (high)', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement())
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('high')
    expect(result!.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['same_account', 'amount_exact', 'date_exact']))
  })

  it('2) CASO REAL: misma cuenta + mismo importe + cargo +2 días (05/11 previsto, cargo real 07/11 tras un fin de semana) → sigue siendo un candidato fuerte', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ date: '2026-11-07' }))
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('high')
    expect(result!.reasons.find((r) => r.code === 'date_near')?.label).toContain('2 días después')
  })

  it('3) importe distinto pero cercano (dentro de tolerancia) → candidato con menos puntuación que el exacto', () => {
    const exact = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement())!
    const close = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ amount: 146.2 }))!
    expect(close).not.toBeNull()
    expect(close.score).toBeLessThan(exact.score)
    expect(close.reasons.some((r) => r.code === 'amount_close')).toBe(true)
  })

  it('CASO REAL sección 10: previsto 144,54 €, banco 146,20 € — la coincidencia de cuenta+fecha basta para proponerlo, nunca se bloquea por el importe', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ amount: 146.2 }))
    expect(result).not.toBeNull()
    expect(result!.confidence).not.toBe('low')
  })

  it('un importe MUY distinto (fuera de tolerancia) no aporta puntos de importe, pero tampoco excluye el candidato (cuenta+fecha pueden bastar)', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ amount: 9999 }))
    expect(result).not.toBeNull()
    expect(result!.reasons.some((r) => r.code === 'amount_exact' || r.code === 'amount_close')).toBe(false)
  })

  it('4) cuenta distinta de la prevista → nunca se propone (ni fuerte ni débil) salvo que se fuerce explícitamente (fuera de esta fase)', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ accountId: ACCOUNT_B }))
    expect(result).toBeNull()
  })

  it('sin cuenta prevista asignada, un movimiento de cualquier cuenta SÍ puede proponerse (pero nunca con el bonus de "misma cuenta")', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_NO_ACCOUNT, movement({ accountId: ACCOUNT_B }))
    expect(result).not.toBeNull()
    expect(result!.reasons.some((r) => r.code === 'same_account')).toBe(false)
  })

  it('5) una ocurrencia YA conciliada nunca se propone de nuevo', () => {
    const result = scoreReconciliationCandidate({ ...IBI_OCCURRENCE, matchedExpenseId: 'exp-ya-conciliado' }, PAYMENT_WITH_ACCOUNT, movement())
    expect(result).toBeNull()
  })

  it('un movimiento sin expense vinculado todavía nunca se propone (nada que conciliar de verdad)', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ expenseId: null }))
    expect(result).toBeNull()
  })

  it('un ingreso (CRDT) nunca se propone para una previsión — una previsión siempre es dinero que sale', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ isIncome: true }))
    expect(result).toBeNull()
  })

  it('20) divisas distintas nunca se comparan como equivalentes, aunque el número coincida exacto', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ currency: 'GBP' }))
    expect(result).toBeNull()
  })

  it(`la ventana de fecha es ±${RECONCILIATION_DATE_WINDOW_DAYS} días — dentro cabe, justo fuera no`, () => {
    const withinWindow = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ date: '2026-11-08' })) // +3
    const outsideWindow = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ date: '2026-11-09' })) // +4
    expect(withinWindow).not.toBeNull()
    expect(outsideWindow).toBeNull()
  })

  it('18) unknown nunca se trata como 0 € — un importe Pendiente nunca aporta puntos de importe, aunque el banco cobre justo 0,00 €', () => {
    const unknownOccurrence: ForecastOccurrence = { ...IBI_OCCURRENCE, amountStatus: 'unknown', amount: null }
    const result = scoreReconciliationCandidate(unknownOccurrence, PAYMENT_WITH_ACCOUNT, movement({ amount: 0 }))
    expect(result).not.toBeNull() // cuenta+fecha siguen siendo válidas
    expect(result!.reasons.some((r) => r.code === 'amount_exact' || r.code === 'amount_close')).toBe(false)
  })

  it('19) estimated conserva su propia naturaleza: un importe estimado "cercano" (nunca exacto por definición) sigue sumando puntos, a diferencia de unknown', () => {
    const estimatedOccurrence: ForecastOccurrence = { ...IBI_OCCURRENCE, amountStatus: 'estimated', amount: 140 }
    const result = scoreReconciliationCandidate(estimatedOccurrence, PAYMENT_WITH_ACCOUNT, movement({ amount: 144.54 }))
    expect(result).not.toBeNull()
    expect(result!.reasons.some((r) => r.code === 'amount_exact' || r.code === 'amount_close')).toBe(true)
  })

  it('confianza: los umbrales están documentados y exportados, nunca un número mágico sin nombre en la UI', () => {
    expect(RECONCILIATION_CONFIDENCE_HIGH_MIN).toBeGreaterThan(RECONCILIATION_CONFIDENCE_MEDIUM_MIN)
  })

  it('cada candidato explica POR QUÉ (reasons no vacío cuando hay algún punto), nunca solo un número', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement())!
    expect(result.reasons.length).toBeGreaterThan(0)
    for (const r of result.reasons) expect(r.label.length).toBeGreaterThan(0)
  })

  it('texto: una coincidencia de concepto suma puntos, pero nunca es obligatoria para tener un candidato válido', () => {
    const withText = scoreReconciliationCandidate(IBI_OCCURRENCE, { ...PAYMENT_WITH_ACCOUNT, title: 'IBI' }, movement({ description: 'RECIBO IBI AYUNTAMIENTO' }))!
    const withoutText = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ description: 'SUMA GESTION TRIBUTARIA' }))!
    expect(withText.reasons.some((r) => r.code === 'text_match')).toBe(true)
    expect(withoutText).not.toBeNull() // sin coincidencia de texto, el candidato sigue siendo válido igualmente
  })
})

describe('findReconciliationCandidates — dedup y planes finitos/recurrentes', () => {
  function candidateInput(occurrence: ForecastOccurrence, payment: ForecastPaymentContextForMatching = PAYMENT_WITH_ACCOUNT): OccurrenceForMatching {
    return { occurrence, payment }
  }

  it('11) un mismo movimiento bancario nunca concilia dos ocurrencias a la vez — se queda con la de mayor puntuación', () => {
    const occurrenceA: ForecastOccurrence = { ...IBI_OCCURRENCE, occurrenceDate: '2026-11-05', expectedPaymentDate: '2026-11-05' }
    const occurrenceB: ForecastOccurrence = { ...IBI_OCCURRENCE, occurrenceDate: '2026-12-05', expectedPaymentDate: '2026-12-05', amount: 999 } // peor candidato: importe muy distinto
    const results = findReconciliationCandidates([candidateInput(occurrenceA), candidateInput(occurrenceB)], [movement({ date: '2026-11-05' })], new Set())
    expect(results).toHaveLength(1)
    expect(results[0].occurrence.occurrenceDate).toBe('2026-11-05')
  })

  it('12) una ocurrencia ya conciliada (matchedExpenseId) nunca vuelve a aparecer como candidata a un segundo movimiento', () => {
    const alreadyMatched: ForecastOccurrence = { ...IBI_OCCURRENCE, matchedExpenseId: 'exp-1' }
    const results = findReconciliationCandidates([candidateInput(alreadyMatched)], [movement({ bankTransactionId: 'bt-2', expenseId: 'exp-2' })], new Set())
    expect(results).toHaveLength(0)
  })

  it('un expense ya usado por OTRA ocurrencia (alreadyMatchedExpenseIds) nunca se vuelve a proponer', () => {
    const results = findReconciliationCandidates([candidateInput(IBI_OCCURRENCE)], [movement()], new Set(['exp-1']))
    expect(results).toHaveLength(0)
  })

  it('16) split charges: dos cargos del MISMO ciclo (misma occurrenceDate, distinto installmentSequenceIndex) se tratan como candidatos totalmente independientes', () => {
    const charge1: ForecastOccurrence = { ...IBI_OCCURRENCE, forecastPaymentId: 'fp-seguro', occurrenceDate: '2027-06-08', installmentSequenceIndex: 1, expectedPaymentDate: '2027-06-10', amount: 300 }
    const charge2: ForecastOccurrence = { ...IBI_OCCURRENCE, forecastPaymentId: 'fp-seguro', occurrenceDate: '2027-06-08', installmentSequenceIndex: 2, expectedPaymentDate: '2027-07-10', amount: 300 }
    const results = findReconciliationCandidates(
      [candidateInput(charge1), candidateInput(charge2)],
      [movement({ bankTransactionId: 'bt-1', expenseId: 'exp-1', date: '2027-06-10', amount: 300 }), movement({ bankTransactionId: 'bt-2', expenseId: 'exp-2', date: '2027-07-10', amount: 300 })],
      new Set(),
    )
    expect(results).toHaveLength(2)
    const bySeq = new Map(results.map((r) => [r.occurrence.installmentSequenceIndex, r.movement.bankTransactionId]))
    expect(bySeq.get(1)).toBe('bt-1')
    expect(bySeq.get(2)).toBe('bt-2')
  })

  it('15) recurrente anual: conciliar el ciclo 2027 no afecta al candidato del ciclo 2028 (misma forecastPaymentId, distinta occurrenceDate)', () => {
    const cycle2027: ForecastOccurrence = { ...IBI_OCCURRENCE, forecastPaymentId: 'fp-seguro', occurrenceDate: '2027-06-08', expectedPaymentDate: '2027-06-08', matchedExpenseId: 'exp-2027', amount: 300 }
    const cycle2028: ForecastOccurrence = { ...IBI_OCCURRENCE, forecastPaymentId: 'fp-seguro', occurrenceDate: '2028-06-08', expectedPaymentDate: '2028-06-08', amount: 300 }
    const results = findReconciliationCandidates(
      [candidateInput(cycle2027), candidateInput(cycle2028)],
      [movement({ bankTransactionId: 'bt-2028', expenseId: 'exp-2028', date: '2028-06-08', amount: 300 })],
      new Set(['exp-2027']),
    )
    expect(results).toHaveLength(1)
    expect(results[0].occurrence.occurrenceDate).toBe('2028-06-08')
  })

  it('resultado ordenado por puntuación descendente', () => {
    const strong: ForecastOccurrence = { ...IBI_OCCURRENCE, occurrenceDate: '2026-11-05', expectedPaymentDate: '2026-11-05' }
    const weak: ForecastOccurrence = { ...IBI_OCCURRENCE, occurrenceDate: '2026-12-05', expectedPaymentDate: '2026-12-05', amount: 300 }
    const results = findReconciliationCandidates(
      [candidateInput(weak, PAYMENT_NO_ACCOUNT), candidateInput(strong)],
      [movement({ bankTransactionId: 'bt-1', expenseId: 'exp-1', date: '2026-11-05' }), movement({ bankTransactionId: 'bt-2', expenseId: 'exp-2', date: '2026-12-05', accountId: ACCOUNT_B })],
      new Set(),
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score)
  })
})

describe('6/7) estado — skipped / previsión inactiva / cuota fuera de ciclo nunca llegan como candidatas (garantía estructural de expandForecastOccurrences)', () => {
  const basePayment: ForecastPayment = {
    id: 'fp-ibi', familyId: 'f1', title: 'IBI y Residuos', categoryId: null, provider: null, notes: null,
    amountStatus: 'known', amount: 144.54, amountEstimatedBasis: null, currency: 'EUR',
    dueDate: '2026-11-05', expectedPaymentDate: null,
    recurrenceRule: 'FREQ=MONTHLY;UNTIL=2027-04-05', // plan finito de 6 cuotas
    bankAccountId: ACCOUNT_A, ownerMemberId: null, showInCalendar: true, calendarEventId: null, active: true,
  }

  it('una cuota "skipped" nunca aparece en la lista de ocurrencias que se le pasa al motor de conciliación', () => {
    const overrides: ForecastOccurrenceOverride[] = [
      { id: 'ov-1', forecastPaymentId: 'fp-ibi', occurrenceDate: '2026-12-05', installmentSequenceIndex: null, dueDateOverride: null, expectedPaymentDateOverride: null, amountStatus: null, amount: null, amountEstimatedBasis: null, skipped: true, matchedExpenseId: null },
    ]
    const occurrences = expandForecastOccurrences(basePayment, overrides, '2026-11-01', '2027-05-01')
    expect(occurrences.some((o) => o.occurrenceDate === '2026-12-05')).toBe(false)
  })

  it('una previsión INACTIVA nunca aporta ocurrencias al motor de conciliación', () => {
    const occurrences = expandForecastOccurrences({ ...basePayment, active: false }, [], '2026-11-01', '2027-05-01')
    expect(occurrences).toHaveLength(0)
  })

  it('10) nunca aparece una 7ª cuota más allá de UNTIL — un plan de 6 cuotas nunca ofrece "7/6" como candidato', () => {
    const occurrences = expandForecastOccurrences(basePayment, [], '2026-11-01', '2027-12-01') // rango mucho más amplio que el plan
    expect(occurrences).toHaveLength(6)
    expect(occurrences.every((o) => o.occurrenceDate <= '2027-04-05')).toBe(true)
  })

  it('8) 6 cuotas del IBI: conciliar la 1/6 dejaría 5 candidatas restantes en la lista (las demás siguen intactas, sin materializar nada extra)', () => {
    const occurrences = expandForecastOccurrences(basePayment, [], '2026-11-05', '2027-04-05')
    expect(occurrences).toHaveLength(6)
    const afterMatchingFirst = occurrences.map((o, i) => (i === 0 ? { ...o, matchedExpenseId: 'exp-1' } : o))
    expect(afterMatchingFirst.filter((o) => !o.matchedExpenseId)).toHaveLength(5)
  })

  it('9) conciliar las seis deja exactamente 0 pendientes, sin que aparezca una séptima', () => {
    const occurrences = expandForecastOccurrences(basePayment, [], '2026-11-05', '2027-04-05')
    const allMatched = occurrences.map((o, i) => ({ ...o, matchedExpenseId: `exp-${i + 1}` }))
    expect(allMatched.filter((o) => !o.matchedExpenseId)).toHaveLength(0)
    expect(allMatched).toHaveLength(6) // nunca una 7ª
  })
})

describe('22/23) regresiones — Seguro Coche Ibiza y CASO REAL IBI y Residuos 868,56 €', () => {
  it('Seguro Coche Ibiza (recurrencia anual indefinida, sin UNTIL) — la conciliación no exige un plan finito: una ocurrencia suelta también es candidata válida', () => {
    const seguro: ForecastPayment = {
      id: 'fp-seguro', familyId: 'f1', title: 'Seguro Coche Ibiza', categoryId: null, provider: null, notes: null,
      amountStatus: 'known', amount: 450, amountEstimatedBasis: null, currency: 'EUR',
      dueDate: '2027-06-08', expectedPaymentDate: null, recurrenceRule: 'FREQ=YEARLY',
      bankAccountId: ACCOUNT_A, ownerMemberId: null, showInCalendar: true, calendarEventId: null, active: true,
    }
    const [occurrence] = expandForecastOccurrences(seguro, [], '2027-06-08', '2027-06-08')
    const result = scoreReconciliationCandidate(occurrence, { bankAccountId: seguro.bankAccountId, title: seguro.title, provider: null }, movement({ date: '2027-06-08', amount: 450 }))
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('high')
  })

  it('CASO REAL: el cargo 1/6 del IBI (144,54 €, 05/11/2026) encuentra el movimiento SUMA como candidato fuerte', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ description: 'SUMA GESTION TRIBUTARIA', date: '2026-11-05', amount: 144.54 }))
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('high')
  })

  it('17) el importe real distinto del previsto (146,20 € banco vs 144,54 € previsto) nunca se usa para sobrescribir amount/amountStatus de la ocurrencia — eso es responsabilidad de matchForecastOccurrence (snapshot), el motor de candidatos solo puntúa, nunca escribe nada', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ amount: 146.2 }))
    expect(result).not.toBeNull()
    // El motor es de solo lectura: la propia ocurrencia de entrada nunca se muta.
    expect(IBI_OCCURRENCE.amount).toBe(144.54)
  })
})
