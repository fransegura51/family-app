import { describe, expect, it } from 'vitest'
import { balanceTrend } from './balanceTrend'
import { walletBalanceTrend, walletStartDate } from './walletBalanceTrend'

const mv = (walletId: string, occurredOn: string, amount: number) => ({ walletId, occurredOn, amount })

// Caso real: cartera de Jennifer creada con 100 €, compra de 13,50 € el 22/10.
const jennifer = { id: 'j', openingBalance: 100, createdOn: '2026-10-20' }

describe('historial de saldo de una cartera', () => {
  it('antes de su creación no hay dato (no se inventa un saldo anterior)', () => {
    const pts = walletBalanceTrend(jennifer, [], '2026-10-18', '2026-10-22')
    expect(pts.map((p) => [p.date, p.known])).toEqual([['2026-10-18', false], ['2026-10-19', false], ['2026-10-20', true], ['2026-10-21', true], ['2026-10-22', true]])
    expect(pts[0].balance).toBe(0)
    expect(pts[2].balance).toBe(100)
  })

  it('saldo = saldo inicial + movimientos hasta ese día; el último punto es el saldo actual', () => {
    const pts = walletBalanceTrend(jennifer, [mv('j', '2026-10-22', -13.5), mv('x', '2026-10-21', 999)], '2026-10-20', '2026-10-24')
    expect(pts.map((p) => p.balance)).toEqual([100, 100, 86.5, 86.5, 86.5])
  })

  it('un movimiento fechado antes de la creación cuenta desde el día de creación (el saldo final sigue cuadrando)', () => {
    const pts = walletBalanceTrend(jennifer, [mv('j', '2026-10-15', -13.5)], '2026-10-19', '2026-10-21')
    expect(pts.map((p) => [p.known, p.balance])).toEqual([[false, 0], [true, 86.5], [true, 86.5]])
  })

  it('sin fecha de creación se usa la del primer movimiento', () => {
    const w = { id: 'j', openingBalance: 0, createdOn: null }
    expect(walletStartDate(w, [mv('j', '2026-10-22', 5), mv('j', '2026-10-21', 5)])).toBe('2026-10-21')
    expect(walletStartDate(w, [])).toBeNull()
    expect(walletBalanceTrend(w, [], '2026-10-20', '2026-10-21').every((p) => !p.known)).toBe(true)
  })

  it('bancos + efectivo: una retirada del banco no duplica ni pierde dinero en el total', () => {
    // Banco: saldo actual 900 tras retirar 100 el 22/10. Cartera: 0 inicial + 100 el 22/10.
    const bank = balanceTrend([{ id: 'b', balance: 900 }], [{ accountId: 'b', transactionDate: '2026-10-22', amount: 100, creditDebit: 'DBIT' }], '2026-10-20', '2026-10-24')
    const cash = walletBalanceTrend({ id: 'c', openingBalance: 0, createdOn: '2026-10-20' }, [mv('c', '2026-10-22', 100)], '2026-10-20', '2026-10-24')
    const total = bank.map((p, i) => p.balance + cash[i].balance)
    expect(bank.map((p) => p.balance)).toEqual([1000, 1000, 900, 900, 900])
    expect(cash.map((p) => p.balance)).toEqual([0, 0, 100, 100, 100])
    expect(total).toEqual([1000, 1000, 1000, 1000, 1000])
  })

  it('una compra pagada desde la cartera baja el efectivo (y solo el efectivo)', () => {
    const bank = balanceTrend([{ id: 'b', balance: 500 }], [], '2026-10-20', '2026-10-22')
    const cash = walletBalanceTrend({ id: 'c', openingBalance: 50, createdOn: '2026-10-20' }, [mv('c', '2026-10-21', -13.5)], '2026-10-20', '2026-10-22')
    expect(bank.map((p) => p.balance)).toEqual([500, 500, 500])
    expect(cash.map((p) => p.balance)).toEqual([50, 36.5, 36.5])
  })

  it('el saldo negativo («por regularizar») se dibuja tal cual, sin redondeos raros', () => {
    const pts = walletBalanceTrend({ id: 'c', openingBalance: 5, createdOn: '2026-10-20' }, [mv('c', '2026-10-21', -8.1)], '2026-10-20', '2026-10-21')
    expect(pts.map((p) => p.balance)).toEqual([5, -3.1])
  })
})
