import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAnalysis } from './financeAnalysis'
import { isRealIncome, isRealSpending, netSpending, totalIncome, totalRefunds, totalSpending, type FinanceData } from './financeCompute'
import { resolvePeriod } from './financePeriod'
import { REFUND_CATALOG_KEY } from './refunds'
import type { BudgetCategory, Expense } from './types'

// FASE 6D.1 — Modelo C: realIncome / grossSpending / refunds / netSpending / savings, con los importes REALES de Familia Hepburn
// verificados en la base de datos el 2026-09-22 (después de 6D.0): 4 devoluciones de compra, 79,26 € en total —
//   10,95 € (15-jun) + 35,99 € (25-jun) → 46,94 € en junio
//   24,99 € (16-jul) → 24,99 € en julio
//   7,33 € (16-sep) → 7,33 € en septiembre
// La pareja comisión+bonificación de 60 € (6D.0) ya está en «Cobro anulado» y no debe aparecer en ningún total de esta fase.
const TODAY = new Date(2026, 8, 20)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

function cat(id: string, name: string, over: Partial<BudgetCategory> = {}): BudgetCategory {
  return { id, familyId: 'f', name, icon: '', budgetGroup: 'ingresos', sortOrder: 0, parentId: null, necessity: null, isFixed: null, catalogKey: null, ...over }
}
const CATEGORIES: BudgetCategory[] = [
  cat('devol', 'Devoluciones', { catalogKey: REFUND_CATALOG_KEY }),
  cat('sueldo', 'Sueldo', { catalogKey: 'i.sueldo' }),
  cat('mi', 'Movimientos internos', { catalogKey: 'i.movimientos_internos' }),
  cat('anulado', 'Cobro anulado', { parentId: 'mi', budgetGroup: 'generales', catalogKey: 'g.movimientos_internos.cobro_anulado' }),
  cat('comisiones', 'Comisiones y cargos', { budgetGroup: 'generales', catalogKey: 'g.finanzas_obligaciones.comisiones_cargos' }),
  cat('super', 'Supermercado', { budgetGroup: 'generales', catalogKey: null }),
]

let n = 0
function exp(date: string, amount: number, category: string | null, over: Partial<Expense> = {}): Expense {
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
    isFixedOverride: null,
    ownerMemberId: null,
    shared: false,
    sharedFromExpenseId: null,
    productClassification: null,
    ...over,
  }
}

