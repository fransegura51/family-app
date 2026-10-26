import { describe, expect, it } from 'vitest'
import { articleStats, commonResult, pairingQueue, resultHeadline, similarPending, suggestCommonName, suggestCommons, type CommonMember, type CommonProduct } from './commonProducts'
import type { CmpPrice, CmpProduct } from './priceComparison'

const prod = (id: string, displayName: string): CmpProduct => ({ id, displayName })
const price = (productId: string, store: string, value: number, date: string, o: Partial<CmpPrice> = {}): CmpPrice => ({ productId, price: value, store, unit: 'ud', recordedDate: date, ...o })
const common = (id: string, name: string): CommonProduct => ({ id, name, normalizedName: name.toLowerCase() })

describe('comparar distintos formatos bajo un producto común (el ejemplo del encargo)', () => {
  const leche = common('c1', 'Leche semidesnatada')
  const members = [prod('m', 'LECHE SEMI P-6 HACENDADO'), prod('h', 'LECHE ASTURIANA S'), prod('k', 'Leche Pascual semidesnatada'), prod('o', 'Leche Kaiku semi caja')]
  const prices: CmpPrice[] = [
    price('m', 'Mercadona', 6.3, '2026-10-01', { pack: { count: 6, amount: 1, unit: 'l' } }),
    price('h', 'Hiperber', 1.43, '2026-10-05', { pack: { count: 1, amount: 1.5, unit: 'l' } }),
    price('k', 'Consum', 1.1, '2026-10-08', { pack: { count: 1, amount: 1, unit: 'l' } }),
    price('o', 'Otra tienda', 6, '2026-10-10', { pack: { count: 12, amount: 500, unit: 'ml' } }),
  ]
  const r = commonResult(leche, members, prices)

  it('calcula €/l de cada presentación y ordena de menor a mayor', () => {
    expect(r.basis).toBe('l')
    expect(r.offers.map((o) => o.store)).toEqual(['Hiperber', 'Otra tienda', 'Mercadona', 'Consum'])
    expect(r.offers.map((o) => Math.round(o.normalized.value * 100) / 100)).toEqual([0.95, 1, 1.05, 1.1])
  })
  it('destaca la más económica y da la diferencia de las demás', () => {
    expect(r.offers[0]).toMatchObject({ store: 'Hiperber', cheapest: true, diffPct: 0 })
    expect(r.offers.find((o) => o.store === 'Consum')?.diffPct).toBe(15.4)
    expect(r.offers.filter((o) => o.cheapest)).toHaveLength(1)
  })
  it('conserva el precio total original, el formato, la fecha y la tienda (para ver el desembolso del paquete grande)', () => {
    const merc = r.offers.find((o) => o.store === 'Mercadona')!
    expect(merc).toMatchObject({ totalPrice: 6.3, date: '2026-10-01', pack: { count: 6, amount: 1, unit: 'l' } })
    expect(Math.max(...r.offers.map((o) => o.totalPrice))).toBe(6.3)
  })
  it('titular de la lista plegada', () => {
    expect(resultHeadline(r)).toMatchObject({ store: 'Hiperber', basis: 'l' })
    expect(r.storeCount).toBe(4)
  })
})

