// Los dos modos del Comparador: idénticos y alternativas, con formatos, packs, orden y filtros.
import { describe, expect, it } from 'vitest'
import type { CommonMember, CommonProduct } from './commonProducts'
import { autoComparableIds, buildComparisonGroups, filterGroups, groupClassOptions, hasReliableIdentity, productLabel, sortGroups, type ModeInput } from './comparisonModes'
import type { Product, ProductPrice } from './types'

const prod = (id: string, displayName: string, o: Partial<Product> = {}): Product => ({ id, displayName, normalizedName: displayName.toLowerCase(), familyId: 'f', category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null, ...o }) as Product
const price = (id: string, productId: string, store: string, value: number, date: string, o: Partial<ProductPrice> = {}): ProductPrice => ({ id, productId, price: value, store, quantity: '1', unit: 'ud', recordedDate: date, receiptId: null, pack: null, ...o })
const pk = (count: number, amount: number, unit: 'l' | 'ml' | 'g' | 'kg' | 'ud') => ({ count, amount, unit, source: 'manual' as const })

const input = (products: Product[], prices: ProductPrice[], extra: Partial<ModeInput> = {}): ModeInput => ({ products, prices, commons: [], members: [], skipped: [], ...extra })

describe('Productos idénticos: el catálogo identifica sin emparejar a mano', () => {
  const products = [prod('c15', 'COCA COLA 1,5 L'), prod('c1', 'COCA-COLA ORIGINAL 1 L'), prod('c33', 'COCA COLA LATA 33 CL'), prod('cz', 'COCA COLA ZERO 1 L')]
  const prices = [
    price('p1', 'c15', 'Mercadona', 1.65, '2026-10-01', { pack: pk(1, 1.5, 'l') }),
    price('p2', 'c1', 'Carrefour', 1.35, '2026-10-03', { pack: pk(1, 1, 'l') }),
    price('p3', 'c33', 'Dia', 0.75, '2026-10-05', { pack: pk(1, 330, 'ml') }),
    price('p4', 'cz', 'Mercadona', 1.4, '2026-10-02', { pack: pk(1, 1, 'l') }),
  ]
  it('sin ningún producto común: Coca-Cola original en tres formatos queda junta y la Zero aparte', () => {
    const groups = buildComparisonGroups('identicos', input(products, prices))
    const original = groups.find((g) => g.productIds.includes('c15'))
    expect(original).toBeTruthy()
    expect([...(original?.productIds ?? [])].sort()).toEqual(['c1', 'c15', 'c33'])
    expect(groups.find((g) => g.productIds.includes('cz'))?.productIds).toEqual(['cz'])
    expect(groups.some((g) => g.productIds.includes('cz') && g.productIds.includes('c1'))).toBe(false)
  })
  it('las filas enseñan producto, tienda, formato, precio pagado y precio normalizado, de menor a mayor', () => {
    const g = buildComparisonGroups('identicos', input(products, prices)).find((x) => x.productIds.includes('c15'))
    expect(g?.result.basis).toBe('l')
    expect(g?.rows.map((r) => [r.store, r.totalPrice, Number((r.normalized ?? 0).toFixed(2))])).toEqual([
      ['Mercadona', 1.65, 1.1],
      ['Carrefour', 1.35, 1.35],
      ['Dia', 0.75, 2.27],
    ])
    expect(g?.rows[0].cheapest).toBe(true)
    expect(g?.rows[0].packText).toMatch(/1,5 l/)
    expect(g?.best).toMatchObject({ basis: 'l', store: 'Mercadona' })
  })
  it('un pack se compara por litro sin tocar el precio pagado', () => {
    const p = [prod('b6', 'CERVEZA MAHOU 6 X 25 CL'), prod('b1', 'CERVEZA MAHOU LATA 33 CL')]
    const pr = [price('a', 'b6', 'Dia', 5.85, '2026-10-01', { pack: pk(6, 250, 'ml') }), price('b', 'b1', 'Dia', 0.9, '2026-10-02', { pack: pk(1, 330, 'ml') })]
    const g = buildComparisonGroups('identicos', input(p, pr))[0]
    const pack = g.rows.find((r) => r.productId === 'b6')
    expect(pack?.totalPrice).toBe(5.85)
    expect(Number((pack?.normalized ?? 0).toFixed(2))).toBe(3.9)
  })
  it('un artículo sin formato se enseña como pendiente y no se compara', () => {
    const g = buildComparisonGroups('identicos', input([prod('x', 'COCA COLA 1,5 L'), prod('y', 'COCA COLA')], [price('a', 'x', 'Dia', 1.5, '2026-10-01', { pack: pk(1, 1.5, 'l') }), price('b', 'y', 'Dia', 2, '2026-10-02')]))[0]
    const bare = g.rows.find((r) => r.productId === 'y')
    expect(bare?.state).toBe('sin-formato')
    expect(bare?.normalized).toBeNull()
    expect(bare?.totalPrice).toBe(2)
  })
  it('un producto común de la familia se respeta y absorbe los artículos idénticos nuevos (sin crear otro grupo)', () => {
    const common: CommonProduct = { id: 'c-cola', name: 'Cola original', normalizedName: 'cola original', status: 'confirmed' }
    const members: CommonMember[] = [{ productId: 'c15', commonId: 'c-cola', source: 'manual' }]
    const groups = buildComparisonGroups('identicos', input(products, prices, { commons: [common], members }))
    const cola = groups.filter((g) => g.productIds.includes('c15'))
    expect(cola).toHaveLength(1)
    expect(cola[0].origin).toBe('comun')
    expect(cola[0].virtual).toBe(false)
    expect([...cola[0].productIds].sort()).toEqual(['c1', 'c15', 'c33'])
  })
  it('lo marcado «no emparejar» o sin compras no aparece', () => {
    const groups = buildComparisonGroups('identicos', input(products, prices, { skipped: ['cz'] }))
    expect(groups.some((g) => g.productIds.includes('cz'))).toBe(false)
    expect(buildComparisonGroups('identicos', input(products, [])).length).toBe(0)
  })
  it('un artículo con identidad dudosa no entra solo', () => {
    const g = buildComparisonGroups('identicos', input([prod('q', 'XILOFON AZUL')], [price('a', 'q', 'Dia', 3, '2026-10-01')]))
    expect(g).toEqual([])
    expect(hasReliableIdentity(prod('q', 'XILOFON AZUL'))).toBe(false)
  })
  it('una variante confirmada por la familia entra: LECHE ASTURIANA S + «Leche semidesnatada»', () => {
    const sin = prod('l1', 'LECHE ASTURIANA S')
    expect(hasReliableIdentity(sin)).toBe(false)
    const con = prod('l1', 'LECHE ASTURIANA S', { catalogProductKey: 'lac.leche.v_tipoleche_semi' })
    expect(hasReliableIdentity(con)).toBe(true)
    expect([...autoComparableIds([sin, con])]).toEqual(['l1'])
  })
})

