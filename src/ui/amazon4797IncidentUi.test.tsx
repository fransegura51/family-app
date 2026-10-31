// @vitest-environment jsdom
// INCIDENCIA 31/10/2026 — compra Amazon del 16/10 de 47,97 € (pijama 25,99 + camiseta 14,99 + pegatinas 6,99) con un movimiento bancario de 47,97 € repartido 40,98 € Ropa y calzado
// + 6,99 € Papelería. Estado REPARADO: la compra paga 47,97 €, está vinculada al movimiento (receipts.expense_id) y la devolución posterior de 25,99 € sigue siendo un ingreso
// independiente. Estas pruebas fijan lo que debe verse y que ninguna estadística duplique el gasto.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FamilyFoodType } from '@/data/foodTypes'
import type { BudgetCategory, Expense, Product, ProductPrice, Receipt } from '@/domain/types'
import type { MovementsFilter } from '@/ui/FinanceScreen'
import { takeStatsReturnContext } from '@/state/statsReturnContext'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty, neq: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : p === 'removeChannel' ? () => undefined : () => empty()) }) }))
vi.mock('@/services/voice', async (o) => ({ ...(await o<typeof import('@/services/voice')>()), isSpeechSupported: () => false, isDictationSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const categories: BudgetCategory[] = [
  { id: 'cf', familyId: 'f', name: 'Compras y familia', icon: '🛍️', budgetGroup: 'generales', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null },
  { id: 'ni', familyId: 'f', name: 'Niños', icon: '🧸', budgetGroup: 'generales', sortOrder: 2, parentId: 'cf', necessity: null, isFixed: null, catalogKey: null },
  { id: 'dev', familyId: 'f', name: 'Devoluciones', icon: '↩️', budgetGroup: 'ingresos', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: 'i.ingreso.devoluciones' },
] as unknown as BudgetCategory[]
const types = [
  { id: 't1', familyId: 'f', name: 'Ropa y calzado', icon: '👕', kind: 'no_alimentos' },
  { id: 't2', familyId: 'f', name: 'Ferretería y bricolaje', icon: '🔧', kind: 'no_alimentos' },
  { id: 't3', familyId: 'f', name: 'Papelería y oficina', icon: '✏️', kind: 'no_alimentos' },
] as unknown as FamilyFoodType[]

const data = vi.hoisted(() => ({ expenses: [] as unknown[], receipts: [] as unknown[], prices: [] as unknown[], products: [] as unknown[], lines: [] as unknown[], classShares: new Map<string, { className: string; amount: number }[]>() }))
vi.mock('@/data/finance', async (o) => ({ ...(await o<typeof import('@/data/finance')>()), listExpenses: async () => data.expenses, listBudgetCategories: async () => categories, listTags: async () => [], listBudgets: async () => [], listClassSharesSafe: async () => data.classShares, listResolvedInternalTransferDestinations: async () => [] }))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 1, listFamilyMembers: async () => [] }))
vi.mock('@/data/foodTypes', async (o) => ({ ...(await o<typeof import('@/data/foodTypes')>()), listFamilyFoodTypes: async (kind?: string) => types.filter((t) => !kind || t.kind === kind) }))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => data.prices, listProducts: async () => data.products, listProductPricesByReceipt: async () => data.lines }))
vi.mock('@/data/receipts', async (o) => ({ ...(await o<typeof import('@/data/receipts')>()), listReceipts: async () => data.receipts }))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))
vi.mock('@/data/cash', async (o) => ({ ...(await o<typeof import('@/data/cash')>()), listWalletsSafe: async () => [], listAllMovementsSafe: async () => [] }))

const { BudgetsTab } = await import('@/ui/FinanceScreen')
const { ShoppingScreen } = await import('@/ui/ShoppingScreen')

