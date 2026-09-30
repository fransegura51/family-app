// Reconoce el nombre de un sitio a partir de sus coordenadas — petición
// real: "que lo reconozca según las tiendas que haya en los mapas...
// automáticamente". Usa la Places API (New) de Google, buscando el
// sitio más cercano al punto exacto (radio de 25 m), pedida por el servidor
// (services/googleMapsProxy.ts) — ver el comentario grande en services/geocoding.ts. Solo se
// llama cuando alguien se queda parado de verdad en un sitio nuevo (ver
// locationSharing.ts), así que el volumen de peticiones es mínimo. Al
// ser automática (nadie la pide a mano), lleva el freno de
// allowGoogleMapsUse por si un fallo la disparase en bucle.
import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'
import { callGoogleMaps } from '@/services/googleMapsProxy'

export async function reverseGeocodePlaceName(latitude: number, longitude: number): Promise<string | null> {
  if (!allowGoogleMapsUse('search')) return null
  try {
    const data = await callGoogleMaps({ action: 'nearby', latitude, longitude })
    return (data.name as string | null) ?? null
  } catch {
    return null
  }
}
