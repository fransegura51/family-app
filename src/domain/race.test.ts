import { describe, expect, it } from 'vitest'
import { raceCameraRange, raceDistanceStep, raceMilestones } from './race'
import type { Reward } from './types'

function reward(overrides: Partial<Reward> = {}): Reward {
  return {
    id: 'r1',
    familyId: 'f1',
    title: 'Helado',
    pointsCost: 10,
    emoji: '🍦',
    description: null,
    active: true,
    ...overrides,
  }
}

describe('raceMilestones — recompensas reales en la pista, nunca umbrales inventados', () => {
  it('coloca cada recompensa activa con emoji en la posición de su propio coste en puntos', () => {
    const rewards = [reward({ id: 'a', pointsCost: 20, emoji: '🎮', title: 'Videojuego' }), reward({ id: 'b', pointsCost: 10, emoji: '🍦', title: 'Helado' })]
    expect(raceMilestones(rewards)).toEqual([
      { position: 10, emoji: '🍦', title: 'Helado' },
      { position: 20, emoji: '🎮', title: 'Videojuego' },
    ])
  })

  it('una recompensa desactivada no aparece en la pista', () => {
    const rewards = [reward({ active: false })]
    expect(raceMilestones(rewards)).toEqual([])
  })

  it('una recompensa sin emoji configurado no se dibuja (no hay nada que pintar)', () => {
    const rewards = [reward({ emoji: null })]
    expect(raceMilestones(rewards)).toEqual([])
  })

  it('sin recompensas configuradas, la pista no muestra ninguna — nunca un marcador de ejemplo', () => {
    expect(raceMilestones([])).toEqual([])
  })

  it('un coste de 0 puntos no se pinta (no tiene sentido como marca de distancia)', () => {
    expect(raceMilestones([reward({ pointsCost: 0 })])).toEqual([])
  })
})

describe('raceCameraRange — cabe cualquier número de corredores, sea cual sea la diferencia', () => {
  it('sin corredores, usa el tramo mínimo desde 0', () => {
    expect(raceCameraRange([])).toEqual({ min: 0, max: 30 })
  })

  it('con poca diferencia, el tramo nunca baja de minSpan (30 por defecto)', () => {
    const cam = raceCameraRange([5, 0])
    expect(cam.max - cam.min).toBeGreaterThanOrEqual(30)
    expect(cam.min).toBe(0)
  })

  it('con una diferencia grande, el tramo crece para que quepan los dos extremos', () => {
    const cam = raceCameraRange([125, 0])
    expect(cam.min).toBeLessThanOrEqual(0)
    expect(cam.max).toBeGreaterThan(125)
  })

  it('con MÁS de dos corredores, el tramo cubre al que menos y al que más puntos lleva, no solo los dos primeros', () => {
    const cam = raceCameraRange([3, 90, 40])
    expect(cam.max).toBeGreaterThan(90)
    expect(cam.min).toBeLessThanOrEqual(3)
  })

  it('el corredor en cabeza siempre queda dentro del tramo visible, con margen', () => {
    const points = [7, 52, 19]
    const cam = raceCameraRange(points)
    const hi = Math.max(...points)
    expect(cam.max).toBeGreaterThan(hi)
  })
})

describe('raceDistanceStep — marcas de distancia según lo ancho que esté el tramo visible', () => {
  it('tramo amplio (>110) usa marcas cada 25', () => {
    expect(raceDistanceStep({ min: 0, max: 150 })).toBe(25)
  })
  it('tramo medio (>65) usa marcas cada 10', () => {
    expect(raceDistanceStep({ min: 0, max: 80 })).toBe(10)
  })
  it('tramo corto usa marcas cada 5', () => {
    expect(raceDistanceStep({ min: 0, max: 30 })).toBe(5)
  })
})
