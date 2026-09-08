// Buscar una dirección/sitio por nombre y convertir coordenadas en una
// dirección legible — usa Nominatim (la API pública y gratis de
// OpenStreetMap, sin clave ni límite de uso de pago) en vez de un mapa
// interactivo de pago. Petición real: "no siempre es la ubicación
// actual la que se quiere adjuntar" — con esto se puede buscar
// cualquier sitio, no solo usar el GPS.

export interface PlaceResult {
  label: string
  latitude: number
  longitude: number
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!query.trim()) return []
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=5&q=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) return []
  const results: { display_name: string; lat: string; lon: string }[] = await res.json()
  return results.map((r) => ({ label: r.display_name, latitude: Number(r.lat), longitude: Number(r.lon) }))
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
  const res = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  return typeof json.display_name === 'string' ? json.display_name : null
}