describe('Alternativas comparables', () => {
  const products = [
    prod('mahou', 'CERVEZA MAHOU 6X33CL'),
    prod('heineken', 'CERVEZA HEINEKEN LATA 33 CL'),
    prod('galicia', 'ESTRELLA GALICIA 1 L'),
    prod('sin', 'CERVEZA SIN ALCOHOL 33 CL'),
    prod('cola', 'COCA COLA 1,5 L'),
    prod('pepsi', 'PEPSI 2 L'),
    prod('fanta', 'FANTA NARANJA 2 L'),
  ]
  const prices = [
    price('1', 'mahou', 'Dia', 5.94, '2026-10-01', { pack: pk(6, 330, 'ml') }),
    price('2', 'heineken', 'Mercadona', 1.1, '2026-10-02', { pack: pk(1, 330, 'ml') }),
    price('3', 'galicia', 'Dia', 2.5, '2026-10-03', { pack: pk(1, 1, 'l') }),
    price('4', 'sin', 'Dia', 0.7, '2026-10-03', { pack: pk(1, 330, 'ml') }),
    price('5', 'cola', 'Dia', 1.65, '2026-10-04', { pack: pk(1, 1.5, 'l') }),
    price('6', 'pepsi', 'Mercadona', 1.7, '2026-10-05', { pack: pk(1, 2, 'l') }),
    price('7', 'fanta', 'Dia', 2.1, '2026-10-05', { pack: pk(1, 2, 'l') }),
  ]
  it('las cervezas con alcohol de varias marcas son una familia; la cerveza sin alcohol, otra', () => {
    const groups = buildComparisonGroups('alternativas', input(products, prices))
    const beers = groups.find((g) => g.name === 'Cerveza')
    expect([...(beers?.productIds ?? [])].sort()).toEqual(['galicia', 'heineken', 'mahou'])
    expect(beers?.productIds).not.toContain('sin')
    expect(beers?.distinctProducts).toBe(3)
    expect(beers?.origin).toBe('familia')
  })
  it('colas, Fanta y otros refrescos se juntan como «Refrescos» sin fundir sus identidades', () => {
    const groups = buildComparisonGroups('alternativas', input(products, prices))
    const soft = groups.find((g) => g.name === 'Refrescos')
    expect([...(soft?.productIds ?? [])].sort()).toEqual(['cola', 'fanta', 'pepsi'])
    expect(new Set(soft?.rows.map((r) => r.label)).size).toBe(3)
  })
  it('cada fila deja ver marca, tienda, formato y precio normalizado', () => {
    const beers = buildComparisonGroups('alternativas', input(products, prices)).find((g) => g.name === 'Cerveza')
    const mahou = beers?.rows.find((r) => r.productId === 'mahou')
    expect(mahou?.label).toMatch(/Cerveza.*Mahou/)
    expect(mahou?.store).toBe('Dia')
    expect(Number((mahou?.normalized ?? 0).toFixed(2))).toBe(3)
    expect(beers?.rows[0].normalized ?? 0).toBeLessThanOrEqual(beers?.rows[1].normalized ?? Infinity)
  })
  it('no mezcla identidades: ningún producto cambia de nombre ni de compra', () => {
    const groups = buildComparisonGroups('alternativas', input(products, prices))
    const all = groups.flatMap((g) => g.rows)
    expect(all.find((r) => r.productId === 'pepsi')?.totalPrice).toBe(1.7)
    expect(all.find((r) => r.productId === 'pepsi')?.rawName).toBe('PEPSI 2 L')
  })
  it('una propuesta dudosa no forma familia', () => {
    expect(buildComparisonGroups('alternativas', input([prod('q', 'XILOFON AZUL')], [price('a', 'q', 'Dia', 3, '2026-10-01')]))).toEqual([])
  })
})

