// CARTERAS DE EFECTIVO (opcionales). Lógica pura: saldo, aviso de saldo insuficiente (no bloqueante) y textos.
//
// - El efectivo se puede registrar SIN cartera: la cartera solo existe si la familia (o una persona) decide controlarlo.
// - El saldo puede quedar en negativo: no es una deuda, es una diferencia pendiente de regularizar.
// - Un traspaso (cartera↔cartera, banco↔cartera) NO es ingreso ni gasto: son movimientos de cartera emparejados.
import { parseAmount } from './manualPurchase'

export type CashMovementKind = 'in' | 'out' | 'adjust' | 'transfer_in' | 'transfer_out' | 'payment' | 'refund'

export interface CashWallet {
  id: string
  name: string
  /** null = cartera familiar; con id = cartera personal de esa persona. */
  ownerMemberId: string | null
  openingBalance: number
  archivedAt: string | null
  /** Saldo actual (saldo inicial + movimientos). */
  balance: number
}

export interface CashMovement {
  id: string
  walletId: string
  kind: CashMovementKind
  /** Con signo: entra (+) o sale (−). */
  amount: number
  occurredOn: string
  note: string | null
  transferId: string | null
  expenseId: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function eur(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function computeBalance(openingBalance: number, movements: readonly Pick<CashMovement, 'amount'>[]): number {
  return round2(openingBalance + movements.reduce((s, m) => s + m.amount, 0))
}

export type ShortfallChoice = 'continue' | 'add' | 'cancel'

export interface ShortfallNotice {
  message: string
  /** Lo que falta para cubrir el gasto (>0), o 0 si la cartera estaba a 0 o en negativo. */
  missing: number
  choices: { id: ShortfallChoice; label: string }[]
}

/**
 * Aviso NO bloqueante al registrar un gasto en efectivo contra una cartera sin saldo suficiente o a cero.
 * Devuelve null si alcanza. Siempre ofrece continuar (el saldo pasará a negativo), añadir efectivo o cancelar.
 */
export function shortfallNotice(walletBalance: number, expenseAmount: number): ShortfallNotice | null {
  if (!(expenseAmount > 0)) return null
  if (walletBalance >= expenseAmount && walletBalance > 0) return null
  return {
    message: `Tu cartera tiene ${eur(walletBalance)} y estás registrando un gasto de ${eur(expenseAmount)}. ¿Quieres continuar?`,
    missing: round2(Math.max(0, expenseAmount - Math.max(0, walletBalance))),
    choices: [
      { id: 'continue', label: 'Registrar igualmente' },
      { id: 'add', label: 'Añadir efectivo' },
      { id: 'cancel', label: 'Cancelar' },
    ],
  }
}

/** Texto del saldo: un saldo negativo se presenta como diferencia a regularizar, nunca como deuda. */
export function balanceText(balance: number): string {
  return balance < 0 ? `${eur(balance)} por regularizar` : eur(balance)
}

export const MOVEMENT_LABELS: Record<CashMovementKind, string> = {
  in: 'Entrada de efectivo',
  out: 'Salida de efectivo',
  adjust: 'Ajuste de saldo',
  transfer_in: 'Traspaso recibido',
  transfer_out: 'Traspaso enviado',
  payment: 'Pago de una compra',
  refund: 'Devolución recibida',
}

/** Movimientos que la persona puede borrar a mano (el resto los gestionan las propias operaciones). */
export function isManualMovement(kind: CashMovementKind): boolean {
  return kind === 'in' || kind === 'out' || kind === 'adjust'
}

export interface MovementInput {
  kind: 'in' | 'out' | 'adjust'
  /** Texto del campo importe. Para «adjust» es el SALDO QUE DEBERÍA HABER (se convierte en la diferencia). */
  amount: string
}

/** Convierte lo escrito en el formulario en la variación con signo que se guarda, o un error en español. */
export function movementDelta(input: MovementInput, currentBalance: number): { delta: number } | { error: string } {
  const value = parseAmount(input.amount)
  if (value == null) return { error: 'Escribe el importe' }
  if (input.kind === 'adjust') {
    const delta = round2(value - currentBalance)
    return delta === 0 ? { error: 'El saldo ya es ese: no hay nada que ajustar' } : { delta }
  }
  if (value <= 0) return { error: 'El importe tiene que ser mayor que 0' }
  return { delta: input.kind === 'in' ? value : -value }
}

/** Una persona solo tiene una cartera personal; la familiar es una (o varias) sin dueño. Lo que se ofrece al elegir cartera para un pago. */
export function usableWallets(wallets: readonly CashWallet[], myMemberId: string | null): CashWallet[] {
  return wallets.filter((w) => w.archivedAt == null && (w.ownerMemberId == null || w.ownerMemberId === myMemberId))
}
