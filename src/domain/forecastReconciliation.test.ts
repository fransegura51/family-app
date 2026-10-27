import { describe, expect, it } from 'vitest'
import { expandForecastOccurrences, forecastTotals, type ForecastOccurrence, type ForecastOccurrenceOverride, type ForecastPayment } from './forecast'
import {
  findReconciliationCandidates,
  hasSharedWord,
  meaningfulWords,
  reconciliationPairKey,
  RECONCILIATION_CONFIDENCE_HIGH_MIN,
  RECONCILIATION_DATE_WINDOW_DAYS,
  RECONCILIATION_ESTIMATED_TOLERANCE_RATIO,
  RECONCILIATION_KNOWN_TOLERANCE_MAX_ABS_CENTS,
  RECONCILIATION_KNOWN_TOLERANCE_RATIO,
  assessManualPairing,
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
// ECO-02: el pago nombra al emisor (proveedor «SUMA Gestión Tributaria»); la conciliación exige identidad comercial.
const PAYMENT_WITH_ACCOUNT: ForecastPaymentContextForMatching = { bankAccountId: ACCOUNT_A, title: 'IBI y Residuos', provider: 'SUMA Gestión Tributaria' }
const PAYMENT_NO_ACCOUNT: ForecastPaymentContextForMatching = { bankAccountId: null, title: 'IBI y Residuos', provider: 'SUMA Gestión Tributaria' }

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

  it('un importe MUY distinto (fuera de tolerancia) descarta el candidato: la cuenta y la fecha no compensan el dinero (ECO-02)', () => {
    expect(scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ amount: 9999 }))).toBeNull()
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
    expect(result).not.toBeNull() // identidad sólida + cuenta + fecha
    expect(result!.reasons.some((r) => r.code === 'amount_exact' || r.code === 'amount_close')).toBe(false)
  })

  it('19) estimated conserva su propia naturaleza: un importe estimado cercano sigue sumando puntos de importe, a diferencia de unknown', () => {
    const estimatedOccurrence: ForecastOccurrence = { ...IBI_OCCURRENCE, amountStatus: 'estimated', amount: 120 }
    const result = scoreReconciliationCandidate(estimatedOccurrence, PAYMENT_WITH_ACCOUNT, movement({ amount: 144.54 }))
    expect(result).not.toBeNull()
    expect(result!.reasons.some((r) => r.code === 'amount_variable')).toBe(true)
  })

  it('confianza: el umbral está documentado y exportado, nunca un número mágico sin nombre en la UI', () => {
    expect(RECONCILIATION_CONFIDENCE_HIGH_MIN).toBeGreaterThan(0)
  })

  it('cada candidato explica POR QUÉ (reasons no vacío cuando hay algún punto), nunca solo un número', () => {
    const result = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement())!
    expect(result.reasons.length).toBeGreaterThan(0)
    for (const r of result.reasons) expect(r.label.length).toBeGreaterThan(0)
  })

  it('identidad: sin coincidencia de comercio no hay candidato (antes el texto solo sumaba puntos opcionales)', () => {
    const withIdentity = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ description: 'SUMA GESTION TRIBUTARIA' }))
    const otherMerchant = scoreReconciliationCandidate(IBI_OCCURRENCE, PAYMENT_WITH_ACCOUNT, movement({ description: 'MERCADONA ALMORADI' }))
    expect(withIdentity).not.toBeNull()
    expect(otherMerchant).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ECO-02 (2026-10-27) — sugerencias de conciliación FIABLES: elegibilidad (identidad + importe) antes que ordenación.
