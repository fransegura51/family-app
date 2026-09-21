import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { budgetSpent } from './finance'
import { analysisFacts, buildAnalysis, cutsFindings, overviewFindings, pendingFindings, rankCutCandidates, whereMoneyFindings } from './financeAnalysis'
import { briefCuts, briefWhereMoney } from './financeBrief'
import { answerFinanceQuery, spendingBreakdown, spendingRows, sum, totalIncome, totalSpending } from './financeCompute'
import { parseFinanceQuestion } from './financeQuery'
import { resolvePeriod } from './financePeriod'
import { CATEGORIES, REST, SUPER, TODAY, exp, financeData } from './financeTestData'
import { isPendingCategory, isPendingExpense, isPendingRelevant, pendingSpending, PENDING_LABEL } from './pending'
import type { Budget, Expense } from './types'

// FASE 6C.2B — «Pendiente de clasificar» (category NULL) en el cálculo, los presupuestos, el análisis y las respuestas de PEPA.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

const PENDING = (amount: number, extra: Partial<Expense> = {}) => exp('2026-09-15', amount, SUPER, { category: null, ...extra })
const thisMonth = () => resolvePeriod({ t: 'month', offset: 0 }, TODAY, 1)
const query = (text: string) => {
  const p = parseFinanceQuestion(text, TODAY)
  if (!p || p.kind !== 'query') throw new Error(`no es consulta: ${text} → ${JSON.stringify(p)}`)
  return p.query
}
const ask = (text: string, d = financeData()) => answerFinanceQuery(query(text), d, TODAY).text
const withPending = (amount: number, extra: Partial<Expense> = {}) => financeData({ expenses: [PENDING(amount, extra), ...financeData().expenses] })

describe('helper central de pendientes (una sola definición de NULL)', () => {
  it('NULL es pendiente; cualquier categoría real (incluida «Otros») no', () => {
    expect(isPendingCategory(null)).toBe(true)
    expect(isPendingCategory(undefined)).toBe(true)
    expect(isPendingCategory('Otros')).toBe(false)
    expect(isPendingCategory('Alimentación')).toBe(false)
    expect(isPendingExpense(PENDING(5))).toBe(true)
  })

  it('pendingSpending suma y cuenta solo los NULL', () => {
    expect(pendingSpending([PENDING(10.5), PENDING(4.25), exp('2026-09-03', 60, SUPER)])).toEqual({ amount: 14.75, count: 2 })
    expect(pendingSpending([])).toEqual({ amount: 0, count: 0 })
  })

  it('«Pendiente de clasificar» es solo el texto con el que se muestra: no es el nombre de ninguna categoría', () => {
    expect(PENDING_LABEL).toBe('Pendiente de clasificar')
    expect(CATEGORIES.some((c) => c.name === PENDING_LABEL)).toBe(false)
  })

  it('relevancia proporcional: 2 € sobre 3.000 € no es relevante; 300 € sobre 3.000 € sí', () => {
    expect(isPendingRelevant({ amount: 2, count: 1 }, 3000)).toBe(false)
    expect(isPendingRelevant({ amount: 30, count: 1 }, 3000)).toBe(false) // supera el mínimo en euros pero pesa < 3 %
    expect(isPendingRelevant({ amount: 300, count: 4 }, 3000)).toBe(true)
    expect(isPendingRelevant({ amount: 0, count: 0 }, 3000)).toBe(false)
  })
})

describe('A/B. un pendiente es gasto real y nunca «Otros»', () => {
  it('A. cuenta en el gasto total, en la comparación mensual y en el ahorro; no toca los ingresos', () => {
    const base = financeData()
    const d = withPending(100)
    expect(totalSpending(d, '2026-09-01', '2026-09-20')).toBe(totalSpending(base, '2026-09-01', '2026-09-20') + 100)
    expect(totalIncome(d, '2026-09-01', '2026-09-20')).toBe(totalIncome(base, '2026-09-01', '2026-09-20'))
    expect(ask('¿Cuánto ahorramos este mes?', d)).toContain('gastos 380,00')
    // mes anterior con pendiente: entra en la comparación del mismo tramo
    const prev = financeData({ expenses: [PENDING(60, { expenseDate: '2026-08-10' }), ...financeData().expenses] })
    expect(ask('¿Cuánto hemos gastado este mes?', prev)).toContain('Son 70,00 € más que') // el pendiente de agosto entra en el tramo anterior: 280 - (150 + 60) = 70
  })

  it('B. no se atribuye a «Otros» ni a ninguna categoría: los repartos reales no cambian', () => {
    const rows = spendingRows(withPending(100), '2026-09-01', '2026-09-20')
    const { groups, pending } = spendingBreakdown(rows, withPending(100))
    expect(groups.map((g) => g.name)).not.toContain('Otros')
    expect(groups.every((g) => typeof g.name === 'string' && g.name.length > 0)).toBe(true)
    expect(pending).toEqual({ amount: 100, count: 1 })
  })
})

