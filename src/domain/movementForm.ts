// Economía — reglas del formulario de MOVIMIENTO compartidas por «Nuevo movimiento» (alta) y «Editar movimiento».
// Antes eran dos implementaciones independientes y el alta se había quedado atrás (sin clasificación, etiqueta,
// concepto ni Necesito). Todo lo que es una REGLA vive aquí, una sola vez; la parte visual vive en
// MovementFormFields (FinanceScreen.tsx), también compartida. Puro, sin Supabase.
//
// Qué datos tiene un movimiento y a quién aplican:
//  · Gasto e Ingreso: categoría, fecha, importe, etiqueta, concepto (notes).
//  · Solo Gasto: establecimiento, clasificación del producto (solo categorías de Alimentación / Compras y
//    familia, para «Reparto por clasificación» de Estadística compras) y Necesito/Fijo-Variable.
import { incomeSelectableCategories } from '@/domain/cancelledCharge'
import { isComprasFamiliaCategory, isFoodCategory } from '@/domain/finance'
import type { BudgetCategory } from '@/domain/types'

export type ClassificationKind = 'alimentacion' | 'no_alimentos'

export interface MovementDraft {
  isIncome: boolean
  // Un gasto y un ingreso tienen cada uno su categoría: cambiar de tipo no arrastra la del otro.
  expenseCategory: string | null
  incomeCategory: string | null
  date: string
  amount: string
  store: string
  productClassification: string
  tagId: string
  notes: string
  // null = «Según categoría» (opción por defecto); true = Fijo; false = Variable.
  isFixedOverride: boolean | null
}

export function draftCategory(draft: Pick<MovementDraft, 'isIncome' | 'expenseCategory' | 'incomeCategory'>): string | null {
  return draft.isIncome ? draft.incomeCategory : draft.expenseCategory
}

// Qué lista de clasificaciones aplica a una categoría de GASTO (null = ninguna: el campo no se muestra).
export function classificationKindFor(category: string | null, categories: BudgetCategory[]): ClassificationKind | null {
  if (isFoodCategory(category, categories)) return 'alimentacion'
  if (isComprasFamiliaCategory(category, categories)) return 'no_alimentos'
  return null
}

export function defaultExpenseCategory(categories: BudgetCategory[]): string {
  return categories[0]?.name ?? 'Alimentación'
}

export function defaultIncomeCategory(categories: BudgetCategory[]): string {
  return incomeSelectableCategories(categories)[0]?.name ?? 'Ingreso'
}

export function emptyMovementDraft(categories: BudgetCategory[], today: string): MovementDraft {
  return {
    isIncome: false,
    expenseCategory: defaultExpenseCategory(categories),
    incomeCategory: defaultIncomeCategory(categories),
    date: today,
    amount: '',
    store: '',
    productClassification: '',
    tagId: '',
    notes: '',
    isFixedOverride: null,
  }
}

// Cambiar la categoría de un GASTO: la clasificación del producto solo es válida mientras la categoría siga
// en el mismo tipo de lista (Alimentación ↔ Compras y familia usan listas distintas). Si deja de serlo, se
// LIMPIA — nunca se queda una clasificación incompatible ni se inventa otra. Dentro del mismo tipo se conserva.
export function changeExpenseCategory(draft: MovementDraft, next: string, categories: BudgetCategory[]): MovementDraft {
  const before = classificationKindFor(draft.expenseCategory, categories)
  const after = classificationKindFor(next, categories)
  return { ...draft, expenseCategory: next, productClassification: after !== null && after === before ? draft.productClassification : '' }
}

export function changeIncomeCategory(draft: MovementDraft, next: string): MovementDraft {
  return { ...draft, incomeCategory: next }
}

// Gasto ↔ Ingreso antes de guardar: un ingreso no lleva establecimiento, clasificación ni Fijo/Variable, así
// que al pasar a Ingreso se vacían (no quedan datos ocultos que se guardarían sin querer). Fecha, importe,
// etiqueta y concepto son comunes y se conservan. Al volver a Gasto esos tres campos arrancan vacíos / en
// «Según categoría», nunca con lo que se escribió antes de cambiar.
export function switchMovementType(draft: MovementDraft, toIncome: boolean): MovementDraft {
  if (draft.isIncome === toIncome) return draft
  return toIncome ? { ...draft, isIncome: true, store: '', productClassification: '', isFixedOverride: null } : { ...draft, isIncome: false }
}

// Valores de un movimiento tal y como se guardan — LOS MISMOS al crear que al editar (por construcción: ambos
// llaman a esta función). Las reglas de qué datos tiene sentido guardar (clasificación solo con categoría que
// la admite; un ingreso sin establecimiento ni Fijo/Variable) las garantizan changeExpenseCategory /
// switchMovementType al EDITAR el borrador, así que un dato antiguo que no se ha tocado se conserva tal cual.
export interface MovementFieldValues {
  date: string
  amount: number
  tagId: string | null
  notes: string | null
  isFixedOverride: boolean | null
  productClassification: string | null
  store: string
}

export function movementFieldValues(draft: MovementDraft): MovementFieldValues {
  return {
    date: draft.date,
    amount: Number(draft.amount),
    tagId: draft.tagId || null,
    notes: draft.notes.trim() || null,
    isFixedOverride: draft.isFixedOverride,
    productClassification: draft.productClassification || null,
    store: draft.store,
  }
}

// Entrada de addExpense para un movimiento NUEVO: todo en una sola inserción (nunca «guardar básico y
// completar con un segundo update»).
export function buildNewExpenseInput(draft: MovementDraft, categories: BudgetCategory[]) {
  const values = movementFieldValues(draft)
  if (draft.isIncome) {
    return {
      date: values.date,
      amount: values.amount,
      category: draft.incomeCategory ?? defaultIncomeCategory(categories),
      store: '',
      kind: 'real' as const,
      isIncome: true,
      budgetGroup: 'generales',
      tagId: values.tagId,
      notes: values.notes,
      isFixedOverride: null,
      productClassification: null,
    }
  }
  const category = draft.expenseCategory ?? defaultExpenseCategory(categories)
  return {
    date: values.date,
    amount: values.amount,
    category,
    store: values.store,
    kind: 'real' as const,
    isIncome: false,
    budgetGroup: categories.find((c) => c.name === category)?.budgetGroup,
    tagId: values.tagId,
    notes: values.notes,
    isFixedOverride: values.isFixedOverride,
    productClassification: values.productClassification,
  }
}
