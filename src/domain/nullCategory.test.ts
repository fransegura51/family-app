import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { budgetSpent, isComprasFamiliaCategory, isFoodCategory, isInternalTransferCategory, resolveCategoryClassification, resolveExpenseFixed } from './finance'
import { analysisFacts, attentionFindings, buildAnalysis, categoryFocusFindings, cutsFindings, overviewFindings, whereMoneyFindings } from './financeAnalysis'
import { answerFinanceQuery, categoryParentName, conceptMatches, groupSpending, isUnderCategory, resolveTarget, spendingRows, totalSpending } from './financeCompute'
import { parseFinanceQuestion } from './financeQuery'
import { resolvePeriod } from './financePeriod'
import { CATEGORIES, SUPER, TODAY, exp, financeData } from './financeTestData'
import { buildFoodReceiptIds } from './products'
import type { Budget, Expense, Receipt } from './types'

// FASE 6C.2A — category = NULL («Pendiente de clasificar») es un valor que el código YA sabe recibir, aunque nada lo produzca todavía.
// Un gasto pendiente sigue siendo un gasto real: cuenta en los totales; solo no se atribuye a ninguna categoría.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

const PENDING = (amount: number, extra: Partial<Expense> = {}) => exp('2026-09-15', amount, SUPER, { category: null, ...extra })
const thisMonth = () => resolvePeriod({ t: 'month', offset: 0 }, TODAY, 1)
const ask = (text: string, d = financeData()) => {
  const p = parseFinanceQuestion(text, TODAY)
  if (!p || p.kind !== 'query') throw new Error(`no es consulta: ${text}`)
  return answerFinanceQuery(p.query, d, TODAY).text
}

describe('helpers de categoría: NULL no lanza y no pertenece a ninguna categoría', () => {
  it('ninguna categoría (ni Alimentación, ni Compras y familia, ni Movimientos internos) contiene un pendiente', () => {
    expect(isFoodCategory(null, CATEGORIES)).toBe(false)
    expect(isComprasFamiliaCategory(null, CATEGORIES)).toBe(false)
    expect(isInternalTransferCategory(null, CATEGORIES)).toBe(false)
    expect(categoryParentName(null, CATEGORIES)).toBeNull()
    expect(isUnderCategory(null, 'Alimentación', CATEGORIES)).toBe(false)
    expect(resolveCategoryClassification(null, CATEGORIES)).toEqual({ necessity: null, isFixed: null })
    expect(resolveExpenseFixed({ category: null, isFixedOverride: null }, CATEGORIES)).toBeNull()
  })

  it('un ticket sin categoría no cuenta como «de alimentación» ni revienta buildFoodReceiptIds', () => {
    const receipts = [{ id: 'r1', category: null }, { id: 'r2', category: 'Alimentación' }] as Pick<Receipt, 'id' | 'category'>[]
    expect([...buildFoodReceiptIds(receipts, CATEGORIES)]).toEqual(['r2'])
  })
})

describe('5. conceptMatches y las consultas de PEPA no crashean con NULL', () => {
  it('conceptMatches con category NULL: sin excepción (usa comercio y notas)', () => {
    const e = PENDING(40, { store: 'GASOLINERA GALP', notes: null })
    expect(() => conceptMatches(e, ['gasolinera'])).not.toThrow()
    expect(conceptMatches(e, ['gasolinera'])).toBe(true)
    expect(conceptMatches(PENDING(40, { store: null, notes: null }), ['luz'])).toBe(false)
  })

  it('«¿cuánto he gastado en luz?» con un gasto pendiente en los datos NO falla (antes: TypeError → «no he podido consultar»)', () => {
    const d = financeData({ expenses: [PENDING(50), ...financeData().expenses] })
    expect(() => resolveTarget('luz', d)).not.toThrow()
    expect(() => ask('¿Cuánto hemos gastado en luz este mes?', d)).not.toThrow()
  })

  it('un gasto pendiente que habla del concepto por sus notas sí se encuentra', () => {
    const d = financeData({ expenses: [PENDING(50, { store: null, notes: 'recibo de la luz' })] })
    expect(resolveTarget('luz', d)).toMatchObject({ kind: 'concept' })
  })
})

describe('A/K. un gasto pendiente SIGUE SIENDO GASTO: cuenta en los totales', () => {
  it('el total gastado del mes incluye el pendiente (280 + 100 = 380)', () => {
    const base = financeData()
    const d = financeData({ expenses: [PENDING(100), ...base.expenses] })
    expect(totalSpending(d, '2026-09-01', '2026-09-20')).toBe(totalSpending(base, '2026-09-01', '2026-09-20') + 100)
    expect(spendingRows(d, '2026-09-01', '2026-09-20').some((e) => e.category === null)).toBe(true)
    expect(totalSpending(base, '2026-09-01', '2026-09-20')).toBe(280)
    expect(ask('¿Cuánto hemos gastado este mes?', d)).toContain('380')
  })

  it('no se atribuye a ninguna categoría: fuera de «Alimentación» y de cualquier filtro de categoría', () => {
    const base = financeData()
    const d = financeData({ expenses: [PENDING(100), ...base.expenses] })
    expect(totalSpending(d, '2026-09-01', '2026-09-20', { category: 'Alimentación' })).toBe(totalSpending(base, '2026-09-01', '2026-09-20', { category: 'Alimentación' }))
  })
})

