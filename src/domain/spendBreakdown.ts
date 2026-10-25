// «Cuánto he gastado» (Compras → Compras registradas): dos formas de ver EL MISMO total. Nunca se suman entre sí.
//   · Por justificante: compras con ticket (foto o PDF, o un ticket que ya llegó aunque su foto se borrase a los 3 meses) y compras sin ticket (apuntadas a mano o
//     conocidas solo por el banco). Depende del justificante, no de si la compra está o no vinculada al banco.
//   · Por forma de pago: banco (tarjeta, Bizum, transferencia), efectivo con cartera, efectivo sin cartera y otros / sin indicar. En un pago mixto cada medio
//     aporta SU parte (60 € = 20 efectivo + 40 tarjeta suma 20 al efectivo y 40 al banco), así el total de la compra no se duplica.
// Lógica pura, probada aparte; la pantalla solo la enseña plegada («Ver desglose»).

export interface SpendItem {
  /** Id de la compra (receipts.id) o, si solo existe el cargo del banco, «bank:<gasto>». */
  id: string
  amount: number
  /** Compra apuntada a mano (sin ticket al guardarla). */
  isManual: boolean
  /** Ya tiene foto o PDF de justificante guardado. */
  hasFile: boolean
  /** No hay ninguna compra registrada: es un cargo del banco de alimentación al que nadie ha añadido su compra. */
  bankOnly: boolean
  paymentMethod: string | null
  expenseId: string | null
}

export interface PaymentLegLike {
  receiptId: string
  method: string
  amount: number
  walletId: string | null
}

export interface Tally {
  count: number
  amount: number
}

export interface ProofBreakdown {
  withTicket: Tally
  withoutTicket: Tally
}

export interface PaymentBreakdown {
  bank: number
  cashWithWallet: number
  cashWithoutWallet: number
  other: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const BANK_METHODS = new Set(['tarjeta', 'bizum', 'transferencia'])

export function totalOf(items: readonly SpendItem[]): number {
  return round2(items.reduce((s, i) => s + i.amount, 0))
}

/** Con ticket: una compra que nació de un ticket, o a la que ya se le añadió el justificante. Sin ticket: apuntada a mano sin justificante, o solo el cargo del banco. */
export function spendByProof(items: readonly SpendItem[]): ProofBreakdown {
  const out: ProofBreakdown = { withTicket: { count: 0, amount: 0 }, withoutTicket: { count: 0, amount: 0 } }
  for (const i of items) {
    const withTicket = !i.bankOnly && (!i.isManual || i.hasFile)
    const bucket = withTicket ? out.withTicket : out.withoutTicket
    bucket.count += 1
    bucket.amount = round2(bucket.amount + i.amount)
  }
  return out
}

export function spendByPayment(
  items: readonly SpendItem[],
  context: {
    legs: readonly PaymentLegLike[]
    /** Gastos con un movimiento de cartera de efectivo enlazado (pagos desde una cartera). */
    cashLinkedExpenseIds: ReadonlySet<string>
    /** Origen del gasto de Economía (para saber si ya está enlazado al banco cuando no se indicó la forma de pago). */
    expenseSource: (expenseId: string) => string | null
  },
): PaymentBreakdown {
  const out: PaymentBreakdown = { bank: 0, cashWithWallet: 0, cashWithoutWallet: 0, other: 0 }
  const legsOf = new Map<string, PaymentLegLike[]>()
  for (const l of context.legs) legsOf.set(l.receiptId, [...(legsOf.get(l.receiptId) ?? []), l])

  const put = (kind: keyof PaymentBreakdown, amount: number) => {
    out[kind] = round2(out[kind] + amount)
  }
  const kindOfLeg = (method: string, walletId: string | null): keyof PaymentBreakdown =>
    BANK_METHODS.has(method) ? 'bank' : method === 'efectivo' ? (walletId ? 'cashWithWallet' : 'cashWithoutWallet') : 'other'

  for (const item of items) {
    const legs = legsOf.get(item.id) ?? []
    if (legs.length > 0) {
      // Pago repartido: cada medio aporta su parte; si por algún motivo no cuadrara con el total, lo que falte va a «sin indicar» (nunca se pierde ni se duplica).
      let assigned = 0
      for (const l of legs) {
        put(kindOfLeg(l.method, l.walletId), l.amount)
        assigned += l.amount
      }
      const rest = round2(item.amount - assigned)
      if (rest > 0.004) put('other', rest)
      continue
    }
    if (item.bankOnly) {
      put('bank', item.amount)
      continue
    }
    const method = item.paymentMethod
    if (method === 'efectivo') {
      put(item.expenseId && context.cashLinkedExpenseIds.has(item.expenseId) ? 'cashWithWallet' : 'cashWithoutWallet', item.amount)
    } else if (method && BANK_METHODS.has(method)) {
      put('bank', item.amount)
    } else if (method) {
      put('other', item.amount)
    } else {
      // Sin forma de pago indicada: si el gasto ya está enlazado al banco, es un pago bancario; si no, sigue «sin indicar».
      const source = item.expenseId ? context.expenseSource(item.expenseId) : null
      put(source === 'banco' || source === 'ticket_banco' ? 'bank' : 'other', item.amount)
    }
  }
  return out
}

export function paymentTotal(b: PaymentBreakdown): number {
  return round2(b.bank + b.cashWithWallet + b.cashWithoutWallet + b.other)
}
