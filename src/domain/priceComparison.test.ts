import { describe, expect, it } from 'vitest'
import { compareShoppingList, equivalentGroup, productPriceView, relationBetween, type CmpPrice, type CmpProduct } from './priceComparison'

const NOW = new Date('2026-10-23T12:00:00Z')
const P = (id: string, displayName: string, extra: Partial<CmpProduct> = {}): CmpProduct => ({ id, displayName, ...extra })
const R = (productId: string, price: number, store: string, recordedDate: string, unit: string | null = 'ud'): CmpPrice => ({ productId, price, store, unit, recordedDate })

describe('relación entre productos: la familia manda, luego lo compartido, luego el nombre', () => {
  const a = P('a', 'Leche entera Hacendado 1 L')
  const b = P('b', 'Leche entera Milbona 1 L')
  const c = P('c', 'Leche desnatada Hacendado 1 L')

  it('por el nombre: otra marca → equivalente (automático); otra variante → distinto', () => {
    expect(relationBetween(a, b)).toMatchObject({ relation: 'equivalent', source: 'inferred', automatic: true })
    expect(relationBetween(a, c).relation).toBe('different')
  })
  it('equivalencias corregidas a mano por la familia: «son lo mismo» y «no son lo mismo» mandan', () => {
    expect(relationBetween(a, c, { decisions: [{ productA: 'c', productB: 'a', relation: 'equivalent' }] })).toMatchObject({ relation: 'equivalent', source: 'family' })
    expect(relationBetween(a, b, { decisions: [{ productA: 'a', productB: 'b', relation: 'different' }] })).toMatchObject({ relation: 'different', source: 'family' })
  })
  it('una equivalencia compartida VALIDADA se aplica; una PROVISIONAL solo sugiere; una bloqueada descarta', () => {
    const x = P('x', 'Yogur sabor fresa Danone 4 ud')
    const y = P('y', 'Yogurt de fresa Hacendado')
    const shared = (level: 'validated' | 'provisional' | 'blocked') => ({ shared: [{ keyA: 'yogur sabor fresa danone 4 ud', keyB: 'yogurt de fresa hacendado', level }] })
    expect(relationBetween(x, y, shared('validated'))).toMatchObject({ relation: 'equivalent', source: 'shared', automatic: true })
    expect(relationBetween(x, y, shared('provisional')).automatic).toBe(false)
    expect(relationBetween(a, b, { shared: [{ keyA: 'leche entera hacendado 1 l', keyB: 'leche entera milbona 1 l', level: 'blocked' }] }).relation).toBe('different')
  })
  it('una equivalencia provisional de otra familia NO convierte en sugerencia lo que el nombre dice que es distinto', () => {
    expect(relationBetween(a, c, { shared: [{ keyA: 'leche entera hacendado 1 l', keyB: 'leche desnatada hacendado 1 l', level: 'provisional' }] }).relation).toBe('different')
  })
  it('el grupo separa los miembros de las sugerencias', () => {
    const d = P('d', 'Leche Pascual')
    const g = equivalentGroup(a, [a, b, c, d])
    expect(g.members.map((m) => m.product.id)).toEqual(['a', 'b'])
    expect(g.suggestions.map((m) => m.product.id)).toEqual(['d'])
    expect(equivalentGroup(a, [a, b], {}, 'identical').members.map((m) => m.product.id)).toEqual(['a'])
  })
})

