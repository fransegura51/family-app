// «Compartir mi ubicación actual»: si el GPS no responde en 10 s se reintenta con una posición aproximada, y los errores salen en español.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => false }))
vi.mock('@/services/nativeLocation', () => ({ watchNativePosition: vi.fn() }))

import { getCurrentPosition } from '@/services/geolocation'

type Callbacks = { ok: (p: { coords: { latitude: number; longitude: number } }) => void; fail: (e: unknown) => void }
const calls: PositionOptions[] = []
let script: Array<(cb: Callbacks) => void> = []

function geoError(code: number, message: string) {
  return { code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
}

beforeEach(() => {
  calls.length = 0
  script = []
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (ok: Callbacks['ok'], fail: Callbacks['fail'], options: PositionOptions) => {
        calls.push(options)
        const step = script.shift()
        if (step) step({ ok, fail })
      },
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('getCurrentPosition', () => {
  it('con GPS a tiempo, una sola lectura de alta precisión', async () => {
    script = [(cb) => cb.ok({ coords: { latitude: 38.1, longitude: -0.85 } })]
    await expect(getCurrentPosition()).resolves.toEqual({ latitude: 38.1, longitude: -0.85 })
    expect(calls).toEqual([{ enableHighAccuracy: true, timeout: 10_000 }])
  })

  it('si el GPS tarda demasiado, reintenta con una posición aproximada o reciente (el «Timeout expired» del Samsung)', async () => {
    script = [(cb) => cb.fail(geoError(3, 'Timeout expired')), (cb) => cb.ok({ coords: { latitude: 38.2, longitude: -0.9 } })]
    await expect(getCurrentPosition()).resolves.toEqual({ latitude: 38.2, longitude: -0.9 })
    expect(calls[1]).toEqual({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 120_000 })
  })

  it('si tampoco así hay posición, el error sale en español (no «Timeout expired»)', async () => {
    script = [(cb) => cb.fail(geoError(3, 'Timeout expired')), (cb) => cb.fail(geoError(3, 'Timeout expired'))]
    await expect(getCurrentPosition()).rejects.toThrow('Ha tardado demasiado en obtener tu posición')
  })

  it('con el permiso denegado no insiste y lo explica', async () => {
    script = [(cb) => cb.fail(geoError(1, 'User denied Geolocation'))]
    await expect(getCurrentPosition()).rejects.toThrow('Has denegado el permiso de ubicación')
    expect(calls).toHaveLength(1)
  })

  it('sin soporte de geolocalización lo dice', async () => {
    vi.stubGlobal('navigator', {})
    await expect(getCurrentPosition()).rejects.toThrow('no soporta geolocalización')
  })
})
