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
import { takeStatsReturnContext } from '@/state/statsReturnContext'

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
  { id: 't5', familyId: 'f', name: 'Cuidado personal', icon: '🧴', kind: 'no_alimentos' },
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
  takeStatsReturnContext() // «Ver movimientos» guarda el contexto para volver: que no pase de una prueba a otra
  window.scrollTo = (() => undefined) as typeof window.scrollTo
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

// CAUSA REAL de COR-01 (datos de producción): compras de Amazon cuyo ÚNICO «producto» es el marcador «Pendiente», que alguien clasificó como «Ropa y calzado». Esa clase
// la heredaban TODAS las compras con marcador, aunque el gasto dijera «Electrónica y hogar» (cable 6,39 €) o no dijera nada (toallitas 23,94 €).
describe('COR-01 · líneas del producto marcador «Pendiente»', () => {
  const pendiente = (): Product => product('p-pend', 'Pendiente', 'Ropa y calzado')
  const realExpense = (o: Partial<Expense> & Pick<Expense, 'id'>) => ex({ source: 'ticket_banco', ...o })

  beforeEach(() => {
    categories.push(cat({ id: 'tec', name: 'Tecnología y electrónica' }), cat({ id: 'bel', name: 'Belleza y cuidado personal' }))
    data.products = [pendiente(), product('p-cami', 'Camiseta', 'Ropa y calzado'), product('p-cable', 'Cable Ethernet 5m', 'Electrónica y hogar')]
    data.expenses = [
      realExpense({ id: 'cable', amount: 6.39, category: 'Tecnología y electrónica', productClassification: 'Electrónica y hogar', notes: 'Cable Ethernet 5m' }),
      realExpense({ id: 'toallitas', amount: 23.94, category: 'Belleza y cuidado personal', notes: 'Toallitas' }),
      realExpense({ id: 'ropa', amount: 22.8, category: 'Compras y familia', productClassification: 'Ropa y calzado', notes: 'Disfraz' }),
      realExpense({ id: 'reparto', amount: 47.97, category: 'Compras y familia' }), // marcador + reparto manual 40,98 + 6,99
      realExpense({ id: 'mixta', amount: 49.98, category: 'Compras y familia', productClassification: 'Ropa y calzado' }), // marcador 24,99 + camiseta real 24,99
      ex({ id: 'sin-ticket', amount: 10, source: 'banco', productClassification: 'Ropa y calzado' }),
    ]
    data.shares = new Map([['reparto', [{ className: 'Ropa y calzado', amount: 40.98 }, { className: 'Papelería y oficina', amount: 6.99 }]]])
    data.receipts = ['cable', 'toallitas', 'ropa', 'reparto', 'mixta'].map((id) => receipt(`r-${id}`, id))
    data.prices = [
      price('1', 'p-pend', 'r-cable', 6.39),
      { ...price('2', 'p-pend', 'r-toallitas', 11.97), quantity: '2' } as ProductPrice, // 2 × 11,97 = 23,94
      price('3', 'p-pend', 'r-ropa', 22.8),
      price('4', 'p-pend', 'r-reparto', 47.97),
      price('5', 'p-pend', 'r-mixta', 24.99),
      price('6', 'p-cami', 'r-mixta', 24.99),
    ]
  })
  afterEach(() => {
    categories.splice(2)
  })

  it('el cable (6,39 €, «Electrónica y hogar») y las toallitas (23,94 €) NO están en «Ropa y calzado»', async () => {
    const f = await viewMovementsOf('Ropa y calzado')
    expect(f.expenseIds).not.toContain('cable')
    expect(f.expenseIds).not.toContain('toallitas')
    expect(f.imputed?.byExpense.cable).toBeUndefined()
  })

  it('el cable sale en «Electrónica y hogar» con 6,39 € y las toallitas no se atribuyen a una clase que no han elegido', async () => {
    const f = await viewMovementsOf('Electrónica y hogar')
    expect(f.expenseIds).toEqual(['cable'])
    expect(f.imputed?.byExpense.cable).toBe(6.39)
    cleanup()
    const sin = await viewMovementsOf('Sin clasificar')
    expect(sin.expenseIds).toContain('toallitas')
    expect(sin.imputed?.byExpense.toallitas).toBe(23.94)
  })

  it('la compra de 47,97 € repartida (40,98 + 6,99) sale en las dos clasificaciones con su parte, aunque su ticket tenga el marcador', async () => {
    const ropa = await viewMovementsOf('Ropa y calzado')
    expect(ropa.expenseIds).toContain('reparto')
    expect(ropa.imputed?.byExpense.reparto).toBe(40.98)
    cleanup()
    const papeleria = await viewMovementsOf('Papelería y oficina')
    expect(papeleria.expenseIds).toEqual(['reparto'])
    expect(papeleria.imputed?.byExpense.reparto).toBe(6.99)
  })

  it('un ticket con marcador + línea real: la línea real manda y el resto del gasto va a la clasificación propia del gasto', async () => {
    const f = await viewMovementsOf('Ropa y calzado')
    expect(f.expenseIds).toContain('mixta')
    expect(f.imputed?.byExpense.mixta).toBe(49.98) // camiseta real 24,99 + resto 24,99 clasificado «Ropa y calzado» por el propio gasto
  })

  it('un gasto de «Ropa y calzado» con marcador, y uno sin ticket, siguen en «Ropa y calzado»', async () => {
    const f = await viewMovementsOf('Ropa y calzado')
    expect(f.expenseIds).toEqual(expect.arrayContaining(['ropa', 'sin-ticket', 'reparto', 'mixta']))
  })

  it('la suma de lo imputado en la lista = el importe de la clasificación en la estadística; y las compras no se duplican', async () => {
    const f = await viewMovementsOf('Ropa y calzado')
    const sum = Math.round(Object.values(f.imputed?.byExpense ?? {}).reduce((a, b) => a + b, 0) * 100) / 100
    expect(sum).toBe(Math.round((22.8 + 40.98 + 49.98 + 10) * 100) / 100) // ropa + reparto + mixta + sin-ticket
    // 6,39 + 23,94 + 22,8 + 47,97 + 49,98 + 10 = 161,08 € de compras, cada una una sola vez
    expect(document.body.textContent ?? '').toContain('161.08 €')
  })
})

