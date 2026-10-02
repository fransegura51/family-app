import { supabase } from '@/data/supabaseClient'
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

// Activa los avisos en ESTE móvil: pide el permiso si todavía no se ha decidido, da de alta el envío y
// quita la marca de "desactivado". Lo usan el botón de Familia y la tarjeta de Inicio, para que los dos
// hagan exactamente lo mismo.
//
// Nada falla en silencio: si el permiso está concedido pero el registro no se puede completar, lanza un
// error con la causa (antes, "no hacía nada" y el botón parecía roto). Si el permiso queda denegado o sin
// contestar, devuelve ese estado para que la pantalla lo explique.
export async function enablePushNotifications(): Promise<NotificationPermissionState> {
  setNotificationsDisabledByUser(false)
  let permission = getPermissionState()
  if (permission === 'default') permission = await requestPermission()
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
