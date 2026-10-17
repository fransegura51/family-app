// Gasto por TIPO de producto de los tickets («bebidas alcohólicas», «carne»…) por voz. Petición real (17/10/2026): «le pregunto cuánto hemos gastado en bebidas
// alcohólicas este mes y no sabe decírmelo, me dice que no lo reconoce».
import { describe, expect, it } from 'vitest'
import { answerFinanceQuery, mayBeProductClass, matchProductClasses, productClassSpending, resolveTarget, type FinanceData } from './financeCompute'
import { parseFinanceQuestion } from './financeQuery'
import type { BudgetCategory, Expense, Product, ProductPrice } from './types'

const TODAY = new Date(2026, 9, 17) // 17 de octubre de 2026

function cat(id: string, name: string): BudgetCategory {
  return { id, familyId: 'f', name, icon: '', budgetGroup: 'generales', sortOrder: 0, parentId: null, necessity: null, isFixed: null, catalogKey: null }
}
const CATEGORIES: BudgetCategory[] = [cat('c1', 'Alimentación'), cat('c2', 'Transporte')]

function product(id: string, displayName: string, over: Partial<Product> = {}): Product {
  return { id, familyId: 'f', normalizedName: displayName.toLowerCase(), displayName, category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null, ...over } as Product
}
const PRODUCTS: Product[] = [
  product('b1', 'Cerveza Mahou 6 latas'),
  product('b2', 'Vino tinto Rioja'),
  product('b3', 'Agua mineral'),
  product('l1', 'Leche entera'),
  // Clase elegida a mano por la familia: gana sobre lo que adivinaría el nombre.
  product('x1', 'Botella de la abuela', { category: 'Bebidas alcohólicas', classConfirmedAt: '2026-10-01T00:00:00Z' }),
]
let n = 0
function line(productId: string, date: string, price: number, quantity = '1'): ProductPrice {
  n++
  return { id: `pp${n}`, productId, price, store: 'Mercadona', quantity, unit: null, recordedDate: date, receiptId: 'r1' }
}
const PRICES: ProductPrice[] = [
  line('b1', '2026-10-03', 5.4), // octubre
  line('b2', '2026-10-09', 8.0, '2'), // octubre, 2 unidades = 16
  line('x1', '2026-10-12', 20),
  line('b3', '2026-10-03', 1.0), // no alcohólica
  line('l1', '2026-10-04', 1.1),
  line('b1', '2026-09-20', 5.0), // septiembre: no entra en «este mes»
]

function data(over: Partial<FinanceData> = {}): FinanceData {
  const expenses = [{ id: 'e1', familyId: 'f', expenseDate: '2026-10-03', amount: 50, category: 'Alimentación', store: 'Mercadona', kind: 'real', notes: null, isIncome: false, budgetGroup: 'generales', tagId: null, source: 'banco' } as Expense]
  return { expenses, categories: CATEGORIES, receipts: [], prices: PRICES, products: PRODUCTS, storeNames: ['Mercadona'], monthStartDay: 1, bankStale: false, ...over }
}

function ask(text: string, d: FinanceData = data()): string {
  const p = parseFinanceQuestion(text, TODAY)
  if (!p || p.kind !== 'query') throw new Error(`no es consulta: ${text}`)
  return answerFinanceQuery(p.query, d, TODAY).text
}

describe('gasto por tipo de producto', () => {
  it('«cuánto hemos gastado en bebidas alcohólicas este mes» suma las líneas de ticket de esa clase', () => {
    const text = ask('¿Cuánto hemos gastado en bebidas alcohólicas este mes?')
    // 5,40 (cerveza) + 16,00 (2 vinos) + 20,00 (clase elegida a mano) = 41,40; ni el agua ni la leche ni septiembre.
    expect(text).toContain('41,40 €')
    expect(text).toContain('Bebidas alcohólicas')
    expect(text).toContain('tickets')
  })

  it('también con «alcohol» y con «alcohólicas» sueltas', () => {
    expect(ask('cuánto gastamos en alcohol este mes')).toContain('41,40 €')
    expect(ask('cuánto hemos gastado en alcohólicas este mes')).toContain('Bebidas alcohólicas')
  })

  it('«bebidas» a secas es ambiguo: pregunta cuál', () => {
    const text = ask('cuánto hemos gastado en bebidas este mes')
    expect(text).toContain('Bebidas alcohólicas')
    expect(text).toContain('Bebidas no alcohólicas')
    expect(text).toContain('¿Cuál quieres?')
  })

  it('sin ningún producto de esa clase en el periodo, lo dice en vez de inventar un 0', () => {
    const text = ask('cuánto hemos gastado en bebidas alcohólicas este mes', data({ prices: [line('l1', '2026-10-04', 1.1)] }))
    expect(text).toContain('No tengo ningún producto de «Bebidas alcohólicas»')
  })

  it('una categoría de presupuesto con ese nombre sigue ganando (comportamiento de siempre)', () => {
    const d = data({ categories: [...CATEGORIES, cat('c3', 'Bebidas alcohólicas')] })
    expect(resolveTarget('bebidas alcoholicas', d, { allowClass: true })).toEqual({ kind: 'category', name: 'Bebidas alcohólicas' })
  })

  it('fuera de las preguntas de gasto no cambia nada: sin allowClass no se busca entre las clases', () => {
    expect(resolveTarget('bebidas alcoholicas', data()).kind).toBe('none')
  })

  it('productClassSpending cuenta precio × cantidad y solo el periodo pedido', () => {
    expect(productClassSpending(data(), '2026-10-01', '2026-10-31', 'Bebidas alcohólicas')).toEqual({ total: 41.4, lines: 3 })
    expect(productClassSpending(data(), '2026-09-01', '2026-09-30', 'Bebidas alcohólicas')).toEqual({ total: 5, lines: 1 })
  })

  it('mayBeProductClass solo avisa de lo que puede ser una clase (para cargar los tickets solo entonces)', () => {
    expect(mayBeProductClass('bebidas alcoholicas')).toBe(true)
    expect(mayBeProductClass('carne')).toBe(true)
    expect(mayBeProductClass('luz')).toBe(false)
    expect(mayBeProductClass(null)).toBe(false)
    expect(matchProductClasses('alcohol')).toEqual(['Bebidas alcohólicas'])
  })
})
