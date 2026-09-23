import { describe, expect, it } from 'vitest'
import {
  detectRecurrenceCandidates,
  findNewRecurrenceCandidates,
  isRecurrenceCandidateAlreadyKnown,
  nextFutureDueDate,
  normalizeMerchantKey,
  stripTrailingDateSuffix,
  RECURRENCE_MIN_OCCURRENCES,
  RECURRENCE_PERIODICITIES,
  type BankMovementForDetection,
  type ForecastPaymentForDedup,
  type RecurrenceCandidate,
} from './forecastRecurrenceDetection'

const ACCOUNT_A = 'account-aaaa'
const ACCOUNT_B = 'account-bbbb'
// referenceDate para todos los tests que NO son sobre "próximo cargo estimado" (Fase 1D-g.1) — muy
// anterior a cualquier fecha real usada como fixture, así nextDueDate nunca necesita avanzar de ciclo y
// el comportamiento/las aserciones de antes de 1D-g.1 quedan exactamente igual.
const OLD_REFERENCE_DATE = '2020-01-01'

function movement(overrides: Partial<BankMovementForDetection> & Pick<BankMovementForDetection, 'date' | 'amount'>): BankMovementForDetection {
  return {
    bankTransactionId: `bt-${overrides.date}-${Math.random()}`,
    expenseId: null,
    accountId: ACCOUNT_A,
    currency: 'EUR',
    description: 'MERCHANT',
    isIncome: false,
    category: null,
    ...overrides,
  }
}

