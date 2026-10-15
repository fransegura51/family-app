// Ubicación con la app NATIVA cerrada: al empezar a compartir, este móvil pide una llave propia (solo sirve para mandar la posición de esta persona,
// ver migración 0253) y se la entrega al servicio nativo (Android: servicio en primer plano; iPhone: cambios significativos de ubicación, que relanzan la app), que cuando la app se cierra sigue mandando la ubicación él solo. Al dejar de
// compartir o cerrar sesión, se anula la llave y se borra la configuración nativa.
//
// Una sola llave por persona: pedir una nueva (otro móvil nativo) anula la anterior. Se pide UNA vez por arranque de la app (no en cada reinicio del
// vigilante), para no gastar llamadas.
import { isNativeApp } from '@/services/nativeApp'

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
  } catch {
    // Una app nativa ANTERIOR a esta función no tiene el servicio nuevo: no se vuelve a pedir llave en cada reinicio del vigilante (cada una es una
    // llamada), hasta el próximo arranque de la app.
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
