import { describe, expect, it } from 'vitest'
import { suggestFromGuestNotes } from '@/domain/eventDietaryNeeds'
import { makeGuest } from '@/domain/eventFoodFixtures'

// Persona de una necesidad (2.ª tanda): una sugerencia solo preselecciona persona si es INEQUÍVOCA.
const members = [
  { id: 'm-jorge', guestId: 'g1', name: 'Jorge' },
  { id: 'm-ana', guestId: 'g1', name: 'Ana' },
]

describe('sugerencias — persona: nunca se adivina entre varias', () => {
  it('invitación con varias personas y nota sin nombre: memberId null y todas las candidatas', () => {
    const [s] = suggestFromGuestNotes([makeGuest({ id: 'g1', displayName: 'Familia Ramón', notes: 'alergia al marisco' })], [], [], members)
    expect(s.memberId).toBeNull()
    expect(s.memberCandidates.map((m) => m.id)).toEqual(['m-jorge', 'm-ana'])
  })

  it('nota que cita un único nombre de la invitación: se preselecciona esa persona (corregible en la UI)', () => {
    const [s] = suggestFromGuestNotes([makeGuest({ id: 'g1', notes: 'Jorge tiene alergia al marisco' })], [], [], members)
    expect(s.memberId).toBe('m-jorge')
  })

  it('nombre citado con tildes o en otra posición se reconoce con límites de palabra (no «Anabel» por «Ana»)', () => {
    const [s] = suggestFromGuestNotes([makeGuest({ id: 'g1', notes: 'Anabel es celíaca' })], [], [], members)
    expect(s.memberId).toBeNull()
  })

  it('dos nombres citados a la vez: ambiguo, no se elige ninguno', () => {
    const [s] = suggestFromGuestNotes([makeGuest({ id: 'g1', notes: 'Jorge y Ana no comen marisco' })], [], [], members)
    expect(s.memberId).toBeNull()
  })

  it('invitación con una sola persona: se preselecciona esa persona', () => {
    const [s] = suggestFromGuestNotes([makeGuest({ id: 'g2', notes: 'alergia al marisco' })], [], [], [{ id: 'm-solo', guestId: 'g2', name: 'Lucía' }])
    expect(s.memberId).toBe('m-solo')
  })

  it('invitación sin personas registradas: memberId null y sin candidatas (nivel invitación)', () => {
    const [s] = suggestFromGuestNotes([makeGuest({ id: 'g3', notes: 'alergia al marisco' })], [], [], [])
    expect(s.memberId).toBeNull()
    expect(s.memberCandidates).toEqual([])
  })

  it('conserva texto original, categoría y tipo; el descarte sigue siendo por invitado+categoría', () => {
    const guests = [makeGuest({ id: 'g1', notes: 'alergia al marisco' })]
    const [s] = suggestFromGuestNotes(guests, [], [], members)
    expect(s).toMatchObject({ text: 'alergia al marisco', category: 'marisco', kind: 'alergia', noteSource: 'nota' })
    expect(suggestFromGuestNotes(guests, [], [{ guestId: 'g1', category: 'marisco' }], members)).toEqual([])
  })
})
