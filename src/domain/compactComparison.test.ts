import { describe, expect, it } from 'vitest'
import { buildCompactComparisons, compactComparison, productPriceView, type CmpPrice, type CmpProduct } from './priceComparison'

const prod = (id: string, displayName: string): CmpProduct => ({ id, displayName })
const price = (productId: string, store: string, value: number, date: string, o: Partial<CmpPrice> = {}): CmpPrice => ({ productId, price: value, store, unit: 'kg', recordedDate: date, ...o })

describe('comparación compacta del listado', () => {
  it('el ejemplo del encargo: Pepino 2,00 €/kg en el mercado y 1,70 €/kg en Mercadona → 15 % menos', () => {
    const products = [prod('p', 'Pepino')]
    const view = productPriceView(products, [price('p', 'Mercadona', 1.7, '2026-10-03'), price('p', 'Mercado', 2, '2026-10-22')])
    expect(compactComparison(view)).toEqual({
      basis: 'kg',
      last: { store: 'Mercado', value: 2, date: '2026-10-22' },
      best: { store: 'Mercadona', value: 1.7, date: '2026-10-03' },
      pctLess: 15,
      lastIsCheapest: false,
      stores: 2,
    })
  })

  it('si lo último ya fue lo más barato lo dice, sin inventar una alternativa', () => {
    const view = productPriceView([prod('p', 'Pepino')], [price('p', 'Mercadona', 1.7, '2026-10-22'), price('p', 'Mercado', 2, '2026-10-03')])
    expect(compactComparison(view)).toMatchObject({ lastIsCheapest: true, best: null, pctLess: null })
  })

  it('una diferencia menor del 3 % no se enseña', () => {
    expect(compactComparison(productPriceView([prod('p', 'Pepino')], [price('p', 'A', 2, '2026-10-22'), price('p', 'B', 1.96, '2026-10-03')]))).toBeNull()
  })

  it('con una sola tienda, o sin tienda concreta, no hay comparación', () => {
    expect(compactComparison(productPriceView([prod('p', 'Pepino')], [price('p', 'A', 2, '2026-10-22'), price('p', 'A', 1.9, '2026-10-01')]))).toBeNull()
    expect(compactComparison(productPriceView([prod('p', 'Pepino')], [price('p', 'A', 2, '2026-10-22'), { ...price('p', 'A', 1.5, '2026-10-01'), store: null }]))).toBeNull()
  })

  it('sin formato fiable (envase) no se compara en el listado', () => {
    const view = productPriceView([prod('p', 'Cerveza')], [price('p', 'A', 5, '2026-10-22', { unit: 'ud' }), price('p', 'B', 4, '2026-10-01', { unit: 'ud' })])
    expect(compactComparison(view)).toBeNull()
  })

  it('con el formato guardado al registrar la compra sí se compara: 6 × 330 ml en Lidl frente a 12 × 330 ml en Mercadona', () => {
    const view = productPriceView(
      [prod('p', 'Cerveza Estrella')],
      [
        price('p', 'Lidl', 4.95, '2026-09-10', { unit: 'ud', pack: { count: 6, amount: 330, unit: 'ml' } }),
        price('p', 'Mercadona', 8.8, '2026-10-12', { unit: 'ud', pack: { count: 12, amount: 330, unit: 'ml' } }),
      ],
    )
    const c = compactComparison(view)
    expect(c).toMatchObject({ basis: 'l', last: { store: 'Mercadona', value: 2.2222 } })
    // Mercadona (más reciente) es lo más barato: 2,22 €/l frente a 2,50 €/l
    expect(c?.lastIsCheapest).toBe(true)
  })

  it('el mismo producto en packs distintos se compara por €/l, no por precio del paquete', () => {
    const view = productPriceView([prod('p', 'Cerveza')], [price('p', 'A', 4.95, '2026-10-22', { unit: 'ud', pack: { count: 6, amount: 330, unit: 'ml' } }), price('p', 'B', 5.4, '2026-10-01', { unit: 'ud', pack: { count: 12, amount: 330, unit: 'ml' } })])
    expect(compactComparison(view)).toMatchObject({ lastIsCheapest: false, best: { store: 'B' } })
  })
})

describe('todos los productos a la vez', () => {
  const products = [prod('pepino', 'Pepino'), prod('leche', 'Leche entera'), prod('aceite', 'Aceite de oliva')]
  const prices = [
    price('pepino', 'Mercadona', 1.7, '2026-10-03'),
    price('pepino', 'Mercado', 2, '2026-10-22'),
    price('leche', 'Mercadona', 1.1, '2026-10-01', { unit: 'ud' }),
    price('aceite', 'Mercadona', 8, '2026-10-01', { unit: 'ud' }),
  ]
  it('solo salen los productos con comparación fiable; los comprados en una sola tienda no', () => {
    const map = buildCompactComparisons(products, prices)
    expect([...map.keys()]).toEqual(['pepino'])
    expect(map.get('pepino')?.pctLess).toBe(15)
  })
  it('no se comparan productos distintos aunque compartan una palabra', () => {
    const more = [...products, prod('pepinillos', 'Pepinillos en vinagre')]
    const p2 = [...prices, price('pepinillos', 'Lidl', 3, '2026-10-05', { unit: 'ud' })]
    expect([...buildCompactComparisons(more, p2).keys()]).toEqual(['pepino'])
  })
})
