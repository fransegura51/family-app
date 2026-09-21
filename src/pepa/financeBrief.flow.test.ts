import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/bank', () => ({ listBankConnections: vi.fn() }))
vi.mock('@/data/family', () => ({ getFinanceMonthStartDay: vi.fn(), listFamilyMembers: vi.fn() }))
vi.mock('@/data/finance', () => ({ listBudgetCategories: vi.fn(), listExpenses: vi.fn() }))
vi.mock('@/data/products', () => ({ listAllProductPrices: vi.fn(), listProducts: vi.fn() }))
vi.mock('@/data/receipts', () => ({ listReceipts: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn() }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import type { AiAnalyzer } from '@/domain/financeAnswer'
import { CATEGORIES, EXPENSES, TODAY, cat, exp, financeData } from '@/domain/financeTestData'
import { financeContextQuery, forgetFinanceContext, handleFinanceText, type FinanceDeps } from '@/pepa/finance'

// Datos como los del móvil: Regalos y Cuidados personales son gasto variable y "quiero".
const DATA = financeData({
  categories: [
    ...CATEGORIES,
    cat('r1', 'Regalos', null, { necessity: 'quiero', isFixed: false }),
    cat('r2', 'Cuidados personales', null, { necessity: 'quiero', isFixed: false }),
  ],
  expenses: [
    ...EXPENSES,
    exp('2026-09-06', 150, 'Regalos'),
    exp('2026-08-06', 10, 'Regalos'),
    exp('2026-09-09', 120, 'Cuidados personales'),
    exp('2026-08-09', 20, 'Cuidados personales'),
  ],
})

function makeDeps() {
  const ai = vi.fn<AiAnalyzer>().mockResolvedValue(null)
  const deps: FinanceDeps = { canAccess: vi.fn().mockResolvedValue(true), load: vi.fn().mockResolvedValue(DATA), ai, record: vi.fn() }
  return { deps, ai }
}

const ask = (deps: FinanceDeps, text: string) => handleFinanceText(text, TODAY, deps) as Promise<string>
const digits = (s: string) => (s.match(/\d/g) ?? []).length
const sentences = (s: string) => s.split(/[.!?]\s|[.!?]$/).filter((x) => x.trim().length > 0).length

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
  forgetFinanceContext()
})
afterEach(() => vi.useRealTimers())

describe('1. RESPUESTA BREVE POR DEFECTO', () => {
  it('"¿Qué podríamos hacer para ahorrar un poco más?": conclusión corta, con las categorías y sin importes', async () => {
    const { deps } = makeDeps()
    const out = await ask(deps, '¿Qué podríamos hacer para ahorrar un poco más?')
    expect(out).toContain('Regalos')
    expect(out).toContain('Cuidados personales')
    expect(out).toContain('margen')
    expect(out).toContain('empezaría')
    expect(out).not.toMatch(/€|%/)
    expect(digits(out)).toBe(0)
    expect(sentences(out)).toBeLessThanOrEqual(4)
    expect(out.length).toBeLessThan(340)
    expect(out).toContain('Si quieres las cifras, dímelo.')
  })

  it('el análisis abierto sin IA: una sola cifra, redondeada, y sin listas', async () => {
    const { deps } = makeDeps()
    const out = await ask(deps, 'Analiza nuestros gastos de este mes.')
    expect((out.match(/€/g) ?? []).length).toBeLessThanOrEqual(1)
    expect(out).not.toContain('•')
    expect(out).not.toContain('\n')
    expect(out).not.toMatch(/%/)
    expect(sentences(out)).toBeLessThanOrEqual(5)
  })

  it('no juzga y no manda: sugiere revisar, sin órdenes', async () => {
    const { deps } = makeDeps()
    const out = await ask(deps, '¿Qué podríamos recortar?')
    expect(out).not.toMatch(/demasiado|debéis|tenéis que|cancela|elimina|deja de/i)
  })

  it('las preguntas de cantidad siguen contestando con la cifra', async () => {
    const { deps } = makeDeps()
    expect(await ask(deps, '¿Cuánto hemos gastado este mes?')).toMatch(/\d+,\d\d €/)
  })

  it('las demás preguntas de análisis también son breves', async () => {
    const { deps } = makeDeps()
    for (const q of ['¿En qué se nos está yendo el dinero?', '¿Qué categoría ha aumentado más?', '¿Qué ha cambiado respecto al mes pasado?', '¿Estamos ahorrando más o menos?', '¿Hay algún gasto que te llame la atención?']) {
      const out = await ask(deps, q)
      expect(out, q).not.toMatch(/%/)
      expect((out.match(/€/g) ?? []).length, q).toBeLessThanOrEqual(1)
      expect(out, q).not.toContain('\n')
      expect(out.length, q).toBeLessThan(420)
    }
  })
})

