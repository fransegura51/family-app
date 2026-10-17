// «¿Cuánto cuesta la leche?» / «¿a cuánto está el aceite?»: lo último que se pagó por un producto, según los tickets (petición real, 17/10/2026).
import { describe, expect, it } from 'vitest'
import { answerFinanceQuery, type FinanceData } from './financeCompute'
import { parseFinanceQuestion } from './financeQuery'
import type { Product, ProductPrice } from './types'

const TODAY = new Date(2026, 9, 17)

function product(id: string, displayName: string): Product {
  return { id, familyId: 'f', normalizedName: displayName.toLowerCase(), displayName, category: null, brand: null, nonFood: false, classConfirmedAt: null, photoPath: null } as Product
}
let n = 0
function line(productId: string, date: string, price: number, store: string | null, unit: string | null = null): ProductPrice {
  n++
  return { id: `pp${n}`, productId, price, store, quantity: '1', unit, recordedDate: date, receiptId: 'r1' }
}

const DATA: FinanceData = {
  expenses: [],
  categories: [],
  receipts: [],
  products: [product('l1', 'Leche entera'), product('a1', 'Aceite de oliva'), product('m1', 'Manzanas')],
  prices: [
    line('l1', '2026-09-06', 0.9, 'Mercadona'),
    line('l1', '2026-10-04', 1.05, 'Aldi'),
    line('l1', '2026-09-20', 0.95, 'Mercadona'),
    line('a1', '2026-10-02', 8.5, 'Mercadona'),
    line('m1', '2026-10-10', 2.4, 'Mercadona', 'kg'),
  ],
  storeNames: ['Mercadona', 'Aldi'],
  monthStartDay: 1,
  bankStale: false,
}

function ask(text: string, d: FinanceData = DATA): string {
  const p = parseFinanceQuestion(text, TODAY)
  if (!p || p.kind !== 'query') throw new Error(`no es consulta: ${text} -> ${JSON.stringify(p)}`)
  return answerFinanceQuery(p.query, d, TODAY).text
}

describe('precio de un producto', () => {
  it('se reconoce de varias formas', () => {
    for (const frase of ['¿cuánto cuesta la leche?', 'a cuánto está el aceite', 'a qué precio compramos la leche', 'cuánto pagamos por la leche', 'cuál es el precio de la leche', 'cuánto vale la leche']) {
      const p = parseFinanceQuestion(frase, TODAY)
      expect(p, frase).toMatchObject({ kind: 'query', query: { metric: 'last_price' } })
    }
  })

  it('dice lo ÚLTIMO que se pagó, con tienda y fecha, y aclara que no es el precio de hoy', () => {
    const text = ask('¿cuánto cuesta la leche?')
    expect(text).toContain('Leche entera: 1,05 € en Aldi (4 de octubre)')
    expect(text).toContain('no el precio de hoy')
  })

  it('con una tienda dicha al final, solo mira esa tienda', () => {
    expect(ask('cuánto cuesta la leche en Mercadona')).toContain('Leche entera: 0,95 € en Mercadona (20 de septiembre)')
  })

  it('un producto al peso lo dice por kilo', () => {
    expect(ask('a cuánto están las manzanas')).toContain('2,40 €/kg')
  })

  it('un producto que no está en los tickets lo dice con claridad', () => {
    expect(ask('cuánto cuesta el caviar')).toContain('No tengo compras registradas de «caviar»')
  })

  it('no confunde con la comparativa «dónde es más barato», que sigue siendo la de siempre', () => {
    expect(parseFinanceQuestion('dónde es más barata la leche', TODAY)).toMatchObject({ kind: 'query', query: { metric: 'cheapest_store' } })
  })
})
