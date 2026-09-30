// Reconoce el nombre de un sitio a partir de sus coordenadas — petición
// real: "que lo reconozca según las tiendas que haya en los mapas...
// automáticamente". Usa la Places API (New) de Google, buscando el
// sitio más cercano al punto exacto (radio de 25 m). Solo se llama
// cuando alguien se queda parado de verdad en un sitio nuevo (ver
// locationSharing.ts), así que el volumen de peticiones es mínimo. Al
// ser automática (nadie la pide a mano), lleva el freno de
// allowGoogleMapsUse por si un fallo la disparase en bucle.
import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'

export async function reverseGeocodePlaceName(latitude: number, longitude: number): Promise<string | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!apiKey) return null
  if (!allowGoogleMapsUse('search')) return null
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName',
      },
      body: JSON.stringify({
        maxResultCount: 1,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: { center: { latitude, longitude }, radius: 25 },
        },
      }),
    })
    if (!res.ok) return null
    const data: { places?: { displayName?: { text: string } }[] } = await res.json()
    return data.places?.[0]?.displayName?.text ?? null
  } catch {
    return null
  }
}
