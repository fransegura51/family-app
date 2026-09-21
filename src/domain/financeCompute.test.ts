import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { budgetSpent } from './finance'
import { answerFinanceQuery, formatEuros, isRealSpending, resolveTarget, totalIncome, totalSpending, type FinanceData } from './financeCompute'
import { parseFinanceQuestion, type FinanceQuery } from './financeQuery'
import type { Budget, BudgetCategory, Expense, Product, ProductPrice, Receipt } from './types'

// Hoy = 20 de septiembre de 2026.
const TODAY = new Date(2026, 8, 20)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

function cat(id: string, name: string, parentId: string | null = null): BudgetCategory {
  return { id, familyId: 'f', name, icon: '', budgetGroup: 'generales', sortOrder: 0, parentId, necessity: null, isFixed: null }
}
const CATEGORIES: BudgetCategory[] = [
  cat('c1', 'Alimentación'),
  cat('c1a', 'Supermercado, carnicería y tiendas de alimentación', 'c1'),
  cat('c1b', 'Restaurantes, bares y cafeterías', 'c1'),
  cat('c2', 'Transporte y vehículo'),
  cat('c3', 'Movimientos internos'),
  cat('c3a', 'Transferencias entre cuentas propias', 'c3'),
  cat('c4', 'Sueldo'),
]
const SUPER = 'Supermercado, carnicería y tiendas de alimentación'
const REST = 'Restaurantes, bares y cafeterías'

