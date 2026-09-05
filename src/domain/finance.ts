import type { Budget, BudgetCategory, Expense, KidWalletTransaction, Receipt } from '@/domain/types'

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
// esa categoría. Uno "General" (sin categoría) antes contaba TODOS los
// gastos de la familia sin distinción de a qué presupuesto
// pertenecían — bug real reportado: "¿de dónde salen los 5180€ de
// 4000€? No lo entiendo", porque sumaba también Alimentación,
// ingresos y cualquier gasto suelto de la pestaña Gastos. Con
// `context` (recibos + categorías), un "General" de Alimentación
// cuenta el gasto real de esa pestaña (tickets + categorías propias) y
// uno de Generales cuenta sus categorías más el total de Alimentación
// — igual que el quesito y el resumen de arriba, para que todo cuadre.
export function budgetSpent(
  budget: Budget,
  expenses: Expense[],
  context?: { receipts: Receipt[]; categories: BudgetCategory[] },
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

  const { receipts, categories } = context
  const alimentacionTotal =
    receipts.filter((r) => r.receiptDate >= start && r.receiptDate < end).reduce((sum, r) => sum + (r.totalAmount ?? 0), 0) +
    periodExpenses
      .filter((e) => categories.some((c) => c.budgetGroup === 'alimentacion' && c.name === e.category))
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