describe('ficha del producto: precios por establecimiento', () => {
  const rice500 = P('r5', 'Arroz redondo 500 g')
  const rice1k = P('r1', 'Arroz redondo 1 kg')

  it('arroz 500 g frente a arroz 1 kg se compara en €/kg, con último precio, fecha y diferencia', () => {
    const v = productPriceView([rice500, rice1k], [R('r5', 0.9, 'Lidl', '2026-10-01'), R('r1', 1.6, 'Mercadona', '2026-10-10'), R('r1', 1.5, 'Mercadona', '2026-09-01')])
    expect(v.basis).toBe('kg')
    expect(v.rows.map((r) => [r.store, r.last.price.value])).toEqual([['Mercadona', 1.6], ['Lidl', 1.8]])
    expect(v.cheapestStore).toBe('Mercadona')
    expect(v.rows[1].diffVsCheapestPct).toBe(12.5)
    expect(v.rows[0].last.date).toBe('2026-10-10')
  })
  it('evolución del precio en una tienda (primer → último)', () => {
    const v = productPriceView([rice1k], [R('r1', 1.5, 'Mercadona', '2026-08-01'), R('r1', 1.65, 'Mercadona', '2026-10-01')])
    expect(v.rows[0].trendPct).toBe(10)
    expect(v.rows[0].history).toHaveLength(2) // los registros originales se conservan
  })
  it('sin tamaño en el nombre: no hay comparación exacta y se dice', () => {
    const v = productPriceView([P('l', 'Leche entera')], [R('l', 1, 'Lidl', '2026-10-01')])
    expect(v.rows).toEqual([])
    expect(v.note).toMatch(/tamaño/)
  })
  it('un registro de otra magnitud no se mezcla y se cuenta aparte', () => {
    const v = productPriceView([rice1k, P('ac', 'Aceite 1 L')], [R('r1', 1.6, 'Lidl', '2026-10-01'), R('ac', 6, 'Lidl', '2026-09-01')])
    expect(v.basis).toBe('kg')
    expect(v.notComparable).toBe(1)
  })
  it('un solo establecimiento: se enseña el precio pero no se declara «más barato»', () => {
    expect(productPriceView([rice1k], [R('r1', 1.6, 'Lidl', '2026-10-01')]).cheapestStore).toBeNull()
  })
})

