import { describe, expect, it } from 'vitest'
import {
  detectRecurrenceCandidates,
  findNewRecurrenceCandidates,
  isRecurrenceCandidateAlreadyKnown,
  normalizeMerchantKey,
  RECURRENCE_MIN_OCCURRENCES,
  RECURRENCE_PERIODICITIES,
  type BankMovementForDetection,
  type ForecastPaymentForDedup,
  type RecurrenceCandidate,
} from './forecastRecurrenceDetection'

const ACCOUNT_A = 'account-aaaa'
const ACCOUNT_B = 'account-bbbb'

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
    const [candidate] = detectRecurrenceCandidates(ORANGE)
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
    const [candidate] = detectRecurrenceCandidates(ANTHROPIC)
    expect(candidate.estimatedAmountCents).toBe(2178)
    expect(candidate.estimatedBasisText).toBe('Media de los últimos 3 cargos') // sin "(21,78–21,78 €)": no aporta nada
  })

  it('D) BBVA — patrón mensual real, pero SIN categoría fiable (mayoría es "Otros", que nunca cuenta)', () => {
    const [candidate] = detectRecurrenceCandidates(BBVA)
    expect(candidate.periodicity).toBe('monthly')
    expect(candidate.suggestedCategoryName).toBeNull()
  })

  it('E) HIPERBER (compra irregular real) — NUNCA se propone, el propio patrón temporal lo descarta (nunca una lista negra por nombre)', () => {
    expect(detectRecurrenceCandidates(HIPERBER)).toEqual([])
  })

  it('A) ENDESA — el motor SÍ lo detecta como patrón (evidencia real de 4 cargos mensuales)…', () => {
    const [candidate] = detectRecurrenceCandidates(ENDESA)
    expect(candidate).toBeDefined()
    expect(candidate.periodicity).toBe('monthly')
    expect(candidate.occurrences).toHaveLength(4)
  })

  it('…pero NUNCA se propone: ya está conciliada con "Endesa factura de luz" (caso obligatorio del encargo)', () => {
    const [candidate] = detectRecurrenceCandidates(ENDESA)
    const matchedExpenseIds = new Set(['exp-endesa-4']) // el cargo de septiembre, ya conciliado (Fase 1D-e/f)
    expect(isRecurrenceCandidateAlreadyKnown(candidate, matchedExpenseIds, [])).toBe(true)

    const allMovements = [...ENDESA, ...ORANGE, ...ANTHROPIC, ...BBVA, ...HIPERBER]
    const results = findNewRecurrenceCandidates(allMovements, matchedExpenseIds, [], new Set())
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
    expect(detectRecurrenceCandidates(income)).toEqual([])
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
    const results = detectRecurrenceCandidates(movements)
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

describe('mínimo de evidencia (RECURRENCE_MIN_OCCURRENCES = 3, decisión aprobada)', () => {
  it('con solo 2 cargos, por muy consistentes que sean los intervalos, NUNCA se propone', () => {
    const movements = [movement({ date: '2026-07-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }), movement({ date: '2026-08-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' })]
    expect(detectRecurrenceCandidates(movements)).toEqual([])
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
    expect(detectRecurrenceCandidates(movements)).toEqual([])
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
    const [candidate] = detectRecurrenceCandidates(movements)
    expect(candidate).toBeDefined()
    expect(candidate.occurrences).toHaveLength(3) // solo la racha final, no el cargo de enero
    expect(candidate.occurrences[0].date).toBe('2026-06-15')
  })
})

describe('bimestral/trimestral/etc. — el motor está preparado para las 6 periodicidades, cuando hay evidencia', () => {
  it('bimestral: 3 cargos cada ~60 días se detectan como bimestrales, no mensuales', () => {
    const movements = [movement({ date: '2026-01-05', amount: 40 }), movement({ date: '2026-03-06', amount: 40 }), movement({ date: '2026-05-04', amount: 40 })]
    const [candidate] = detectRecurrenceCandidates(movements)
    expect(candidate.periodicity).toBe('bimonthly')
  })

  it('trimestral: 3 cargos cada ~90 días', () => {
    const movements = [movement({ date: '2026-01-05', amount: 40 }), movement({ date: '2026-04-05', amount: 40 }), movement({ date: '2026-07-02', amount: 40 })]
    const [candidate] = detectRecurrenceCandidates(movements)
    expect(candidate.periodicity).toBe('quarterly')
  })

  it('anual: dos cargos separados por un año (con unos días de diferencia, caso real del seguro) — con RECURRENCE_MIN_OCCURRENCES=3 hacen falta 3 años para proponerlo, documentado como límite real del histórico disponible hoy', () => {
    const twoYears = [movement({ date: '2024-06-08', amount: 294 }), movement({ date: '2025-06-10', amount: 294 })]
    expect(detectRecurrenceCandidates(twoYears)).toEqual([]) // solo 2 — no hay evidencia suficiente todavía
    const threeYears = [...twoYears, movement({ date: '2026-06-09', amount: 294 })]
    const [candidate] = detectRecurrenceCandidates(threeYears)
    expect(candidate.periodicity).toBe('annual')
  })

  it('las 5 periodicidades soportadas están documentadas, "semanal" queda fuera a propósito (decisión aprobada)', () => {
    expect(RECURRENCE_PERIODICITIES.map((p) => p.key)).toEqual(['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'])
  })
})

describe('importe: media en céntimos, nunca floats; "Otros" nunca es una categoría fiable', () => {
  it('la media se calcula en céntimos enteros (nunca comparación/redondeo en punto flotante)', () => {
    const movements = [movement({ date: '2026-06-01', amount: 10.1 }), movement({ date: '2026-07-01', amount: 10.2 }), movement({ date: '2026-08-01', amount: 10.1 })]
    const [candidate] = detectRecurrenceCandidates(movements)
    // (1010+1020+1010)/3 = 1013.33 → redondeado a 1013 céntimos, nunca un resultado con imprecisión de float.
    expect(candidate.estimatedAmountCents).toBe(1013)
  })

  it('categoría dominante real (mayoría estricta) se propone; sin mayoría clara, se deja sin proponer', () => {
    const majority = [
      movement({ date: '2026-06-01', amount: 10, category: 'Seguros' }),
      movement({ date: '2026-07-01', amount: 10, category: 'Seguros' }),
      movement({ date: '2026-08-01', amount: 10, category: 'Otros' }),
    ]
    expect(detectRecurrenceCandidates(majority)[0].suggestedCategoryName).toBe('Seguros')

    const tie = [
      movement({ date: '2026-06-01', amount: 10, category: 'Seguros', description: 'X' }),
      movement({ date: '2026-07-01', amount: 10, category: 'Vivienda y hogar', description: 'X' }),
      movement({ date: '2026-08-01', amount: 10, category: null, description: 'X' }),
    ]
    expect(detectRecurrenceCandidates(tie)[0].suggestedCategoryName).toBeNull()
  })

  it('"Otros" nunca es fiable aunque sea unánime', () => {
    const allOtros = [movement({ date: '2026-06-01', amount: 10, category: 'Otros' }), movement({ date: '2026-07-01', amount: 10, category: 'Otros' }), movement({ date: '2026-08-01', amount: 10, category: 'Otros' })]
    expect(detectRecurrenceCandidates(allOtros)[0].suggestedCategoryName).toBeNull()
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
    expect(findNewRecurrenceCandidates(movements, new Set(), [], dismissed)).toEqual([])
  })

  it('un descarte de OTRA cuenta no afecta a esta', () => {
    const movements = [movement({ date: '2026-06-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }), movement({ date: '2026-07-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' }), movement({ date: '2026-08-23', amount: 64.55, description: 'ORANGE ESPAGNE SAU' })]
    const dismissed = new Set([`${ACCOUNT_B}::ORANGE ESPAGNE SAU`])
    expect(findNewRecurrenceCandidates(movements, new Set(), [], dismissed)).toHaveLength(1)
  })
})

describe('descripción vacía/ausente — nunca agrupa "nada" como si fuera un comercio', () => {
  it('movimientos sin descripción (null o solo espacios) se ignoran por completo', () => {
    const movements = [movement({ date: '2026-06-01', amount: 10, description: null }), movement({ date: '2026-07-01', amount: 10, description: '   ' }), movement({ date: '2026-08-01', amount: 10, description: null })]
    expect(detectRecurrenceCandidates(movements)).toEqual([])
  })
})
