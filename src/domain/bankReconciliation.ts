// CONCILIACIÓN AUTOMÁTICA entre una compra propia (ticket o apunte a mano) y su apunte del banco.
//
// Qué hace: reparte los pares «compra ↔ cargo del banco» en dos grupos.
//   · auto    — coincidencia SEGURA y ÚNICA: se vincula sola (un solo gasto; el movimiento bancario original se conserva siempre, queda anotado y se puede deshacer).
//   · confirm — hay duda (fecha algo distinta, comercio desconocido, varias coincidencias posibles): solo se SUGIERE y decide la familia.
//
// Qué NO mira: la fotografía del ticket. Tener o no justificante es independiente de estar o no conciliada con el banco.
// Seguridad: nunca se empareja efectivo (ni la parte en efectivo de un pago mixto) con el banco, ni un apunte del banco que ya tenga compra, cartera o devolución.
// Reutiliza las reglas de duplicateDetection.ts (importe al céntimo, ±7 días, comercio compatible) y las endurece para la vinculación automática.
import { storesCompatible, type DupExpense } from './duplicateDetection'

/** Hasta aquí (días de diferencia) una coincidencia única y con el mismo comercio se vincula sola; entre este valor y 7 se pide confirmación. */
export const AUTO_LINK_MAX_DAYS = 3
export const SUGGEST_LINK_MAX_DAYS = 7

export interface BankLinkPair {
  /** La compra propia (manual o ticket). */
  own: DupExpense
  /** El apunte económico que vino del banco. */
  bank: DupExpense
  days: number
  /** Qué coincide, para enseñarlo. */
  reasons: string[]
  /** Por qué no se vincula sola (solo en 'confirm'). */
  doubt?: 'varias_coincidencias' | 'fecha' | 'comercio_desconocido'
}

export interface BankLinkPlan {
  auto: BankLinkPair[]
  confirm: BankLinkPair[]
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const isCashLike = (e: DupExpense) => e.paymentMethod === 'efectivo' || e.paymentMethod === 'mixto'
const sameAmount = (a: DupExpense, b: DupExpense) => Math.round(a.amount * 100) === Math.round(b.amount * 100)

function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** ¿Puede esta compra propia pagarse con el banco? Un efectivo (o mixto) no sale del banco por el total. */
export function isLinkableOwn(e: DupExpense): boolean {
  return !e.isIncome && e.amount > 0 && (e.source === 'manual' || e.source === 'ticket') && !isCashLike(e) && !e.hasCashLink
}

/** ¿Es este apunte un cargo del banco al que se puede unir una compra? Sin compra, cartera ni devolución propias (no se retira un apunte con datos propios). */
export function isLinkableBank(e: DupExpense): boolean {
  return !e.isIncome && e.amount > 0 && e.source === 'banco' && !e.hasPurchase && !e.hasCashLink
}

export function planBankLinks(expenses: readonly DupExpense[], dismissedPairs: readonly [string, string][] = []): BankLinkPlan {
  const dismissed = new Set(dismissedPairs.map(([a, b]) => pairKey(a, b)))
  const owns = expenses.filter(isLinkableOwn)
  const banks = expenses.filter(isLinkableBank)

  const candidate = (own: DupExpense, bank: DupExpense) => {
    if (!sameAmount(own, bank) || dismissed.has(pairKey(own.id, bank.id))) return null
    const days = Math.abs(dayNumber(own.expenseDate) - dayNumber(bank.expenseDate))
    const store = storesCompatible(own.store, bank.store)
    if (days > SUGGEST_LINK_MAX_DAYS || !store.compatible) return null
    return { days, store }
  }

  const banksOf = new Map<string, DupExpense[]>()
  const ownsOf = new Map<string, DupExpense[]>()
  for (const o of owns) for (const b of banks) if (candidate(o, b)) {
    banksOf.set(o.id, [...(banksOf.get(o.id) ?? []), b])
    ownsOf.set(b.id, [...(ownsOf.get(b.id) ?? []), o])
  }

  const plan: BankLinkPlan = { auto: [], confirm: [] }
  for (const o of owns) {
    for (const b of banksOf.get(o.id) ?? []) {
      const c = candidate(o, b)
      if (!c) continue
      const unique = (banksOf.get(o.id)?.length ?? 0) === 1 && (ownsOf.get(b.id)?.length ?? 0) === 1
      const reasons = ['mismo importe', c.days === 0 ? 'mismo día' : `con ${c.days} ${c.days === 1 ? 'día' : 'días'} de diferencia`, ...(c.store.known ? ['mismo comercio'] : [])]
      const base = { own: o, bank: b, days: c.days, reasons }
      if (unique && c.days <= AUTO_LINK_MAX_DAYS && c.store.known) plan.auto.push(base)
      else plan.confirm.push({ ...base, doubt: !unique ? 'varias_coincidencias' : !c.store.known ? 'comercio_desconocido' : 'fecha' })
    }
  }
  const byDate = (a: BankLinkPair, b: BankLinkPair) => a.own.expenseDate.localeCompare(b.own.expenseDate)
  plan.auto.sort(byDate)
  plan.confirm.sort(byDate)
  return plan
}
