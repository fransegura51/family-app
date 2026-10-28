// ECO-CLASIF — «¿Cambiar también los movimientos anteriores de este comercio?». Lógica pura. Se ofrece como OPCIÓN VOLUNTARIA tras corregir una categoría:
// nunca se reclasifica el histórico por sí solo.
//   · Solo movimientos que creó el banco (source «banco»): los que ya tienen ticket (desglose real por producto) o los apuntó la familia no se tocan.
//   · Nunca uno que una persona ya decidió (category_source = manual).
//   · Mismo comercio (misma identidad), mismo sentido (gasto/ingreso) y con una categoría distinta de la nueva.
import { classifyMovement, buildLearningIndex, merchantKey, type FamilyCategoryRef } from '../../supabase/functions/_shared/bank/classifyMovement.ts'
import type { BudgetCategory, Expense } from '@/domain/types'

/** Categorías que son «movimientos internos» o anulaciones: nunca se mueven en bloque. */
const SYSTEM_CATEGORIES = new Set(['Cobro anulado', 'Movimientos internos', 'Retirada de efectivo', 'Transferencias entre cuentas propias'])

export function similarPastMovements(all: readonly Expense[], changed: Pick<Expense, 'id' | 'store' | 'isIncome'>, newCategory: string): Expense[] {
  const key = merchantKey(changed.store)
  if (!key) return []
  return all.filter(
    (e) =>
      e.id !== changed.id &&
      e.source === 'banco' &&
      e.kind === 'real' &&
      e.isIncome === changed.isIncome &&
      e.categorySource !== 'manual' &&
      e.category !== newCategory &&
      !(e.category != null && SYSTEM_CATEGORIES.has(e.category)) &&
      merchantKey(e.store) === key,
  )
}

export interface OtrosProposal {
  expense: Expense
  category: string
  /** 'auto' (confianza alta) o 'sugerida' (media). */
  confidence: 'alta' | 'media'
}

/**
 * Movimientos del banco que quedaron en «Otros» (o sin clasificar) y que ahora el clasificador sabe situar con fundamento. Solo propone; aplicarlo es
 * una decisión de la persona. No incluye los ya decididos a mano ni los dudosos (esos siguen pendientes).
 */
export function otrosReclassificationProposals(
  all: readonly Expense[],
  categories: readonly BudgetCategory[],
  memberNames: readonly string[] = [],
): OtrosProposal[] {
  const refs: FamilyCategoryRef[] = categories.map((c) => ({ name: c.name, catalogKey: c.catalogKey, budgetGroup: c.budgetGroup }))
  const learning = buildLearningIndex(all.filter((e) => e.store && !e.isIncome).map((e) => ({ store: e.store, category: e.category, source: e.categorySource ?? null })))
  const out: OtrosProposal[] = []
  for (const e of all) {
    if (e.source !== 'banco' || e.kind !== 'real' || e.isIncome || e.categorySource === 'manual') continue
    if (e.category != null && e.category !== 'Otros') continue
    const r = classifyMovement({ store: e.store, description: e.notes, isIncome: false, categories: refs, learning, memberNames })
    if (r.category && r.category !== 'Otros' && (r.confidence === 'alta' || r.confidence === 'media')) {
      out.push({ expense: e, category: r.category, confidence: r.confidence })
    }
  }
  return out
}
