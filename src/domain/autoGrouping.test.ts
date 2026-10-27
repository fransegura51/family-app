import { describe, expect, it } from 'vitest'
import { planAutoGrouping, type AutoCommon } from './autoGrouping'
import { commonResult, memberFormats, resultHeadline, type CommonMember } from './commonProducts'
import type { CmpPrice, CmpProduct } from './priceComparison'

const prod = (id: string, displayName: string, brand: string | null = null): CmpProduct => ({ id, displayName, brand })
const price = (productId: string, store: string, p = 1, o: Partial<CmpPrice> = {}): CmpPrice => ({ productId, price: p, store, unit: 'ud', recordedDate: '2026-10-01', ...o })

const run = (products: CmpProduct[], prices: CmpPrice[], extra: Partial<Parameters<typeof planAutoGrouping>[0]> = {}) =>
  planAutoGrouping({ products, prices, commons: [], members: [], skippedIds: new Set(), rejectedIds: new Set(), ...extra })

describe('agrupación automática: qué agrupa', () => {
  it('el mismo producto en dos tiendas, con el nombre cortado de forma distinta por cada ticket', () => {
    const products = [prod('a', 'MINI EMP PISTO P6'), prod('b', 'MINI EMPAN PISTO')]
    const plan = run(products, [price('a', 'Mercadona'), price('b', 'Hiperber')])
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0].productIds.sort()).toEqual(['a', 'b'])
    expect(plan.groups[0].stores).toEqual(['Hiperber', 'Mercadona'])
  })
  it('singular y plural, y con o sin tilde', () => {
    const plan = run([prod('a', 'BANDERILLAS DULCES'), prod('b', 'BANDERILLA DULCE'), prod('c', 'LIMON'), prod('d', 'LIMÓN')], [price('a', 'Mercadona'), price('b', 'Hiperber'), price('c', 'Mercadona'), price('d', 'Charter')])
    expect(plan.groups.map((g) => g.name).sort()).toEqual(['Banderilla dulce', 'Limón'])
  })
  it('mismo nombre en distinto tamaño (la presentación grande y la pequeña se pueden comparar)', () => {
    const plan = run([prod('a', 'GUACAMOLE 200 G'), prod('b', 'GUACAMOLE 500 GR')], [price('a', 'Mercadona'), price('b', 'Mercadona')])
    expect(plan.groups).toHaveLength(1)
  })
  it('otra marca del mismo producto y la marca blanca de la tienda no cuentan', () => {
    const plan = run([prod('a', 'PICOS CAMPERO'), prod('b', 'PICOS ALTEZA CAMP')], [price('a', 'Mercadona'), price('b', 'Hiperber')])
    expect(plan.groups[0].name).toBe('Picos campero')
  })
  it('lo más útil primero: los grupos con varias tiendas van antes', () => {
    const products = [prod('a', 'GUACAMOLE 200 G'), prod('b', 'GUACAMOLE 500 GR'), prod('c', 'LIMON'), prod('d', 'LIMÓN')]
    const plan = run(products, [price('a', 'Mercadona'), price('b', 'Mercadona'), price('c', 'Mercadona'), price('d', 'Charter')])
    expect(plan.groups[0].stores.length).toBe(2)
  })
})

