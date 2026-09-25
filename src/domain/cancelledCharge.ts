// FASE CA-3 — identidad de la categoría «Cobro anulado» (cargo + abono que se cancelan entre sí, nunca
// gasto ni ingreso real — ver 0115_cancelled_charge_category y refunds.ts para el mismo patrón aplicado a
// «Devoluciones»). Mismo criterio que REFUND_CATALOG_KEY: la identidad la da SIEMPRE `catalogKey`, nunca
// el nombre visible — una categoría personal llamada igual sin esa clave no cuenta, y renombrar la
// categoría estándar no le hace perder su identidad. Este módulo es el único sitio que conoce esa clave.
import type { BudgetCategory } from '@/domain/types'

/** Clave estable del catálogo para la categoría «Cobro anulado» (hija de «Movimientos internos», lado `generales` — ver 0115). */
export const CANCELLED_CHARGE_CATALOG_KEY = 'g.movimientos_internos.cobro_anulado'

/** ¿Es esta categoría (por nombre, resuelta contra las categorías reales de la familia) la de «Cobro anulado»? Por `catalogKey`, nunca por nombre. */
export function isCancelledChargeCategory(category: string | null | undefined, categories: readonly Pick<BudgetCategory, 'name' | 'catalogKey'>[]): boolean {
  if (category == null) return false
  return categories.find((c) => c.name === category)?.catalogKey === CANCELLED_CHARGE_CATALOG_KEY
}

// Petición real: los selectores de categoría de un movimiento de INGRESO (FinanceScreen.tsx) solo
// mostraban `budgetGroup === 'ingresos'`, así que «Cobro anulado» (vive en `generales`, deliberado en
// 0115 para que isInternalTransferCategory la excluya de Gastado/Ingresado sin tocar cada sitio que lo
// calcula) nunca aparecía ahí — se podía corregir a mano en un GASTO, pero no en un INGRESO. Única fuente
// de verdad para los 3 selectores que antes repetían el filtro por separado: las de `ingresos` de
// siempre, MÁS «Cobro anulado» en concreto (no toda «Movimientos internos» de `generales` — esa ya tiene
// su propia fila del lado `ingresos`, añadir también la de `generales` duplicaría la etiqueta).
export function incomeSelectableCategories(categories: BudgetCategory[]): BudgetCategory[] {
  return categories.filter((c) => c.budgetGroup === 'ingresos' || isCancelledChargeCategory(c.name, categories))
}