let n = 0
function exp(date: string, amount: number, category: string, extra: Partial<Expense> = {}): Expense {
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

const EXPENSES: Expense[] = [
  // Septiembre (1-20)
  exp('2026-09-03', 100, SUPER, { store: 'MERCADONA VALENCIA' }),
  exp('2026-09-10', 60, SUPER, { store: 'Aldi' }),
  exp('2026-09-12', 40, REST),
  exp('2026-09-05', 30, 'Transporte y vehículo'),
  exp('2026-09-25', 50, 'Transporte y vehículo'), // futuro dentro del mes
  exp('2026-09-08', 500, 'Transferencias entre cuentas propias'), // interno: no cuenta
  exp('2026-09-09', 999, SUPER, { kind: 'estimado' }), // previsión: no cuenta
  exp('2026-09-01', 2000, 'Sueldo', { isIncome: true }),
  exp('2026-09-02', 300, 'Transferencias entre cuentas propias', { isIncome: true }), // interno: no cuenta
  // Agosto
  exp('2026-08-04', 80, SUPER, { store: 'Mercadona' }),
  exp('2026-08-25', 70, SUPER, { store: 'Mercadona' }),
  exp('2026-08-14', 20, REST),
  exp('2026-08-08', 50, 'Transporte y vehículo'),
  exp('2026-08-01', 2000, 'Sueldo', { isIncome: true }),
  // Julio y junio
  exp('2026-07-10', 60, SUPER, { store: 'Aldi' }),
  exp('2026-07-15', 25, REST),
  exp('2026-06-10', 90, SUPER, { store: 'Mercadona' }),
]

const PRODUCTS: Product[] = [
  { id: 'q1', familyId: 'f', normalizedName: 'queso rallado', displayName: 'Queso rallado', category: null, brand: null, nonFood: false },
  { id: 'l1', familyId: 'f', normalizedName: 'leche entera', displayName: 'Leche entera', category: null, brand: null, nonFood: false },
  { id: 'p1', familyId: 'f', normalizedName: 'pan', displayName: 'Pan', category: null, brand: null, nonFood: false },
]
let pid = 0
function price(productId: string, date: string, priceValue: number, store: string | null): ProductPrice {
  pid++
  return { id: `p${pid}`, productId, price: priceValue, store, quantity: '1', unit: null, recordedDate: date, receiptId: null }
}
const PRICES: ProductPrice[] = [
  price('q1', '2026-08-05', 2.0, 'Mercadona'),
  price('q1', '2026-08-15', 2.1, 'Aldi'),
  price('q1', '2026-09-04', 2.4, 'Mercadona'),
  price('q1', '2026-09-11', 2.0, 'Aldi'),
  price('l1', '2026-08-06', 1.0, 'Mercadona'),
  price('l1', '2026-09-06', 0.9, 'Mercadona'),
  price('p1', '2026-09-06', 1.2, 'Mercadona'),
]

function data(over: Partial<FinanceData> = {}): FinanceData {
  return { expenses: EXPENSES, categories: CATEGORIES, receipts: [], prices: PRICES, products: PRODUCTS, storeNames: ['Mercadona', 'Aldi'], monthStartDay: 1, bankStale: false, ...over }
}

function ask(text: string, d: FinanceData = data()): string {
  const p = parseFinanceQuestion(text, TODAY)
  if (!p || p.kind !== 'query') throw new Error(`no es consulta: ${text}`)
  return answerFinanceQuery(p.query, d, TODAY).text
}

describe('formato', () => {
  it('euros a la española', () => {
    expect(formatEuros(1247.32)).toBe('1.247,32 €')
    expect(formatEuros(183.4)).toBe('183,40 €')
    expect(formatEuros(0)).toBe('0,00 €')
    expect(formatEuros(1234567.891)).toBe('1.234.567,89 €')
  })
})

describe('qué cuenta como gasto (misma definición que Economía)', () => {
  it('no cuenta ingresos, previsiones ni movimientos internos', () => {
    const rows = EXPENSES.filter((e) => isRealSpending(e, CATEGORIES))
    expect(rows.some((e) => e.kind !== 'real' || e.isIncome || e.category === 'Transferencias entre cuentas propias')).toBe(false)
  })
  it('el total coincide con budgetSpent (el cálculo de los presupuestos)', () => {
    const budget = { periodType: 'mensual', periodStart: '2026-09-01', category: 'Alimentación', budgetGroup: 'generales' } as unknown as Budget
    expect(budgetSpent(budget, EXPENSES, { categories: CATEGORIES })).toBe(totalSpending(data(), '2026-09-01', '2026-09-30', { category: 'Alimentación' }))
    const restaurants = { ...budget, category: REST } as Budget
    expect(budgetSpent(restaurants, EXPENSES, { categories: CATEGORIES })).toBe(totalSpending(data(), '2026-09-01', '2026-09-30', { category: REST }))
  })
  it('no mezcla fuentes: los tickets y precios no cambian el gasto (no hay doble conteo)', () => {
    const receipts = [{ id: 'r1', familyId: 'f', storagePath: null, store: 'Mercadona', receiptDate: '2026-09-03', totalAmount: 100, expenseId: 'e1', notes: null, category: SUPER, purchasedByMemberId: null }] as Receipt[]
    const withTickets = data({ receipts })
    const withoutTickets = data({ receipts: [], prices: [], products: [] })
    expect(totalSpending(withTickets, '2026-09-01', '2026-09-30')).toBe(totalSpending(withoutTickets, '2026-09-01', '2026-09-30'))
    expect(ask('¿Cuánto hemos gastado este mes?', withTickets)).toBe(ask('¿Cuánto hemos gastado este mes?', withoutTickets))
  })
})

describe('gasto, ingresos, ahorro', () => {
  it('1: gasto este mes, con comparación del mismo tramo', () => {
    // Septiembre completo 280 (con el de día 25); 1-20: 230 contra 1-20 de agosto: 150.
    expect(ask('¿Cuánto hemos gastado este mes?')).toBe('Este mes lleváis 280,00 € de gastos registrados. Son 80,00 € más que en el mismo periodo del mes anterior.')
  })
  it('2: el mes pasado (mes cerrado, sin comparación de tramo)', () => {
    expect(ask('¿Cuánto gastamos el mes pasado?')).toBe('El mes pasado habéis gastado 220,00 € de gastos registrados.')
  })
  it('3: ingresos', () => {
    expect(ask('¿Cuánto hemos ingresado este mes?')).toBe('Este mes lleváis 2.000,00 € de ingresos registrados.')
    expect(totalIncome(data(), '2026-09-01', '2026-09-30')).toBe(2000)
  })
  it('4: ahorro = ingresos - gastos', () => {
    expect(ask('¿Cuánto hemos ahorrado este mes?')).toContain('Ahorro: 1.720,00 €')
  })
  it('ahorro sin ingresos registrados: no se inventa', () => {
    const noIncome = data({ expenses: EXPENSES.filter((e) => !e.isIncome) })
    expect(ask('¿Cuánto hemos ahorrado este mes?', noIncome)).toContain('No tengo ingresos registrados este mes, así que no puedo calcular el ahorro')
  })
  it('gastar más de lo ingresado', () => {
    const poor = data({ expenses: [exp('2026-09-02', 100, 'Sueldo', { isIncome: true }), exp('2026-09-03', 250, SUPER)] })
    expect(ask('¿Cuánto hemos ahorrado este mes?', poor)).toContain('Habéis gastado 150,00 € más de lo que habéis ingresado')
  })
  it('13: agosto', () => {
    expect(ask('¿Cuánto gastamos en agosto?')).toBe('En agosto habéis gastado 220,00 € de gastos registrados.')
  })
})

describe('categorías y tiendas REALES', () => {
  it('6: alimentación incluye sus subcategorías', () => {
    expect(ask('¿Cuánto hemos gastado en alimentación este mes?')).toContain('200,00 € en Alimentación')
  })
  it('7: restaurantes', () => {
    expect(ask('¿Cuánto hemos gastado en restaurantes este mes?')).toContain('40,00 € en Restaurantes, bares y cafeterías')
  })
  it('"comida" se entiende como Alimentación; "supermercados" como la categoría de supermercado', () => {
    expect(ask('¿Cuánto hemos gastado en comida este mes?')).toContain('200,00 € en Alimentación')
    expect(ask('¿Cuánto hemos gastado en supermercados este año?')).toContain('en Supermercado, carnicería y tiendas de alimentación')
  })
  it('14: una tienda que existe en los datos (aunque el banco la escriba distinto)', () => {
    expect(ask('¿Cuánto gastamos en Mercadona este mes?')).toContain('100,00 € en Mercadona')
  })
  it('una tienda o categoría que no existe no se inventa', () => {
    expect(ask('¿Cuánto gastamos en Carrefour este mes?')).toBe('No encuentro ninguna categoría, tienda ni concepto llamado «carrefour» en tus datos, así que no lo calculo.')
    expect(ask('¿Cuánto hemos gastado en gasolina este mes?')).toContain('No encuentro ninguna categoría, tienda ni concepto')
  })
  it('sin la categoría en los datos, "supermercados" no se inventa', () => {
    const bare = data({ categories: CATEGORIES.filter((c) => !c.name.startsWith('Supermercado')), storeNames: [] })
    // Sin la categoría en la lista, se dice honestamente que es una coincidencia por texto del movimiento.
    expect(ask('¿Cuánto hemos gastado en supermercados este año?', bare)).toContain('movimientos cuya categoría, comercio o concepto lo mencionan')
    expect(ask('¿Cuánto hemos gastado en gasolina este año?', bare)).toContain('No encuentro ninguna categoría, tienda ni concepto')
  })
  it('un nombre ambiguo se pregunta', () => {
    const two = data({ categories: [...CATEGORIES, cat('x1', 'Ocio en casa'), cat('x2', 'Ocio y viajes')] })
    expect(resolveTarget('ocio', two)).toMatchObject({ kind: 'ambiguous' })
  })
  it('13: comida desde junio', () => {
    // Sept 200 + agosto 170 + julio 85 + junio 90
    expect(ask('¿Cuánto hemos gastado en comida desde junio?')).toContain('545,00 € en Alimentación')
  })
})

describe('en qué se gasta más', () => {
  it('5: por categoría principal, con porcentaje', () => {
    const text = ask('¿En qué hemos gastado más este mes?')
    expect(text).toContain('Este mes, 280,00 € en total')
    expect(text).toContain('Alimentación: 200,00 € (71 %)')
    expect(text).toContain('Transporte y vehículo: 80,00 € (29 %)')
  })
  it('con una categoría, se desglosa por sus subcategorías', () => {
    const p = parseFinanceQuestion('¿Cuánto hemos gastado en alimentación este mes?', TODAY)
    if (!p || p.kind !== 'query') throw new Error()
    const breakdown = answerFinanceQuery({ ...p.query, metric: 'top_categories', target: 'Alimentación' }, data(), TODAY).text
    expect(breakdown).toContain('Supermercado, carnicería y tiendas de alimentación: 160,00 €')
    expect(breakdown).toContain('Restaurantes, bares y cafeterías: 40,00 €')
  })
})

describe('comparaciones', () => {
  it('8: mismo tramo de días (1-20 contra 1-20)', () => {
    const text = ask('¿Hemos gastado más que el mes pasado?')
    expect(text).toContain('230,00 € frente a 150,00 €')
    expect(text).toContain('80,00 € más (+53,3 %)')
    expect(text).toContain('Comparo el mismo tramo de días')
    expect(text).toContain('del 1 al 20')
  })
  it('con "completo" se comparan meses enteros', () => {
    const p = parseFinanceQuestion('¿Hemos gastado más que el mes pasado? septiembre completo', TODAY)
    if (!p || p.kind !== 'query') throw new Error()
    const text = answerFinanceQuery({ ...p.query, full: true }, data(), TODAY).text
    expect(text).toContain('280,00 € frente a 220,00 €')
    expect(text).not.toContain('mismo tramo')
  })
  it('sin gastos en el periodo anterior no se compara', () => {
    const onlyNow = data({ expenses: EXPENSES.filter((e) => e.expenseDate >= '2026-09-01') })
    expect(ask('¿Hemos gastado más que el mes pasado?', onlyNow)).toContain('no puedo compararlo todavía')
  })
})

describe('por qué ha cambiado el gasto (reutiliza decomposeSpendChange)', () => {
  it('9: total, categorías que lo explican y cesta de tickets', () => {
    const text = ask('¿Por qué hemos gastado más este mes?')
    expect(text).toContain('80,00 € más que en el mes anterior')
    expect(text).toContain('mismo tramo de días')
    expect(text).toContain('Por categorías:')
    expect(text).toContain('Solo en la cesta de tickets')
    expect(text).toContain('Por precios')
    expect(text).toContain('puede no coincidir con el banco')
  })
  it('si en realidad se gasta menos, lo dice', () => {
    const less = data({ expenses: [exp('2026-09-03', 50, SUPER), exp('2026-08-03', 200, SUPER)] })
    expect(ask('¿Por qué hemos gastado más este mes?', less)).toContain('En realidad este mes lleváis 150,00 € menos')
  })
  it('sin tickets suficientes no separa precio y cantidad', () => {
    expect(ask('¿Por qué hemos gastado más este mes?', data({ prices: [] }))).toContain('No tengo tickets suficientes en los dos periodos')
  })
})

describe('precios y tiendas (solo líneas de ticket)', () => {
  it('10: productos que han subido', () => {
    expect(ask('¿Qué productos han subido más de precio?')).toContain('Queso rallado: 2,05 € → 2,20 € (+7,3 %)')
  })
  it('11: productos que han bajado', () => {
    expect(ask('¿Qué productos han bajado de precio?')).toContain('Leche entera: 1,00 € → 0,90 € (-10 %)')
  })
  it('sin compras de dos meses no compara', () => {
    expect(ask('¿Qué productos han subido más de precio?', data({ prices: [PRICES[6]] }))).toContain('No tengo suficientes compras registradas')
  })
  it('12: dónde es más barato, solo con datos suficientes y diciendo que es tu histórico', () => {
    const text = ask('¿Dónde compramos más barato el queso?')
    expect(text).toContain('Según tus compras registradas')
    expect(text).toContain('Queso rallado')
    expect(text).toContain('más barato en Aldi')
    expect(text).toContain('solo tu histórico')
  })
  it('12: con pocas compras no afirma nada', () => {
    const few = data({ prices: PRICES.filter((p) => p.productId === 'q1').slice(0, 2) })
    expect(ask('¿Dónde compramos más barato el queso?', few)).toContain('No tengo suficientes compras registradas')
  })
  it('un producto que nunca se ha comprado', () => {
    expect(ask('¿Dónde compramos más barato el jamón?')).toBe('No tengo compras registradas de «jamon», así que no puedo compararlo.')
  })
})

describe('datos incompletos', () => {
  it('sin ningún gasto en el periodo lo dice (no responde 0)', () => {
    expect(ask('¿Cuánto hemos gastado este mes?', data({ expenses: [] }))).toBe('No tengo gastos registrados este mes.')
    expect(ask('¿Cuánto hemos ingresado este mes?', data({ expenses: [] }))).toBe('No tengo ingresos registrados este mes.')
  })
  it('con la conexión del banco caducada avisa de que puede faltar gasto', () => {
    expect(ask('¿Cuánto hemos gastado este mes?', data({ bankStale: true }))).toContain('hay una conexión bancaria caducada')
  })
})

describe('continuaciones (la consulta que se recuerda es la ya resuelta)', () => {
  it('"¿Solo alimentación?" conserva el periodo resuelto', () => {
    const first = parseFinanceQuestion('¿Cuánto gastamos el mes pasado?', TODAY)
    if (!first || first.kind !== 'query') throw new Error()
    const answer = answerFinanceQuery(first.query, data(), TODAY)
    const only: FinanceQuery = { ...answer.query, target: 'alimentacion' }
    expect(answerFinanceQuery(only, data(), TODAY).text).toContain('El mes pasado habéis gastado 170,00 € en Alimentación')
  })
})

describe('redacción según el periodo', () => {
  it('un mes concreto sin datos: "en marzo"', () => {
    expect(ask('¿Cuánto gastamos en marzo?')).toBe('No tengo gastos registrados en marzo.')
    expect(ask('¿Cuánto hemos ahorrado en marzo?')).toContain('No tengo ingresos registrados en marzo')
  })
  it('con una categoría no repite "de gastos registrados"', () => {
    expect(ask('¿Cuánto hemos gastado en restaurantes el mes pasado?')).toBe('El mes pasado habéis gastado 20,00 € en Restaurantes, bares y cafeterías.')
  })
  it('precios de un mes concreto: "en agosto", sin repetir la preposición', () => {
    expect(ask('¿Qué productos han subido más de precio en agosto?')).toBe('No tengo suficientes compras registradas en agosto y el mes anterior para comparar precios todavía.')
  })
})
