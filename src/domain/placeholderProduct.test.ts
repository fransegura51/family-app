// COR-01 — el producto MARCADOR «Pendiente» no es un producto: nunca clasifica, nunca aporta naturaleza y no propaga la clase que alguien le diera a otros movimientos.
import { describe, expect, it } from 'vitest'
import { productClassSpending } from '@/domain/financeCompute'
import { buildProductKindSets, hasRealTicketBreakdown, isPlaceholderProduct, purchaseLinkState } from '@/domain/products'
import { resolveProductClass } from '@/domain/productClass'
import type { Product, ProductPrice } from '@/domain/types'

const product = (id: string, name: string, category: string | null, extra: Partial<Product> = {}): Product =>
  ({ id, familyId: 'f', normalizedName: name.toLowerCase(), displayName: name, category, brand: null, nonFood: true, classConfirmedAt: category ? '2026-09-21T19:55:45Z' : null, classKind: category ? 'no_alimentos' : null, ...extra }) as unknown as Product

describe('isPlaceholderProduct', () => {
  it.each(['Pendiente', 'PENDIENTE', '  pendiente ', 'Pendiente.', 'pendiente de clasificar', 'Pendiente por revisar', 'Pendiente de revisar'])('«%s» es el marcador', (name) => {
    expect(isPlaceholderProduct({ displayName: name })).toBe(true)
    expect(isPlaceholderProduct({ normalizedName: name })).toBe(true)
  })

  it.each(['Pendientes plata', 'Pendiente de pago de la luz', 'Pantalón pendiente de arreglar', 'Pendiente', 'x'])('«%s» (nombre real, parcial o distinto) NO se confunde por coincidencia parcial', (name) => {
    expect(isPlaceholderProduct({ displayName: name })).toBe(name === 'Pendiente')
  })

  it('sin producto o sin nombre no es el marcador', () => {
    expect(isPlaceholderProduct(null)).toBe(false)
    expect(isPlaceholderProduct(undefined)).toBe(false)
    expect(isPlaceholderProduct({})).toBe(false)
  })
})

describe('el marcador no aporta clasificación ni naturaleza', () => {
  it('resolveProductClass: aunque tenga «Ropa y calzado» confirmada, no devuelve clase (queda «Sin clasificar») y no depende de la tienda', () => {
    const marcador = product('p', 'Pendiente', 'Ropa y calzado')
    const r = resolveProductClass({ name: marcador.displayName, product: marcador, kind: 'no_alimentos', familyClasses: [{ name: 'Ropa y calzado', kind: 'no_alimentos', catalogKey: null }] })
    expect(r.className).toBe('')
    expect(r.source).toBe('fallback')
    // un producto real con la misma clase la conserva
    const real = product('q', 'Camiseta', 'Ropa y calzado')
    expect(resolveProductClass({ name: real.displayName, product: real, kind: 'no_alimentos', familyClasses: [{ name: 'Ropa y calzado', kind: 'no_alimentos', catalogKey: null }] }).className).toBe('Ropa y calzado')
  })

  it('buildProductKindSets: el marcador no entra ni en alimentos ni en no alimentos', () => {
    const { nonFoodProductIds, foodProductIds } = buildProductKindSets([product('p', 'Pendiente', 'Ropa y calzado'), product('q', 'Camiseta', 'Ropa y calzado')])
    expect([...nonFoodProductIds]).toEqual(['q'])
    expect([...foodProductIds]).toEqual([])
  })

  it('productClassSpending (¿cuánto he gastado en ropa?): las líneas del marcador no suman a «Ropa y calzado»', () => {
    const products = [product('p', 'Pendiente', 'Ropa y calzado'), product('q', 'Camiseta', 'Ropa y calzado')]
    const prices = [
      { id: '1', productId: 'p', price: 8.99, quantity: '1', recordedDate: '2026-10-04', receiptId: 'r1', store: 'Amazon', unit: null },
      { id: '2', productId: 'q', price: 12, quantity: '1', recordedDate: '2026-10-05', receiptId: 'r2', store: 'Amazon', unit: null },
    ] as unknown as ProductPrice[]
    const r = productClassSpending({ products, prices }, '2026-10-01', '2026-10-31', 'Ropa y calzado')
    expect(r).toEqual({ total: 12, lines: 1 })
  })
})

describe('estado del vínculo con una compra (ECO-UI-04)', () => {
  const real = { normalizedName: 'yogur', displayName: 'Yogur' }
  const marker = { normalizedName: 'pendiente', displayName: 'Pendiente' }
  it('sin compra: none', () => expect(purchaseLinkState(null)).toBe('none'))
  it('compra sin líneas (anotada a mano sin desglose): linked', () => expect(purchaseLinkState([])).toBe('linked'))
  it('solo el marcador: linked (no es desglose real)', () => expect(purchaseLinkState([marker, marker])).toBe('linked'))
  it('al menos un producto real: linked-products', () => {
    expect(purchaseLinkState([marker, real])).toBe('linked-products')
    expect(hasRealTicketBreakdown([marker, real])).toBe(true)
  })
})
