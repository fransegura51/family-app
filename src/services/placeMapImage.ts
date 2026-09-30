// Imagen de un lugar para compartirla (por ejemplo, por WhatsApp) —
// Static Maps API (Google). Se descarga como archivo y se comparte con
// el menú nativo del teléfono (ver services/share.ts): compartir la URL
// directamente no valdría, porque la clave está restringida a nuestro
// propio sitio web y quien la reciba no podría abrirla. Gratis hasta
// 10.000 al mes. Necesita VITE_GOOGLE_MAPS_API_KEY (ver .env.example).

import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'

export async function fetchPlaceMapImage(latitude: number, longitude: number, label: string): Promise<File | null> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!apiKey) return null
  if (!allowGoogleMapsUse('share')) return null
  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: '16',
    size: '640x400',
    scale: '2',
    markers: `color:red|${latitude},${longitude}`,
    key: apiKey,
  })
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`)
    if (!res.ok) return null
    const blob = await res.blob()
    const safeName = (label || 'ubicacion').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    return new File([blob], `${safeName || 'ubicacion'}.png`, { type: blob.type || 'image/png' })
  } catch {
    return null
  }
}
