import { describe, expect, it } from 'vitest'
import { countPendingLinesByReceipt, pendingPurchasesLabel } from '@/domain/pendingPurchaseLines'

const pending = { normalizedName: 'pendiente', displayName: 'Pendiente' }
const real = { normalizedName: 'yogur natural', displayName: 'Yogur natural' }

describe('COMP-06 · líneas «Pendiente» por compra', () => {
  it('cuenta solo las líneas marcador, por compra', () => {
    const m = countPendingLinesByReceipt([
      { receiptId: 'a', product: pending },
      { receiptId: 'a', product: pending },
      { receiptId: 'a', product: real },
      { receiptId: 'b', product: real },
      { receiptId: 'c', product: { normalizedName: 'pendientes de pago', displayName: 'Pendientes de pago' } },
      { receiptId: null, product: pending },
    ])
    expect([...m.entries()]).toEqual([['a', 2]])
  })
  it('etiqueta singular y plural', () => {
    expect(pendingPurchasesLabel(1)).toBe('1 compra con productos por identificar')
    expect(pendingPurchasesLabel(3)).toBe('3 compras con productos por identificar')
  })
})
