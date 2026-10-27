// @vitest-environment jsdom
// CLASIF-1 — «Reparto por clasificación» de Estadística compras con un gasto repartido entre varias clasificaciones. Pantalla real con datos simulados.
// Caso real: movimiento de Amazon de 47,97 € = Ropa y calzado 40,98 € + otra clasificación 6,99 € (pegatinas). El gasto cuenta UNA vez en el total y en «por tienda»;
// cada clasificación recibe solo su parte; un ticket con productos clasificados manda y no se cuenta dos veces.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FamilyFoodType } from '@/data/foodTypes'
import type { BudgetCategory, Expense, Product, ProductPrice, Receipt } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-16', amount: 1, category: 'Compras y familia', store: 'Amazon', kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'banco', isFixedOverride: null, ownerMemberId: null, shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense
const cat = (o: Partial<BudgetCategory> & Pick<BudgetCategory, 'id' | 'name'>): BudgetCategory => ({ familyId: 'f', icon: '🏷️', budgetGroup: 'generales', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null, ...o }) as BudgetCategory
const categories: BudgetCategory[] = [cat({ id: 'cf', name: 'Compras y familia', icon: '🛍️' }), cat({ id: 'ali', name: 'Alimentación', icon: '🍎' })]
const types = [
  { id: 't1', familyId: 'f', name: 'Ropa y calzado', icon: '👕', kind: 'no_alimentos' },
  { id: 't2', familyId: 'f', name: 'Papelería y manualidades', icon: '✏️', kind: 'no_alimentos' },
  { id: 't3', familyId: 'f', name: 'Verdura', icon: '🥦', kind: 'alimentacion' },
] as unknown as FamilyFoodType[]

const data = vi.hoisted(() => ({
  expenses: [] as unknown[],
  shares: new Map<string, { className: string; amount: number }[]>(),
  receipts: [] as unknown[],
  prices: [] as unknown[],
  products: [] as unknown[],
}))

vi.mock('@/data/finance', async (o) => ({
  ...(await o<typeof import('@/data/finance')>()),
  listExpenses: async () => data.expenses,
  listBudgetCategories: async () => categories,
  listTags: async () => [],
  listBudgets: async () => [],
  listClassSharesSafe: async () => data.shares,
  listResolvedInternalTransferDestinations: async () => [],
}))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 31, listFamilyMembers: async () => [] }))
vi.mock('@/data/foodTypes', async (o) => ({ ...(await o<typeof import('@/data/foodTypes')>()), listFamilyFoodTypes: async (kind?: string) => types.filter((t) => !kind || t.kind === kind) }))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => data.prices, listProducts: async () => data.products }))
vi.mock('@/data/receipts', async (o) => ({ ...(await o<typeof import('@/data/receipts')>()), listReceipts: async () => data.receipts }))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))

const { BudgetsTab } = await import('@/ui/FinanceScreen')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
  data.expenses = []
  data.shares = new Map()
  data.receipts = []
  data.prices = []
  data.products = []
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function open() {
  render(
    <MemoryRouter>
      <BudgetsTab group="alimentacion" seedCategories={[]} accountsMode="compartido" myMemberId="m1" />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getAllByText(/Reparto del gasto por tienda/).length).toBeGreaterThan(0))
  fireEvent.click(screen.getByRole('button', { name: 'Otros' }))
  await waitFor(() => expect(screen.getAllByText(/Reparto del gasto en Otros por clasificación/).length).toBeGreaterThan(0))
}
// El dónut y su lista de importes por clasificación van seguidos: se lee el texto desde el título.
const fromTitle = (title: string) => {
  const t = document.body.textContent ?? ''
  return t.slice(t.indexOf(title))
}
const donutCard = () => ({ textContent: fromTitle('Reparto del gasto en Otros por clasificación') })

