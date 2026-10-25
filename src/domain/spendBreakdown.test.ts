import { describe, expect, it } from 'vitest'
import { paymentTotal, spendByPayment, spendByProof, totalOf, type PaymentLegLike, type SpendItem } from './spendBreakdown'

const item = (o: Partial<SpendItem> & Pick<SpendItem, 'id' | 'amount'>): SpendItem => ({ isManual: false, hasFile: true, bankOnly: false, paymentMethod: null, expenseId: o.id, ...o })
const ctx = (o: { legs?: PaymentLegLike[]; cash?: string[]; sources?: Record<string, string> } = {}) => ({
  legs: o.legs ?? [],
  cashLinkedExpenseIds: new Set(o.cash ?? []),
  expenseSource: (id: string) => o.sources?.[id] ?? null,
})

describe('desglose por justificante', () => {
  it('con ticket: un ticket (aunque su foto se borrase a los 3 meses) o una compra manual a la que ya se añadió el justificante', () => {
    const r = spendByProof([item({ id: 'a', amount: 10 }), item({ id: 'b', amount: 20, hasFile: false }), item({ id: 'c', amount: 5, isManual: true, hasFile: true })])
    expect(r.withTicket).toEqual({ count: 3, amount: 35 })
    expect(r.withoutTicket).toEqual({ count: 0, amount: 0 })
  })
  it('sin ticket: compra apuntada a mano sin justificante y cargo del banco sin compra', () => {
    const r = spendByProof([item({ id: 'a', amount: 13.5, isManual: true, hasFile: false }), item({ id: 'bank:x', amount: 40, bankOnly: true, hasFile: false }), item({ id: 't', amount: 60 })])
    expect(r.withTicket).toEqual({ count: 1, amount: 60 })
    expect(r.withoutTicket).toEqual({ count: 2, amount: 53.5 })
  })
  it('no depende de si está vinculada al banco: el criterio es solo el justificante', () => {
    const a = spendByProof([item({ id: 'a', amount: 10, expenseId: 'e1' })])
    const b = spendByProof([item({ id: 'a', amount: 10, expenseId: 'e1', paymentMethod: 'tarjeta' })])
    expect(a).toEqual(b)
  })
  it('con ticket + sin ticket = total (nada se pierde ni se cuenta dos veces)', () => {
    const items = [item({ id: 'a', amount: 12.34 }), item({ id: 'b', amount: 7.66, isManual: true, hasFile: false }), item({ id: 'bank:c', amount: 30, bankOnly: true, hasFile: false })]
    const r = spendByProof(items)
    expect(Math.round((r.withTicket.amount + r.withoutTicket.amount) * 100) / 100).toBe(totalOf(items))
    expect(r.withTicket.count + r.withoutTicket.count).toBe(items.length)
  })
})

describe('desglose por forma de pago', () => {
  it('banco: tarjeta, Bizum y transferencia', () => {
    const r = spendByPayment([item({ id: 'a', amount: 10, paymentMethod: 'tarjeta' }), item({ id: 'b', amount: 5, paymentMethod: 'bizum' }), item({ id: 'c', amount: 7, paymentMethod: 'transferencia' })], ctx())
    expect(r).toEqual({ bank: 22, cashWithWallet: 0, cashWithoutWallet: 0, other: 0 })
  })
  it('efectivo con cartera (hay movimiento de cartera enlazado) y sin cartera', () => {
    const r = spendByPayment([item({ id: 'a', amount: 13.5, paymentMethod: 'efectivo', expenseId: 'e-wallet' }), item({ id: 'b', amount: 8, paymentMethod: 'efectivo', expenseId: 'e-free' })], ctx({ cash: ['e-wallet'] }))
    expect(r).toEqual({ bank: 0, cashWithWallet: 13.5, cashWithoutWallet: 8, other: 0 })
  })
  it('pago mixto 60 € = 20 efectivo (cartera) + 40 tarjeta: cada medio su parte, sin duplicar el total', () => {
    const items = [item({ id: 'm', amount: 60, paymentMethod: 'mixto' })]
    const r = spendByPayment(items, ctx({ legs: [{ receiptId: 'm', method: 'efectivo', amount: 20, walletId: 'w' }, { receiptId: 'm', method: 'tarjeta', amount: 40, walletId: null }] }))
    expect(r).toEqual({ bank: 40, cashWithWallet: 20, cashWithoutWallet: 0, other: 0 })
    expect(paymentTotal(r)).toBe(60)
  })
  it('efectivo de un pago mixto sin cartera cuenta como «sin cartera»; otros medios, como otros', () => {
    const r = spendByPayment([item({ id: 'm', amount: 30, paymentMethod: 'mixto' })], ctx({ legs: [{ receiptId: 'm', method: 'efectivo', amount: 10, walletId: null }, { receiptId: 'm', method: 'otro', amount: 20, walletId: null }] }))
    expect(r).toEqual({ bank: 0, cashWithWallet: 0, cashWithoutWallet: 10, other: 20 })
  })
  it('sin forma de pago: ya enlazado al banco = banco; apuntado a mano o ticket suelto = sin indicar; cargo solo del banco = banco', () => {
    const r = spendByPayment(
      [item({ id: 'a', amount: 50, expenseId: 'ea' }), item({ id: 'b', amount: 20, expenseId: 'eb' }), item({ id: 'c', amount: 9, expenseId: 'ec' }), item({ id: 'bank:d', amount: 30, bankOnly: true, expenseId: 'ed' })],
      ctx({ sources: { ea: 'ticket_banco', eb: 'ticket', ec: 'manual' } }),
    )
    expect(r).toEqual({ bank: 80, cashWithWallet: 0, cashWithoutWallet: 0, other: 29 })
  })
  it('si los pagos no llegasen a sumar el total, lo que falta va a «sin indicar» (nunca se pierde dinero del total)', () => {
    const r = spendByPayment([item({ id: 'm', amount: 60, paymentMethod: 'mixto' })], ctx({ legs: [{ receiptId: 'm', method: 'tarjeta', amount: 40, walletId: null }] }))
    expect(r).toEqual({ bank: 40, cashWithWallet: 0, cashWithoutWallet: 0, other: 20 })
  })
  it('las dos vistas suman lo mismo que el total, mezclando de todo', () => {
    const items = [
      item({ id: 'a', amount: 48.75, paymentMethod: 'tarjeta' }),
      item({ id: 'b', amount: 13.5, isManual: true, hasFile: false, paymentMethod: 'efectivo', expenseId: 'ew' }),
      item({ id: 'm', amount: 60, paymentMethod: 'mixto' }),
      item({ id: 'bank:z', amount: 21.1, bankOnly: true, hasFile: false }),
      item({ id: 'n', amount: 9.99, isManual: true, hasFile: false }),
    ]
    const pay = spendByPayment(items, ctx({ cash: ['ew'], legs: [{ receiptId: 'm', method: 'efectivo', amount: 20, walletId: 'w' }, { receiptId: 'm', method: 'tarjeta', amount: 40, walletId: null }] }))
    const proof = spendByProof(items)
    expect(paymentTotal(pay)).toBe(totalOf(items))
    expect(Math.round((proof.withTicket.amount + proof.withoutTicket.amount) * 100) / 100).toBe(totalOf(items))
  })
})
