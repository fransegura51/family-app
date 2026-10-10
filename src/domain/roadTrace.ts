// Recorrido «por carretera». El móvil manda un punto cada ~10 s; yendo en coche eso son 150-250 m entre punto y punto, y unirlos con rectas cortaba
// curvas y cruzaba campos y montes (petición real: «tiene que marcarme la carretera por la que va»). Aquí se decide qué trozos del recorrido son
// «en coche» y se sacan puntos de paso cada ~700 m para que el servidor (Routes API de Google, que ya usa PEPA) devuelva el trazado siguiendo las
// carreteras. Los trozos a pie o parados se dejan como están: no hay carretera que seguir.
import { distanceMeters, type TrackPoint } from '@/domain/geo'

// A partir de esta velocidad entre dos lecturas se va en vehículo (18 km/h): andando no se pasa de ~7 km/h.
const VEHICLE_SPEED_MS = 5
// Un parón corto dentro de un trayecto (semáforo, atasco, lectura rara del GPS) no lo parte en dos.
const MAX_BRIDGED_STOP_MS = 90_000
const MAX_BRIDGED_STOP_M = 250
// Un trayecto en coche de menos de esto no merece pedir carretera: la recta ya es casi la carretera.
const MIN_VEHICLE_RUN_M = 800
// Separación entre puntos de paso: lo bastante cerca para que Google no elija otra carretera entre dos, lo bastante lejos para gastar poco.
const WAYPOINT_SPACING_M = 700
// Routes API admite origen + destino + 25 puntos intermedios.
export const MAX_ROUTE_WAYPOINTS = 27

export interface TrackPart {
  mode: 'vehicle' | 'raw'
  points: TrackPoint[]
}

export interface RoadWaypoint {
  latitude: number
  longitude: number
}

export interface RoadChunk {
  // Identifica el trozo por dónde empieza, dónde acaba y cuántos puntos lleva (para recordar su trazado sin volver a pedirlo).
  key: string
  waypoints: RoadWaypoint[]
}

function stepSpeed(a: TrackPoint, b: TrackPoint): number {
  const dt = (b.at - a.at) / 1000
  return dt > 0 ? distanceMeters(a.lat, a.lng, b.lat, b.lng) / dt : 0
}

function pathLength(points: TrackPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distanceMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
  return total
}

// Parte un tramo continuo en trozos «en coche» y «sin carretera», en orden y sin perder ningún punto (el último punto de un trozo es el primero del siguiente).
export function splitIntoParts(points: TrackPoint[]): TrackPart[] {
  if (points.length < 2) return []
  // 1) Cada paso entre dos lecturas: ¿en vehículo?
  const moving = points.slice(1).map((p, i) => stepSpeed(points[i], p) >= VEHICLE_SPEED_MS)
  // 2) Un parón corto y cercano entre dos pasos en vehículo se da por parte del trayecto.
  for (let i = 0; i < moving.length; i++) {
    if (moving[i]) continue
    let j = i
    while (j < moving.length && !moving[j]) j++
    const bridged = i > 0 && j < moving.length && moving[i - 1]
    if (bridged) {
      const gapMs = points[j].at - points[i].at
      const gapM = distanceMeters(points[i].lat, points[i].lng, points[j].lat, points[j].lng)
      if (gapMs <= MAX_BRIDGED_STOP_MS && gapM <= MAX_BRIDGED_STOP_M) for (let k = i; k < j; k++) moving[k] = true
    }
    i = j
  }
  // 3) Se agrupan los pasos seguidos del mismo tipo.
  const parts: TrackPart[] = []
  let runStart = 0
  for (let i = 1; i <= moving.length; i++) {
    if (i === moving.length || moving[i] !== moving[runStart]) {
      const slice = points.slice(runStart, i + 1)
      const vehicle = moving[runStart] && pathLength(slice) >= MIN_VEHICLE_RUN_M
      const previous = parts[parts.length - 1]
      const mode: TrackPart['mode'] = vehicle ? 'vehicle' : 'raw'
      if (previous && previous.mode === mode && mode === 'raw') previous.points.push(...slice.slice(1))
      else parts.push({ mode, points: slice })
      runStart = i
    }
  }
  return parts
}

function keyOf(waypoints: RoadWaypoint[]): string {
  const first = waypoints[0]
  const last = waypoints[waypoints.length - 1]
  const r = (n: number) => n.toFixed(5)
  return `${r(first.latitude)},${r(first.longitude)}>${r(last.latitude)},${r(last.longitude)}#${waypoints.length}`
}

// Puntos de paso de un trayecto en coche: el primero, uno cada ~700 m, y el último; en trozos de como mucho 27 (cada trozo empieza donde acabó el anterior).
export function chunkVehicleRun(points: TrackPoint[]): RoadChunk[] {
  if (points.length < 2) return []
  const waypoints: RoadWaypoint[] = [{ latitude: points[0].lat, longitude: points[0].lng }]
  let since = 0
  for (let i = 1; i < points.length; i++) {
    since += distanceMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
    const last = i === points.length - 1
    if (since >= WAYPOINT_SPACING_M || last) {
      const prev = waypoints[waypoints.length - 1]
      if (distanceMeters(prev.latitude, prev.longitude, points[i].lat, points[i].lng) > 30) {
        waypoints.push({ latitude: points[i].lat, longitude: points[i].lng })
      }
      since = 0
    }
  }
  if (waypoints.length < 2) return []
  const chunks: RoadChunk[] = []
  for (let start = 0; start < waypoints.length - 1; start += MAX_ROUTE_WAYPOINTS - 1) {
    const slice = waypoints.slice(start, start + MAX_ROUTE_WAYPOINTS)
    if (slice.length >= 2) chunks.push({ key: keyOf(slice), waypoints: slice })
  }
  return chunks
}
