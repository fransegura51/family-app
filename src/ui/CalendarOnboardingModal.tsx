import { useEffect, useState } from 'react'
import { startGoogleConnect } from '@/data/googleCalendarSync'

// Se enseña UNA vez a cada persona nueva que entra en la app (marcado
// en este móvil, por perfil) — petición real, pensando en cuando se
// venda la app a otras familias: "cuando la persona abra la aplicación
// nueva, que sepa cómo enlazar sus calendarios si quiere". Conectar con
// Google es un solo botón (ver GoogleCalendarSyncCard, en Calendario >
// Externos); enlazar un calendario que NO sea de Google (Outlook,
// Apple/iCloud) sigue necesitando estos pasos a mano, porque esos no
// tienen ninguna API abierta y gratuita como la de Google para hacerlo
// con un solo clic.
function storageKey(profileId: string): string {
  return `familyapp:calendar-onboarding-seen:${profileId}`
}

function alreadySeen(profileId: string): boolean {
  try {
    return localStorage.getItem(storageKey(profileId)) === '1'
  } catch {
    return true
  }
}

function markSeen(profileId: string) {
  try {
    localStorage.setItem(storageKey(profileId), '1')
  } catch {
    // Si falla (privado/incógnito) no pasa nada — se volverá a ver la
    // próxima vez, no es grave.
  }
}

export function CalendarOnboardingModal({ profileId }: { profileId: string }) {
  const [open, setOpen] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!alreadySeen(profileId)) setOpen(true)
  }, [profileId])

  function close() {
    markSeen(profileId)
    setOpen(false)
  }

  async function connect() {
    setConnecting(true)
    setError('')
    markSeen(profileId)
    try {
      await startGoogleConnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setConnecting(false)
    }
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            📅 Enlaza tu calendario
          </h2>
          <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <p className="muted">
          Para que el calendario de la app y el de tu móvil se vean igual en los dos sitios, hace falta enlazarlos
          una vez. Es opcional — puedes hacerlo ahora o más tarde desde Calendario → Externos.
        </p>

        {error && <p className="error">{error}</p>}

        <button type="button" onClick={connect} disabled={connecting}>
          {connecting ? 'Abriendo Google…' : '🔗 Conectar con Google Calendar'}
        </button>
        <p className="muted" style={{ fontSize: 13 }}>
          Un solo permiso: la app crea un calendario "Family App" dentro de tu cuenta de Google y lo mantiene al
          día cada hora, en Android y iPhone (si usas la app de Google Calendar en los dos).
        </p>

        <button type="button" className="link-button" onClick={() => setShowManual((v) => !v)}>
          {showManual ? 'Ocultar instrucciones manuales' : '¿No usas Google Calendar? Ver instrucciones manuales'}
        </button>

        {showManual && (
          <div className="day-modal-group">
            <p>
              <strong>Traer TU calendario (Outlook, Apple/iCloud…) hacia la app:</strong>
            </p>
            <ol style={{ paddingLeft: 18, margin: '4px 0 12px' }}>
              <li>
                Busca en tu calendario la opción de compartir/exportar por dirección secreta en formato iCal — en
                Google Calendar: Ajustes → tu calendario → "Integrar calendario" → "Dirección secreta en formato
                iCal". En Outlook.com: Configuración → Calendario → Calendarios compartidos → Publicar un
                calendario → copia el enlace ICS. En Apple/iCloud (desde un Mac o icloud.com): Calendario → clic
                derecho sobre el calendario → Compartir calendario → Público → copia el enlace y cambia{' '}
                <code>webcal://</code> por <code>https://</code>.
              </li>
              <li>Copia esa dirección.</li>
              <li>
                En la app: Calendario → pestaña Externos → pégala en "Calendarios enlazados" y ponle un nombre.
              </li>
            </ol>
            <p>
              <strong>Llevar el calendario de la APP a tu móvil (sin conectar con Google):</strong>
            </p>
            <ol style={{ paddingLeft: 18, margin: '4px 0 0' }}>
              <li>En la app: Calendario → pestaña Externos → copia el enlace de "Exportar tu calendario al móvil".</li>
              <li>
                Android (Google Calendar): abre la app → Ajustes → "Añadir calendario" → "Desde URL" → pega el
                enlace.
              </li>
              <li>
                iPhone: Ajustes del teléfono → Calendario → Cuentas → Añadir cuenta → Otra → "Añadir calendario
                suscrito" → pega el enlace.
              </li>
              <li>
                Ojo: en este caso es el propio teléfono quien decide cada cuánto lo vuelve a mirar (normalmente una
                vez al día), no se puede forzar a que sea al momento — para eso está conectar con Google arriba.
              </li>
            </ol>
          </div>
        )}

        <button type="button" className="link-button" onClick={close} style={{ marginTop: 12 }}>
          Ahora no
        </button>
      </div>
    </div>
  )
}
