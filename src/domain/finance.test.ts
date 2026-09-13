import { describe, expect, it } from 'vitest'
import {
  budgetPeriodRange,
  budgetSpent,
  categoryColors,
  isFoodCategory,
  isInternalTransferCategory,
  resolveCategoryClassification,
  resolveExpenseFixed,
  walletBalance,
  walletCategoryTotal,
} from '@/domain/finance'
import type { Budget, BudgetCategory, Expense, KidWalletTransaction } from '@/domain/types'

function cat(over: Partial<BudgetCategory> & Pick<BudgetCategory, 'id' | 'name'>): BudgetCategory {
  return { familyId: 'f', icon: '', budgetGroup: 'generales', sortOrder: 0, parentId: null, necessity: null, isFixed: null, ...over }
}

// Árbol parecido al real de la familia (taxonomía maestra, migración 0076):
// todo en 'generales', Alimentación con subcategorías.
const categories: BudgetCategory[] = [
  cat({ id: 'ali', name: 'Alimentación', necessity: 'necesito', isFixed: false }),
  cat({ id: 'super', name: 'Supermercado', parentId: 'ali' }),
  cat({ id: 'viv', name: 'Vivienda y hogar', necessity: 'debo', isFixed: true }),
  cat({ id: 'hip', name: 'Alquiler / hipoteca', parentId: 'viv' }),
  cat({ id: 'ocio', name: 'Ocio y viajes', necessity: 'quiero', isFixed: false }),
  cat({ id: 'sub', name: 'Suscripciones', parentId: 'ocio', isFixed: true }),
  cat({ id: 'mov', name: 'Movimientos internos' }),
  cat({ id: 'tr', name: 'Transferencias entre cuentas propias', parentId: 'mov' }),
  cat({ id: 'sueldo', name: 'Sueldo', budgetGroup: 'ingresos' }),
]

function exp(over: Partial<Expense> & Pick<Expense, 'expenseDate' | 'amount' | 'category'>): Expense {
  return {
    id: 'e',
    familyId: 'f',
    store: null,
    kind: 'real',
    notes: null,
    isIncome: false,
    budgetGroup: 'generales',
    tagId: null,
    source: 'manual',
    isFixedOverride: null,
    ...over,
  }
}

describe('isFoodCategory', () => {
  it('la propia Alimentación y sus subcategorías cuentan como comida', () => {
    expect(isFoodCategory('Alimentación', categories)).toBe(true)
    expect(isFoodCategory('Supermercado', categories)).toBe(true)
  })
  it('otras categorías y las desconocidas no', () => {
    expect(isFoodCategory('Vivienda y hogar', categories)).toBe(false)
    expect(isFoodCategory('No existe', categories)).toBe(false)
  })
})

describe('isInternalTransferCategory', () => {
  it('reconoce la categoría y su subcategoría', () => {
    expect(isInternalTransferCategory('Movimientos internos', categories)).toBe(true)
    expect(isInternalTransferCategory('Transferencias entre cuentas propias', categories)).toBe(true)
    expect(isInternalTransferCategory('Sueldo', categories)).toBe(false)
  })
})

describe('resolveCategoryClassification', () => {
  it('una subcategoría sin clasificación propia hereda la de su principal', () => {
    expect(resolveCategoryClassification('Supermercado', categories)).toEqual({ necessity: 'necesito', isFixed: false })
    expect(resolveCategoryClassification('Alquiler / hipoteca', categories)).toEqual({ necessity: 'debo', isFixed: true })
  })
  it('lo propio manda sobre lo heredado, campo a campo', () => {
    // Suscripciones: isFixed propio (true), necessity heredada (quiero).
    expect(resolveCategoryClassification('Suscripciones', categories)).toEqual({ necessity: 'quiero', isFixed: true })
  })
  it('categoría desconocida → sin clasificar, nunca inventa', () => {
    expect(resolveCategoryClassification('No existe', categories)).toEqual({ necessity: null, isFixed: null })
  })
})

describe('resolveExpenseFixed', () => {
  it('la marca del propio movimiento manda sobre la categoría', () => {
    expect(resolveExpenseFixed({ category: 'Supermercado', isFixedOverride: true }, categories)).toBe(true)
    expect(resolveExpenseFixed({ category: 'Alquiler / hipoteca', isFixedOverride: false }, categories)).toBe(false)
  })
  it('sin marca propia, sale de la categoría', () => {
    expect(resolveExpenseFixed({ category: 'Alquiler / hipoteca', isFixedOverride: null }, categories)).toBe(true)
    expect(resolveExpenseFixed({ category: 'No existe', isFixedOverride: null }, categories)).toBeNull()
  })
})

describe('budgetPeriodRange', () => {
  it('mensual: del día de inicio al mismo día del mes siguiente (excluido)', () => {
    expect(budgetPeriodRange({ periodType: 'mensual', periodStart: '2026-09-01' })).toEqual({ start: '2026-09-01', end: '2026-10-01' })
  })
  it('semanal: 7 días', () => {
    expect(budgetPeriodRange({ periodType: 'semanal', periodStart: '2026-09-01' })).toEqual({ start: '2026-09-01', end: '2026-09-08' })
  })
})