describe('2. "¿POR QUÉ?" BREVE Y CONCEPTUAL', () => {
  it('tras una sugerencia explica el criterio, sin importes ni porcentajes', async () => {
    const { deps } = makeDeps()
    await ask(deps, '¿Qué podríamos hacer para ahorrar un poco más?')
    const why = await ask(deps, '¿Por qué?')
    expect(why).toMatch(/^Porque/)
    expect(why).toContain('Regalos')
    expect(why).toMatch(/no son fijos|no es un gasto fijo|más se pueden ajustar/)
    expect(digits(why)).toBe(0)
    expect(why).not.toContain('€')
    expect(why).toContain('No significa que gastéis de más')
    expect(sentences(why)).toBeLessThanOrEqual(5)
    expect(financeContextQuery()).toMatchObject({ metric: 'why_cuts', detail: 'brief' })
  })

  it('tras un análisis explica el cambio en palabras', async () => {
    const { deps } = makeDeps()
    await ask(deps, 'Analiza nuestros gastos de este mes.')
    const why = await ask(deps, '¿Por qué?')
    expect(why).toMatch(/Sobre todo por|repartido/)
    expect(digits(why)).toBe(0)
    expect(why).not.toContain('€')
  })

  it('"¿Por qué hemos gastado más?" corrige la premisa, también en breve', async () => {
    const { deps } = makeDeps()
    // Con los datos de agosto más altos que los de septiembre.
    const less = financeData({ expenses: [exp('2026-09-02', 50, 'Alimentación'), exp('2026-08-02', 200, 'Alimentación')] })
    const out = await handleFinanceText('¿Por qué hemos gastado más este mes?', TODAY, { ...deps, load: vi.fn().mockResolvedValue(less) })
    expect(out).toContain('En realidad este mes gastáis menos, no más')
    expect(digits(out as string)).toBe(0)
  })
})

describe('3. "DAME LAS CIFRAS" → DETALLE', () => {
  it.each(['Dame las cifras', 'Enséñame los números', 'Dame más detalles', 'Dame los datos', 'Desglósamelo', 'Con cifras', 'Dime los importes'])('%s -> el detalle completo del mismo análisis', async (phrase) => {
    const { deps, ai } = makeDeps()
    await ask(deps, '¿Qué podríamos hacer para ahorrar un poco más?')
    const detail = await ask(deps, phrase)
    expect(detail).toContain('Regalos')
    expect(detail).toMatch(/150,00 €/)
    expect(detail).toMatch(/suman/)
    expect(detail).toMatch(/%/)
    expect(financeContextQuery()).toMatchObject({ metric: 'cuts', detail: 'full' })
    expect(ai).not.toHaveBeenCalled()
  })

  it('tras el análisis abierto, las cifras son el análisis completo de código (sin nueva llamada a la IA)', async () => {
    const { deps, ai } = makeDeps()
    await ask(deps, 'Analiza nuestros gastos de este mes.')
    ai.mockClear()
    const detail = await ask(deps, 'Dame las cifras')
    expect(detail).toContain('de gasto registrado')
    expect(detail).toMatch(/\d+,\d\d €/)
    expect(detail).toContain('\n')
    expect(ai).not.toHaveBeenCalled()
  })

  it('no se pierde nada: el detalle completo es el mismo texto de siempre', async () => {
    const { deps } = makeDeps()
    await ask(deps, '¿Dónde estamos gastando demasiado?')
    const detail = await ask(deps, 'Dame las cifras')
    expect(detail).toMatch(/Alimentación: \d+,\d\d € \(\d+ %\)/)
  })
})

describe('4. "¿CUÁNTO EXACTAMENTE?" → DETALLE', () => {
  it.each(['¿Cuánto exactamente?', '¿Cuánto es exactamente?', 'Exactamente cuánto', '¿Cuánto en total?'])('%s', async (phrase) => {
    const { deps } = makeDeps()
    await ask(deps, '¿Qué categoría ha aumentado más?')
    const detail = await ask(deps, phrase)
    expect(detail).toMatch(/€/)
    expect(financeContextQuery()).toMatchObject({ metric: 'top_increase', detail: 'full' })
  })
})

