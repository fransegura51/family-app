// Datos de prueba controlados para los tests de Economía (solo lo importan los tests).
import type { FinanceData } from '@/domain/financeCompute'
import type { BudgetCategory, Expense, Product, ProductPrice, Receipt } from '@/domain/types'

// Hoy = 20 de septiembre de 2026.
export const TODAY = new Date(2026, 8, 20)

export function cat(id: string, name: string, parentId: string | null = null, over: Partial<BudgetCategory> = {}): BudgetCategory {
  return { id, familyId: 'f', name, icon: '', budgetGroup: 'generales', sortOrder: 0, parentId, necessity: null, isFixed: null, catalogKey: null, ...over }
}

export const SUPER = 'Supermercado, carnicería y tiendas de alimentación'
export const REST = 'Restaurantes, bares y cafeterías'

export const CATEGORIES: BudgetCategory[] = [
  cat('c1', 'Alimentación'),
  cat('c1a', SUPER, 'c1', { necessity: 'necesito', isFixed: false }),
  cat('c1b', REST, 'c1', { necessity: 'quiero', isFixed: false }),
  cat('c2', 'Transporte y vehículo', null, { necessity: 'necesito', isFixed: false }),
  cat('c5', 'Vivienda y hogar', null, { necessity: 'debo', isFixed: true }),
  cat('c3', 'Movimientos internos'),
  cat('c3a', 'Transferencias entre cuentas propias', 'c3'),
  cat('c4', 'Sueldo'),
]

let n = 0
export function exp(date: string, amount: number, category: string, extra: Partial<Expense> = {}): Expense {
  n++
  return {
    id: `e${n}`,
    familyId: 'f',
    expenseDate: date,
    amount,
    category,
    store: null,
    kind: 'real',
    notes: null,
    isIncome: false,
    budgetGroup: 'generales',
    tagId: null,
    source: 'banco',
    ...extra,
  } as Expense
}

// Septiembre 1-20: 230 € de gasto. Agosto 1-20: 150 € (agosto completo: 220 €).
export const EXPENSES: Expense[] = [
  exp('2026-09-03', 100, SUPER, { store: 'MERCADONA VALENCIA', source: 'ticket_banco' }),
  exp('2026-09-10', 60, SUPER, { store: 'Aldi' }),
  exp('2026-09-12', 90, REST, { notes: 'CONCEPTO BANCARIO SECRETO ES7620770024003102575766' }),
  exp('2026-09-05', 30, 'Transporte y vehículo'),
  exp('2026-09-08', 500, 'Transferencias entre cuentas propias'),
  exp('2026-09-01', 2000, 'Sueldo', { isIncome: true }),
  exp('2026-08-04', 80, SUPER, { store: 'Mercadona' }),
  exp('2026-08-25', 70, SUPER, { store: 'Mercadona' }),
  exp('2026-08-14', 20, REST),
  exp('2026-08-08', 50, 'Transporte y vehículo'),
  exp('2026-08-25', 300, 'Vivienda y hogar'),
  exp('2026-08-01', 2000, 'Sueldo', { isIncome: true }),
]

export const PRODUCTS: Product[] = [
  { id: 'q1', familyId: 'f', normalizedName: 'queso rallado', displayName: 'Queso rallado', category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null },
  { id: 'l1', familyId: 'f', normalizedName: 'leche entera', displayName: 'Leche entera', category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null },
]

// Los precios de estos tests son líneas de un TICKET de supermercado categorizado como Alimentación (la evidencia de comida para un producto sin clase).
export const FOOD_RECEIPT = { id: 'r-food', familyId: 'f', storagePath: null, store: 'Mercadona', receiptDate: '2026-09-01', totalAmount: null, expenseId: null, notes: null, category: 'Alimentación', purchasedByMemberId: null } as Receipt
let pid = 0
export function price(productId: string, date: string, value: number, store: string | null): ProductPrice {
  pid++
  return { id: `p${pid}`, productId, price: value, store, quantity: '1', unit: null, recordedDate: date, receiptId: 'r-food' }
}

export const PRICES: ProductPrice[] = [
  price('q1', '2026-08-05', 2.0, 'Mercadona'),
  price('q1', '2026-09-04', 2.4, 'Mercadona'),
  price('l1', '2026-08-06', 1.0, 'Mercadona'),
  price('l1', '2026-09-06', 0.9, 'Mercadona'),
]

export function financeData(over: Partial<FinanceData> = {}): FinanceData {
  return { expenses: EXPENSES, categories: CATEGORIES, receipts: [FOOD_RECEIPT], prices: PRICES, products: PRODUCTS, storeNames: ['Mercadona', 'Aldi'], monthStartDay: 1, bankStale: false, ...over }
}