const product = (id: string, name: string, className: string): Product => ({ id, familyId: 'f', normalizedName: name.toLowerCase(), displayName: name, category: className, brand: null, nonFood: true, classConfirmedAt: '2026-10-22', classKind: 'no_alimentos' }) as unknown as Product
const price = (id: string, productId: string, amount: number): ProductPrice => ({ id, productId, receiptId: 'amz-r', price: amount, quantity: '1', unit: null, store: 'Amazon', recordedDate: '2026-10-16' }) as unknown as ProductPrice
const line = (id: string, productId: string, name: string, amount: number) => ({ id, productId, name, price: amount, quantity: '1', unit: null, pack: null })
const expense = (o: Partial<Expense>): Expense =>
  ({ familyId: 'f', kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, isFixedOverride: null, ownerMemberId: null, shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense

beforeEach(() => {
  takeStatsReturnContext()
  window.scrollTo = (() => undefined) as typeof window.scrollTo
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-30T10:00:00'))
  data.products = [product('p-peg', 'Vinabo Pegatinas', 'Ferretería y bricolaje'), product('p-pij', 'PJ Masks Pijama', 'Ropa y calzado'), product('p-cam', 'PJ Masks Camiseta', 'Ropa y calzado')]
  // Estado reparado: el movimiento del banco (47,97, source ticket_banco) con su compra vinculada y sus dos repartos.
  data.expenses = [
    expense({ id: 'bank-4797', expenseDate: '2026-10-16', amount: 47.97, category: 'Niños', store: 'WWW.AMAZON-LUXEMBOURG', source: 'ticket_banco', productClassification: 'Ropa y calzado' }),
    expense({ id: 'refund-2599', expenseDate: '2026-10-26', amount: 25.99, category: 'Devoluciones', store: null, source: 'banco', isIncome: true, budgetGroup: 'ingresos' }),
  ]
  data.classShares = new Map([['bank-4797', [{ className: 'Ropa y calzado', amount: 40.98 }, { className: 'Papelería y oficina', amount: 6.99 }]]])
  data.receipts = [{ id: 'amz-r', familyId: 'f', expenseId: 'bank-4797', store: 'Amazon', receiptDate: '2026-10-16', totalAmount: 47.97, category: 'Niños', storagePath: null, notes: 'Pedido 402-0239956-2361102', purchasedByMemberId: null, discountTotal: 0 } as unknown as Receipt]
  data.prices = [price('1', 'p-peg', 6.99), price('2', 'p-pij', 25.99), price('3', 'p-cam', 14.99)]
  data.lines = [line('1', 'p-peg', 'Vinabo Pegatinas', 6.99), line('2', 'p-pij', 'PJ Masks Pijama', 25.99), line('3', 'p-cam', 'PJ Masks Camiseta', 14.99)]
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function classFilter(className: string): Promise<MovementsFilter> {
  const onViewMovements = vi.fn()
  render(
    <MemoryRouter>
      <BudgetsTab group="alimentacion" accountsMode="compartido" myMemberId="m1" onViewMovements={onViewMovements} />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getAllByText(/Reparto del gasto por tienda/).length).toBeGreaterThan(0))
  fireEvent.click(screen.getByRole('button', { name: 'Otros' }))
  await waitFor(() => expect(screen.getAllByText(/Reparto del gasto en Otros por clasificación/).length).toBeGreaterThan(0))
  const card = screen.getAllByText(/Reparto del gasto en Otros por clasificación/)[0].closest('.card') as HTMLElement
  for (const path of [...card.querySelectorAll('svg path')]) {
    fireEvent.click(path)
    if ((card.textContent ?? '').includes(`en ${className} —`)) break
  }
  fireEvent.click(within(card).getByRole('button', { name: /Ver movimientos/ }))
  return onViewMovements.mock.calls[0][0] as MovementsFilter
}

describe('Compra Amazon 16/10/2026 de 47,97 €', () => {
  it('Compras muestra 47,97 € pagados, los tres productos con sus importes, y la compra CUADRA (sin aviso de descuadre)', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/compras', state: { tab: 'Tickets' } }]}>
        <ShoppingScreen />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /Amazon/ }))
    const summary = await screen.findByText(/16\/10\/2026/)
    expect(summary.closest('button')?.textContent).toContain('47.97 €')
    expect(summary.closest('button')?.textContent).not.toContain('6.99 €')
    fireEvent.click(summary.closest('button') as HTMLElement)
    await screen.findByText('PJ Masks Pijama', { exact: false })
    const detail = summary.closest('.receipt-row') as HTMLElement
    expect(detail.textContent).toContain('25.99 €')
    expect(detail.textContent).toContain('14.99 €')
    expect(detail.textContent).toContain('6.99 €')
    expect(screen.queryByText(/no cuadran con lo pagado/)).toBeNull()
  })

  it('las estadísticas reparten el gasto (40,98 € Ropa + 6,99 € por la clase de su producto) y cuentan UNA sola vez el movimiento, sin tocar la devolución', async () => {
    const ropa = await classFilter('Ropa y calzado')
    expect(ropa.expenseIds).toEqual(['bank-4797']) // la devolución (ingreso) no entra ni se mezcla
    expect(ropa.imputed?.byExpense['bank-4797']).toBe(40.98)
    cleanup()
    const otra = await classFilter('Ferretería y bricolaje')
    expect(otra.expenseIds).toEqual(['bank-4797'])
    expect(otra.imputed?.byExpense['bank-4797']).toBe(6.99)
    expect(Math.round(((ropa.imputed?.byExpense['bank-4797'] ?? 0) + (otra.imputed?.byExpense['bank-4797'] ?? 0)) * 100) / 100).toBe(47.97)
  })

  it('el movimiento bancario, su reparto guardado y la devolución permanecen intactos', () => {
    const exp = data.expenses as Expense[]
    expect(exp.find((e) => e.id === 'bank-4797')?.amount).toBe(47.97)
    const shares = data.classShares.get('bank-4797') ?? []
    expect(shares.map((s) => s.amount)).toEqual([40.98, 6.99])
    expect(Math.round(shares.reduce((a, s) => a + s.amount, 0) * 100) / 100).toBe(47.97)
    const refund = exp.find((e) => e.id === 'refund-2599')
    expect(refund?.amount).toBe(25.99)
    expect(refund?.isIncome).toBe(true)
    expect((data.receipts[0] as Receipt).expenseId).toBe('bank-4797') // la compra no cuelga de la devolución
  })
})