describe('orden, búsqueda y filtros', () => {
  const products = [prod('a', 'COCA COLA 1,5 L'), prod('b', 'COCA COLA 2 L'), prod('c', 'LECHE SEMIDESNATADA 1 L'), prod('d', 'LECHE SEMIDESNATADA PASCUAL 1 L'), prod('e', 'ARROZ BOMBA 1 KG'), prod('f', 'DETERGENTE LIQUIDO 3 L')]
  const prices = [
    price('1', 'a', 'Dia', 1.65, '2026-10-01', { pack: pk(1, 1.5, 'l') }),
    price('2', 'b', 'Dia', 2, '2026-10-08', { pack: pk(1, 2, 'l') }),
    price('3', 'c', 'Dia', 0.9, '2026-10-02', { pack: pk(1, 1, 'l'), receiptId: 'r1' }),
    price('4', 'd', 'Dia', 1.1, '2026-10-02', { pack: pk(1, 1, 'l'), receiptId: 'r1' }),
    price('5', 'e', 'Dia', 1.9, '2026-10-03', { pack: pk(1, 1, 'kg') }),
    price('6', 'f', 'Dia', 9, '2026-10-03', { pack: pk(1, 3, 'l') }),
    price('7', 'c', 'Mercadona', 0.85, '2026-10-09', { pack: pk(1, 1, 'l'), receiptId: 'r2' }),
  ]
  const groups = buildComparisonGroups('alternativas', input(products, prices))
  it('por categoría y alfabético dentro de ella', () => {
    const classes = sortGroups(groups, 'categoria').map((g) => g.className)
    expect(classes).toEqual([...classes].sort((x, y) => x.localeCompare(y, 'es')))
  })
  it('A–Z', () => {
    const names = sortGroups(groups, 'az').map((g) => g.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')))
  })
  it('por precio normalizado, sin mezclar kilo y litro', () => {
    const rank = (b?: string) => (b === 'l' ? 0 : b === 'kg' ? 1 : 2)
    const ranks = sortGroups(groups, 'precio').filter((g) => g.best).map((g) => rank(g.best?.basis))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
  it('por frecuencia real: dos presentaciones de una misma compra cuentan como una sola compra', () => {
    const milk = groups.find((g) => g.productIds.includes('c'))
    expect(milk?.purchases).toBe(2) // r1 (dos artículos) + r2
    expect(sortGroups(groups, 'frecuencia')[0].id).toBe(milk?.id)
  })
  it('buscador por producto, marca o tienda; filtro por categoría y «solo comparables»', () => {
    expect(filterGroups(groups, { query: 'pascual' }).map((g) => g.id)).toEqual([groups.find((g) => g.productIds.includes('d'))?.id])
    expect(filterGroups(groups, { query: 'mercadona' }).length).toBe(1)
    const opts = groupClassOptions(groups)
    expect(opts.length).toBeGreaterThan(1)
    const drinks = filterGroups(groups, { classKey: opts.find((o) => /Bebidas/.test(o.name))?.key })
    expect(drinks.every((g) => /Bebidas/.test(g.className))).toBe(true)
    expect(filterGroups(groups, { onlyComparable: true }).every((g) => g.result.offers.length >= 2)).toBe(true)
  })
  it('el nombre mostrado usa el producto normalizado con su marca', () => {
    expect(productLabel(prod('d', 'LECHE SEMIDESNATADA PASCUAL 1 L'))).toBe('Leche semidesnatada · Pascual')
    expect(productLabel(prod('q', 'XILOFON AZUL'))).toBe('XILOFON AZUL')
  })
})

describe('formatos coherentes entre compras equivalentes', () => {
  it('patatas de distintos pesos se enseñan con el mismo estilo y su precio por kilo', () => {
    const p = [prod('p5', 'PATATA 5 KG'), prod('p3', 'PATATA 3 KG'), prod('pk', 'PATATA')]
    const pr = [price('a', 'p5', 'Dia', 4.5, '2026-10-01'), price('b', 'p3', 'Mercadona', 3.3, '2026-10-02'), price('c', 'pk', 'Dia', 1.2, '2026-10-03', { unit: 'kg' })]
    const g = buildComparisonGroups('identicos', input(p, pr))[0]
    const texts = g.rows.map((r) => [r.productId, r.packText])
    expect(texts).toEqual(expect.arrayContaining([['p5', '5 kg (del nombre)'], ['p3', '3 kg (del nombre)'], ['pk', 'al peso']]))
    expect(g.rows.map((r) => Number((r.normalized ?? 0).toFixed(2)))).toEqual([0.9, 1.1, 1.2])
  })
})

describe('categorías coherentes entre Compras, Economía y Comparador', () => {
  const pr = [price('a', 'l1', 'Dia', 0.9, '2026-10-01', { pack: pk(1, 1, 'l') })]
  it('la categoría que la familia confirmó manda sobre la del catálogo', () => {
    const catalog = buildComparisonGroups('alternativas', input([prod('l1', 'LECHE SEMIDESNATADA 1 L')], pr))[0]
    expect(catalog.className).toBe('Lácteos')
    const custom = buildComparisonGroups('identicos', input([prod('l1', 'LECHE SEMIDESNATADA 1 L', { category: 'Para el bebé', classConfirmedAt: '2026-10-01T10:00:00Z' })], pr))[0]
    expect(custom.className).toBe('Para el bebé')
    expect(custom.classKey).toBe('custom:Para el bebé')
  })
  it('«Lácteos y huevos» (nombre antiguo) y «Lácteos» son la misma categoría: no conviven dos', () => {
    const groups = buildComparisonGroups('identicos', input(
      [prod('a', 'LECHE SEMIDESNATADA 1 L', { category: 'Lácteos y huevos', classConfirmedAt: '2026-10-01T10:00:00Z' }), prod('b', 'YOGUR NATURAL 4 UD', { category: 'Lácteos', classConfirmedAt: '2026-10-01T10:00:00Z' })],
      [price('x', 'a', 'Dia', 0.9, '2026-10-01', { pack: pk(1, 1, 'l') }), price('y', 'b', 'Dia', 1.2, '2026-10-01', { pack: pk(4, 125, 'g') })],
    ))
    expect(new Set(groups.map((g) => g.classKey))).toEqual(new Set(['food.lacteos_huevos']))
    expect(new Set(groups.map((g) => g.className))).toEqual(new Set(['Lácteos']))
  })
})
