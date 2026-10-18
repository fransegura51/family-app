// Filtro de saltos de GPS: una lectura suelta muy lejos del último punto (que vuelve enseguida) no debe llegar al servidor, porque allí dispara un aviso
// FALSO de «se ha ido de Casa» (casos reales: 17/10/2026 21:44 y 18/10/2026 11:08 — Paco, un punto a ~350 m con el móvil quieto en casa).
//
// Misma regla que el servicio nativo de Android (NativeLocationReceiver.acceptAfterJumpCheck, app cerrada) y que el filtro del iPhone, aquí para la app
// ABIERTA (la que manda JavaScript, en Android, iPhone y la web):
//   · Una lectura a más de JUMP_DISTANCE_M del último punto aceptado (si ese punto es de hace menos de JUMP_CHECK_WINDOW_MS) se RETIENE.
//   · Solo se acepta si la lectura siguiente la confirma: a menos de JUMP_CONFIRM_RADIUS_M de ella y en menos de JUMP_CONFIRM_WINDOW_MS (5 min aquí;
//     el servicio nativo de Android usa 60 s porque allí las lecturas llegan seguidas).
//   · Si la siguiente vuelve a la zona de antes, la retenida se descarta (es un salto).
//   · Moviéndose de verdad llegan lecturas seguidas: el retraso es de una lectura. Sin último punto reciente no se filtra nada.
import { distanceMeters } from '@/domain/geo'

export const JUMP_DISTANCE_M = 150
export const JUMP_CONFIRM_RADIUS_M = 100
// En la web y la app abierta las lecturas pueden llegar muy espaciadas (segundo plano, ahorro de batería): se da margen para que una salida real se confirme.
export const JUMP_CONFIRM_WINDOW_MS = 5 * 60_000
export const JUMP_CHECK_WINDOW_MS = 10 * 60_000

export interface GpsReading {
  latitude: number
  longitude: number
  /** Hora de la lectura (ms). */
  at: number
}

export interface JumpFilter {
  /** true = enviar esta lectura; false = retenida (posible salto de GPS). */
  accept(reading: GpsReading): boolean
  /** Olvida todo (otra persona, o dejar de compartir). */
  reset(): void
}

export function createJumpFilter(): JumpFilter {
  let lastAccepted: GpsReading | null = null
  let held: GpsReading | null = null

  function markAccepted(reading: GpsReading): boolean {
    lastAccepted = reading
    held = null
    return true
  }

  return {
    accept(reading) {
      const recent = lastAccepted !== null && reading.at - lastAccepted.at >= 0 && reading.at - lastAccepted.at <= JUMP_CHECK_WINDOW_MS
      if (!recent || lastAccepted === null) return markAccepted(reading)
      if (distanceMeters(lastAccepted.latitude, lastAccepted.longitude, reading.latitude, reading.longitude) <= JUMP_DISTANCE_M) return markAccepted(reading)
      if (
        held !== null &&
        reading.at - held.at >= 0 &&
        reading.at - held.at <= JUMP_CONFIRM_WINDOW_MS &&
        distanceMeters(held.latitude, held.longitude, reading.latitude, reading.longitude) <= JUMP_CONFIRM_RADIUS_M
      ) {
        return markAccepted(reading)
      }
      held = reading
      return false
    },
    reset() {
      lastAccepted = null
      held = null
    },
  }
}
