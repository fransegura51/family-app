// «PENDIENTE DE CLASIFICAR» (Fase 6C.2B) — representación LÓGICA de category = NULL.
//
// Decisión de arquitectura: NO existe una categoría con ese nombre ni una columna de estado; solo NULL. Este módulo es el ÚNICO sitio
// que sabe qué significa NULL, para no repetir `category === null` por toda la aplicación:
//   * un gasto pendiente SIGUE SIENDO UN GASTO REAL: cuenta en el gasto total, el saldo, el ahorro, la evolución, la comparación mensual y el
//     presupuesto General;
//   * pero NO pertenece a ninguna categoría (ni «Otros», ni «Alimentación») y no consume ningún presupuesto de categoría;
//   * PENDING_LABEL es solo el texto con el que se MUESTRA; nunca se guarda en expenses.category ni en budget_categories.
//
// NO confundir con «Producto sin clasificar» (ProductNature 'desconocido', domain/products.ts): aquel es la naturaleza de un PRODUCTO
// (comida / no comida / no se sabe); este es la categoría FINANCIERA de un gasto o ticket. Son conceptos distintos y no comparten bandera.
import type { Expense } from '@/domain/types'

export const PENDING_LABEL = 'Pendiente de clasificar'

/** ¿Está esta categoría financiera todavía por clasificar? (category IS NULL). */
export function isPendingCategory(category: string | null | undefined): boolean {
  return category == null
}

export function isPendingExpense(e: Pick<Expense, 'category'>): boolean {
  return isPendingCategory(e.category)
}

export interface PendingSpending {
  /** Importe total de los gastos pendientes (euros, 2 decimales). */
  amount: number
  /** Nº de movimientos pendientes. */
  count: number
}

/** Suma y cuenta los pendientes de un conjunto de gastos YA filtrado (gasto real del periodo, etc.). No filtra nada por sí misma. */
export function pendingSpending(rows: readonly Pick<Expense, 'category' | 'amount'>[]): PendingSpending {
  let amount = 0
  let count = 0
  for (const e of rows) {
    if (!isPendingCategory(e.category)) continue
    amount += e.amount
    count++
  }
  return { amount: Math.round(amount * 100) / 100, count }
}

/**
 * ¿Es lo bastante relevante como para condicionar una respuesta? Un pendiente de 2 € sobre 3.000 € no debe convertir cada respuesta en una
 * advertencia: hace falta un mínimo absoluto Y un peso mínimo sobre el gasto total.
 */
export const PENDING_RELEVANT_MIN_EUR = 25
export const PENDING_RELEVANT_MIN_SHARE = 3 // %

export function isPendingRelevant(pending: PendingSpending, total: number): boolean {
  if (pending.count === 0 || total <= 0) return false
  return pending.amount >= PENDING_RELEVANT_MIN_EUR && (pending.amount / total) * 100 >= PENDING_RELEVANT_MIN_SHARE
}
