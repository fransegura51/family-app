import { describe, expect, it } from 'vitest'
import {
  buildNewExpenseInput,
  changeExpenseCategory,
  changeIncomeCategory,
  classificationKindFor,
  defaultExpenseCategory,
  defaultIncomeCategory,
  draftCategory,
  emptyMovementDraft,
  movementFieldValues,
  switchMovementType,
  type MovementDraft,
} from '@/domain/movementForm'
import { resolveCategoryClassification } from '@/domain/finance'
import type { BudgetCategory } from '@/domain/types'

function cat(overrides: Partial<BudgetCategory> & Pick<BudgetCategory, 'id' | 'name'>): BudgetCategory {
  return { familyId: 'f1', icon: '•', budgetGroup: 'generales', sortOrder: 0, parentId: null, necessity: null, isFixed: null, catalogKey: null, ...overrides }
}

// Categorías de ejemplo (nunca reglas universales: salen de la infraestructura real de cada familia).
const CATEGORIES: BudgetCategory[] = [
  cat({ id: 'ali', name: 'Alimentación', necessity: 'necesito', isFixed: false }),
  cat({ id: 'pan', name: 'Panadería', parentId: 'ali' }),
  cat({ id: 'cmp', name: 'Compras y familia', necessity: 'quiero', isFixed: false }),
  cat({ id: 'juguetes', name: 'Niños', parentId: 'cmp' }),
  cat({ id: 'hip', name: 'Hipoteca', necessity: 'debo', isFixed: true }),
  cat({ id: 'ocio', name: 'Ocio' }),
  cat({ id: 'sueldo', name: 'Sueldo', budgetGroup: 'ingresos' }),
  cat({ id: 'regalo', name: 'Regalo', budgetGroup: 'ingresos' }),
]

const TODAY = '2026-10-04'
const fresh = () => emptyMovementDraft(CATEGORIES, TODAY)

describe('Nuevo movimiento — borrador inicial (A/B)', () => {
  it('A. un gasto arranca con los mismos campos que Editar: tipo, categoría, fecha, importe, establecimiento, clasificación, etiqueta, concepto y «Según categoría»', () => {
    const d = fresh()
    expect(d).toEqual({
      isIncome: false,
      expenseCategory: 'Alimentación',
      incomeCategory: 'Sueldo',
      date: TODAY,
      amount: '',
      store: '',
      productClassification: '',
      tagId: '',
      notes: '',
      isFixedOverride: null,
    })
  })
  it('B. un ingreso conserva solo lo que le corresponde (sin establecimiento, clasificación ni Fijo/Variable)', () => {
    const d = switchMovementType({ ...fresh(), store: 'Mercadona', productClassification: 'Panadería', isFixedOverride: true }, true)
    expect(d.isIncome).toBe(true)
    expect(d.store).toBe('')
    expect(d.productClassification).toBe('')
    expect(d.isFixedOverride).toBeNull()
    expect(draftCategory(d)).toBe('Sueldo')
  })
  it('las categorías por defecto salen de las de la familia, no de una lista fija', () => {
    expect(defaultExpenseCategory([])).toBe('Alimentación')
    expect(defaultExpenseCategory([cat({ id: 'x', name: 'Mi categoría' })])).toBe('Mi categoría')
    expect(defaultIncomeCategory([])).toBe('Ingreso')
    expect(defaultIncomeCategory(CATEGORIES)).toBe('Sueldo')
  })
})

