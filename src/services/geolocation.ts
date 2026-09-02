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
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  })
}

// Antes cualquier fallo (permiso denegado, GPS apagado, sin respuesta)
// se tragaba en silencio — la usuaria pulsaba "Activar" y no pasaba
// nada, sin ningún aviso de por qué (bug real: "le doy a activar y no
// me sale el círculo"). Traduce el código de error del navegador a un
// mensaje que se pueda mostrar.
export function geolocationErrorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return 'Has denegado el permiso de ubicación. Actívalo para este sitio en los ajustes del navegador/teléfono e inténtalo de nuevo.'
    case err.POSITION_UNAVAILABLE:
      return 'El teléfono no ha podido calcular tu posición ahora mismo (¿GPS apagado?). Inténtalo de nuevo en un momento.'
    case err.TIMEOUT:
      return 'Ha tardado demasiado en obtener tu posición. Comprueba que el GPS esté activado e inténtalo de nuevo.'
    default:
      return 'No se ha podido obtener tu ubicación.'
  }
}

export function watchPosition(
  onUpdate: (coords: Coordinates) => void,
  onError?: (message: string, code: number) => void,
): () => void {
  if (!isGeolocationSupported()) {
    onError?.('Este dispositivo no soporta geolocalización.', -1)
    return () => {}
  }
  // Precisión real de GPS (no la ubicación aproximada por wifi/antena) y
  // sin caché: "la ubicación tiene que ser exacta" — con `maximumAge` a
  // 0 nunca se devuelve una posición vieja guardada, siempre se pide una
  // nueva de verdad.
  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
    (err) => onError?.(geolocationErrorMessage(err), err.code),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
