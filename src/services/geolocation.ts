// Wrapper fino sobre la Geolocation API del navegador. Nunca se llama
// automáticamente: solo tras una acción explícita del usuario (Skill 23).

export interface Coordinates {
  latitude: number
  longitude: number
}

export function isGeolocationSupported(): boolean {
  return 'geolocation' in navigator
}

export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(new Error('Este dispositivo no soporta geolocalización'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: false, timeout: 10_000 },
    )
  })
}

export function watchPosition(onUpdate: (coords: Coordinates) => void): () => void {
  if (!isGeolocationSupported()) return () => {}
  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
    () => {
      // Fallo silencioso (permiso revocado, GPS apagado…): no interrumpe la app.
    },
    { enableHighAccuracy: false, maximumAge: 60_000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
