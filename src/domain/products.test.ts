import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFoodReceiptIds, computeProductStats, isFoodPurchase, isLikelyAlcohol } from '@/domain/products'
import type { BudgetCategory, ProductPrice } from '@/domain/types'

function price(recordedDate: string, amount: number): ProductPrice {
  return { id: recordedDate, productId: 'p', price: amount, store: 'Mercadona', quantity: null, unit: null, recordedDate, receiptId: null }
}

describe('computeProductStats', () => {
  afterEach(() => vi.useRealTimers())

  it('sin precios no hay estadísticas', () => {
    expect(computeProductStats([])).toBeNull()
  })

  it('cuenta, último, mínimo, máximo, media e intervalo medio entre compras', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0))
    // Desordenados a propósito: tiene que ordenar por fecha.
    const stats = computeProductStats([price('2026-09-08', 2.5), price('2026-09-01', 2), price('2026-09-15', 1.5)])!
    expect(stats.count).toBe(3)
    expect(stats.lastPrice).toBe(1.5)
    expect(stats.lastDate).toBe('2026-09-15')
    expect(stats.minPrice).toBe(1.5)
    expect(stats.maxPrice).toBe(2.5)
    expect(stats.avgPrice).toBe(2)
    expect(stats.avgDaysBetween).toBe(7)
    // 10 días desde la última compra ≥ 7 de media → toca comprar.
    expect(stats.isDue).toBe(true)
  })

  it('no está "pendiente" si aún no ha pasado el intervalo medio; con una sola compra nunca', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 18, 12, 0))
    expect(computeProductStats([price('2026-09-01', 2), price('2026-09-15', 2)])!.isDue).toBe(false)
    const single = computeProductStats([price('2026-01-01', 2)])!
    expect(single.avgDaysBetween).toBeNull()
    expect(single.isDue).toBe(false)
  })
})

describe('isLikelyAlcohol', () => {
  it('solo palabras completas: "ron" en "macarrones" no cuenta', () => {
    expect(isLikelyAlcohol('Cerveza Estrella')).toBe(true)
    expect(isLikelyAlcohol('Ron añejo')).toBe(true)
    expect(isLikelyAlcohol('Macarrones')).toBe(false)
    expect(isLikelyAlcohol('Pan')).toBe(false)
  })
})

describe('isFoodPurchase / buildFoodReceiptIds', () => {
  const categories: BudgetCategory[] = [
    { id: 'ali', familyId: 'f', name: 'Alimentación', icon: '', budgetGroup: 'generales', sortOrder: 0, parentId: null, necessity: null, isFixed: null },
    { id: 'cafe', familyId: 'f', name: 'Café', icon: '', budgetGroup: 'generales', sortOrder: 0, parentId: 'ali', necessity: null, isFixed: null },
    { id: 'tec', familyId: 'f', name: 'Tecnología', icon: '', budgetGroup: 'generales', sortOrder: 0, parentId: null, necessity: null, isFixed: null },
  ]
  const foodIds = buildFoodReceiptIds(
    [
      { id: 'r-cafe', category: 'Café' },
      { id: 'r-tec', category: 'Tecnología' },
    ],
    categories,
  )

  it('un ticket de Amazon solo es comida si su categoría lo es', () => {
    expect(foodIds.has('r-cafe')).toBe(true)
    expect(foodIds.has('r-tec')).toBe(false)
    expect(isFoodPurchase({ store: 'Amazon', receiptId: 'r-cafe' }, foodIds)).toBe(true)
    expect(isFoodPurchase({ store: 'Amazon', receiptId: 'r-tec' }, foodIds)).toBe(false)
    expect(isFoodPurchase({ store: 'Amazon', receiptId: null }, foodIds)).toBe(false)
  })
  it('cualquier otra tienda cuenta entera como compra física de alimentación', () => {
    expect(isFoodPurchase({ store: 'Mercadona', receiptId: null }, foodIds)).toBe(true)
  })
})
