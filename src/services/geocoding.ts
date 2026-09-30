// Buscar una dirección/sitio por nombre y convertir coordenadas en una
// dirección legible — usa la API de Google (Places + Geocoding).
//
// Antes usaba Nominatim (OpenStreetMap), gratis y sin clave, pero se ha
// pasado a Google Maps a petición explícita: mapa más fino y resultados
// más precisos, a los que la gente ya está acostumbrada. Tiene coste
// por uso pasados los primeros 10.000 usos gratis al mes de cada API.
// El cupo diario de Google Cloud que cortaría el gasto en seco no se
// puede poner mientras la cuenta esté en la prueba gratuita (ver
// docs/GOOGLE_MAPS.md); mientras tanto, allowGoogleMapsUse actúa de
// freno por dispositivo para que un fallo no dispare llamadas sin
// control.
// Necesita VITE_GOOGLE_MAPS_API_KEY (ver .env.example).

import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'

export interface PlaceResult {
  label: string
  latitude: number
  longitude: number
}

// Una sugerencia todavía sin coordenadas — hace falta resolvePlace() para
// obtenerlas (solo cuando se elige una, no de las 5 a la vez).
export interface PlaceSuggestion {
  label: string
  placeId: string
}

function apiKey(): string {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!key) throw new Error('Falta configurar VITE_GOOGLE_MAPS_API_KEY')
  return key
}

// Places API (New) — Autocomplete: igual de bien que "Text Search" para
// esta misma búsqueda libre ("Mercadona Calle Mayor", "farmacia
// cerca..."), pero sale mucho más barata (gratis hasta 10.000 al mes,
// frente a 5.000 de Text Search, y con menos coste pasado ese tope).
// Solo da el nombre y un identificador; las coordenadas se piden aparte,
// con resolvePlace(), y solo del que se elija de la lista.
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (!query.trim()) return []
  if (!allowGoogleMapsUse('search')) return []
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey(),
    },
    body: JSON.stringify({ input: query, languageCode: 'es', regionCode: 'ES' }),
  })
  if (!res.ok) return []
  const json: { suggestions?: { placePrediction?: { placeId: string; text?: { text: string } } }[] } = await res.json()
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is { placeId: string; text?: { text: string } } => !!p)
    .slice(0, 5)
    .map((p) => ({ label: p.text?.text ?? 'Sin nombre', placeId: p.placeId }))
}

// Places API (New) — Place Details: las coordenadas del sitio elegido
// (solo se pide una vez, al confirmar, no por cada sugerencia de la lista).
export async function resolvePlace(placeId: string): Promise<PlaceResult | null> {
  if (!allowGoogleMapsUse('search')) return null
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask': 'displayName,formattedAddress,location',
    },
  })
  if (!res.ok) return null
  const json: { displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } } = await res.json()
  if (!json.location) return null
  return {
    label: json.formattedAddress ?? json.displayName?.text ?? 'Sin nombre',
    latitude: json.location.latitude,
    longitude: json.location.longitude,
  }
}

// Geocoding API — de coordenadas a una dirección legible (al tocar o
// arrastrar el marcador del mapa).
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  if (!allowGoogleMapsUse('search')) return null
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=es&key=${encodeURIComponent(apiKey())}`
  const res = await fetch(url)
  if (!res.ok) return null
  const json: { results?: { formatted_address?: string }[] } = await res.json()
  return json.results?.[0]?.formatted_address ?? null
}
