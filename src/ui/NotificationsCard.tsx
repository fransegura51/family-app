import { useEffect, useState } from 'react'
import { disablePushNotifications, enablePushNotifications, sendTestPush } from '@/data/push'
import { errorMessage } from '@/domain/errorMessage'
import { getPermissionState, hasPushSubscription, isNotificationsDisabledByUser, type NotificationPermissionState } from '@/services/notifications'

// Petición real: "¿Dónde se activan los recordatorios en la app? No sé dónde se activan... añade un
// botón para activar los avisos desde la aplicación de Pepa, para activarlo o desactivarlo". Antes solo
// había una tarjeta en Inicio que desaparecía para siempre en cuanto el móvil contestaba "Permitir" o
// "Bloquear". Esta es fija, está en Familia, y cada persona la ve y la maneja para SU propio móvil
// (el permiso y el envío de avisos son por dispositivo, no por cuenta).
export function NotificationsCard() {
  const [permission, setPermission] = useState<NotificationPermissionState>(getPermissionState())
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [disabled, setDisabled] = useState(isNotificationsDisabledByUser())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function refresh() {
    setPermission(getPermissionState())
    setDisabled(isNotificationsDisabledByUser())
    hasPushSubscription().then(setSubscribed)
  }

  useEffect(refresh, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(errorMessage(err, 'No se ha podido completar'))
    } finally {
      refresh()
      setBusy(false)
    }
  }

  const active = permission === 'granted' && !disabled && subscribed === true

  return (
    <div className="card member-form">
      <h2>🔔 Avisos en este móvil</h2>

      {permission === 'unsupported' && (
        <p className="muted">
          Este navegador no permite avisos. En iPhone hay que añadir PEPA a la pantalla de inicio (Compartir, Añadir a
          pantalla de inicio) y abrirla desde ahí.
        </p>
      )}

      {permission === 'denied' && (
        <p className="muted">
          Los avisos están bloqueados en este móvil, y la app no puede cambiarlo sola. Para activarlos: Ajustes del móvil,
          Aplicaciones, PEPA, Notificaciones, y permitirlas. Después vuelve aquí.
        </p>
      )}

      {(permission === 'default' || permission === 'granted') && (
        <>
          <p className="muted">
            {active
              ? '✓ Activados. Recibirás los recordatorios y los avisos de llegada y salida, incluso con la app cerrada.'
              : permission === 'granted' && disabled
                ? 'Desactivados en este móvil. No recibirás ningún aviso aquí.'
                : 'Sin activar. Actívalos para recibir los recordatorios y los avisos de llegada y salida, incluso con la app cerrada.'}
          </p>
          {error && <p className="error">{error}</p>}
          {notice && <p className="muted">{notice}</p>}
          <div className="inline-fields">
            {active ? (
              <>
                <button type="button" onClick={() => run(disablePushNotifications)} disabled={busy}>
                  Desactivar avisos
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    run(async () => {
                      await sendTestPush()
                      setNotice('Aviso de prueba enviado. Debería llegarte en unos segundos.')
                    })
                  }
                  disabled={busy}
                >
                  Mandarme un aviso de prueba
                </button>
              </>
            ) : (
              <button type="button" onClick={() => run(async () => void (await enablePushNotifications()))} disabled={busy}>
                {busy ? 'Activando…' : 'Activar avisos'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
