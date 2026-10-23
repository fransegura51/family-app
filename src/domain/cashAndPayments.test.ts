import { describe, expect, it } from 'vitest'
import { balanceText, computeBalance, isManualMovement, movementDelta, shortfallNotice, usableWallets, type CashWallet } from './cashWallet'
import { emptyLeg, legsTotal, needsPaymentRecords, remainingToAllocate, splitInTwo, summaryMethod, syncSingleLeg, toRpcPayments, validateLegs, type PaymentLeg } from './purchasePayments'
import { refundLine, refundSummary, validateRefund } from './purchaseRefunds'

describe('carteras: saldo y aviso de saldo insuficiente', () => {
  it('saldo = inicial + movimientos con signo', () => {
    expect(computeBalance(50, [{ amount: 30 }, { amount: -10 }, { amount: -5 }])).toBe(65)
    expect(computeBalance(0, [])).toBe(0)
  })
  it('cartera a 0: el aviso sale con el texto del encargo y ofrece continuar, añadir efectivo o cancelar', () => {
    const n = shortfallNotice(0, 25)
    expect(n?.message).toBe('Tu cartera tiene 0,00 € y estás registrando un gasto de 25,00 €. ¿Quieres continuar?')
    expect(n?.choices.map((c) => c.label)).toEqual(['Registrar igualmente', 'Añadir efectivo', 'Cancelar'])
    expect(n?.missing).toBe(25)
  })
  it('saldo insuficiente: falta la diferencia; en negativo falta todo el gasto', () => {
    expect(shortfallNotice(10, 25)?.missing).toBe(15)
    expect(shortfallNotice(-5, 25)?.missing).toBe(25)
  })
  it('con saldo suficiente no avisa; un gasto igual al saldo tampoco', () => {
    expect(shortfallNotice(100, 25)).toBeNull()
    expect(shortfallNotice(25, 25)).toBeNull()
  })
  it('un saldo negativo se llama «por regularizar», nunca deuda', () => {
    expect(balanceText(-75)).toMatch(/por regularizar/)
    expect(balanceText(-75)).not.toMatch(/deuda/i)
    expect(balanceText(12.5)).toBe('12,50 €')
  })
  it('ajuste de saldo: se escribe el saldo que debería haber y se guarda la diferencia', () => {
    expect(movementDelta({ kind: 'adjust', amount: '40' }, 65)).toEqual({ delta: -25 })
    expect(movementDelta({ kind: 'adjust', amount: '65' }, 65)).toMatchObject({ error: expect.stringMatching(/nada que ajustar/) })
  })
  it('entrada suma, salida resta, importes inválidos se rechazan', () => {
    expect(movementDelta({ kind: 'in', amount: '10,5' }, 0)).toEqual({ delta: 10.5 })
    expect(movementDelta({ kind: 'out', amount: '10' }, 0)).toEqual({ delta: -10 })
    expect(movementDelta({ kind: 'in', amount: '0' }, 0)).toHaveProperty('error')
    expect(movementDelta({ kind: 'out', amount: '' }, 0)).toHaveProperty('error')
  })
  it('solo entradas, salidas y ajustes se pueden borrar a mano', () => {
    expect(['in', 'out', 'adjust'].every((k) => isManualMovement(k as never))).toBe(true)
    expect(['transfer_in', 'transfer_out', 'payment', 'refund'].some((k) => isManualMovement(k as never))).toBe(false)
  })
  it('cada persona ve la familiar y la suya; no las personales de otros ni las archivadas', () => {
    const w = (id: string, ownerMemberId: string | null, archivedAt: string | null = null): CashWallet => ({ id, name: id, ownerMemberId, openingBalance: 0, archivedAt, balance: 0 })
    expect(usableWallets([w('fam', null), w('mia', 'm1'), w('otra', 'm2'), w('vieja', null, '2026-01-01')], 'm1').map((x) => x.id)).toEqual(['fam', 'mia'])
  })
})