describe('agrupación automática: qué NO agrupa', () => {
  it('productos con números distintos (VELA CIFRA 0 ≠ VELA CIFRA 4)', () => {
    expect(run([prod('a', 'VELA CIFRA 0'), prod('b', 'VELA CIFRA 4')], [price('a', 'Mercadona'), price('b', 'Mercadona')]).groups).toHaveLength(0)
  })
  it('variantes críticas: entera, semidesnatada, sin lactosa, con y sin alcohol', () => {
    const products = [prod('a', 'LECHE ENTERA 1L'), prod('b', 'LECHE SEMIDESNATADA 1L'), prod('c', 'LECHE SIN LACTOSA 1L'), prod('d', 'CERVEZA SIN ALCOHOL'), prod('e', 'CERVEZA CLASICA')]
    expect(run(products, products.map((p, i) => price(p.id, i % 2 ? 'Mercadona' : 'Hiperber'))).groups).toHaveLength(0)
  })
  it('una palabra genérica sola no basta, con o sin tamaño', () => {
    expect(run([prod('a', 'LECHE 1L'), prod('b', 'LECHE 1,5 L')], [price('a', 'Mercadona'), price('b', 'Hiperber')]).groups).toHaveLength(0)
    expect(run([prod('a', 'PEPINO'), prod('b', 'PEPINO HOLANDES')], [price('a', 'Mercadona'), price('b', 'Mercadona')]).groups).toHaveLength(0)
  })
  it('categorías parecidas pero distintas (croissant de cacao ≠ de bombón; cerveza de una marca ≠ de otra)', () => {
    const products = [prod('a', 'CROISSANT CACAO'), prod('b', 'CROISSANT BOMBON'), prod('c', 'CERVEZA ESTRELLA'), prod('d', 'CERVEZA MAHOU')]
    expect(run(products, products.map((p, i) => price(p.id, i % 2 ? 'Mercadona' : 'Hiperber'))).groups).toHaveLength(0)
  })
  it('una decisión «distinto» de la familia siempre separa', () => {
    const products = [prod('a', 'BANDERILLAS DULCES'), prod('b', 'BANDERILLA DULCE')]
    const plan = run(products, [price('a', 'Mercadona'), price('b', 'Hiperber')], { ctx: { decisions: [{ productA: 'a', productB: 'b', relation: 'different' }] } })
    expect(plan.groups).toHaveLength(0)
  })
  it('compras que no son de supermercado (restaurante, gasolinera) ni las bolsas', () => {
    const products = [prod('a', 'MAHOU CLASICA'), prod('b', 'MAHOU CLASICA 33'), prod('c', 'BOLSA COMPRA RECICL'), prod('d', 'BOLSA COMPRA RECICL.')]
    const plan = run(products, [price('a', 'PIZZERIA BRAVO'), price('b', 'PIZZERIA BRAVO'), price('c', 'Charter'), price('d', 'Charter')])
    expect(plan.groups).toHaveLength(0)
  })
})

describe('agrupación automática: respeta lo que la familia ya decidió', () => {
  const confirmed: AutoCommon = { id: 'c1', name: 'Leche semidesnatada', normalizedName: 'leche semidesnatada', status: 'confirmed' }
  const members: CommonMember[] = [{ productId: 'm', commonId: 'c1', source: 'manual' }]
  const products = [prod('m', 'LECHE SEMI P-6'), prod('x', 'LECHE SEMIDESNATADA PASCUAL 1L'), prod('y', 'LECHE SEMI DESNATADA')]
  const prices = [price('m', 'Mercadona'), price('x', 'Consum'), price('y', 'Mercadona')]

  it('no añade nada a un grupo confirmado: lo ofrece aparte para que lo añada la persona', () => {
    const plan = run(products, prices, { commons: [confirmed], members })
    expect(plan.groups).toHaveLength(0)
    expect(plan.forConfirmed).toHaveLength(1)
    expect(plan.forConfirmed[0].commonName).toBe('Leche semidesnatada')
    expect(plan.forConfirmed[0].productIds.sort()).toEqual(['x', 'y'])
  })
  it('un artículo ya agrupado, omitido o rechazado no vuelve a proponerse', () => {
    const plan = run(products, prices, { commons: [confirmed], members, skippedIds: new Set(['x']), rejectedIds: new Set(['y']) })
    expect(plan.forConfirmed).toHaveLength(0)
    expect(plan.groups).toHaveLength(0)
  })
  it('no crea un producto común con el nombre de otro ya existente', () => {
    const existing: AutoCommon = { id: 'c9', name: 'Limón', normalizedName: 'limon', status: 'confirmed' }
    const plan = run([prod('c', 'LIMON'), prod('d', 'LIMÓN')], [price('c', 'Mercadona'), price('d', 'Charter')], { commons: [existing] })
    expect(plan.groups).toHaveLength(0)
    expect(plan.forConfirmed[0].commonId).toBe('c9')
  })
  it('un grupo de PEPA sin revisar crece con artículos nuevos, sin crear otro', () => {
    const pending: AutoCommon = { id: 'p1', name: 'Limón', normalizedName: 'limon', status: 'pending' }
    const plan = run([prod('c', 'LIMON'), prod('d', 'LIMÓN'), prod('e', 'LIMON MALLA')], [price('c', 'Mercadona'), price('d', 'Charter'), price('e', 'Mercadona')], {
      commons: [pending],
      members: [{ productId: 'c', commonId: 'p1', source: 'pepa' }],
    })
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0]).toMatchObject({ commonId: 'p1', productIds: ['d'] })
  })
})

