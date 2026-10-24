// BORRAR UNA COMPRA (ECO-1j): qué va a pasar con las carteras, las devoluciones y el banco, para enseñarlo ANTES de confirmar.
// El servidor (delete_purchase) hace lo mismo y deja una anotación para poder deshacerlo; esto solo calcula el texto del aviso.
//   · el efectivo que la compra sacó de una cartera VUELVE a esa cartera; el que entró por una devolución en una cartera se RETIRA;
//   · las devoluciones de esa compra se borran con ella;
//   · los movimientos bancarios originales NUNCA se borran: lo que el banco ya cobró sigue contando como gasto del banco.
import { eur } from './cashWallet'

export interface DeletionPayment {
  method: string
  amount: number
  walletId: string | null
  bankTransactionId: string | null
}
export interface DeletionRefund {
  amount: number
  destination: string
  walletId: string | null
}

export interface DeletionImpact {
  /** Una línea por efecto relevante. Vacío = borrar no toca carteras, devoluciones ni banco. */
  lines: string[]
  /** Variación del saldo de cada cartera afectada (+ la cartera recupera dinero, − lo pierde). */
  walletDeltas: { walletId: string; delta: number }[]
  refundsTotal: number
  bankKept: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function purchaseDeletionImpact(input: {
  payments: readonly DeletionPayment[]
  refunds: readonly DeletionRefund[]
  /** source del gasto de la compra: 'ticket_banco' = ya enlazado con un movimiento del banco. */
  expenseSource?: string | null
  walletName: (id: string) => string
  total?: number | null
}): DeletionImpact {
  const delta = new Map<string, number>()
  for (const p of input.payments) if (p.walletId) delta.set(p.walletId, round2((delta.get(p.walletId) ?? 0) + p.amount))
  for (const r of input.refunds) if (r.walletId) delta.set(r.walletId, round2((delta.get(r.walletId) ?? 0) - r.amount))
  const walletDeltas = [...delta.entries()].filter(([, d]) => d !== 0).map(([walletId, d]) => ({ walletId, delta: d }))

  const lines: string[] = []
  for (const w of walletDeltas) {
    lines.push(w.delta > 0 ? `La cartera «${input.walletName(w.walletId)}» recupera ${eur(w.delta)}.` : `La cartera «${input.walletName(w.walletId)}» pierde ${eur(-w.delta)}.`)
  }
  const refundsTotal = round2(input.refunds.reduce((s, r) => s + r.amount, 0))
  if (input.refunds.length > 0) lines.push(`${input.refunds.length === 1 ? 'Se borra su devolución' : `Se borran sus ${input.refunds.length} devoluciones`} (${eur(refundsTotal)}).`)

  const linkedPayments = input.payments.filter((p) => p.bankTransactionId)
  const bankLinked = input.expenseSource === 'ticket_banco' || linkedPayments.length > 0
  const bankKept = linkedPayments.length > 0 ? round2(linkedPayments.reduce((s, p) => s + p.amount, 0)) : bankLinked ? (input.total ?? 0) : 0
  if (bankLinked) {
    lines.push(
      bankKept > 0
        ? `Los movimientos del banco se conservan: ${eur(bankKept)} seguirán contando como gasto del banco, sin esta compra.`
        : 'Los movimientos del banco se conservan: seguirán contando como gasto del banco, sin esta compra.',
    )
  }
  return { lines, walletDeltas, refundsTotal, bankKept }
}
