import { describe, expect, it } from 'vitest'
import { averagePricesByMonth, basketTotal, compareMonths, decomposeSpendChange, type RawPurchase } from '@/domain/priceTrends'

const purchases: RawPurchase[] = [
  // Agosto: leche 2 veces (1.00 y 1.20), pan 1 vez.
  { productId: 'leche', price: 1.0, quantity: 2, recordedDate: '2026-08-03' },
  { productId: 'leche', price: 1.2, quantity: 1, recordedDate: '2026-08-20' },
  { productId: 'pan', price: 0.9, quantity: 1, recordedDate: '2026-08-10' },
  // Septiembre: leche sube (1.50), pan desaparece, aparece café.
  { productId: 'leche', price: 1.5, quantity: 3, recordedDate: '2026-09-02' },
  { productId: 'cafe', price: 4.0, quantity: 1, recordedDate: '2026-09-05' },
  // Julio: fuera de la comparación.
  { productId: 'leche', price: 0.8, quantity: 1, recordedDate: '2026-07-01' },
]

describe('averagePricesByMonth', () => {
  it('promedia el precio POR UNIDAD de cada producto y mes (sin volver a dividir por cantidad)', () => {
    const rows = averagePricesByMonth(purchases)
    const leche08 = rows.find((r) => r.productId === 'leche' && r.month === '2026-08')!
    expect(leche08.avgPrice).toBeCloseTo(1.1)
    expect(rows.find((r) => r.productId === 'cafe' && r.month === '2026-09')!.avgPrice).toBe(4)
  })
})

describe('compareMonths', () => {
  it('solo lo comprado ESTE mes; sin mes anterior no hay porcentaje', () => {
    const cmp = compareMonths(averagePricesByMonth(purchases), '2026-09', '2026-08')
    const leche = cmp.find((c) => c.productId === 'leche')!
    expect(leche.currentPrice).toBe(1.5)
    expect(leche.previousPrice).toBeCloseTo(1.1)
    expect(leche.deltaPercent).toBeCloseTo(36.36, 1)
    const cafe = cmp.find((c) => c.productId === 'cafe')!
    expect(cafe.previousPrice).toBeNull()
    expect(cafe.deltaPercent).toBeNull()
    // El pan se compró en agosto pero no en septiembre: no aparece.
    expect(cmp.find((c) => c.productId === 'pan')).toBeUndefined()
  })
})

describe('basketTotal', () => {
  it('lo pagado de verdad: precio unitario × unidades, solo ese mes', () => {
    expect(basketTotal(purchases, '2026-08')).toBeCloseTo(1.0 * 2 + 1.2 + 0.9)
    expect(basketTotal(purchases, '2026-09')).toBeCloseTo(1.5 * 3 + 4.0)
  })
})

describe('decomposeSpendChange', () => {
  const b = decomposeSpendChange(purchases, '2026-09', '2026-08')

  it('totales de cada mes', () => {
    expect(b.previousTotal).toBeCloseTo(4.1)
    expect(b.currentTotal).toBeCloseTo(8.5)
  })

  it('reparte el cambio por causa: precio, cantidad, productos nuevos y abandonados', () => {
    // Leche: agosto 3 uds a 1.0667 de media (3.2 €), septiembre 3 uds a 1.5.
    // Efecto precio = (1.5 − 1.0667) × 3 ≈ 1.3; efecto cantidad = 0.
    expect(b.priceEffect).toBeCloseTo(1.3)
    expect(b.quantityEffect).toBeCloseTo(0)
    expect(b.newProductsEffect).toBeCloseTo(4.0) // café
    expect(b.droppedProductsEffect).toBeCloseTo(-0.9) // pan
  })

  it('las causas suman exactamente la diferencia entre meses (identidad contable)', () => {
    expect(b.priceEffect + b.quantityEffect + b.newProductsEffect + b.droppedProductsEffect).toBeCloseTo(b.currentTotal - b.previousTotal)
  })
})
