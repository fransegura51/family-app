import { describe, expect, it } from 'vitest'
import { extractChain, mentionsChain } from '@/domain/supermarketChains'
import { routeTalk } from '@/domain/talkRoute'

const TODAY = new Date(2026, 8, 20) // domingo 20 de septiembre de 2026

describe('cadenas de supermercados conocidas', () => {
  it('reconoce las habituales como palabra entera, con o sin mayúsculas y con acentos', () => {
    for (const name of ['Mercadona', 'mercadona', 'LIDL', 'Aldi', 'Carrefour', 'Alcampo', 'Eroski', 'Consum', 'Ahorramás', 'ahorramas', 'El Corte Inglés', 'el corte ingles']) {
      expect(mentionsChain(`pan ${name}`), name).toBe(true)
    }
  })

  it('no confunde palabras corrientes que empiezan igual', () => {
    expect(mentionsChain('el consumo de luz')).toBe(false)
    expect(mentionsChain('apunta el día de la compra')).toBe(false) // «Día» no está en la lista a propósito
    expect(mentionsChain('simplemente pan')).toBe(false)
  })

  it('saca la cadena de la frase y deja los productos', () => {
    expect(extractChain('Mercadona patata')).toEqual({ store: 'Mercadona', text: 'patata' })
    expect(extractChain('patatas Mercadona')).toEqual({ store: 'Mercadona', text: 'patatas' })
    expect(extractChain('añade a Mercadona leche y pan')).toEqual({ store: 'Mercadona', text: 'añade leche y pan' })
    expect(extractChain('leche, huevos en Lidl')).toEqual({ store: 'Lidl', text: 'leche, huevos' })
    expect(extractChain('pan')).toBeNull()
  })
})

describe('«Mercadona patata» sin la tienda dada de alta (bug real: Pepa leía la lista en vez de apuntar)', () => {
  it('es apuntar a la compra, en cualquier orden', () => {
    expect(routeTalk('Mercadona patata', [], TODAY)).toBe('add_shopping')
    expect(routeTalk('Mercadona patatas', [], TODAY)).toBe('add_shopping')
    expect(routeTalk('patatas Mercadona', [], TODAY)).toBe('add_shopping')
    expect(routeTalk('Mercadona Pam', ['Aldi'], TODAY)).toBe('add_shopping')
  })

  it('una pregunta o un aviso con fecha NO se confunden: la fecha y la pregunta mandan', () => {
    expect(routeTalk('qué hay en Mercadona', [], TODAY)).not.toBe('add_shopping')
    expect(routeTalk('recoger el pedido en Mercadona mañana a las cinco', [], TODAY)).toBe('add_calendar')
  })

  it('lo que ya funcionaba sigue igual', () => {
    expect(routeTalk('Mercadona patata', ['Mercadona'], TODAY)).toBe('add_shopping')
    expect(routeTalk('añade leche y pan', [], TODAY)).toBe('add_shopping')
    expect(routeTalk('cómo se hace la tortilla', [], TODAY)).toBe('unknown')
    expect(routeTalk('qué tengo mañana', [], TODAY)).toBe('ask_calendar')
  })
})
