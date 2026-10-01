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
