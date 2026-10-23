import { describe, expect, it } from 'vitest'
import { defaultPayerId, findManualPurchasesForTicket, isPaymentMethod, parseAmount, validateManualPurchase, type PurchaseCandidate } from './manualPurchase'

const base = { store: 'Panadería', date: '2026-10-23', total: '8', paymentMethod: 'efectivo' }

describe('compra rápida — «Panadería — 8 € — Efectivo»', () => {
  it('con tienda, importe y forma de pago es válida', () => {
    expect(validateManualPurchase(base)).toBeNull()
  })
  it('lo imprescindible es el importe y la fecha: sin tienda ni forma de pago también se guarda', () => {
    expect(validateManualPurchase({ ...base, store: '', paymentMethod: '' })).toBeNull()
  })
  it('sin importe, con 0 o negativo → no se guarda', () => {
    expect(validateManualPurchase({ ...base, total: '' })).toMatch(/importe/i)
    expect(validateManualPurchase({ ...base, total: '0' })).toMatch(/mayor que 0/)
    expect(validateManualPurchase({ ...base, total: '-3' })).toMatch(/mayor que 0/)
    expect(validateManualPurchase({ ...base, total: 'abc' })).toMatch(/importe/i)
  })
  it('sin fecha o con una forma de pago inventada → no se guarda', () => {
    expect(validateManualPurchase({ ...base, date: '' })).toMatch(/fecha/i)
    expect(validateManualPurchase({ ...base, paymentMethod: 'bitcoin' })).toMatch(/forma de pago/i)
  })
  it('importe con coma decimal y redondeo a céntimos', () => {
    expect(parseAmount('8,5')).toBe(8.5)
    expect(parseAmount('8.505')).toBe(8.51)
    expect(parseAmount('  ')).toBeNull()
  })
  it('las formas de pago son una lista cerrada', () => {
    expect(['efectivo', 'tarjeta', 'bizum', 'transferencia', 'otro'].every(isPaymentMethod)).toBe(true)
    expect(isPaymentMethod('cheque')).toBe(false)
    expect(isPaymentMethod(null)).toBe(false)
  })
})

describe('quién pagó por defecto', () => {
  const members = [
    { id: 'm1', linkedProfileId: 'p1' },
    { id: 'm2', linkedProfileId: 'p2' },
    { id: 'm3', linkedProfileId: null },
  ]
  it('la persona que registra, si es miembro', () => {
    expect(defaultPayerId(members, 'p2')).toBe('m2')
  })
  it('si no es miembro de la familia o no hay sesión → vacío (el campo es opcional)', () => {
    expect(defaultPayerId(members, 'otra-familia')).toBe('')
    expect(defaultPayerId(members, null)).toBe('')
  })
})

describe('justificante posterior: ¿a qué compra manual pertenece este ticket?', () => {
  const manual = (o: Partial<PurchaseCandidate>): PurchaseCandidate => ({ id: 'r1', store: 'Panadería', receiptDate: '2026-10-20', totalAmount: 8, storagePath: null, isManual: true, ...o })
  const ticket = { totalAmount: 8, receiptDate: '2026-10-22', store: 'PANADERIA' }

  it('mismo importe, ±7 días y misma tienda (sin tildes ni mayúsculas) → candidata', () => {
    expect(findManualPurchasesForTicket([manual({})], ticket).map((c) => c.id)).toEqual(['r1'])
  })
  it('importe distinto, fuera de ventana o tienda distinta → no es candidata', () => {
    expect(findManualPurchasesForTicket([manual({ totalAmount: 8.5 })], ticket)).toEqual([])
    expect(findManualPurchasesForTicket([manual({ receiptDate: '2026-10-01' })], ticket)).toEqual([])
    expect(findManualPurchasesForTicket([manual({ store: 'Mercadona' })], ticket)).toEqual([])
  })
  it('una compra que ya tiene justificante, o que no es manual, nunca se ofrece', () => {
    expect(findManualPurchasesForTicket([manual({ storagePath: 'f/a.jpg' })], ticket)).toEqual([])
    expect(findManualPurchasesForTicket([manual({ isManual: false })], ticket)).toEqual([])
  })
  it('si falta la tienda en cualquiera de los dos lados, basta importe y fecha', () => {
    expect(findManualPurchasesForTicket([manual({ store: null })], ticket)).toHaveLength(1)
    expect(findManualPurchasesForTicket([manual({})], { ...ticket, store: '' })).toHaveLength(1)
  })
  it('sin importe en el ticket no se propone nada; varias candidatas van por cercanía de fecha', () => {
    expect(findManualPurchasesForTicket([manual({})], { ...ticket, totalAmount: null })).toEqual([])
    const out = findManualPurchasesForTicket([manual({ id: 'lejos', receiptDate: '2026-10-16' }), manual({ id: 'cerca', receiptDate: '2026-10-22' })], ticket)
    expect(out.map((c) => c.id)).toEqual(['cerca', 'lejos'])
  })
})
