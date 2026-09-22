import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYSIS_METRICS, baseQuery, parseFinanceFollowUp, parseFinanceQuestion, type FinanceQuery } from './financeQuery'
import { answerFinanceQuery, formatEuros, type FinanceData } from './financeCompute'
import { buildAnalysis } from './financeAnalysis'
import { resolvePeriod } from './financePeriod'
import { refundLabel, REFUND_CATALOG_KEY } from './refunds'
import type { BudgetCategory, Expense } from './types'

// FASE 6D.2 — PEPA / análisis / explicación de devoluciones. Reutiliza el Modelo C de la Fase 6D.1 (domain/refunds.ts,
// financeCompute.ts: totalRefunds/netSpending/isRealIncome) sin duplicar la identificación de una devolución: aquí solo se
// comprueba lo NUEVO — la métrica 'refunds', el matiz bruto/neto de 'spent', la coherencia del ahorro y del análisis, el listado
// sin datos bancarios en bruto, y que nada de esto se manda calcular a la IA.
const TODAY = new Date(2026, 8, 20)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

function cat(id: string, name: string, over: Partial<BudgetCategory> = {}): BudgetCategory {
  return { id, familyId: 'f', name, icon: '', budgetGroup: 'ingresos', sortOrder: 0, parentId: null, necessity: null, isFixed: null, catalogKey: null, ...over }
}
const CATEGORIES: BudgetCategory[] = [
  cat('devol', 'Devoluciones', { catalogKey: REFUND_CATALOG_KEY }),
  cat('sueldo', 'Sueldo', { catalogKey: 'i.sueldo' }),
  cat('mi', 'Movimientos internos', { catalogKey: 'i.movimientos_internos' }),
  cat('anulado', 'Cobro anulado', { parentId: 'mi', budgetGroup: 'generales', catalogKey: 'g.movimientos_internos.cobro_anulado' }),
  cat('super', 'Supermercado', { budgetGroup: 'generales', catalogKey: null }),
]

let n = 0
function exp(date: string, amount: number, category: string | null, over: Partial<Expense> = {}): Expense {
  n++
  return {
    id: `e${n}`,
    familyId: 'f',
    expenseDate: date,
    amount,
    category,
    store: null,
    kind: 'real',
    notes: null,
    isIncome: false,
    budgetGroup: 'generales',
    tagId: null,
    source: 'banco',
    isFixedOverride: null,
    ownerMemberId: null,
    shared: false,
    sharedFromExpenseId: null,
    productClassification: null,
    ...over,
  }
}