describe('CASOS REALES (auditoría de datos reales, familia 011429a4…) — 3,5 meses de histórico real', () => {
  // Fechas/importes EXACTOS observados en producción durante la auditoría de esta fase.
  const ENDESA = [
    movement({ date: '2026-06-22', amount: 143.6, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-endesa-1', category: 'Suministros' }),
    movement({ date: '2026-07-24', amount: 253.9, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-endesa-2', category: 'Otros' }),
    movement({ date: '2026-08-26', amount: 322.8, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-endesa-3', category: 'Otros' }),
    movement({ date: '2026-09-23', amount: 261.08, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-endesa-4', category: 'Suministros' }),
  ]
  const ORANGE = [
    movement({ date: '2026-06-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU', expenseId: 'exp-orange-1', category: 'Teléfono e Internet' }),
    movement({ date: '2026-07-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU', expenseId: 'exp-orange-2', category: 'Teléfono e Internet' }),
    movement({ date: '2026-08-21', amount: 73.02, description: 'ORANGE ESPAGNE SAU', expenseId: 'exp-orange-3', category: 'Teléfono e Internet' }),
    movement({ date: '2026-09-23', amount: 73.48, description: 'ORANGE ESPAGNE SAU', expenseId: 'exp-orange-4', category: 'Teléfono e Internet' }),
  ]
  const ANTHROPIC = [
    movement({ date: '2026-06-15', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a1', category: 'Otros' }),
    movement({ date: '2026-07-15', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a2', category: 'Software y aplicaciones' }),
    movement({ date: '2026-08-17', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a3', category: 'Software y aplicaciones' }),
  ]
  const BBVA = [
    movement({ date: '2026-07-07', amount: 319.63, description: 'BANCO BILBAO VIZCAYA ARGENTARIA S.A.', expenseId: 'exp-b1', category: 'Otros' }),
    movement({ date: '2026-08-06', amount: 319.63, description: 'BANCO BILBAO VIZCAYA ARGENTARIA S.A.', expenseId: 'exp-b2', category: 'Otros' }),
    movement({ date: '2026-09-08', amount: 319.63, description: 'BANCO BILBAO VIZCAYA ARGENTARIA S.A.', expenseId: 'exp-b3', category: 'Préstamos e intereses' }),
  ]
  // Compra irregular real (Hiperber, últimas 3 fechas reales): 16, 18, 21 de septiembre — 2 y 3 días de
  // diferencia, nada que ver con un patrón mensual.
  const HIPERBER = [
    movement({ date: '2026-09-01', amount: 48.92, description: 'COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER DISTRIBUCION Y L-RAFAL' }),
    movement({ date: '2026-09-16', amount: 47.75, description: 'COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER DISTRIBUCION Y L-RAFAL' }),
    movement({ date: '2026-09-18', amount: 28.5, description: 'COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER DISTRIBUCION Y L-RAFAL' }),
    movement({ date: '2026-09-21', amount: 17.56, description: 'COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER DISTRIBUCION Y L-RAFAL' }),
  ]

  it('B) ORANGE — candidato mensual, importe variable, categoría fiable "Teléfono e Internet"', () => {
    const [candidate] = detectRecurrenceCandidates(ORANGE, OLD_REFERENCE_DATE)
    expect(candidate).toBeDefined()
    expect(candidate.periodicity).toBe('monthly')
    expect(candidate.occurrences).toHaveLength(4)
    expect(candidate.suggestedCategoryName).toBe('Teléfono e Internet')
    expect(candidate.estimatedAmountCents).toBe(Math.round((6455 + 6455 + 7302 + 7348) / 4))
    expect(candidate.estimatedBasisText).toContain('Media de los últimos 4 cargos')
    expect(candidate.estimatedBasisText).toContain('64,55')
    expect(candidate.nextDueDate).toBe('2026-10-23')
  })

  it('C) ANTHROPIC — importe idéntico las 3 veces, pero SIGUE proponiéndose como Estimado (nunca Conocido) y sin rango redundante en el texto', () => {
    const [candidate] = detectRecurrenceCandidates(ANTHROPIC, OLD_REFERENCE_DATE)
    expect(candidate.estimatedAmountCents).toBe(2178)
    expect(candidate.estimatedBasisText).toBe('Media de los últimos 3 cargos') // sin "(21,78–21,78 €)": no aporta nada
  })

  it('D) BBVA — patrón mensual real, pero SIN categoría fiable (mayoría es "Otros", que nunca cuenta)', () => {
    const [candidate] = detectRecurrenceCandidates(BBVA, OLD_REFERENCE_DATE)
    expect(candidate.periodicity).toBe('monthly')
    expect(candidate.suggestedCategoryName).toBeNull()
  })

  it('E) HIPERBER (compra irregular real) — NUNCA se propone, el propio patrón temporal lo descarta (nunca una lista negra por nombre)', () => {
    expect(detectRecurrenceCandidates(HIPERBER, OLD_REFERENCE_DATE)).toEqual([])
  })

  it('A) ENDESA — el motor SÍ lo detecta como patrón (evidencia real de 4 cargos mensuales)…', () => {
    const [candidate] = detectRecurrenceCandidates(ENDESA, OLD_REFERENCE_DATE)
    expect(candidate).toBeDefined()
    expect(candidate.periodicity).toBe('monthly')
    expect(candidate.occurrences).toHaveLength(4)
  })

  it('…pero NUNCA se propone: ya está conciliada con "Endesa factura de luz" (caso obligatorio del encargo)', () => {
    const [candidate] = detectRecurrenceCandidates(ENDESA, OLD_REFERENCE_DATE)
    const matchedExpenseIds = new Set(['exp-endesa-4']) // el cargo de septiembre, ya conciliado (Fase 1D-e/f)
    expect(isRecurrenceCandidateAlreadyKnown(candidate, matchedExpenseIds, [])).toBe(true)

    const allMovements = [...ENDESA, ...ORANGE, ...ANTHROPIC, ...BBVA, ...HIPERBER]
    const results = findNewRecurrenceCandidates(allMovements, matchedExpenseIds, [], new Set(), OLD_REFERENCE_DATE)
    expect(results.map((c) => c.displayName)).not.toContain('ENDESA ENERGIA S.A.')
    expect(results.map((c) => c.displayName).sort()).toEqual(['BANCO BILBAO VIZCAYA ARGENTARIA S.A.', 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', 'ORANGE ESPAGNE SAU'])
  })
})

describe('DBIT sí / CRDT no — una previsión siempre es dinero que sale', () => {
  it('un ingreso repetido (nómina, paga a un hijo…) nunca se propone, por muy periódico que sea', () => {
    const income = [
      movement({ date: '2026-06-15', amount: 100, isIncome: true }),
      movement({ date: '2026-07-15', amount: 100, isIncome: true }),
      movement({ date: '2026-08-14', amount: 100, isIncome: true }),
    ]
    expect(detectRecurrenceCandidates(income, OLD_REFERENCE_DATE)).toEqual([])
  })
})

describe('agrupación por cuenta — nunca se mezclan movimientos de cuentas distintas', () => {
  it('el mismo comercio en dos cuentas produce DOS candidatos independientes, cada uno con su propia cuenta', () => {
    const movements = [
      movement({ date: '2026-06-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU', accountId: ACCOUNT_A }),
      movement({ date: '2026-07-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU', accountId: ACCOUNT_A }),
      movement({ date: '2026-08-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU', accountId: ACCOUNT_A }),
      movement({ date: '2026-06-24', amount: 200, description: 'ORANGE ESPAGNE SAU', accountId: ACCOUNT_B }),
      movement({ date: '2026-07-24', amount: 200, description: 'ORANGE ESPAGNE SAU', accountId: ACCOUNT_B }),
      movement({ date: '2026-08-24', amount: 200, description: 'ORANGE ESPAGNE SAU', accountId: ACCOUNT_B }),
    ]
    const results = detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)
    expect(results).toHaveLength(2)
    expect(results.find((c) => c.accountId === ACCOUNT_A)?.estimatedAmountCents).toBe(6455)
    expect(results.find((c) => c.accountId === ACCOUNT_B)?.estimatedAmountCents).toBe(20000)
  })
})

describe('normalización de merchant — agrupa equivalentes sin fusionar comercios distintos', () => {
  it('espacios de más y mayúsculas/minúsculas distintas se agrupan igual', () => {
    expect(normalizeMerchantKey('  Endesa Energia S.A.  ')).toBe(normalizeMerchantKey('ENDESA   ENERGIA S.A.'))
  })

  it('dos comercios de verdad distintos NUNCA se fusionan en una misma clave', () => {
    expect(normalizeMerchantKey('ORANGE ESPAGNE SAU')).not.toBe(normalizeMerchantKey('ENDESA ENERGIA S.A.'))
  })
})

describe('Fase 1D-g.2 — sufijo de fecha final (caso real de los dos préstamos: el banco añade la fecha del cargo al texto)', () => {
  it('1-3) las 3 mensualidades reales del préstamo 450,50€ (N.8078183410) producen la MISMA merchant_key', () => {
    const a = normalizeMerchantKey('PRESTAMOS ADEUDO CUOTA N.8078183410 30/06/26')
    const b = normalizeMerchantKey('PRESTAMOS ADEUDO CUOTA N.8078183410 31/07/26')
    const c = normalizeMerchantKey('PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26')
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).toBe('PRESTAMOS ADEUDO CUOTA N.8078183410')
  })

  it('4) el préstamo 141,37€ (N.8077731039) produce una merchant_key DISTINTA — el identificador del préstamo nunca se pierde ni se fusiona con el otro', () => {
    const loanA = normalizeMerchantKey('PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26')
    const loanB = normalizeMerchantKey('PRESTAMOS ADEUDO CUOTA N.8077731039 31/08/26')
    expect(loanA).not.toBe(loanB)
    expect(loanA).toContain('8078183410')
    expect(loanB).toContain('8077731039')
  })

  it('5) un número contractual SIN fecha al final no se toca', () => {
    expect(normalizeMerchantKey('PRESTAMOS ADEUDO CUOTA N.8078183410')).toBe('PRESTAMOS ADEUDO CUOTA N.8078183410')
  })

  it('6) un número final que no es una fecha real (mes 13, o solo dígitos de tarjeta) nunca se elimina', () => {
    // "45/13/26" no es una fecha válida (mes 13) — se conserva tal cual, no se adivina.
    expect(normalizeMerchantKey('REFERENCIA CONTRATO 45/13/26')).toBe('REFERENCIA CONTRATO 45/13/26')
    // Dígitos de tarjeta sin barras — nunca hay nada que un patrón de fecha pueda confundir aquí.
    expect(normalizeMerchantKey('COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER')).toBe('COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER')
  })

  it('7) también soporta DD/MM/YYYY (año de 4 dígitos) si algún banco lo usara — mismo criterio, ninguna evidencia real hoy salvo DD/MM/YY', () => {
    expect(normalizeMerchantKey('PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/2026')).toBe('PRESTAMOS ADEUDO CUOTA N.8078183410')
  })

  it('8) una descripción sin ninguna fecha al final se comporta exactamente igual que antes (regresión)', () => {
    expect(normalizeMerchantKey('ENDESA ENERGIA S.A.')).toBe('ENDESA ENERGIA S.A.')
    expect(normalizeMerchantKey('ORANGE ESPAGNE SAU')).toBe('ORANGE ESPAGNE SAU')
  })
})

describe('Fase 1D-g.3 — título visible del candidato: la fecha del último cargo de muestra NUNCA forma parte del nombre', () => {
  it('1) el título candidato del préstamo 450,50€ elimina la fecha final del último cargo usado como muestra', () => {
    const PRESTAMO_A = [
      movement({ date: '2026-06-30', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 30/06/26' }),
      movement({ date: '2026-07-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/07/26' }),
      movement({ date: '2026-08-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26' }),
    ]
    const [candidate] = detectRecurrenceCandidates(PRESTAMO_A, OLD_REFERENCE_DATE)
    expect(candidate.displayName).not.toContain('31/08/26')
  })

  it('2) mantiene el identificador N.8078183410 en el título — nunca se pierde al limpiar la fecha', () => {
    const PRESTAMO_A = [
      movement({ date: '2026-06-30', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 30/06/26' }),
      movement({ date: '2026-07-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/07/26' }),
      movement({ date: '2026-08-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26' }),
    ]
    const [candidate] = detectRecurrenceCandidates(PRESTAMO_A, OLD_REFERENCE_DATE)
    expect(candidate.displayName).toBe('PRESTAMOS ADEUDO CUOTA N.8078183410')
  })

  it('3) el segundo préstamo mantiene N.8077731039 en su título, distinto del primero', () => {
    const PRESTAMO_B = [
      movement({ date: '2026-06-30', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 30/06/26' }),
      movement({ date: '2026-07-31', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 31/07/26' }),
      movement({ date: '2026-08-31', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 31/08/26' }),
    ]
    const [candidate] = detectRecurrenceCandidates(PRESTAMO_B, OLD_REFERENCE_DATE)
    expect(candidate.displayName).toBe('PRESTAMOS ADEUDO CUOTA N.8077731039')
  })

  it('4) ambos siguen siendo identidades (merchant_key) distintas, con títulos igualmente distintos', () => {
    const movements = [
      movement({ date: '2026-06-30', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 30/06/26' }),
      movement({ date: '2026-07-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/07/26' }),
      movement({ date: '2026-08-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26' }),
      movement({ date: '2026-06-30', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 30/06/26' }),
      movement({ date: '2026-07-31', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 31/07/26' }),
      movement({ date: '2026-08-31', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 31/08/26' }),
    ]
    const results = detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)
    expect(results).toHaveLength(2)
    expect(results.map((c) => c.merchantKey).sort()).toEqual(['PRESTAMOS ADEUDO CUOTA N.8077731039', 'PRESTAMOS ADEUDO CUOTA N.8078183410'])
    expect(results.map((c) => c.displayName).sort()).toEqual(['PRESTAMOS ADEUDO CUOTA N.8077731039', 'PRESTAMOS ADEUDO CUOTA N.8078183410'])
  })

  it('8) stripTrailingDateSuffix nunca toca bank_transactions.description — es una función pura de presentación, nunca escribe nada', () => {
    const original = 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26'
    const cleaned = stripTrailingDateSuffix(original)
    expect(cleaned).toBe('PRESTAMOS ADEUDO CUOTA N.8078183410')
    expect(original).toBe('PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26') // el string de entrada no se muta
  })
})

describe('mínimo de evidencia (RECURRENCE_MIN_OCCURRENCES = 3, decisión aprobada)', () => {
  it('con solo 2 cargos, por muy consistentes que sean los intervalos, NUNCA se propone', () => {
    const movements = [movement({ date: '2026-07-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }), movement({ date: '2026-08-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' })]
    expect(detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)).toEqual([])
  })

  it('la constante está documentada y exportada — nunca un número suelto en el algoritmo', () => {
    expect(RECURRENCE_MIN_OCCURRENCES).toBe(3)
  })
})

describe('mensual válido / inválido por intervalo irregular — ningún intervalo puede quedar fuera, nunca basta la media', () => {
  it('3 cargos con un intervalo dentro y otro claramente fuera → NO se propone (la media podría "colar" un mensual falso)', () => {
    // Intervalos: 30 días (dentro), luego 100 días (muy fuera) — la media de los dos sería 65, que ni
    // siquiera es mensual ni bimestral, pero aunque lo fuera, el segundo intervalo por sí solo ya invalida
    // la racha reciente.
    const movements = [movement({ date: '2026-05-01', amount: 50 }), movement({ date: '2026-05-31', amount: 50 }), movement({ date: '2026-09-08', amount: 50 })]
    expect(detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)).toEqual([])
  })

  it('la racha final consistente SÍ se puede proponer aunque un cargo antiguo, ya fuera de la racha, fuera irregular', () => {
    // El primer intervalo (muy largo) queda fuera de la racha final — los 3 últimos SÍ son mensuales
    // consistentes, y esos son los que se usan (nunca se exige que TODO el histórico sea perfecto).
    const movements = [
      movement({ date: '2026-01-01', amount: 50 }), // cargo suelto muy anterior, irregular
      movement({ date: '2026-06-15', amount: 55 }),
      movement({ date: '2026-07-15', amount: 55 }),
      movement({ date: '2026-08-17', amount: 55 }),
    ]
    const [candidate] = detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)
    expect(candidate).toBeDefined()
    expect(candidate.occurrences).toHaveLength(3) // solo la racha final, no el cargo de enero
    expect(candidate.occurrences[0].date).toBe('2026-06-15')
  })
})

describe('bimestral/trimestral/etc. — el motor está preparado para las 6 periodicidades, cuando hay evidencia', () => {
  it('bimestral: 3 cargos cada ~60 días se detectan como bimestrales, no mensuales', () => {
    const movements = [movement({ date: '2026-01-05', amount: 40 }), movement({ date: '2026-03-06', amount: 40 }), movement({ date: '2026-05-04', amount: 40 })]
    const [candidate] = detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)
    expect(candidate.periodicity).toBe('bimonthly')
  })

  it('trimestral: 3 cargos cada ~90 días', () => {
    const movements = [movement({ date: '2026-01-05', amount: 40 }), movement({ date: '2026-04-05', amount: 40 }), movement({ date: '2026-07-02', amount: 40 })]
    const [candidate] = detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)
    expect(candidate.periodicity).toBe('quarterly')
  })

  it('anual: dos cargos separados por un año (con unos días de diferencia, caso real del seguro) — con RECURRENCE_MIN_OCCURRENCES=3 hacen falta 3 años para proponerlo, documentado como límite real del histórico disponible hoy', () => {
    const twoYears = [movement({ date: '2024-06-08', amount: 294 }), movement({ date: '2025-06-10', amount: 294 })]
    expect(detectRecurrenceCandidates(twoYears, OLD_REFERENCE_DATE)).toEqual([]) // solo 2 — no hay evidencia suficiente todavía
    const threeYears = [...twoYears, movement({ date: '2026-06-09', amount: 294 })]
    const [candidate] = detectRecurrenceCandidates(threeYears, OLD_REFERENCE_DATE)
    expect(candidate.periodicity).toBe('annual')
  })

  it('las 5 periodicidades soportadas están documentadas, "semanal" queda fuera a propósito (decisión aprobada)', () => {
    expect(RECURRENCE_PERIODICITIES.map((p) => p.key)).toEqual(['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'])
  })
})

describe('importe: media en céntimos, nunca floats; "Otros" nunca es una categoría fiable', () => {
  it('la media se calcula en céntimos enteros (nunca comparación/redondeo en punto flotante)', () => {
    const movements = [movement({ date: '2026-06-01', amount: 10.1 }), movement({ date: '2026-07-01', amount: 10.2 }), movement({ date: '2026-08-01', amount: 10.1 })]
    const [candidate] = detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)
    // (1010+1020+1010)/3 = 1013.33 → redondeado a 1013 céntimos, nunca un resultado con imprecisión de float.
    expect(candidate.estimatedAmountCents).toBe(1013)
  })

  it('categoría dominante real (mayoría estricta) se propone; sin mayoría clara, se deja sin proponer', () => {
    const majority = [
      movement({ date: '2026-06-01', amount: 10, category: 'Seguros' }),
      movement({ date: '2026-07-01', amount: 10, category: 'Seguros' }),
      movement({ date: '2026-08-01', amount: 10, category: 'Otros' }),
    ]
    expect(detectRecurrenceCandidates(majority, OLD_REFERENCE_DATE)[0].suggestedCategoryName).toBe('Seguros')

    const tie = [
      movement({ date: '2026-06-01', amount: 10, category: 'Seguros', description: 'X' }),
      movement({ date: '2026-07-01', amount: 10, category: 'Vivienda y hogar', description: 'X' }),
      movement({ date: '2026-08-01', amount: 10, category: null, description: 'X' }),
    ]
    expect(detectRecurrenceCandidates(tie, OLD_REFERENCE_DATE)[0].suggestedCategoryName).toBeNull()
  })

  it('"Otros" nunca es fiable aunque sea unánime', () => {
    const allOtros = [movement({ date: '2026-06-01', amount: 10, category: 'Otros' }), movement({ date: '2026-07-01', amount: 10, category: 'Otros' }), movement({ date: '2026-08-01', amount: 10, category: 'Otros' })]
    expect(detectRecurrenceCandidates(allOtros, OLD_REFERENCE_DATE)[0].suggestedCategoryName).toBeNull()
  })
})

describe('deduplicación conservadora contra previsiones existentes', () => {
  const candidate: RecurrenceCandidate = {
    accountId: ACCOUNT_A,
    merchantKey: 'ORANGE ESPAGNE SAU',
    displayName: 'ORANGE ESPAGNE SAU',
    currency: 'EUR',
    periodicity: 'monthly',
    periodicityLabel: 'mensual',
    occurrences: [{ date: '2026-09-23', amountCents: 7348, bankTransactionId: 'bt-1', expenseId: 'exp-1' }],
    estimatedAmountCents: 6900,
    amountRangeCents: { min: 6455, max: 7348 },
    estimatedBasisText: 'Media de los últimos 4 cargos',
    nextDueDate: '2026-10-23',
    suggestedCategoryName: 'Teléfono e Internet',
  }

  it('señal débil: coincidencia de palabra con el título de una previsión activa de la MISMA cuenta → se excluye', () => {
    const existing: ForecastPaymentForDedup[] = [{ title: 'Factura Orange móvil', provider: null, bankAccountId: ACCOUNT_A, active: true }]
    expect(isRecurrenceCandidateAlreadyKnown(candidate, new Set(), existing)).toBe(true)
  })

  it('una previsión con el mismo título pero en OTRA cuenta no excluye — nunca se mezcla por cuenta', () => {
    const existing: ForecastPaymentForDedup[] = [{ title: 'Factura Orange móvil', provider: null, bankAccountId: ACCOUNT_B, active: true }]
    expect(isRecurrenceCandidateAlreadyKnown(candidate, new Set(), existing)).toBe(false)
  })

  it('una previsión DESACTIVADA no excluye — la familia podría querer reactivarla de otra forma sin bloquear la propuesta', () => {
    const existing: ForecastPaymentForDedup[] = [{ title: 'Orange', provider: null, bankAccountId: ACCOUNT_A, active: false }]
    expect(isRecurrenceCandidateAlreadyKnown(candidate, new Set(), existing)).toBe(false)
  })

  it('sin ninguna coincidencia real, no se excluye — no hay matching agresivo', () => {
    const existing: ForecastPaymentForDedup[] = [{ title: 'Seguro Coche Ibiza', provider: null, bankAccountId: ACCOUNT_A, active: true }]
    expect(isRecurrenceCandidateAlreadyKnown(candidate, new Set(), existing)).toBe(false)
  })
})

describe('"No me interesa" — findNewRecurrenceCandidates respeta los descartes ya guardados', () => {
  it('un merchant_key ya descartado para esa cuenta nunca vuelve a proponerse', () => {
    const movements = [movement({ date: '2026-06-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }), movement({ date: '2026-07-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }), movement({ date: '2026-08-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' })]
    const dismissed = new Set([`${ACCOUNT_A}::ORANGE ESPAGNE SAU`])
    expect(findNewRecurrenceCandidates(movements, new Set(), [], dismissed, OLD_REFERENCE_DATE)).toEqual([])
  })

  it('un descarte de OTRA cuenta no afecta a esta', () => {
    const movements = [movement({ date: '2026-06-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }), movement({ date: '2026-07-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }), movement({ date: '2026-08-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' })]
    const dismissed = new Set([`${ACCOUNT_B}::ORANGE ESPAGNE SAU`])
    expect(findNewRecurrenceCandidates(movements, new Set(), [], dismissed, OLD_REFERENCE_DATE)).toHaveLength(1)
  })
})

describe('descripción vacía/ausente — nunca agrupa "nada" como si fuera un comercio', () => {
  it('movimientos sin descripción (null o solo espacios) se ignoran por completo', () => {
    const movements = [movement({ date: '2026-06-01', amount: 10, description: null }), movement({ date: '2026-07-01', amount: 10, description: '   ' }), movement({ date: '2026-08-01', amount: 10, description: null })]
    expect(detectRecurrenceCandidates(movements, OLD_REFERENCE_DATE)).toEqual([])
  })
})

describe('Fase 1D-g.1 — "próximo cargo estimado" SIEMPRE estrictamente futuro (bug real certificado en iPhone, hoy=23/09/2026)', () => {
  it('1) mensual ya futura: se conserva tal cual, sin avanzar de más', () => {
    expect(nextFutureDueDate('2026-09-23', 1, '2026-09-23')).toBe('2026-10-23')
  })

  it('2) mensual en el pasado: avanza un ciclo hasta la primera fecha futura', () => {
    expect(nextFutureDueDate('2026-08-17', 1, '2026-09-23')).toBe('2026-10-17')
  })

  it('3) mensual exactamente hoy: "próximo" significa posterior a hoy, nunca hoy mismo — avanza al siguiente ciclo', () => {
    expect(nextFutureDueDate('2026-08-23', 1, '2026-09-23')).toBe('2026-10-23')
  })

  it('4) varios ciclos atrasados: avanza tantas veces como haga falta hasta la primera ocurrencia futura', () => {
    // 17/07, 17/08 y 17/09 quedan los 3 en el pasado o son anteriores a hoy — hace falta llegar a 17/10.
    expect(nextFutureDueDate('2026-06-17', 1, '2026-09-23')).toBe('2026-10-17')
  })

  it('5) bimestral', () => {
    expect(nextFutureDueDate('2026-05-04', 2, '2026-09-23')).toBe('2026-11-04')
  })

  it('6) trimestral', () => {
    expect(nextFutureDueDate('2026-01-05', 3, '2026-09-23')).toBe('2026-10-05')
  })

  it('7) semestral', () => {
    expect(nextFutureDueDate('2026-03-01', 6, '2026-09-23')).toBe('2027-03-01')
  })

  it('8) anual', () => {
    expect(nextFutureDueDate('2025-09-10', 12, '2026-09-23')).toBe('2027-09-10')
  })

  it('9) fin de mes: SIEMPRE ancla en el último cargo real (nunca encadena stepMonthsClamped sobre su propio resultado) — 31 ene no arrastra el recorte de 28 feb', () => {
    // Si se encadenara (31 ene -> 28 feb clamped -> +1 mes = 28 mar), saldría 28/03; anclando siempre en
    // 31 ene (2 ciclos = +2 meses desde el ancla), el resultado real es 31/03 (marzo sí tiene 31 días).
    expect(nextFutureDueDate('2026-01-31', 1, '2026-03-15')).toBe('2026-03-31')
  })

  it('10) el caso real certificado en iPhone: ANTHROPIC ya no vuelve a mostrar 17/09/2026 (pasado) — avanza al 17/10/2026, producido por el mismo motor, nunca inventado a mano', () => {
    const ANTHROPIC = [
      movement({ date: '2026-06-15', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a1' }),
      movement({ date: '2026-07-15', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a2' }),
      movement({ date: '2026-08-17', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a3' }),
    ]
    const HOY = '2026-09-23'
    const [candidate] = detectRecurrenceCandidates(ANTHROPIC, HOY)
    expect(candidate.nextDueDate).not.toBe('2026-09-17')
    expect(candidate.nextDueDate).toBe('2026-10-17')
    expect(candidate.nextDueDate > HOY).toBe(true)
    // La corrección es SOLO sobre la fecha propuesta — la evidencia histórica detectada no cambia.
    expect(candidate.periodicity).toBe('monthly')
    expect(candidate.occurrences).toHaveLength(3)
    expect(candidate.estimatedAmountCents).toBe(2178)
  })

  it('11) ENDESA sigue excluida por deduplicación con la fecha de referencia real de la certificación', () => {
    const ENDESA = [
      movement({ date: '2026-06-22', amount: 143.6, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-endesa-1' }),
      movement({ date: '2026-07-24', amount: 253.9, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-endesa-2' }),
      movement({ date: '2026-08-26', amount: 322.8, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-endesa-3' }),
      movement({ date: '2026-09-23', amount: 261.08, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-endesa-4' }),
    ]
    const matchedExpenseIds = new Set(['exp-endesa-4'])
    const results = findNewRecurrenceCandidates(ENDESA, matchedExpenseIds, [], new Set(), '2026-09-23')
    expect(results).toEqual([])
  })
})

describe('Fase 1D-g.2 — CASOS REALES: los dos préstamos (bank_transactions.description real de producción, con fecha embebida)', () => {
  // Cuenta real, fechas/importes EXACTOS de la auditoría de esta fase.
  const PRESTAMO_A = [
    movement({ date: '2026-06-30', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 30/06/26', expenseId: 'exp-pa-1', category: 'Préstamos e intereses' }),
    movement({ date: '2026-07-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/07/26', expenseId: 'exp-pa-2', category: 'Préstamos e intereses' }),
    movement({ date: '2026-08-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26', expenseId: 'exp-pa-3', category: 'Préstamos e intereses' }),
  ]
  const PRESTAMO_B = [
    movement({ date: '2026-06-30', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 30/06/26', expenseId: 'exp-pb-1', category: 'Préstamos e intereses' }),
    movement({ date: '2026-07-31', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 31/07/26', expenseId: 'exp-pb-2', category: 'Préstamos e intereses' }),
    movement({ date: '2026-08-31', amount: 141.37, description: 'PRESTAMOS ADEUDO CUOTA N.8077731039 31/08/26', expenseId: 'exp-pb-3', category: 'Préstamos e intereses' }),
  ]

  it('9) préstamo 450,50€ ×3 ahora SÍ se detecta como mensual (antes de este fix, cero candidatos)', () => {
    const [candidate] = detectRecurrenceCandidates(PRESTAMO_A, OLD_REFERENCE_DATE)
    expect(candidate).toBeDefined()
    expect(candidate.periodicity).toBe('monthly')
    expect(candidate.occurrences).toHaveLength(3)
    expect(candidate.estimatedAmountCents).toBe(45050)
    expect(candidate.suggestedCategoryName).toBe('Préstamos e intereses')
  })

  it('10) préstamo 141,37€ ×3 ahora SÍ se detecta como mensual', () => {
    const [candidate] = detectRecurrenceCandidates(PRESTAMO_B, OLD_REFERENCE_DATE)
    expect(candidate).toBeDefined()
    expect(candidate.periodicity).toBe('monthly')
    expect(candidate.occurrences).toHaveLength(3)
    expect(candidate.estimatedAmountCents).toBe(14137)
  })

  it('11) los dos préstamos NUNCA se fusionan entre sí — dos candidatos independientes, cada uno con su propio importe', () => {
    const results = detectRecurrenceCandidates([...PRESTAMO_A, ...PRESTAMO_B], OLD_REFERENCE_DATE)
    expect(results).toHaveLength(2)
    expect(results.map((c) => c.estimatedAmountCents).sort((a, b) => a - b)).toEqual([14137, 45050])
    expect(results.map((c) => c.merchantKey).sort()).toEqual(['PRESTAMOS ADEUDO CUOTA N.8077731039', 'PRESTAMOS ADEUDO CUOTA N.8078183410'])
  })

  it('12) 30/06 → 31/07 → 31/08 entra en la tolerancia mensual (31 y 31 días, dentro de 23-37)', () => {
    const [candidate] = detectRecurrenceCandidates(PRESTAMO_A, OLD_REFERENCE_DATE)
    expect(candidate.occurrences.map((o) => o.date)).toEqual(['2026-06-30', '2026-07-31', '2026-08-31'])
  })

  it('13) la próxima fecha usa nextFutureDueDate con una referenceDate real explícita — nunca el reloj del sistema', () => {
    const [candidate] = detectRecurrenceCandidates(PRESTAMO_A, '2026-09-23')
    // Último cargo 31/08 + 1 mes (clamped, septiembre tiene 30 días) = 30/09 — ya futuro respecto al 23/09.
    expect(candidate.nextDueDate).toBe('2026-09-30')
    expect(candidate.nextDueDate > '2026-09-23').toBe(true)
  })

  it('14) Mercadona/Hiperber/Amazon (compra irregular real) siguen sin falsos positivos tras este cambio — el sufijo de fecha no les afecta porque sus descripciones no terminan en fecha', () => {
    const irregular = [
      movement({ date: '2026-09-01', amount: 48.92, description: 'COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER DISTRIBUCION Y L-RAFAL' }),
      movement({ date: '2026-09-16', amount: 47.75, description: 'COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER DISTRIBUCION Y L-RAFAL' }),
      movement({ date: '2026-09-18', amount: 28.5, description: 'COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER DISTRIBUCION Y L-RAFAL' }),
      movement({ date: '2026-09-21', amount: 17.56, description: 'COMPRA TARJ. 5402XXXXXXXX4041 HIPERBER DISTRIBUCION Y L-RAFAL' }),
    ]
    expect(detectRecurrenceCandidates(irregular, OLD_REFERENCE_DATE)).toEqual([])
  })

  it('15) Endesa sigue deduplicada (regresión — sin relación con el cambio de normalización, su descripción no termina en fecha)', () => {
    const ENDESA = [
      movement({ date: '2026-06-22', amount: 143.6, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-e1' }),
      movement({ date: '2026-07-24', amount: 253.9, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-e2' }),
      movement({ date: '2026-08-26', amount: 322.8, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-e3' }),
      movement({ date: '2026-09-23', amount: 261.08, description: 'ENDESA ENERGIA S.A.', expenseId: 'exp-e4' }),
    ]
    expect(findNewRecurrenceCandidates(ENDESA, new Set(['exp-e4']), [], new Set(), OLD_REFERENCE_DATE)).toEqual([])
  })

  it('16) Orange se comporta exactamente igual que antes — su descripción no termina en fecha, normalizeMerchantKey no la toca', () => {
    const ORANGE = [
      movement({ date: '2026-06-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }),
      movement({ date: '2026-07-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }),
      movement({ date: '2026-08-21', amount: 73.02, description: 'ORANGE ESPAGNE SAU' }),
      movement({ date: '2026-09-23', amount: 73.48, description: 'ORANGE ESPAGNE SAU' }),
    ]
    const [candidate] = detectRecurrenceCandidates(ORANGE, OLD_REFERENCE_DATE)
    expect(candidate.merchantKey).toBe('ORANGE ESPAGNE SAU')
    expect(candidate.occurrences).toHaveLength(4)
  })

  it('17) Anthropic ya creada como previsión real no reaparece (título real guardado tras aceptar la propuesta de 1D-g)', () => {
    const ANTHROPIC = [
      movement({ date: '2026-06-15', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a1' }),
      movement({ date: '2026-07-15', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a2' }),
      movement({ date: '2026-08-17', amount: 21.78, description: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', expenseId: 'exp-a3' }),
    ]
    const existingPayments: ForecastPaymentForDedup[] = [
      { title: 'COMPRA TARJ. 5402XXXXXXXX4041 ANTHROPIC* CLAUDE SUB-DUBLIN', provider: null, bankAccountId: ACCOUNT_A, active: true },
    ]
    expect(findNewRecurrenceCandidates(ANTHROPIC, new Set(), existingPayments, new Set(), OLD_REFERENCE_DATE)).toEqual([])
  })
})

describe('Fase 1D-g.2 — dismissals: la clave leída y la escrita por el detector siguen siendo la MISMA función', () => {
  it('31) un descarte guardado con la merchant_key actual (post-fix) sigue excluyendo esa misma propuesta — el mecanismo de "No me interesa" no ha cambiado', () => {
    const movements = PRESTAMO_A_FOR_DISMISS()
    const key = `${ACCOUNT_A}::${normalizeMerchantKey('PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26')}`
    const dismissed = new Set([key])
    expect(findNewRecurrenceCandidates(movements, new Set(), [], dismissed, OLD_REFERENCE_DATE)).toEqual([])
  })

  it('32) un descarte de OTRO préstamo (merchant_key distinta) nunca afecta a este — el cambio de normalización no puede "resucitar" ni "matar" propuestas de forma cruzada', () => {
    const movements = PRESTAMO_A_FOR_DISMISS()
    const dismissedOtherLoan = new Set([`${ACCOUNT_A}::PRESTAMOS ADEUDO CUOTA N.8077731039`])
    expect(findNewRecurrenceCandidates(movements, new Set(), [], dismissedOtherLoan, OLD_REFERENCE_DATE)).toHaveLength(1)
  })

  function PRESTAMO_A_FOR_DISMISS(): BankMovementForDetection[] {
    return [
      movement({ date: '2026-06-30', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 30/06/26', accountId: ACCOUNT_A }),
      movement({ date: '2026-07-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/07/26', accountId: ACCOUNT_A }),
      movement({ date: '2026-08-31', amount: 450.5, description: 'PRESTAMOS ADEUDO CUOTA N.8078183410 31/08/26', accountId: ACCOUNT_A }),
    ]
  }
})
