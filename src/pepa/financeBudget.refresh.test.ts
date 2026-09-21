import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  budgets: [] as Record<string, unknown>[],
  categories: [] as Record<string, unknown>[],
  failWrites: false,
  writes: 0,
}))

vi.mock('@/data/family', () => ({ getAccountsMode: async () => 'compartido', getFinanceMonthStartDay: async () => 1 }))
vi.mock('@/data/finance', () => ({
  listBudgets: async () => db.budgets.map((b) => ({ ...b })),
  listBudgetCategories: async () => db.categories,
  createBudget: async (input: Record<string, unknown>) => {
    if (db.failWrites) throw new Error('sin conexión')
    db.writes++
    db.budgets.push({ id: `b${db.budgets.length + 1}`, familyId: 'f', periodType: input.periodType, periodStart: input.periodStart, category: input.category || null, amount: input.amount, budgetGroup: input.budgetGroup, ownerMemberId: 'me' })
  },
  updateBudgetAmount: async (id: string, amount: number) => {
    if (db.failWrites) throw new Error('sin conexión')
    db.writes++
    const b = db.budgets.find((x) => x.id === id)
    if (b) b.amount = amount
  },
}))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import { CATEGORIES, REST, TODAY } from '@/domain/financeTestData'
import { handleBudgetAction, forgetBudgetActions, type BudgetActionDeps } from '@/pepa/financeActions'
import { BUDGETS_CHANGED_EVENT, notifyBudgetsChanged, subscribeBudgetsChanged } from '@/state/budgetsChanged'
import type { ActionProposal } from '@/pepa/actions/types'
import { resetDialogRegistry } from '@/pepa/dialog'

// Lo que hace la pantalla de Economía (BudgetsTab): cargar los presupuestos al abrirse y volver a cargar cuando avisan.
function mountEconomy() {
  const screen = { shown: [] as { category: unknown; amount: unknown }[], loads: 0 }
  const reload = async () => {
    screen.loads++
    const { listBudgets } = await import('@/data/finance')
    screen.shown = (await listBudgets()).map((b) => ({ category: b.category, amount: b.amount }))
  }
  void reload()
  const unsubscribe = subscribeBudgetsChanged(reload)
  return { screen, unsubscribe }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

const deps: BudgetActionDeps = {
  canAccess: async () => true,
  load: async () => ({ categories: db.categories as never, budgets: db.budgets as never, monthStartDay: 1, accountsMode: 'compartido' }),
}

async function propose(text: string): Promise<ActionProposal> {
  const out = await handleBudgetAction(text, TODAY, deps)
  if (out?.kind !== 'proposal') throw new Error(`no hay tarjeta: ${out?.text}`)
  return out.proposal
}

let events = 0
const countEvent = () => void events++

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.stubGlobal('window', new EventTarget())
  window.addEventListener(BUDGETS_CHANGED_EVENT, countEvent)
  events = 0
  db.budgets = []
  db.categories = CATEGORIES as unknown as Record<string, unknown>[]
  db.failWrites = false
  db.writes = 0
  resetDialogRegistry()
  forgetBudgetActions()
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetDialogRegistry()
  vi.useRealTimers()
})

