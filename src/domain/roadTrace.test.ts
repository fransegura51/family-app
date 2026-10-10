import { describe, expect, it } from 'vitest'
import type { TrackPoint } from '@/domain/geo'
import { MAX_ROUTE_WAYPOINTS, chunkVehicleRun, splitIntoParts } from '@/domain/roadTrace'

// ~111 m por cada 0,001° de latitud. Un punto cada `everySec` segundos avanzando `stepDeg` grados al norte.
function drive(count: number, stepDeg: number, everySec: number, startLat = 38, t0 = 0): TrackPoint[] {
  return Array.from({ length: count }, (_, i) => ({ lat: startLat + i * stepDeg, lng: -0.85, at: t0 + i * everySec * 1000 }))
}

describe('trozos «en coche» del recorrido', () => {
  it('un trayecto a velocidad de carretera es «en coche»', () => {
    const parts = splitIntoParts(drive(40, 0.0016, 10)) // ~18 m/s ≈ 64 km/h, ~7 km
    expect(parts).toHaveLength(1)
    expect(parts[0].mode).toBe('vehicle')
  })

  it('andar (1,4 m/s) nunca pide carretera', () => {
    const parts = splitIntoParts(drive(60, 0.00013, 10)) // ~14 m cada 10 s
    expect(parts.every((p) => p.mode === 'raw')).toBe(true)
  })

  it('un trayecto cortito en coche (menos de 800 m) se queda como está: la recta ya es la carretera', () => {
    const parts = splitIntoParts(drive(6, 0.0008, 10)) // ~90 m por paso, 450 m en total
    expect(parts.every((p) => p.mode === 'raw')).toBe(true)
  })

  it('andar y luego coche y luego andar: tres trozos en orden, sin perder ningún punto', () => {
    const walk1 = drive(10, 0.00013, 10, 38, 0)
    const car = drive(30, 0.0016, 10, walk1[walk1.length - 1].lat + 0.0016, walk1[walk1.length - 1].at + 10_000)
    const walk2 = drive(10, 0.00013, 10, car[car.length - 1].lat + 0.00013, car[car.length - 1].at + 10_000)
    const all = [...walk1, ...car, ...walk2]
    const parts = splitIntoParts(all)
    expect(parts.map((p) => p.mode)).toEqual(['raw', 'vehicle', 'raw'])
    // El último punto de un trozo es el primero del siguiente, y entre todos están todos los puntos.
    for (let i = 1; i < parts.length; i++) expect(parts[i].points[0]).toEqual(parts[i - 1].points[parts[i - 1].points.length - 1])
    const total = parts.reduce((n, p, i) => n + p.points.length - (i > 0 ? 1 : 0), 0)
    expect(total).toBe(all.length)
  })

  it('un semáforo (parada corta y cercana) no parte el trayecto en dos', () => {
    const before = drive(20, 0.0016, 10)
    const stop = [{ lat: before[19].lat + 0.00005, lng: -0.85, at: before[19].at + 20_000 }, { lat: before[19].lat + 0.00006, lng: -0.85, at: before[19].at + 40_000 }]
    const after = drive(20, 0.0016, 10, stop[1].lat + 0.0016, stop[1].at + 10_000)
    const parts = splitIntoParts([...before, ...stop, ...after])
    expect(parts.filter((p) => p.mode === 'vehicle')).toHaveLength(1)
  })

  it('menos de dos puntos no es un recorrido', () => {
    expect(splitIntoParts([])).toEqual([])
    expect(splitIntoParts(drive(1, 0.001, 10))).toEqual([])
  })
})

describe('puntos de paso para pedir la carretera', () => {
  it('uno cada ~700 m, empezando y acabando donde empieza y acaba el trayecto', () => {
    const run = drive(40, 0.0016, 10) // ~7 km
    const [chunk] = chunkVehicleRun(run)
    expect(chunk.waypoints[0]).toEqual({ latitude: run[0].lat, longitude: run[0].lng })
    expect(chunk.waypoints[chunk.waypoints.length - 1]).toEqual({ latitude: run[39].lat, longitude: run[39].lng })
    expect(chunk.waypoints.length).toBeGreaterThanOrEqual(8)
    expect(chunk.waypoints.length).toBeLessThanOrEqual(12)
  })

  it('un trayecto muy largo se parte en trozos de como mucho 27 puntos, cada uno empezando donde acabó el anterior', () => {
    const run = drive(300, 0.0016, 10) // ~53 km
    const chunks = chunkVehicleRun(run)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.waypoints.length).toBeLessThanOrEqual(MAX_ROUTE_WAYPOINTS)
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].waypoints[0]).toEqual(chunks[i - 1].waypoints[chunks[i - 1].waypoints.length - 1])
  })

  it('la clave de un trozo no cambia aunque el trayecto siga creciendo por detrás (para no volver a pedir lo ya pedido)', () => {
    const run = drive(300, 0.0016, 10)
    const early = chunkVehicleRun(run.slice(0, 200))
    const later = chunkVehicleRun(run)
    expect(later[0].key).toBe(early[0].key)
  })

  it('un trayecto sin movimiento no da trozos', () => {
    expect(chunkVehicleRun(drive(5, 0, 10))).toEqual([])
  })
})