describe('F/G. spendingBreakdown separa lo pendiente y CUADRA con el gasto total', () => {
  it('categorías reales + pendiente = gasto total aplicable', () => {
    for (const amounts of [[100], [100, 33.33], [0.01, 250.5, 7]]) {
      const d = financeData({ expenses: [...amounts.map((a, i) => PENDING(a, { expenseDate: `2026-09-${String(10 + i).padStart(2, '0')}` })), ...financeData().expenses] })
      const rows = spendingRows(d, '2026-09-01', '2026-09-20')
      const { groups, pending } = spendingBreakdown(rows, d)
      const parts = groups.reduce((s, g) => s + g.amount, 0) + pending.amount
      expect(Math.round(parts * 100) / 100).toBe(sum(rows))
    }
  })

  it('con un filtro de categoría el pendiente no aparece (no pertenece a ninguna)', () => {
    const d = withPending(100)
    const rows = spendingRows(d, '2026-09-01', '2026-09-20', { category: 'Alimentación' })
    expect(spendingBreakdown(rows, d, 'Alimentación').pending.count).toBe(0)
  })
})

describe('H/I. PEPA: «¿cuánto hemos gastado?» y «¿en qué?»', () => {
  it('H. el total incluye el pendiente y lo aclara sin sacarlo del gasto', () => {
    const t = ask('¿Cuánto hemos gastado este mes?', withPending(245.3))
    expect(t).toContain('525,30 €')
    expect(t).toContain('De ese total, 245,30 € están pendientes de clasificar.')
  })

  it('H. sin pendientes la respuesta es la de siempre (sin aclaración)', () => {
    expect(ask('¿Cuánto hemos gastado este mes?')).not.toMatch(/pendiente/i)
  })

  it('I. «¿en qué?» no mete el pendiente en el ranking: lo informa aparte', () => {
    const t = ask('¿En qué hemos gastado este mes?', withPending(245.3))
    expect(t).toContain('Hay 245,30 € en 1 movimiento pendiente de clasificar')
    const ranking = t.split('\n').slice(1, -1).join('\n')
    expect(ranking).not.toMatch(/pendiente|null|undefined|Otros/i)
    expect(t).not.toMatch(/\bnull\b|undefined/)
  })

  it('I. con varios movimientos: plural', () => {
    const d = financeData({ expenses: [PENDING(10), PENDING(20, { expenseDate: '2026-09-16' }), ...financeData().expenses] })
    expect(ask('¿En qué hemos gastado?', d)).toContain('Hay 30,00 € en 2 movimientos pendientes de clasificar')
  })
})

describe('K. consulta de pendientes', () => {
  it.each([
    '¿Qué tengo pendiente de clasificar?',
    '¿Cuánto tengo sin clasificar?',
    '¿Hay gastos pendientes?',
    '¿Cuántos movimientos quedan por clasificar?',
  ])('«%s» → metric pending (no es una búsqueda contra categorías)', (q) => {
    expect(query(q).metric).toBe('pending')
    expect(query(q).target).toBeNull()
  })

  it('las preguntas de siempre no cambian de intención', () => {
    expect(query('¿Cuánto hemos gastado este mes?').metric).toBe('spent')
    expect(query('¿En qué hemos gastado?').metric).toBe('top_categories')
    expect(query('¿Dónde podemos ahorrar?').metric).toBe('cuts')
  })

  it('responde con category NULL: importe, nº de movimientos y peso; siguen contando en el total', () => {
    const t = ask('¿Qué tengo pendiente de clasificar?', withPending(245.3))
    expect(t).toContain('1 movimiento pendiente de clasificar')
    expect(t).toContain('245,30 €')
    expect(t).toContain('Siguen contando en el gasto total')
  })

  it('sin pendientes lo dice sin inventar nada', () => {
    expect(ask('¿Hay gastos pendientes?')).toBe('No tenéis gastos pendientes de clasificar.')
  })

  it('con periodo dicho solo cuenta ese; sin periodo, todos (un pendiente sigue pendiente aunque pase el mes)', () => {
    const d = financeData({ expenses: [PENDING(40, { expenseDate: '2026-07-10' }), ...financeData().expenses] })
    expect(ask('¿Qué tengo pendiente de clasificar?', d)).toContain('40,00 €')
    expect(ask('¿Qué tengo pendiente de clasificar este mes?', d)).toContain('No tenéis gastos pendientes de clasificar este mes')
  })

  it('no cuenta ingresos ni movimientos internos como pendientes', () => {
    const d = financeData({ expenses: [PENDING(500, { isIncome: true }), ...financeData().expenses] })
    expect(ask('¿Hay gastos pendientes?', d)).toBe('No tenéis gastos pendientes de clasificar.')
  })
})

