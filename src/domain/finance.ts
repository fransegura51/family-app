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
// (category NULL = pendiente de clasificar: no pertenece a ninguna categoría, así que nunca es de Alimentación.)
export function isFoodCategory(category: string | null, categories: BudgetCategory[]): boolean {
  if (category == null) return false
  if (category === 'Alimentación') return true
  const cat = categories.find((c) => c.name === category)
  if (!cat?.parentId) return false
  return categories.find((c) => c.id === cat.parentId)?.name === 'Alimentación'
}

// "Compras no alimentos" (Registro Alimentación → Estadística compras)
// — aparte de los tickets/pedidos ya clasificados como no-comida,
// petición real: "aparte de tickets también se puede basar en Gastos
// Categorizados como Compras y familia" — cualquier gasto metido a
// mano bajo "Compras y familia" (Ropa, Niños, Casa y jardín,
// Tecnología, Mascotas, Regalos...) cuenta igual, aunque no tenga
// ningún ticket escaneado detrás.
export function isComprasFamiliaCategory(category: string | null, categories: BudgetCategory[]): boolean {
  if (category == null) return false
  if (category === 'Compras y familia') return true
  const cat = categories.find((c) => c.name === category)
  if (!cat?.parentId) return false
  return categories.find((c) => c.id === cat.parentId)?.name === 'Compras y familia'
}