describe('Categoría → Clasificación (C/D)', () => {
  it('C. la lista de clasificaciones depende de la categoría: Alimentación (y su árbol) y Compras y familia (y su árbol); el resto no tiene', () => {
    expect(classificationKindFor('Alimentación', CATEGORIES)).toBe('alimentacion')
    expect(classificationKindFor('Panadería', CATEGORIES)).toBe('alimentacion')
    expect(classificationKindFor('Compras y familia', CATEGORIES)).toBe('no_alimentos')
    expect(classificationKindFor('Niños', CATEGORIES)).toBe('no_alimentos')
    expect(classificationKindFor('Hipoteca', CATEGORIES)).toBeNull()
    expect(classificationKindFor('Ocio', CATEGORIES)).toBeNull()
    expect(classificationKindFor(null, CATEGORIES)).toBeNull()
  })
  it('D. cambiar a una categoría de OTRO tipo limpia la clasificación incompatible (nunca se inventa otra)', () => {
    const withClass: MovementDraft = { ...fresh(), expenseCategory: 'Panadería', productClassification: '🍞 Panadería y bollería' }
    expect(changeExpenseCategory(withClass, 'Niños', CATEGORIES).productClassification).toBe('')
    expect(changeExpenseCategory(withClass, 'Hipoteca', CATEGORIES).productClassification).toBe('')
    expect(changeExpenseCategory(withClass, 'Ocio', CATEGORIES).productClassification).toBe('')
  })
  it('dentro del mismo tipo de lista la clasificación se conserva (misma lista de opciones)', () => {
    const withClass: MovementDraft = { ...fresh(), expenseCategory: 'Alimentación', productClassification: 'Panadería y bollería' }
    expect(changeExpenseCategory(withClass, 'Panadería', CATEGORIES).productClassification).toBe('Panadería y bollería')
  })
  it('categoría A (con clasificación) → B (sin lista) → de vuelta a A: no reaparece la clasificación antigua', () => {
    let d: MovementDraft = { ...fresh(), expenseCategory: 'Alimentación', productClassification: 'Panadería y bollería' }
    d = changeExpenseCategory(d, 'Hipoteca', CATEGORIES)
    d = changeExpenseCategory(d, 'Alimentación', CATEGORIES)
    expect(d.productClassification).toBe('')
  })
})

describe('Se guarda TODO en una sola operación (E…N)', () => {
  const full: MovementDraft = {
    isIncome: false,
    expenseCategory: 'Panadería',
    incomeCategory: 'Sueldo',
    date: '2026-10-03',
    amount: '12.50',
    store: 'Puesto Mercado Panadería',
    productClassification: 'Panadería y bollería',
    tagId: 'tag-eric',
    notes: '  Galletas y Mona ',
    isFixedOverride: null,
  }
  it('E–N. un gasto completo sale en un único objeto con clasificación, etiqueta, concepto, Necesito, fecha e importe', () => {
    expect(buildNewExpenseInput(full, CATEGORIES)).toEqual({
      date: '2026-10-03',
      amount: 12.5,
      category: 'Panadería',
      store: 'Puesto Mercado Panadería',
      kind: 'real',
      isIncome: false,
      budgetGroup: 'generales',
      tagId: 'tag-eric',
      notes: 'Galletas y Mona',
      isFixedOverride: null,
      productClassification: 'Panadería y bollería',
    })
  })
  it('L. Establecimiento y Concepto son datos distintos: cada uno en su campo', () => {
    const input = buildNewExpenseInput(full, CATEGORIES)
    expect(input.store).toBe('Puesto Mercado Panadería')
    expect(input.notes).toBe('Galletas y Mona')
    expect(input.store).not.toBe(input.notes)
  })
  it('H/I/J. Necesito «Según categoría» = null (por defecto), Fijo = true, Variable = false', () => {
    expect(buildNewExpenseInput(full, CATEGORIES).isFixedOverride).toBeNull()
    expect(buildNewExpenseInput({ ...full, isFixedOverride: true }, CATEGORIES).isFixedOverride).toBe(true)
    expect(buildNewExpenseInput({ ...full, isFixedOverride: false }, CATEGORIES).isFixedOverride).toBe(false)
  })
  it('sin etiqueta ni concepto: null (nunca cadenas vacías)', () => {
    const input = buildNewExpenseInput({ ...full, tagId: '', notes: '   ' }, CATEGORIES)
    expect(input.tagId).toBeNull()
    expect(input.notes).toBeNull()
  })
  it('una clasificación en blanco se guarda como null', () => {
    expect(buildNewExpenseInput({ ...full, productClassification: '' }, CATEGORIES).productClassification).toBeNull()
  })
  it('T. al crear y al editar el MISMO borrador se guardan EXACTAMENTE los mismos valores (movementFieldValues es la única fuente)', () => {
    const values = movementFieldValues(full)
    const created = buildNewExpenseInput(full, CATEGORIES)
    for (const key of ['tagId', 'notes', 'isFixedOverride', 'productClassification', 'store'] as const) expect(created[key]).toEqual(values[key])
    expect(created.date).toBe(values.date)
    expect(created.amount).toBe(values.amount)
  })
  it('el grupo de presupuesto sale de la categoría elegida, no de una lista fija', () => {
    expect(buildNewExpenseInput({ ...full, expenseCategory: 'Categoría propia' }, [...CATEGORIES, cat({ id: 'p', name: 'Categoría propia', budgetGroup: 'ingresos' })]).budgetGroup).toBe('ingresos')
  })
})