describe('budgetSpent', () => {
  const budgetBase: Budget = { id: 'b', familyId: 'f', periodType: 'mensual', periodStart: '2026-09-01', category: null, amount: 1000, budgetGroup: 'generales' }
  const expenses: Expense[] = [
    exp({ id: '1', expenseDate: '2026-09-05', amount: 20, category: 'Supermercado' }),
    exp({ id: '2', expenseDate: '2026-09-06', amount: 5, category: 'Supermercado', kind: 'estimado' }),
    exp({ id: '3', expenseDate: '2026-09-07', amount: 7, category: 'Supermercado', isIncome: true }),
    exp({ id: '4', expenseDate: '2026-09-10', amount: 500, category: 'Alquiler / hipoteca' }),
    exp({ id: '5', expenseDate: '2026-10-01', amount: 999, category: 'Supermercado' }),
  ]

  it('solo gasto REAL, nunca estimado ni ingresos, y solo dentro del periodo', () => {
    expect(budgetSpent({ ...budgetBase, category: 'Supermercado' }, expenses)).toBe(20)
  })
  it('sin categoría ni contexto: suma todo el gasto real del periodo', () => {
    expect(budgetSpent(budgetBase, expenses)).toBe(520)
  })
  it('el mismo euro no se cuenta dos veces aunque Alimentación esté en el mismo grupo', () => {
    // Tras la migración 0076 todas las categorías (Alimentación incluida)
    // viven en 'generales': el gastado de ese presupuesto tiene que ser
    // 520, no 540 (20 de Supermercado contados como "propio" Y como
    // "alimentación").
    expect(budgetSpent(budgetBase, expenses, { categories })).toBe(520)
  })
})

describe('categoryColors', () => {
  const colored: BudgetCategory[] = [
    cat({ id: 'ali', name: 'Alimentación' }),
    cat({ id: 'super', name: 'Supermercado', parentId: 'ali' }),
    cat({ id: 'restaurantes', name: 'Restaurantes', parentId: 'ali' }),
    cat({ id: 'viv', name: 'Vivienda y hogar' }),
    cat({ id: 'ocio', name: 'Ocio y viajes' }),
    cat({ id: 'mov', name: 'Movimientos internos' }),
  ]

  it('cada categoría principal tiene un color propio, distinto de las demás', () => {
    const colors = categoryColors(colored)
    const topLevelColors = [colors.get('ali'), colors.get('viv'), colors.get('ocio'), colors.get('mov')]
    expect(new Set(topLevelColors).size).toBe(topLevelColors.length)
  })
  it('una subcategoría comparte el tono de su categoría principal, no el color entero', () => {
    const colors = categoryColors(colored)
    const parentHue = colors.get('ali')?.match(/hsl\((\d+)/)?.[1]
    const childHue = colors.get('super')?.match(/hsl\((\d+)/)?.[1]
    expect(childHue).toBe(parentHue)
    expect(colors.get('super')).not.toBe(colors.get('ali'))
    expect(colors.get('super')).not.toBe(colors.get('restaurantes'))
  })
  it('el color no depende del ORDEN de la lista, solo del conjunto de nombres (no por posición)', () => {
    const full = categoryColors(colored)
    const reordered = categoryColors([...colored].reverse())
    expect(reordered.get('ali')).toBe(full.get('ali'))
    expect(reordered.get('viv')).toBe(full.get('viv'))
    expect(reordered.get('mov')).toBe(full.get('mov'))
  })
  it('varias categorías con el mismo sortOrder (bug real de sembrado duplicado) no colapsan en el mismo color', () => {
    // Caso real destapado al verificar en producción: una familia tenía
    // el árbol de categorías sembrado por triplicado, y dos de esas tres
    // copias completas compartían EXACTAMENTE el mismo sortOrder entre
    // sí — con el color basado en sortOrder, las ~10 categorías
    // principales de esas copias salían todas del mismo tono. El color
    // por nombre no depende de sortOrder, así que no le afecta.
    const duplicatedSortOrder: BudgetCategory[] = [
      cat({ id: 'a', name: 'Alimentación', sortOrder: 1000 }),
      cat({ id: 'b', name: 'Vivienda y hogar', sortOrder: 1000 }),
      cat({ id: 'c', name: 'Transporte y vehículo', sortOrder: 1000 }),
      cat({ id: 'd', name: 'Compras y familia', sortOrder: 1000 }),
    ]
    const colors = categoryColors(duplicatedSortOrder)
    const hues = [colors.get('a'), colors.get('b'), colors.get('c'), colors.get('d')]
    expect(new Set(hues).size).toBe(hues.length)
  })
  it('dos categorías duplicadas con el mismo nombre (mismo caso real) comparten color, no compiten por dos tonos', () => {
    const dup: BudgetCategory[] = [
      cat({ id: 'mov1', name: 'Movimientos internos', sortOrder: 500 }),
      cat({ id: 'mov2', name: 'Movimientos internos', sortOrder: 900000 }),
    ]
    const colors = categoryColors(dup)
    expect(colors.get('mov1')).toBe(colors.get('mov2'))
  })
})

describe('hucha de los niños', () => {
  const tx: KidWalletTransaction[] = [
    { id: '1', familyId: 'f', memberId: 'eric', type: 'ingreso', amount: 10, description: '', createdAt: '' },
    { id: '2', familyId: 'f', memberId: 'eric', type: 'ahorro', amount: 3, description: '', createdAt: '' },
    { id: '3', familyId: 'f', memberId: 'eric', type: 'gasto', amount: 2, description: '', createdAt: '' },
    { id: '4', familyId: 'f', memberId: 'eric', type: 'impuesto', amount: 1, description: '', createdAt: '' },
    { id: '5', familyId: 'f', memberId: 'fernando', type: 'ingreso', amount: 50, description: '', createdAt: '' },
  ]
  it('el disponible descuenta ahorro, gasto e impuestos, y no mezcla niños', () => {
    expect(walletBalance('eric', tx)).toBe(4)
    expect(walletBalance('fernando', tx)).toBe(50)
    expect(walletCategoryTotal('eric', 'ahorro', tx)).toBe(3)
  })
})
