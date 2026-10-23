// Filtro de saltos de GPS (app abierta). Casos reales del 18/10/2026 (Paco, quieto en casa de una habitación a otra): una posición de red mal colocada a
// ~350 m que el móvil devolvía una y otra vez, sin velocidad.
import { describe, expect, it } from 'vitest'
import { createJumpFilter, JUMP_CHECK_WINDOW_MS, type GpsReading } from './gpsJump'

const CASA = { latitude: 38.1053157, longitude: -0.8499646 } // 09:02:54, en casa
// Los puntos falsos reales de hoy (09:08:16 y 09:59:24 con las MISMAS coordenadas; 10:00:58, 10:01:46 y 10:03:22 idénticas; 10:03:28 otra a ~55 m).
const FALSO_A = { latitude: 38.1034229509181, longitude: -0.853230781071963 }
const FALSO_B = { latitude: 38.1034352442769, longitude: -0.853170395309096 }
const FALSO_C = { latitude: 38.1029699845638, longitude: -0.853589078277245 }
const MIN = 60_000
const T0 = 1_000_000_000_000

function r(p: { latitude: number; longitude: number }, minutes: number, extraSeconds = 0, speed: number | null = null): GpsReading {
  return { ...p, at: T0 + minutes * MIN + extraSeconds * 1000, speed }
}

// Un camino que se aleja de casa hacia el sur, `meters` metros (1 m ≈ 0,000009 grados de latitud).
function sur(meters: number) {
  return { latitude: CASA.latitude - meters * 0.000009, longitude: CASA.longitude }
}

describe('el caso real del 18/10: posición de red falsa a ~350 m', () => {
  it('11:08 — un punto falso suelto y vuelta a casa: no se envía el falso, sí lo bueno', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(FALSO_A, 5, 22))).toBe(false)
    expect(f.accept(r({ latitude: 38.10532, longitude: -0.84997 }, 5, 40))).toBe(true)
  })

  it('11:59 — 57 min después del último punto en casa, la misma posición falsa REPETIDA varias veces seguidas no se acepta nunca (sin velocidad, sin alejarse)', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true) // 09:02:54
    expect(f.accept(r(FALSO_A, 56, 30))).toBe(false) // 09:59:24
    expect(f.accept(r(FALSO_B, 58))).toBe(false) // 10:00:58
    expect(f.accept(r(FALSO_B, 58, 48))).toBe(false) // 10:01:46 (idéntica)
    expect(f.accept(r(FALSO_B, 60, 22))).toBe(false) // 10:03:22 (idéntica)
    expect(f.accept(r(FALSO_C, 60, 28))).toBe(false) // 10:03:28 (otra a ~55 m: una sola lectura que se aleja no basta)
  })

  it('cuando por fin vuelve una lectura buena en casa, se envía normal', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(FALSO_A, 56, 30))).toBe(false)
    expect(f.accept(r(CASA, 70))).toBe(true)
  })
})

describe('un movimiento de verdad SÍ se acepta', () => {
  it('andando: lecturas con velocidad — se acepta a la tercera lectura lejana', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(sur(200), 10, 0, 1.4))).toBe(false)
    expect(f.accept(r(sur(228), 10, 20, 1.4))).toBe(false)
    expect(f.accept(r(sur(256), 10, 40, 1.4))).toBe(true)
  })

  it('sin velocidad pero alejándose de verdad (cada lectura más lejos que la anterior): se acepta', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(sur(200), 10))).toBe(false)
    expect(f.accept(r(sur(230), 10, 20))).toBe(false)
    expect(f.accept(r(sur(260), 10, 40))).toBe(false)
    expect(f.accept(r(sur(290), 10, 60))).toBe(true)
  })

  it('una lectura cada pocos metros (movimiento normal) pasa siempre sin retención', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    for (let m = 25; m <= 500; m += 25) expect(f.accept(r(sur(m), 1, m))).toBe(true)
  })

  it('una posición de red falsa y FIJA que se repite toda la noche (102 lecturas cada ~6 min a 273 m, 22-23/10) NUNCA se acepta', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    const falsa = { latitude: 38.103935, longitude: -0.852557 }
    for (let m = 6; m <= 102 * 6; m += 6) expect(f.accept(r(falsa, m))).toBe(false)
  })
})

describe('otros casos', () => {
  it('una lectura cercana (10 m) siempre se acepta', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(sur(10), 1))).toBe(true)
  })

  it('con el último punto de más de un día no se filtra (el móvil estuvo apagado)', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(FALSO_A, JUMP_CHECK_WINDOW_MS / MIN + 1))).toBe(true)
  })

  it('el primer punto de todos se acepta siempre; reset olvida todo', () => {
    const f = createJumpFilter()
    expect(f.accept(r(FALSO_A, 0))).toBe(true)
    f.reset()
    expect(f.accept(r(CASA, 1))).toBe(true)
    expect(f.accept(r(FALSO_A, 2))).toBe(false)
    f.reset()
    expect(f.accept(r(FALSO_A, 3))).toBe(true)
  })

  it('dos posiciones falsas en sitios distintos no se confirman entre sí', () => {
    const f = createJumpFilter()
    expect(f.accept(r(CASA, 0))).toBe(true)
    expect(f.accept(r(FALSO_A, 1))).toBe(false)
    expect(f.accept(r({ latitude: FALSO_A.latitude + 0.01, longitude: FALSO_A.longitude }, 1, 10, 3))).toBe(false)
  })
})
