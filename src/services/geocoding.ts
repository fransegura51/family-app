// Buscar una dirección/sitio por nombre y convertir coordenadas en una
// dirección legible — usa la API de Google (Places + Geocoding).
//
// Antes usaba Nominatim (OpenStreetMap), gratis y sin clave, pero se ha
// pasado a Google Maps a petición explícita: mapa más fino y resultados
// más precisos, a los que la gente ya está acostumbrada. Tiene coste
// por uso pasados los primeros 10.000 usos gratis al mes de cada API
// (5.000 para Places) — con cupos diarios puestos en Google Cloud para
// no pasarse (ver docs/GOOGLE_MAPS.md), el gasto se queda en 0 €.
// Necesita VITE_GOOGLE_MAPS_API_KEY (ver .env.example).

export interface PlaceResult {
  label: string
  latitude: number
  longitude: number
}

function apiKey(): string {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!key) throw new Error('Falta configurar VITE_GOOGLE_MAPS_API_KEY')
  return key
}

// Places API (New) — Text Search: la misma búsqueda libre de antes
// ("Mercadona Calle Mayor", "farmacia cerca de..."), hasta 5 resultados.
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!query.trim()) return []
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey(),
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'es', regionCode: 'ES' }),
  })
  if (!res.ok) return []
  const json: { places?: { displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[] } =
    await res.json()
  return (json.places ?? [])
    .filter((p) => p.location)
    .slice(0, 5)
    .map((p) => ({
      label: p.formattedAddress ?? p.displayName?.text ?? 'Sin nombre',
      latitude: p.location!.latitude,
      longitude: p.location!.longitude,
    }))
}

// Geocoding API — de coordenadas a una dirección legible (al tocar o
// arrastrar el marcador del mapa).
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&language=es&key=${encodeURIComponent(apiKey())}`
  const res = await fetch(url)
  if (!res.ok) return null
  const json: { results?: { formatted_address?: string }[] } = await res.json()
  return json.results?.[0]?.formatted_address ?? null
}
