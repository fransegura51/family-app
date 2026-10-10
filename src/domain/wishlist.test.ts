import { describe, expect, it } from 'vitest'
import { isOwnWishlist, wishlistItemStatus, wishlistTitle } from '@/domain/wishlist'
import type { WishlistItemReservation } from '@/domain/types'

function makeReservation(overrides: Partial<WishlistItemReservation> = {}): WishlistItemReservation {
  return {
    id: 'r1',
    itemId: 'i1',
    familyId: 'f1',
    reservedByMemberId: 'm1',
    reservedByGuestName: null,
    allowJoint: false,
    createdAt: '2026-01-01T00:00:00Z',
    undoneAt: null,
    ...overrides,
  }
}

describe('Lista de deseos — estado de un regalo (disponible/reservado/conjunto)', () => {
  it('sin reservas activas: disponible', () => {
    expect(wishlistItemStatus(false, [])).toEqual({ kind: 'disponible' })
  })

  it('no conjunto con una reserva activa: reservado', () => {
    expect(wishlistItemStatus(false, [makeReservation()])).toEqual({ kind: 'reservado' })
  })

  it('conjunto con varias reservas activas: cuenta cuántas', () => {
    const reservations = [makeReservation({ id: 'r1' }), makeReservation({ id: 'r2', reservedByMemberId: 'm2' })]
    expect(wishlistItemStatus(true, reservations)).toEqual({ kind: 'conjunto', count: 2 })
  })

  it('una reserva deshecha (undoneAt puesto) nunca cuenta como activa', () => {
    const reservations = [makeReservation({ undoneAt: '2026-02-01T00:00:00Z' })]
    expect(wishlistItemStatus(false, reservations)).toEqual({ kind: 'disponible' })
  })

  it('deshacer una de dos reservas conjuntas deja la otra como "conjunto" con cuenta 1, nunca "reservado"', () => {
    const reservations = [makeReservation({ id: 'r1', undoneAt: '2026-02-01T00:00:00Z' }), makeReservation({ id: 'r2', reservedByMemberId: 'm2' })]
    expect(wishlistItemStatus(true, reservations)).toEqual({ kind: 'conjunto', count: 1 })
  })

  it('para quien no debe ver las reservas (RLS ya le filtra a 0 filas), el regalo se ve "disponible" aunque esté reservado de verdad — nunca un error', () => {
    // Esta función no distingue "sin reservas reales" de "sin permiso para verlas": RLS decide eso antes,
    // entregando aquí siempre un array vacío en ese caso. Es justo el comportamiento esperado.
    expect(wishlistItemStatus(false, [])).toEqual({ kind: 'disponible' })
  })
})

describe('Lista de deseos — es mi propia lista', () => {
  it('el destinatario viendo su propia lista: true', () => {
    expect(isOwnWishlist('m1', 'm1')).toBe(true)
  })
  it('otro miembro de la familia: false', () => {
    expect(isOwnWishlist('m1', 'm2')).toBe(false)
  })
  it('sin identidad (invitado sin cuenta): false, nunca se asume que es el destinatario', () => {
    expect(isOwnWishlist('m1', null)).toBe(false)
  })
})

describe('Lista de deseos — título', () => {
  it('combina celebración y año', () => {
    expect(wishlistTitle('Cumpleaños', 2026)).toBe('Cumpleaños 2026')
  })
})
