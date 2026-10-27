// @vitest-environment jsdom
// COR-01 — «Ver movimientos» desde «Reparto del gasto en Otros por clasificación». El filtro viaja como LISTA DE IDENTIFICADORES de gastos (nunca por texto o coincidencias de
// nombres) y solo incluye los gastos que APORTAN importe a la clasificación elegida: «Ropa y calzado» no trae «Electrónica y hogar» ni «Belleza y cuidado personal»; una compra
// repartida entre «Ropa y calzado» y «Papelería y oficina» sale en las dos; y cada una lleva el importe que aporta (COR-03).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FamilyFoodType } from '@/data/foodTypes'
import type { MovementsFilter } from '@/ui/FinanceScreen'
import type { BudgetCategory, Expense, Product, ProductPrice, Receipt } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-16', amount: 1, category: 'Compras y familia', store: 'Amazon', kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'ticket', isFixedOverride: null, ownerMemberId: null, shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense
const cat = (o: Partial<BudgetCategory> & Pick<BudgetCategory, 'id' | 'name'>): BudgetCategory => ({ familyId: 'f', icon: '🏷️', budgetGroup: 'generales', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null, ...o }) as BudgetCategory
const categories: BudgetCategory[] = [cat({ id: 'cf', name: 'Compras y familia', icon: '🛍️' }), cat({ id: 'ali', name: 'Alimentación', icon: '🍎' })]
const types = [
  { id: 't1', familyId: 'f', name: 'Ropa y calzado', icon: '👕', kind: 'no_alimentos' },
  { id: 't2', familyId: 'f', name: 'Papelería y oficina', icon: '✏️', kind: 'no_alimentos' },
  { id: 't3', familyId: 'f', name: 'Electrónica y hogar', icon: '🔌', kind: 'no_alimentos' },
  { id: 't4', familyId: 'f', name: 'Belleza y cuidado personal', icon: '💄', kind: 'no_alimentos' },
] as unknown as FamilyFoodType[]

const data = vi.hoisted(() => ({
  expenses: [] as unknown[],
  shares: new Map<string, { className: string; amount: number }[]>(),
  receipts: [] as unknown[],
  prices: [] as unknown[],
  products: [] as unknown[],
}))
vi.mock('@/data/finance', async (o) => ({ ...(await o<typeof import('@/data/finance')>()), listExpenses: async () => data.expenses, listBudgetCategories: async () => categories, listTags: async () => [], listBudgets: async () => [], listClassSharesSafe: async () => data.shares, listResolvedInternalTransferDestinations: async () => [] }))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 31, listFamilyMembers: async () => [] }))
vi.mock('@/data/foodTypes', async (o) => ({ ...(await o<typeof import('@/data/foodTypes')>()), listFamilyFoodTypes: async (kind?: string) => types.filter((t) => !kind || t.kind === kind) }))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => data.prices, listProducts: async () => data.products }))
vi.mock('@/data/receipts', async (o) => ({ ...(await o<typeof import('@/data/receipts')>()), listReceipts: async () => data.receipts }))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))

const { BudgetsTab } = await import('@/ui/FinanceScreen')

