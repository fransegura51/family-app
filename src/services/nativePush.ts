// Avisos NATIVOS (app de Android): el servidor manda por Firebase Cloud Messaging (FCM) en vez de por Web Push, que no existe dentro de la app.
// El móvil se da de alta en la misma tabla de siempre (push_subscriptions) con la dirección «fcm:<token>», así que toda la lógica de a quién se
// avisa, sin repeticiones, no cambia (claim_due_reminders, send-family-push…): solo cambia cómo se entrega (supabase/functions/*/fcm.ts).
// Hace falta el archivo google-services.json de Firebase en el APK; sin él, el registro falla con un aviso y la app sigue como si nada.
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { isNativeApp } from '@/services/nativeApp'

export const FCM_ENDPOINT_PREFIX = 'fcm:'

export type NativePermission = 'default' | 'granted' | 'denied'

let nativeToken: string | null = null
let nativePermission: NativePermission = 'default'
let listenersReady = false

export function fcmEndpoint(token: string): string {
  return `${FCM_ENDPOINT_PREFIX}${token}`
}

export function isFcmEndpoint(endpoint: string): boolean {
  return endpoint.startsWith(FCM_ENDPOINT_PREFIX)
}

export function getNativePushToken(): string | null {
  return nativeToken
}

export function getNativePermission(): NativePermission {
  return nativePermission
}

function mapPermission(receive: string): NativePermission {
  if (receive === 'granted') return 'granted'
  if (receive === 'denied') return 'denied'
  return 'default' // 'prompt' y 'prompt-with-rationale': todavía sin decidir
}

export async function refreshNativePermission(): Promise<NativePermission> {
  try {
    nativePermission = mapPermission((await PushNotifications.checkPermissions()).receive)
  } catch {
    // Sin el plugin disponible se queda como estaba.
  }
  return nativePermission
}

export async function requestNativePermission(): Promise<NativePermission> {
  try {
    nativePermission = mapPermission((await PushNotifications.requestPermissions()).receive)
  } catch {
    // Igual que arriba.
  }
  return nativePermission
}

// Al tocar un aviso se abre PEPA en la pantalla que corresponda («?/calendario» es la forma que index.html descodifica a la ruta real).
function openFromNotification(data: Record<string, unknown> | undefined): void {
  const url = typeof data?.url === 'string' && data.url.startsWith('/') ? data.url : '/calendario'
  window.location.assign(`${import.meta.env.BASE_URL}?${url}`)
}

// Con la app ABIERTA, Android no enseña los avisos de FCM por sí solo: se enseñan como aviso local con el mismo texto.
let localId = 1
async function showForeground(title: string, body: string, data: Record<string, unknown> | undefined): Promise<void> {
  localId = (localId % 2_000_000_000) + 1
  await LocalNotifications.schedule({ notifications: [{ id: localId, title, body, extra: data ?? {} }] })
}

function ensureListeners(onToken: (token: string) => void, onProblem: (message: string) => void): void {
  if (listenersReady) return
  listenersReady = true
  void PushNotifications.addListener('registration', (t) => {
    nativeToken = t.value
    onToken(t.value)
  })
  void PushNotifications.addListener('registrationError', (e) => onProblem(e.error))
  void PushNotifications.addListener('pushNotificationReceived', (n) => {
    void showForeground(n.title ?? 'PEPA', n.body ?? '', n.data as Record<string, unknown> | undefined)
  })
  void PushNotifications.addListener('pushNotificationActionPerformed', (a) => openFromNotification(a.notification.data as Record<string, unknown> | undefined))
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => openFromNotification(a.notification.extra as Record<string, unknown> | undefined))
}

// Canal de notificaciones «Avisos de PEPA» (importancia alta: suena y sale en pantalla, que es lo que se espera de «Paco ha llegado al colegio»).
// El servidor manda los avisos a este canal (FCM_CHANNEL_ID en supabase/functions/*/fcm.ts); en un móvil que todavía no lo tenga, FCM usa su canal
// de reserva y el aviso llega igual, sin ventana emergente.
export const NATIVE_CHANNEL_ID = 'pepa-avisos'
let channelReady = false
export async function ensureNativeChannel(): Promise<void> {
  if (channelReady) return
  try {
    await PushNotifications.createChannel({
      id: NATIVE_CHANNEL_ID,
      name: 'Avisos de PEPA',
      description: 'Llegadas y salidas de la familia, recordatorios y avisos',
      importance: 4,
      visibility: 1,
      vibration: true,
    })
    channelReady = true
  } catch {
    // Sin el complemento (app vieja) o sin permiso todavía: se reintenta al registrar.
  }
}

// Registra ESTE móvil en FCM y avisa del token (que llega por el evento «registration», a veces más de una vez: Firebase lo renueva).
export async function startNativePush(onToken: (token: string) => void, onProblem: (message: string) => void): Promise<void> {
  ensureListeners(onToken, onProblem)
  await ensureNativeChannel()
  await PushNotifications.register()
}

export async function stopNativePush(): Promise<string | null> {
  const token = nativeToken
  nativeToken = null
  try {
    await PushNotifications.unregister()
  } catch {
    // Si ya no estaba registrado no pasa nada.
  }
  return token ? fcmEndpoint(token) : null
}

// Aviso local desde la app nativa (los de «todavía pendiente» y los de reserva), con el permiso de notificaciones de Android.
export async function showNativeNotification(title: string, body: string): Promise<void> {
  await showForeground(title, body, undefined)
}

if (isNativeApp()) {
  void refreshNativePermission()
  void ensureNativeChannel()
}
