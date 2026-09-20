import { describe, expect, it } from 'vitest'
import { routeTalk } from './talkRoute'

const TODAY = new Date(2026, 8, 20) // domingo 20 de septiembre de 2026
const STORES = ['Mercadona', 'Aldi', 'Carnicería']
const route = (text: string) => routeTalk(text, STORES, TODAY)

describe('routeTalk: preguntas', () => {
  it('del calendario', () => {
    expect(route('¿Qué tengo mañana?')).toBe('ask_calendar')
    expect(route('qué tengo hoy')).toBe('ask_calendar')
    expect(route('cuál es mi próxima cita')).toBe('ask_calendar')
    expect(route('lo siguiente que tengo en el calendario')).toBe('ask_calendar')
    expect(route('qué tiene Eric la semana que viene')).toBe('ask_calendar')
    expect(route('tengo algo el viernes')).toBe('ask_calendar')
    expect(route('qué tengo el nueve de octubre')).toBe('ask_calendar')
  })

  it('de la compra', () => {
    expect(route('qué hay en la lista de la compra')).toBe('ask_shopping')
    expect(route('qué tengo que comprar en Mercadona')).toBe('ask_shopping')
    expect(route('qué hay de Aldi')).toBe('ask_shopping')
    expect(route('¿qué falta en la lista?')).toBe('ask_shopping')
  })

  it('una pregunta que no se sabe de qué es queda como desconocida', () => {
    expect(route('cómo se hace la tortilla')).toBe('unknown')
    expect(route('qué opinas')).toBe('unknown')
  })
})

describe('routeTalk: apuntar', () => {
  it('a la compra', () => {
    expect(route('añade leche, huevos y pan a Mercadona')).toBe('add_shopping')
    expect(route('apunta leche en la lista de la compra')).toBe('add_shopping')
    expect(route('Mercadona, patatas, huevos')).toBe('add_shopping')
    expect(route('tengo que comprar pan')).toBe('add_shopping')
    expect(route('necesito comprar leche')).toBe('add_shopping')
    expect(route('compra detergente')).toBe('add_shopping')
    expect(route('apunta que tengo que comprar leche')).toBe('add_shopping')
  })

  it('en el calendario', () => {
    expect(route('dentista de Eric el viernes a las cinco')).toBe('add_calendar')
    expect(route('apunta reunión mañana a las 10:30')).toBe('add_calendar')
    expect(route('el viernes a las cinco dentista de Eric')).toBe('add_calendar')
    expect(route('cumpleaños de Hugo el 2 de octubre')).toBe('add_calendar')
    expect(route('tengo dentista el viernes')).toBe('add_calendar')
    expect(route('pon en el calendario la excursión del cole')).toBe('add_calendar')
  })

  it('la compra gana si hay palabras de compra y de fecha', () => {
    expect(route('añade leche a la compra mañana')).toBe('add_shopping')
  })

  it('sin pistas no se adivina', () => {
    expect(route('leche huevos y pan')).toBe('unknown')
    expect(route('hola pepa')).toBe('unknown')
  })
})

describe('routeTalk: borrar', () => {
  it('borrar sigue sin estar soportado', () => {
    expect(route('borra la cita del nueve de septiembre')).toBe('delete')
    expect(route('elimina el evento del viernes')).toBe('delete')
  })
})
