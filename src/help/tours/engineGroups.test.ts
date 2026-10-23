// B4-UX02/03: señal «confirmed» (selección terminada), grupos de pasos opcionales («Saltar opciones») y «Atrás» que no vuelve a pasos omitidos. Código puro.
import { describe, expect, it } from 'vitest'
import { groupHasMore, previousIndex, reduceTour, signalMatches, startState } from '@/help/tours/engine'
import type { TourDef, TourState } from '@/help/tours/types'

const tour: TourDef = {
  id: 'g',
  version: 1,
  title: 'G',
  cardId: 'c',
  durationSec: 10,
  startPath: '/x',
  steps: [
    { id: 'fecha', text: 'fecha', target: 'a.date', completeOn: [{ type: 'confirmed', target: 'a.date' }], manualNext: true },
    { id: 'o1', text: 'o1', target: 'a.o1', completeOn: [], manualNext: true, optional: true, group: 'g1' },
    { id: 'o2', text: 'o2', target: 'a.o2', completeOn: [], manualNext: true, optional: true, group: 'g1' },
    { id: 'o3', text: 'o3', target: 'a.o3', completeOn: [], manualNext: true, optional: true, group: 'g1' },
    { id: 'quien', text: 'quien', target: 'a.who', completeOn: [], manualNext: true },
    { id: 'o4', text: 'o4', target: 'a.o4', completeOn: [], manualNext: true, optional: true, group: 'g2' },
    { id: 'guardar', text: 'guarda', target: 'a.save', completeOn: [{ type: 'event', name: 'a.saved' }], sensitive: true },
  ],
  finishText: 'fin',
}
const run = (actions: Parameters<typeof reduceTour>[2][], from: TourState = startState(tour)) => actions.reduce((s, a) => reduceTour(tour, s, a), from)

describe('señal «confirmed»', () => {
  it('solo coincide con el mismo control y no se confunde con un simple cambio', () => {
    expect(signalMatches({ type: 'confirmed', target: 'a' }, { type: 'confirmed', target: 'a' })).toBe(true)
    expect(signalMatches({ type: 'confirmed', target: 'a' }, { type: 'confirmed', target: 'b' })).toBe(false)
    expect(signalMatches({ type: 'confirmed', target: 'a' }, { type: 'change', target: 'a' })).toBe(false)
    expect(signalMatches({ type: 'change', target: 'a' }, { type: 'confirmed', target: 'a' })).toBe(false)
  })

  it('un cambio sin confirmar NO avanza; la confirmación sí; «Siguiente» sigue valiendo en ese paso', () => {
    expect(run([{ type: 'signal', signal: { type: 'change', target: 'a.date' } }]).index).toBe(0)
    expect(run([{ type: 'signal', signal: { type: 'confirmed', target: 'a.date' } }]).index).toBe(1)
    expect(run([{ type: 'next' }]).index).toBe(1)
  })
})

describe('grupos de pasos opcionales', () => {
  it('«Saltar opciones» salta lo que queda del grupo y deja en el siguiente paso fuera de él, sin saltar «¿Para quién?»', () => {
    const s = run([{ type: 'next' }, { type: 'skip-group' }]) // estaba en o1
    expect(tour.steps[s.index].id).toBe('quien')
    expect(s.skipped).toEqual([1, 2, 3])
  })

  it('desde mitad del grupo salta solo lo que queda', () => {
    const s = run([{ type: 'next' }, { type: 'next' }, { type: 'skip-group' }]) // en o2
    expect(tour.steps[s.index].id).toBe('quien')
    expect(s.skipped).toEqual([2, 3])
  })

  it('fuera de un grupo no hace nada (ni salta pasos normales ni el de guardar)', () => {
    expect(run([{ type: 'skip-group' }]).index).toBe(0)
    const atSave = { ...startState(tour), index: 6 }
    expect(reduceTour(tour, atSave, { type: 'skip-group' })).toBe(atSave)
  })

  it('groupHasMore: solo hay «Saltar opciones» mientras quede algo del grupo', () => {
    expect(groupHasMore(tour, { ...startState(tour), index: 1 })).toBe(true)
    expect(groupHasMore(tour, { ...startState(tour), index: 3 })).toBe(false) // último del grupo
    expect(groupHasMore(tour, { ...startState(tour), index: 4 })).toBe(false) // «quien» no es de un grupo
    expect(groupHasMore(tour, { ...startState(tour), index: 0 })).toBe(false)
  })

  it('un grupo que acaba el tutorial lo completa; nunca se salta un paso sensible', () => {
    const t2: TourDef = { ...tour, steps: [{ id: 'a', text: 'a', completeOn: [], manualNext: true, group: 'x' }, { id: 'b', text: 'b', completeOn: [], manualNext: true, group: 'x' }] }
    expect(reduceTour(t2, startState(t2), { type: 'skip-group' }).status).toBe('completed')
    const t3: TourDef = { ...tour, steps: [{ id: 'a', text: 'a', completeOn: [], manualNext: true, group: 'x' }, { id: 's', text: 's', completeOn: [{ type: 'event', name: 'e' }], sensitive: true, group: 'x' }] }
    const s = reduceTour(t3, startState(t3), { type: 'skip-group' })
    expect(t3.steps[s.index].id).toBe('s')
  })
})

describe('«Atrás» con pasos omitidos', () => {
  it('no vuelve a un paso omitido: salta al anterior que sí se vio', () => {
    const afterSkip = run([{ type: 'next' }, { type: 'skip-group' }]) // en 'quien', omitidos 1-3
    expect(previousIndex(afterSkip)).toBe(0)
    expect(reduceTour(tour, afterSkip, { type: 'back' }).index).toBe(0)
  })

  it('en el primer paso (o si todo lo anterior se omitió) no hay «Atrás»', () => {
    expect(previousIndex(startState(tour))).toBeNull()
    expect(previousIndex({ ...startState(tour), index: 1, skipped: [0] })).toBeNull()
  })

  it('sin omisiones vuelve al paso inmediatamente anterior, como siempre', () => {
    expect(reduceTour(tour, { ...startState(tour), index: 2 }, { type: 'back' }).index).toBe(1)
  })
})
