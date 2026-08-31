import type { Budget, Expense, KidWalletTransaction } from '@/domain/types'

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

// Solo cuenta gasto REAL, nunca estimado/previsto — Skill 19: "no
// presentar previsiones como gastos reales".
export function budgetSpent(budget: Budget, expenses: Expense[]): number {
  const { start, end } = budgetPeriodRange(budget)
  return expenses
    .filter((e) => e.expenseDate >= start && e.expenseDate < end)
    .filter((e) => budget.category == null || e.category === budget.category)
    .filter((e) => e.kind === 'real')
    .reduce((sum, e) => sum + e.amount, 0)
}

export function walletBalance(memberId: string, transactions: KidWalletTransaction[]): number {
  return transactions
    .filter((t) => t.memberId === memberId)
    .reduce((sum, t) => sum + (t.type === 'ingreso' ? t.amount : -t.amount), 0)
}
