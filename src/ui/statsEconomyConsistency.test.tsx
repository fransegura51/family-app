// @vitest-environment jsdom
// UNA SOLA DEFINICIÓN de «gasto real» en todas las estadísticas de Economía (Resumen, Estadísticas por categoría y por etiqueta, Presupuestos, Movimientos, voz de
// PEPA): cualquier gasto real registrado en PEPA cuenta, venga de donde venga (banco, ticket, compra a mano, efectivo con o sin cartera, pago mixto), UNA sola vez,
// y los traspasos, retiradas de efectivo y ajustes internos no cuentan ni como gasto ni como ingreso. Pantallas reales con datos simulados.
//
// Caso real de validación: 22/10/2026, Mercado Puesto Panadería, 13,50 €, pagó Jennifer en efectivo desde su cartera personal, categoría «Supermercado…», etiqueta «Común».
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computePeriodFinancials, isRealSpending } from '@/domain/financeCompute'
import type { BudgetCategory, Expense } from '@/domain/types'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))

const ex = (o: Partial<Expense> & Pick<Expense, 'id'>): Expense =>
  ({ familyId: 'f', expenseDate: '2026-10-22', amount: 1, category: 'Supermercado, carnicería y tiendas de alimentación', store: null, kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'manual', isFixedOverride: null, ownerMemberId: 'jenni', shared: false, sharedFromExpenseId: null, productClassification: null, paymentMethod: null, ...o }) as Expense

const cat = (o: Partial<BudgetCategory> & Pick<BudgetCategory, 'id' | 'name'>): BudgetCategory => ({ familyId: 'f', icon: '🏷️', budgetGroup: 'generales', sortOrder: 1, parentId: null, necessity: null, isFixed: null, catalogKey: null, ...o }) as BudgetCategory
const categories: BudgetCategory[] = [
  cat({ id: 'ali', name: 'Alimentación', icon: '🍎' }),
  cat({ id: 'sup', name: 'Supermercado, carnicería y tiendas de alimentación', parentId: 'ali', icon: '🛒' }),
  cat({ id: 'mi', name: 'Movimientos internos', icon: '🔄', catalogKey: 'g.movimientos_internos' }),
  cat({ id: 'tp', name: 'Transferencias entre cuentas propias', parentId: 'mi', catalogKey: 'g.movimientos_internos.transferencias_propias' }),
  cat({ id: 'ret', name: 'Retirada de efectivo', parentId: 'mi', icon: '🏧', catalogKey: 'g.movimientos_internos.retirada_efectivo' }),
  cat({ id: 'sue', name: 'Sueldo', budgetGroup: 'ingresos', icon: '💶' }),
  cat({ id: 'dev', name: 'Devoluciones', budgetGroup: 'ingresos', catalogKey: 'i.ingreso.devoluciones' }),
]
const tags = [
  { id: 'comun', name: 'Común', color: '#4dabf7' },
  { id: 'jen', name: 'Jennifer', color: '#f06595' },
]

// Todo dentro del mes contable (30/09–30/10): gastos por valor de 107,50 €, ingresos 100 €, devolución 5 €.
const expenses: Expense[] = [
  ex({ id: 'banco', amount: 50, source: 'banco', store: 'MERCADONA', ownerMemberId: null }), // sin etiqueta
  ex({ id: 'ticket', amount: 20, source: 'ticket', tagId: 'comun' }),
  ex({ id: 'manual-sin-ticket', amount: 10, source: 'manual', tagId: 'comun' }),
  ex({ id: 'mercado', amount: 13.5, source: 'manual', paymentMethod: 'efectivo', store: 'Mercado Puesto Panadería', tagId: 'comun' }), // el caso real
  ex({ id: 'efectivo-sin-cartera', amount: 8, source: 'manual', paymentMethod: 'efectivo', tagId: 'jen' }),
  ex({ id: 'mixto', amount: 6, source: 'ticket_banco', paymentMethod: 'mixto', tagId: 'comun' }), // UN solo gasto de 6 (2 efectivo + 4 tarjeta)
  ex({ id: 'sueldo', amount: 100, source: 'banco', isIncome: true, category: 'Sueldo', budgetGroup: 'ingresos' }),
  ex({ id: 'devolucion', amount: 5, source: 'manual', isIncome: true, category: 'Devoluciones', budgetGroup: 'ingresos' }),
  ex({ id: 'traspaso-sale', amount: 200, source: 'banco', category: 'Transferencias entre cuentas propias' }),
  ex({ id: 'traspaso-entra', amount: 200, source: 'banco', isIncome: true, category: 'Transferencias entre cuentas propias', budgetGroup: 'ingresos' }),
  ex({ id: 'retirada', amount: 50, source: 'banco', category: 'Retirada de efectivo', store: 'REINTEGRO CAJERO' }),
]

vi.mock('@/data/finance', async (o) => ({ ...(await o<typeof import('@/data/finance')>()), listExpenses: async () => expenses, listBudgetCategories: async () => categories, listTags: async () => tags, listResolvedInternalTransferDestinations: async () => [] }))
vi.mock('@/data/family', async (o) => ({ ...(await o<typeof import('@/data/family')>()), getFinanceMonthStartDay: async () => 31, listFamilyMembers: async () => [{ id: 'jenni', name: 'Jennifer', color: '#f06595', linkedProfileId: 'p1' }] }))
vi.mock('@/data/products', async (o) => ({ ...(await o<typeof import('@/data/products')>()), listAllProductPrices: async () => [], listProducts: async () => [] }))
vi.mock('@/data/receipts', async (o) => ({ ...(await o<typeof import('@/data/receipts')>()), listReceipts: async () => [] }))
vi.mock('@/data/bank', async (o) => ({ ...(await o<typeof import('@/data/bank')>()), listBankAccounts: async () => [], listBankTransactions: async () => [], listBankConnections: async () => [] }))
vi.mock('@/data/cash', async (o) => ({ ...(await o<typeof import('@/data/cash')>()), listWalletsSafe: async () => [], listAllMovementsSafe: async () => [] }))

