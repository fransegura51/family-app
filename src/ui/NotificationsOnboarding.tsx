import { useState } from 'react'
import { enablePushNotifications, reportPushProblem, sendTestPush } from '@/data/push'
import { errorMessage } from '@/domain/errorMessage'
import { getPermissionState, isIos, isNotificationsDisabledByUser } from '@/services/notifications'
import { StepsList } from '@/ui/notificationHelp'

// Primer arranque de los avisos, en Inicio. Petición real: "cuando otra familia se instale la app tiene
// que funcionar a la primera" — con el Android de Paco hubo que entrar en los ajustes de Chrome a
// restablecer permisos, algo que ninguna familia va a hacer. Lo que lo provocó, y lo que se evita aquí:
//
// - Chrome castiga la pregunta de permiso que se ignora o se rechaza varias veces (la deja "denegada"
//   sin preguntar durante días). Por eso aquí NO se le pregunta al navegador hasta que la persona toca
//   "Activar avisos" de forma consciente, tras leer para qué sirve; "Ahora no" no toca el navegador y
//   solo esconde la tarjeta una semana, sin gastar ninguna de sus oportunidades.
// - En iPhone, abierta en una pestaña de Safari, la app NO puede recibir avisos (hay que instalarla en
//   la pantalla de inicio). Antes la tarjeta desaparecía sin decir nada: ahora lo explica ANTES de
//   intentar nada.
// - Si el navegador se niega aun así, se enseña la ayuda con los pasos (la misma que Familia), no un
//   botón que parece roto.
// - Al conseguirlo se manda un aviso de prueba real, para que la persona vea que llega en vez de creerlo.
const DISMISSED_KEY = 'family-app:notifications-onboarding-dismissed-at'
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY))
    return at > 0 && Date.now() - at < DISMISS_FOR_MS
  } catch {
    return false
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()))
  } catch {
    // Sin localStorage la tarjeta volverá a salir al reabrir: molesta, no rompe nada.
  }
}

type Stage = 'ask' | 'done' | 'blocked' | 'closed'

export function NotificationsOnboarding() {
  const [permission, setPermission] = useState(getPermissionState())
  const [dismissed, setDismissed] = useState(recentlyDismissed())
  const [stage, setStage] = useState<Stage>('ask')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function dismiss() {
    rememberDismissed()
    setDismissed(true)
    setStage('closed')
  }

  async function activate() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await enablePushNotifications()
      setPermission(getPermissionState())
      if (result === 'granted') {
        setStage('done')
        // Prueba real de punta a punta (por el mismo camino que los avisos de verdad). Si falla no pasa
        // nada: la tarjeta de Familia tiene el botón para repetirla y explicar qué mirar.
        void sendTestPush().catch(() => {})
      } else if (result === 'denied') {
        setStage('blocked')
        void reportPushProblem('primer arranque terminó con permiso=denied')
      } else if (result === 'default') {
        setNotice('No has contestado a la pregunta del móvil. Si quieres los avisos, toca otra vez el botón y elige "Permitir".')
      }
    } catch (err) {
      setError(errorMessage(err, 'No se han podido activar los avisos'))
      void reportPushProblem('fallo en el primer arranque de avisos', err)
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'closed' || isNotificationsDisabledByUser()) return null

  if (stage === 'done') {
    return (
      <div className="card banner">
        <p>
          ✓ Avisos activados en este móvil. Te acabamos de mandar un aviso de prueba: debería llegarte en unos segundos. Si
          no lo ves, entra en Familia, "Avisos en este móvil".
        </p>
        <button type="button" onClick={() => setStage('closed')}>
          Entendido
        </button>
      </div>
    )
  }

  if (stage === 'blocked') {
    return (
      <div className="card banner">
        <p className="error">
          El navegador no ha dejado activar los avisos (pasa cuando antes se ha rechazado o ignorado la pregunta). Para
          arreglarlo:
        </p>
        <StepsList />
        <button type="button" className="link-button" onClick={dismiss}>
          Más tarde
        </button>
      </div>
    )
  }

  // iPhone en una pestaña de Safari: todavía no se puede. Se explica antes de intentar nada.
  if (permission === 'unsupported') {
    if (!isIos() || dismissed) return null
    return (
      <div className="card banner">
        <p>
          Para recibir avisos en el iPhone, primero hay que instalar PEPA: toca el botón Compartir (el cuadrado con la flecha
          hacia arriba), elige "Añadir a pantalla de inicio" y abre PEPA desde su nuevo icono. Después podrás activar los
          avisos desde aquí.
        </p>
        <button type="button" className="link-button" onClick={dismiss}>
          Entendido
        </button>
      </div>
    )
  }

  if (permission !== 'default' || dismissed) return null

  return (
    <div className="card banner">
      <p>
        Activa los avisos para recibir los recordatorios del calendario y saber cuándo llega o se va alguien de casa,
        incluso con la app cerrada.
      </p>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted">{notice}</p>}
      <div className="inline-fields">
        <button type="button" onClick={activate} disabled={busy}>
          {busy ? 'Activando…' : 'Activar avisos'}
        </button>
        <button type="button" className="link-button" onClick={dismiss} disabled={busy}>
          Ahora no
        </button>
      </div>
    </div>
  )
}
