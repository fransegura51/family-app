import { describe, expect, it } from 'vitest'
import { purchaseDeletionImpact } from './purchaseDeletion'

const name = (id: string) => ({ w1: 'Mi cartera', w2: 'Cartera familiar' })[id as 'w1'] ?? id

describe('qué pasa al borrar una compra', () => {
  it('una compra sin efectivo de cartera, sin devoluciones y sin banco no tiene nada que avisar', () => {
    const i = purchaseDeletionImpact({ payments: [{ method: 'efectivo', amount: 8, walletId: null, bankTransactionId: null }], refunds: [], walletName: name })
    expect(i.lines).toEqual([])
    expect(i.walletDeltas).toEqual([])
  })

  it('el efectivo que salió de una cartera vuelve a ella', () => {
    const i = purchaseDeletionImpact({ payments: [{ method: 'efectivo', amount: 20, walletId: 'w1', bankTransactionId: null }, { method: 'tarjeta', amount: 40, walletId: null, bankTransactionId: null }], refunds: [], walletName: name })
    expect(i.lines).toEqual(['La cartera «Mi cartera» recupera 20,00 €.'])
  })

  it('lo que una devolución metió en la cartera se retira (el neto es lo que cuenta)', () => {
    const i = purchaseDeletionImpact({
      payments: [{ method: 'efectivo', amount: 20, walletId: 'w1', bankTransactionId: null }],
      refunds: [{ amount: 15, destination: 'efectivo', walletId: 'w1' }],
      walletName: name,
    })
    expect(i.walletDeltas).toEqual([{ walletId: 'w1', delta: 5 }])
    expect(i.lines[0]).toBe('La cartera «Mi cartera» recupera 5,00 €.')
    expect(i.lines[1]).toBe('Se borra su devolución (15,00 €).')
  })

  it('si la devolución fue mayor que el pago, la cartera pierde la diferencia; el saldo puede quedar negativo (no se bloquea)', () => {
    const i = purchaseDeletionImpact({ payments: [{ method: 'efectivo', amount: 5, walletId: 'w1', bankTransactionId: null }], refunds: [{ amount: 20, destination: 'efectivo', walletId: 'w1' }], walletName: name })
    expect(i.lines[0]).toBe('La cartera «Mi cartera» pierde 15,00 €.')
  })

  it('pago y devolución que se compensan exactamente no cambian la cartera', () => {
    const i = purchaseDeletionImpact({ payments: [{ method: 'efectivo', amount: 10, walletId: 'w1', bankTransactionId: null }], refunds: [{ amount: 10, destination: 'efectivo', walletId: 'w1' }], walletName: name })
    expect(i.walletDeltas).toEqual([])
  })

  it('varias carteras: una línea por cada una', () => {
    const i = purchaseDeletionImpact({
      payments: [{ method: 'efectivo', amount: 10, walletId: 'w1', bankTransactionId: null }, { method: 'efectivo', amount: 5, walletId: 'w2', bankTransactionId: null }],
      refunds: [],
      walletName: name,
    })
    expect(i.lines).toEqual(['La cartera «Mi cartera» recupera 10,00 €.', 'La cartera «Cartera familiar» recupera 5,00 €.'])
  })

  it('varias devoluciones se cuentan juntas', () => {
    const i = purchaseDeletionImpact({ payments: [], refunds: [{ amount: 10, destination: 'tarjeta', walletId: null }, { amount: 5, destination: 'tarjeta', walletId: null }], walletName: name })
    expect(i.lines).toEqual(['Se borran sus 2 devoluciones (15,00 €).'])
    expect(i.refundsTotal).toBe(15)
  })

  it('con pago de tarjeta enlazado al banco: los 40 € del banco se conservan', () => {
    const i = purchaseDeletionImpact({ payments: [{ method: 'tarjeta', amount: 40, walletId: null, bankTransactionId: 'bt1' }, { method: 'efectivo', amount: 20, walletId: null, bankTransactionId: null }], refunds: [], expenseSource: 'ticket_banco', walletName: name })
    expect(i.bankKept).toBe(40)
    expect(i.lines.at(-1)).toBe('Los movimientos del banco se conservan: 40,00 € seguirán contando como gasto del banco, sin esta compra.')
  })

  it('compra simple enlazada al banco (ticket_banco): se conserva el importe total', () => {
    const i = purchaseDeletionImpact({ payments: [], refunds: [], expenseSource: 'ticket_banco', total: 8, walletName: name })
    expect(i.bankKept).toBe(8)
    expect(i.lines).toHaveLength(1)
  })
})
