// RETIRADAS DE EFECTIVO del banco (cajero) y su relación con las carteras. Lógica pura.
//
// Una retirada NO es un gasto familiar: es dinero que pasa de una cuenta a efectivo. Se clasifica como «Retirada de efectivo» (dentro de «Movimientos internos», que
// ya queda fuera de gastos e ingresos) y, si la persona lo confirma, entra en una o varias carteras. Nunca se mete dinero en una cartera sin confirmación,
// salvo el caso seguro de una entrada que ya estaba apuntada a mano (se vincula a ella en vez de crear otra: no se duplica el efectivo).
import type { CashMovement } from './cashWallet'
import type { Expense } from './types'

export const WITHDRAWAL_CATALOG_KEY = 'g.movimientos_internos.retirada_efectivo'
export const WITHDRAWAL_CATEGORY_NAME = 'Retirada de efectivo'

/** ¿La familia ya tiene la categoría «Retirada de efectivo» (migración 0318)? Sin ella no se ofrece asignar retiradas: las funciones del servidor aún no existen. */
export function hasWithdrawalCategory(categories: readonly { catalogKey?: string | null }[]): boolean {
  return categories.some((c) => c.catalogKey === WITHDRAWAL_CATALOG_KEY)
}

/** Reintegro / disposición de efectivo en cajero («REINTEGRO CAJERO AUTOMÁTICO», «DISPOSICION EFECTIVO CAJERO», «REINTEGRO EN CAJERO», «RETIRADA DE EFECTIVO»…). */
const ATM_PATTERN = /(reintegro|disposici[oó]n|retirada|extracci[oó]n)[^a-z0-9]*(de\s+)?(efectivo|en\s+cajero|cajero)|cajero\s+autom[aá]tico|\batm\b/i

export function isCashWithdrawalText(text: string | null | undefined): boolean {
  return ATM_PATTERN.test((text ?? '').normalize('NFC'))
}

export interface WithdrawalCandidate {
  expense: Expense
  /** Texto del banco que lo identifica como retirada. */
  label: string
}

const cents = (n: number) => Math.round(n * 100)

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/**
 * Cargos del banco que parecen una retirada de efectivo y todavía no están asignados: sin cartera enlazada y sin la categoría «Retirada de efectivo».
 * (Un cargo ya clasificado a mano como retirada «sin cartera» no vuelve a aparecer.)
 */
export function pendingWithdrawals(expenses: readonly Expense[], linkedExpenseIds: ReadonlySet<string>, options: { exclude?: (e: Expense) => boolean; sinceDate?: string } = {}): WithdrawalCandidate[] {
  return expenses
    .filter((e) => !options.exclude?.(e) && (options.sinceDate == null || e.expenseDate >= options.sinceDate))
    .filter((e) => (e.source === 'banco' || e.source === 'ticket_banco') && e.kind === 'real' && !e.isIncome && e.amount > 0)
    .filter((e) => !linkedExpenseIds.has(e.id) && e.category !== WITHDRAWAL_CATEGORY_NAME)
    .filter((e) => isCashWithdrawalText(e.store) || isCashWithdrawalText(e.notes))
    .map((e) => ({ expense: e, label: (e.notes ?? e.store ?? 'Retirada de efectivo').trim() }))
    .sort((a, b) => b.expense.expenseDate.localeCompare(a.expense.expenseDate))
}

/** Entradas de efectivo apuntadas a mano (libres: sin gasto ni retirada vinculados) que podrían ser esta retirada: mismo importe al céntimo, ±7 días. */
export function matchingManualEntries(expense: Pick<Expense, 'amount' | 'expenseDate'>, movements: readonly (CashMovement & { adoptedFrom?: string | null })[]): CashMovement[] {
  return movements
    .filter((m) => m.kind === 'in' && m.expenseId == null && !m.adoptedFrom && cents(m.amount) === cents(expense.amount))
    .filter((m) => Math.abs(dayNumber(m.occurredOn) - dayNumber(expense.expenseDate)) <= 7)
    .sort((a, b) => Math.abs(dayNumber(a.occurredOn) - dayNumber(expense.expenseDate)) - Math.abs(dayNumber(b.occurredOn) - dayNumber(expense.expenseDate)))
}

export const AUTO_ADOPT_MAX_DAYS = 3

export interface AdoptionPlan {
  /** Coincidencia segura y única: se vincula sola. */
  auto: { withdrawal: WithdrawalCandidate; entry: CashMovement }[]
  /** Hay una o varias entradas posibles pero no es seguro: se pide confirmación. */
  suggest: { withdrawal: WithdrawalCandidate; entries: CashMovement[] }[]
}

/**
 * ¿Alguna retirada pendiente corresponde a una entrada que la persona ya apuntó? Segura si hay UNA sola entrada posible, a ≤ 3 días, y esa entrada no
 * puede ser también de otra retirada pendiente (una retirada ↔ una entrada). Con ambigüedad solo se sugiere.
 */
export function planAdoptions(pending: readonly WithdrawalCandidate[], movements: readonly CashMovement[]): AdoptionPlan {
  const plan: AdoptionPlan = { auto: [], suggest: [] }
  const claims = new Map<string, number>()
  const perWithdrawal = pending.map((w) => ({ w, entries: matchingManualEntries(w.expense, movements) }))
  for (const { entries } of perWithdrawal) for (const m of entries) claims.set(m.id, (claims.get(m.id) ?? 0) + 1)
  for (const { w, entries } of perWithdrawal) {
    if (entries.length === 0) continue
    const only = entries[0]
    const days = Math.abs(dayNumber(only.occurredOn) - dayNumber(w.expense.expenseDate))
    if (entries.length === 1 && claims.get(only.id) === 1 && days <= AUTO_ADOPT_MAX_DAYS) plan.auto.push({ withdrawal: w, entry: only })
    else plan.suggest.push({ withdrawal: w, entries })
  }
  return plan
}

export interface SplitPart {
  walletId: string
  /** Texto tal cual lo escribe la persona. */
  amount: string
}

export type SplitCheck =
  | { ok: true; parts: { walletId: string; amount: number }[]; assigned: number; unassigned: number }
  | { ok: false; error: string; assigned: number; unassigned: number }

/** Valida un reparto entre carteras: importes válidos, una vez cada cartera y suma ≤ lo retirado. Lo que no se asigna queda como efectivo sin cartera. */
export function checkWithdrawalSplit(total: number, parts: readonly SplitPart[]): SplitCheck {
  const clean: { walletId: string; amount: number }[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    if (p.amount.trim() === '') continue // parte vacía = no participa
    const n = Number(p.amount.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Escribe un importe válido en cada cartera (o déjalo vacío).', assigned: 0, unassigned: total }
    if (seen.has(p.walletId)) return { ok: false, error: 'Una cartera solo puede aparecer una vez.', assigned: 0, unassigned: total }
    seen.add(p.walletId)
    clean.push({ walletId: p.walletId, amount: Math.round(n * 100) / 100 })
  }
  const assigned = Math.round(clean.reduce((s, p) => s + p.amount, 0) * 100) / 100
  const unassigned = Math.round((total - assigned) * 100) / 100
  if (clean.length === 0) return { ok: false, error: 'Elige al menos una cartera con su importe (o confirma «Sin cartera»).', assigned, unassigned }
  if (assigned > total + 0.001) return { ok: false, error: `El reparto (${assigned.toFixed(2)} €) supera lo retirado (${total.toFixed(2)} €).`, assigned, unassigned }
  return { ok: true, parts: clean, assigned, unassigned }
}
