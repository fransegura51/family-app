// Ubicación con la app NATIVA cerrada: al empezar a compartir, este móvil pide una llave propia (solo sirve para mandar la posición de esta persona,
// ver migración 0253) y se la entrega al servicio nativo (Android: servicio en primer plano; iPhone: cambios significativos de ubicación, que relanzan la app), que cuando la app se cierra sigue mandando la ubicación él solo. Al dejar de
// compartir o cerrar sesión, se anula la llave y se borra la configuración nativa.
//
// Una sola llave por persona: pedir una nueva (otro móvil nativo) anula la anterior. Se pide UNA vez por arranque de la app (no en cada reinicio del
// vigilante), para no gastar llamadas.
import { isIosApp, isNativeApp } from '@/services/nativeApp'
import { placesToNativeRegions } from '@/domain/nativeRegions'

let enabledFor: string | null = null

export async function enableNativeUpload(memberId: string): Promise<void> {
  if (!isNativeApp() || enabledFor === memberId) return
  enabledFor = memberId
  let token: string
  try {
    const { createLocationDeviceToken } = await import('@/data/location')
    token = await createLocationDeviceToken(memberId)
  } catch {
    // Sin llave no hay envío con la app cerrada, pero la ubicación con la app abierta o en segundo plano sigue igual. Se reintentará al volver a empezar.
    enabledFor = null
    return
  }
  try {
    const { configureNativeUpload } = await import('@/services/nativeLocation')
    await configureNativeUpload(token)
    void syncNativeRegions()
    void reportNativeDiagnostics()
  } catch {
    // Una app nativa ANTERIOR a esta función no tiene el servicio nuevo: no se vuelve a pedir llave en cada reinicio del vigilante (cada una es una
    // llamada), hasta el próximo arranque de la app.
  }
}

// Solo iPhone: le pasa al código nativo los lugares con aviso de llegada/salida, para que iOS despierte la app cerrada al cruzar su borde. Se llama al empezar a
// compartir y cada vez que cambian los lugares. Sin lugares, sin app nueva o sin red, no pasa nada: quedan los cambios significativos de ubicación.
export async function syncNativeRegions(): Promise<void> {
  if (!isNativeApp() || !isIosApp()) return
  try {
    const { listPlaces } = await import('@/data/location')
    const regions = placesToNativeRegions(await listPlaces())
    const { configureNativeRegions } = await import('@/services/nativeLocation')
    await configureNativeRegions(regions)
  } catch {
    // Una app anterior a esta función, o sin red: se reintentará en el próximo cambio de lugares o al volver a empezar.
  }
}

export async function disableNativeUpload(): Promise<void> {
  if (!isNativeApp()) return
  enabledFor = null
  try {
    const { clearNativeUpload } = await import('@/services/nativeLocation')
    await clearNativeUpload()
  } catch {
    // Si falla, el servidor lo corta igual en cuanto detecte que ya no se comparte.
  }
  try {
    const { revokeLocationDeviceTokens } = await import('@/data/location')
    await revokeLocationDeviceTokens()
  } catch {
    // Sin red: la llave seguirá existiendo pero solo manda ubicación mientras se comparta; se anula al crear otra.
  }
}

// Sube al servidor lo que anotó el servicio nativo mientras la app estaba cerrada, solo si cuenta algo fuera de lo normal (reinicios, permisos, errores de
// envío). Nunca lanza: es una ayuda para entender por qué se paró, no puede romper nada.
async function reportNativeDiagnostics(): Promise<void> {
  if (isIosApp()) return
  try {
    const [{ takeNativeDiagnostics, hasBackgroundLocationPermission }, { isNotableNativeLog, describeNativeLog }] = await Promise.all([
      import('@/services/nativeLocation'),
      import('@/domain/nativeDiagnostics'),
    ])
    const { log, lastOkAt } = await takeNativeDiagnostics()
    if (!isNotableNativeLog(log)) return
    const { message, detail } = describeNativeLog(log, lastOkAt, await hasBackgroundLocationPermission())
    const error = new Error(message)
    error.stack = detail
    const { reportClientError } = await import('@/data/errorReports')
    await reportClientError(error)
  } catch {
    // Silencio a propósito.
  }
}