// Casos reales de producción: ENDESA ↔ ASADOR SESE / AMAZON, GOOGLE FLOW ↔ CONSUM, Aire acondicionado SEQURA ↔ Eric Segura Hepburn.
// Regla: es preferible no mostrar ninguna sugerencia a proponer una coincidencia falsa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('ECO-02 — casos que NUNCA deben proponerse', () => {
  function occ(id: string, title: string, amount: number | null, date = '2026-10-21', status: ForecastOccurrence['amountStatus'] = 'known'): ForecastOccurrence {
    return {
      forecastPaymentId: id,
      title,
      occurrenceDate: date,
      installmentSequenceIndex: null,
      dueDate: date,
      expectedPaymentDate: date,
      amountStatus: status,
      amount,
      currency: 'EUR',
      categoryId: null,
      matchedExpenseId: null,
    }
  }
  const pay = (title: string, provider: string | null = null): ForecastPaymentContextForMatching => ({ bankAccountId: ACCOUNT_A, title, provider })
  const mv = (id: string, description: string, amount: number, date = '2026-10-21'): BankMovementForMatching =>
    movement({ bankTransactionId: id, expenseId: `exp-${id}`, description, amount, date, category: null })

  it('ENDESA 195,33 € ↔ ASADOR SESE-RAFAL 20,50 € (misma cuenta, mismo día)', () => {
    expect(scoreReconciliationCandidate(occ('fp-endesa', 'ENDESA ENERGIA S.A.', 195.33), pay('ENDESA ENERGIA S.A.'), mv('b1', 'ASADOR SESE-RAFAL', 20.5))).toBeNull()
  })

  it('ENDESA 195,33 € ↔ WWW.AMAZON-LUXEMBOURG 22,80 €', () => {
    expect(scoreReconciliationCandidate(occ('fp-endesa', 'ENDESA ENERGIA S.A.', 195.33), pay('ENDESA ENERGIA S.A.'), mv('b2', 'WWW.AMAZON-LUXEMBOURG', 22.8, '2026-10-24'))).toBeNull()
  })

  it('FLOW GOOGLE 21,99 € ↔ SUPERMERCADO CONSUM RAFAL 12,48 €', () => {
    expect(scoreReconciliationCandidate(occ('fp-flow', 'FLOW GOOGLE', 21.99), pay('FLOW GOOGLE'), mv('b3', 'SUPERMERCADO CONSUM RAFAL', 12.48, '2026-10-22'))).toBeNull()
  })

  it('Aire acondicionado SEQURA 74,65 € ↔ Eric Segura Hepburn 100,00 €', () => {
    expect(scoreReconciliationCandidate(occ('fp-sequra', 'Aire acondicionado SEQURA', 74.65), pay('Aire acondicionado SEQURA'), mv('b4', 'Eric Segura Hepburn', 100))).toBeNull()
  })

  it('misma cuenta y fecha cercana pero comercio distinto: se descarta aunque el importe coincida al céntimo', () => {
    expect(scoreReconciliationCandidate(occ('fp-endesa', 'ENDESA ENERGIA S.A.', 195.33), pay('ENDESA ENERGIA S.A.'), mv('b5', 'WWW.AMAZON-LUXEMBOURG', 195.33))).toBeNull()
  })

  it('comercio distinto e importe incompatible: se descarta', () => {
    expect(scoreReconciliationCandidate(occ('fp-endesa', 'ENDESA ENERGIA S.A.', 195.33), pay('ENDESA ENERGIA S.A.'), mv('b6', 'MERCADONA ALMORADI', 12))).toBeNull()
  })

  it('compartir solo la marca Google no hace que dos servicios de Google sean el mismo pago', () => {
    expect(scoreReconciliationCandidate(occ('fp-flow', 'FLOW GOOGLE', 21.99), pay('FLOW GOOGLE'), mv('b7', 'GOOGLE YOUTUBE PREMIUM', 21.99))).toBeNull()
  })

  it('«No es este» sobre el candidato bueno NO hace aparecer otro incompatible: ninguna sugerencia', () => {
    const endesa = occ('fp-endesa', 'ENDESA ENERGIA S.A.', 195.33)
    const good = mv('b-ok', 'ENDESA ENERGIA S.A.', 195.33)
    const asador = mv('b-asador', 'ASADOR SESE-RAFAL', 20.5)
    const amazon = mv('b-amazon', 'WWW.AMAZON-LUXEMBOURG', 22.8, '2026-10-24')
    const input: OccurrenceForMatching = { occurrence: endesa, payment: pay('ENDESA ENERGIA S.A.') }
    const before = findReconciliationCandidates([input], [asador, amazon, good], new Set())
    expect(before.map((c) => c.movement.bankTransactionId)).toEqual(['b-ok']) // solo el bueno, nunca los otros
    const after = findReconciliationCandidates([input], [asador, amazon, good], new Set(), new Set([reconciliationPairKey(endesa, good)]))
    expect(after).toHaveLength(0)
  })

  it('con solo candidatos incompatibles no sale ninguna sugerencia (aunque haya varios cargos cercanos en la misma cuenta)', () => {
    const endesa = occ('fp-endesa', 'ENDESA ENERGIA S.A.', 195.33)
    const result = findReconciliationCandidates(
      [{ occurrence: endesa, payment: pay('ENDESA ENERGIA S.A.') }],
      [mv('x1', 'ASADOR SESE-RAFAL', 20.5), mv('x2', 'WWW.AMAZON-LUXEMBOURG', 22.8, '2026-10-24'), mv('x3', 'SUPERMERCADO CONSUM RAFAL', 12.48, '2026-10-20')],
      new Set(),
    )
    expect(result).toEqual([])
  })

  it('una referencia de contrato distinta o un título solo genérico no basta (identidad desconocida → no se propone)', () => {
    expect(scoreReconciliationCandidate(occ('fp-luz', 'Luz', 195.33), pay('Luz'), mv('b8', 'ENDESA ENERGIA S.A.', 195.33))).toBeNull()
  })

  it('sin concepto del banco no se puede comprobar el comercio → no se propone', () => {
    expect(scoreReconciliationCandidate(occ('fp-endesa', 'ENDESA ENERGIA S.A.', 195.33), pay('ENDESA ENERGIA S.A.'), mv('b9', '', 195.33))).toBeNull()
    expect(scoreReconciliationCandidate(occ('fp-endesa', 'ENDESA ENERGIA S.A.', 195.33), pay('ENDESA ENERGIA S.A.'), movement({ description: null }))).toBeNull()
  })
})

