import { isNativeApp } from '@/services/nativeApp'
import { watchNativePosition } from '@/services/nativeLocation'

// Wrapper fino sobre la Geolocation API del navegador. Nunca se llama
// automáticamente: solo tras una acción explícita del usuario (Skill 23).

export interface Coordinates {
  latitude: number
  longitude: number
  // Velocidad en m/s si el móvil la da (una posición de red no la trae): el filtro de saltos de GPS (domain/gpsJump.ts) la usa como prueba de movimiento real.
  speed?: number | null
}

export function isGeolocationSupported(): boolean {
  return 'geolocation' in navigator
}

function readPositionOnce(options: PositionOptions): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      options,
    )
  })
}

// Primero se intenta con GPS (10 s). Dentro de casa o justo al abrir, el GPS puede tardar más: en un Samsung real salía «Timeout expired» (en inglés y
// sin más intentos). Si no hay GPS a tiempo, se acepta una posición aproximada (wifi/antena) o una de hace menos de 2 minutos, que para «dónde estoy»
// y «guardar este sitio» sirve de sobra. Los errores salen en español (geolocationErrorMessage).
export async function getCurrentPosition(): Promise<Coordinates> {
  if (!isGeolocationSupported()) throw new Error('Este dispositivo no soporta geolocalización')
  try {
    return await readPositionOnce({ enableHighAccuracy: true, timeout: 10_000 })
  } catch (first) {
    const firstError = first as GeolocationPositionError
    // Permiso denegado: otro intento no cambia nada.
    if (firstError.code === firstError.PERMISSION_DENIED) throw new Error(geolocationErrorMessage(firstError))
    try {
      return await readPositionOnce({ enableHighAccuracy: false, timeout: 15_000, maximumAge: 120_000 })
    } catch (second) {
      throw new Error(geolocationErrorMessage(second as GeolocationPositionError))
    }
  }
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
  // Dentro de la app nativa, la ubicación sigue con el móvil bloqueado (la API web del navegador se para al bloquear).
  if (isNativeApp()) return watchNativePosition(onUpdate, onError)
  if (!isGeolocationSupported()) {
    onError?.('Este dispositivo no soporta geolocalización.', -1)
    return () => {}
  }
  // Precisión real de GPS (no la ubicación aproximada por wifi/antena):
  // enableHighAccuracy. OJO con maximumAge: se probó a 0 (nunca aceptar
  // nada cacheado, ni un segundo) pensando que así sería "más exacto",
  // pero es justo lo que hacía que el watch dejara de avisar después
  // del primer aviso aunque siguiera "activo" por dentro — pedirle al
  // GPS un cálculo completo desde cero en cada lectura, sin dejarle
  // fluir en modo continuo, es una causa conocida de que se quede
  // colgado en Android/iOS (bug real: solo se actualizaba al desactivar
  // y volver a activar a mano). Con un margen pequeño (5s) sigue siendo
  // prácticamente al segundo pero deja que el proveedor de ubicación
  // funcione en su modo normal, continuo y fiable.
  const id = navigator.geolocation.watchPosition(
    (pos) => onUpdate({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, speed: pos.coords.speed }),
    (err) => onError?.(geolocationErrorMessage(err), err.code),
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
  )
  return () => navigator.geolocation.clearWatch(id)
}
