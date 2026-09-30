// Buscar una dirección/sitio por nombre y convertir coordenadas en una dirección legible — Places +
// Geocoding de Google, pedidas por el servidor (services/googleMapsProxy.ts, función "google-maps")
// en vez de directas desde el navegador — ver el comentario grande en ese archivo: una clave
// restringida por sitio web pedida directa desde el navegador depende de que CADA navegador mande
// el Referer que Google espera, y eso resultó no ser fiable en Safari/iOS (bug real, 30/09/2026:
// "Pepa no encuentra Madrid", confirmado en dos teléfonos y dos cuentas distintas).
//
// Antes usaba Nominatim (OpenStreetMap), gratis y sin clave, pero se ha pasado a Google Maps a
// petición explícita: mapa más fino y resultados más precisos. Tiene coste por uso pasados los
// primeros 10.000 usos gratis al mes de cada API. El cupo diario de Google Cloud que cortaría el
// gasto en seco no se puede poner mientras la cuenta esté en la prueba gratuita (ver
// docs/GOOGLE_MAPS.md); mientras tanto, allowGoogleMapsUse actúa de freno por dispositivo para que
// un fallo no dispare llamadas sin control.
import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'
import { callGoogleMaps } from '@/services/googleMapsProxy'

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

// Places API (New) — Autocomplete: igual de bien que "Text Search" para
// esta misma búsqueda libre ("Mercadona Calle Mayor", "farmacia
// cerca..."), pero sale mucho más barata (gratis hasta 10.000 al mes,
// frente a 5.000 de Text Search, y con menos coste pasado ese tope).
// Solo da el nombre y un identificador; las coordenadas se piden aparte,
// con resolvePlace(), y solo del que se elija de la lista.
export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (!query.trim()) return []
  if (!allowGoogleMapsUse('search')) return []
  try {
    const data = await callGoogleMaps({ action: 'autocomplete', input: query })
    return Array.isArray(data.suggestions) ? (data.suggestions as PlaceSuggestion[]) : []
  } catch {
    return []
  }
}

// Places API (New) — Place Details: las coordenadas del sitio elegido
// (solo se pide una vez, al confirmar, no por cada sugerencia de la lista).
export async function resolvePlace(placeId: string): Promise<PlaceResult | null> {
  if (!allowGoogleMapsUse('search')) return null
  try {
    const data = await callGoogleMaps({ action: 'details', placeId })
    return (data.place as PlaceResult | null) ?? null
  } catch {
    return null
  }
}

// Geocoding API — de coordenadas a una dirección legible (al tocar o
// arrastrar el marcador del mapa).
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  if (!allowGoogleMapsUse('search')) return null
  try {
    const data = await callGoogleMaps({ action: 'geocode', latitude, longitude })
    return (data.address as string | null) ?? null
  } catch {
    return null
  }
}