describe('Ingreso (B) y cambio Gasto ↔ Ingreso (O)', () => {
  const income: MovementDraft = { ...fresh(), isIncome: true, incomeCategory: 'Regalo', amount: '100', tagId: 'tag-x', notes: 'Cumpleaños' }
  it('B. un ingreso guarda categoría, fecha, importe, etiqueta y concepto; sin establecimiento, clasificación ni Fijo/Variable', () => {
    expect(buildNewExpenseInput(income, CATEGORIES)).toEqual({
      date: TODAY,
      amount: 100,
      category: 'Regalo',
      store: '',
      kind: 'real',
      isIncome: true,
      budgetGroup: 'generales',
      tagId: 'tag-x',
      notes: 'Cumpleaños',
      isFixedOverride: null,
      productClassification: null,
    })
  })
  it('O. Gasto → Ingreso → Gasto no deja datos ocultos: lo propio del gasto se vacía y no reaparece', () => {
    let d: MovementDraft = { ...fresh(), expenseCategory: 'Panadería', store: 'Horno', productClassification: 'Panadería y bollería', isFixedOverride: true, tagId: 't', notes: 'n', amount: '5' }
    d = switchMovementType(d, true)
    const asIncome = buildNewExpenseInput(d, CATEGORIES)
    expect(asIncome.store).toBe('')
    expect(asIncome.productClassification).toBeNull()
    expect(asIncome.isFixedOverride).toBeNull()
    d = switchMovementType(d, false)
    expect(d.store).toBe('')
    expect(d.productClassification).toBe('')
    expect(d.isFixedOverride).toBeNull()
    // …y lo común (importe, etiqueta, concepto) se conserva
    expect(d.amount).toBe('5')
    expect(d.tagId).toBe('t')
    expect(d.notes).toBe('n')
  })
  it('cada tipo recuerda su propia categoría (cambiar de tipo no arrastra la del otro)', () => {
    let d = changeExpenseCategory(fresh(), 'Ocio', CATEGORIES)
    d = changeIncomeCategory(d, 'Regalo')
    expect(draftCategory(switchMovementType(d, true))).toBe('Regalo')
    expect(draftCategory(switchMovementType(switchMovementType(d, true), false))).toBe('Ocio')
  })
  it('cambiar al mismo tipo no toca nada', () => {
    const d = fresh()
    expect(switchMovementType(d, false)).toBe(d)
  })
})

describe('Necesito «Según categoría» es dinámico (K)', () => {
  it('K. refleja Fijo/Variable/Sin clasificar de LA categoría elegida (nunca «Variable» fijo)', () => {
    expect(resolveCategoryClassification('Alimentación', CATEGORIES)).toEqual({ necessity: 'necesito', isFixed: false })
    expect(resolveCategoryClassification('Hipoteca', CATEGORIES)).toEqual({ necessity: 'debo', isFixed: true })
    expect(resolveCategoryClassification('Ocio', CATEGORIES)).toEqual({ necessity: null, isFixed: null })
    // una subcategoría hereda de su categoría principal
    expect(resolveCategoryClassification('Panadería', CATEGORIES)).toEqual({ necessity: 'necesito', isFixed: false })
  })
})
