// Notificaciones del navegador (Web Notifications API). Gratis, sin
// backend adicional. Límite conocido: solo se disparan con la pestaña
// abierta (activa o en segundo plano) — no con la app totalmente cerrada.
// Eso requeriría Web Push + service worker + servidor de envío, fuera de
// alcance por ahora (se puede añadir después si hace falta).

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export function getPermissionState(): NotificationPermissionState {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestPermission(): Promise<NotificationPermissionState> {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

export function showNotification(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  // eslint-disable-next-line no-new
  new Notification(title, { body, icon: '/pwa-192.png' })
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
