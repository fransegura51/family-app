// @vitest-environment jsdom
// COR-08/09/10 con el caso real de Amazon del 05/10/2026: 4 artículos (tubos de ensayo 10,95 · plastilina 15,99 · colorantes 7,99 · Montessori 15,99 = 50,92 €), promoción de −2,40 €
// confirmada en Amazon y NO incluida en el correo importado, total pagado 48,52 €, movimiento clasificado «Juguetes».
//  · COR-08: con desglose real manda la clase de cada producto; la del movimiento se queda como referencia manual y no se interpreta como error.
//  · COR-09: PEPA avisa de la diferencia (sin darla por descuento), permite registrar el descuento general confirmado y las estadísticas pasan a sumar exactamente lo pagado.
//  · COR-10: desde los productos de la compra se llega a su ficha (Historial de precios) para corregir su clasificación.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FamilyFoodType } from '@/data/foodTypes'
import { compareReceiptTotal, distributeDiscount } from '@/domain/receiptDiscount'
import type { BudgetCategory, Expense, Product, ProductPrice, Receipt } from '@/domain/types'
import type { MovementsFilter } from '@/ui/FinanceScreen'
import { takeStatsReturnContext } from '@/state/statsReturnContext'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty, neq: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : p === 'removeChannel' ? () => undefined : () => empty()) }) }))
vi.mock('@/services/voice', async (o) => ({ ...(await o<typeof import('@/services/voice')>()), isSpeechSupported: () => false, isDictationSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const categories: BudgetCategory[] = [
  { id: 'cf', familyId: 'f', name: 'Compras y familia', icon: '🛍️', budgetGroup: 'generales', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null },
  { id: 'ni', familyId: 'f', name: 'Niños', icon: '🧸', budgetGroup: 'generales', sortOrder: 2, parentId: 'cf', necessity: null, isFixed: null, catalogKey: null },
  { id: 'ing', familyId: 'f', name: 'Sueldo', icon: '💶', budgetGroup: 'ingresos', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null },
] as unknown as BudgetCategory[]
const types = [
  { id: 't1', familyId: 'f', name: 'Juguetes', icon: '🧸', kind: 'no_alimentos' },
  { id: 't2', familyId: 'f', name: 'Manualidades y creatividad', icon: '🎨', kind: 'no_alimentos' },
  { id: 't3', familyId: 'f', name: 'Higiene y cuidado del bebé', icon: '👶', kind: 'no_alimentos' },
] as unknown as FamilyFoodType[]

const data = vi.hoisted(() => ({
  expenses: [] as unknown[],
  receipts: [] as unknown[],
  prices: [] as unknown[],
  products: [] as unknown[],
  lines: [] as unknown[],
  setReceiptDiscount: vi.fn(),
}))
vi.mock('@/data/finance', async (o) => ({ ...(await o<typeof import('@/data/finance')>()), listExpenses: async () => data.expenses, listBudgetCategories: async () => categories, listTags: async () => [], listBudgets: async () => [], listClassSharesSafe: async () => new Map(), listResolvedInternalTransferDestinations: async () => [] }))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 1, listFamilyMembers: async () => [] }))
vi.mock('@/data/foodTypes', async (o) => ({ ...(await o<typeof import('@/data/foodTypes')>()), listFamilyFoodTypes: async (kind?: string) => types.filter((t) => !kind || t.kind === kind) }))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => data.prices, listProducts: async () => data.products, listProductPricesByReceipt: async () => data.lines }))
vi.mock('@/data/receipts', async (o) => ({
  ...(await o<typeof import('@/data/receipts')>()),
  listReceipts: async () => data.receipts,
  // Persistencia simulada: lo guardado lo ve cualquier lectura posterior.
  setReceiptDiscount: async (id: string, amount: number) => {
    data.setReceiptDiscount(id, amount)
    data.receipts = (data.receipts as Receipt[]).map((r) => (r.id === id ? ({ ...r, discountTotal: amount } as Receipt) : r))
  },
}))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))
vi.mock('@/data/cash', async (o) => ({ ...(await o<typeof import('@/data/cash')>()), listWalletsSafe: async () => [], listAllMovementsSafe: async () => [] }))

const { BudgetsTab } = await import('@/ui/FinanceScreen')
const { ShoppingScreen } = await import('@/ui/ShoppingScreen')

const product = (id: string, name: string, className: string | null): Product => ({ id, familyId: 'f', normalizedName: name.toLowerCase(), displayName: name, category: className, brand: null, nonFood: true, classConfirmedAt: className ? '2026-10-09' : null, classKind: className ? 'no_alimentos' : null }) as unknown as Product
const receipt = (o: Partial<Receipt> = {}): Receipt => ({ id: 'r1', familyId: 'f', expenseId: 'amz', store: 'Amazon', receiptDate: '2026-10-05', totalAmount: 48.52, category: 'Niños', storagePath: null, notes: null, purchasedByMemberId: null, discountTotal: 0, ...o }) as unknown as Receipt
const price = (id: string, productId: string, amount: number): ProductPrice => ({ id, productId, receiptId: 'r1', price: amount, quantity: '1', unit: null, store: 'Amazon', recordedDate: '2026-10-05' }) as unknown as ProductPrice
const line = (id: string, productId: string, name: string, amount: number) => ({ id, productId, name, price: amount, quantity: '1', unit: null, pack: null })