describe('J/L/M. financeAnalysis: hechos aparte y nunca una categoría', () => {
  it('L. emite pending.amount / pending.count / pending.share solo si hay pendientes', () => {
    const none = analysisFacts(buildAnalysis(financeData(), thisMonth(), TODAY))
    expect(none.some((f) => f.ref.startsWith('pending.'))).toBe(false)
    const a = buildAnalysis(withPending(300), thisMonth(), TODAY)
    const f = Object.fromEntries(analysisFacts(a).map((x) => [x.ref, x.value]))
    expect(f['pending.amount']).toBe(300)
    expect(f['pending.count']).toBe(1)
    expect(f['pending.share']).toBeCloseTo((300 / 580) * 100, 1)
    expect(a.expenses.total).toBe(580) // el pendiente YA está en el total
  })

  it('M. nunca aparece cat.N.name null / vacío ni una categoría anónima', () => {
    const facts = analysisFacts(buildAnalysis(withPending(300), thisMonth(), TODAY))
    const names = facts.filter((x) => /^cat\.\d+\.name$/.test(x.ref))
    expect(names.length).toBeGreaterThan(0)
    expect(names.every((x) => typeof x.value === 'string' && x.value.length > 0 && x.value !== 'null')).toBe(true)
    // el número de categorías de los hechos = las reales (sin sumar una por el pendiente)
    expect(names.length).toBe(buildAnalysis(financeData(), thisMonth(), TODAY).categories.length)
  })

  it('J. «dónde ahorrar»: el pendiente NO es candidato ni cambia el ranking de categorías', () => {
    const base = buildAnalysis(financeData(), thisMonth(), TODAY)
    const a = buildAnalysis(withPending(900), thisMonth(), TODAY)
    expect(rankCutCandidates(a).map((l) => l.name)).toEqual(rankCutCandidates(base).map((l) => l.name))
    expect(a.leaf.map((l) => l.name)).toEqual(base.leaf.map((l) => l.name))
    expect(a.newCategories).toEqual(base.newCategories)
  })

  it('J. si el pendiente pesa, PEPA lo dice y avisa de que limita la precisión; si no pesa, no molesta', () => {
    const big = buildAnalysis(withPending(900), thisMonth(), TODAY)
    const t = [...cutsFindings(big), ...whereMoneyFindings(big), ...overviewFindings(big)].map((f) => f.text).join('\n')
    expect(t).toMatch(/900,00 € en 1 movimiento sin clasificar/)
    expect(t).toMatch(/menos preciso/)
    expect(briefCuts(big).text).toMatch(/sin clasificar/)
    expect(briefWhereMoney(big).text).toMatch(/sin clasificar/)
    const tiny = buildAnalysis(withPending(2), thisMonth(), TODAY)
    expect(pendingFindings(tiny)).toEqual([])
    expect([...cutsFindings(tiny), ...whereMoneyFindings(tiny)].map((f) => f.text).join('\n')).not.toMatch(/sin clasificar/)
    expect(briefCuts(tiny).text).not.toMatch(/sin clasificar/)
  })

  it('un pendiente jamás produce «null» o «undefined» en ningún texto del análisis', () => {
    const a = buildAnalysis(withPending(900), thisMonth(), TODAY)
    const all = [...overviewFindings(a), ...whereMoneyFindings(a), ...cutsFindings(a)].map((f) => f.text).join('\n') + briefCuts(a).text + briefWhereMoney(a).text
    expect(all).not.toMatch(/\bnull\b|undefined/)
  })
})

describe('C/D/E. presupuestos', () => {
  const budget = (over: Partial<Budget>): Budget =>
    ({ id: 'b', familyId: 'f', periodType: 'mensual', periodStart: '2026-09-01', category: null, amount: 1000, budgetGroup: 'generales', ownerMemberId: null, ...over }) as Budget
  const ctx = { categories: CATEGORIES }

  it('C. el General cuenta el pendiente', () => {
    const base = financeData().expenses
    expect(budgetSpent(budget({}), [PENDING(100), ...base], ctx)).toBe(budgetSpent(budget({}), base, ctx) + 100)
  })

  it('D. una categoría concreta (y una padre con sus hijas) NO lo consume', () => {
    const base = financeData().expenses
    for (const category of ['Alimentación', SUPER, REST, 'Transporte y vehículo']) {
      expect(budgetSpent(budget({ category }), [PENDING(100), ...base], ctx)).toBe(budgetSpent(budget({ category }), base, ctx))
    }
  })

  it('E. el presupuesto Alimentación NO lo consume', () => {
    const base = financeData().expenses
    expect(budgetSpent(budget({ budgetGroup: 'alimentacion' }), [PENDING(100), ...base], ctx)).toBe(budgetSpent(budget({ budgetGroup: 'alimentacion' }), base, ctx))
  })

  it('las exclusiones existentes del General se conservan (ingresos, previsto, fuera de periodo, movimientos internos)', () => {
    const base = financeData().expenses
    const ref = budgetSpent(budget({}), base, ctx)
    for (const extra of [{ isIncome: true }, { kind: 'previsto' as const }, { expenseDate: '2026-07-15' }]) {
      expect(budgetSpent(budget({}), [PENDING(100, extra), ...base], ctx)).toBe(ref)
    }
  })
})
