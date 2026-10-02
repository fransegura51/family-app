// Notificaciones del navegador. Dos caminos distintos:
// - showNotification: aviso LOCAL, solo con la app abierta (ReminderWatcher).
// - subscribeToPush (más abajo) + service worker (src/sw.ts): Web Push, el que llega con la app
//   cerrada. Lo mandan las Edge Functions send-due-reminders (calendario, pagos) y
//   send-family-push (llegada/salida de un lugar y avisos de hora diaria, ver migración 0186).

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function getPermissionState(): NotificationPermissionState {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestPermission(): Promise<NotificationPermissionState> {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

// Petición real: "un botón para activar los avisos desde la aplicación... para activarlo o
// desactivarlo". Un navegador no deja revocar el permiso desde la página, así que "desactivar" es una
// preferencia de ESTE móvil (localStorage, igual que el permiso es por dispositivo): se da de baja el
// envío de avisos y, mientras esté marcada, ni PushSubscriptionKeeper vuelve a registrar el móvil al
// abrir la app ni showNotification enseña avisos locales.
const DISABLED_KEY = 'family-app:notifications-disabled'

export function isNotificationsDisabledByUser(): boolean {
  try {
    return localStorage.getItem(DISABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function setNotificationsDisabledByUser(disabled: boolean): void {
  try {
    if (disabled) localStorage.setItem(DISABLED_KEY, '1')
    else localStorage.removeItem(DISABLED_KEY)
  } catch {
    // Sin localStorage no se puede recordar: en el peor caso se vuelve a registrar al abrir la app.
  }
}

// ¿Este móvil está dado de alta para recibir avisos con la app cerrada?
export async function hasPushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const registration = await navigator.serviceWorker.ready
    return (await registration.pushManager.getSubscription()) !== null
  } catch {
    return false
  }
}

// Da de baja este móvil del envío de avisos y devuelve su dirección de envío (para borrarla también del
// servidor), o null si no estaba dado de alta.
export async function unsubscribeFromPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return null
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  return endpoint
}

// Aviso local (app abierta). En Android Chrome `new Notification()` desde la página lanza "Illegal
// constructor" — solo permite mostrarlas a través del service worker — y el error se perdía en
// silencio, así que ahí ni siquiera salía el aviso local. Se usa primero el service worker (vale en
// todas partes) y el constructor solo como reserva. El icono va con la ruta real de la app, no
// "/pwa-192.png": en producción vive bajo "/family-app/".
export function showNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  if (isNotificationsDisabledByUser()) return

  const options = { body, icon: `${import.meta.env.BASE_URL}pwa-192.png` }
  const fallback = () => {
    try {
      new Notification(title, options)
    } catch {
      // Este navegador no permite el constructor y tampoco hay service worker: sin aviso local.
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => registration.showNotification(title, options)).catch(fallback)
    return
  }
  fallback()
}

// VAPID espera la clave pública en base64url; PushManager.subscribe la
// quiere como Uint8Array.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export interface PushSubscriptionData {
  endpoint: string
  p256dh: string
  auth: string
}

// Suscribe este dispositivo a Web Push (recordatorios con la app
// cerrada). Requiere permiso de notificación ya concedido y un service
// worker activo (registrado por vite-plugin-pwa, ver src/sw.ts).
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionData | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // TS's DOM lib is overly strict about ArrayBuffer vs ArrayBufferLike
      // here; the browser accepts a plain Uint8Array at runtime.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
}
