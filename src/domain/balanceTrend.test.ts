import { describe, expect, it } from 'vitest'
import { balanceTrend, earliestTransactionDate } from './balanceTrend'

describe('balanceTrend', () => {
  it('sin movimientos: línea plana al saldo actual en todo el rango', () => {
    const points = balanceTrend([{ id: 'a1', balance: 100 }], [], '2026-09-01', '2026-09-03')
    expect(points).toEqual([
      { date: '2026-09-01', balance: 100 },
      { date: '2026-09-02', balance: 100 },
      { date: '2026-09-03', balance: 100 },
    ])
  })

  it('reconstruye hacia atrás: el saldo de un día es el de después menos lo que cambió ese día siguiente', () => {
    // Saldo actual (hoy, 09-03) = 100. El día 2 entró +20 (crédito), así
    // que antes de eso (día 1) el saldo era 80.
    const points = balanceTrend(
      [{ id: 'a1', balance: 100 }],
      [{ accountId: 'a1', transactionDate: '2026-09-02', amount: 20, creditDebit: 'CRDT' }],
      '2026-09-01',
      '2026-09-03',
    )
    expect(points).toEqual([
      { date: '2026-09-01', balance: 80 },
      { date: '2026-09-02', balance: 100 },
      { date: '2026-09-03', balance: 100 },
    ])
  })

  it('un débito resta al reconstruir hacia atrás (el saldo previo era más alto)', () => {
    const points = balanceTrend(
      [{ id: 'a1', balance: 50 }],
      [{ accountId: 'a1', transactionDate: '2026-09-02', amount: 30, creditDebit: 'DBIT' }],
      '2026-09-01',
      '2026-09-02',
    )
    expect(points).toEqual([
      { date: '2026-09-01', balance: 80 },
      { date: '2026-09-02', balance: 50 },
    ])
  })

  it('varias cuentas se suman en una sola línea combinada', () => {
    const points = balanceTrend(
      [
        { id: 'a1', balance: 100 },
        { id: 'a2', balance: 50 },
      ],
      [],
      '2026-09-01',
      '2026-09-01',
    )
    expect(points).toEqual([{ date: '2026-09-01', balance: 150 }])
  })

  it('filtrar a una sola cuenta ignora los movimientos de las demás', () => {
    const points = balanceTrend(
      [{ id: 'a1', balance: 100 }], // solo a1, a2 queda fuera
      [
        { accountId: 'a1', transactionDate: '2026-09-01', amount: 10, creditDebit: 'CRDT' },
        { accountId: 'a2', transactionDate: '2026-09-01', amount: 999, creditDebit: 'CRDT' },
      ],
      '2026-08-31',
      '2026-09-01',
    )
    expect(points).toEqual([
      { date: '2026-08-31', balance: 90 },
      { date: '2026-09-01', balance: 100 },
    ])
  })

  it('rango que termina antes de hoy: deshace primero lo que pasó después de `to`', () => {
    // Saldo actual = 100, pero hubo un ingreso de +40 el día 3 (después
    // del rango pedido, que termina el día 2) — el saldo real al final
    // del día 2 debía ser 60, no 100.
    const points = balanceTrend(
      [{ id: 'a1', balance: 100 }],
      [{ accountId: 'a1', transactionDate: '2026-09-03', amount: 40, creditDebit: 'CRDT' }],
      '2026-09-02',
      '2026-09-02',
    )
    expect(points).toEqual([{ date: '2026-09-02', balance: 60 }])
  })
})

describe('earliestTransactionDate', () => {
  it('la fecha más antigua, solo de las cuentas indicadas', () => {
    const date = earliestTransactionDate(
      new Set(['a1']),
      [
        { accountId: 'a1', transactionDate: '2026-08-15' },
        { accountId: 'a1', transactionDate: '2026-06-01' },
        { accountId: 'a2', transactionDate: '2026-01-01' }, // fuera del filtro
      ],
    )
    expect(date).toBe('2026-06-01')
  })

  it('null si no hay ninguna', () => {
    expect(earliestTransactionDate(new Set(['a1']), [])).toBeNull()
  })
})