describe('Economía se actualiza tras un cambio de presupuesto hecho desde Hablar con PEPA', () => {
  it('1. crear: aparece en la pantalla sin recargar nada', async () => {
    const { screen } = mountEconomy()
    await flush()
    expect(screen.shown).toEqual([])
    const proposal = await propose('Crea un presupuesto de 300 euros para restaurantes este mes')
    await proposal.confirm(proposal.initialSelection)
    await flush()
    expect(screen.shown).toEqual([{ category: REST, amount: 300 }])
  })

  it('2. modificar: la pantalla pasa de 250 a 200 (no se queda con el dato antiguo)', async () => {
    db.budgets = [{ id: 'b0', familyId: 'f', periodType: 'mensual', periodStart: '2026-09-01', category: REST, amount: 250, budgetGroup: 'generales', ownerMemberId: 'me' }]
    const { screen } = mountEconomy()
    await flush()
    expect(screen.shown).toEqual([{ category: REST, amount: 250 }])
    const proposal = await propose('Cambia el presupuesto de restaurantes a 200 euros este mes')
    await proposal.confirm(proposal.initialSelection)
    await flush()
    expect(screen.shown).toEqual([{ category: REST, amount: 200 }])
    expect(db.budgets).toHaveLength(1)
  })

  it('3. cancelar (no confirmar): ni se escribe ni se avisa ni se recarga', async () => {
    const { screen } = mountEconomy()
    await flush()
    const loadsBefore = screen.loads
    await propose('Crea un presupuesto de 300 euros para restaurantes este mes')
    forgetBudgetActions() // cancelar cierra la propuesta sin ejecutar nada
    await flush()
    expect(events).toBe(0)
    expect(db.writes).toBe(0)
    expect(screen.loads).toBe(loadsBefore)
    expect(screen.shown).toEqual([])
  })

  it('4. fallo de escritura: no se avisa y la pantalla no muestra un valor falso', async () => {
    db.budgets = [{ id: 'b0', familyId: 'f', periodType: 'mensual', periodStart: '2026-09-01', category: REST, amount: 250, budgetGroup: 'generales', ownerMemberId: 'me' }]
    const { screen } = mountEconomy()
    await flush()
    const proposal = await propose('Cambia el presupuesto de restaurantes a 200 euros este mes')
    db.failWrites = true
    await expect(proposal.confirm(proposal.initialSelection)).rejects.toThrow('sin conexión')
    await flush()
    expect(events).toBe(0)
    expect(screen.shown).toEqual([{ category: REST, amount: 250 }])
    // Y un intento fallido de crear tampoco deja nada en pantalla.
    db.budgets = []
    const create = await propose('Crea un presupuesto de 300 euros para restaurantes este mes')
    await expect(create.confirm(create.initialSelection)).rejects.toThrow('sin conexión')
    await flush()
    expect(events).toBe(0)
    expect(screen.shown).toEqual([{ category: REST, amount: 250 }])
    expect(db.budgets).toHaveLength(0)
  })

  it('5. un cambio = un aviso y una recarga; sin duplicar el presupuesto; el mismo importe no avisa', async () => {
    const { screen } = mountEconomy()
    await flush()
    const loadsBefore = screen.loads
    const proposal = await propose('Crea un presupuesto de 300 euros para restaurantes este mes')
    await proposal.confirm(proposal.initialSelection)
    await flush()
    expect(events).toBe(1)
    expect(screen.loads).toBe(loadsBefore + 1)
    expect(db.budgets).toHaveLength(1)
    expect(screen.shown).toHaveLength(1)

    // Confirmar otra vez lo mismo (ya existe con ese importe): no escribe, no avisa, no recarga.
    const again = await propose('Cambia el presupuesto de restaurantes a 300 euros este mes').catch(() => null)
    expect(again).toBeNull()
    await proposal.confirm(proposal.initialSelection)
    await flush()
    expect(db.budgets).toHaveLength(1)
    expect(events).toBe(1)
    expect(screen.loads).toBe(loadsBefore + 1)
  })
})

describe('el aviso (mecanismo general)', () => {
  it('varios avisos seguidos: como mucho una carga a la vez y una repetición al terminar', async () => {
    let loads = 0
    let release: () => void = () => {}
    const unsubscribe = subscribeBudgetsChanged(
      () =>
        new Promise<void>((resolve) => {
          loads++
          release = resolve
        }),
    )
    notifyBudgetsChanged()
    notifyBudgetsChanged()
    notifyBudgetsChanged()
    await flush()
    expect(loads).toBe(1)
    release()
    await flush()
    expect(loads).toBe(2)
    release()
    await flush()
    expect(loads).toBe(2)
    unsubscribe()
  })

  it('al cerrarse la pantalla deja de escuchar; un fallo de carga no rompe los avisos siguientes', async () => {
    const reload = vi.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValue(undefined)
    const unsubscribe = subscribeBudgetsChanged(reload)
    notifyBudgetsChanged()
    await flush()
    notifyBudgetsChanged()
    await flush()
    expect(reload).toHaveBeenCalledTimes(2)
    unsubscribe()
    notifyBudgetsChanged()
    await flush()
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('la pantalla de presupuestos está suscrita al aviso y solo esa acción lo lanza', () => {
    const sources = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(sources['/src/ui/FinanceScreen.tsx']).toContain('subscribeBudgetsChanged(')
    const emitters = Object.entries(sources)
      .filter(([, text]) => text.includes('notifyBudgetsChanged()') || text.includes(BUDGETS_CHANGED_EVENT))
      .map(([file]) => file)
      .sort()
    expect(emitters).toEqual(['/src/pepa/actions/financeActions.ts', '/src/state/budgetsChanged.ts'])
  })
})
