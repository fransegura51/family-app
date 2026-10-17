// Ubicación con la app NATIVA, también con el móvil bloqueado o la app en segundo plano (plugin @capacitor-community/background-geolocation:
// en Android mantiene un servicio en primer plano con una notificación fija, que es lo que exige el sistema).
// Solo se usa dentro de la app nativa; en el navegador sigue mandando services/geolocation.ts con la API web (que se para al bloquear).
import { registerPlugin } from '@capacitor/core'
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { NativeRegion } from '@/domain/nativeRegions'

// Métodos que añade el parche scripts/patch-background-geolocation.mjs (android-patches/background-geolocation): el servicio nativo sigue mandando la
// ubicación al servidor aunque la app esté cerrada, con una llave propia de este móvil (migración 0253).
interface PepaNativeUploadPlugin {
  setNativeUpload(options: { url: string; apikey: string; token: string; backgroundTitle: string; backgroundMessage: string; distanceFilter: number }): Promise<void>
  clearNativeUpload(): Promise<void>
  getBackgroundLocationStatus(): Promise<{ granted: boolean }>
  // Solo iPhone: lista de bordes de lugares (JSON) que iOS vigila aunque la app esté cerrada. Ver domain/nativeRegions.ts.
  setNativeRegions(options: { regionsJson: string }): Promise<void>
  // Solo Android: registro del servicio de ubicación (se entrega una vez). En iPhone o en una app anterior no existe: takeNativeDiagnostics lo captura.
  getNativeDiagnostics(): Promise<{ log?: string; lastOkAt?: number }>
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin & PepaNativeUploadPlugin>('BackgroundGeolocation')

export interface NativeCoords {
  latitude: number
  longitude: number
}

// Metros mínimos entre dos posiciones: ahorra batería y envíos; los lugares de PEPA miden 50 m por defecto (el aviso de salida salta a unos 82 m, ver evaluate_location_rules), así que 25 sobra para detectar llegadas y salidas.
export const NATIVE_DISTANCE_FILTER_M = 25

export const NATIVE_WATCHER_OPTIONS = {
  backgroundTitle: 'PEPA usa tu ubicación',
  backgroundMessage: 'Para avisar a tu familia cuando llegas a un sitio o te vas.',
  requestPermissions: true,
  stale: false,
  distanceFilter: NATIVE_DISTANCE_FILTER_M,
}

// Deja configurado el envío nativo: con la app cerrada, el servicio de Android manda las posiciones él solo con esta llave.
export async function configureNativeUpload(token: string): Promise<void> {
  await BackgroundGeolocation.setNativeUpload({
    url: import.meta.env.VITE_SUPABASE_URL as string,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    token,
    backgroundTitle: NATIVE_WATCHER_OPTIONS.backgroundTitle,
    backgroundMessage: NATIVE_WATCHER_OPTIONS.backgroundMessage,
    distanceFilter: NATIVE_DISTANCE_FILTER_M,
  })
}

export async function clearNativeUpload(): Promise<void> {
  await BackgroundGeolocation.clearNativeUpload()
}

export async function configureNativeRegions(regions: readonly NativeRegion[]): Promise<void> {
  await BackgroundGeolocation.setNativeRegions({ regionsJson: JSON.stringify(regions) })
}

// ¿Tiene la app el permiso de ubicación «Permitir siempre»? Sin él, si Android reinicia el servicio con la app cerrada, se queda sin posición y los
// avisos de llegada no salen hasta abrir PEPA. Una app nativa anterior a esta función no responde: se da por buena para no avisar en falso.
export async function hasBackgroundLocationPermission(): Promise<boolean> {
  try {
    const { granted } = await BackgroundGeolocation.getBackgroundLocationStatus()
    return granted
  } catch {
    return true
  }
}

// Registro que anota el servicio nativo (se entrega una vez y se vacía en el móvil). Una app nativa anterior a esta función no lo tiene: se devuelve vacío.
export async function takeNativeDiagnostics(): Promise<{ log: string; lastOkAt: number }> {
  try {
    const { log, lastOkAt } = await BackgroundGeolocation.getNativeDiagnostics()
    return { log: log ?? '', lastOkAt: lastOkAt ?? 0 }
  } catch {
    return { log: '', lastOkAt: 0 }
  }
}

// Abre los ajustes de PEPA en Android (Permisos → Ubicación → Permitir todo el tiempo).
export async function openLocationSettings(): Promise<void> {
  await BackgroundGeolocation.openSettings()
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
