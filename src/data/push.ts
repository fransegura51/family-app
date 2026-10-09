import { supabase } from '@/data/supabaseClient'
import { reportClientError } from '@/data/errorReports'
import { fcmEndpoint, startNativePush } from '@/services/nativePush'
import { isNativeApp } from '@/services/nativeApp'
import {
  getPermissionState,
  requestPermission,
  setNotificationsDisabledByUser,
  subscribeToPush,
  unsubscribeFromPush,
  VAPID_PUBLIC_KEY,
  type NotificationPermissionState,
  type PushSubscriptionData,
} from '@/services/notifications'

// upsert por endpoint: si el dispositivo ya estaba suscrito (p.ej. tras
// desinstalar/reinstalar), evita duplicados en vez de fallar por la
// restricción unique.
export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: userResult.user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

let gestureAtRequest = 'n/d'

// Da de alta ESTE móvil nativo: pide el token a Firebase y lo guarda como «fcm:<token>» en push_subscriptions (misma tabla que Web Push).
// Firebase renueva el token a veces, así que cada token nuevo que llega se vuelve a guardar. Sin google-services.json en el APK falla con el
// motivo, que se anota (client_errors) para verlo desde fuera.
export async function registerNativeDevice(): Promise<void> {
  const saved = new Promise<void>((resolve, reject) => {
    void startNativePush(
      (token) => {
        savePushSubscription({ endpoint: fcmEndpoint(token), p256dh: 'native', auth: 'native' }).then(resolve, reject)
      },
      (message) => reject(new Error(message)),
    ).catch(reject)
  })
  await withTimeout(saved, 15_000, 'Firebase no ha respondido al registrar los avisos de la app.')
}

// Activa los avisos en ESTE móvil: pide el permiso si todavía no se ha decidido, da de alta el envío y
// quita la marca de "desactivado". Lo usan el botón de Familia y la tarjeta de Inicio, para que los dos
// hagan exactamente lo mismo.
//
// Nada falla en silencio: si el permiso está concedido pero el registro no se puede completar, lanza un
// error con la causa (antes, "no hacía nada" y el botón parecía roto). Si el permiso queda denegado o sin
// contestar, devuelve ese estado para que la pantalla lo explique.
export async function enablePushNotifications(): Promise<NotificationPermissionState> {
  setNotificationsDisabledByUser(false)
  if (isNativeApp()) {
    // App nativa: el permiso y el registro son los de Android + Firebase (services/nativePush.ts), no los del navegador.
    const native = await requestPermission()
    if (native !== 'granted') return native
    await registerNativeDevice()
    return native
  }
  let permission = getPermissionState()
  if (permission === 'default') {
    // Chrome solo deja preguntar por los avisos como respuesta a un toque: se anota si en ese instante
    // había "gesto de usuario" activo, para descartarlo (o confirmarlo) cuando un móvil contesta "denegado".
    gestureAtRequest = String((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? 'n/d')
    permission = await requestPermission()
  }
  if (permission !== 'granted') return permission

  if (!VAPID_PUBLIC_KEY) throw new Error('Falta la clave de avisos en esta versión de la app.')
  const subscription = await withTimeout(
    subscribeToPush(VAPID_PUBLIC_KEY),
    12_000,
    'El móvil no ha respondido al registrar los avisos. Cierra la app del todo, ábrela otra vez y vuelve a probar.',
  )
  if (!subscription) {
    throw new Error(
      'Este navegador no puede recibir avisos con la app cerrada. En iPhone hay que abrir PEPA desde su icono en la pantalla de inicio, no desde Safari.',
    )
  }
  await savePushSubscription(subscription)
  return permission
}

// `navigator.serviceWorker.ready` no termina nunca si no hay service worker activo: sin un límite, el
// botón se quedaba en "Activando…" para siempre.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

// Petición real: "Tiene que funcionar los dos teléfonos... en el iPhone funciona, pero en el Android no".
// Un fallo de activación en un móvil concreto no se puede ver desde fuera, así que cada intento que no
// termina bien deja una fila en client_errors (la misma tabla de fallos de siempre) con el estado real
// del navegador: permiso, service worker, suscripción... Sin datos personales, solo ese estado.
async function describePushEnvironment(): Promise<string> {
  const parts = [
    `permiso=${getPermissionState()}`,
    `sw=${'serviceWorker' in navigator}`,
    `pushManager=${'PushManager' in window}`,
    `instalada=${window.matchMedia?.('(display-mode: standalone)').matches ?? 'n/d'}`,
    // Cómo está abierta la ventana (una app instalada y una ventana de Chrome sin barra no se distinguen a
    // simple vista, y el permiso de avisos se comporta distinto en cada una).
    `modo=${['standalone', 'fullscreen', 'minimal-ui', 'browser'].find((m) => window.matchMedia?.(`(display-mode: ${m})`).matches) ?? 'n/d'}`,
    `gestoAlPedir=${gestureAtRequest}`,
  ]
  try {
    const api = await withTimeout(navigator.permissions.query({ name: 'notifications' }), 2000, 'sin respuesta')
    parts.push(`permissionsApi=${api.state}`)
  } catch {
    parts.push('permissionsApi=n/d')
  }
  try {
    const registration = await withTimeout(navigator.serviceWorker.getRegistration(), 3000, 'sin respuesta')
    parts.push(
      `registro=${registration ? (registration.active ? 'activo' : registration.waiting ? 'esperando' : registration.installing ? 'instalando' : 'sin worker') : 'ninguno'}`,
    )
    if (registration) parts.push(`suscripcion=${(await registration.pushManager.getSubscription()) ? 'sí' : 'no'}`)
  } catch (err) {
    parts.push(`registro=error(${err instanceof Error ? err.message : 'desconocido'})`)
  }
  return parts.join(' ')
}

export async function reportPushProblem(context: string, err?: unknown): Promise<void> {
  const cause = err instanceof Error ? `${err.name}: ${err.message}` : err ? String(err) : ''
  await reportClientError(new Error(`[avisos] ${context}${cause ? ` — ${cause}` : ''} | ${await describePushEnvironment()}`))
}

// Desactiva los avisos en ESTE móvil: lo marca (para que no se vuelva a registrar solo al abrir la app),
// lo da de baja del navegador y borra su dirección de envío del servidor. El permiso del navegador no
// se puede revocar desde aquí; no hace falta, sin dirección de envío no se manda nada.
export async function disablePushNotifications(): Promise<void> {
  setNotificationsDisabledByUser(true)
  const endpoint = await unsubscribeFromPush()
  if (!endpoint) return
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

// Manda un aviso real (por el mismo camino que los de verdad) SOLO a los dispositivos de quien lo pide.
export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.rpc('send_test_push_to_me')
  if (error) throw error
}