describe('pagos mixtos: un solo gasto total, varios medios', () => {
  const cash = (amount: string, walletId = ''): PaymentLeg => ({ method: 'efectivo', amount, walletId })
  const card = (amount: string): PaymentLeg => ({ method: 'tarjeta', amount, walletId: '' })

  it('60 € = 20 efectivo + 40 tarjeta es válido y suma exactamente el total', () => {
    expect(validateLegs(60, [cash('20'), card('40')])).toBeNull()
    expect(legsTotal([cash('20'), card('40')])).toBe(60)
    expect(summaryMethod([cash('20'), card('40')])).toBe('mixto')
  })
  it('si no suma el total dice cuánto falta o sobra', () => {
    expect(validateLegs(60, [cash('20'), card('30')])).toBe('Faltan 10,00 € por repartir')
    expect(validateLegs(60, [cash('30'), card('40')])).toBe('Sobran 10,00 € en los pagos')
    expect(remainingToAllocate(60, [cash('20')])).toBe(40)
  })
  it('pagos vacíos, a 0, con forma inventada o dos iguales se rechazan', () => {
    expect(validateLegs(10, [])).toMatch(/cómo se pagó/)
    expect(validateLegs(10, [cash('0')])).toMatch(/mayor que 0/)
    expect(validateLegs(10, [{ method: 'cheque' as never, amount: '10', walletId: '' }])).toMatch(/forma de pago/)
    expect(validateLegs(10, [cash('5'), cash('5')])).toMatch(/dos pagos iguales/)
  })
  it('solo el efectivo sale de una cartera', () => {
    expect(validateLegs(10, [{ method: 'tarjeta', amount: '10', walletId: 'w1' }])).toMatch(/Solo el efectivo/)
  })
  it('un único medio no necesita registros de pago salvo que use cartera', () => {
    expect(needsPaymentRecords([cash('8')])).toBe(false)
    expect(needsPaymentRecords([cash('8', 'w1')])).toBe(true)
    expect(needsPaymentRecords([cash('3'), card('5')])).toBe(true)
  })
  it('con un solo pago, cambiar el total lo arrastra; con varios no se toca', () => {
    expect(syncSingleLeg([cash('8')], 12)).toEqual([{ method: 'efectivo', amount: '12', walletId: '' }])
    expect(syncSingleLeg([cash('5'), card('5')], 12).map((l) => l.amount)).toEqual(['5', '5'])
  })
  it('pasar de uno a dos pagos reparte el total', () => {
    const legs = splitInTwo(60, cash('20'))
    expect(legs.map((l) => [l.method, l.amount])).toEqual([['efectivo', '20'], ['tarjeta', '40']])
    expect(validateLegs(60, legs)).toBeNull()
  })
  it('la carga del servidor lleva la cartera solo en efectivo y quién pagó', () => {
    expect(toRpcPayments([cash('20', 'w1'), card('40')], 'm1')).toEqual([
      { method: 'efectivo', amount: 20, wallet_id: 'w1', paid_by_member_id: 'm1' },
      { method: 'tarjeta', amount: 40, wallet_id: null, paid_by_member_id: 'm1' },
    ])
  })
  it('emptyLeg', () => expect(emptyLeg().method).toBe('efectivo'))
})

describe('devoluciones: neto de la compra', () => {
  it('sin devoluciones: todo pendiente y estado «none»', () => {
    expect(refundSummary(60, [])).toEqual({ total: 60, refunded: 0, net: 60, remaining: 60, status: 'none' })
    expect(refundLine(refundSummary(60, []))).toBeNull()
  })
  it('parcial: gasto neto = pagado − devuelto', () => {
    const s = refundSummary(60, [{ amount: 15 }])
    expect(s).toMatchObject({ refunded: 15, net: 45, remaining: 45, status: 'partial' })
    expect(refundLine(s)).toBe('↩️ Devueltos 15,00 € · neto 45,00 €')
  })
  it('total: neto 0 aunque se devuelva en dos veces', () => {
    const s = refundSummary(60, [{ amount: 15 }, { amount: 45 }])
    expect(s).toMatchObject({ net: 0, remaining: 0, status: 'total' })
    expect(refundLine(s)).toMatch(/Devuelta por completo/)
  })
  it('no se puede devolver más de lo que queda ni 0 ni vacío', () => {
    const s = refundSummary(60, [{ amount: 15 }])
    expect(validateRefund(s, '50')).toMatchObject({ error: expect.stringMatching(/Solo quedan 45,00/) })
    expect(validateRefund(s, '')).toHaveProperty('error')
    expect(validateRefund(s, '0')).toHaveProperty('error')
    expect(validateRefund(s, '45')).toEqual({ amount: 45 })
    expect(validateRefund(refundSummary(60, [{ amount: 60 }]), '1')).toMatchObject({ error: expect.stringMatching(/por completo/) })
  })
})