describe('comparador de la lista de la compra', () => {
  const products = [
    P('m1', 'Leche entera Hacendado 1 L'),
    P('m2', 'Leche entera Milbona 1 L'),
    P('a1', 'Arroz redondo 1 kg'),
    P('h1', 'Huevos 12 ud'),
    P('p1', 'Pan de molde'),
    P('t1', 'Tomate', {}),
  ]
  const prices: CmpPrice[] = [
    R('m1', 0.9, 'Mercadona', '2026-10-15'),
    R('m2', 0.8, 'Lidl', '2026-10-12'),
    R('a1', 1.6, 'Mercadona', '2026-10-15'),
    R('a1', 1.4, 'Lidl', '2026-10-12'),
    R('h1', 2.4, 'Mercadona', '2026-10-15'),
    R('h1', 2.2, 'Lidl', '2026-10-12'),
    R('p1', 1.2, 'Mercadona', '2026-10-15'),
  ]

  it('lista con precio en todas las tiendas: totales completos, respetando cantidades', () => {
    const c = compareShoppingList(
      [{ name: 'Leche entera Hacendado 1 L', quantity: '6', unit: 'ud' }, { name: 'Arroz redondo 1 kg', quantity: '2', unit: 'ud' }, { name: 'Huevos 12 ud', quantity: null, unit: 'ud' }],
      products,
      prices,
      {},
      NOW,
    )
    expect(c.mode).toBe('full')
    expect(c.ranking).toEqual([{ store: 'Lidl', total: round(6 * 0.8 + 2 * 1.4 + 2.2) }, { store: 'Mercadona', total: round(6 * 0.9 + 2 * 1.6 + 2.4) }])
    expect(c.cheapest).toBe('Lidl')
    expect(c.savingVsNext).toBeCloseTo(round(6 * 0.9 + 2 * 1.6 + 2.4) - round(6 * 0.8 + 2 * 1.4 + 2.2), 2)
    // La leche de Lidl sale de una MARCA EQUIVALENTE: se indica
    expect(c.items[0].prices.find((p) => p.store === 'Lidl')).toMatchObject({ equivalent: true, basedOnProduct: 'Leche entera Milbona 1 L' })
  })

  it('lista parcial: NO se presenta como más barata la tienda que tiene menos precios; se compara el conjunto común', () => {
    const c = compareShoppingList(
      [{ name: 'Leche entera Hacendado 1 L', quantity: '1', unit: 'ud' }, { name: 'Arroz redondo 1 kg', quantity: '1', unit: 'ud' }, { name: 'Huevos 12 ud', quantity: '1', unit: 'ud' }, { name: 'Pan de molde', quantity: '1', unit: 'ud' }],
      products,
      prices,
      {},
      NOW,
    )
    // Lidl no tiene pan: su total bruto (4,0) es menor que el de Mercadona (6,1), pero eso no cuenta como victoria
    expect(c.stores.find((s) => s.store === 'Lidl')).toMatchObject({ covered: 3, complete: false })
    expect(c.mode).toBe('common')
    expect(c.commonCount).toBe(3)
    expect(c.ranking.map((r) => r.store)).toEqual(['Lidl', 'Mercadona'])
    expect(c.ranking[1].total).toBeCloseTo(0.9 + 1.6 + 2.4, 2) // el pan queda fuera para las dos
    expect(c.note).toMatch(/3 artículos/)
  })

  it('pocos artículos en común → no se compara (insufficient), nunca se inventa un ganador', () => {
    const c = compareShoppingList([{ name: 'Leche entera Hacendado 1 L', quantity: '1', unit: 'ud' }, { name: 'Pan de molde', quantity: '1', unit: 'ud' }], products, prices, {}, NOW)
    expect(c.mode).toBe('insufficient')
    expect(c.cheapest).toBeNull()
    expect(c.savingVsNext).toBeNull()
  })

  it('artículos que no se reconocen o no tienen precio comparable se listan con su motivo', () => {
    const c = compareShoppingList([{ name: 'Caviar beluga', quantity: '1', unit: null }, { name: 'Tomate', quantity: '1', unit: 'kg' }], products, prices, {}, NOW)
    expect(c.items[0]).toMatchObject({ productId: null })
    expect(c.items[0].reason).toMatch(/comprado antes/)
    expect(c.items[1].prices).toEqual([])
  })

  it('formato distinto: un artículo de 1 kg se valora con el €/kg de un arroz de 500 g de otra tienda', () => {
    const c = compareShoppingList(
      [{ name: 'Arroz redondo 1 kg', quantity: '1', unit: 'ud' }],
      [P('a1', 'Arroz redondo 1 kg'), P('a5', 'Arroz redondo 500 g')],
      [R('a1', 1.6, 'Mercadona', '2026-10-15'), R('a5', 0.9, 'Lidl', '2026-10-12')],
      {},
      NOW,
    )
    expect(c.items[0].prices.find((p) => p.store === 'Lidl')?.cost).toBe(1.8)
  })

  it('un producto sin tamaño legible NO se extrapola a otro formato: sin precio comparable', () => {
    const c = compareShoppingList([{ name: 'Leche entera', quantity: '1', unit: 'ud' }], [P('l1', 'Leche entera'), P('l2', 'Leche entera Hacendado 1 L')], [R('l2', 0.9, 'Lidl', '2026-10-12')], {}, NOW)
    expect(c.items[0].prices).toEqual([])
  })

  it('precios antiguos: se avisa; los datos son históricos de la familia', () => {
    const old = prices.map((p) => ({ ...p, recordedDate: '2026-04-01' }))
    const c = compareShoppingList([{ name: 'Leche entera Hacendado 1 L', quantity: '1', unit: 'ud' }, { name: 'Arroz redondo 1 kg', quantity: '1', unit: 'ud' }, { name: 'Huevos 12 ud', quantity: '1', unit: 'ud' }], products, old, {}, NOW)
    expect(c.hasStale).toBe(true)
    expect(c.stores.every((s) => s.stale)).toBe(true)
  })

  it('la lista vacía no compara nada', () => {
    expect(compareShoppingList([], products, prices, {}, NOW)).toMatchObject({ mode: 'insufficient', itemCount: 0, cheapest: null })
  })

  it('una equivalencia rechazada por la familia deja de usarse en el cálculo', () => {
    const c = compareShoppingList(
      [{ name: 'Leche entera Hacendado 1 L', quantity: '1', unit: 'ud' }, { name: 'Arroz redondo 1 kg', quantity: '1', unit: 'ud' }, { name: 'Huevos 12 ud', quantity: '1', unit: 'ud' }],
      products,
      prices,
      { decisions: [{ productA: 'm1', productB: 'm2', relation: 'different' }] },
      NOW,
    )
    expect(c.items[0].prices.map((p) => p.store)).toEqual(['Mercadona']) // Lidl ya no aporta precio de leche
    expect(c.mode).toBe('insufficient')
  })

  it('la cantidad no cambia qué tienda gana por artículo, solo el total (y se respeta la unidad kg)', () => {
    const c = compareShoppingList(
      [{ name: 'Tomate', quantity: '1,5', unit: 'kg' }],
      [P('t', 'Tomate')],
      [R('t', 2, 'Mercadona', '2026-10-15', 'kg'), R('t', 1.8, 'Lidl', '2026-10-12', 'kg')],
      {},
      NOW,
    )
    expect(c.items[0].prices.find((p) => p.store === 'Lidl')?.cost).toBe(2.7)
  })
})

function round(n: number) {
  return Math.round(n * 100) / 100
}
