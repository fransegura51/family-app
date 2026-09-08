import type { Budget, BudgetCategory, Expense, KidWalletTransaction } from '@/domain/types'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function budgetPeriodRange(budget: Pick<Budget, 'periodType' | 'periodStart'>): {
  start: string
  end: string
} {
  const start = new Date(budget.periodStart + 'T00:00')
  const end = new Date(start)
  if (budget.periodType === 'semanal') end.setDate(end.getDate() + 7)
  else end.setMonth(end.getMonth() + 1)
  return { start: budget.periodStart, end: toDateStr(end) }
}

// Solo cuenta gasto REAL, nunca estimado/previsto (Skill 19: "no
// presentar previsiones como gastos reales") y NUNCA ingresos, aunque
// tengan kind='real' (bug real: un presupuesto "General" sumaba
// también los ingresos apuntados ese mes, porque isIncome no se
// excluía).
//
// Un presupuesto de una categoría concreta (p. ej. "Luz") solo cuenta
// esa categoría. El total de Alimentación (con o sin categoría propia,
// p. ej. "Panadería") se calcula SIEMPRE a partir de `expenses`, nunca
// sumando `receipts.total_amount` aparte — cada ticket con importe ya
// crea su propio gasto real con la misma categoría (ver uploadReceipt),
// así que sumar las dos cosas sería contar el mismo euro dos veces. Esto
// además es justo lo que hace falta para cuando entren movimientos de
// banco (Módulo de conciliación): un movimiento conciliado se convierte
// en un gasto más, nunca en una tercera fuente de dinero aparte.
//
// Presupuesto "Generales" cuenta sus propias categorías MÁS el total de
// Alimentación completo (Alimentación ya no tiene presupuesto propio,
// solo "registro" — petición real: "el presupuesto general deduce
// todos los gastos como un único presupuesto").
export function isFoodCategory(category: string, categories: BudgetCategory[]): boolean {
  return category === 'Alimentación' || categories.some((c) => c.budgetGroup === 'alimentacion' && c.name === category)
}

// Skill de Pepa, puntos 15/16 — petición real: "la adjudicación de
// Quiero/Necesito/Debo y la de Fijo/Variable no debería ser manual
// sino automática... clasificar cada categoría desde un principio".
// La clasificación de un gasto se resuelve SIEMPRE desde su categoría
// (nunca se guarda en el propio gasto): una subcategoría sin
// clasificación propia hereda la de su categoría principal.
export interface CategoryClassification {
  necessity: 'debo' | 'necesito' | 'quiero' | null
  isFixed: boolean | null
}

export function resolveCategoryClassification(categoryName: string, categories: BudgetCategory[]): CategoryClassification {
  const cat = categories.find((c) => c.name === categoryName)
  if (!cat) return { necessity: null, isFixed: null }
  const parent = cat.parentId ? categories.find((c) => c.id === cat.parentId) : undefined
  return {
    necessity: cat.necessity ?? parent?.necessity ?? null,
    isFixed: cat.isFixed ?? parent?.isFixed ?? null,
  }
}

export function budgetSpent(
  budget: Budget,
  expenses: Expense[],
  context?: { categories: BudgetCategory[] },
): number {
  const { start, end } = budgetPeriodRange(budget)
  const periodExpenses = expenses.filter(
    (e) => e.expenseDate >= start && e.expenseDate < end && e.kind === 'real' && !e.isIncome,
  )

  if (budget.category) {
    return periodExpenses.filter((e) => e.category === budget.category).reduce((sum, e) => sum + e.amount, 0)
  }
  if (!context) {
    return periodExpenses.reduce((sum, e) => sum + e.amount, 0)
  }

  const { categories } = context
  const alimentacionTotal = periodExpenses
    .filter((e) => isFoodCategory(e.category, categories))
    .reduce((sum, e) => sum + e.amount, 0)
  if (budget.budgetGroup === 'alimentacion') return alimentacionTotal

  const ownGroupTotal = periodExpenses
    .filter((e) => categories.some((c) => c.budgetGroup === budget.budgetGroup && c.name === e.category))
    .reduce((sum, e) => sum + e.amount, 0)
  return ownGroupTotal + alimentacionTotal
}

// Lo que el niño/a tiene DISPONIBLE ahora mismo — no lo mismo que lo
// ingresado en total, porque lo que ha pasado a ahorro o a impuestos ya
// no está "en el bolsillo" para gastar (educación financiera: se pide
// explícitamente separar ingresos/ahorro/gastos/impuestos en vez de un
// único saldo mezclado).
export function walletBalance(memberId: string, transactions: KidWalletTransaction[]): number {
  return walletCategoryTotal(memberId, 'ingreso', transactions) - walletCategoryTotal(memberId, 'ahorro', transactions) - walletCategoryTotal(memberId, 'gasto', transactions) - walletCategoryTotal(memberId, 'impuesto', transactions)
}

export function walletCategoryTotal(
  memberId: string,
  type: KidWalletTransaction['type'],
  transactions: KidWalletTransaction[],
): number {
  return transactions
    .filter((t) => t.memberId === memberId && t.type === type)
    .reduce((sum, t) => sum + t.amount, 0)
}
