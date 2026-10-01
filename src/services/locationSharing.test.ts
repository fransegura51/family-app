import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Bug real reportado: "eso es una burla de llamadas" — 32 visitas de "Casa" el
// mismo día, muchas casi seguidas. Estas pruebas simulan las dos causas reales
// (recargar la aplicación a media estancia, y un salto puntual de GPS en
// interiores) y comprueban que ya NO fragmentan una sola parada en varias filas
// — ver el comentario grande en services/locationSharing.ts (AWAY_CONFIRM_MS /
// RESUME_GAP_MS).
vi.mock('@/data/location', () => ({
  listPlaces: vi.fn().mockResolvedValue([]),
  recordPlaceVisit: vi.fn().mockResolvedValue('visita-por-defecto'),
  closePlaceVisit: vi.fn().mockResolvedValue(undefined),
  updateMemberLocation: vi.fn().mockResolvedValue(undefined),
  appendLocationHistoryPoint: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/reverseGeocode', () => ({
  reverseGeocodePlaceName: vi.fn().mockResolvedValue('Casa'),
}))

type OnUpdate = (coords: { latitude: number; longitude: number }) => void
let capturedOnUpdate: OnUpdate | null = null
vi.mock('@/services/geolocation', () => ({
  watchPosition: vi.fn((onUpdate: OnUpdate) => {
    capturedOnUpdate = onUpdate
    return () => {}
  }),
}))

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const HOME = { latitude: 40, longitude: -3 }
const FAR = { latitude: 40.01, longitude: -3 } // ~1.1 km — bien fuera del radio de 120 m
const JITTER_NEAR_HOME = { latitude: 40.00005, longitude: -3 } // ~5.5 m — ruido de GPS, no un movimiento real
const NEARBY_MOVED = { latitude: 40.0005, longitude: -3 } // ~55 m — un movimiento real, aunque corto

const STAY_MIN_MS = 6 * 60 * 1000
const AWAY_CONFIRM_MS = 3 * 60 * 1000
const RESUME_GAP_MS = 20 * 60 * 1000
const MIN_HISTORY_INTERVAL_MS = 5 * 60 * 1000

async function flush() {
  await vi.advanceTimersByTimeAsync(0)
}

async function freshModule() {
  vi.resetModules()
  capturedOnUpdate = null
  const mod = await import('@/services/locationSharing')
  const data = await import('@/data/location')
  return { mod, data }
}

