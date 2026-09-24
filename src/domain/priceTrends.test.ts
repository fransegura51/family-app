import { describe, expect, it } from 'vitest'
import { averagePricesByMonth, basketTotal, compareMonths, decomposeSpendChange, type RawPurchase } from '@/domain/priceTrends'

const purchases: RawPurchase[] = [
  // Agosto: leche 2 veces (1.00 y 1.20), pan 1 vez.
  { productId: 'leche', price: 1.0, quantity: 2, unit: 'ud', recordedDate: '2026-08-03' },
  { productId: 'leche', price: 1.2, quantity: 1, unit: 'ud', recordedDate: '2026-08-20' },
  { productId: 'pan', price: 0.9, quantity: 1, unit: 'ud', recordedDate: '2026-08-10' },
  // Septiembre: leche sube (1.50), pan desaparece, aparece café.
  { productId: 'leche', price: 1.5, quantity: 3, unit: 'ud', recordedDate: '2026-09-02' },
  { productId: 'cafe', price: 4.0, quantity: 1, unit: 'ud', recordedDate: '2026-09-05' },
  // Julio: fuera de la comparación.
  { productId: 'leche', price: 0.8, quantity: 1, unit: 'ud', recordedDate: '2026-07-01' },
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

// ─── PESO-4/5 — magnitudes (€/kg vs €/ud): ver domain/measurementUnit.ts ───

describe('averagePricesByMonth / compareMonths — magnitudes', () => {
  it('A) dos precios €/kg del mismo producto: variación válida', () => {
    const kgPurchases: RawPurchase[] = [
      { productId: 'pepino', price: 1.7, quantity: 1.554, unit: 'kg', recordedDate: '2026-08-18' },
      { productId: 'pepino', price: 1.9, quantity: 1.2, unit: 'kg', recordedDate: '2026-09-18' },
    ]
    const cmp = compareMonths(averagePricesByMonth(kgPurchases), '2026-09', '2026-08')
    const pepino = cmp.find((c) => c.productId === 'pepino')!
    expect(pepino.unit).toBe('kg')
    expect(pepino.previousPrice).toBeCloseTo(1.7)
    expect(pepino.currentPrice).toBeCloseTo(1.9)
    expect(pepino.deltaPercent).toBeCloseTo(11.76, 1)
  })

  it('B) €/kg contra €/ud del mismo producto: nunca se comparan entre sí (dos series independientes)', () => {
    const mixed: RawPurchase[] = [
      { productId: 'x', price: 1.7, quantity: 1, unit: 'kg', recordedDate: '2026-08-01' },
      { productId: 'x', price: 2.0, quantity: 1, unit: 'ud', recordedDate: '2026-09-01' },
    ]
    const cmp = compareMonths(averagePricesByMonth(mixed), '2026-09', '2026-08')
    // Cada magnitud es su propia serie: la de "ud" no tiene mes anterior (solo hay "kg" en agosto).
    const ud = cmp.find((c) => c.productId === 'x' && c.unit === 'ud')!
    expect(ud.previousPrice).toBeNull()
    expect(ud.deltaPercent).toBeNull()
    expect(cmp.find((c) => c.productId === 'x' && c.unit === 'kg')).toBeUndefined() // "kg" no tiene compra en el mes actual
  })

  it('C) CASO REAL — Pepino legacy (unit=null, 2,64 €) en agosto + Pepino nuevo (kg, 1,70 €/kg) en septiembre: JAMÁS "bajó de 2,64 a 1,70"', () => {
    const real: RawPurchase[] = [
      { productId: 'pepino', price: 2.64, quantity: 1, unit: null, recordedDate: '2026-08-18' },
      { productId: 'pepino', price: 1.7, quantity: 1.554, unit: 'kg', recordedDate: '2026-09-18' },
    ]
    const cmp = compareMonths(averagePricesByMonth(real), '2026-09', '2026-08')
    const pepino = cmp.find((c) => c.productId === 'pepino')!
    expect(pepino.unit).toBe('kg')
    expect(pepino.currentPrice).toBeCloseTo(1.7)
    // Sin precio anterior comparable: el legacy queda excluido, nunca se calcula una bajada falsa.
    expect(pepino.previousPrice).toBeNull()
    expect(pepino.deltaPercent).toBeNull()
  })

  it('D) legacy normal por unidad (Leche): sin evidencia de venta por peso, el legacy SÍ es comparable', () => {
    const leche: RawPurchase[] = [
      { productId: 'leche2', price: 1.1, quantity: 1, unit: null, recordedDate: '2026-08-01' },
      { productId: 'leche2', price: 1.2, quantity: 1, unit: 'ud', recordedDate: '2026-09-01' },
    ]
    const cmp = compareMonths(averagePricesByMonth(leche), '2026-09', '2026-08')
    const leche2 = cmp.find((c) => c.productId === 'leche2')!
    expect(leche2.unit).toBe('ud')
    expect(leche2.previousPrice).toBeCloseTo(1.1)
    expect(leche2.currentPrice).toBeCloseTo(1.2)
    expect(leche2.deltaPercent).not.toBeNull()
  })
})

describe('decomposeSpendChange — magnitudes (PESO-5)', () => {
  it('K) legacy ↔ kg (Pepino real): no atribuye la diferencia a precio ni a cantidad — se trata como dejado de comprar + nuevo', () => {
    const real: RawPurchase[] = [
      { productId: 'pepino', price: 2.64, quantity: 1, unit: null, recordedDate: '2026-08-18' },
      { productId: 'pepino', price: 1.7, quantity: 1.554, unit: 'kg', recordedDate: '2026-09-18' },
    ]
    const b = decomposeSpendChange(real, '2026-09', '2026-08')
    expect(b.priceEffect).toBeCloseTo(0)
    expect(b.quantityEffect).toBeCloseTo(0)
    expect(b.droppedProductsEffect).toBeCloseTo(-2.64)
    expect(b.newProductsEffect).toBeCloseTo(1.7 * 1.554)
  })

  it('M) el total económico de cada mes nunca cambia por culpa de la exclusión de magnitudes', () => {
    const real: RawPurchase[] = [
      { productId: 'pepino', price: 2.64, quantity: 1, unit: null, recordedDate: '2026-08-18' },
      { productId: 'pepino', price: 1.7, quantity: 1.554, unit: 'kg', recordedDate: '2026-09-18' },
    ]
    const b = decomposeSpendChange(real, '2026-09', '2026-08')
    expect(b.previousTotal).toBeCloseTo(2.64)
    expect(b.currentTotal).toBeCloseTo(1.7 * 1.554)
    expect(b.priceEffect + b.quantityEffect + b.newProductsEffect + b.droppedProductsEffect).toBeCloseTo(b.currentTotal - b.previousTotal)
  })

  it('L) regresión — productos normales por unidad conservan la descomposición de siempre', () => {
    const b = decomposeSpendChange(purchases, '2026-09', '2026-08')
    expect(b.priceEffect).toBeCloseTo(1.3)
    expect(b.quantityEffect).toBeCloseTo(0)
  })
})
