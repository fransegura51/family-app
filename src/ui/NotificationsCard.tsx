import { useEffect, useState } from 'react'
import { disablePushNotifications, enablePushNotifications, reportPushProblem, sendTestPush } from '@/data/push'
import { errorMessage } from '@/domain/errorMessage'
import { getPermissionState, hasPushSubscription, isNotificationsDisabledByUser, type NotificationPermissionState } from '@/services/notifications'

// Cada sistema esconde el permiso en un sitio distinto: decir solo "Ajustes del móvil" no basta.
function deniedHelp(): string {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) {
    const installed = window.matchMedia?.('(display-mode: standalone)').matches
    if (installed) {
      return 'En Android: mantén pulsado el icono de PEPA, toca "Información de la aplicación" (la i), Notificaciones, y actívalas.'
    }
    return 'En Chrome: toca el icono a la izquierda de la dirección (el candado o los ajustes), luego Permisos, Notificaciones, y elige Permitir; si no aparece ahí, toca "Restablecer permisos". Otra forma: los tres puntos, Configuración, Configuración de sitios, Notificaciones, y quita el bloqueo a esta página. Para que los avisos funcionen mejor, instala PEPA: los tres puntos, "Instalar aplicación", y ábrela desde su icono.'
  }
  if (/iphone|ipad/i.test(ua)) return 'En iPhone: Ajustes, Notificaciones, PEPA, y activa "Permitir notificaciones".'
  return 'Para activarlos: Ajustes del móvil, Aplicaciones, PEPA, Notificaciones, y permitirlas.'
}

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
  // Chrome (sobre todo en Android) contesta "denegado" SIN llegar a preguntar cuando ya se rechazó o se
  // ignoró la pregunta varias veces para esa página, y mientras tanto Notification.permission sigue
  // diciendo "default": sin esto la tarjeta parecía "sin activar" y el botón no hacía nada visible (caso
  // real: el Android de la familia).
  const [blockedByBrowser, setBlockedByBrowser] = useState(false)

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
      void reportPushProblem('fallo en la tarjeta de avisos', err)
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
          Los avisos están bloqueados en este móvil, y la app no puede cambiarlo sola. {deniedHelp()} Después vuelve aquí y
          toca "Activar avisos".
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
          {blockedByBrowser && permission !== 'granted' && (
            <p className="error">
              El navegador ha bloqueado la pregunta de permiso para esta página (pasa cuando se ha rechazado o ignorado
              varias veces), por eso no te ha preguntado nada. {deniedHelp()} Después recarga la página y toca otra vez
              "Activar avisos".
            </p>
          )}
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
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    const result = await enablePushNotifications()
                    if (result !== 'granted') void reportPushProblem(`activar terminó con permiso=${result}`)
                    setBlockedByBrowser(result === 'denied' && getPermissionState() !== 'denied')
                    if (result === 'default') {
                      setNotice('No has contestado a la pregunta del móvil. Toca otra vez el botón y elige "Permitir".')
                    }
                  })
                }
                disabled={busy}
              >
                {busy ? 'Activando…' : 'Activar avisos'}
              </button>
            )}
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>
        Detalle: permiso {permission}, registrado {subscribed === null ? '…' : subscribed ? 'sí' : 'no'}
        {disabled ? ', desactivado por ti' : ''}
      </p>
    </div>
  )
}
