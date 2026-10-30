import { describe, expect, it } from 'vitest'

import { summarizeReceiptDiscounts } from '@/domain/receiptDiscount'
describe('COMP-07 · ahorro por descuentos', () => {
  const receipts = [
    { id: 'amz', receiptDate: '2026-10-05', store: 'Amazon', totalAmount: 48.52, discountTotal: 2.4 },
    { id: 'bew', receiptDate: '2026-10-22', store: 'BEWISHOME', totalAmount: 86.02, discountTotal: 9.56 },
    { id: 'sep', receiptDate: '2026-09-10', store: 'Mercadona', totalAmount: 30, discountTotal: 1.1 },
    { id: 'none', receiptDate: '2026-10-07', store: 'Lidl', totalAmount: 20, discountTotal: 0 },
    { id: 'null', receiptDate: '2026-10-08', store: 'Lidl', totalAmount: null, discountTotal: 5 },
  ]
  it('suma una sola vez cada compra con descuento del periodo y original = pagado + descuento', () => {
    const s = summarizeReceiptDiscounts(receipts, '2026-10-01', '2026-10-31')
    expect(s.total).toBe(11.96)
    expect(s.purchases.map((p) => p.receiptId)).toEqual(['bew', 'amz'])
    const bew = s.purchases[0]
    expect(bew.original).toBe(95.58)
    expect(bew.discount).toBe(9.56)
    expect(bew.paid).toBe(86.02)
    expect(Math.round((bew.original - bew.discount) * 100)).toBe(Math.round(bew.paid * 100))
  })
  it('la evolución mensual cubre todas las fechas, ascendente, sin duplicar', () => {
    const s = summarizeReceiptDiscounts(receipts, '2026-10-01', '2026-10-31')
    expect(s.byMonth).toEqual([
      { month: '2026-09', discount: 1.1, purchases: 1 },
      { month: '2026-10', discount: 11.96, purchases: 2 },
    ])
  })
  it('sin descuentos en el periodo: total 0 y lista vacía', () => {
    const s = summarizeReceiptDiscounts(receipts, '2026-01-01', '2026-01-31')
    expect(s.total).toBe(0)
    expect(s.purchases).toEqual([])
  })
})