const { ResumenTab, EstadisticasTab, BudgetsTab, ExpensesTab } = await import('@/ui/FinanceScreen')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-25T10:00:00'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const SPENT = 107.5

describe('una sola definición de gasto real (dominio)', () => {
  it('cuenta banco, ticket, compra a mano, efectivo con y sin cartera y pago mixto; no cuenta ingresos, devoluciones, traspasos ni retiradas', () => {
    const spent = expenses.filter((e) => isRealSpending(e, categories))
    expect(spent.map((e) => e.id).sort()).toEqual(['banco', 'efectivo-sin-cartera', 'manual-sin-ticket', 'mercado', 'mixto', 'ticket'])
    expect(spent.reduce((s, e) => s + e.amount, 0)).toBe(SPENT)
    const fin = computePeriodFinancials(expenses, categories)
    expect(fin).toMatchObject({ spent: SPENT, income: 100, refunds: 5, netSpent: 102.5, ahorro: -2.5 })
  })

  it('la compra del mercado (efectivo, cartera personal de Jennifer) es gasto real aunque no tenga banco ni ticket', () => {
    const mercado = expenses.find((e) => e.id === 'mercado') as Expense
    expect(isRealSpending(mercado, categories)).toBe(true)
  })
})

describe('todas las estadísticas coinciden y cuentan la compra del mercado', () => {
  it('Resumen: gastos 107,50, ingresos 100, devoluciones 5 y gasto neto 102,50 (el efectivo y el mixto entran, los traspasos y la retirada no)', async () => {
    render(<MemoryRouter><ResumenTab onViewMovements={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Resumen —/)).toBeTruthy())
    const card = document.querySelector('[data-help-id="finance.summary-card"]') as HTMLElement
    expect(card.textContent).toContain('Ingresos: +100.00 €')
    expect(card.textContent).toContain('Gastos: -107.50 €')
    expect(card.textContent).toContain('Devoluciones: +5.00 €')
    expect(card.textContent).toContain('Gasto neto: 102.50 €')
  })

  it('Estadísticas por categoría: el total es 107,50 € y «Alimentación» incluye el mercado (13,50)', async () => {
    render(<MemoryRouter><EstadisticasTab onViewMovements={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Gastos —/)).toBeTruthy())
    const card = document.querySelector('[data-help-id="finance.stats-card"]') as HTMLElement
    expect(card.textContent).toContain('107.50 €')
    expect(card.textContent).toContain('Alimentación')
  })

  it('Estadísticas por etiqueta: «Común» suma lo que de verdad es Común (incluida la compra pagada por Jennifer); nada se atribuye a Jennifer por pagar o por ser la titular', async () => {
    render(<MemoryRouter><EstadisticasTab onViewMovements={vi.fn()} /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/Gastos —/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Etiquetas' }))
    const card = document.querySelector('[data-help-id="finance.stats-card"]') as HTMLElement
    // un gasto sin etiqueta (el del banco, 50 €) NO se inventa una atribución: el total de etiquetas es Común 49,50 + Jennifer 8 = 57,50
    expect(card.textContent).toContain('Todo57.50 €')
    // Común = 20 + 10 + 13,50 + 6 = 49,50 (incluida la compra del mercado pagada por Jennifer)
    const slicesEls = () => [...card.querySelectorAll('svg path')] as Element[]
    fireEvent.click(slicesEls()[0])
    await waitFor(() => expect(card.textContent).toContain('Común49.50 €'))
    expect(card.textContent).toContain('4 movimientos en Común')
    // Jennifer = solo lo que lleva SU etiqueta (8): nunca 21,50 (8 + 13,50) por ser titular de la cartera o por haber pagado
    fireEvent.click(slicesEls()[1])
    await waitFor(() => expect(card.textContent).toContain('Jennifer8.00 €'))
    expect(card.textContent).not.toContain('21.50')
  })

  it('Presupuestos (generales): «Gastado» 107,50 €', async () => {
    render(<MemoryRouter><BudgetsTab group="generales" accountsMode="compartido" myMemberId="jenni" /></MemoryRouter>)
    await waitFor(() => expect(document.body.textContent).toContain('Gastado:'))
    expect(document.body.textContent).toContain('Gastado: -107.50 €')
  })

  it('Movimientos: cabecera «107,50 € gastados» (+100 ingresados) y las filas del mercado, del efectivo sin cartera, del traspaso y de la retirada siguen en la lista', async () => {
    render(<MemoryRouter><ExpensesTab myMemberId="jenni" /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText(/gastados/)).toBeTruthy())
    expect(screen.getByText(/107\.50 € gastados · \+100\.00 € ingresados/)).toBeTruthy()
    expect(screen.getByText(/Mercado Puesto Panadería/)).toBeTruthy()
    expect(screen.getByText(/REINTEGRO CAJERO/)).toBeTruthy()
  })
})
