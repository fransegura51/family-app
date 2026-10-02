import { useEffect } from 'react'
import { savePushSubscription } from '@/data/push'
import { getPermissionState, subscribeToPush } from '@/services/notifications'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

// Componente sin UI. Petición real: "los avisos... están llegando mucho después... en todos los
// componentes" — un aviso del servidor (Web Push) solo llega a los dispositivos que están dados de
// alta en push_subscriptions, y hasta ahora eso solo pasaba al tocar el botón "Activar recordatorios"
// de Inicio, una vez. Si alguien ya había concedido el permiso pero su móvil nunca llegó a
// registrarse (otro navegador, app reinstalada) o el sistema le cambió la dirección de envío (iOS lo
// hace), los avisos del servidor no le llegaban nunca y solo veía los locales, con la app abierta.
// Aquí, cada vez que se abre la app con el permiso ya concedido, se (re)registra este dispositivo —
// una sola petición por apertura, y no hace nada si el permiso no está concedido (pedirlo sigue
// siendo un gesto explícito de la persona, desde el banner de Inicio).
export function PushSubscriptionKeeper() {
  useEffect(() => {
    if (!VAPID_PUBLIC_KEY || getPermissionState() !== 'granted') return
    subscribeToPush(VAPID_PUBLIC_KEY)
      .then((subscription) => (subscription ? savePushSubscription(subscription) : undefined))
      .catch(() => {
        // Sin red o sin service worker todavía: se reintenta la próxima vez que se abra la app.
      })
  }, [])

  return null
}
