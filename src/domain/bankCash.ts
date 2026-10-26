// «Banco y efectivo»: movimientos del banco que son dinero que pasa entre una cuenta y una cartera de efectivo (en las DOS direcciones). Lógica pura.
//
//   · Banco → Cartera: un cargo del banco (reintegro de cajero). El banco baja por el movimiento real y la cartera sube. No es un gasto.
//   · Cartera → Banco: un ingreso del banco (ingreso de efectivo en cajero). La cartera baja y el banco sube por el movimiento real. No es un ingreso.
//
// El movimiento original del banco nunca se modifica ni se crea otro: solo se vincula a la cartera (la categoría pasa a «Movimientos internos»).
// Una compra corriente (pizzería, supermercado, Amazon…) NUNCA se ofrece sola: solo aparece si la persona la busca a mano y confirma su naturaleza.
import type { Expense } from './types'
import { isCashWithdrawalText } from './cashWithdrawals'

export type BankCashDirection = 'toWallet' | 'toBank'

/** Ingreso de efectivo en cajero o ventanilla («INGRESO EFECTIVO CAJERO AUTOMATICO», «INGRESO EN EFECTIVO», «INGRESO DE EFECTIVO»). */
const DEPOSIT_PATTERN = /ingreso[^a-z0-9]*(de\s+|en\s+)?(efectivo|cajero)|efectivo[^a-z0-9]*cajero|cajero[^a-z0-9]*autom[aá]tico[^a-z0-9]*ingreso/i

export function isCashDepositText(text: string | null | undefined): boolean {
  return DEPOSIT_PATTERN.test((text ?? '').normalize('NFC'))
}

export interface BankCashCandidate {
  expense: Expense
  label: string
  /** true = el propio concepto del banco lo identifica (cajero / ingreso de efectivo). false = búsqueda manual: hay que confirmar su naturaleza. */
  recognized: boolean
  /** Ya estaba clasificado como «Retirada de efectivo» pero sin cartera (no se perdió: se puede asignar ahora). */
  classifiedWithoutWallet: boolean
}

export interface BankCashSearch {
  query?: string
  /** Importe aproximado (admite coma). */
  amount?: string
  from?: string
  to?: string
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function hasSearch(s: BankCashSearch): boolean {
  return Boolean((s.query ?? '').trim() || (s.amount ?? '').trim() || s.from || s.to)
}

function isBankMovement(e: Expense): boolean {
  return (e.source === 'banco' || e.source === 'ticket_banco') && e.kind === 'real' && e.amount > 0
}

function textOf(e: Expense): string {
  return `${e.store ?? ''} ${e.notes ?? ''}`.trim()
}

function matchesSearch(e: Expense, s: BankCashSearch): boolean {
  const q = norm((s.query ?? '').trim())
  if (q && !norm(textOf(e)).includes(q) && !norm(e.category ?? '').includes(q)) return false
  const a = (s.amount ?? '').trim()
  if (a) {
    const n = Number(a.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return false
    // «Aproximado»: el mismo importe al céntimo o dentro de ±5 %.
    if (Math.abs(e.amount - n) > Math.max(0.01, n * 0.05)) return false
  }
  if (s.from && e.expenseDate < s.from) return false
  if (s.to && e.expenseDate > s.to) return false
  return true
}

/**
 * Candidatos para vincular a una cartera.
 *  · `recognized`: lo que el banco identifica solo (según la dirección), siempre visible, incluidos los ya clasificados «Retirada de efectivo» sin cartera.
 *  · `manual`: SOLO si hay búsqueda; cualquier movimiento del banco de la dirección elegida que coincida, hasta 30, con confirmación explícita.
 */
export function bankCashCandidates(
  expenses: readonly Expense[],
  linkedExpenseIds: ReadonlySet<string>,
  direction: BankCashDirection,
  search: BankCashSearch = {},
): { recognized: BankCashCandidate[]; manual: BankCashCandidate[] } {
  const wantIncome = direction === 'toBank'
  const base = expenses.filter((e) => isBankMovement(e) && e.isIncome === wantIncome && !linkedExpenseIds.has(e.id))
  const isRecognized = (e: Expense) => (wantIncome ? isCashDepositText(textOf(e)) : isCashWithdrawalText(textOf(e)))
  const toCandidate = (e: Expense, recognized: boolean): BankCashCandidate => ({
    expense: e,
    label: (e.notes ?? e.store ?? (wantIncome ? 'Ingreso de efectivo' : 'Retirada de efectivo')).trim(),
    recognized,
    classifiedWithoutWallet: !wantIncome && e.category === 'Retirada de efectivo',
  })
  const byDateDesc = (a: BankCashCandidate, b: BankCashCandidate) => b.expense.expenseDate.localeCompare(a.expense.expenseDate)
  const recognized = base.filter(isRecognized).filter((e) => matchesSearch(e, search)).map((e) => toCandidate(e, true)).sort(byDateDesc)
  const recognizedIds = new Set(recognized.map((c) => c.expense.id))
  const manual = hasSearch(search)
    ? base
        .filter((e) => !recognizedIds.has(e.id) && matchesSearch(e, search))
        .map((e) => toCandidate(e, false))
        .sort(byDateDesc)
        .slice(0, 30)
    : []
  return { recognized, manual }
}

export interface BankCashPreview {
  /** «Banco → Cartera» o «Cartera → Banco». */
  title: string
  walletLine: string
  bankLine: string
  walletAfter: number
  /** La cartera quedaría en negativo: hace falta confirmarlo expresamente (no se oculta). */
  negative: boolean
}

const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

/** Qué saldo sube y cuál baja, ANTES de confirmar. El banco se mueve por el movimiento real que ya existe (no se crea nada). */
export function previewBankCash(direction: BankCashDirection, amount: number, walletName: string, walletBalance: number): BankCashPreview {
  const signed = direction === 'toWallet' ? amount : -amount
  const walletAfter = Math.round((walletBalance + signed) * 100) / 100
  return {
    title: direction === 'toWallet' ? 'Banco → Cartera' : 'Cartera → Banco',
    walletLine:
      direction === 'toWallet'
        ? `La cartera «${walletName}» sube ${eur(amount)}: de ${eur(walletBalance)} a ${eur(walletAfter)}.`
        : `La cartera «${walletName}» baja ${eur(amount)}: de ${eur(walletBalance)} a ${eur(walletAfter)}.`,
    bankLine:
      direction === 'toWallet'
        ? `El saldo del banco ya bajó ${eur(amount)} con este movimiento real: no se vuelve a descontar.`
        : `El saldo del banco ya subió ${eur(amount)} con este movimiento real: no se vuelve a sumar.`,
    walletAfter,
    negative: walletAfter < -0.004,
  }
}
