// El catálogo maestro en el comparador: agrupa lo que es el mismo producto aunque el ticket lo escriba distinto, y NUNCA agrupa lo que el catálogo distingue.
import { describe, expect, it } from 'vitest'
import { planAutoGrouping, type AutoCommon } from '../autoGrouping'
import { compareProducts } from '../productIdentity'
import type { CommonMember } from '../commonProducts'
import type { CmpPrice, CmpProduct } from '../priceComparison'

const prod = (id: string, displayName: string, brand: string | null = null): CmpProduct => ({ id, displayName, brand })
const price = (productId: string, store: string, p = 1, o: Partial<CmpPrice> = {}): CmpPrice => ({ productId, price: p, store, unit: 'ud', recordedDate: '2026-10-01', ...o })
const run = (products: CmpProduct[], prices: CmpPrice[], extra: Partial<Parameters<typeof planAutoGrouping>[0]> = {}) =>
  planAutoGrouping({ products, prices, commons: [], members: [], skippedIds: new Set(), rejectedIds: new Set(), ...extra })
const grouped = (plan: ReturnType<typeof run>) => plan.groups.map((g) => [...g.productIds].sort())

describe('catálogo en el comparador: agrupa lo que es el mismo producto', () => {
  it('el mismo producto escrito de formas distintas en dos tiendas («O.V.E.»)', () => {
    const plan = run([prod('a', 'ACEITE O.V.E. 1L'), prod('b', 'ACEITE OLIVA VIRGEN EXTRA 5L')], [price('a', 'Mercadona'), price('b', 'Hiperber')])
    expect(grouped(plan)).toEqual([['a', 'b']])
  })
  it('leche semidesnatada de distintas marcas y formatos', () => {
    const plan = run(
      [prod('a', 'LECHE SEMI P-6'), prod('b', 'LECHE SEMIDESNATADA PASCUAL 1L'), prod('c', 'LECHE SEMIDESNATADA HACENDADO 1,5 L')],
      [price('a', 'Mercadona'), price('b', 'Consum'), price('c', 'Mercadona')],
    )
    expect(grouped(plan)).toEqual([['a', 'b', 'c']])
  })
  it('patata fresca de 3 y de 5 kg', () => {
    const plan = run([prod('a', 'PATATA 3 KG'), prod('b', 'PATATA 5 KG')], [price('a', 'Mercadona'), price('b', 'Mercadona')])
    expect(grouped(plan)).toEqual([['a', 'b']])
  })
  it('pañales de la misma talla en dos tiendas', () => {
    const plan = run([prod('a', 'PAÑALES T4 48 UDS'), prod('b', 'PAÑALES TALLA 4 DODOT')], [price('a', 'Mercadona'), price('b', 'Carrefour')])
    expect(grouped(plan)).toEqual([['a', 'b']])
  })
  it('leche infantil de la misma etapa', () => {
    const plan = run([prod('a', 'LECHE INFANTIL 2'), prod('b', 'LECHE CONTINUACION 2 ALMIRON')], [price('a', 'Mercadona'), price('b', 'Carrefour')])
    expect(grouped(plan).length).toBeLessThanOrEqual(1)
  })
  it('el grupo se llama como el producto normalizado cuando no hay variantes sueltas', () => {
    const plan = run([prod('a', 'PAÑALES T4'), prod('b', 'PAÑALES TALLA 4 DODOT')], [price('a', 'Mercadona'), price('b', 'Carrefour')])
    expect(plan.groups[0]?.name).toBe('Pañales talla 4')
  })
})