describe('5. "EXPLÍCAMELO MÁS SENCILLO" → TODAVÍA MÁS SIMPLE', () => {
  it('una frase, palabras de cada día, sin cifras, y más corta que la respuesta anterior', async () => {
    const { deps } = makeDeps()
    const first = await ask(deps, 'Analiza nuestros gastos de este mes.')
    const simple = await ask(deps, 'Explícamelo más sencillo')
    expect(simple).toMatch(/^En pocas palabras:/)
    expect(sentences(simple)).toBe(1)
    expect(digits(simple)).toBe(0)
    expect(simple.length).toBeLessThan(first.length)
    // Reformular no cambia de tema: el análisis anterior sigue siendo el contexto.
    expect(financeContextQuery()).toMatchObject({ metric: 'analyze' })
  })

  it('también tras un detalle con cifras', async () => {
    const { deps } = makeDeps()
    await ask(deps, '¿Qué podríamos hacer para ahorrar un poco más?')
    await ask(deps, 'Dame las cifras')
    const simple = await ask(deps, 'Explícamelo más sencillo')
    expect(simple).toMatch(/^En pocas palabras:/)
    expect(digits(simple)).toBe(0)
  })
})

describe('el contexto recuerda el análisis anterior (sin volver a empezar)', () => {
  it('"¿Y cuál es la segunda?" -> la segunda categoría de la respuesta anterior', async () => {
    const { deps } = makeDeps()
    await ask(deps, '¿Qué podríamos hacer para ahorrar un poco más?')
    const first = await ask(deps, '¿Y cuál es la primera?')
    const second = await ask(deps, '¿Y cuál es la segunda?')
    expect(first).toContain('Regalos')
    expect(second).toContain('Cuidados personales')
    expect(second).not.toMatch(/%/)
    expect(financeContextQuery()).toMatchObject({ metric: 'category_focus', detail: 'brief' })
  })

  it('"la tercera" cuando solo se nombraron dos no inventa una categoría', async () => {
    const { deps } = makeDeps()
    await ask(deps, '¿Qué podríamos hacer para ahorrar un poco más?')
    expect(await handleFinanceText('¿Y cuál es la tercera?', TODAY, deps)).toMatch(/No encuentro/)
  })

  it('el orden de la respuesta ("la segunda") solo existe con contexto vivo', async () => {
    const { deps } = makeDeps()
    expect(await handleFinanceText('¿Y cuál es la segunda?', TODAY, deps)).toBeNull()
  })

  it('cadena completa sin recalcular desde cero: ahorrar -> por qué -> cifras -> más sencillo', async () => {
    const { deps } = makeDeps()
    await ask(deps, '¿Qué podríamos hacer para ahorrar un poco más?')
    await ask(deps, '¿Por qué?')
    expect(financeContextQuery()).toMatchObject({ metric: 'why_cuts' })
    const figures = await ask(deps, 'Dame las cifras')
    expect(figures).toMatch(/€/)
    const simple = await ask(deps, 'Explícamelo más sencillo')
    expect(simple).toMatch(/^En pocas palabras/)
  })
})

describe('privacidad y datos: sin cambios', () => {
  it('lo que se pide a la IA sigue siendo solo agregados; ahora en modo breve', async () => {
    const { deps, ai } = makeDeps()
    ai.mockResolvedValue(null)
    await ask(deps, 'Analiza nuestros gastos de este mes.')
    const [, facts, detail] = ai.mock.calls[0]
    expect(detail).toBe('brief')
    const sent = JSON.stringify(facts)
    for (const secret of ['Mercadona', 'MERCADONA', 'Aldi', 'SECRETO', 'ES76', '2026-09-03']) expect(sent).not.toContain(secret)
  })

  it('leer y presentar no cambia ningún dato', async () => {
    const before = JSON.stringify(DATA)
    const { deps } = makeDeps()
    for (const q of ['¿Qué podríamos hacer para ahorrar un poco más?', '¿Por qué?', 'Dame las cifras', 'Explícamelo más sencillo']) await ask(deps, q)
    expect(JSON.stringify(DATA)).toBe(before)
  })
})
