// Filtro de saltos de GPS: una lectura muy lejos del último punto aceptado NO debe llegar al servidor mientras no haya pruebas de que de verdad te has movido,
// porque allí dispara un aviso FALSO de «se ha ido de Casa».
//
// Casos reales: 17/10/2026 21:44 y 18/10/2026 11:08 y 11:59 (Paco, quieto en casa, de una habitación a otra). Los datos del 18/10 lo aclararon: no era un
// punto suelto sino una POSICIÓN DE RED (wifi/antena) mal colocada a ~350 m que el móvil devolvía una y otra vez (las mismas coordenadas con 15 decimales,
// 09:08 y 09:59, y tres lecturas idénticas seguidas), sin velocidad. Un salto que se «confirma» con una segunda lectura igual de falsa no sirve.
//
// Regla (la misma en el servicio nativo de Android con la app cerrada, NativeLocationReceiver.acceptAfterJumpCheck, y aquí con la app abierta —Android,
// iPhone y web—): una lectura a más de JUMP_DISTANCE_M del último punto aceptado (si ese punto es de hace menos de un día) se RETIENE. Se acepta
// solo cuando hay pruebas de movimiento real:
//   · dos lecturas seguidas CON velocidad (≥ MIN_MOVING_SPEED_MS; una posición de red no trae velocidad), o
//   · tres lecturas seguidas, cada una MÁS lejos del último punto aceptado que la anterior (un camino de verdad se aleja; una posición que baila, no).
// NO se acepta por «llevar mucho rato en el mismo sitio»: el 22-23/10 una posición de red falsa y FIJA se repitió 102 veces seguidas (cada ~6 min, 273 m de
// Casa, toda la noche) y una regla de «30 min seguidos» la habría dado por buena. Un movimiento real siempre trae velocidad o se va alejando.
// Si la lectura vuelve a la zona de antes, la retenida se descarta. Sin último punto reciente no se filtra nada.
import { distanceMeters } from '@/domain/geo'

export const JUMP_DISTANCE_M = 150
// Entre lecturas retenidas seguidas (mismo recorrido): más lejos que esto no se consideran del mismo sitio.
export const JUMP_STEP_RADIUS_M = 100
export const JUMP_HOLD_GAP_MS = 10 * 60_000
// El último punto aceptado puede ser de hace horas (quieto en casa no llegan lecturas): el filtro SIGUE valiendo. Solo con un último punto de más de un día se
// deja de filtrar (el móvil estuvo apagado y puede estar en otra ciudad).
export const JUMP_CHECK_WINDOW_MS = 24 * 60 * 60_000
export const MIN_MOVING_SPEED_MS = 0.5
export const JUMP_MIN_AWAY_STEP_M = 15
export const JUMP_SPEED_READINGS = 2
export const JUMP_AWAY_READINGS = 3

export interface GpsReading {
  latitude: number
  longitude: number
  /** Hora de la lectura (ms). */
  at: number
  /** Velocidad en m/s si el móvil la da (una posición de red no la trae). */
  speed?: number | null
}

export interface JumpFilter {
  /** true = enviar esta lectura; false = retenida (posible posición falsa). */
  accept(reading: GpsReading): boolean
  /** Olvida todo (otra persona, o dejar de compartir). */
  reset(): void
  /** Deja como «último punto aceptado» uno guardado de antes (al reabrir la app), solo si aún no hay ninguno. */
  seed(reading: GpsReading | null): void
}

interface Held {
  first: GpsReading
  last: GpsReading
  speedReadings: number
  awayReadings: number
}

export function createJumpFilter(): JumpFilter {
  let lastAccepted: GpsReading | null = null
  let held: Held | null = null

  function markAccepted(reading: GpsReading): boolean {
    lastAccepted = reading
    held = null
    return true
  }

  return {
    accept(reading) {
      const recent = lastAccepted !== null && reading.at - lastAccepted.at >= 0 && reading.at - lastAccepted.at <= JUMP_CHECK_WINDOW_MS
      if (!recent || lastAccepted === null) return markAccepted(reading)
      const fromLast = distanceMeters(lastAccepted.latitude, lastAccepted.longitude, reading.latitude, reading.longitude)
      if (fromLast <= JUMP_DISTANCE_M) return markAccepted(reading)

      // Lectura lejana.
      const sameTrip =
        held !== null &&
        reading.at - held.last.at >= 0 &&
        reading.at - held.last.at <= JUMP_HOLD_GAP_MS &&
        distanceMeters(held.last.latitude, held.last.longitude, reading.latitude, reading.longitude) <= JUMP_STEP_RADIUS_M
      if (!sameTrip || held === null) {
        held = { first: reading, last: reading, speedReadings: 0, awayReadings: 0 }
        return false
      }
      const previousFar = distanceMeters(lastAccepted.latitude, lastAccepted.longitude, held.last.latitude, held.last.longitude)
      const moving = typeof reading.speed === 'number' && reading.speed >= MIN_MOVING_SPEED_MS
      held = {
        first: held.first,
        last: reading,
        speedReadings: moving ? held.speedReadings + 1 : 0,
        awayReadings: fromLast - previousFar >= JUMP_MIN_AWAY_STEP_M ? held.awayReadings + 1 : 0,
      }
      if (held.speedReadings >= JUMP_SPEED_READINGS || held.awayReadings >= JUMP_AWAY_READINGS) return markAccepted(reading)
      return false
    },
    reset() {
      lastAccepted = null
      held = null
    },
    seed(reading) {
      if (lastAccepted === null && reading !== null) lastAccepted = reading
    },
  }
}
