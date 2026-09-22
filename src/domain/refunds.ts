// FASE 6D.1 — DEVOLUCIONES (Modelo C): identidad de una devolución de compra, independiente del nombre visible de la categoría.
//
// Una devolución NO es ingreso real (recuperas dinero de un gasto anterior, no ganas dinero nuevo) y NO es gasto real (es una fila
// is_income=true). Es un tercer concepto, con su propio total (`refunds`), que resta del gasto bruto para dar el gasto neto:
//   realIncome    = ingreso real, EXCLUYE movimientos internos, Cobro anulado Y devoluciones (ver isRealIncome, financeCompute.ts)
//   grossSpending = gasto real tal cual siempre (totalSpending, sin cambios — sigue sin incluir nunca las devoluciones, que son filas
//                   is_income=true)
//   refunds       = suma de devoluciones reales del periodo en que se REGISTRAN (nunca se atribuyen retroactivamente al mes de la
//                   compra original: no existe ese vínculo, ver más abajo)
//   netSpending   = grossSpending − refunds (puede ser negativo: un periodo puede recuperar más de lo gastado en él)
//   savings       = realIncome − netSpending (numéricamente IDÉNTICO al ahorro de antes de esta fase, ver financeCompute/financeAnalysis)
//
// Identidad ESTABLE: la clave del catálogo (`i.ingreso.devoluciones`), NUNCA el nombre visible de la categoría — el nombre puede
// traducirse, renombrarse o (si alguna familia crease una categoría personal también llamada «Devoluciones», sin ese catalog_key) no
// referirse a esto en absoluto. Este módulo es el ÚNICO sitio que conoce esa clave; nadie más compara por nombre.
//
// Una devolución sin ningún gasto original conocido (el caso real y habitual hoy: ninguna de las devoluciones de Hepburn tiene un
// gasto original vinculado) es un caso NORMAL, no una excepción: no se exige receipt_id, expense_id de origen, comercio ni importe
// coincidente. Vincular una devolución a su compra original queda fuera de esta fase.
import type { BudgetCategory, Expense } from '@/domain/types'

/** Clave estable del catálogo para la categoría de ingreso «Devoluciones» (ver supabase/migrations, catalog_categories). */
export const REFUND_CATALOG_KEY = 'i.ingreso.devoluciones'

/**
 * ¿Es esta categoría (por nombre, resuelta contra las categorías reales de la familia) la de devoluciones? Se decide SIEMPRE por
 * `catalogKey`, nunca por el nombre: una categoría personal que se llame igual pero no tenga esa clave NO cuenta como devolución, y
 * renombrar la categoría estándar no le hace perder su identidad.
 */
export function isRefundCategory(category: string | null | undefined, categories: readonly Pick<BudgetCategory, 'name' | 'catalogKey'>[]): boolean {
  if (category == null) return false
  return categories.find((c) => c.name === category)?.catalogKey === REFUND_CATALOG_KEY
}

/**
 * ¿Es esta fila una devolución real? Solo `kind === 'real'` (nunca un movimiento estimado o previsto) con la categoría de
 * devoluciones. No exige `isIncome`: esa combinación (categoría de solo-ingresos en una fila que no lo es) no se da hoy por cómo
 * está construido el selector de categorías, y esta función no necesita presuponerlo — solo describe la categoría + el tipo de fila.
 */
export function isRefund(e: Pick<Expense, 'category' | 'kind'>, categories: readonly Pick<BudgetCategory, 'name' | 'catalogKey'>[]): boolean {
  return e.kind === 'real' && isRefundCategory(e.category, categories)
}
