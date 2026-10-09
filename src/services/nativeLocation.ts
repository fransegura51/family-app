// Ubicación con la app NATIVA, también con el móvil bloqueado o la app en segundo plano (plugin @capacitor-community/background-geolocation:
// en Android mantiene un servicio en primer plano con una notificación fija, que es lo que exige el sistema).
// Solo se usa dentro de la app nativa; en el navegador sigue mandando services/geolocation.ts con la API web (que se para al bloquear).
import { registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation')

export interface NativeCoords {
  latitude: number
  longitude: number
}

// Metros mínimos entre dos posiciones: ahorra batería y envíos; los lugares de PEPA miden 150 m, así que 25 sobra para detectar llegadas y salidas.
export const NATIVE_DISTANCE_FILTER_M = 25

export const NATIVE_WATCHER_OPTIONS = {
  backgroundTitle: 'PEPA usa tu ubicación',
  backgroundMessage: 'Para avisar a tu familia cuando llegas a un sitio o te vas.',
  requestPermissions: true,
  stale: false,
  distanceFilter: NATIVE_DISTANCE_FILTER_M,
}

// Android 13+ necesita el permiso de notificaciones para poder enseñar el aviso fijo del servicio de ubicación.
async function ensureNotificationPermission(): Promise<void> {
  try {
    await LocalNotifications.requestPermissions()
  } catch {
    // Sin este permiso el servicio puede no arrancar en Android 13+, pero no debe romper la app.
  }
}

// Mismo contrato que watchPosition de services/geolocation.ts: devuelve la función para parar. Los códigos de error siguen los de la API web
// (1 = permiso denegado), que es lo que espera services/locationSharing.ts.
export function watchNativePosition(onUpdate: (coords: NativeCoords) => void, onError?: (message: string, code: number) => void): () => void {
  let watcherId: string | null = null
  let stopped = false

  void ensureNotificationPermission()
    .then(() =>
      BackgroundGeolocation.addWatcher(NATIVE_WATCHER_OPTIONS, (location, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            onError?.(
              'PEPA no tiene permiso para usar tu ubicación. Actívalo en los ajustes del móvil (Ubicación → Permitir siempre) e inténtalo de nuevo.',
              1,
            )
            void BackgroundGeolocation.openSettings().catch(() => undefined)
          } else {
            onError?.(error.message || 'No se ha podido obtener tu ubicación.', 2)
          }
          return
        }
        if (location) onUpdate({ latitude: location.latitude, longitude: location.longitude })
      }),
    )
    .then((id) => {
      watcherId = id
      // Si se pidió parar mientras se arrancaba, se retira ahora.
      if (stopped) void BackgroundGeolocation.removeWatcher({ id }).catch(() => undefined)
    })
    .catch(() => onError?.('No se ha podido iniciar la ubicación.', 2))

  return () => {
    stopped = true
    if (watcherId !== null) {
      void BackgroundGeolocation.removeWatcher({ id: watcherId }).catch(() => undefined)
      watcherId = null
    }
  }
}
