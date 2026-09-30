// Tiempo estimado de llegada en coche, con el tráfico en cuenta — Routes
// API (Google), "Calcular rutas". Solo se pide cuando alguien lo toca a
// propósito (no automático para cada persona y cada lugar en cada
// pantallazo): gratis hasta 10.000 al mes, y así el uso real se queda
// muy por debajo. Necesita VITE_GOOGLE_MAPS_API_KEY (ver .env.example).

import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'

export interface DrivingEta {
  minutes: number
  km: number
}

export async function getDrivingEta(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): Promise<DrivingEta | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!apiKey) return null
  if (!allowGoogleMapsUse('eta')) return null
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
        destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        languageCode: 'es',
      }),
    })
    if (!res.ok) return null
    const data: { routes?: { duration?: string; distanceMeters?: number }[] } = await res.json()
    const route = data.routes?.[0]
    if (!route?.duration) return null
    const seconds = parseInt(route.duration.replace('s', ''), 10)
    if (!Number.isFinite(seconds)) return null
    return { minutes: Math.max(1, Math.round(seconds / 60)), km: Math.round((route.distanceMeters ?? 0) / 100) / 10 }
  } catch {
    return null
  }
}
