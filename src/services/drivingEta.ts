// Tiempo estimado de llegada en coche, con el tráfico en cuenta — Routes API (Google), pedida por
// el servidor (services/googleMapsProxy.ts) — ver el comentario grande en services/geocoding.ts.
// Solo se pide cuando alguien lo toca a propósito (no automático para cada persona y cada lugar en
// cada pantallazo): gratis hasta 10.000 al mes, y así el uso real se queda muy por debajo.

import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'
import { callGoogleMaps } from '@/services/googleMapsProxy'

export interface DrivingEta {
  minutes: number
  km: number
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
