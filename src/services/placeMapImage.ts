// Imagen de un lugar para compartirla (por ejemplo, por WhatsApp) —
// Static Maps API (Google). Se descarga como archivo y se comparte con
// el menú nativo del teléfono (ver services/share.ts): compartir la URL
// directamente no valdría, porque la clave está restringida a nuestro
// propio sitio web y quien la reciba no podría abrirla. Gratis hasta
// 10.000 al mes. Necesita VITE_GOOGLE_MAPS_API_KEY (ver .env.example).

import { allowGoogleMapsUse } from '@/services/googleMapsUsageGuard'

// Antes devolvía solo `File | null`, así que un fallo por CUALQUIER motivo (sin clave, freno de
// seguridad de uso diario ya gastado, sin red...) enseñaba siempre el mismo aviso genérico — bug
// real reportado: "sigue sin funcionar" tras varias pruebas seguidas en el mismo teléfono, que en
// realidad ya habían agotado el freno diario de esta función (15 al día por dispositivo,
// googleMapsUsageGuard.ts) sin que se notara la diferencia con un fallo real.
export type PlaceMapImageResult = { ok: true; file: File } | { ok: false; reason: 'missing-key' | 'daily-limit' | 'network' }

export async function fetchPlaceMapImage(latitude: number, longitude: number, label: string): Promise<PlaceMapImageResult> {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!apiKey) return { ok: false, reason: 'missing-key' }
  if (!allowGoogleMapsUse('share')) return { ok: false, reason: 'daily-limit' }
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
    if (!res.ok) return { ok: false, reason: 'network' }
    const blob = await res.blob()
    const safeName = (label || 'ubicacion').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    return { ok: true, file: new File([blob], `${safeName || 'ubicacion'}.png`, { type: blob.type || 'image/png' }) }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