// Petición real: "Categoría Movimientos internos debe estar también
// en Ingresos" — una transferencia entre cuentas propias no lleva
// isIncome=true (el banco la apunta como cualquier otro movimiento),
// pero desde el punto de vista de "dinero que entra" tiene que
// aparecer igual al filtrar por Ingresos en Banco.
export function isInternalTransferCategory(category: string | null, categories: BudgetCategory[]): boolean {
  if (category == null) return false
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

export function resolveCategoryClassification(categoryName: string | null, categories: BudgetCategory[]): CategoryClassification {
  if (categoryName == null) return { necessity: null, isFixed: null }
  const cat = categories.find((c) => c.name === categoryName)
  if (!cat) return { necessity: null, isFixed: null }
  const parent = cat.parentId ? categories.find((c) => c.id === cat.parentId) : undefined
  return {
    necessity: cat.necessity ?? parent?.necessity ?? null,
    isFixed: cat.isFixed ?? parent?.isFixed ?? null,
  }
}

// Paleta escogida a mano (no repartida por fórmula) para garantizar
// variedad real: un hash continuo (hue = f(nombre) % 360) puede dejar,
// solo por mala suerte con pocas categorías, huecos enteros sin cubrir
// — petición real tras verlo en producción: "no veo ningún amarillo,
// ni rojo ni naranja". Con ~11-16 categorías reales, una paleta ya
// pensada para cubrir todo el espectro (rojo, naranja, ámbar, verdes,
// azules, morados, rosas...) no deja huecos.
export const CATEGORY_PALETTE: { h: number; s: number; l: number }[] = [
  { h: 4, s: 75, l: 46 }, // rojo
  { h: 26, s: 90, l: 47 }, // naranja
  { h: 42, s: 90, l: 40 }, // ámbar/dorado
  { h: 78, s: 55, l: 38 }, // verde lima
  { h: 134, s: 45, l: 36 }, // verde
  { h: 158, s: 60, l: 34 }, // verde azulado
  { h: 188, s: 65, l: 38 }, // cian
  { h: 205, s: 75, l: 48 }, // azul cielo
  { h: 221, s: 70, l: 56 }, // azul
  { h: 243, s: 60, l: 62 }, // índigo
  { h: 262, s: 55, l: 58 }, // violeta
  { h: 283, s: 50, l: 46 }, // púrpura
  { h: 305, s: 50, l: 46 }, // magenta
  { h: 336, s: 60, l: 52 }, // rosa
  { h: 16, s: 50, l: 40 }, // terracota
  { h: 210, s: 20, l: 45 }, // pizarra (comodín si hay más de 15)
]

// Petición real: "en ninguna estadística utilices 2 veces el mismo
// color" — con más porciones que las 16 de la paleta de arriba
// (tiendas, sobre todo: una familia con muchos pedidos sueltos de
// Amazon/tiendas de ropa puede tener 10-15 fácilmente), reciclar con
// `% length` (bug real visto con el dónut "por tienda": pasada la 7ª
// tienda, STORE_COLORS repetía el mismo azul de la 1ª) vuelve a
// repetir colores tarde o temprano. A partir de la 16ª porción se
// genera un tono nuevo con el ángulo dorado (137.508°, la misma
// constante que usan los girasoles para no solapar semillas) en vez de
// dar la vuelta al principio — nunca coincide justo con uno ya usado.
const GOLDEN_ANGLE = 137.508
export function distinctPaletteEntries(count: number): { h: number; s: number; l: number }[] {
  return Array.from({ length: count }, (_, i) => {
    if (i < CATEGORY_PALETTE.length) return CATEGORY_PALETTE[i]
    const hue = Math.round((i * GOLDEN_ANGLE) % 360)
    const lightness = 40 + ((i * 13) % 30)
    return { h: hue, s: 65, l: lightness }
  })
}

// Bug real: los dónuts de categorías coloreaban cada porción según su
// POSICIÓN en la lista filtrada de ese mes (colors[i % colors.length]),
// así que la misma categoría cambiaba de color de un mes a otro, y dos
// categorías sin relación (p. ej. "Niños" y "Alimentación (total)")
// podían coincidir en el mismo color solo por casualidad de índice —
// petición real: "cada una debería tener uno propio, los de la misma
// categoría padre pueden tener matices del mismo color, pero deben ser
// fácilmente distinguibles". Un color por categoría PRINCIPAL (de la
// paleta de arriba, por orden alfabético de nombre — no por
// `sortOrder`: un intento con sortOrder se deshizo al verificar con
// datos reales, porque esta familia tiene el árbol de categorías
// sembrado por triplicado —bug de sembrado aparte, ver
// project_duplicate_category_seeding— y casi todas esas filas
// duplicadas comparten EXACTAMENTE el mismo sortOrder, así que salían
// todas del mismo color; el nombre no tiene ese problema, y de propina
// dos categorías duplicadas con el mismo nombre comparten color en vez
// de competir por dos tonos para "lo mismo"). Sus subcategorías
// comparten el tono, variando la luminosidad en un rango amplio para
// que se distingan bien entre ellas.
// Petición real: "que las estadísticas de categorías tengan su color
// pastel fijo... los mismos colores que la lista de Presupuesto" —
// categoryColors reparte los tonos según QUÉ categorías le llegan, y
// unas pantallas le pasaban todas las categorías y otras solo las de un
// grupo, así que la misma categoría salía de otro color según la
// pantalla. Aquí cada grupo (generales, ingresos...) se calcula por
// separado, con lo que da igual si se le pasa la lista entera o solo un
// grupo: el color de una categoría es siempre el mismo.
export function stableCategoryColors(categories: BudgetCategory[]): Map<string, string> {
  const groups = new Map<string, BudgetCategory[]>()
  for (const c of categories) groups.set(c.budgetGroup, [...(groups.get(c.budgetGroup) ?? []), c])
  const colors = new Map<string, string>()
  for (const list of groups.values()) for (const [id, color] of categoryColors(list)) colors.set(id, color)
  return colors
}

export function categoryColors(categories: BudgetCategory[]): Map<string, string> {
  const colors = new Map<string, string>()
  const topLevel = categories.filter((c) => !c.parentId)
  const distinctNames = [...new Set(topLevel.map((c) => c.name))].sort((a, b) => a.localeCompare(b, 'es'))
  const entries = distinctPaletteEntries(distinctNames.length)
  topLevel.forEach((parent) => {
    const palette = entries[distinctNames.indexOf(parent.name)]
    colors.set(parent.id, `hsl(${palette.h}, ${palette.s}%, ${palette.l}%)`)
    const children = [...categories.filter((c) => c.parentId === parent.id)].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'),
    )
    children.forEach((child, j) => {
      // Bug real visto en producción: con luminosidad demasiado oscura
      // (por debajo de ~30%) muchos tonos (sobre todo tierras/marrones)
      // se ven todos igual de "marrón oscuro" aunque el número de
      // luminosidad sea distinto — dos hermanas (p. ej. "Casa y jardín"
      // y "Niños") costaba distinguirlas a simple vista. Ahora varía
      // TANTO luminosidad (36 a 78, nunca demasiado oscura) COMO un
      // pequeño desplazamiento de tono (±14°) — dos ejes en vez de uno
      // hacen mucho más fácil distinguir subcategorías de una misma
      // familia, sin dejar de notarse que son de la misma familia.
      const t = children.length <= 1 ? 0.5 : j / (children.length - 1)
      const lightness = children.length <= 1 ? palette.l : Math.round(36 + t * 42)
      const hue = children.length <= 1 ? palette.h : Math.round((palette.h + (t - 0.5) * 28 + 360) % 360)
      colors.set(child.id, `hsl(${hue}, ${Math.max(40, palette.s - 10)}%, ${lightness}%)`)
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
  // Petición real: "el dinero traspasado a las cuentas de los niños no
  // debería contar como gasto" — un traspaso entre cuentas propias no
  // es gasto real de la familia (mismo criterio que Resumen/Estadísticas).
  const periodExpenses = expenses.filter(
    (e) =>
      e.expenseDate >= start &&
      e.expenseDate < end &&
      e.kind === 'real' &&
      !e.isIncome &&
      !isInternalTransferCategory(e.category, context?.categories ?? []),
  )

  if (budget.category) {
    // Bug real: "he creado un presupuesto para Alimentación y no se ha
    // deducido nada" — Alimentación es una categoría PADRE, y todo el
    // gasto real se apunta en sus subcategorías (Supermercado...), así
    // que comparar solo por igualdad exacta nunca encontraba nada. Un
    // presupuesto sobre una categoría padre deduce esa categoría y
    // cualquiera de sus subcategorías; sobre una subcategoría, deduce
    // solo esa (no tiene hijas propias en este árbol de dos niveles).
    const cats = context?.categories ?? []
    const budgetCat = cats.find((c) => c.name === budget.category)
    const childNames = budgetCat ? cats.filter((c) => c.parentId === budgetCat.id).map((c) => c.name) : []
    return periodExpenses
      .filter((e) => e.category === budget.category || (e.category != null && childNames.includes(e.category)))
      .reduce((sum, e) => sum + e.amount, 0)
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
  const inOwnGroup = (e: Expense) => e.category != null && categories.some((c) => c.budgetGroup === budget.budgetGroup && c.name === e.category)
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