const product = (id: string, name: string, category: string) => ({ id, familyId: 'f', normalizedName: name.toLowerCase(), displayName: name, category, brand: null, nonFood: true, classConfirmedAt: '2026-10-01', classKind: 'no_alimentos' }) as unknown as Product
const receipt = (id: string, expenseId: string) => ({ id, familyId: 'f', expenseId, store: 'Amazon', receiptDate: '2026-10-16', totalAmount: 1, category: 'Compras y familia', storagePath: null, notes: null, purchasedByMemberId: null }) as unknown as Receipt
const price = (id: string, productId: string, receiptId: string, amount: number) => ({ id, productId, receiptId, price: amount, quantity: '1', unit: null, store: 'Amazon', recordedDate: '2026-10-16' }) as unknown as ProductPrice

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
  data.products = [product('p-cable', 'Cable Ethernet 5m', 'Electrónica y hogar'), product('p-toall', 'Toallitas', 'Belleza y cuidado personal'), product('p-cami', 'Camiseta', 'Ropa y calzado')]
  data.expenses = [
    ex({ id: 'cable', amount: 6.39 }), // solo «Electrónica y hogar»
    ex({ id: 'toallitas', amount: 23.94, category: 'Compras y familia' }), // solo «Belleza y cuidado personal»
    ex({ id: 'mixto', amount: 20 }), // ticket con una camiseta (12 €) y un cable (8 €)
    ex({ id: 'cero', amount: 6.39 }), // cable 6,39 € + una camiseta de 0 € (promoción): NO aporta nada a «Ropa y calzado»
    ex({ id: 'reparto', amount: 47.97, source: 'banco', productClassification: 'Ropa y calzado' }), // sin ticket, repartido a mano
  ]
  data.shares = new Map([['reparto', [{ className: 'Ropa y calzado', amount: 40.98 }, { className: 'Papelería y oficina', amount: 6.99 }]]])
  data.receipts = [receipt('r-cable', 'cable'), receipt('r-toall', 'toallitas'), receipt('r-mixto', 'mixto'), receipt('r-cero', 'cero')]
  data.prices = [
    price('1', 'p-cable', 'r-cable', 6.39),
    price('2', 'p-toall', 'r-toall', 23.94),
    price('3', 'p-cami', 'r-mixto', 12),
    price('4', 'p-cable', 'r-mixto', 8),
    price('5', 'p-cable', 'r-cero', 6.39),
    price('6', 'p-cami', 'r-cero', 0),
  ]
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function viewMovementsOf(className: string): Promise<MovementsFilter> {
  const onViewMovements = vi.fn()
  render(
    <MemoryRouter>
      <BudgetsTab group="alimentacion" seedCategories={[]} accountsMode="compartido" myMemberId="m1" onViewMovements={onViewMovements} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getAllByText(/Reparto del gasto por tienda/).length).toBeGreaterThan(0))
  fireEvent.click(screen.getByRole('button', { name: 'Otros' }))
  await waitFor(() => expect(screen.getAllByText(/Reparto del gasto en Otros por clasificación/).length).toBeGreaterThan(0))
  const card = screen.getAllByText(/Reparto del gasto en Otros por clasificación/)[0].closest('.card') as HTMLElement
  // Se toca cada porción hasta dar con la de la clasificación pedida (el orden depende de los importes).
  for (const path of [...card.querySelectorAll('svg path')]) {
    fireEvent.click(path)
    if ((card.textContent ?? '').includes(`en ${className} —`)) break
  }
  fireEvent.click(within(card).getByRole('button', { name: /Ver movimientos/ }))
  expect(onViewMovements).toHaveBeenCalledTimes(1)
  return onViewMovements.mock.calls[0][0] as MovementsFilter
}

describe('Ver movimientos desde una clasificación', () => {
  it('«Ropa y calzado» NO incluye «Electrónica y hogar» ni «Belleza y cuidado personal»', async () => {
    const f = await viewMovementsOf('Ropa y calzado')
    expect(f.expenseIds).not.toContain('cable') // solo Electrónica y hogar
    expect(f.expenseIds).not.toContain('toallitas') // solo Belleza y cuidado personal
  })

  it('no entra un gasto cuya línea de esa clasificación vale 0 € (no aporta nada a «Ropa y calzado»)', async () => {
    const f = await viewMovementsOf('Ropa y calzado')
    expect(f.expenseIds).not.toContain('cero')
  })

  it('el filtro va por identificadores de gasto, nunca por texto, y respeta el periodo', async () => {
    const f = await viewMovementsOf('Ropa y calzado')
    expect(Array.isArray(f.expenseIds)).toBe(true)
    expect(f.category).toBeUndefined()
    expect(f.store).toBeUndefined()
    expect(f.from).toBe('2026-09-30')
    expect(f.to).toBe('2026-10-30')
  })

  it('una compra repartida entre «Ropa y calzado» y «Papelería y oficina» sale en las dos, con la parte de cada una', async () => {
    const ropa = await viewMovementsOf('Ropa y calzado')
    expect(ropa.expenseIds).toContain('reparto')
    expect(ropa.expenseIds).toContain('mixto') // el ticket con la camiseta
    expect(ropa.imputed?.label).toBe('Ropa y calzado')
    expect(ropa.imputed?.byExpense.reparto).toBe(40.98)
    expect(ropa.imputed?.byExpense.mixto).toBe(12)
    cleanup()
    const papeleria = await viewMovementsOf('Papelería y oficina')
    expect(papeleria.expenseIds).toEqual(['reparto'])
    expect(papeleria.imputed?.byExpense.reparto).toBe(6.99)
  })

  it('«Electrónica y hogar» trae el cable y la parte del ticket mixto, no la compra repartida', async () => {
    const f = await viewMovementsOf('Electrónica y hogar')
    expect(f.expenseIds).toEqual(expect.arrayContaining(['cable', 'mixto', 'cero']))
    expect(f.expenseIds).not.toContain('reparto')
    expect(f.imputed?.byExpense.mixto).toBe(8)
  })

  it('las estadísticas conservan los importes: la suma por clasificación = el gasto de las compras, sin duplicar', async () => {
    await viewMovementsOf('Ropa y calzado')
    const text = document.body.textContent ?? ''
    // 6,39 + 23,94 + 20 + 6,39 + 47,97 = 104,69 € registrados en compras
    expect(text).toContain('104.69 €')
  })
})
