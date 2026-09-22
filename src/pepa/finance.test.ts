import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// La capa de datos real se sustituye por completo: estos tests no tocan Supabase.
vi.mock('@/data/bank', () => ({ listBankConnections: vi.fn() }))
vi.mock('@/data/family', () => ({ getFinanceMonthStartDay: vi.fn() }))
vi.mock('@/data/finance', () => ({ listBudgetCategories: vi.fn(), listExpenses: vi.fn() }))
vi.mock('@/data/products', () => ({ listAllProductPrices: vi.fn(), listProducts: vi.fn() }))
vi.mock('@/data/receipts', () => ({ listReceipts: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn() }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import type { FinanceData } from '@/domain/financeCompute'
import type { BudgetCategory, Expense } from '@/domain/types'
import {
  FINANCE_NO_ACCESS,
  FINANCE_NOT_UNDERSTOOD,
  FINANCE_WRITE_REFUSED,
  financeContextQuery,
  forgetFinanceContext,
  handleFinanceText,
  type FinanceDeps,
} from '@/pepa/finance'
import { NOT_UNDERSTOOD, runTalk, type TalkDeps } from '@/pepa/talk'

const TODAY = new Date(2026, 8, 20)

function cat(id: string, name: string, parentId: string | null = null): BudgetCategory {
  return { id, familyId: 'f', name, icon: '', budgetGroup: 'generales', sortOrder: 0, parentId, necessity: null, isFixed: null, catalogKey: null }
}
const CATEGORIES = [cat('a', 'Alimentación'), cat('a1', 'Supermercado', 'a'), cat('t', 'Transporte')]
let n = 0
function exp(date: string, amount: number, category: string, extra: Partial<Expense> = {}): Expense {
  n++
  return { id: `e${n}`, familyId: 'f', expenseDate: date, amount, category, store: null, kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'banco', ...extra } as Expense
}
const DATA: FinanceData = {
  expenses: [
    exp('2026-09-03', 120, 'Supermercado', { store: 'Mercadona' }),
    exp('2026-09-05', 30, 'Transporte'),
    exp('2026-08-04', 100, 'Supermercado', { store: 'Mercadona' }),
    exp('2026-08-08', 20, 'Transporte'),
    exp('2026-09-01', 2000, 'Sueldo', { isIncome: true }),
    exp('2026-08-01', 2000, 'Sueldo', { isIncome: true }),
  ],
  categories: CATEGORIES,
  receipts: [],
  prices: [],
  products: [],
  storeNames: ['Mercadona'],
  monthStartDay: 1,
  bankStale: false,
}

function deps(overrides: Partial<FinanceDeps> = {}): FinanceDeps {
  return { canAccess: vi.fn().mockResolvedValue(true), load: vi.fn().mockResolvedValue(DATA), ...overrides }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
  forgetFinanceContext()
})
afterEach(() => vi.useRealTimers())

describe('conversación de Economía (contexto corto)', () => {
  it('"¿Cuánto hemos gastado este mes?" -> "¿Y el mes pasado?" -> "¿En qué?" -> "¿Solo alimentación?"', async () => {
    const d = deps()
    expect(await handleFinanceText('¿Cuánto hemos gastado este mes?', TODAY, d)).toBe('Este mes lleváis 150,00 € de gastos registrados. Son 30,00 € más que en el mismo periodo del mes anterior.')

    // "¿Y el mes pasado?": misma consulta, otro periodo.
    expect(await handleFinanceText('¿Y el mes pasado?', TODAY, d)).toBe('El mes pasado habéis gastado 120,00 € de gastos registrados.')

    // "¿En qué?": desglose del MISMO periodo que se acaba de consultar (el mes pasado).
    const breakdown = await handleFinanceText('¿En qué?', TODAY, d)
    expect(breakdown).toContain('El mes pasado, 120,00 € en total')
    expect(breakdown).toContain('Alimentación: 100,00 € (83 %)')

    // "¿Solo alimentación?": mismo periodo, filtro de categoría.
    expect(await handleFinanceText('¿Solo alimentación?', TODAY, d)).toContain('El mes pasado habéis gastado 100,00 € en Alimentación')
  })

  it('"¿Y Mercadona?" tras una consulta de este mes filtra por la tienda', async () => {
    const d = deps()
    await handleFinanceText('¿Cuánto hemos gastado este mes?', TODAY, d)
    expect(await handleFinanceText('¿Y Mercadona?', TODAY, d)).toContain('120,00 € en Mercadona')
  })

  it('"¿Y cuánto hemos ingresado?" mantiene el periodo del que se hablaba', async () => {
    const d = deps()
    await handleFinanceText('¿Cuánto gastamos el mes pasado?', TODAY, d)
    expect(await handleFinanceText('¿Y cuánto hemos ingresado?', TODAY, d)).toContain('El mes pasado habéis ingresado 2.000,00 €')
  })

  it('sin consulta anterior, las continuaciones no se interpretan (la frase sigue su camino)', async () => {
    const d = deps()
    for (const t of ['¿En qué?', '¿Y el mes pasado?', '¿Solo alimentación?', '¿Y Mercadona?']) {
      expect(await handleFinanceText(t, TODAY, d), t).toBeNull()
    }
    expect(d.load).not.toHaveBeenCalled()
  })

  it('el contexto caduca a los 10 minutos', async () => {
    const d = deps()
    await handleFinanceText('¿Cuánto hemos gastado este mes?', TODAY, d)
    expect(financeContextQuery()).not.toBeNull()
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000)
    expect(financeContextQuery()).not.toBeNull()
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    expect(financeContextQuery()).toBeNull()
    expect(await handleFinanceText('¿En qué?', TODAY, d)).toBeNull()
  })

  it('olvidar el contexto (otra tarea) borra la consulta recordada', async () => {
    const d = deps()
    await handleFinanceText('¿Cuánto hemos gastado este mes?', TODAY, d)
    forgetFinanceContext()
    expect(await handleFinanceText('¿En qué?', TODAY, d)).toBeNull()
  })

  it('el contexto guarda solo la consulta estructurada, no datos', async () => {
    await handleFinanceText('¿Cuánto hemos gastado este mes?', TODAY, deps())
    expect(Object.keys(financeContextQuery()!).sort()).toEqual(['baseline', 'detail', 'focus', 'full', 'metric', 'period', 'premise', 'product', 'target'])
  })
})

