// REPARTO DE UN GASTO ENTRE VARIAS CLASIFICACIONES DE COMPRAS (CLASIF-1). Reutiliza la lógica del reparto por etiquetas (tagShares.ts): mismos modos (partes iguales,
// euros, porcentajes), mismo reparto en céntimos que suma SIEMPRE el importe exacto; aquí lo repartido son nombres de clasificación (family_food_types.name).
//
// Un gasto lleva una categoría contable, una o varias etiquetas y una o varias clasificaciones (conceptos distintos):
//   · Una sola clasificación (lo de siempre): expenses.product_classification, sin filas de reparto. Recibe el 100 %.
//   · Varias: filas en expense_class_shares que suman exactamente el importe; product_classification guarda la principal (la mayor parte).
//   · Si el gasto tiene un ticket con productos clasificados línea a línea, ese desglose manda: el reparto manual no se admite (no se cuenta dos veces).
// El gasto se cuenta UNA sola vez en el total; cada clasificación recibe solo su parte. Lo que no esté repartido cuenta como «Sin clasificar».
import {
  changeSplitMode,
  fromCents,
  resolveTagSplit,
  splitFromShares,
  startSplit,
  toCents,
  toggleSplitTag,
  type SplitMode,
  type SplitNoun,
  type SplitResult,
  type TagShare,
  type TagSplitDraft,
} from '@/domain/tagShares'

export interface ClassShare {
  className: string
  amount: number
}

/** Clave de «Sin clasificar» en los resúmenes por clasificación. */
export const NO_CLASS = ''

export const CLASS_NOUN: SplitNoun = { singular: 'clasificación', plural: 'clasificaciones' }

/** Borrador del editor: `ids` son los nombres de las clasificaciones elegidas. */
export type ClassSplitDraft = TagSplitDraft

export type ClassSharesByExpense = ReadonlyMap<string, readonly ClassShare[]>

const toClassShares = (shares: readonly TagShare[]): ClassShare[] => shares.map((s) => ({ className: s.tagId, amount: s.amount }))
const fromClassShares = (shares: readonly ClassShare[]): TagShare[] => shares.map((s) => ({ tagId: s.className, amount: s.amount }))

export type ClassSplitResult = { ok: true; shares: ClassShare[] } | { ok: false; error: string }

function mapResult(r: SplitResult): ClassSplitResult {
  return r.ok ? { ok: true, shares: toClassShares(r.shares) } : r
}

/** Resuelve el borrador contra el importe actual. Con menos de 2 clasificaciones no hay reparto (ok con []). */
export function resolveClassSplit(split: ClassSplitDraft | null, total: number): ClassSplitResult {
  return mapResult(resolveTagSplit(split, total, CLASS_NOUN))
}

/** Reparto inicial al añadir una segunda clasificación: a partes iguales (se puede cambiar). */
export function startClassSplit(names: readonly string[], total: number): ClassSplitDraft {
  return startSplit(names, total)
}

/** Al abrir un gasto que ya tiene reparto: el borrador parte de sus importes reales (modo «en euros»). */
export function classSplitFromShares(shares: readonly ClassShare[]): ClassSplitDraft | null {
  return splitFromShares(fromClassShares(shares))
}

export function changeClassSplitMode(split: ClassSplitDraft, mode: SplitMode, total: number): ClassSplitDraft {
  return changeSplitMode(split, mode, total)
}

/** Añadir o quitar una clasificación del reparto. null = quedan menos de dos (vuelve a una sola). */
export function toggleClassSplit(split: ClassSplitDraft, name: string, total: number): ClassSplitDraft | null {
  return toggleSplitTag(split, name, total)
}

/** Clasificación principal de un reparto: la de mayor importe (a igualdad, la primera). */
export function mainClassOf(shares: readonly ClassShare[]): string | null {
  let best: ClassShare | null = null
  for (const s of shares) if (best === null || s.amount > best.amount) best = s
  return best?.className ?? null
}

interface ExpenseForClasses {
  id: string
  amount: number
  productClassification: string | null
}

/** Reparto efectivo de un gasto: siempre suma su importe. Sin filas → la clasificación única (o «Sin clasificar») con el 100 %. */
export function classSharesOf(expense: ExpenseForClasses, byExpense: ClassSharesByExpense | undefined): ClassShare[] {
  const rows = byExpense?.get(expense.id)
  if (rows && rows.length >= 2) {
    const assigned = rows.reduce((s, r) => s + toCents(r.amount), 0)
    const rest = toCents(expense.amount) - assigned
    const out = rows.map((r) => ({ className: r.className, amount: r.amount }))
    if (rest !== 0) out.push({ className: NO_CLASS, amount: fromCents(rest) })
    return out
  }
  return [{ className: expense.productClassification ?? NO_CLASS, amount: expense.amount }]
}

export interface ClassTotal {
  total: number
  /** Gastos distintos que llevan la clasificación (un gasto repartido cuenta una vez en cada clasificación y una sola vez en el total general). */
  count: number
}

/** Total por clasificación (incluida «Sin clasificar» con NO_CLASS). La suma de todas = la suma de los gastos, sin duplicar. */
export function totalsByClass(expenses: readonly ExpenseForClasses[], byExpense: ClassSharesByExpense | undefined): Map<string, ClassTotal> {
  const cents = new Map<string, { c: number; n: number }>()
  for (const e of expenses) {
    for (const s of classSharesOf(e, byExpense)) {
      if (s.amount <= 0) continue
      const cur = cents.get(s.className) ?? { c: 0, n: 0 }
      cur.c += toCents(s.amount)
      cur.n += 1
      cents.set(s.className, cur)
    }
  }
  return new Map([...cents].map(([k, v]) => [k, { total: fromCents(v.c), count: v.n }]))
}
