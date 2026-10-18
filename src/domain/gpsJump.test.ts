// Filtro de saltos de GPS (app abierta). Casos reales: 17/10/2026 21:44 y 18/10/2026 11:08 (Paco, un punto a ~350 m con el móvil quieto en casa).
import { describe, expect, it } from 'vitest'
import { createJumpFilter, JUMP_CHECK_WINDOW_MS, JUMP_CONFIRM_WINDOW_MS, type GpsReading } from './gpsJump'

const CASA = { latitude: 38.1053157, longitude: -0.8499646 }
const SALTO = { latitude: 38.1034229509181, longitude: -0.853230781071963 } // ~350 m de Casa (el punto falso del 18/10)
const MIN = 60_000
const T0 = 1_000_000_000_000

function r(p: { latitude: number; longitude: number }, minutes: number, extraSeconds = 0): GpsReading {
  return { ...p, at: T0 + minutes * MIN + extraSeconds * 1000 }
}

describe('filtro de saltos de GPS', () => {
  it('el caso real: quieto en casa, un punto a ~350 m y vuelta a casa — el punto suelto NO se envía', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true) // 09:02:54
    expect(f.accept(r(SALTO, 5, 22))).toBe(false) // 09:08:16 — salto
    expect(f.accept(r({ latitude: 38.10532, longitude: -0.84997 }, 5, 40))).toBe(true) // vuelve a casa: se envía lo bueno
  })

  it('moviéndose de verdad: la primera lectura lejana se retiene y la siguiente la confirma', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(SALTO, 4))).toBe(false)
    // 20 s después, a ~30 m del punto retenido: es movimiento real.
    expect(f.accept(r({ latitude: SALTO.latitude - 0.0002, longitude: SALTO.longitude - 0.0002 }, 4, 20))).toBe(true)
  })

  it('una lectura cercana (10 m) siempre se acepta, no se confunde con un salto', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r({ latitude: CASA.latitude + 0.00009, longitude: CASA.longitude }, 1))).toBe(true)
  })

  it('si la lectura que confirma llega muy tarde (más de 5 minutos), no confirma: la retenida se sustituye', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(SALTO, 4))).toBe(false)
    expect(f.accept(r(SALTO, 4, JUMP_CONFIRM_WINDOW_MS / 1000 + 5))).toBe(false)
  })

  it('con lecturas espaciadas (web en segundo plano, 2 minutos entre una y otra) una salida real SÍ se confirma', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(SALTO, 4))).toBe(false)
    expect(f.accept(r(SALTO, 6))).toBe(true)
  })

  it('con el último punto muy antiguo (más de 10 min) no se filtra: puede ser un viaje de verdad', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(SALTO, JUMP_CHECK_WINDOW_MS / MIN + 1))).toBe(true)
  })

  it('el primer punto de todos se acepta siempre', () => {
    expect(createJumpFilter().accept(r(SALTO, 0))).toBe(true)
  })

  it('reset olvida todo: tras cambiar de persona, el primer punto vuelve a aceptarse', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    f.reset()
    expect(f.accept(r(SALTO, 1))).toBe(true)
  })

  it('dos saltos sueltos seguidos a sitios distintos no se confirman entre sí', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(SALTO, 1))).toBe(false)
    expect(f.accept(r({ latitude: SALTO.latitude + 0.01, longitude: SALTO.longitude }, 1, 10))).toBe(false)
  })
})