describe('ECO-02 — casos que SÍ pueden proponerse', () => {
  function occ(title: string, amount: number | null, status: ForecastOccurrence['amountStatus'] = 'known', date = '2026-10-21'): ForecastOccurrence {
    return {
      forecastPaymentId: `fp-${title}`,
      title,
      occurrenceDate: date,
      installmentSequenceIndex: null,
      dueDate: date,
      expectedPaymentDate: date,
      amountStatus: status,
      amount,
      currency: 'EUR',
      categoryId: null,
      matchedExpenseId: null,
    }
  }
  const pay = (title: string, bankAccountId: string | null = ACCOUNT_A, provider: string | null = null): ForecastPaymentContextForMatching => ({ bankAccountId, title, provider })
  const mv = (description: string, amount: number, date = '2026-10-21', accountId = ACCOUNT_A): BankMovementForMatching => movement({ description, amount, date, accountId, category: null })
  const codes = (r: ReturnType<typeof scoreReconciliationCandidate>) => r?.reasons.map((x) => x.code) ?? []

  it('mismo beneficiario, importe exacto y fecha cercana: sugerencia fuerte con motivos comprensibles', () => {
    const r = scoreReconciliationCandidate(occ('Endesa factura de luz', 195.33), pay('Endesa factura de luz'), mv('ENDESA ENERGIA S.A.', 195.33, '2026-10-22'))
    expect(r).not.toBeNull()
    expect(r!.confidence).toBe('high')
    expect(r!.reasons.map((x) => x.label)).toEqual(expect.arrayContaining(['mismo comercio', 'mismo importe', 'cargo 1 día después de lo previsto']))
  })

  it('variantes del nombre de la misma empresa (ENDESA ENERGÍA ↔ ENDESA ENERGIA S.A., Orange ↔ ORANGE ESPAGNE SAU, Netflix ↔ NETFLIX.COM-Madrid)', () => {
    expect(scoreReconciliationCandidate(occ('ENDESA ENERGÍA', 195.33), pay('ENDESA ENERGÍA'), mv('ENDESA ENERGIA S.A.', 195.33))).not.toBeNull()
    expect(scoreReconciliationCandidate(occ('Orange', 39.9), pay('Orange'), mv('ORANGE ESPAGNE SAU', 39.9))).not.toBeNull()
    expect(scoreReconciliationCandidate(occ('Netflix', 13.99), pay('Netflix'), mv('COMPRA TARJ. 5402XXXXXXXX4041 NETFLIX.COM-Madrid', 13.99))).not.toBeNull()
  })

  it('SEQURA-BARCELONA ↔ Aire acondicionado SEQURA con el mismo importe', () => {
    const r = scoreReconciliationCandidate(occ('Aire acondicionado SEQURA', 74.65), pay('Aire acondicionado SEQURA'), mv('SEQURA-BARCELONA', 74.65))
    expect(r).not.toBeNull()
    expect(codes(r)).toContain('merchant_match')
  })

  it('FLOW GOOGLE ↔ GOOGLE *FLOW: comparten la marca Y otra palabra distintiva del servicio', () => {
    expect(scoreReconciliationCandidate(occ('FLOW GOOGLE', 21.99), pay('FLOW GOOGLE'), mv('GOOGLE *FLOW', 21.99))).not.toBeNull()
  })

  it('pago de importe variable (estimado) con beneficiario claramente identificado: la diferencia de importe es admisible', () => {
    const estimated = occ('Endesa factura de luz', 150, 'estimated')
    const r = scoreReconciliationCandidate(estimated, pay('Endesa factura de luz'), mv('ENDESA ENERGIA S.A.', 195.33)) // +30%
    expect(r).not.toBeNull()
    expect(codes(r)).toContain('amount_variable')
    expect(r!.reasons.find((x) => x.code === 'amount_variable')!.label).toContain('importe variable')
  })

  it('…pero un estimado no admite cualquier importe: pasado el margen se descarta aunque la identidad coincida', () => {
    expect(scoreReconciliationCandidate(occ('Endesa factura de luz', 100, 'estimated'), pay('Endesa factura de luz'), mv('ENDESA ENERGIA S.A.', 195.33))).toBeNull() // +95%
    expect(RECONCILIATION_ESTIMATED_TOLERANCE_RATIO).toBe(0.5)
  })

  it('pago de importe conocido: diferencia pequeña admisible (5 % y 10 €), mayor no', () => {
    expect(scoreReconciliationCandidate(occ('ANTHROPIC* CLAUDE SUB-DUBLIN', 104.52), pay('ANTHROPIC* CLAUDE SUB-DUBLIN'), mv('ANTHROPIC* CLAUDE SUB-DUBLIN 4', 108.9))).not.toBeNull() // caso real: 4,2 %
    expect(scoreReconciliationCandidate(occ('Netflix', 100), pay('Netflix'), mv('NETFLIX.COM', 106))).toBeNull() // 6 %
    expect(scoreReconciliationCandidate(occ('Netflix', 1000), pay('Netflix'), mv('NETFLIX.COM', 1025))).toBeNull() // 2,5 % pero 25 € > 10 €
    expect(RECONCILIATION_KNOWN_TOLERANCE_RATIO).toBe(0.05)
    expect(RECONCILIATION_KNOWN_TOLERANCE_MAX_ABS_CENTS).toBe(1000)
  })

  it('cargo adelantado o retrasado dentro de la ventana de ±3 días; fuera, no', () => {
    expect(scoreReconciliationCandidate(occ('Netflix', 13.99), pay('Netflix'), mv('NETFLIX.COM', 13.99, '2026-10-18'))).not.toBeNull()
    expect(scoreReconciliationCandidate(occ('Netflix', 13.99), pay('Netflix'), mv('NETFLIX.COM', 13.99, '2026-10-24'))).not.toBeNull()
    expect(scoreReconciliationCandidate(occ('Netflix', 13.99), pay('Netflix'), mv('NETFLIX.COM', 13.99, '2026-10-25'))).toBeNull()
  })

  it('importe desconocido: exige identidad sólida Y la cuenta prevista; la proximidad de fechas no sustituye a la identidad', () => {
    const unknown = occ('Endesa factura de luz', null, 'unknown')
    expect(scoreReconciliationCandidate(unknown, pay('Endesa factura de luz'), mv('ENDESA ENERGIA S.A.', 180))).not.toBeNull()
    expect(scoreReconciliationCandidate(unknown, pay('Endesa factura de luz', null), mv('ENDESA ENERGIA S.A.', 180))).toBeNull() // sin cuenta prevista
    expect(scoreReconciliationCandidate(unknown, pay('Endesa factura de luz'), mv('WWW.AMAZON-LUXEMBOURG', 180))).toBeNull()
    expect(scoreReconciliationCandidate(occ('Yoigo', null, 'unknown'), pay('Yoigo'), mv('YOIGO', 25))).toBeNull() // identidad de una sola palabra corta: no es sólida
  })

  it('referencia de contrato común: coincidencia fiable aunque el nombre del banco no se parezca', () => {
    const r = scoreReconciliationCandidate(occ('Hipoteca Casa N.8078183410', 612.4), pay('Hipoteca Casa N.8078183410'), mv('PRESTAMOS ADEUDO CUOTA N.8078183410 30/06/26', 612.4, '2026-10-22'))
    expect(r).not.toBeNull()
    expect(codes(r)).toContain('merchant_reference')
  })

  it('el motivo de la sugerencia no incluye porcentajes ni puntuaciones inventadas', () => {
    const r = scoreReconciliationCandidate(occ('Endesa factura de luz', 195.33), pay('Endesa factura de luz'), mv('ENDESA ENERGIA S.A.', 195.33))!
    for (const reason of r.reasons) expect(reason.label).not.toMatch(/%|puntos|confianza/i)
  })
})

