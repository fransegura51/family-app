// Distancia entre dos coordenadas (fórmula de Haversine). Sin
// dependencias de mapas de pago — solo aritmética.
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export interface TrackPoint {
  lat: number
  lng: number
  // Instante de la lectura, en milisegundos.
  at: number
}

export interface TrackSegments {
  // Trozos de recorrido con datos seguidos: se dibujan con línea continua.
  solid: { lat: number; lng: number }[][]
  // Tramos entre dos lecturas con un hueco sin datos en medio: se dibujan discontinuos.
  gaps: [{ lat: number; lng: number }, { lat: number; lng: number }][]
}

// Más de este tiempo entre dos lecturas (y a distancia apreciable) = el móvil no mandó nada por el medio.
const MAX_CONNECTED_GAP_MS = 10 * 60 * 1000
// A esta distancia o menos, dos lecturas se consideran "en el mismo sitio" aunque pase mucho rato (quieto en
// casa sube un punto cada 5 min): se unen igualmente, no es un salto.
const SAME_PLACE_M = 150
// Más rápido que esto entre dos lecturas cercanas en el tiempo es un salto falso del GPS, no un trayecto.
const MAX_PLAUSIBLE_SPEED_MS = 250 / 3.6

// Petición real: "el mapa no marca el recorrido bien". El móvil solo manda su posición con la app abierta,
// así que el rastro de 24 h trae HUECOS de horas (un caso real: dos huecos de unas 4 h con 4,5 km entre los
// dos lados) — y unirlos con una recta dibujaba un "trayecto" que cruzaba campos y edificios y que nadie
// había hecho. Aquí se separa lo que se sabe (línea continua) de lo que no (tramos discontinuos), y se
// descartan los saltos imposibles del GPS (decenas de km/h de más en segundos), que dibujaban picos.
export function buildTrackDetail(points: TrackPoint[]): TrackSegments & { solidPoints: TrackPoint[][] } {
  const sorted = [...points].sort((a, b) => a.at - b.at)
  const kept: TrackPoint[] = []
  // Si el GPS "salta" de verdad (el primer punto era el malo, o se reinició en otro sitio), varias lecturas
  // seguidas coinciden entre sí: tras 3 descartes seguidos se da por buena la nueva posición.
  let droppedInRow = 0
  for (const point of sorted) {
    const last = kept[kept.length - 1]
    if (last) {
      const dt = point.at - last.at
      const dist = distanceMeters(last.lat, last.lng, point.lat, point.lng)
      const implausible = dt <= MAX_CONNECTED_GAP_MS && dist > SAME_PLACE_M && dist / Math.max(dt / 1000, 1) > MAX_PLAUSIBLE_SPEED_MS
      if (implausible && droppedInRow < 3) {
        droppedInRow++
        continue
      }
    }
    droppedInRow = 0
    kept.push(point)
  }

  const solid: TrackSegments['solid'] = []
  const solidPoints: TrackPoint[][] = []
  const gaps: TrackSegments['gaps'] = []
  let current: TrackPoint[] = []
  for (let i = 0; i < kept.length; i++) {
    const point = kept[i]
    const prev = kept[i - 1]
    if (prev) {
      const dt = kept[i].at - prev.at
      const dist = distanceMeters(prev.lat, prev.lng, point.lat, point.lng)
      if (dt > MAX_CONNECTED_GAP_MS && dist > SAME_PLACE_M) {
        if (current.length >= 2) {
          solid.push(current.map((p) => ({ lat: p.lat, lng: p.lng })))
          solidPoints.push(current)
        }
        gaps.push([{ lat: prev.lat, lng: prev.lng }, { lat: point.lat, lng: point.lng }])
        current = []
      }
    }
    current.push(point)
  }
  if (current.length >= 2) {
    solid.push(current.map((p) => ({ lat: p.lat, lng: p.lng })))
    solidPoints.push(current)
  }
  return { solid, gaps, solidPoints }
}

// Lo de siempre (solo las coordenadas); buildTrackDetail añade los puntos con su hora para quien necesite saber a qué velocidad se iba.
export function buildTrackSegments(points: TrackPoint[]): TrackSegments {
  const { solid, gaps } = buildTrackDetail(points)
  return { solid, gaps }
}



export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

// Petición real: "quiero que me diga las horas y minutos, por ejemplo 4 horas y 10 minutos" — antes
// siempre salía todo en minutos ("246 minutos"), aunque fueran varias horas.
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total} minutos`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  const hoursLabel = `${hours} ${hours === 1 ? 'hora' : 'horas'}`
  return rest === 0 ? hoursLabel : `${hoursLabel} y ${rest} minutos`
}

// Petición real: "quiero que me diga... el estado de las carreteras" — a partir de cuánto más (o
// menos) se tarda con el tráfico de ahora mismo respecto a sin tráfico (drivingEta.ts,
// DrivingEta.delayMinutes), sin pedir nada extra a Google.
export function trafficDescription(totalMinutes: number, delayMinutes: number): string {
  if (delayMinutes <= 1) return 'con tráfico fluido, sin retenciones'
  const staticMinutes = Math.max(1, totalMinutes - delayMinutes)
  const ratio = delayMinutes / staticMinutes
  return ratio < 0.15 ? `con algo de tráfico, unos ${delayMinutes} minutos más de lo normal` : `con retenciones importantes, unos ${delayMinutes} minutos más de lo normal`
}

// Petición real: "que me marque la ruta hasta Madrid como en Google Maps" — decodifica el trazado
// que devuelve la Routes API (formato "polyline" de Google: cada punto se codifica como la
// diferencia con el anterior, en base64 a su manera) para poder dibujarlo en el mapa. Algoritmo
// estándar de Google, el mismo que usa su propia librería — aquí sin depender de ella (esta app no
// carga la librería "geometry" del script de Maps) para no tocar nada más de cómo se carga el mapa.
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}