describe('qué no se compara', () => {
  const c = common('c', 'Cerveza')
  const members = [prod('a', 'Cerveza A'), prod('b', 'Cerveza B'), prod('c', 'Cerveza C')]
  it('lo que no tiene formato se lista aparte, sin inventar resultados', () => {
    const r = commonResult(c, members, [price('a', 'Lidl', 4.95, '2026-10-01', { pack: { count: 6, amount: 330, unit: 'ml' } }), price('b', 'Dia', 3, '2026-10-02')])
    expect(r.offers).toHaveLength(1)
    expect(r.unformatted.map((o) => o.store)).toEqual(['Dia'])
    expect(r.note).toContain('falta otra para comparar')
    expect(resultHeadline(r)).toBeNull()
  })
  it('€/kg y €/l no se mezclan: lo de otra magnitud se aparta', () => {
    const r = commonResult(c, members, [
      price('a', 'Lidl', 4.95, '2026-10-01', { pack: { count: 6, amount: 330, unit: 'ml' } }),
      price('b', 'Dia', 3.2, '2026-10-02', { pack: { count: 1, amount: 1, unit: 'l' } }),
      price('c', 'Hiper', 2, '2026-10-03', { pack: { count: 1, amount: 500, unit: 'g' } }),
    ])
    expect(r.basis).toBe('l')
    expect(r.otherUnit.map((o) => o.store)).toEqual(['Hiper'])
  })
  it('vendido por kg convive con envases de peso (€/kg)', () => {
    const r = commonResult(common('p', 'Pepino'), [prod('x', 'Pepino'), prod('y', 'Pepino bolsa 500 g')], [price('x', 'Mercado', 2, '2026-10-22', { unit: 'kg' }), price('y', 'Mercadona', 0.85, '2026-10-03')])
    expect(r.basis).toBe('kg')
    expect(r.offers.map((o) => [o.store, o.normalized.value])).toEqual([['Mercadona', 1.7], ['Mercado', 2]])
  })
  it('avisa cuando las compras comparadas están muy separadas en el tiempo', () => {
    const r = commonResult(c, members, [price('a', 'Lidl', 4.95, '2026-01-01', { pack: { count: 6, amount: 330, unit: 'ml' } }), price('b', 'Dia', 3, '2026-10-02', { pack: { count: 1, amount: 1, unit: 'l' } })])
    expect(r.spanDays).toBeGreaterThan(120)
    expect(r.note).toMatch(/separadas por \d+ meses/)
  })
  it('el mismo artículo en dos presentaciones en la misma tienda sale dos veces, sin sobrescribir el histórico', () => {
    const r = commonResult(c, members, [
      price('a', 'Lidl', 4.95, '2026-09-01', { pack: { count: 6, amount: 330, unit: 'ml' } }),
      price('a', 'Lidl', 9.4, '2026-10-01', { pack: { count: 12, amount: 330, unit: 'ml' } }),
      price('a', 'Lidl', 5.1, '2026-10-10', { pack: { count: 6, amount: 330, unit: 'ml' } }),
    ])
    expect(r.offers).toHaveLength(2)
    expect(r.offers.find((o) => o.pack?.count === 6)?.totalPrice).toBe(5.1)
  })
})

describe('sugerir el producto común', () => {
  const commons = [common('leche', 'Leche semidesnatada'), common('cerveza', 'Cerveza')]
  const products = [prod('m', 'LECHE SEMI P-6'), prod('b', 'CERVEZA SUAVE'), prod('n', 'Cerveza sin alcohol 0,0')]
  const members: CommonMember[] = [{ productId: 'm', commonId: 'leche', source: 'manual' }, { productId: 'b', commonId: 'cerveza', source: 'manual' }]

  it('por el nombre del producto común', () => {
    const s = suggestCommons(prod('x', 'LECHE SEMIDESNATADA ASTURIANA 1L'), commons, members, products)
    expect(s[0].common.id).toBe('leche')
  })
  it('nunca mezcla variantes: leche entera no se propone en «Leche semidesnatada»; sin alcohol no entra en «Cerveza»', () => {
    expect(suggestCommons(prod('x', 'LECHE ENTERA 1L'), commons, members, products).map((s) => s.common.id)).not.toContain('leche')
    expect(suggestCommons(prod('n', 'Cerveza sin alcohol 0,0'), commons, members, products).map((s) => s.common.id)).not.toContain('cerveza')
  })
  it('un artículo idéntico a otro ya agrupado se puede asignar solo; uno solo comparable, no', () => {
    const idem = suggestCommons(prod('z', 'LECHE SEMI P-6'), commons, members, products)
    expect(idem[0]).toMatchObject({ common: { id: 'leche' }, relation: 'identical', automatic: true })
    const cmp = suggestCommons(prod('y', 'Cerveza Estrella Galicia'), commons, members, [...products, prod('y', 'Cerveza Estrella Galicia')])
    expect(cmp.every((s) => !s.automatic)).toBe(true)
  })
  it('una decisión de la familia («no es lo mismo») descarta la sugerencia', () => {
    const ctx = { decisions: [{ productA: 'x', productB: 'm', relation: 'different' as const }] }
    expect(suggestCommons(prod('x', 'LECHE SEMI P-6 PACK'), commons, members, products, ctx).map((s) => s.automatic)).not.toContain(true)
  })
  it('sin coincidencia no se inventa nada; el nombre propuesto para uno nuevo sale del artículo', () => {
    expect(suggestCommons(prod('q', 'DETERGENTE ROPA 3L'), commons, members, products)).toEqual([])
    expect(suggestCommonName(prod('q', 'DETERGENTE ROPA 3L'))).toBe('Detergente ropa')
  })
})