// Réplica del histórico REAL de Familia Hepburn (verificado en la base de datos el 2026-09-22, ver Fase 6D.1/6D.0):
//   junio: 10,95 € (15-jun, Farmacia Vieitez) + 35,99 € (25-jun, C A Mode) = 46,94 €; sin ingreso real ese mes.
//   julio: 24,99 €. agosto: 0 €. septiembre: 7,33 €. Histórico: 79,26 €.
// La pareja comisión+bonificación de 60 € (6D.0) queda en «Cobro anulado»: nunca debe aparecer aquí.
const EXPENSES: Expense[] = [
  exp('2026-06-15', 10.95, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos', notes: 'DEVOLUCION TAR.5402XXXXXXXX4041 15.06 FARMACIA VIEITEZ COM-VIGO' }),
  exp('2026-06-25', 35.99, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos', notes: 'DEVOLUCION TAR.5402XXXXXXXX4041 25.06 C A MODE GMBH CO K-DUESSELDORF' }),
  exp('2026-06-10', 3866.6, 'Supermercado'),
  exp('2026-06-24', 60, 'Cobro anulado', { notes: 'INTERESES Y/O COMISIONES CUENTA' }),
  exp('2026-06-24', 60, 'Cobro anulado', { isIncome: true, budgetGroup: 'ingresos', notes: 'BONIFIC. COMISION MANT. CUENTA' }),

  exp('2026-07-16', 24.99, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos', notes: 'DEVOLUCION cable TAR.5402XXXXXXXX4041 16.07 ADEO LEROY MERLIN SPAIN-ALCOBENDAS' }),
  exp('2026-07-01', 2000, 'Sueldo', { isIncome: true, budgetGroup: 'ingresos' }),
  exp('2026-07-05', 800, 'Supermercado'),

  exp('2026-08-01', 1500, 'Sueldo', { isIncome: true, budgetGroup: 'ingresos' }),
  exp('2026-08-05', 600, 'Supermercado'),

  exp('2026-09-16', 7.33, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos', notes: 'DEVOLUCION 5402XXXXXXXX4041 14.09 GOOGLE*GOOGLE ONE-DUBLIN' }),
  exp('2026-09-01', 1000, 'Sueldo', { isIncome: true, budgetGroup: 'ingresos' }),
  exp('2026-09-05', 400, 'Supermercado'),
]

function data(over: Partial<FinanceData> = {}): FinanceData {
  return { expenses: EXPENSES, categories: CATEGORIES, receipts: [], prices: [], products: [], storeNames: [], monthStartDay: 1, bankStale: false, ...over }
}

function ask(text: string, d: FinanceData = data(), ctx: FinanceQuery | null = null, items: string[] = []): string {
  const parsed = parseFinanceQuestion(text, TODAY)
  const q = parsed && parsed.kind === 'query' ? parsed.query : ctx ? parseFinanceFollowUp(text, ctx, TODAY, items) : null
  if (!q) throw new Error(`no entendido: ${text}`)
  return answerFinanceQuery(q, d, TODAY).text
}

const monthQuery = (month0: number): FinanceQuery => baseQuery('refunds', { period: { t: 'month_named', month0, year: 2026 } })

describe('27. cifras reales de Familia Hepburn', () => {
  it('junio: 46,94 € en 2 devoluciones', () => {
    expect(ask('¿Qué devoluciones hubo en junio?')).toContain('46,94 €')
    expect(ask('¿Qué devoluciones hubo en junio?')).toContain('2 devoluciones')
  })
  it('julio: 24,99 €', () => {
    expect(ask('¿Cuánto nos han devuelto en julio?')).toContain('24,99 €')
  })
  it('agosto: sin devoluciones', () => {
    expect(ask('¿Qué devoluciones tuvimos en agosto?')).toBe('No hubo devoluciones registradas en agosto.')
  })
  it('septiembre: 7,33 €', () => {
    expect(ask('¿Qué devoluciones hubo en septiembre?')).toContain('7,33 €')
  })
  it('histórico: 79,26 € (sin periodo, todas)', () => {
    expect(answerFinanceQuery(baseQuery('refunds'), data(), TODAY).text).toContain('79,26 €')
  })
})

describe('A/B/C. intención: reconoce la pregunta de devoluciones', () => {
  it('A. «¿Qué devoluciones hemos tenido?»', () => {
    expect(parseFinanceQuestion('¿Qué devoluciones hemos tenido?', TODAY)).toMatchObject({ kind: 'query', query: { metric: 'refunds' } })
  })
  it('B. «¿Cuánto nos han devuelto este mes?»', () => {
    expect(parseFinanceQuestion('¿Cuánto nos han devuelto este mes?', TODAY)).toMatchObject({ kind: 'query', query: { metric: 'refunds' } })
  })
  it('C. «¿Nos han devuelto algo?»', () => {
    expect(parseFinanceQuestion('¿Nos han devuelto algo?', TODAY)).toMatchObject({ kind: 'query', query: { metric: 'refunds' } })
  })
  it('«¿Cuánto hemos recuperado en devoluciones?»', () => {
    expect(parseFinanceQuestion('¿Cuánto hemos recuperado en devoluciones?', TODAY)).toMatchObject({ kind: 'query', query: { metric: 'refunds' } })
  })
  it('no confunde una orden ajena a Economía con una pregunta de dinero', () => {
    expect(parseFinanceQuestion('Devuelve el libro a la biblioteca', TODAY)).toBeNull()
  })
})

describe('4. respuesta de devoluciones: total, nº, periodo y listado breve', () => {
  it('junio: el listado exacto del enunciado', () => {
    expect(ask('¿Qué devoluciones hubo en junio?')).toBe('En junio recuperasteis 46,94 € en 2 devoluciones: 10,95 € de Farmacia Vieitez y 35,99 € de C A Mode.')
  })
})

describe('D. «¿Cuánto ingresamos?»: nunca cuenta una devolución como ingreso', () => {
  it('junio: no hubo ingresos reales (las devoluciones no cuentan)', () => {
    expect(ask('¿Cuánto hemos ingresado en junio?')).toBe('No tengo ingresos registrados en junio.')
    expect(ask('¿Cuánto hemos ingresado en junio?')).not.toContain('46,94')
  })
})

describe('E/F/G. gasto genérico, bruto y neto', () => {
  it('E. genérico con devoluciones: prioriza el neto y explica el bruto', () => {
    expect(ask('¿Cuánto hemos gastado en junio?')).toBe('En junio el gasto neto fue 3.819,66 €. Se gastaron 3.866,60 € y recuperasteis 46,94 € en devoluciones.')
  })
  it('F. gasto bruto explícito: el de siempre, sin descontar nada', () => {
    expect(ask('¿Cuál fue el gasto bruto en junio?')).toBe('En junio habéis gastado 3.866,60 € de gastos registrados.')
    expect(ask('¿Cuánto gastamos en junio antes de devoluciones?')).toContain('3.866,60 €')
  })
  it('G. gasto neto explícito: igual que el genérico con devoluciones', () => {
    expect(ask('¿Cuál fue el gasto neto en junio?')).toContain('3.819,66 €')
    expect(ask('¿Cuánto gastamos en junio realmente después de devoluciones?')).toContain('3.819,66 €')
  })
  it('sin devoluciones en el periodo: bruto y neto son la misma respuesta de siempre', () => {
    expect(ask('¿Cuánto hemos gastado en agosto?')).toBe('En agosto habéis gastado 600,00 € de gastos registrados.')
  })
})

describe('H. «¿Cuánto ahorramos?»: cifra correcta y explicación coherente', () => {
  it('junio: sin ingreso real, no se inventa un ahorro, pero se explica el gasto NETO', () => {
    const text = ask('¿Cuánto hemos ahorrado en junio?')
    expect(text).toContain('No tengo ingresos registrados en junio, así que no puedo calcular el ahorro')
    expect(text).toContain('Gasto neto: 3.819,66 €')
    expect(text).toContain('3.866,60')
    expect(text).toContain('46,94')
  })
  it('julio: con ingreso real y devoluciones, el ahorro usa el gasto neto y lo explica', () => {
    // Ingreso 2.000; bruto 800 + 24,99 devuelto -> neto 775,01; ahorro 2000 - 775,01 = 1224,99.
    const text = ask('¿Cuánto hemos ahorrado en julio?')
    expect(text).toContain('gasto neto 775,01 €')
    expect(text).toContain('gastasteis 800,00 €')
    expect(text).toContain('recuperasteis 24,99 €')
    expect(text).toContain('Ahorro: 1.224,99 €')
  })
  it('agosto (sin devoluciones): la frase de ahorro NO cambia respecto a antes de 6D.2', () => {
    expect(ask('¿Cuánto hemos ahorrado en agosto?')).toBe('En agosto: ingresos 1.500,00 €, gastos 600,00 €. Ahorro: 900,00 € (60 % de lo ingresado).')
  })
})

describe('K. gasto neto negativo: nunca "gasto negativo", siempre una explicación natural', () => {
  it('un periodo sintético donde se recupera más de lo gastado', () => {
    const synthetic = data({
      expenses: [
        exp('2026-06-02', 20, 'Supermercado'),
        exp('2026-06-03', 50, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos' }),
      ],
    })
    const p = parseFinanceQuestion('¿Cuánto hemos gastado en junio?', TODAY)
    const text = answerFinanceQuery((p as { kind: 'query'; query: FinanceQuery }).query, synthetic, TODAY).text
    expect(text).toContain('el gasto neto fue -30,00 €')
    expect(text).not.toMatch(/gastasteis -30|gasto negativo/i)
    expect(text).toContain('Se gastaron 20,00 €')
    expect(text).toContain('recuperasteis 50,00 € en devoluciones')
  })
})

describe('L. «Cobro anulado» (6D.0): nunca es una devolución', () => {
  it('los 60 € de comisión+bonificación no aparecen en ningún total ni listado de devoluciones', () => {
    const text = ask('¿Qué devoluciones hubo en junio?')
    expect(text).not.toContain('60,00')
    expect(text).not.toContain('120,00')
  })
})

describe('M. privacidad: nunca IDs, cuentas ni el texto bancario en bruto', () => {
  it('el listado completo ("¿cuáles fueron?") limpia el texto del banco', () => {
    const ctx = monthQuery(5) // junio
    const brief = answerFinanceQuery(ctx, data(), TODAY)
    const follow = parseFinanceFollowUp('¿Cuáles fueron?', brief.query, TODAY)
    expect(follow).not.toBeNull()
    const text = answerFinanceQuery(follow as FinanceQuery, data(), TODAY).text
    expect(text).toContain('Farmacia Vieitez')
    expect(text).toContain('C A Mode')
    expect(text).not.toMatch(/TAR\.|XXXX|5402|e1|e2|\be\d+\b/)
  })
  it('refundLabel nunca deja pasar la máscara de tarjeta ni dígitos largos', () => {
    for (const e of EXPENSES.filter((x) => x.category === 'Devoluciones')) {
      const label = refundLabel(e)
      expect(label).not.toMatch(/\d{4,}/)
      expect(label).not.toMatch(/TAR\./i)
    }
  })
})

describe('N. sin atribución a categoría: una devolución no explica un descenso de gasto por categoría', () => {
  it('«¿por qué hemos gastado menos?» separa el cambio bruto por categorías de las devoluciones', () => {
    const p = parseFinanceQuestion('¿Por qué hemos gastado menos en julio?', TODAY)
    const text = answerFinanceQuery((p as { kind: 'query'; query: FinanceQuery }).query, data(), TODAY).text
    // La comparación por categorías es sobre el gasto BRUTO; las devoluciones se dicen aparte, sin atribuírselas a una categoría.
    if (/recuperasteis/i.test(text)) {
      expect(text).toContain('sobre el gasto bruto, sin contar devoluciones')
    }
    expect(text).not.toMatch(/Supermercado.*devoluci|devoluci\w*.*Supermercado/i)
  })
})

describe('O. sin IA: la métrica refunds es una cifra de código, nunca análisis', () => {
  it('refunds no está entre las métricas de análisis (nunca pasa por la IA)', () => {
    expect(ANALYSIS_METRICS).not.toContain('refunds')
  })
})

describe('16. contexto conversacional (reutiliza el sistema existente)', () => {
  it('"¿Cuánto hemos gastado en junio?" → "¿Y cuánto nos devolvieron?" → "¿Cuáles fueron?"', () => {
    const spentQuery = (parseFinanceQuestion('¿Cuánto hemos gastado en junio?', TODAY) as { kind: 'query'; query: FinanceQuery }).query
    const spentAnswer = answerFinanceQuery(spentQuery, data(), TODAY)
    expect(spentAnswer.text).toContain('3.819,66 €')

    // Simula pepa/finance.ts: sin periodo propio y empezando por "y", se hereda el periodo anterior.
    const devolvieronParsed = parseFinanceQuestion('¿Y cuánto nos devolvieron?', TODAY)
    expect(devolvieronParsed).toMatchObject({ kind: 'query', query: { metric: 'refunds', period: null } })
    const devolvieronQuery = { ...(devolvieronParsed as { kind: 'query'; query: FinanceQuery }).query, period: spentAnswer.query.period }
    const devolvieronAnswer = answerFinanceQuery(devolvieronQuery, data(), TODAY)
    expect(devolvieronAnswer.text).toContain('46,94 €')

    const cualesQuery = parseFinanceFollowUp('¿Cuáles fueron?', devolvieronAnswer.query, TODAY)
    expect(cualesQuery).toMatchObject({ metric: 'refunds', detail: 'full' })
    const cualesAnswer = answerFinanceQuery(cualesQuery as FinanceQuery, data(), TODAY)
    expect(cualesAnswer.text).toContain('Farmacia Vieitez')
    expect(cualesAnswer.text).toContain('C A Mode')
  })
})

describe('11. financeAnalysis: refunds/expenses.net sin romper expenses.total (bruto)', () => {
  it('buildAnalysis expone refunds.total y expenses.total sigue siendo el bruto', () => {
    const period = resolvePeriod({ t: 'month_named', month0: 5, year: 2026 }, TODAY, 1)
    const a = buildAnalysis(data(), period, TODAY)
    expect(a.refunds.total).toBe(46.94)
    expect(a.expenses.total).toBe(3866.6) // bruto: sigue sin descontar devoluciones
  })
})

describe('18. sin devoluciones: respuesta natural, sin explicaciones de más', () => {
  it('agosto: una frase corta, sin tabla vacía', () => {
    expect(ask('¿Qué devoluciones tuvimos en agosto?')).toBe('No hubo devoluciones registradas en agosto.')
  })
})

describe('formatEuros de apoyo (sanity check del propio fixture)', () => {
  it('46,94 € se formatea como en el resto de Economía', () => {
    expect(formatEuros(46.94)).toBe('46,94 €')
  })
})
