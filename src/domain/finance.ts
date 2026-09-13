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
// Petición real: "Alimentación y General que antes eran las
// categorías principales se eliminan" — ya no hay un budget_group
// 'alimentacion' aparte (quedó vacío tras adoptar la taxonomía del
// documento maestro). "Es de Alimentación" ahora se resuelve por el
// propio árbol: la categoría "Alimentación" en sí, o cualquiera de sus
// subcategorías reales (Supermercado, Restaurantes...).
export function isFoodCategory(category: string, categories: BudgetCategory[]): boolean {
  if (category === 'Alimentación') return true
  const cat = categories.find((c) => c.name === category)
  if (!cat?.parentId) return false
  return categories.find((c) => c.id === cat.parentId)?.name === 'Alimentación'
}

// Petición real: "Categoría Movimientos internos debe estar también
// en Ingresos" — una transferencia entre cuentas propias no lleva
// isIncome=true (el banco la apunta como cualquier otro movimiento),
// pero desde el punto de vista de "dinero que entra" tiene que
// aparecer igual al filtrar por Ingresos en Banco.
export function isInternalTransferCategory(category: string, categories: BudgetCategory[]): boolean {
  if (category === 'Movimientos internos') return true
  const cat = categories.find((c) => c.name === category)
  if (!cat?.parentId) return false
  return categories.find((c) => c.id === cat.parentId)?.name === 'Movimientos internos'
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

// Bug real: los dónuts de categorías coloreaban cada porción según su
// POSICIÓN en la lista filtrada de ese mes (colors[i % colors.length]),
// así que la misma categoría cambiaba de color de un mes a otro, y dos
// categorías sin relación (p. ej. "Niños" y "Alimentación (total)")
// podían coincidir en el mismo color solo por casualidad de índice —
// petición real: "cada una debería tener uno propio, los de la misma
// categoría padre pueden tener matices del mismo color". Un color por
// categoría PRINCIPAL (id, no posición — estable siempre), y sus
// subcategorías comparten el mismo tono variando solo la luminosidad,
// para que se note el parentesco sin perder distinción entre ellas.
export function categoryColors(categories: BudgetCategory[]): Map<string, string> {
  const colors = new Map<string, string>()
  const topLevel = categories.filter((c) => !c.parentId)
  topLevel.forEach((parent) => {
    // El tono sale de `sortOrder` (fijo desde que se crea la categoría,
    // igual en cualquier pantalla) y NO de la posición dentro de esta
    // lista en concreto — una llamada con menos categorías (p. ej. solo
    // las de un grupo, o solo las que tuvieron gasto este mes) no debe
    // desplazar el color de las que sí están. 47° de salto entre
    // sortOrder sucesivos — sin divisores comunes pequeños con 360, así
    // el color no se repite ni con muchas categorías (a diferencia de
    // repartir 360/N a partes iguales, que sí puede volver a coincidir
    // con pocas categorías).
    const hue = Math.round((parent.sortOrder * 47) % 360)
    colors.set(parent.id, `hsl(${hue}, 65%, 46%)`)
    const children = [...categories.filter((c) => c.parentId === parent.id)].sort((a, b) => a.sortOrder - b.sortOrder)
    children.forEach((child, j) => {
      const lightness = children.length <= 1 ? 46 : Math.round(34 + (j * 32) / (children.length - 1))
      colors.set(child.id, `hsl(${hue}, 60%, ${lightness}%)`)
    })
  })
  return colors
}

// Petición real: "quiero que yo pueda seleccionar cada gasto, si es
// fijo o es variable... para saber cuánto tenemos de cada" — por
// defecto Fijo/Variable sigue viniendo de la categoría (arriba), pero
// un movimiento concreto puede llevar su propia marca que manda por
// encima (expense.isFixedOverride, ver 0082_expense_fixed_override.sql).
export function resolveExpenseFixed(expense: Pick<Expense, 'category' | 'isFixedOverride'>, categories: BudgetCategory[]): boolean | null {
  if (expense.isFixedOverride != null) return expense.isFixedOverride
  return resolveCategoryClassification(expense.category, categories).isFixed
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
  const isFood = (e: Expense) => isFoodCategory(e.category, categories)
  if (budget.budgetGroup === 'alimentacion') return periodExpenses.filter(isFood).reduce((sum, e) => sum + e.amount, 0)

  // Unión, no suma: desde la migración 0076 Alimentación y sus
  // subcategorías viven también en 'generales', así que "las categorías
  // propias del grupo" y "todo lo de alimentación" se solapan. Sumarlas
  // aparte (como se hacía) contaba dos veces cada euro de comida en el
  // gastado de Presupuesto Generales — bug real destapado por
  // finance.test.ts al preparar los tests.
  const inOwnGroup = (e: Expense) => categories.some((c) => c.budgetGroup === budget.budgetGroup && c.name === e.category)
  return periodExpenses.filter((e) => inOwnGroup(e) || isFood(e)).reduce((sum, e) => sum + e.amount, 0)
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