// COR-01 (3.ª ronda) — el caso de Amazon 04/10/2026, 8,99 €, clasificado «Cuidado personal» y colado en «Ropa y calzado». Jerarquía: desglose real de ticket > (marcador «Pendiente»
// ignorado) > reparto manual entre clasificaciones > clasificación manual del movimiento > por defecto / «Sin clasificar».
describe('COR-01 · jerarquía de clasificación y marcador «Pendiente» en todas sus formas', () => {
  const pendiente = (id: string, name: string): Product => product(id, name, 'Ropa y calzado')
  const realExpense = (o: Partial<Expense> & Pick<Expense, 'id'>) => ex({ source: 'ticket_banco', category: 'Compras y familia', ...o })

  beforeEach(() => {
    data.products = [pendiente('p-pend', 'Pendiente'), product('p-cami', 'Camiseta', 'Ropa y calzado')]
    data.shares = new Map()
    data.receipts = []
    data.prices = []
  })

  it('Amazon 8,99 € «Cuidado personal» con ticket de un solo marcador «Pendiente» (clasificado Ropa y calzado): NO está en Ropa y calzado y SÍ en Cuidado personal con 8,99 €', async () => {
    data.expenses = [realExpense({ id: 'amazon-899', amount: 8.99, expenseDate: '2026-10-04', productClassification: 'Cuidado personal' })]
    data.receipts = [receipt('r1', 'amazon-899')]
    data.prices = [price('1', 'p-pend', 'r1', 8.99)]
    const ropa = await viewMovementsOf('Ropa y calzado') // no existe esa porción: el helper se queda con la última que tocó, que NO es «Ropa y calzado»
    expect(ropa.imputed?.label).not.toBe('Ropa y calzado')
    cleanup()
    const cuidado = await viewMovementsOf('Cuidado personal')
    expect(cuidado.expenseIds).toEqual(['amazon-899'])
    expect(cuidado.imputed?.byExpense['amazon-899']).toBe(8.99)
  })

  it.each([['PENDIENTE'], ['Pendiente.'], ['  pendiente '], ['Pendiente de clasificar'], ['pendiente por revisar']])('el marcador escrito «%s» tampoco clasifica', async (name) => {
    data.products = [pendiente('p-pend', name)]
    data.expenses = [realExpense({ id: 'x', amount: 8.99, productClassification: 'Cuidado personal' })]
    data.receipts = [receipt('r1', 'x')]
    data.prices = [price('1', 'p-pend', 'r1', 8.99)]
    const cuidado = await viewMovementsOf('Cuidado personal')
    expect(cuidado.expenseIds).toEqual(['x'])
  })

  it('cambiar DESPUÉS la clasificación manual del movimiento (sin desglose real) se refleja en las estadísticas y en el filtro', async () => {
    data.expenses = [realExpense({ id: 'm', amount: 8.99, productClassification: 'Cuidado personal' })]
    data.receipts = [receipt('r1', 'm')]
    data.prices = [price('1', 'p-pend', 'r1', 8.99)]
    expect((await viewMovementsOf('Cuidado personal')).expenseIds).toEqual(['m'])
    cleanup()
    data.expenses = [realExpense({ id: 'm', amount: 8.99, productClassification: 'Papelería y oficina' })]
    const papeleria = await viewMovementsOf('Papelería y oficina')
    expect(papeleria.expenseIds).toEqual(['m'])
    cleanup()
    const old = await viewMovementsOf('Cuidado personal') // ya no existe esa porción
    expect(old.imputed?.label).not.toBe('Cuidado personal')
  })

  it('un reparto manual entre clasificaciones (40,98 + 6,99) manda cuando el ticket solo trae el marcador; con productos reales manda el ticket', async () => {
    data.expenses = [realExpense({ id: 'rep', amount: 47.97, productClassification: 'Ropa y calzado' }), realExpense({ id: 'real', amount: 20, productClassification: 'Cuidado personal' })]
    data.shares = new Map([['rep', [{ className: 'Ropa y calzado', amount: 40.98 }, { className: 'Papelería y oficina', amount: 6.99 }]]])
    data.receipts = [receipt('r1', 'rep'), receipt('r2', 'real')]
    data.prices = [price('1', 'p-pend', 'r1', 47.97), price('2', 'p-cami', 'r2', 20)]
    const ropa = await viewMovementsOf('Ropa y calzado')
    expect(ropa.imputed?.byExpense.rep).toBe(40.98)
    expect(ropa.imputed?.byExpense.real).toBe(20) // el producto real del ticket (camiseta) manda sobre la clasificación manual «Cuidado personal»
    cleanup()
    const papeleria = await viewMovementsOf('Papelería y oficina')
    expect(papeleria.imputed?.byExpense.rep).toBe(6.99)
  })

  it('dos tickets vinculados al mismo gasto (uno solo con el marcador, otro con productos reales): se usa el que tiene desglose real y el gasto cuenta UNA vez', async () => {
    data.expenses = [realExpense({ id: 'dup', amount: 12, productClassification: 'Cuidado personal' })]
    data.receipts = [receipt('r-real', 'dup'), receipt('r-marcador', 'dup')] // el marcador es el último: antes tapaba al real
    data.prices = [price('1', 'p-cami', 'r-real', 12), price('2', 'p-pend', 'r-marcador', 12)]
    const ropa = await viewMovementsOf('Ropa y calzado')
    expect(ropa.expenseIds).toEqual(['dup'])
    expect(ropa.imputed?.byExpense.dup).toBe(12) // no 24: no se suman los dos tickets
    expect(document.body.textContent ?? '').toContain('12.00 €')
  })

  it('un ticket con marcador + producto real: el real manda y el resto del gasto va a la clasificación propia del gasto (sin duplicar el gasto)', async () => {
    data.expenses = [realExpense({ id: 'mix', amount: 30, productClassification: 'Cuidado personal' })]
    data.receipts = [receipt('r1', 'mix')]
    data.prices = [price('1', 'p-cami', 'r1', 10), price('2', 'p-pend', 'r1', 20)]
    const cuidado = await viewMovementsOf('Cuidado personal')
    expect(cuidado.imputed?.byExpense.mix).toBe(20)
    cleanup()
    const ropa = await viewMovementsOf('Ropa y calzado')
    expect(ropa.imputed?.byExpense.mix).toBe(10)
  })
})
