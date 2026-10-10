// Trazado por carretera del recorrido: se pide una vez por trozo, se recuerda en el móvil y nunca deja el mapa sin línea.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const maps = vi.hoisted(() => ({ call: vi.fn() }))
const guard = vi.hoisted(() => ({ allow: vi.fn() }))
vi.mock('@/services/googleMapsProxy', () => ({ callGoogleMaps: maps.call }))
vi.mock('@/services/googleMapsUsageGuard', () => ({ allowGoogleMapsUse: guard.allow }))

import locationMapSrc from '@/ui/LocationMap.tsx?raw'
import mapsFunctionSrc from '../../supabase/functions/google-maps/index.ts?raw'
import guardSrc from '@/services/googleMapsUsageGuard.ts?raw'
import type { RoadChunk } from '@/domain/roadTrace'

// Polyline de Google real de dos puntos: (38.5, -120.2) → (40.7, -120.95) → (43.252, -126.453)
const ENCODED = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'

function chunk(key: string): RoadChunk {
  return { key, waypoints: [{ latitude: 38, longitude: -0.85 }, { latitude: 38.01, longitude: -0.85 }] }
}

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

async function fresh() {
  vi.resetModules()
  return import('@/services/roadTrace')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', fakeStorage())
  guard.allow.mockReturnValue(true)
  maps.call.mockResolvedValue({ polyline: ENCODED })
})

describe('trazado por carretera de un trozo del recorrido', () => {
  it('lo pide al servidor una sola vez y lo devuelve decodificado', async () => {
    const { requestRoad, getCachedRoad } = await fresh()
    expect(getCachedRoad('k1')).toBeUndefined() // todavía no se sabe
    const path = await requestRoad(chunk('k1'))
    expect(path).toHaveLength(3)
    expect(path?.[0]).toEqual({ lat: 38.5, lng: -120.2 })
    expect(maps.call).toHaveBeenCalledWith({ action: 'trace', points: chunk('k1').waypoints })
    expect(getCachedRoad('k1')).toHaveLength(3)
  })

  it('un trozo ya conocido no vuelve a gastar ni una llamada, ni siquiera abriendo el mapa otra vez (se recuerda en el móvil)', async () => {
    const first = await fresh()
    await first.requestRoad(chunk('k2'))
    expect(maps.call).toHaveBeenCalledTimes(1)
    await first.requestRoad(chunk('k2'))
    expect(maps.call).toHaveBeenCalledTimes(1)

    const reopened = await fresh() // otra sesión: la memoria se pierde, el localStorage no
    expect(reopened.getCachedRoad('k2')).toHaveLength(3)
    await reopened.requestRoad(chunk('k2'))
    expect(maps.call).toHaveBeenCalledTimes(1)
  })

  it('dos peticiones a la vez del mismo trozo comparten una sola llamada', async () => {
    const { requestRoad } = await fresh()
    await Promise.all([requestRoad(chunk('k3')), requestRoad(chunk('k3'))])
    expect(maps.call).toHaveBeenCalledTimes(1)
  })

  it('si Google no encuentra una carretera razonable, se recuerda y no se vuelve a preguntar (queda la línea recta)', async () => {
    maps.call.mockResolvedValue({ polyline: null, reason: 'detour' })
    const { requestRoad, getCachedRoad } = await fresh()
    expect(await requestRoad(chunk('k4'))).toBeNull()
    expect(getCachedRoad('k4')).toBeNull()
    await requestRoad(chunk('k4'))
    expect(maps.call).toHaveBeenCalledTimes(1)
  })

  it('un fallo de red no se recuerda como «sin carretera»: se reintenta pasado un rato, no en bucle', async () => {
    vi.useFakeTimers()
    maps.call.mockRejectedValueOnce(new Error('sin red')).mockResolvedValue({ polyline: ENCODED })
    const { requestRoad, getCachedRoad } = await fresh()
    expect(await requestRoad(chunk('k5'))).toBeNull()
    expect(getCachedRoad('k5')).toBeUndefined()
    expect(await requestRoad(chunk('k5'))).toBeNull() // dentro del minuto de espera: no llama
    expect(maps.call).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(61_000)
    expect(await requestRoad(chunk('k5'))).toHaveLength(3)
    expect(maps.call).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('con el freno diario alcanzado no llama a Google y no recuerda nada (mañana se podrá)', async () => {
    guard.allow.mockReturnValue(false)
    const { requestRoad, getCachedRoad } = await fresh()
    expect(await requestRoad(chunk('k6'))).toBeNull()
    expect(maps.call).not.toHaveBeenCalled()
    expect(getCachedRoad('k6')).toBeUndefined()
  })

  it('pega los trazados de trozos seguidos sin repetir el punto de unión', async () => {
    const { joinRoadPaths } = await fresh()
    const a = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]
    const b = [{ lat: 2, lng: 2 }, { lat: 3, lng: 3 }]
    expect(joinRoadPaths([a, b])).toEqual([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }])
  })
})

describe('conexión con el mapa y el servidor', () => {
  it('el mapa dibuja los trozos en coche por la carretera y vuelve a pintar cuando llega el trazado', () => {
    expect(locationMapSrc).toContain('roadAwarePath(')
    expect(locationMapSrc).toContain("routeColorFor(member.color, member.id)")
    expect(locationMapSrc).toContain("strokeColor: '#ffffff', strokeWeight: 8")
    expect(locationMapSrc).toContain('setRoadTick((t) => t + 1)')
    expect(locationMapSrc).toContain('[members, locations, histories, photoUrls, roadTick]')
  })

  it('los tramos sin datos, si están lejos (más de 1 km), se dibujan de rayas por la carretera más probable y no en recta; los cortos se quedan como están', () => {
    expect(locationMapSrc).toContain('roadAwareGap(')
    expect(locationMapSrc).toContain('const MIN_GAP_ROAD_M = 1000')
    expect(locationMapSrc).toContain('for (const gapPath of gaps)')
    expect(locationMapSrc).toContain("key: `gap|")
  })

  it('el servidor tiene la acción «trace»: puntos de paso «via», sin tráfico, y descarta rodeos absurdos', () => {
    expect(mapsFunctionSrc).toContain('action === "trace"')
    expect(mapsFunctionSrc).toContain('via: true')
    expect(mapsFunctionSrc).toContain('TRAFFIC_UNAWARE')
    expect(mapsFunctionSrc).toContain('"detour"')
    expect(mapsFunctionSrc).toContain('pts.length > 27')
  })

  it('tiene su propio freno diario', () => {
    expect(guardSrc).toContain('trace: 150')
  })
})
