import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/bank', () => ({ listBankConnections: vi.fn() }))
vi.mock('@/data/family', () => ({ getFinanceMonthStartDay: vi.fn(), listFamilyMembers: vi.fn() }))
vi.mock('@/data/finance', () => ({ listBudgetCategories: vi.fn(), listExpenses: vi.fn() }))
vi.mock('@/data/products', () => ({ listAllProductPrices: vi.fn(), listProducts: vi.fn() }))
vi.mock('@/data/receipts', () => ({ listReceipts: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn() }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const callAiFunction = vi.fn()
const aliasize = vi.fn((s: string) => s.replace('Eric', 'Persona A'))
vi.mock('@/services/aiClient', () => ({
  callAiFunction: (...args: unknown[]) => callAiFunction(...args),
  loadAliasMap: vi.fn(async () => ({ aliasize, restore: (s: string) => s.replace('Persona A', 'Eric') })),
}))

import { queryFromIntent } from '@/domain/financeIntent'
import { CATEGORIES, EXPENSES, TODAY, cat, exp, financeData } from '@/domain/financeTestData'
import { stripWakeWord } from '@/domain/voiceQuery'
import { FINANCE_NOT_UNDERSTOOD, financeContextQuery, forgetFinanceContext, handleFinanceText, type FinanceDeps } from '@/pepa/finance'
import { classifyFinanceIntent } from '@/services/financeIntent'
import { readIntentRequest, validateIntentOutput, type IntentOutput } from '../../supabase/functions/_shared/ai/purposes/financeIntentCore.ts'
import { financeIntentSpec } from '../../supabase/functions/_shared/ai/purposes/financeIntent.ts'

const LUZ_DATA = financeData({
  categories: [...CATEGORIES, cat('l1', 'Luz', 'c5', { necessity: 'debo', isFixed: true })],
  expenses: [...EXPENSES, exp('2026-08-12', 62.4, 'Luz'), exp('2026-09-10', 70.25, 'Luz')],
})

function intent(over: Partial<IntentOutput> = {}): IntentOutput {
  return { intent: 'finance_spend_query', period: 'last_month', month: null, year: null, filterType: 'concept', filter: 'luz', premise: null, ...over }
}

function makeDeps(over: Partial<FinanceDeps> = {}) {
  const record = vi.fn()
  const interpret = vi.fn().mockResolvedValue(intent())
  const ai = vi.fn().mockResolvedValue(null)
  const deps: FinanceDeps = { canAccess: vi.fn().mockResolvedValue(true), load: vi.fn().mockResolvedValue(LUZ_DATA), ai, interpret, record, ...over }
  return { deps, record, interpret, ai }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
  forgetFinanceContext()
  callAiFunction.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('REGLAS PRIMERO: lo que se entiende no llama a la IA', () => {
  it('las dos frases reales del móvil se resuelven solo con reglas', async () => {
    const { deps, interpret, ai, record } = makeDeps()
    const luz = await handleFinanceText(stripWakeWord('Dime lo que gasté el mes pasado en luz.'), TODAY, deps)
    expect(luz).toBe('El mes pasado habéis gastado 62,40 € en Luz.')
    const analiza = await handleFinanceText(stripWakeWord('Pepa, analiza nuestros gastos de este mes.'), TODAY, deps)
    expect(analiza).toContain('Este mes')
    expect(analiza).toContain('Si quieres las cifras, dímelo.')
    expect(analiza).not.toContain('No encuentro')
    expect(interpret).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledWith('finance.spent', false)
    expect(ai).toHaveBeenCalledTimes(1) // solo el análisis abierto puede redactar con IA
  })
})

describe('cuando las reglas no ubican la frase, la IA ESTRUCTURA (no calcula)', () => {
  it('frase económica sin señales: la IA estructura y el código responde con SUS cifras', async () => {
    const { deps, interpret, record } = makeDeps()
    const out = await handleFinanceText('¿Cuánto se nos fue en economía doméstica la luz del mes pasado?', TODAY, deps)
    expect(interpret).toHaveBeenCalledTimes(1)
    expect(out).toBe('El mes pasado habéis gastado 62,40 € en Luz.')
    // Cuenta como respuesta con IA (interpretación), aunque el cálculo sea del código.
    expect(record).toHaveBeenCalledWith('finance.spent', true)
  })

  it('la IA solo recibe la frase y la fecha', async () => {
    callAiFunction.mockResolvedValue({ intent: 'finance_spend_query', period: 'last_month', month: null, year: null, filterType: 'concept', filter: 'luz', premise: null })
    const out = await classifyFinanceIntent('¿Cuánto se nos fue en economía doméstica la luz de Eric el mes pasado?', TODAY)
    expect(out).toMatchObject({ intent: 'finance_spend_query', filter: 'luz' })
    const [name, body] = callAiFunction.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('finance-intent')
    expect(Object.keys(body).sort()).toEqual(['text', 'today'])
    expect(body.text).toContain('Persona A')
    expect(body.text).not.toContain('Eric')
    expect(body.today).toBe('2026-09-20')
    // Ningún dato financiero: ni importes, ni categorías, ni tiendas.
    expect(JSON.stringify(body)).not.toMatch(/€|Mercadona|Aldi|Alimentación|SECRETO|ES76/)
  })

  it('si la IA dice que no es de economía, la frase sigue su camino (null)', async () => {
    const { deps } = makeDeps({ interpret: vi.fn().mockResolvedValue(intent({ intent: 'none', period: null, filterType: null, filter: null })) })
    expect(await handleFinanceText('¿Cuánto se nos fue en economía doméstica?', TODAY, deps)).toBeNull()
  })

  it('sin IA (apagada, sin cupo, sin red): se dice, sin adivinar', async () => {
    const { deps } = makeDeps({ interpret: vi.fn().mockResolvedValue(null) })
    expect(await handleFinanceText('¿Cuánto se nos fue en economía doméstica la luz?', TODAY, deps)).toBe(FINANCE_NOT_UNDERSTOOD)
  })

  it('una frase con demasiadas palabras sueltas también pasa por la IA en vez de adivinar un filtro', async () => {
    const interpret = vi.fn().mockResolvedValue(intent({ intent: 'finance_spend_query', period: 'last_month', filterType: null, filter: null }))
    const { deps } = makeDeps({ interpret })
    const out = await handleFinanceText('Cuánto gastamos el mes pasado en la cosa aquella tan rara de la que hablamos con la abuela ayer por la tarde', TODAY, deps)
    expect(interpret).toHaveBeenCalledTimes(1)
    expect(out).toContain('El mes pasado habéis gastado')
    expect(out).not.toContain('No encuentro')
  })

  it('el filtro que devuelve la IA se valida contra los datos REALES: si no existe, se dice', async () => {
    const { deps } = makeDeps({ interpret: vi.fn().mockResolvedValue(intent({ filter: 'gasolina' })) })
    const out = await handleFinanceText('¿Cuánto se nos fue en economía doméstica en gasolina el mes pasado?', TODAY, deps)
    expect(out).toBe('No encuentro ninguna categoría, tienda ni concepto llamado «gasolina» en tus datos, así que no lo calculo.')
  })

  it('los perfiles sin acceso a Dinero no llegan a la IA', async () => {
    const { deps, interpret } = makeDeps({ canAccess: vi.fn().mockResolvedValue(false) })
    expect(await handleFinanceText('¿Cuánto se nos fue en economía doméstica la luz?', TODAY, deps)).toBe('Economía no está disponible para tu perfil.')
    expect(interpret).not.toHaveBeenCalled()
  })

  it('el contexto queda con la consulta ya resuelta (para "¿y el mes anterior?")', async () => {
    const { deps } = makeDeps()
    await handleFinanceText('¿Cuánto se nos fue en economía doméstica la luz del mes pasado?', TODAY, deps)
    expect(financeContextQuery()).toMatchObject({ metric: 'spent', period: { t: 'month', offset: -1 }, target: 'Luz' })
  })
})

describe('la respuesta de la IA se valida (listas cerradas y filtro dicho por la persona)', () => {
  const said = '¿Cuánto se nos fue en economía doméstica la luz el mes pasado?'
  it('una respuesta correcta se acepta', () => {
    expect(validateIntentOutput(intent(), said)).toEqual(intent())
  })
  it('un filtro que la persona NO ha dicho se rechaza (la IA no inventa categorías, tiendas ni conceptos)', () => {
    expect(validateIntentOutput(intent({ filter: 'gasolina' }), said)).toBeNull()
    expect(validateIntentOutput(intent({ filter: 'Mercadona', filterType: 'store' }), said)).toBeNull()
  })
  it('valores fuera de las listas cerradas se rechazan', () => {
    expect(validateIntentOutput({ ...intent(), intent: 'borrar_gastos' }, said)).toBeNull()
    expect(validateIntentOutput({ ...intent(), period: 'next_century' }, said)).toBeNull()
    expect(validateIntentOutput({ ...intent(), filterType: 'sql' }, said)).toBeNull()
    expect(validateIntentOutput({ ...intent(), month: 13, period: 'named_month' }, said)).toBeNull()
    expect(validateIntentOutput('texto', said)).toBeNull()
    expect(validateIntentOutput(null, said)).toBeNull()
  })
  it('no admite un filtro con símbolos ni sin tipo (o tipo sin filtro)', () => {
    expect(validateIntentOutput(intent({ filter: 'luz; drop table' }), 'luz; drop table')).toBeNull()
    expect(validateIntentOutput(intent({ filterType: null }), said)).toBeNull()
    expect(validateIntentOutput(intent({ filter: null }), said)).toBeNull()
  })
  it('un mes concreto necesita el mes', () => {
    expect(validateIntentOutput(intent({ period: 'named_month', month: null, filterType: null, filter: null }), said)).toBeNull()
    expect(validateIntentOutput(intent({ period: 'named_month', month: 8, year: 2026, filterType: null, filter: null }), said)).toMatchObject({ month: 8, year: 2026 })
  })
  it('la petición al servidor solo admite la frase y la fecha, y rechaza datos sensibles', () => {
    expect(readIntentRequest({ text: said, today: '2026-09-20' })).toMatchObject({ ok: true })
    for (const text of ['Cuánto gasté en ES7620770024003102575766 este mes', 'gastos de paco@example.com', 'mi cuenta 123456789012 gastos']) {
      expect(readIntentRequest({ text, today: '2026-09-20' }).ok, text).toBe(false)
    }
    expect(readIntentRequest({ text: said, today: 'ayer' }).ok).toBe(false)
    expect(readIntentRequest({ text: 'a', today: '2026-09-20' }).ok).toBe(false)
  })
  it('el prompt es un clasificador: sin datos financieros y con la frase entre comillas', () => {
    const read = financeIntentSpec.readInput({ text: said, today: '2026-09-20' })
    if (!read.ok) throw new Error('entrada')
    const prompt = financeIntentSpec.buildParts(read.input).map((p) => ('text' in p ? p.text : '')).join('')
    expect(prompt).toContain('NO respondes a la pregunta ni calculas nada')
    expect(prompt).toContain(`«${said}»`)
    expect(prompt).toContain('No inventes filtros')
    expect(financeIntentSpec.purpose).toBe('finance-intent')
    const bad = JSON.stringify({ intent: 'finance_spend_query', period: 'last_month', month: null, year: null, filterType: 'category', filter: 'gasolina', premise: null })
    expect(() => financeIntentSpec.parseOutput(bad, read.input)).toThrow()
  })
})

describe('de la estructura de la IA a la consulta', () => {
  it('cada intención y periodo se traducen a la misma consulta que las reglas', () => {
    expect(queryFromIntent(intent(), TODAY)).toMatchObject({ metric: 'spent', period: { t: 'month', offset: -1 }, target: 'luz' })
    expect(queryFromIntent(intent({ intent: 'finance_analysis', period: 'this_month', filterType: null, filter: null }), TODAY)).toMatchObject({ metric: 'analyze', period: { t: 'month', offset: 0 }, target: null, focus: 'overview' })
    expect(queryFromIntent(intent({ intent: 'finance_cheapest_store', period: null, filterType: 'product', filter: 'queso' }), TODAY)).toMatchObject({ metric: 'cheapest_store', product: 'queso', target: null })
    expect(queryFromIntent(intent({ intent: 'finance_savings_trend', premise: 'less', filterType: null, filter: null }), TODAY)).toMatchObject({ metric: 'savings_trend', premise: 'less' })
    expect(queryFromIntent(intent({ period: 'named_month', month: 8, year: null, filterType: null, filter: null }), TODAY)).toMatchObject({ period: { t: 'month_named', month0: 7, year: 2026 } })
    expect(queryFromIntent(intent({ period: 'named_month', month: 12, year: null, filterType: null, filter: null }), TODAY)).toMatchObject({ period: { t: 'month_named', month0: 11, year: 2025 } })
    expect(queryFromIntent(intent({ period: 'last_30_days', filterType: null, filter: null }), TODAY)).toMatchObject({ period: { t: 'last_days', n: 30 } })
  })
  it('none no genera consulta y un filtro no se cuela en preguntas que no lo usan', () => {
    expect(queryFromIntent(intent({ intent: 'none' }), TODAY)).toBeNull()
    expect(queryFromIntent(intent({ intent: 'finance_analysis' }), TODAY)?.target).toBeNull()
  })
})
