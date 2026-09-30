import { describe, expect, it } from 'vitest'
import { expandForecastOccurrences, forecastTotals, type ForecastOccurrence, type ForecastOccurrenceOverride, type ForecastPayment } from './forecast'
import {
  findReconciliationCandidates,
  hasSharedWord,
  meaningfulWords,
  reconciliationPairKey,
  RECONCILIATION_AMOUNT_INCOMPATIBLE_MIN_ABS_CENTS,
  RECONCILIATION_AMOUNT_INCOMPATIBLE_RELATIVE_RATIO,
  RECONCILIATION_CONFIDENCE_HIGH_MIN,
  RECONCILIATION_CONFIDENCE_MEDIUM_MIN,
  RECONCILIATION_DATE_WINDOW_DAYS,
  resolveManagedExpenseCategory,
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
    category: null,
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

// CASO REAL, Fase 3 (2026-09-30) — auditoría del matcher: "E. I. LAS CASITAS" (200 €, Educación, 02/10)
// proponía como candidato "MERCADONA ALMORADI" (65,93 €, Supermercado, 29/09) solo por cuenta + 3 días de
// proximidad. Importe y categoría se tratan como señales SEPARADAS (nunca la misma), y el texto/concepto
// se mantiene neutral cuando no coincide — nunca una prueba de incompatibilidad por sí solo.
describe('Fase 3 — importe/categoría/concepto como señales separadas, exclusión fuerte conservadora', () => {
  const LAS_CASITAS_OCCURRENCE: ForecastOccurrence = {
    forecastPaymentId: 'fp-casitas',
    title: 'E. I. LAS CASITAS 2015 S.L.',
    occurrenceDate: '2026-10-02',
    installmentSequenceIndex: null,
    dueDate: '2026-10-02',
    expectedPaymentDate: '2026-10-02',
    amountStatus: 'known',
    amount: 200,
    currency: 'EUR',
    categoryId: null,
    matchedExpenseId: null,
  }
  const LAS_CASITAS_PAYMENT: ForecastPaymentContextForMatching = { bankAccountId: ACCOUNT_A, title: 'E. I. LAS CASITAS 2015 S.L.', provider: null }
  const MERCADONA_MOVEMENT: BankMovementForMatching = movement({
    bankTransactionId: 'bt-mercadona',
    expenseId: 'exp-mercadona',
    date: '2026-09-29', // 3 días antes de lo previsto — dentro de la ventana
    amount: 65.93,
    description: 'COMPRA TARJ. 5402XXXXXXXX4041 MERCADONA ALMORADI-ALMORADI',
    category: 'Supermercado, carnicería y tiendas de alimentación',
  })

  it('CASO REAL: importe (67% / 134,07 €) Y categoría (Educación ≠ Supermercado) fuertemente incompatibles a la vez → excluido antes de llegar a puntuar', () => {
    const result = scoreReconciliationCandidate(LAS_CASITAS_OCCURRENCE, LAS_CASITAS_PAYMENT, MERCADONA_MOVEMENT, 'Educación')
    expect(result).toBeNull()
  })

  it('144,54 € ↔ 146,20 € (1,15% de diferencia) sigue siendo candidato exactamente igual que antes — muy por debajo de los límites de incompatibilidad fuerte, aunque las categorías también difieran', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ amount: 146.2, category: 'Supermercado, carnicería y tiendas de alimentación' }), 'Impuestos')
    expect(result).not.toBeNull()
    expect(result!.confidence).not.toBe('low')
  })

  it('importe muy distinto (67%/134€) + categoría del movimiento "Otros" (adivinada, no fiable) → NO se excluye por la nueva barrera', () => {
    const result = scoreReconciliationCandidate(
      LAS_CASITAS_OCCURRENCE,
      LAS_CASITAS_PAYMENT,
      movement({ date: '2026-09-29', amount: 65.93, category: 'Otros' }),
      'Educación',
    )
    expect(result).not.toBeNull()
  })

  it('importe muy distinto (67%/134€) + categoría del movimiento ausente (sin clasificar todavía) → NO se excluye por la nueva barrera', () => {
    const result = scoreReconciliationCandidate(LAS_CASITAS_OCCURRENCE, LAS_CASITAS_PAYMENT, movement({ date: '2026-09-29', amount: 65.93, category: null }), 'Educación')
    expect(result).not.toBeNull()
  })

  it('categoría real distinta + importe razonablemente próximo (dentro de tolerancia) → NO se excluye (una categoría distinta nunca basta sola)', () => {
    const result = scoreReconciliationCandidate(
      IBI_OCCURRENCE, // 144,54 €
      PAYMENT_WITH_ACCOUNT,
      movement({ amount: 146.2, category: 'Supermercado, carnicería y tiendas de alimentación' }), // 1,15% de diferencia, categoría distinta
      'Impuestos',
    )
    expect(result).not.toBeNull()
  })

  it('importe MUY distinto por sí solo (categoría neutra en ambos lados) → sigue sin excluir, comportamiento igual que antes de la Fase 3', () => {
    const result = scoreReconciliationCandidate(LAS_CASITAS_OCCURRENCE, LAS_CASITAS_PAYMENT, movement({ date: '2026-09-29', amount: 65.93 }))
    expect(result).not.toBeNull()
  })

  it('concepto sin palabras comunes ("LAS CASITAS" vs "MERCADONA") + importe/categoría compatibles → nunca se excluye por el texto por sí solo', () => {
    const compatibleAmount: ForecastOccurrence = { ...LAS_CASITAS_OCCURRENCE, amount: 65.93 }
    const result = scoreReconciliationCandidate(compatibleAmount, LAS_CASITAS_PAYMENT, MERCADONA_MOVEMENT, 'Supermercado, carnicería y tiendas de alimentación')
    expect(result).not.toBeNull()
    expect(result!.reasons.some((r) => r.code === 'text_match')).toBe(false) // sin coincidencia de texto — neutral, no negativa
  })

  it('categoría real coincidente (movimiento↔previsión) aporta la señal positiva nueva "category_agrees" — nunca si alguno de los dos lados es Otros/sin clasificar', () => {
    const agrees = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ category: 'Impuestos' }), 'Impuestos')!
    const otrosNeverAgrees = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ category: 'Otros' }), 'Otros')!
    expect(agrees.reasons.some((r) => r.code === 'category_agrees')).toBe(true)
    expect(otrosNeverAgrees.reasons.some((r) => r.code === 'category_agrees')).toBe(false)
  })

  it('coincidencia significativa de concepto sigue aportando la señal positiva existente (text_match), sin tocar su lógica', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, { ...PAYMENT_WITH_ACCOUNT, title: 'IBI' }, movement({ description: 'RECIBO IBI AYUNTAMIENTO' }))!
    expect(result.reasons.some((r) => r.code === 'text_match')).toBe(true)
  })

  it('las constantes de incompatibilidad fuerte están documentadas y exportadas — nunca un número mágico sin nombre', () => {
    expect(RECONCILIATION_AMOUNT_INCOMPATIBLE_RELATIVE_RATIO).toBe(0.5)
    expect(RECONCILIATION_AMOUNT_INCOMPATIBLE_MIN_ABS_CENTS).toBe(3000)
  })

  it('SCORE_SAME_ACCOUNT, la ventana temporal y RECONCILIATION_CONFIDENCE_MEDIUM_MIN no se han tocado', () => {
    // Indirecto: el caso "high" de siempre (misma cuenta 30 + importe exacto 40 + misma fecha 30) sigue
    // dando exactamente 100 puntos — si alguna de esas tres constantes cambiara, este número cambiaría con
    // ella.
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement())!
    expect(result.score).toBe(100)
    expect(RECONCILIATION_CONFIDENCE_MEDIUM_MIN).toBe(35)
    expect(RECONCILIATION_DATE_WINDOW_DAYS).toBe(3)
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

// CASO REAL (2026-09-30) — "No es este" debe persistir la pareja exacta, sin bloquear ningún lado por
// separado: el movimiento sigue disponible para OTRA previsión, y la previsión sigue pudiendo recibir OTRO
// movimiento como candidato. La identidad ya era correcta en el cliente (candidateKey combinaba ambos
// lados) — solo faltaba persistencia; aquí se prueba el filtro puro del motor una vez persistido.
describe('findReconciliationCandidates — dismissedPairKeys ("No es este" persistido)', () => {
  function candidateInput(occurrence: ForecastOccurrence, payment: ForecastPaymentContextForMatching = PAYMENT_WITH_ACCOUNT): OccurrenceForMatching {
    return { occurrence, payment }
  }

  it('sin dismissedPairKeys (parámetro omitido) el comportamiento es idéntico a antes — compatibilidad total', () => {
    const withoutArg = findReconciliationCandidates([candidateInput(IBI_OCCURRENCE)], [movement()], new Set())
    const withEmptySet = findReconciliationCandidates([candidateInput(IBI_OCCURRENCE)], [movement()], new Set(), new Set())
    expect(withEmptySet).toEqual(withoutArg)
    expect(withoutArg).toHaveLength(1)
  })

  it('una pareja descartada no vuelve a proponerse, aunque siga siendo la de mayor puntuación bruta', () => {
    const dismissedKey = reconciliationPairKey(IBI_OCCURRENCE, movement())
    const results = findReconciliationCandidates([candidateInput(IBI_OCCURRENCE)], [movement()], new Set(), new Set([dismissedKey]))
    expect(results).toHaveLength(0)
  })

  it('la previsión SIGUE recibiendo otro movimiento como candidato — descartar una pareja no descarta la ocurrencia entera, busca el siguiente mejor', () => {
    const goodButDismissed = movement({ bankTransactionId: 'bt-dismissed', expenseId: 'exp-dismissed', date: '2026-11-05', amount: 144.54 })
    const otherRealMovement = movement({ bankTransactionId: 'bt-other', expenseId: 'exp-other', date: '2026-11-06', amount: 144.54 })
    const dismissedKey = reconciliationPairKey(IBI_OCCURRENCE, goodButDismissed)
    const results = findReconciliationCandidates([candidateInput(IBI_OCCURRENCE)], [goodButDismissed, otherRealMovement], new Set(), new Set([dismissedKey]))
    expect(results).toHaveLength(1)
    expect(results[0].movement.bankTransactionId).toBe('bt-other')
  })

  it('el movimiento descartado para UNA previsión SIGUE disponible como candidato de OTRA previsión distinta', () => {
    const sharedMovement = movement({ bankTransactionId: 'bt-shared', expenseId: 'exp-shared' })
    const otherOccurrence: ForecastOccurrence = { ...IBI_OCCURRENCE, forecastPaymentId: 'fp-otro-pago' }
    const dismissedKey = reconciliationPairKey(IBI_OCCURRENCE, sharedMovement)
    const results = findReconciliationCandidates(
      [candidateInput(IBI_OCCURRENCE), candidateInput(otherOccurrence)],
      [sharedMovement],
      new Set(),
      new Set([dismissedKey]),
    )
    expect(results).toHaveLength(1)
    expect(results[0].occurrence.forecastPaymentId).toBe('fp-otro-pago')
  })

  it('reconciliationPairKey identifica la pareja COMPLETA (previsión + fecha + cuota + movimiento) — nunca solo un lado', () => {
    const keyA = reconciliationPairKey(IBI_OCCURRENCE, movement({ bankTransactionId: 'bt-1' }))
    const keyB = reconciliationPairKey(IBI_OCCURRENCE, movement({ bankTransactionId: 'bt-2' }))
    const keyC = reconciliationPairKey({ ...IBI_OCCURRENCE, forecastPaymentId: 'fp-otro' }, movement({ bankTransactionId: 'bt-1' }))
    expect(keyA).not.toBe(keyB) // mismo lado previsión, distinto movimiento → clave distinta
    expect(keyA).not.toBe(keyC) // mismo movimiento, distinta previsión → clave distinta
  })
})

describe('6/7) estado — skipped / previsión inactiva / cuota fuera de ciclo nunca llegan como candidatas (garantía estructural de expandForecastOccurrences)', () => {
  const basePayment: ForecastPayment = {
    id: 'fp-ibi', familyId: 'f1', title: 'IBI y Residuos', categoryId: null, provider: null, notes: null,
    amountStatus: 'known', amount: 144.54, amountEstimatedBasis: null, currency: 'EUR',
    dueDate: '2026-11-05', expectedPaymentDate: null,
    recurrenceRule: 'FREQ=MONTHLY;UNTIL=2027-04-05', // plan finito de 6 cuotas
    bankAccountId: ACCOUNT_A, ownerMemberId: null, showInCalendar: true, calendarEventId: null, active: true,
    sourceStoragePath: null,
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
      sourceStoragePath: null,
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

describe('resolveManagedExpenseCategory — Fase 1D-f: precedencia sin inventar un campo manual/automático que no existe', () => {
  it('1) CASO REAL: categoría automática "Otros" → se propone "Suministros" (la de la previsión), marcando el conflicto', () => {
    const r = resolveManagedExpenseCategory('Otros', 'Suministros')
    expect(r).toEqual({ preselected: 'Suministros', hasConflict: true, currentCategory: 'Otros' })
  })

  it('2) una categoría manual existente NUNCA se pisa automáticamente: cuando hay conflicto, currentCategory siempre viaja para poder "Mantenerla" — nada se aplica sin que la pantalla lo muestre', () => {
    const r = resolveManagedExpenseCategory('Vivienda', 'Suministros')
    expect(r.hasConflict).toBe(true)
    expect(r.currentCategory).toBe('Vivienda') // la pantalla puede ofrecer "Mantener Vivienda" con este valor
    // preselected es solo el PUNTO DE PARTIDA de un <select> editable — nunca se guarda solo, hace falta
    // pulsar "Guardar y finalizar" para que se escriba de verdad (eso lo hace el componente, no esta función).
  })

  it('3) "mantener categoría manual": el valor para hacerlo está siempre disponible en currentCategory cuando hay conflicto', () => {
    const r = resolveManagedExpenseCategory('Vivienda', 'Suministros')
    expect(r.currentCategory).not.toBeNull()
  })

  it('4) elegir la categoría de la previsión: es el preselected por defecto en caso de conflicto — un único paso (aceptar la propuesta)', () => {
    const r = resolveManagedExpenseCategory('Otros', 'Suministros')
    expect(r.preselected).toBe('Suministros')
  })

  it('sin conflicto cuando ya coinciden — no hay nada que resolver', () => {
    const r = resolveManagedExpenseCategory('Suministros', 'Suministros')
    expect(r).toEqual({ preselected: 'Suministros', hasConflict: false, currentCategory: 'Suministros' })
  })

  it('expense todavía "Pendiente de clasificar" (category null): se propone la de la previsión sin marcar conflicto — no hay nada manual que proteger', () => {
    const r = resolveManagedExpenseCategory(null, 'Suministros')
    expect(r).toEqual({ preselected: 'Suministros', hasConflict: false, currentCategory: null })
  })

  it('la previsión no tiene categoría asignada: se respeta lo que ya tuviera el expense tal cual, sin proponer nada', () => {
    const r = resolveManagedExpenseCategory('Vivienda', null)
    expect(r).toEqual({ preselected: 'Vivienda', hasConflict: false, currentCategory: 'Vivienda' })
  })
})

describe('CASO REAL OBLIGATORIO — Endesa factura de luz (certificación móvil real)', () => {
  const ENDESA_ACCOUNT = 'account-comun-7637'
  const ENDESA_OCCURRENCE: ForecastOccurrence = {
    forecastPaymentId: 'fp-endesa',
    title: 'Endesa factura de luz',
    occurrenceDate: '2026-09-23',
    installmentSequenceIndex: null,
    dueDate: '2026-09-23',
    expectedPaymentDate: '2026-09-23',
    amountStatus: 'known',
    amount: 261.08,
    currency: 'EUR',
    categoryId: 'cat-suministros',
    matchedExpenseId: null,
  }
  const ENDESA_PAYMENT: ForecastPaymentContextForMatching = { bankAccountId: ENDESA_ACCOUNT, title: 'Endesa factura de luz', provider: null }
  const ENDESA_MOVEMENT: BankMovementForMatching = {
    bankTransactionId: 'bt-endesa',
    expenseId: 'expense-endesa',
    accountId: ENDESA_ACCOUNT,
    date: '2026-09-23',
    amount: 261.08,
    currency: 'EUR',
    description: 'ENDESA ENERGIA S.A.',
    isIncome: false,
    category: null,
  }

  it('1. PEPA detecta el candidato con confianza alta: misma cuenta + mismo importe + mismo día', () => {
    const result = scoreReconciliationCandidate(ENDESA_OCCURRENCE, ENDESA_PAYMENT, ENDESA_MOVEMENT)
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe('high')
    expect(result!.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['same_account', 'amount_exact', 'date_exact']))
  })

  it('2. tras confirmar (matchedExpenseId puesto), la ocurrencia deja de sumar como pendiente: 0 € para esa ocurrencia', () => {
    const reconciled: ForecastOccurrence = { ...ENDESA_OCCURRENCE, matchedExpenseId: 'expense-endesa' }
    expect(forecastTotals([reconciled])).toEqual([])
  })

  it('3. Gestionar movimiento: categoría automática "Otros" del banco → PEPA propone "Suministros" (la de la previsión), sin pisarla sola', () => {
    const resolution = resolveManagedExpenseCategory('Otros', 'Suministros')
    expect(resolution.preselected).toBe('Suministros')
    expect(resolution.hasConflict).toBe(true) // la pantalla debe mostrar que "Otros" era lo que había
  })

  it('4. si se desconcilia, la ocurrencia vuelve a sumar 261,08 € de pendiente, sin inventar ni perder el importe', () => {
    const pending: ForecastOccurrence = { ...ENDESA_OCCURRENCE, matchedExpenseId: null } // exactamente lo que hace unmatchForecastOccurrence
    expect(forecastTotals([pending])).toEqual([{ currency: 'EUR', knownTotal: 261.08, estimatedTotal: 0, unknownCount: 0, knownPlusEstimatedTotal: 261.08 }])
  })

  // "Desconciliar nunca revierte categoría/etiqueta" se verifica al nivel correcto (el código real que
  // hace el UPDATE) en src/data/forecastReconciliationMigration.test.ts — unmatchForecastOccurrence solo
  // toca forecast_occurrences.matched_expense_id, nunca la tabla expenses: ambas quedan independientes
  // por diseño, así que no hay nada que "revertir" — la categoría/etiqueta simplemente nunca se tocan.
})

describe('Fase 1D-g.4 — hasSharedWord: identidad del comercio, nunca del medio de pago (auditoría real Netflix vs Anthropic)', () => {
  const NETFLIX_REAL = 'COMPRA TARJ. 5402XXXXXXXX4041 NETFLIX.COM-Madrid'
  const ANTHROPIC_REAL = 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN'

  it('CASO REAL: Netflix y Anthropic ya NO se consideran relacionados — antes compartían "COMPRA"/"TARJ"/la tarjeta enmascarada, ninguno identifica al comercio', () => {
    expect(hasSharedWord(NETFLIX_REAL, ANTHROPIC_REAL)).toBe(false)
  })

  it('"compra" y "tarj" dejan de ser palabras significativas — boilerplate bancario genérico, demostrado con el caso real', () => {
    const words = meaningfulWords(NETFLIX_REAL)
    expect(words.has('compra')).toBe(false)
    expect(words.has('tarj')).toBe(false)
  })

  it('la referencia de tarjeta enmascarada (dígitos + "x" mezclados) nunca es significativa, detectado de forma ESTRUCTURAL, no por su valor exacto', () => {
    expect(meaningfulWords(NETFLIX_REAL).has('5402xxxxxxxx4041')).toBe(false)
    // Un formato de enmascarado DISTINTO (más x, menos dígitos) también se excluye — nunca una lista de
    // números concretos.
    expect(meaningfulWords('COMPRA 99XXXXXXXXXXXX01 ALGO').has('99xxxxxxxxxxxx01')).toBe(false)
  })

  it('REGRESIÓN: un identificador real de préstamo/contrato (solo dígitos, sin "x") SIGUE siendo significativo — "8078183410" no se ve afectado', () => {
    expect(meaningfulWords('PRESTAMOS ADEUDO CUOTA N.8078183410').has('8078183410')).toBe(true)
    expect(hasSharedWord('PRESTAMOS ADEUDO CUOTA N.8078183410', 'Hipoteca Casa N.8078183410')).toBe(true)
  })

  it('una palabra con letras reales además de dígitos/"x" no se confunde con una tarjeta enmascarada (p. ej. "xbox360" sigue siendo una palabra real)', () => {
    expect(meaningfulWords('COMPRA XBOX360 TIENDA').has('xbox360')).toBe(true)
  })

  it('la lista de boilerplate es mínima — no excluye palabras reales de comercios (Netflix, Orange, Endesa siguen siendo significativas)', () => {
    expect(meaningfulWords(NETFLIX_REAL).has('netflix')).toBe(true)
    expect(meaningfulWords('ORANGE ESPAGNE SAU').has('orange')).toBe(true)
    expect(meaningfulWords('ENDESA ENERGIA S.A.').has('endesa')).toBe(true)
  })
})
