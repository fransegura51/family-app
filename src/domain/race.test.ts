import { describe, expect, it } from 'vitest'
import { raceCameraRange, raceDistanceStep } from './race'

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