describe('catálogo en el comparador: lo que NUNCA agrupa', () => {
  const never = (a: string, b: string) => {
    const plan = run([prod('a', a), prod('b', b)], [price('a', 'Mercadona'), price('b', 'Hiperber')])
    expect(plan.groups, `${a} / ${b}`).toEqual([])
    expect(['different', 'possible'], `${a} / ${b}`).toContain(compareProducts({ name: a }, { name: b }).relation)
  }
  it('pañales de tallas distintas', () => never('PAÑALES T3', 'PAÑALES T4'))
  it('pañal y pañal-braguita', () => never('PAÑALES T4', 'BRAGUITAS T4'))
  it('leche infantil de etapas distintas', () => never('LECHE INFANTIL 1', 'LECHE INFANTIL 2'))
  it('leche entera y semidesnatada', () => never('LECHE ENTERA 1L', 'LECHE SEMIDESNATADA 1L'))
  it('leche con y sin lactosa', () => never('LECHE SEMIDESNATADA 1L', 'LECHE SEMIDESNATADA SIN LACTOSA 1L'))
  it('patata fresca y patatas fritas', () => never('PATATAS 3 KG', 'PATATAS FRITAS 150 G'))
  it('una quesadilla de pollo y pechuga de pollo', () => never('QUESADILLA POLLO', 'PECHUGA POLLO'))
  it('bebidas distintas que comparten «zero»', () => never('COCA COLA ZERO 2L', 'FANTA NARANJA ZERO 2L'))
  it('refresco normal y refresco zero', () => never('REFRESCO COLA 2L', 'REFRESCO COLA ZERO 2L'))
  it('arroz bomba y arroz largo', () => never('ARROZ BOMBA 1KG', 'ARROZ LARGO 1KG'))
  it('cerveza con y sin alcohol', () => never('CERVEZA 33CL', 'CERVEZA SIN ALCOHOL 33CL'))
  it('atún en lata y atún fresco', () => never('ATUN CLARO', 'ATUN FRESCO FILETE'))
  it('cruda y cocida: gambas', () => never('GAMBAS COCIDAS', 'GAMBAS CRUDAS'))
  it('una palabra genérica sola no agrupa', () => never('LECHE', 'LECHE'))
  it('pizza y lasaña preparada', () => never('PIZZA JAMON', 'LASAÑA JAMON'))
  it('detergente líquido y en cápsulas', () => never('DETERGENTE LIQUIDO 3L', 'DETERGENTE CAPSULAS 40'))
})

describe('catálogo en el comparador: lo ya confirmado no se toca y todo es idempotente', () => {
  it('un grupo confirmado por la familia no recibe artículos solo: se ofrecen aparte', () => {
    const products = [prod('a', 'LECHE SEMI P-6'), prod('b', 'LECHE SEMIDESNATADA PASCUAL 1L')]
    const commons: AutoCommon[] = [{ id: 'c1', name: 'Leche semidesnatada', normalizedName: 'leche semidesnatada', status: 'confirmed' }]
    const members: CommonMember[] = [{ productId: 'a', commonId: 'c1', source: 'manual' }]
    const plan = run(products, [price('a', 'Mercadona'), price('b', 'Consum')], { commons, members })
    expect(plan.groups).toEqual([])
    expect(plan.forConfirmed).toEqual([{ commonId: 'c1', commonName: 'Leche semidesnatada', productIds: ['b'] }])
  })
  it('una decisión «distinto» de la familia siempre separa', () => {
    const products = [prod('a', 'PATATA 3 KG'), prod('b', 'PATATA 5 KG')]
    const plan = run(products, [price('a', 'Mercadona'), price('b', 'Mercadona')], { ctx: { decisions: [{ productA: 'a', productB: 'b', relation: 'different' }] } })
    expect(plan.groups).toEqual([])
  })
  it('es idempotente: aplicar el plan y volver a calcular no propone nada nuevo', () => {
    const products = [prod('a', 'PATATA 3 KG'), prod('b', 'PATATA 5 KG')]
    const prices = [price('a', 'Mercadona'), price('b', 'Mercadona')]
    const first = run(products, prices)
    expect(first.groups).toHaveLength(1)
    const commons: AutoCommon[] = [{ id: 'g', name: first.groups[0].name, normalizedName: first.groups[0].name.toLowerCase(), status: 'pending' }]
    const members: CommonMember[] = first.groups[0].productIds.map((id) => ({ productId: id, commonId: 'g', source: 'pepa' }))
    const second = run(products, prices, { commons, members })
    expect(second.groups).toEqual([])
    expect(second.forConfirmed).toEqual([])
  })
})