describe('Reparto por clasificación con un gasto repartido', () => {
  it('Amazon 47,97 € = Ropa y calzado 40,98 € + Papelería y manualidades 6,99 €: cada clasificación recibe su parte y nada se cuenta dos veces', async () => {
    data.expenses = [ex({ id: 'amz', amount: 47.97, productClassification: 'Ropa y calzado' })]
    data.shares = new Map([['amz', [{ className: 'Ropa y calzado', amount: 40.98 }, { className: 'Papelería y manualidades', amount: 6.99 }]]])
    await open()
    const text = donutCard().textContent ?? ''
    expect(text).toContain('Ropa y calzado')
    expect(text).toContain('Papelería y manualidades')
    expect(text).toContain('40.98')
    expect(text).toContain('6.99')
    // Sin «Sin clasificar»: todo el importe está repartido.
    expect(text).not.toContain('Sin clasificar')
  })

  it('el gasto repartido cuenta UNA sola vez en el total registrado en Compras (47,97 €, no 54,96 €) y en la comparativa', async () => {
    data.expenses = [ex({ id: 'amz', amount: 47.97, productClassification: 'Ropa y calzado' })]
    data.shares = new Map([['amz', [{ className: 'Ropa y calzado', amount: 40.98 }, { className: 'Papelería y manualidades', amount: 6.99 }]]])
    await open()
    const body = document.body.textContent ?? ''
    expect(body).toContain('Total Registrado en Compras47.97 € (100% del gasto total)')
    expect(body).toContain('Otros47.97 €')
    expect(body).not.toContain('54.96')
  })

  it('un gasto con UNA sola clasificación funciona exactamente como antes (el 100 % a esa clasificación)', async () => {
    data.expenses = [ex({ id: 'amz', amount: 47.97, productClassification: 'Ropa y calzado' })]
    await open()
    const text = donutCard().textContent ?? ''
    expect(text).toContain('Ropa y calzado')
    expect(text).toContain('47.97')
    expect(text).not.toContain('Papelería y manualidades')
  })

  it('una clasificación que ya no existe, o un reparto que no suma todo, deja el resto en «Sin clasificar» sin perder ni inventar dinero', async () => {
    data.expenses = [ex({ id: 'amz', amount: 50 })]
    data.shares = new Map([['amz', [{ className: 'Ropa y calzado', amount: 30 }, { className: 'Clase borrada', amount: 15 }]]])
    await open()
    const text = donutCard().textContent ?? ''
    expect(text).toContain('Ropa y calzado')
    expect(text).toContain('30.00')
    expect(text).toContain('Sin clasificar')
    expect(text).toContain('20.00') // 15 (clase borrada) + 5 sin repartir
  })

  it('un reparto entre clasificaciones de Alimentación y de Otros va a cada lado (50 € = Verdura 12,50 € en Alimentación + Ropa y calzado 37,50 € en Otros)', async () => {
    data.expenses = [ex({ id: 'mix', amount: 50, category: 'Alimentación', store: 'Mercadona', productClassification: 'Ropa y calzado' })]
    data.shares = new Map([['mix', [{ className: 'Ropa y calzado', amount: 37.5 }, { className: 'Verdura', amount: 12.5 }]]])
    await open()
    expect(donutCard().textContent).toContain('37.50')
    fireEvent.click(screen.getByRole('button', { name: 'Alimentación' }))
    await waitFor(() => expect(screen.getAllByText(/Reparto del gasto por tipo de alimento/).length).toBeGreaterThan(0))
    const food = fromTitle('Reparto del gasto por tipo de alimento')
    expect(food).toContain('Verdura')
    expect(food).toContain('12.50')
  })

  it('si el gasto tiene un ticket con productos clasificados, manda ese desglose y el reparto manual NO se vuelve a contar', async () => {
    data.expenses = [ex({ id: 'amz', amount: 47.97, source: 'ticket', productClassification: 'Ropa y calzado' })]
    data.shares = new Map([['amz', [{ className: 'Ropa y calzado', amount: 40.98 }, { className: 'Papelería y manualidades', amount: 6.99 }]]])
    data.receipts = [{ id: 'r1', expenseId: 'amz', store: 'Amazon', category: 'Compras y familia', totalAmount: 47.97, purchaseDate: '2026-10-16' } as unknown as Receipt]
    data.products = [{ id: 'p1', displayName: 'Camiseta', category: 'Ropa y calzado', nonFood: true } as unknown as Product]
    data.prices = [{ id: 'pp1', productId: 'p1', receiptId: 'r1', price: 47.97, quantity: 1, store: 'Amazon', recordedDate: '2026-10-16' } as unknown as ProductPrice]
    await open()
    const text = donutCard().textContent ?? ''
    expect(text).toContain('Ropa y calzado')
    expect(text).toContain('47.97')
    expect(text).not.toContain('Papelería y manualidades') // el reparto manual se ignora
  })
})
