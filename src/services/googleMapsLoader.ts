// Carga el script de Google Maps JavaScript API una sola vez, la
// compartan LocationMap y LocationPickerModal (o cualquier otro mapa
// futuro). Sin librería externa: es un simple <script> con callback,
// tal como recomienda Google. La clave sale de VITE_GOOGLE_MAPS_API_KEY
// (ver .env.example) — sin ella, el mapa no se puede pintar.

let loadPromise: Promise<typeof google> | null = null

export class MissingGoogleMapsKeyError extends Error {
  constructor() {
    super('Falta configurar VITE_GOOGLE_MAPS_API_KEY')
    this.name = 'MissingGoogleMapsKeyError'
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (loadPromise) return loadPromise

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  if (!apiKey) {
    loadPromise = Promise.reject(new MissingGoogleMapsKeyError())
    return loadPromise
  }

  if (typeof window !== 'undefined' && window.google?.maps) {
    loadPromise = Promise.resolve(window.google)
    return loadPromise
  }

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = '__pepaGoogleMapsLoaded'
    ;(window as unknown as Record<string, () => void>)[callbackName] = () => resolve(window.google)

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${callbackName}&language=es&region=ES`
    script.async = true
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'))
    document.head.appendChild(script)
  })

  return loadPromise
}