describe('ECO-02 — asociación manual: avisos antes de confirmar (nunca impide)', () => {
  const occurrence: ForecastOccurrence = { ...IBI_OCCURRENCE, title: 'ENDESA ENERGIA S.A.', amount: 195.33 }
  const payment: ForecastPaymentContextForMatching = { bankAccountId: ACCOUNT_A, title: 'ENDESA ENERGIA S.A.', provider: null }

  it('sin avisos cuando todo es coherente', () => {
    expect(assessManualPairing(occurrence, payment, movement({ description: 'ENDESA ENERGIA S.A.', amount: 195.33, date: '2026-11-05' }))).toEqual([])
  })

  it('avisa del nombre distinto, del importe muy distinto, de la otra cuenta y de la fecha lejana', () => {
    const warnings = assessManualPairing(occurrence, payment, movement({ description: 'ASADOR SESE-RAFAL', amount: 20.5, date: '2026-11-20', accountId: ACCOUNT_B }))
    expect(warnings.join(' ')).toContain('no se parece')
    expect(warnings.join(' ')).toContain('muy distinto')
    expect(warnings.join(' ')).toContain('cuenta distinta')
    expect(warnings.join(' ')).toContain('fecha está lejos')
  })

  it('un importe estimado dentro del margen no genera aviso de importe', () => {
    const estimated: ForecastOccurrence = { ...occurrence, amountStatus: 'estimated', amount: 150 }
    expect(assessManualPairing(estimated, payment, movement({ description: 'ENDESA ENERGIA S.A.', amount: 195.33, date: '2026-11-05' }))).toEqual([])
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
    const result = scoreReconciliationCandidate(occurrence, { bankAccountId: seguro.bankAccountId, title: seguro.title, provider: 'Mapfre' }, movement({ date: '2027-06-08', amount: 450, description: 'MAPFRE FAMILIAR' }))
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

// ECO-02 — REGRESIÓN con las conciliaciones REALES ya confirmadas en producción (consulta de solo lectura, 27/10/2026): las reglas nuevas, más estrictas,
// siguen proponiendo cada una de ellas (nada legítimo se pierde). Datos: título del pago previsto, concepto del banco, importes y fechas reales.
describe('ECO-02 — las conciliaciones reales confirmadas siguen siendo elegibles', () => {
  const REAL: Array<[title: string, concept: string, expected: number, charged: number, occurrenceDate: string, chargeDate: string]> = [
    ['ORANGE ESPAGNE SAU', 'ORANGE ESPAGNE SAU', 73.48, 73.48, '2026-10-23', '2026-10-23'],
    ['ENDESA ENERGIA S.A.', 'ENDESA ENERGIA S.A.', 195.33, 195.33, '2026-10-23', '2026-10-26'],
    ['NETFLIX.COM-Madrid', 'Netflix.com-Los Gatos', 14.99, 14.99, '2026-10-16', '2026-10-16'],
    ['Aire acondicionado SEQURA-BARCELONA', 'SeQura-BARCELONA', 74.66, 74.65, '2026-10-15', '2026-10-15'],
    ['FLOW GOOGLE*GOOGLE ONE-DUBLIN', 'GOOGLE*GOOGLE ONE-DUBLIN', 21.99, 21.99, '2026-10-14', '2026-10-13'],
    ['APPLE.COM/BILL-CORK ChatGPT', 'APPLE.COM/BILL-CORK', 22.99, 22.99, '2026-10-10', '2026-10-13'],
    ['ANTHROPIC* CLAUDE SUB-DUBLIN', 'ANTHROPIC* CLAUDE SUB-DUBLIN 4', 104.52, 108.9, '2026-10-09', '2026-10-09'],
    ['Préstamo Hyundai BANCO BILBAO VIZCAYA ARGENTARIA S.A.', 'BANCO BILBAO VIZCAYA ARGENTARIA S.A.', 319.63, 319.63, '2026-10-08', '2026-10-06'],
    ['SUPABASE-SINGAPORE', 'SUPABASE-SINGAPORE', 22.33, 22.33, '2026-10-07', '2026-10-07'],
    ['E. I. LAS CASITAS 2015 S.L.', 'E. I. LAS CASITAS 2015 S.L.', 200, 200, '2026-10-02', '2026-10-02'],
    ['Hipoteca Casa N.8078183410', 'PRESTAMOS ADEUDO CUOTA N.8078183410 30/09/26', 450.5, 450.5, '2026-09-30', '2026-09-30'],
    ['PRESTAMO Moto N.8077731039', 'PRESTAMOS ADEUDO CUOTA N.8077731039 30/09/26', 141.37, 141.37, '2026-09-30', '2026-09-30'],
    ['Endesa factura de luz', 'ENDESA ENERGIA S.A.', 261.08, 261.08, '2026-09-23', '2026-09-23'],
  ]

  it.each(REAL)('%s ↔ %s', (title, concept, expected, charged, occurrenceDate, chargeDate) => {
    const occurrence: ForecastOccurrence = {
      forecastPaymentId: 'fp-real',
      title,
      occurrenceDate,
      installmentSequenceIndex: null,
      dueDate: occurrenceDate,
      expectedPaymentDate: occurrenceDate,
      amountStatus: 'known',
      amount: expected,
      currency: 'EUR',
      categoryId: null,
      matchedExpenseId: null,
    }
    const result = scoreReconciliationCandidate(occurrence, { bankAccountId: ACCOUNT_A, title, provider: null }, movement({ description: concept, amount: charged, date: chargeDate }))
    expect(result).not.toBeNull()
  })

  it('y entre sí NO se mezclan: ninguno de esos pagos es candidato de un cargo de otro comercio del mismo mes', () => {
    const asOccurrence = (title: string, amount: number, date: string): ForecastOccurrence => ({
      forecastPaymentId: `fp-${title}`, title, occurrenceDate: date, installmentSequenceIndex: null, dueDate: date, expectedPaymentDate: date, amountStatus: 'known', amount, currency: 'EUR', categoryId: null, matchedExpenseId: null,
    })
    let accepted = 0
    for (const [titleA, , amountA, , dateA] of REAL) {
      for (const [, conceptB, , chargedB, , chargeDateB] of REAL) {
        const r = scoreReconciliationCandidate(asOccurrence(titleA, amountA, dateA), { bankAccountId: ACCOUNT_A, title: titleA, provider: null }, movement({ description: conceptB, amount: chargedB, date: chargeDateB }))
        if (r) accepted++
      }
    }
    // Solo pueden aceptarse las parejas propias (13) y los pagos distintos del mismo comercio con importe y fecha compatibles (Endesa ↔ Endesa, Orange…), nunca un cruce entre comercios.
    expect(accepted).toBeLessThanOrEqual(REAL.length + 4)
  })
})
