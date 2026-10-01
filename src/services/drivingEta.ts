// Tiempo estimado de llegada en coche, con el tráfico en cuenta — Routes API (Google), pedida por
// el servidor (services/googleMapsProxy.ts) — ver el comentario grande en services/geocoding.ts.
// Solo se pide cuando alguien lo toca a propósito (no automático para cada persona y cada lugar en
// cada pantallazo): gratis hasta 10.000 al mes, y así el uso real se queda muy por debajo.

import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'
import { callGoogleMaps } from '@/services/googleMapsProxy'

export interface DrivingEta {
  minutes: number
  km: number
  // Minutos de más (o de menos, si es negativo) respecto a sin tráfico — petición real: "quiero
  // que me diga... el estado de las carreteras". 0 o negativo = fluido.
  delayMinutes: number
  // El trazado de la ruta, codificado (formato polyline de Google) — petición real: "que me
  // marque la ruta hasta Madrid como en Google Maps". null si Google no lo ha podido calcular.
  // Se decodifica con domain/geo.ts, decodePolyline, justo antes de dibujarlo.
  polyline: string | null
}

export async function getDrivingEta(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<DrivingEta | null> {
  if (!allowGoogleMapsUse('eta')) return null
  try {
    const data = await callGoogleMaps({ action: 'route', origin, destination })
    return (data.eta as DrivingEta | null) ?? null
  } catch {
    return null
  }
}
