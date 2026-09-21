import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/bank', () => ({ listBankConnections: vi.fn() }))
vi.mock('@/data/family', () => ({ getFinanceMonthStartDay: vi.fn(), listFamilyMembers: vi.fn() }))
vi.mock('@/data/finance', () => ({ listBudgetCategories: vi.fn(), listExpenses: vi.fn() }))
vi.mock('@/data/products', () => ({ listAllProductPrices: vi.fn(), listProducts: vi.fn() }))
vi.mock('@/data/receipts', () => ({ listReceipts: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn() }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import type { AiAnalyzer } from '@/domain/financeAnswer'
import type { AnalysisFact } from '@/domain/financeAnalysis'
import { TODAY, SUPER, exp, financeData } from '@/domain/financeTestData'
import { FINANCE_WRITE_REFUSED, financeContextQuery, forgetFinanceContext, handleFinanceText, type FinanceDeps } from '@/pepa/finance'
import { runTalk, type TalkDeps } from '@/pepa/talk'

const GOOD_AI = {
  summary: '{{period.label}} lleváis {{expenses.total}} de gasto, {{expenses.difference}} frente a {{baseline.label}}.',
  findings: [{ type: 'category_change', title: '{{cat.1.name}} destaca', explanation: '{{cat.1.name}} suma {{cat.1.amount}} y parece explicar buena parte del cambio.', evidence: ['cat.1.amount'] }],
  suggestions: ['Podríais revisar {{cat.1.name}} si queréis ver dónde hay margen.'],
}

function makeDeps(over: Partial<FinanceDeps> = {}) {
  const record = vi.fn()
  const ai = vi.fn<AiAnalyzer>().mockResolvedValue(GOOD_AI as never)
  const deps: FinanceDeps = { canAccess: vi.fn().mockResolvedValue(true), load: vi.fn().mockResolvedValue(financeData()), ai, record, ...over }
  return { deps, record, ai }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
  forgetFinanceContext()
})
afterEach(() => vi.useRealTimers())

describe('análisis abierto: la IA redacta, el código pone las cifras', () => {
  it('"Analiza nuestros gastos de este mes" usa la IA con hechos agregados y compone con cifras reales', async () => {
    const { deps, ai, record } = makeDeps()
    const out = await handleFinanceText('Analiza nuestros gastos de este mes.', TODAY, deps)
    expect(out).toContain('Este mes lleváis 280,00 € de gasto, +130,00 € frente al mismo tramo del mes anterior.')
    expect(out).toContain('Podríais revisar Alimentación')
    expect(ai).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith('finance.analyze', true)
    const [focus, facts] = ai.mock.calls[0] as [string, AnalysisFact[]]
    expect(focus).toBe('overview')
    const sent = JSON.stringify(facts)
    for (const secret of ['SECRETO', 'ES76', 'MERCADONA', 'Mercadona', 'Aldi', 'Queso', '2026-09-03']) expect(sent).not.toContain(secret)
  })

  it('sin IA (apagada, sin cupo, respuesta no válida...) contesta el mismo análisis por código', async () => {
    const { deps, record } = makeDeps({ ai: vi.fn().mockResolvedValue(null) })
    const out = await handleFinanceText('Dame tus conclusiones de Economía.', TODAY, deps)
    expect(out).toContain('280,00 € de gasto registrado')
    expect(record).toHaveBeenCalledWith('finance.analyze', false)
  })

  it('si la llamada a la IA falla, PEPA sigue respondiendo', async () => {
    const { deps } = makeDeps({ ai: vi.fn().mockRejectedValue(new Error('sin red')) })
    expect(await handleFinanceText('¿Qué está pasando con nuestros gastos?', TODAY, deps)).toContain('280,00 €')
  })

  it('los avisos sobre los datos los pone SIEMPRE el código, aunque la IA no los mencione', async () => {
    const { deps } = makeDeps({ load: vi.fn().mockResolvedValue(financeData({ bankStale: true })) })
    expect(await handleFinanceText('Analiza nuestros gastos de este mes.', TODAY, deps)).toContain('conexión bancaria caducada')
  })

  it('el foco pedido llega a la IA', async () => {
    const { deps, ai } = makeDeps()
    await handleFinanceText('Explícame nuestra economía de este mes.', TODAY, deps)
    await handleFinanceText('Dame tus conclusiones de Economía.', TODAY, deps)
    expect(ai.mock.calls.map((c) => c[0])).toEqual(['explain', 'conclusions'])
  })
})

describe('lo que se resuelve SIN IA', () => {
  const NO_AI = [
    '¿En qué se nos está yendo el dinero?',
    '¿Dónde estamos gastando demasiado?',
    '¿Qué gastos podríamos recortar?',
    '¿Hay algún gasto que te llame la atención?',
    '¿Qué ha cambiado respecto al mes pasado?',
    '¿Estamos ahorrando más o menos?',
    '¿Qué podríamos hacer para ahorrar un poco más?',
    '¿Qué categoría ha aumentado más?',
    '¿Cuánto hemos gastado este mes?',
    '¿Por qué hemos gastado más este mes?',
    '¿Qué productos han subido más de precio?',
  ]
  it('ninguna de estas llama a la IA y todas quedan contadas como "reglas"', async () => {
    const { deps, ai, record } = makeDeps()
    for (const q of NO_AI) expect(await handleFinanceText(q, TODAY, deps), q).not.toBeNull()
    expect(ai).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalledTimes(NO_AI.length)
    for (const [, usedAi] of record.mock.calls) expect(usedAi).toBe(false)
  })

  it('las respuestas no juzgan: "¿dónde gastamos demasiado?" se contesta con hechos', async () => {
    const { deps } = makeDeps()
    const out = (await handleFinanceText('¿Dónde estamos gastando demasiado?', TODAY, deps)) as string
    expect(out).toContain('Alimentación')
    expect(out).not.toMatch(/demasiado/i)
  })

  it('porcentaje sin IA en una sesión mixta', async () => {
    const { deps, record } = makeDeps()
    for (const q of [...NO_AI, 'Analiza nuestros gastos de este mes.']) await handleFinanceText(q, TODAY, deps)
    const calls = record.mock.calls as [string, boolean][]
    const withoutAi = calls.filter(([, ai]) => !ai).length
    expect(Math.round((withoutAi / calls.length) * 100)).toBe(92) // 11 de 12
  })
})

describe('contexto corto entre análisis', () => {
  it('análisis -> "¿Qué podríamos recortar?" -> "¿Por qué?" -> "¿Y comparado con agosto?" -> "¿Y solo alimentación?" -> "Explícamelo más sencillo"', async () => {
    const { deps } = makeDeps()
    await handleFinanceText('Analiza nuestros gastos del mes pasado.', TODAY, deps)
    expect(financeContextQuery()).toMatchObject({ metric: 'analyze', period: { t: 'month', offset: -1 } })

    // Otra pregunta de análisis sin periodo: mantiene el del análisis anterior.
    const cuts = (await handleFinanceText('¿Qué podríamos recortar?', TODAY, deps)) as string
    expect(cuts).toContain('el mes pasado')
    expect(financeContextQuery()).toMatchObject({ metric: 'cuts', period: { t: 'month', offset: -1 } })

    const why = (await handleFinanceText('¿Por qué?', TODAY, deps)) as string
    expect(why).toBeTruthy()
    expect(financeContextQuery()).toMatchObject({ metric: 'why_changed' })

    await handleFinanceText('Analiza nuestros gastos de este mes.', TODAY, deps)
    const vs = (await handleFinanceText('¿Y comparado con agosto?', TODAY, deps)) as string
    expect(vs).toContain('agosto')
    expect(financeContextQuery()).toMatchObject({ metric: 'analyze', baseline: { t: 'month_named', month0: 7 }, period: { t: 'month', offset: 0 } })

    const food = (await handleFinanceText('¿Y solo alimentación?', TODAY, deps)) as string
    expect(food).toContain('en Alimentación')
    expect(financeContextQuery()).toMatchObject({ metric: 'category_focus', target: 'Alimentación' })

    const simple = (await handleFinanceText('Explícamelo más sencillo', TODAY, deps)) as string
    expect(simple).toContain('En sencillo')
    // Reformular no cambia de tema: el contexto sigue siendo el anterior.
    expect(financeContextQuery()).toMatchObject({ metric: 'category_focus' })
  })

  it('las continuaciones solo existen con contexto vivo', async () => {
    const { deps } = makeDeps()
    for (const t of ['¿Por qué?', '¿Y comparado con agosto?', 'Explícamelo más sencillo', '¿Y solo alimentación?']) expect(await handleFinanceText(t, TODAY, deps), t).toBeNull()
  })

  it('el contexto no guarda datos, solo la consulta estructurada', async () => {
    const { deps } = makeDeps()
    await handleFinanceText('Analiza nuestros gastos de este mes.', TODAY, deps)
    expect(JSON.stringify(financeContextQuery())).not.toMatch(/€|Mercadona|SECRETO/)
  })
})

describe('corrección de premisas', () => {
  it('"¿Por qué estamos ahorrando menos?" cuando ahorráis más: lo corrige', async () => {
    const expenses = [exp('2026-09-02', 100, SUPER), exp('2026-09-01', 2000, 'Sueldo', { isIncome: true }), exp('2026-08-02', 400, SUPER), exp('2026-08-01', 2000, 'Sueldo', { isIncome: true })]
    const { deps, ai } = makeDeps({ load: vi.fn().mockResolvedValue(financeData({ expenses })) })
    const out = (await handleFinanceText('¿Por qué estamos ahorrando menos?', TODAY, deps)) as string
    expect(out).toContain('En realidad estáis ahorrando más, no menos')
    expect(ai).not.toHaveBeenCalled()
  })

  it('"¿Por qué hemos gastado más?" cuando se gasta menos: lo corrige (fase 1 intacta)', async () => {
    const expenses = [exp('2026-09-02', 50, SUPER), exp('2026-08-02', 200, SUPER)]
    const { deps } = makeDeps({ load: vi.fn().mockResolvedValue(financeData({ expenses })) })
    expect(await handleFinanceText('¿Por qué hemos gastado más este mes?', TODAY, deps)).toContain('En realidad este mes lleváis')
  })
})

describe('Economía sigue siendo SOLO lectura', () => {
  it('ninguna de estas órdenes lee datos, llama a la IA ni escribe nada', async () => {
    const { deps, ai, record } = makeDeps()
    for (const t of ['Borra los gastos que no necesito.', 'Reduce mi presupuesto de comida.', 'Cambia todos los restaurantes a ocio.', 'Transfiere 500 € a ahorro.']) {
      expect(await handleFinanceText(t, TODAY, deps), t).toBe(FINANCE_WRITE_REFUSED)
    }
    expect(deps.load).not.toHaveBeenCalled()
    expect(ai).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })

  it('sin histórico de tickets: "¿han subido los precios de la compra?" lo reconoce', async () => {
    const { deps } = makeDeps({ load: vi.fn().mockResolvedValue(financeData({ prices: [] })) })
    expect(await handleFinanceText('¿Han subido los precios de la compra?', TODAY, deps)).toContain('No tengo suficientes compras registradas')
  })

  it('los perfiles sin acceso a Dinero no reciben análisis', async () => {
    const { deps, ai } = makeDeps({ canAccess: vi.fn().mockResolvedValue(false) })
    expect(await handleFinanceText('Analiza nuestros gastos de este mes.', TODAY, deps)).toBe('Economía no está disponible para tu perfil.')
    expect(ai).not.toHaveBeenCalled()
  })
})

describe('integración en Hablar con PEPA', () => {
  function talkDeps(finance: NonNullable<TalkDeps['finance']>): TalkDeps {
    return {
      today: () => TODAY,
      kitchen: vi.fn().mockResolvedValue(null),
      storeNames: vi.fn().mockResolvedValue(['Mercadona']),
      members: vi.fn().mockResolvedValue([]),
      answerCalendar: vi.fn().mockResolvedValue('Hoy no tienes nada.'),
      answerShopping: vi.fn().mockResolvedValue('En la lista: leche.'),
      classifyWithAi: vi.fn().mockResolvedValue({ intent: 'none', explicitDate: null, when: 'today', memberHint: null, storeHint: null, nowOnly: false }),
      answerFromAi: vi.fn().mockResolvedValue('Respuesta de la IA.'),
      splitWithAi: vi.fn().mockRejectedValue(new Error('sin IA')),
      finance,
      forgetFinance: forgetFinanceContext,
    }
  }

  it('las preguntas de análisis van a Economía antes que a Cocina, Compras o Calendario', async () => {
    const { deps } = makeDeps()
    const t = talkDeps((text) => handleFinanceText(text, TODAY, deps))
    for (const q of ['¿En qué se nos está yendo el dinero?', '¿Qué está pasando con nuestros gastos?', '¿Qué gastos podríamos recortar?']) {
      const out = await runTalk(q, t)
      expect(out.kind, q).toBe('answer')
    }
    expect(t.kitchen).not.toHaveBeenCalled()
    expect(t.answerShopping).not.toHaveBeenCalled()
    expect(t.classifyWithAi).not.toHaveBeenCalled()
  })

  it('otras tareas siguen su camino y olvidan el contexto de análisis', async () => {
    const { deps } = makeDeps()
    const t = talkDeps((text) => handleFinanceText(text, TODAY, deps))
    await runTalk('Analiza nuestros gastos de este mes.', t)
    expect(await runTalk('¿qué tengo mañana?', t)).toEqual({ kind: 'answer', text: 'Hoy no tienes nada.' })
    expect(financeContextQuery()).toBeNull()
  })
})

describe('"¿Y comparado con agosto?" también cambia la referencia de "¿por qué?"', () => {
  it('explica el cambio contra el periodo elegido', async () => {
    const { deps } = makeDeps()
    await handleFinanceText('¿Por qué hemos gastado más este mes?', TODAY, deps)
    const vs = (await handleFinanceText('¿Y comparado con agosto?', TODAY, deps)) as string
    expect(vs).toContain('que en agosto')
    expect(financeContextQuery()).toMatchObject({ metric: 'why_changed', baseline: { t: 'month_named', month0: 7 } })
  })
})