describe('cola de «Emparejar»', () => {
  const products = [prod('leche1', 'LECHE SEMI P-6'), prod('leche2', 'LECHE ASTURIANA SEMIDESNATADA'), prod('det', 'DETERGENTE ROPA 3L'), prod('bolsa', 'BOLSA PLASTICO'), prod('done', 'PICOS CAMPERO'), prod('skip', 'JAMON COCIDO')]
  const prices: (CmpPrice & { quantity?: number })[] = [
    price('leche1', 'Mercadona', 10.74, '2026-10-13'),
    price('leche1', 'Mercadona', 10.02, '2026-09-13'),
    price('leche1', 'Mercadona', 10.74, '2026-08-13'),
    price('leche2', 'Hiperber', 1.69, '2026-10-26'),
    price('det', 'Mercadona', 9.5, '2026-10-01'),
    ...Array.from({ length: 16 }, (_, i) => price('bolsa', 'Mercadona', 0.15, `2026-09-${String(i + 1).padStart(2, '0')}`)),
    price('done', 'Mercadona', 1, '2026-10-03'),
    price('skip', 'Hiperber', 3.89, '2026-09-18'),
  ]
  const commons = [common('leche', 'Leche semidesnatada')]
  const members: CommonMember[] = [{ productId: 'leche1', commonId: 'leche', source: 'manual' }, { productId: 'done', commonId: 'otro', source: 'manual' }]
  const q = pairingQueue(products, prices, commons, members, new Set(['skip']))

  it('no incluye lo ya agrupado ni lo descartado, y no excluye detergentes ni bolsas', () => {
    const ids = q.map((i) => i.article.id)
    expect(ids).not.toContain('leche1')
    expect(ids).not.toContain('done')
    expect(ids).not.toContain('skip')
    expect(ids).toEqual(expect.arrayContaining(['leche2', 'det', 'bolsa']))
  })
  it('prioriza lo que permite comparar entre tiendas (leche de Hiperber con la de Mercadona agrupada)', () => {
    expect(q[0].article.id).toBe('leche2')
    expect(q[0].crossStore).toBe(true)
  })
  it('el detergente (9,50 €) va por delante de las bolsas (céntimos, aunque muy repetidas)', () => {
    expect(q.findIndex((i) => i.article.id === 'det')).toBeLessThan(q.findIndex((i) => i.article.id === 'bolsa'))
  })
  it('filtra por tienda y por texto', () => {
    expect(pairingQueue(products, prices, commons, members, new Set(), {}, { stores: ['Hiperber'] }).map((i) => i.article.id).sort()).toEqual(['leche2', 'skip'])
    expect(pairingQueue(products, prices, commons, members, new Set(), {}, { query: 'deterg' }).map((i) => i.article.id)).toEqual(['det'])
  })
  it('estadísticas de cada artículo', () => {
    const s = articleStats(prices).get('leche1')!
    expect(s).toMatchObject({ lines: 3, lastDate: '2026-10-13', lastPrice: 10.74, stores: ['Mercadona'] })
  })
  it('al crear un producto común nuevo ofrece artículos parecidos, sin variantes que choquen', () => {
    const sim = similarPending(prod('c1', 'CERVEZA ESTRELLA'), [prod('c2', 'CERVEZA MAHOU'), prod('c3', 'DETERGENTE')])
    expect(sim.map((p) => p.id)).toEqual(['c2'])
  })
})
