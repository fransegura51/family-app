// Trazado por carretera de los trozos «en coche» del recorrido (ver domain/roadTrace.ts). Cada trozo se pide UNA vez a la función «google-maps»
// del servidor (acción «trace», Routes API) y el resultado se recuerda en este móvil: volver a abrir el mapa no vuelve a gastar nada. Si no se
// puede (sin conexión, freno diario, Google dice que no), el mapa sigue dibujando la línea recta de siempre: nunca se queda sin recorrido.
import { decodePolyline } from '@/domain/geo'
import type { RoadChunk } from '@/domain/roadTrace'
import { callGoogleMaps } from '@/services/googleMapsProxy'
import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'

export type RoadPath = { lat: number; lng: number }[]

const STORAGE_KEY = 'pepa-road-trace-cache-v1'
const MAX_REMEMBERED = 80
const RETRY_AFTER_MS = 60_000

// clave → trazado ya decodificado, o null = Google no encontró una carretera razonable para ese trozo (no se vuelve a preguntar).
const known = new Map<string, RoadPath | null>()
const encodedByKey = new Map<string, string>()
const inFlight = new Map<string, Promise<RoadPath | null>>()
const failedAt = new Map<string, number>()
let loaded = false

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const stored = JSON.parse(raw) as Record<string, string>
    for (const [key, encoded] of Object.entries(stored)) {
      encodedByKey.set(key, encoded)
      known.set(key, encoded ? decodePolyline(encoded) : null)
    }
  } catch {
    // Sin localStorage (privado) o datos viejos: se empieza de cero, no pasa nada.
  }
}

function persist(): void {
  try {
    // Se guardan solo los últimos MAX_REMEMBERED: lo viejo (más de un día) ya no se dibuja.
    const entries = [...encodedByKey.entries()].slice(-MAX_REMEMBERED)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Si no se puede guardar, se pedirá otra vez la próxima vez: solo cuesta un poco más.
  }
}

// undefined = todavía no se sabe (hay que pedirlo); null = se preguntó y no hay carretera; array = el trazado.
export function getCachedRoad(key: string): RoadPath | null | undefined {
  load()
  return known.get(key)
}

export function requestRoad(chunk: RoadChunk): Promise<RoadPath | null> {
  load()
  const cached = known.get(chunk.key)
  if (cached !== undefined) return Promise.resolve(cached)
  const running = inFlight.get(chunk.key)
  if (running) return running
  const lastFail = failedAt.get(chunk.key)
  if (lastFail && Date.now() - lastFail < RETRY_AFTER_MS) return Promise.resolve(null)
  if (!allowGoogleMapsUse('trace')) return Promise.resolve(null)

  const promise = (async (): Promise<RoadPath | null> => {
    try {
      const data = await callGoogleMaps({ action: 'trace', points: chunk.waypoints })
      const encoded = typeof data.polyline === 'string' ? data.polyline : ''
      const path = encoded ? decodePolyline(encoded) : null
      known.set(chunk.key, path && path.length >= 2 ? path : null)
      encodedByKey.set(chunk.key, path && path.length >= 2 ? encoded : '')
      persist()
      return known.get(chunk.key) ?? null
    } catch {
      // Fallo puntual (sin red, servidor...): no se recuerda, se reintenta pasado un rato.
      failedAt.set(chunk.key, Date.now())
      return null
    } finally {
      inFlight.delete(chunk.key)
    }
  })()
  inFlight.set(chunk.key, promise)
  return promise
}

// Pega los trazados de varios trozos seguidos en uno solo (cada trozo empieza donde acabó el anterior: se quita el punto repetido).
export function joinRoadPaths(paths: RoadPath[]): RoadPath {
  const out: RoadPath = []
  for (const path of paths) out.push(...(out.length ? path.slice(1) : path))
  return out
}