async function ping(coords: { latitude: number; longitude: number }) {
  capturedOnUpdate?.(coords)
  await flush()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-01T10:00:00Z'))
  vi.stubGlobal('localStorage', fakeStorage())
  vi.stubGlobal('window', undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('historial de sitios: una parada real', () => {
  it('se guarda una sola vez, aunque sigan llegando posiciones', async () => {
    const { mod, data } = await freshModule()
    mod.startSharing('m1')
    await ping(HOME)
    await vi.advanceTimersByTimeAsync(STAY_MIN_MS)
    await ping(HOME)
    await ping(HOME)
    expect(data.recordPlaceVisit).toHaveBeenCalledTimes(1)
  })
})

describe('historial de sitios: ruido de GPS (bug real: "burla de llamadas")', () => {
  it('un salto suelto fuera del radio no corta la parada en dos', async () => {
    const { mod, data } = await freshModule()
    mod.startSharing('m1')
    await ping(HOME)
    await vi.advanceTimersByTimeAsync(STAY_MIN_MS)
    await ping(HOME) // se registra la parada (id 1)
    expect(data.recordPlaceVisit).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    await ping(FAR) // una lectura rara, sola
    expect(data.closePlaceVisit).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60_000)
    await ping(HOME) // vuelve enseguida — era ruido, no un viaje

    expect(data.closePlaceVisit).not.toHaveBeenCalled()
    expect(data.recordPlaceVisit).toHaveBeenCalledTimes(1) // sigue siendo la MISMA parada
  })

  it('si de verdad se va un buen rato, eso sí cierra la parada y empieza otra', async () => {
    const { mod, data } = await freshModule()
    vi.mocked(data.recordPlaceVisit).mockResolvedValueOnce('visita-1')
    mod.startSharing('m1')
    await ping(HOME)
    await vi.advanceTimersByTimeAsync(STAY_MIN_MS)
    await ping(HOME)
    expect(data.recordPlaceVisit).toHaveBeenCalledTimes(1)

    await ping(FAR) // empieza a estar fuera
    await vi.advanceTimersByTimeAsync(AWAY_CONFIRM_MS)
    await ping(FAR) // sigue fuera, ya confirmado

    expect(data.closePlaceVisit).toHaveBeenCalledWith('visita-1', expect.any(String))
  })
})

describe('historial de sitios: recargar la aplicación a media estancia (bug real)', () => {
  it('con el hueco corto, retoma la MISMA parada en vez de duplicarla', async () => {
    const first = await freshModule()
    first.mod.startSharing('m1')
    await ping(HOME)
    await vi.advanceTimersByTimeAsync(120_000) // 2 min quieta en casa — todavía no llega a los 6 min
    await ping(HOME)
    expect(first.data.recordPlaceVisit).not.toHaveBeenCalled()

    // La aplicación se recarga aquí (pantalla apagada, poca memoria...): se
    // pierde la variable en memoria, pero localStorage sigue igual.
    const second = await freshModule()
    second.mod.startSharing('m1')
    await vi.advanceTimersByTimeAsync(60_000) // 1 min más sin la app abierta
    await ping(HOME) // retoma el candidato guardado, NO empieza de cero

    await vi.advanceTimersByTimeAsync(STAY_MIN_MS) // con el tiempo ya acumulado desde ANTES de recargar, basta con esto
    await ping(HOME)

    expect(second.data.recordPlaceVisit).toHaveBeenCalledTimes(1)
  })

  it('con un hueco largo (de verdad se fue un buen rato), no retoma nada — cierra lo abierto y empieza de cero', async () => {
    const first = await freshModule()
    vi.mocked(first.data.recordPlaceVisit).mockResolvedValueOnce('visita-casa')
    first.mod.startSharing('m1')
    await ping(HOME)
    await vi.advanceTimersByTimeAsync(STAY_MIN_MS)
    await ping(HOME)
    expect(first.data.recordPlaceVisit).toHaveBeenCalledTimes(1)

    const second = await freshModule()
    await vi.advanceTimersByTimeAsync(RESUME_GAP_MS + 60_000) // más de 20 min sin la app abierta
    second.mod.startSharing('m1')
    await ping(HOME)

    expect(second.data.closePlaceVisit).toHaveBeenCalledWith('visita-casa', expect.any(String))
  })
})

describe('rastro de 24h en el mapa (bug real: "ha llevado a Erik al colegio y no aparece ese movimiento")', () => {
  it('el ruido de GPS quieta en el mismo sitio no añade puntos nuevos al rastro', async () => {
    const { mod, data } = await freshModule()
    mod.startSharing('m1')
    await ping(HOME)
    expect(data.appendLocationHistoryPoint).toHaveBeenCalledTimes(1) // el primer punto siempre se guarda

    await vi.advanceTimersByTimeAsync(10_000)
    await ping(JITTER_NEAR_HOME) // ruido GPS de unos metros, sin tiempo suficiente de por medio
    await vi.advanceTimersByTimeAsync(10_000)
    await ping(HOME)

    expect(data.appendLocationHistoryPoint).toHaveBeenCalledTimes(1)
  })

  it('un movimiento real (aunque corto) sí añade un punto nuevo', async () => {
    const { mod, data } = await freshModule()
    mod.startSharing('m1')
    await ping(HOME)
    await vi.advanceTimersByTimeAsync(10_000)
    await ping(NEARBY_MOVED)

    expect(data.appendLocationHistoryPoint).toHaveBeenCalledTimes(2)
  })

  it('aunque siga quieta del todo, de vez en cuando se guarda un punto (para que se note "ha estado aquí desde-hasta")', async () => {
    const { mod, data } = await freshModule()
    mod.startSharing('m1')
    await ping(HOME)
    await vi.advanceTimersByTimeAsync(MIN_HISTORY_INTERVAL_MS)
    await ping(HOME)

    expect(data.appendLocationHistoryPoint).toHaveBeenCalledTimes(2)
  })
})

describe('historial de sitios: dejar de compartir', () => {
  it('cierra la parada abierta y no deja nada guardado para retomar después', async () => {
    const { mod, data } = await freshModule()
    vi.mocked(data.recordPlaceVisit).mockResolvedValueOnce('visita-x')
    mod.startSharing('m1')
    await ping(HOME)
    await vi.advanceTimersByTimeAsync(STAY_MIN_MS)
    await ping(HOME)
    expect(data.recordPlaceVisit).toHaveBeenCalledTimes(1)

    mod.stopSharing()
    expect(data.closePlaceVisit).toHaveBeenCalledWith('visita-x', expect.any(String))
    expect(localStorage.getItem('familyapp:location-visit-candidate')).toBeNull()
  })
})