describe('Economía es solo de consulta', () => {
  it('borrar, cambiar y crear se rechazan SIN consultar ni escribir nada', async () => {
    const d = deps()
    for (const t of ['Borra el gasto de Mercadona.', 'Cambia el gasto de ayer a Restauración.', 'Pon un presupuesto de 500 €.']) {
      expect(await handleFinanceText(t, TODAY, d), t).toBe(FINANCE_WRITE_REFUSED)
    }
    expect(d.load).not.toHaveBeenCalled()
    expect(d.canAccess).not.toHaveBeenCalled()
  })

  it('un perfil sin acceso a Dinero no obtiene datos', async () => {
    const d = deps({ canAccess: vi.fn().mockResolvedValue(false) })
    expect(await handleFinanceText('¿Cuánto hemos gastado este mes?', TODAY, d)).toBe(FINANCE_NO_ACCESS)
    expect(d.load).not.toHaveBeenCalled()
  })

  it('si falla la lectura, PEPA lo dice y no se rompe', async () => {
    const d = deps({ load: vi.fn().mockRejectedValue(new Error('sin red')) })
    expect(await handleFinanceText('¿Cuánto hemos gastado este mes?', TODAY, d)).toContain('No he podido consultar Economía')
  })

  it('una frase de economía que las reglas no entienden se dice, sin mandarla a la IA ni consultar datos', async () => {
    const d = deps()
    expect(await handleFinanceText('qué precio tiene todo', TODAY, d)).toBe(FINANCE_NOT_UNDERSTOOD)
    expect(d.load).not.toHaveBeenCalled()
  })

  it('no es de economía: Compras, Calendario, Cocina y palabras de control pasan de largo', async () => {
    const d = deps()
    for (const t of ['Añade leche, huevos y pan a Mercadona', '¿Qué tenemos mañana?', 'Quiero hacer una paella para seis', 'Pon tortilla para cenar el viernes', 'Añadir', 'Sí']) {
      expect(await handleFinanceText(t, TODAY, d), t).toBeNull()
    }
    expect(d.load).not.toHaveBeenCalled()
  })

  it('las consultas no usan la IA: ninguna función de IA participa (solo lectura + cálculo)', async () => {
    const d = deps()
    const out = await handleFinanceText('¿En qué hemos gastado más este mes?', TODAY, d)
    expect(out).toContain('Alimentación: 120,00 €')
    expect(Object.keys(d).sort()).toEqual(['canAccess', 'load'])
  })
})

