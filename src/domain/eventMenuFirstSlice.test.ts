import { describe, expect, it } from 'vitest'
import { suggestFromGuestNotes } from '@/domain/eventDietaryNeeds'
import { recipeLinkPath } from '@/domain/eventMenuHub'
import { makeGuest, makeNeed } from '@/domain/eventFoodFixtures'

// «Menú del evento», primera tanda: sugerencias de notas que se pueden DESCARTAR (persistido) y la navegación
// a la receta concreta con vuelta al evento. Las necesidades confirmadas nunca se tocan desde aquí.
describe('sugerencias de notas — descartar persiste y no vuelve a salir', () => {
  it('una sugerencia descartada (invitado + categoría) no vuelve a aparecer', () => {
    const guests = [makeGuest({ id: 'g1', displayName: 'Jorge', notes: 'Alergia al marisco' })]
    expect(suggestFromGuestNotes(guests, [])).toHaveLength(1)
    expect(suggestFromGuestNotes(guests, [], [{ guestId: 'g1', category: 'marisco' }])).toEqual([])
  })

  it('descartar una categoría no descarta otra del mismo invitado', () => {
    const guests = [makeGuest({ id: 'g1', notes: 'Alergia al marisco y sin lactosa' })]
    const left = suggestFromGuestNotes(guests, [], [{ guestId: 'g1', category: 'marisco' }])
    expect(left.map((s) => s.category)).toEqual(['lactosa'])
  })

  it('descartar a un invitado no oculta la misma categoría de OTRO invitado', () => {
    const guests = [makeGuest({ id: 'g1', notes: 'alergia al marisco' }), makeGuest({ id: 'g2', notes: 'alergia al marisco' })]
    const left = suggestFromGuestNotes(guests, [], [{ guestId: 'g1', category: 'marisco' }])
    expect(left.map((s) => s.guestId)).toEqual(['g2'])
  })

  it('una sugerencia ya confirmada como necesidad tampoco aparece como pendiente', () => {
    const guests = [makeGuest({ id: 'g1', notes: 'alergia al marisco' })]
    expect(suggestFromGuestNotes(guests, [makeNeed({ guestId: 'g1', category: 'marisco' })], [])).toEqual([])
  })

  it('sin descartes (llamada antigua de dos argumentos) el comportamiento es el mismo de siempre', () => {
    const guests = [makeGuest({ id: 'g1', notes: 'alergia al marisco' })]
    expect(suggestFromGuestNotes(guests, [])).toEqual(suggestFromGuestNotes(guests, [], []))
  })
})

describe('recipeLinkPath — abre ESA receta y conserva el evento de origen', () => {
  it('apunta a Alimentación › Recetas con el id de la receta y el id del evento', () => {
    expect(recipeLinkPath('rec-1', 'ev-9')).toBe('/alimentacion?tab=Recetas&receta=rec-1&volver=ev-9')
  })

  it('escapa los ids para que no rompan la URL', () => {
    expect(recipeLinkPath('a b', 'c&d')).toBe('/alimentacion?tab=Recetas&receta=a%20b&volver=c%26d')
  })
})
