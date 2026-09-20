import { describe, expect, it } from 'vitest'
import { cleanShoppingText, extractTrailingStore, prepareCalendarFromText } from './talkParse'
import { splitEntries } from './quickCapture'
import { extractShoppingStore } from './voiceQuery'

const TODAY = new Date(2026, 8, 20) // domingo 20 de septiembre de 2026
const MEMBERS = [
  { id: 'm-eric', name: 'Eric' },
  { id: 'm-jen', name: 'Jennifer' },
  { id: 'm-hugo', name: 'Hugo' },
]

function shoppingEntries(text: string, stores: string[] = ['Mercadona', 'Aldi']) {
  const { store, text: rest } = extractShoppingStore(text, stores)
  return { store, entries: splitEntries(cleanShoppingText(rest)) }
}

describe('compra por voz', () => {
  it('añade leche, huevos y pan a Mercadona', () => {
    expect(shoppingEntries('añade leche, huevos y pan a Mercadona')).toEqual({ store: 'Mercadona', entries: ['leche', 'huevos', 'pan'] })
  })

  it('con la tienda delante', () => {
    expect(shoppingEntries('Mercadona, patatas, huevos')).toEqual({ store: 'Mercadona', entries: ['patatas', 'huevos'] })
  })

  it('sin tienda', () => {
    expect(shoppingEntries('apunta leche y pan en la lista de la compra')).toEqual({ store: null, entries: ['leche', 'pan'] })
    expect(shoppingEntries('necesito comprar detergente')).toEqual({ store: null, entries: ['detergente'] })
    expect(shoppingEntries('tengo que comprar pan')).toEqual({ store: null, entries: ['pan'] })
    expect(shoppingEntries('compra papel higiénico')).toEqual({ store: null, entries: ['papel higiénico'] })
  })

  it('la tienda solo, sin productos', () => {
    expect(shoppingEntries('Mercadona')).toEqual({ store: 'Mercadona', entries: [] })
  })
})

describe('calendario por voz', () => {
  it('el viernes a las cinco dentista de Eric', () => {
    const p = prepareCalendarFromText('el viernes a las cinco dentista de Eric', TODAY, MEMBERS)
    expect(p).toMatchObject({ title: 'Dentista', date: '2026-09-25', time: '17:00', memberId: 'm-eric', recurrenceRule: null })
    expect(p.notes).toHaveLength(1)
  })

  it('dentista de Eric el viernes a las cinco (otro orden)', () => {
    expect(prepareCalendarFromText('dentista de Eric el viernes a las cinco', TODAY, MEMBERS)).toMatchObject({
      title: 'Dentista',
      date: '2026-09-25',
      time: '17:00',
      memberId: 'm-eric',
    })
  })

  it('mañana con hora y acentos', () => {
    expect(prepareCalendarFromText('apunta reunión del cole mañana a las 10:30', TODAY, MEMBERS)).toMatchObject({
      title: 'Reunión del cole',
      date: '2026-09-21',
      time: '10:30',
      memberId: null,
    })
  })

  it('una hora con "de la mañana" no se pasa a la tarde', () => {
    const p = prepareCalendarFromText('dentista mañana a las 9 de la mañana', TODAY, MEMBERS)
    expect(p.time).toBe('09:00')
    expect(p.notes).toEqual([])
  })

  it('"de la tarde" lo resuelve el parser de siempre', () => {
    const p = prepareCalendarFromText('yoga el jueves a las 6 de la tarde', TODAY, MEMBERS)
    expect(p).toMatchObject({ date: '2026-09-24', time: '18:00' })
    expect(p.notes).toEqual([])
  })

  it('una fecha dicha con el mes', () => {
    expect(prepareCalendarFromText('cumpleaños de Hugo el 2 de octubre', TODAY, MEMBERS)).toMatchObject({
      title: 'Cumpleaños',
      date: '2026-10-02',
      time: null,
      memberId: 'm-hugo',
    })
  })

  it('una repetición conserva su día', () => {
    expect(prepareCalendarFromText('todos los martes yoga a las 7 de la tarde', TODAY, MEMBERS)).toMatchObject({
      time: '19:00',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU',
      date: '2026-09-20',
    })
  })

  it('"para X" también reconoce a la persona', () => {
    expect(prepareCalendarFromText('mañana natación para Hugo a las 17:30', TODAY, MEMBERS)).toMatchObject({
      title: 'Natación',
      memberId: 'm-hugo',
      time: '17:30',
      date: '2026-09-21',
    })
  })

  it('sin título se llama Cita', () => {
    expect(prepareCalendarFromText('mañana a las 10:30', TODAY, MEMBERS).title).toBe('Cita')
  })

  it('el aviso "al terminar" sin hora de fin pasa a "al empezar"', () => {
    const p = prepareCalendarFromText('recoger a Hugo mañana a las 17:30 aviso una hora antes de que termine', TODAY, MEMBERS)
    expect(p.reminders).toEqual([{ minutesBefore: 60, anchor: 'start' }])
  })
})

describe('tienda al final sin dar de alta', () => {
  const NAMES = ['Eric', 'Jennifer']

  it('añade leche, huevos y pan a Mercadona', () => {
    const { store, text } = extractTrailingStore('Añade leche, huevos y pan a Mercadona', NAMES)
    expect(store).toBe('Mercadona')
    expect(splitEntries(cleanShoppingText(text))).toEqual(['leche', 'huevos', 'pan'])
  })

  it('tiendas de dos palabras', () => {
    expect(extractTrailingStore('añade pan a Carrefour Express', NAMES)).toEqual({ store: 'Carrefour Express', text: 'añade pan' })
  })

  it('sin mayúscula no es una tienda', () => {
    expect(extractTrailingStore('añade leche a la compra', NAMES).store).toBeNull()
    expect(extractTrailingStore('añade leche y pan', NAMES).store).toBeNull()
  })

  it('el nombre de alguien de la familia no es una tienda', () => {
    expect(extractTrailingStore('añade leche a Eric', NAMES).store).toBeNull()
  })
})