describe('integración en Hablar con PEPA (runTalk)', () => {
  function talkDeps(finance: NonNullable<TalkDeps['finance']>, over: Partial<TalkDeps> = {}): TalkDeps {
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
      ...over,
    }
  }

  it('"¿Cuánto gastamos en Mercadona este mes?" es de Economía, no de la lista de la compra, y cuesta cero IA', async () => {
    const d = deps()
    const t = talkDeps((text) => handleFinanceText(text, TODAY, d))
    const out = await runTalk('¿Cuánto gastamos en Mercadona este mes?', t)
    expect(out).toMatchObject({ kind: 'answer' })
    expect(out.kind === 'answer' && out.text).toContain('120,00 € en Mercadona')
    expect(t.answerShopping).not.toHaveBeenCalled()
    expect(t.classifyWithAi).not.toHaveBeenCalled()
    expect(t.answerFromAi).not.toHaveBeenCalled()
    expect(t.splitWithAi).not.toHaveBeenCalled()
  })

  it('"Borra el gasto de Mercadona." no llega a ningún sitio que escriba', async () => {
    const d = deps()
    const t = talkDeps((text) => handleFinanceText(text, TODAY, d))
    expect(await runTalk('Borra el gasto de Mercadona.', t)).toEqual({ kind: 'answer', text: FINANCE_WRITE_REFUSED })
    expect(t.answerShopping).not.toHaveBeenCalled()
    expect(t.classifyWithAi).not.toHaveBeenCalled()
  })

  it('otra tarea entre medias olvida el contexto de Economía', async () => {
    const d = deps()
    const t = talkDeps((text) => handleFinanceText(text, TODAY, d))
    await runTalk('¿Cuánto hemos gastado este mes?', t)
    await runTalk('¿qué tengo mañana?', t)
    expect(financeContextQuery()).toBeNull()
    // "¿En qué?" ya no se entiende como continuación de Economía.
    const out = await runTalk('¿En qué?', t)
    expect(out).toEqual({ kind: 'answer', text: NOT_UNDERSTOOD })
  })

  it('Calendario y Compras siguen su camino de siempre', async () => {
    const d = deps()
    const t = talkDeps((text) => handleFinanceText(text, TODAY, d))
    expect(await runTalk('¿qué tengo mañana?', t)).toEqual({ kind: 'answer', text: 'Hoy no tienes nada.' })
    expect(await runTalk('qué hay en la lista de la compra de Mercadona', t)).toEqual({ kind: 'answer', text: 'En la lista: leche.' })
    expect(d.load).not.toHaveBeenCalled()
  })

  it('sin la opción de Economía (los botones de siempre) nada cambia', async () => {
    const t = talkDeps(undefined as never, { finance: undefined, forgetFinance: undefined })
    expect(await runTalk('¿qué tengo mañana?', t)).toEqual({ kind: 'answer', text: 'Hoy no tienes nada.' })
  })
})

describe('mensajes', () => {
  it('constantes legibles', () => {
    expect(FINANCE_NOT_UNDERSTOOD).toContain('cuánto hemos gastado este mes')
  })
})

describe('un fallo de red no es "sin acceso"', () => {
  it('si no se puede comprobar el perfil, PEPA dice que no ha podido consultar (no que no tienes acceso)', async () => {
    const d = deps({ canAccess: vi.fn().mockRejectedValue(new Error('sin red')) })
    const out = await handleFinanceText('¿Cuánto hemos gastado este mes?', TODAY, d)
    expect(out).toContain('No he podido consultar Economía')
    expect(out).not.toBe(FINANCE_NO_ACCESS)
  })
})