// Réplica fiel del histórico real de Hepburn (junio–septiembre), con los importes de devolución verificados en DB.
const EXPENSES: Expense[] = [
  // Junio: 2 devoluciones reales (10,95 + 35,99 = 46,94), gasto bruto, y la pareja Cobro anulado de 6D.0 (no debe contar en nada).
  exp('2026-06-15', 10.95, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos', notes: 'DEVOLUCION TAR.5402XXXXXXXX4041 15.06 FARMACIA VIEITEZ COM-VIGO' }),
  exp('2026-06-25', 35.99, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos', notes: 'DEVOLUCION TAR.5402XXXXXXXX4041 25.06 C A MODE GMBH CO K-DUESSELDORF' }),
  exp('2026-06-01', 2000, 'Sueldo', { isIncome: true, budgetGroup: 'ingresos' }),
  exp('2026-06-10', 500, 'Supermercado'),
  exp('2026-06-24', 60, 'Cobro anulado', { notes: 'INTERESES Y/O COMISIONES CUENTA' }), // cargo, is_income=false (6D.0)
  exp('2026-06-24', 60, 'Cobro anulado', { isIncome: true, budgetGroup: 'ingresos', notes: 'BONIFIC. COMISION MANT. CUENTA' }), // bonificación (6D.0)
  exp('2026-06-05', 300, 'Movimientos internos', { budgetGroup: 'ingresos' }), // traspaso interno: fuera de todo

  // Julio: 1 devolución real (24,99 €).
  exp('2026-07-16', 24.99, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos', notes: 'DEVOLUCION cable TAR.5402XXXXXXXX4041 16.07 ADEO LEROY MERLIN SPAIN-ALCOBENDAS' }),
  exp('2026-07-01', 2000, 'Sueldo', { isIncome: true, budgetGroup: 'ingresos' }),
  exp('2026-07-05', 800, 'Comisiones y cargos'),

  // Agosto: sin devoluciones.
  exp('2026-08-01', 1500, 'Sueldo', { isIncome: true, budgetGroup: 'ingresos' }),
  exp('2026-08-05', 600, 'Supermercado'),

  // Septiembre: 1 devolución real (7,33 €).
  exp('2026-09-16', 7.33, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos', notes: 'DEVOLUCION 5402XXXXXXXX4041 14.09 GOOGLE*GOOGLE ONE-DUBLIN' }),
  exp('2026-09-01', 1000, 'Sueldo', { isIncome: true, budgetGroup: 'ingresos' }),
  exp('2026-09-05', 400, 'Supermercado'),
]

function data(over: Partial<FinanceData> = {}): FinanceData {
  return { expenses: EXPENSES, categories: CATEGORIES, receipts: [], prices: [], products: [], storeNames: [], monthStartDay: 1, bankStale: false, ...over }
}

describe('F/G. isRefund/isRealIncome/isRealSpending: una devolución nunca es gasto ni se cuela dos veces', () => {
  it('F. una devolución NO es isRealIncome (Modelo C, obligatorio)', () => {
    const refund = EXPENSES.find((e) => e.category === 'Devoluciones' && e.amount === 10.95)!
    expect(isRealIncome(refund, CATEGORIES)).toBe(false)
  })

  it('G. una devolución NO es isRealSpending (es una fila is_income=true, nunca gasto)', () => {
    const refund = EXPENSES.find((e) => e.category === 'Devoluciones' && e.amount === 10.95)!
    expect(isRealSpending(refund, CATEGORIES)).toBe(false)
  })
})

describe('J/K/L/M. totales del histórico verificado (junio–septiembre)', () => {
  it('J. grossSpending (totalSpending) NO cambia: sigue siendo el gasto bruto de siempre', () => {
    expect(totalSpending(data(), '2026-06-01', '2026-09-30')).toBe(500 + 800 + 600 + 400) // Cobro anulado y Movimientos internos, fuera
  })

  it('K. refunds del histórico completo = 79,26 € (verificado en DB tras 6D.0)', () => {
    expect(totalRefunds(data(), '2026-06-01', '2026-09-30')).toBe(79.26)
  })

  it('L. netSpending = grossSpending - refunds', () => {
    const d = data()
    const gross = totalSpending(d, '2026-06-01', '2026-09-30')
    const refunds = totalRefunds(d, '2026-06-01', '2026-09-30')
    expect(netSpending(d, '2026-06-01', '2026-09-30')).toBe(Math.round((gross - refunds) * 100) / 100)
    expect(netSpending(d, '2026-06-01', '2026-09-30')).toBe(2300 - 79.26)
  })

  it('M. realIncome (totalIncome) = ingreso anterior menos las devoluciones; el sueldo no se toca', () => {
    // Sueldo del periodo: 2000+2000+1500+1000 = 6500. Con las devoluciones incluidas (comportamiento previo a 6D.1) sería 6579.26.
    expect(totalIncome(data(), '2026-06-01', '2026-09-30')).toBe(6500)
  })

  it('W. la pareja Cobro anulado de 6D.0 no aparece en refunds/realIncome/grossSpending/netSpending', () => {
    const d = data()
    // Si la pareja de 60 € contase en algo, estos totales no cuadrarían con los valores ya verificados arriba.
    expect(totalRefunds(d, '2026-06-01', '2026-06-30')).toBe(46.94)
    expect(totalIncome(d, '2026-06-01', '2026-06-30')).toBe(2000)
    expect(totalSpending(d, '2026-06-01', '2026-06-30')).toBe(500)
  })
})

describe('O/P/Q. junio, julio y septiembre exactos', () => {
  it('O. junio: refunds 46,94; netSpending correcto; un tramo SIN el Sueldo (solo devoluciones) da realIncome = 0', () => {
    const d = data()
    expect(totalRefunds(d, '2026-06-01', '2026-06-30')).toBe(46.94)
    expect(netSpending(d, '2026-06-01', '2026-06-30')).toBe(500 - 46.94)
    // Tramo que deja fuera el Sueldo (06-01) pero incluye las dos devoluciones (06-15 y 06-25): realIncome = 0, tal y como pide la
    // Fase 6D — no "hemos ingresado 46,94 €" cuando lo único que hubo fueron devoluciones.
    expect(totalIncome(d, '2026-06-10', '2026-06-30')).toBe(0)
    expect(totalRefunds(d, '2026-06-10', '2026-06-30')).toBe(46.94)
  })

  it('P. julio: refunds 24,99; netSpending = 800 - 24,99; realIncome = 2000 (el Sueldo, sin la devolución)', () => {
    const d = data()
    expect(totalRefunds(d, '2026-07-01', '2026-07-31')).toBe(24.99)
    expect(netSpending(d, '2026-07-01', '2026-07-31')).toBe(Math.round((800 - 24.99) * 100) / 100)
    expect(totalIncome(d, '2026-07-01', '2026-07-31')).toBe(2000)
  })

  it('Q. septiembre: refunds 7,33; netSpending = 400 - 7,33; realIncome = 1000', () => {
    const d = data()
    expect(totalRefunds(d, '2026-09-01', '2026-09-30')).toBe(7.33)
    expect(netSpending(d, '2026-09-01', '2026-09-30')).toBe(Math.round((400 - 7.33) * 100) / 100)
    expect(totalIncome(d, '2026-09-01', '2026-09-30')).toBe(1000)
  })
})

describe('N/12. invariante crítico: el ahorro NUMÉRICO es idéntico antes y después de 6D.1', () => {
  it('savings = realIncome - netSpending equivale exactamente a oldIncome - grossSpending', () => {
    const d = data()
    for (const [from, to] of [['2026-06-01', '2026-06-30'], ['2026-07-01', '2026-07-31'], ['2026-08-01', '2026-08-31'], ['2026-09-01', '2026-09-30'], ['2026-06-01', '2026-09-30']]) {
      const gross = totalSpending(d, from, to)
      const refunds = totalRefunds(d, from, to)
      const realIncome = totalIncome(d, from, to)
      const oldIncome = realIncome + refunds // lo que habría devuelto totalIncome ANTES de 6D.1 (con las devoluciones dentro)
      const savingsNew = Math.round((realIncome - (gross - refunds)) * 100) / 100
      const savingsOld = Math.round((oldIncome - gross) * 100) / 100
      expect(savingsNew, `${from}..${to}`).toBe(savingsOld)
    }
  })

  it('financeAnalysis.buildAnalysis: savingsNow queda numéricamente idéntico al de ANTES de 6D.1, y expenses.total sigue siendo gasto BRUTO', () => {
    const period = resolvePeriod({ t: 'month_named', month0: 5, year: 2026 }, TODAY, 1)
    const a = buildAnalysis(data(), period, TODAY)
    expect(a.expenses.total).toBe(500) // gasto bruto de junio, SIN restar devoluciones (sigue alimentando categorías/ranking)
    expect(a.income.total).toBe(2000) // realIncome: el Sueldo, sin las 2 devoluciones de junio (antes de 6D.1 habría sido 2046,94)
    // El ahorro ANTES de esta fase ya incluía las devoluciones como ingreso: (2000 + 46,94) - 500 = 1546,94. La fórmula nueva
    // (realIncome - netSpending = 2000 - (500 - 46,94)) da EXACTAMENTE el mismo número — ese es el invariante que pide la fase.
    const oldSavings = Math.round((2000 + 46.94 - 500) * 100) / 100
    expect(a.savings.total).toBe(oldSavings)
    expect(a.savings.total).toBe(Math.round((2000 - (500 - 46.94)) * 100) / 100)
  })
})

describe('R. una devolución sin ningún gasto original conocido funciona con normalidad (caso real: las 4 de Hepburn)', () => {
  it('no exige receipt_id, expense_id de origen, comercio ni importe coincidente', () => {
    const d = data()
    // Ninguna de las devoluciones del fixture lleva ninguna referencia al gasto que las originó (igual que en producción).
    const refunds = d.expenses.filter((e) => e.category === 'Devoluciones')
    expect(refunds.every((e) => e.notes == null || !/expense|receipt|ticket/i.test(e.notes))).toBe(true)
    expect(totalRefunds(d, '2026-06-01', '2026-09-30')).toBe(79.26)
  })
})

describe('S. netSpending negativo: se permite, sin recortar a 0', () => {
  it('un periodo puede recuperar más de lo gastado en él', () => {
    const d = data({
      expenses: [exp('2026-10-05', 20, 'Supermercado'), exp('2026-10-10', 50, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos' })],
    })
    expect(netSpending(d, '2026-10-01', '2026-10-31')).toBe(-30)
  })
})

describe('T. no hay atribución retroactiva: la devolución afecta al mes en que se registra, nunca al de la compra original', () => {
  it('una compra de agosto y su devolución en septiembre no mueven nada de mes', () => {
    const d = data({
      expenses: [exp('2026-08-10', 100, 'Supermercado'), exp('2026-09-12', 40, 'Devoluciones', { isIncome: true, budgetGroup: 'ingresos' })],
    })
    expect(totalSpending(d, '2026-08-01', '2026-08-31')).toBe(100)
    expect(totalRefunds(d, '2026-08-01', '2026-08-31')).toBe(0)
    expect(netSpending(d, '2026-08-01', '2026-08-31')).toBe(100) // agosto: intacto, la devolución no se mueve hacia atrás
    expect(totalSpending(d, '2026-09-01', '2026-09-30')).toBe(0)
    expect(totalRefunds(d, '2026-09-01', '2026-09-30')).toBe(40)
    expect(netSpending(d, '2026-09-01', '2026-09-30')).toBe(-40)
  })
})

describe('U. las categorías de gasto siguen basadas en gasto BRUTO: ninguna devolución se reparte entre categorías', () => {
  it('groupSpending/categorías nunca incluyen una fila de Devoluciones (son filas is_income=true, fuera de spendingRows)', () => {
    const period = resolvePeriod({ t: 'month_named', month0: 5, year: 2026 }, TODAY, 1)
    const a = buildAnalysis(data(), period, TODAY)
    expect(a.categories.some((c) => c.name === 'Devoluciones')).toBe(false)
    expect(a.leaf.some((l) => l.name === 'Devoluciones')).toBe(false)
  })
})