describe('agrupación automática: idempotencia', () => {
  it('con el mismo estado propone lo mismo; aplicado el plan, la segunda pasada no propone nada', () => {
    const products = [prod('a', 'MINI EMP PISTO P6'), prod('b', 'MINI EMPAN PISTO'), prod('c', 'GUACAMOLE 200 G'), prod('d', 'GUACAMOLE 500 GR')]
    const prices = products.map((p, i) => price(p.id, i % 2 ? 'Hiperber' : 'Mercadona'))
    const first = run(products, prices)
    expect(run(products, prices)).toEqual(first)
    const commons: AutoCommon[] = first.groups.map((g, i) => ({ id: `n${i}`, name: g.name, normalizedName: g.name.toLowerCase(), status: 'pending' as const }))
    const members: CommonMember[] = first.groups.flatMap((g, i) => g.productIds.map((productId) => ({ productId, commonId: `n${i}`, source: 'pepa' as const })))
    const second = run(products, prices, { commons, members })
    expect(second.groups).toHaveLength(0)
    expect(second.forConfirmed).toHaveLength(0)
  })
})

describe('precio por unidad de un pack sin contenido conocido (LECHE SEMI P-6)', () => {
  const common = { id: 'c', name: 'Leche semidesnatada', normalizedName: 'leche semidesnatada' }
  const members = [prod('p6', 'LECHE SEMI P-6'), prod('semi', 'LECHE SEMI DESNATADA')]
  const prices: CmpPrice[] = [price('p6', 'Mercadona', 10.74, { recordedDate: '2026-10-26' }), price('semi', 'Mercadona', 1.79, { recordedDate: '2026-06-29' })]

  it('el precio del paquete es el de la compra (10,74 €) y el precio por unidad sale de dividir entre 6, no de multiplicar', () => {
    const r = commonResult(common, members, prices)
    const p6 = [...r.offers, ...r.unformatted].find((o) => o.productId === 'p6')
    expect(p6?.totalPrice).toBe(10.74)
    expect(p6?.normalized.value).toBeCloseTo(1.79, 2)
    expect(p6?.normalized.packagePrice).toBe(10.74)
  })
  it('sin saber lo que contiene cada unidad no se declara ninguna «más económica»', () => {
    const r = commonResult(common, members, prices)
    expect(r.reliable).toBe(false)
    expect(r.offers.some((o) => o.cheapest)).toBe(false)
    expect(resultHeadline(r)).toBeNull()
    expect(r.note).toMatch(/no se sabe cuánto contiene cada una/)
  })
  it('con el contenido confirmado (6 × 1 l) ya se compara por litro', () => {
    const confirmedPrices = [price('p6', 'Mercadona', 10.74, { recordedDate: '2026-10-26', pack: { count: 6, amount: 1, unit: 'l' } }), price('semi', 'Mercadona', 1.79, { recordedDate: '2026-06-29', pack: { count: 1, amount: 1, unit: 'l' } })]
    const r = commonResult(common, members, confirmedPrices)
    expect(r.reliable).toBe(true)
    expect(r.basis).toBe('l')
    expect(r.offers.map((o) => o.cheapest)).toEqual([true, true])
  })
})

describe('formatos de los artículos de un grupo', () => {
  const ps = [prod('a', 'LECHE SEMI P-6'), prod('b', 'LECHE ASTURIANA S'), prod('c', 'LECHE SEMIDESNATADA PASCUAL 1L')]
  const prices: CmpPrice[] = [
    price('a', 'Mercadona', 10.74, { id: 'pa' }),
    price('b', 'Hiperber', 1.1, { id: 'pb', pack: { count: 1, amount: 1, unit: 'l' } }),
    price('c', 'Consum', 1.2, { id: 'pc' }),
  ]
  it('uno conocido, uno que PEPA lee en el nombre y uno por completar (no se inventa nada)', () => {
    const f = memberFormats(ps, prices, 'l')
    const by = new Map(f.map((x) => [x.productId, x]))
    expect(by.get('b')?.state).toBe('confirmado')
    expect(by.get('c')?.state).toBe('propuesto')
    expect(by.get('c')?.proposal).toEqual({ count: 1, amount: 1, unit: 'l' })
    expect(by.get('a')?.state).toBe('falta')
    expect(by.get('a')?.note).toMatch(/cuántas unidades/)
    expect(f.map((x) => x.state)).toEqual(['propuesto', 'falta', 'confirmado'].sort((x, y) => (x === 'confirmado' ? 1 : y === 'confirmado' ? -1 : x === 'propuesto' ? -1 : 1)))
  })
  it('un pack solo de unidades no cuenta como formato completo cuando el grupo se compara por litro', () => {
    const f = memberFormats([ps[0]], [price('a', 'Mercadona', 10.74, { id: 'pa', pack: { count: 6, amount: 1, unit: 'ud' } })], 'l')
    expect(f[0].state).toBe('falta')
  })
})
