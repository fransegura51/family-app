import { describe, expect, it } from 'vitest'
import { buildCompactComparisons, equivalentGroup, relationBetween, type CmpPrice, type CmpProduct, type RelationContext } from './priceComparison'

const prod = (id: string, displayName: string): CmpProduct => ({ id, displayName })

// Dos artículos con nombres que el motor NUNCA emparejaría solo (abreviados y de marcas distintas): solo los une el producto común que agrupó la familia.
const a = prod('a', 'CERVEZA SUAVE')
const b = prod('b', 'CERVEZA E.GALICIA')
const ctxWith = (extra: Partial<RelationContext> = {}): RelationContext => ({ commonOf: new Map([['a', 'c1'], ['b', 'c1']]), ...extra })

describe('el producto común entra en el comparador de siempre', () => {
  it('sin agrupar, el motor los deja como distintos', () => {
    expect(relationBetween(a, b).relation).toBe('different')
  })
  it('agrupados en el mismo producto común son comparables (equivalentes), no «idénticos»', () => {
    const link = relationBetween(a, b, ctxWith())
    expect(link).toMatchObject({ relation: 'equivalent', source: 'common', automatic: true })
  })
  it('en grupos distintos no se mezclan', () => {
    expect(relationBetween(a, b, { commonOf: new Map([['a', 'c1'], ['b', 'c2']]) }).relation).toBe('different')
  })
  it('lo que decide la familia entre dos artículos manda sobre el grupo (si dice «distintos», lo son)', () => {
    expect(relationBetween(a, b, ctxWith({ decisions: [{ productA: 'a', productB: 'b', relation: 'different' }] })).relation).toBe('different')
    expect(relationBetween(a, b, ctxWith({ decisions: [{ productA: 'a', productB: 'b', relation: 'same' }] })).relation).toBe('identical')
  })
  it('si el nombre ya los da por idénticos se conserva «idéntico» (misma marca y presentación)', () => {
    const x = prod('a', 'LECHE SEMI P-6')
    const y = prod('b', 'Leche semi P-6')
    expect(relationBetween(x, y, ctxWith()).relation).toBe('identical')
  })
  it('la ficha y el listado los ven juntos: el grupo se compara por precio normalizado entre tiendas', () => {
    const products = [a, b]
    const prices: CmpPrice[] = [
      { productId: 'a', price: 3.12, store: 'Mercadona', unit: 'ud', recordedDate: '2026-10-16', pack: { count: 6, amount: 330, unit: 'ml' } },
      { productId: 'b', price: 3, store: 'Hiperber', unit: 'ud', recordedDate: '2026-10-21', pack: { count: 1, amount: 1, unit: 'l' } },
    ]
    expect(equivalentGroup(a, products, ctxWith(), 'equivalent').members.map((m) => m.product.id).sort()).toEqual(['a', 'b'])
    expect(buildCompactComparisons(products, prices).size).toBe(0) // sin el grupo no hay comparación…
    const cmp = buildCompactComparisons(products, prices, ctxWith())
    expect(cmp.get('a')).toMatchObject({ basis: 'l', last: { store: 'Hiperber' } }) // …con el grupo sí
    expect(cmp.get('a')?.lastIsCheapest).toBe(false)
  })
})
