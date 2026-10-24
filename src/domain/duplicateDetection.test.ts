import { describe, expect, it } from 'vitest'
import { findDuplicateSuggestions, findExistingEconomyExpense, storesCompatible, type DupExpense } from './duplicateDetection'

let n = 0
const E = (o: Partial<DupExpense>): DupExpense => ({ id: `e${++n}`, expenseDate: '2026-10-20', amount: 8, store: 'Panadería', source: 'manual', isIncome: false, hasPurchase: false, ...o })

describe('comercio', () => {
  it('iguales, uno dentro del otro o misma primera palabra; si falta uno no contradice', () => {
    expect(storesCompatible('Ferretería Pepe', 'FERRETERIA PEPE-ALMORADI')).toEqual({ compatible: true, known: true })
    expect(storesCompatible('Mercadona', 'Lidl')).toEqual({ compatible: false, known: true })
    expect(storesCompatible(null, 'Lidl')).toEqual({ compatible: true, known: false })
  })
})

describe('compra ↔ banco: se ofrece vincular, no es un duplicado', () => {
  it('una compra con tarjeta y su cargo bancario del mismo importe → link_bank', () => {
    const own = E({ paymentMethod: 'tarjeta' })
    const bank = E({ source: 'banco', store: 'PANADERIA SOL', expenseDate: '2026-10-21' })
    const [s] = findDuplicateSuggestions([own, bank])
    expect(s).toMatchObject({ kind: 'link_bank' })
    expect(s.a.id).toBe(own.id)
    expect(s.b.id).toBe(bank.id)
    expect(s.reasons).toContain('mismo importe')
  })
  it('EFECTIVO nunca se empareja con el banco, aunque coincidan importe y fecha', () => {
    expect(findDuplicateSuggestions([E({ paymentMethod: 'efectivo' }), E({ source: 'banco' })])).toEqual([])
    expect(findDuplicateSuggestions([E({ paymentMethod: 'mixto' }), E({ source: 'banco' })])).toEqual([])
  })
  it('un cargo bancario que ya es una retirada de cartera o tiene su propia compra no se ofrece para retirar', () => {
    expect(findDuplicateSuggestions([E({}), E({ source: 'banco', hasCashLink: true })])).toEqual([])
    expect(findDuplicateSuggestions([E({}), E({ source: 'banco', hasPurchase: true })])).toEqual([])
  })
  it('otro comercio, otro importe o más de 7 días → no', () => {
    expect(findDuplicateSuggestions([E({}), E({ source: 'banco', store: 'MERCADONA' })])).toEqual([])
    expect(findDuplicateSuggestions([E({}), E({ source: 'banco', amount: 8.5 })])).toEqual([])
    expect(findDuplicateSuggestions([E({}), E({ source: 'banco', expenseDate: '2026-11-05' })])).toEqual([])
  })
  it('dos cargos iguales del banco el mismo día NO se marcan (pueden ser dos compras)', () => {
    expect(findDuplicateSuggestions([E({ source: 'banco' }), E({ source: 'banco' })])).toEqual([])
  })
})

describe('duplicados reales: la misma compra apuntada dos veces', () => {
  it('gasto manual en Economía + compra manual en Compras (mismo importe, día y comercio) → duplicate; se conserva la que tiene compra', () => {
    const eco = E({})
    const compra = E({ hasPurchase: true })
    const [s] = findDuplicateSuggestions([eco, compra])
    expect(s.kind).toBe('duplicate')
    expect(s.a.id).toBe(compra.id)
    expect(s.b.id).toBe(eco.id)
  })
  it('si el que sobraría tiene compra o cartera enlazada, no se ofrece quitarlo', () => {
    expect(findDuplicateSuggestions([E({ hasPurchase: true }), E({ hasPurchase: true })])).toEqual([])
    expect(findDuplicateSuggestions([E({ hasPurchase: true }), E({ hasCashLink: true })])).toEqual([])
  })
  it('formas de pago distintas (efectivo y tarjeta) son pagos distintos', () => {
    expect(findDuplicateSuggestions([E({ paymentMethod: 'efectivo' }), E({ paymentMethod: 'tarjeta' })])).toEqual([])
  })
  it('sin comercio en ninguno y un día de diferencia no se sugiere; el mismo día sí', () => {
    expect(findDuplicateSuggestions([E({ store: null }), E({ store: null, expenseDate: '2026-10-21' })])).toEqual([])
    expect(findDuplicateSuggestions([E({ store: null }), E({ store: null })])).toHaveLength(1)
  })
  it('comercios distintos o más de 2 días → no', () => {
    expect(findDuplicateSuggestions([E({}), E({ store: 'Lidl' })])).toEqual([])
    expect(findDuplicateSuggestions([E({}), E({ expenseDate: '2026-10-25' })])).toEqual([])
  })
  it('un par que la familia ya descartó no vuelve a salir', () => {
    const a = E({})
    const b = E({ hasPurchase: true })
    expect(findDuplicateSuggestions([a, b], [[b.id, a.id]])).toEqual([])
  })
  it('ingresos y devoluciones no entran', () => {
    expect(findDuplicateSuggestions([E({ isIncome: true }), E({ isIncome: true })])).toEqual([])
  })
  it('nunca devuelve el mismo par dos veces', () => {
    expect(findDuplicateSuggestions([E({}), E({ hasPurchase: true }), E({ source: 'banco' })]).length).toBeLessThanOrEqual(3)
  })
})

describe('al guardar una compra manual: ¿ya está en Economía?', () => {
  const purchase = { amount: 8, date: '2026-10-21', store: 'Panadería', paymentMethod: 'efectivo' }
  it('un gasto manual sin compra, mismo importe, ±3 días y comercio compatible → se ofrece vincular', () => {
    const eco = E({ expenseDate: '2026-10-20' })
    expect(findExistingEconomyExpense(purchase, [eco]).map((e) => e.id)).toEqual([eco.id])
  })
  it('un gasto del banco, uno que ya tiene compra, otro importe, otro comercio o forma de pago distinta → no', () => {
    expect(findExistingEconomyExpense(purchase, [E({ source: 'banco' })])).toEqual([])
    expect(findExistingEconomyExpense(purchase, [E({ hasPurchase: true })])).toEqual([])
    expect(findExistingEconomyExpense(purchase, [E({ amount: 9 })])).toEqual([])
    expect(findExistingEconomyExpense(purchase, [E({ store: 'Lidl' })])).toEqual([])
    expect(findExistingEconomyExpense(purchase, [E({ paymentMethod: 'tarjeta' })])).toEqual([])
    expect(findExistingEconomyExpense(purchase, [E({ expenseDate: '2026-10-10' })])).toEqual([])
  })
  it('varios candidatos: el de fecha más cercana primero', () => {
    const lejos = E({ expenseDate: '2026-10-18' })
    const cerca = E({ expenseDate: '2026-10-21' })
    expect(findExistingEconomyExpense(purchase, [lejos, cerca]).map((e) => e.id)).toEqual([cerca.id, lejos.id])
  })
})
