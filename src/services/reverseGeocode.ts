// Reconoce el nombre de un sitio a partir de sus coordenadas — petición
// real: "que lo reconozca según las tiendas que haya en los mapas...
// automáticamente". Usa Nominatim (OpenStreetMap), gratis y sin clave
// de API, en vez de Google Places (de pago pasado un uso muy limitado
// — no encaja con la regla de "todo gratis" del proyecto). Solo se
// llama cuando alguien se queda parado de verdad en un sitio nuevo (ver
// locationSharing.ts), así que el volumen de peticiones es mínimo y
// queda muy por debajo del límite de uso de Nominatim (1 petición/seg).
export async function reverseGeocodePlaceName(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&zoom=18&addressdetails=1`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const addr = data.address ?? {}
    // Prioridad: el propio nombre del sitio (tienda, negocio...) sobre
    // la dirección genérica — es lo que de verdad ayuda a reconocer "el
    // supermercado" en vez de solo una calle.
    const name: string | undefined =
      data.name || addr.shop || addr.amenity || addr.office || addr.building || addr.tourism
    if (name) return name
    if (addr.road) return addr.suburb ? `${addr.road}, ${addr.suburb}` : addr.road
    return null
  } catch {
    return null
  }
}