beforeEach(() => {
  takeStatsReturnContext()
  window.scrollTo = (() => undefined) as typeof window.scrollTo
  data.setReceiptDiscount.mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
  data.products = [
    product('p-tubos', 'Tubos de ensayo infantiles', 'Manualidades y creatividad'),
    product('p-plast', 'Juego de plastilina', 'Manualidades y creatividad'),
    product('p-color', 'Colorantes alimentarios', 'Manualidades y creatividad'),
    product('p-mont', 'Juego educativo Montessori', 'Juguetes'),
  ]
  data.expenses = [{ id: 'amz', familyId: 'f', expenseDate: '2026-10-05', amount: 48.52, category: 'Niños', store: 'Amazon', kind: 'real', notes: 'Tubos de ensayo… Montessori', isIncome: false, budgetGroup: 'generales', tagId: null, source: 'ticket_banco', isFixedOverride: null, ownerMemberId: null, shared: false, sharedFromExpenseId: null, productClassification: 'Juguetes', paymentMethod: null } as Expense]
  data.receipts = [receipt()]
  data.prices = [price('1', 'p-tubos', 10.95), price('2', 'p-plast', 15.99), price('3', 'p-color', 7.99), price('4', 'p-mont', 15.99)]
  data.lines = [line('1', 'p-tubos', 'Tubos de ensayo infantiles', 10.95), line('2', 'p-plast', 'Juego de plastilina', 15.99), line('3', 'p-color', 'Colorantes alimentarios', 7.99), line('4', 'p-mont', 'Juego educativo Montessori', 15.99)]
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('COR-09 · lógica de descuentos (pura)', () => {
  it('50,92 € − 2,40 € = 48,52 €: el reparto proporcional conserva los céntimos y la suma exacta', () => {
    const net = distributeDiscount([10.95, 15.99, 7.99, 15.99], 2.4)
    expect(Math.round(net.reduce((a, b) => a + b, 0) * 100) / 100).toBe(48.52)
    net.forEach((n, i) => expect(n).toBeLessThan([10.95, 15.99, 7.99, 15.99][i]))
    net.forEach((n) => expect(Math.round(n * 100) / 100).toBe(n)) // céntimos exactos
  })
  it('casos límite: sin descuento no cambia nada; 1 céntimo entre tres partes iguales; nunca supera lo que suman los productos', () => {
    expect(distributeDiscount([1.234, 5], 0)).toEqual([1.234, 5])
    const three = distributeDiscount([1, 1, 1], 0.01)
    expect(three.reduce((a, b) => a + b, 0)).toBeCloseTo(2.99, 10)
    expect(distributeDiscount([2, 3], 99).reduce((a, b) => a + b, 0)).toBe(0)
  })
  it('compareReceiptTotal: avisa pero NO asume qué es la diferencia', () => {
    const d = compareReceiptTotal(50.92, 0, 48.52)
    expect(d.kind).toBe('less_paid')
    expect(d.difference).toBe(-2.4)
    expect(d.suggestedDiscount).toBe(2.4)
    expect(compareReceiptTotal(50.92, 2.4, 48.52).kind).toBe('ok')
    const more = compareReceiptTotal(40, 0, 44.9) // p. ej. envío o artículo omitido
    expect(more.kind).toBe('more_paid')
    expect(more.suggestedDiscount).toBeNull()
  })
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

describe('COR-08 · compra mixta: manda la clase de cada producto', () => {
  it('el movimiento sigue siendo «Juguetes» (referencia manual) pero las estadísticas usan las clases de los 4 productos, sin duplicar el gasto', async () => {
    const manual = await classFilter('Manualidades y creatividad')
    expect(manual.expenseIds).toEqual(['amz'])
    expect(manual.imputed?.byExpense.amz).toBe(34.93) // 10,95 + 15,99 + 7,99 (precios originales: aún no hay descuento registrado)
    cleanup()
    const juguetes = await classFilter('Juguetes')
    expect(juguetes.expenseIds).toEqual(['amz'])
    expect(juguetes.imputed?.byExpense.amz).toBe(15.99) // solo el Montessori; el movimiento NO arrastra los 4 artículos a «Juguetes»
    expect((data.expenses[0] as Expense).productClassification).toBe('Juguetes') // la clasificación manual del movimiento no se toca
  })
})

describe('COR-09 · estadísticas con el descuento general registrado', () => {
  it('con −2,40 € registrado, lo que suman las clasificaciones es exactamente lo pagado: 48,52 €', async () => {
    data.receipts = [receipt({ discountTotal: 2.4 })]
    const manual = await classFilter('Manualidades y creatividad')
    cleanup()
    const juguetes = await classFilter('Juguetes')
    const total = Math.round(((manual.imputed?.byExpense.amz ?? 0) + (juguetes.imputed?.byExpense.amz ?? 0)) * 100) / 100
    expect(total).toBe(48.52)
    expect(manual.imputed?.byExpense.amz).toBeLessThan(34.93)
    expect(juguetes.imputed?.byExpense.amz).toBeLessThan(15.99)
    // el gasto cuenta una vez; los precios originales de los productos siguen siendo los de siempre
    expect((data.prices as ProductPrice[]).map((p) => p.price)).toEqual([10.95, 15.99, 7.99, 15.99])
  })

  it('sin descuento registrado las estadísticas no cambian (no se da por hecho que la diferencia sea un descuento)', async () => {
    const manual = await classFilter('Manualidades y creatividad')
    expect(manual.imputed?.byExpense.amz).toBe(34.93)
  })
})

async function openTicket() {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/compras', state: { tab: 'Tickets' } }]}>
      <ShoppingScreen />
    </MemoryRouter>,
  )
  fireEvent.click(await screen.findByRole('button', { name: /Amazon/ }))
  const summary = await screen.findByText(/05\/10\/2026/)
  fireEvent.click(summary.closest('button') as HTMLElement)
  await screen.findByText('Juego de plastilina', { exact: false })
}

describe('COR-09 · revisar y registrar el descuento en la compra', () => {
  it('avisa de la diferencia (50,92 € de productos frente a 48,52 € pagados) sin asumir que es un descuento, y ofrece registrar uno general', async () => {
    await openTicket()
    const box = await screen.findByTestId('receipt-difference')
    expect(box.textContent).toContain('no cuadran con lo pagado')
    expect(box.textContent).toContain('50,92 €')
    expect(box.textContent).toContain('48,52 €')
    expect(box.textContent).toContain('promoción')
    expect(box.textContent).toContain('envío')
    expect(data.setReceiptDiscount).not.toHaveBeenCalled() // avisar no es registrar
  })

  it('«Registrar un descuento general…» propone 2,40 €, se confirma y SOLO se guarda ese dato (compra, no movimiento ni precios)', async () => {
    await openTicket()
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar un descuento general…' }))
    const input = screen.getByLabelText('Descuento general confirmado (€)') as HTMLInputElement
    expect(input.value).toBe('2,40')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar descuento' }))
    await waitFor(() => expect(data.setReceiptDiscount).toHaveBeenCalledWith('r1', 2.4))
    expect(data.setReceiptDiscount).toHaveBeenCalledTimes(1)
    // tras guardar, la compra cuadra: ya no hay aviso y se ve el descuento registrado con opción de quitarlo
    await waitFor(() => expect(screen.queryByText(/no cuadran con lo pagado/)).toBeNull())
    expect(screen.getByText(/Descuento general registrado: −2,40 €/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Quitar descuento' })).toBeTruthy()
    expect((data.expenses[0] as Expense).amount).toBe(48.52)
    expect((data.receipts[0] as Receipt).totalAmount).toBe(48.52)
  })

  it('el importe se puede corregir antes de guardar y uno no válido no se guarda', async () => {
    await openTicket()
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar un descuento general…' }))
    const input = screen.getByLabelText('Descuento general confirmado (€)')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar descuento' }))
    expect(data.setReceiptDiscount).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '2,4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar descuento' }))
    await waitFor(() => expect(data.setReceiptDiscount).toHaveBeenCalledWith('r1', 2.4))
  })

  it('una compra que sí cuadra no muestra ningún aviso', async () => {
    data.receipts = [receipt({ discountTotal: 2.4 })]
    await openTicket()
    expect(screen.queryByText(/no cuadran con lo pagado/)).toBeNull()
    expect(screen.getByText(/Descuento general registrado/)).toBeTruthy()
  })

  it('si se pagó MÁS de lo que suman los productos, avisa (envío, artículo omitido…) pero no ofrece registrar un descuento', async () => {
    data.receipts = [receipt({ totalAmount: 55.9 })]
    await openTicket()
    const box = await screen.findByTestId('receipt-difference')
    expect(box.textContent).toContain('no cuadran con lo pagado')
    expect(screen.queryByRole('button', { name: 'Registrar un descuento general…' })).toBeNull()
  })
})

describe('COR-10 · del producto de una compra a su ficha de clasificación', () => {
  it('el nombre de cada producto de la compra abre su ficha en Historial de precios (donde ya se corrige la clasificación)', async () => {
    await openTicket()
    fireEvent.click(screen.getByRole('button', { name: 'Colorantes alimentarios' }))
    expect(await screen.findByRole('heading', { name: 'Colorantes alimentarios' })).toBeTruthy()
    const select = document.querySelector('select[data-help-id="shopping.product-class"]') as HTMLSelectElement
    expect(select.value).toBe('Manualidades y creatividad')
    // al ser una consulta (no viene de Estadísticas) la ficha no ofrece «Volver a Estadística compras»
    expect(screen.queryByText('← Volver a Estadística compras')).toBeNull()
  })
})
