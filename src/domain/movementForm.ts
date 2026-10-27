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
import { mainClassOf, resolveClassSplit, type ClassShare, type ClassSplitDraft } from '@/domain/classShares'
import { isComprasFamiliaCategory, isFoodCategory } from '@/domain/finance'
import { resolveTagSplit, type TagShare, type TagSplitDraft } from '@/domain/tagShares'
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
  // Varias clasificaciones con reparto (CLASIF-1). null = una sola clasificación (productClassification), como siempre.
  classSplit: ClassSplitDraft | null
  tagId: string
  // Varias etiquetas con reparto (ETQ-1). null = una sola etiqueta (tagId), como siempre.
  tagSplit: TagSplitDraft | null
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

// Encargo "COM-01" — un ticket NUEVO (nunca uno ya editado, que conserva su propia categoría) parte
// directamente de la subcategoría real "Supermercado, carnicería y tiendas de alimentación" (sembrada
// en 0076_category_necessity_taxonomy.sql bajo Alimentación), no de la categoría general "Alimentación"
// como antes — así no hace falta bajar un nivel a mano en el caso más frecuente. Si una familia borró o
// renombró esa subcategoría, cae al mismo "Alimentación" de siempre (nunca una categoría inventada).
export const RECEIPT_DEFAULT_SUBCATEGORY_NAME = 'Supermercado, carnicería y tiendas de alimentación'

export function defaultReceiptCategory(categories: BudgetCategory[]): string {
  const match = categories.find((c) => c.name === RECEIPT_DEFAULT_SUBCATEGORY_NAME)
  return match?.name ?? 'Alimentación'
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
    classSplit: null,
    tagId: '',
    tagSplit: null,
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
  const keep = after !== null && after === before
  return { ...draft, expenseCategory: next, productClassification: keep ? draft.productClassification : '', classSplit: keep ? draft.classSplit : null }
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
  return toIncome ? { ...draft, isIncome: true, store: '', productClassification: '', classSplit: null, isFixedOverride: null } : { ...draft, isIncome: false }
}

// Valores de un movimiento tal y como se guardan — LOS MISMOS al crear que al editar (por construcción: ambos
// llaman a esta función). Las reglas de qué datos tiene sentido guardar (clasificación solo con categoría que
// la admite; un ingreso sin establecimiento ni Fijo/Variable) las garantizan changeExpenseCategory /
// switchMovementType al EDITAR el borrador, así que un dato antiguo que no se ha tocado se conserva tal cual.
export interface MovementFieldValues {
  date: string
  amount: number
  /** Etiqueta única o, con reparto, la principal (la de mayor parte). */
  tagId: string | null
  /** Reparto entre varias etiquetas (2 o más) ya validado contra el importe; vacío si el movimiento lleva una sola etiqueta. */
  tagShares: TagShare[]
  /** Por qué el reparto no es válido (no se debe guardar hasta corregirlo); null si está bien o no hay reparto. */
  tagSplitError: string | null
  notes: string | null
  isFixedOverride: boolean | null
  /** Clasificación única o, con reparto, la principal (la de mayor parte). */
  productClassification: string | null
  /** Reparto entre varias clasificaciones (2 o más) ya validado contra el importe; vacío si el gasto lleva una sola. */
  classShares: ClassShare[]
  /** Por qué el reparto de clasificaciones no es válido (no se debe guardar hasta corregirlo); null si está bien o no hay reparto. */
  classSplitError: string | null
  store: string
}

/** Etiqueta principal de un reparto: la de mayor importe (a igualdad, la primera). */
export function mainTagOf(shares: readonly TagShare[]): string | null {
  let best: TagShare | null = null
  for (const s of shares) if (best === null || s.amount > best.amount) best = s
  return best?.tagId ?? null
}

export function movementFieldValues(draft: MovementDraft): MovementFieldValues {
  const amount = Number(draft.amount)
  const split = draft.tagSplit && draft.tagSplit.ids.length >= 2 ? resolveTagSplit(draft.tagSplit, amount) : null
  const shares = split && split.ok ? split.shares : []
  const classSplit = draft.classSplit && draft.classSplit.ids.length >= 2 ? resolveClassSplit(draft.classSplit, amount) : null
  const classShares = classSplit && classSplit.ok ? classSplit.shares : []
  return {
    date: draft.date,
    amount,
    tagId: split ? mainTagOf(shares) : draft.tagId || null,
    tagShares: shares,
    tagSplitError: split && !split.ok ? split.error : null,
    notes: draft.notes.trim() || null,
    isFixedOverride: draft.isFixedOverride,
    productClassification: classSplit ? mainClassOf(classShares) : draft.productClassification || null,
    classShares,
    classSplitError: classSplit && !classSplit.ok ? classSplit.error : null,
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