describe('B. un pendiente nunca aparece como una categoría («null», «Otros»…)', () => {
  it('groupSpending no genera ningún grupo con nombre null', () => {
    const rows = [PENDING(100), exp('2026-09-03', 60, SUPER)]
    const groups = groupSpending(rows, financeData())
    expect(groups.map((g) => g.name)).toEqual(['Alimentación'])
    expect(groups.some((g) => (g.name as unknown) === null)).toBe(false)
  })

  it('«¿en qué hemos gastado?» no dice «null» ni «Otros»', () => {
    const d = financeData({ expenses: [PENDING(100), ...financeData().expenses] })
    const t = ask('¿En qué hemos gastado este mes?', d)
    expect(t).not.toMatch(/\bnull\b|undefined|Otros/i)
  })

  it('el análisis (financeAnalysis) no atribuye el pendiente a una categoría ni escribe «null»', () => {
    const d = financeData({ expenses: [PENDING(300), ...financeData().expenses] })
    const a = buildAnalysis(d, thisMonth(), TODAY)
    expect(a.categories.every((c) => typeof c.name === 'string')).toBe(true)
    expect(a.leaf.every((c) => typeof c.name === 'string')).toBe(true)
    expect(a.newCategories.every((c) => typeof c === 'string')).toBe(true)
    // el gasto total SÍ lo incluye
    expect(a.expenses.total).toBeGreaterThan(buildAnalysis(financeData(), thisMonth(), TODAY).expenses.total)
    const texts = [...overviewFindings(a), ...whereMoneyFindings(a), ...attentionFindings(a), ...cutsFindings(a), ...categoryFocusFindings(a, 'Alimentación', d)].map((f) => f.text).join('\n')
    expect(texts).not.toMatch(/\bnull\b|undefined/)
    // los hechos que van a la IA no llevan un nombre de categoría vacío
    expect(analysisFacts(a).filter((f) => f.ref.endsWith('.name')).every((f) => typeof f.value === 'string' && f.value.length > 0)).toBe(true)
  })

  it('el gasto individual más alto, si es un pendiente, no se atribuye a ninguna categoría', () => {
    const d = financeData({ expenses: [PENDING(900)] })
    const a = buildAnalysis(d, thisMonth(), TODAY)
    expect(a.biggestExpense).toMatchObject({ amount: 900, category: null })
    expect(overviewFindings(a).map((f) => f.text).join('\n')).not.toMatch(/\bnull\b/)
  })
})

describe('C/D/E. presupuestos: el General SÍ cuenta el pendiente; categoría concreta y Alimentación NO', () => {
  const budget = (over: Partial<Budget>): Budget =>
    ({ id: 'b', familyId: 'f', periodType: 'mensual', periodStart: '2026-09-01', category: null, amount: 1000, budgetGroup: 'generales', ownerMemberId: null, ...over }) as Budget

  it('un presupuesto de categoría concreta no consume el pendiente', () => {
    const base = financeData()
    const withPending = [PENDING(100), ...base.expenses]
    const b = budget({ category: 'Alimentación' })
    expect(budgetSpent(b, withPending, { categories: CATEGORIES })).toBe(budgetSpent(b, base.expenses, { categories: CATEGORIES }))
  })

  it('el presupuesto Alimentación no lo cuenta', () => {
    const base = financeData()
    const b = budget({ budgetGroup: 'alimentacion' })
    expect(budgetSpent(b, [PENDING(100), ...base.expenses], { categories: CATEGORIES })).toBe(budgetSpent(b, base.expenses, { categories: CATEGORIES }))
  })

  it('el presupuesto General SÍ cuenta el gasto pendiente (es gasto real)', () => {
    const base = financeData()
    const b = budget({})
    expect(budgetSpent(b, [PENDING(100), ...base.expenses], { categories: CATEGORIES })).toBe(budgetSpent(b, base.expenses, { categories: CATEGORIES }) + 100)
  })

  it('las exclusiones existentes del General se conservan: un pendiente que además es ingreso, previsto o fuera del periodo NO cuenta', () => {
    const base = financeData()
    const b = budget({})
    const ref = budgetSpent(b, base.expenses, { categories: CATEGORIES })
    expect(budgetSpent(b, [PENDING(100, { isIncome: true }), ...base.expenses], { categories: CATEGORIES })).toBe(ref)
    expect(budgetSpent(b, [PENDING(100, { kind: 'previsto' }), ...base.expenses], { categories: CATEGORIES })).toBe(ref)
    expect(budgetSpent(b, [PENDING(100, { expenseDate: '2026-07-15' }), ...base.expenses], { categories: CATEGORIES })).toBe(ref)
  })
})
