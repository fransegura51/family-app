import { useEffect, useState } from 'react'
import { isFamilyPrefKey } from '@/state/prefs/prefsRegistry'
import { dismissPrefsNotice, recoverRejectedPref, retryPrefsNow, subscribePrefsNotices, type PrefsNotice } from '@/state/prefs/prefsRuntime'

// Avisos discretos de la sincronización de preferencias (CONFIG-01): un cambio sustituido por otro más reciente (con opción de recuperar el propio),
// un fallo al guardar, o un cambio que necesita recargar la app para verse (estilo de color). Nada se descarta en silencio.
export function PrefsNotices() {
  const [notices, setNotices] = useState<PrefsNotice[]>([])
  useEffect(() => subscribePrefsNotices(setNotices), [])
  if (notices.length === 0) return null
  return (
    <div className="prefs-notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className="prefs-notice">
          {n.kind === 'conflict' && (
            <>
              <p>
                {isFamilyPrefKey(n.key)
                  ? `Alguien de tu familia cambió ${n.label} un instante antes que tú. Tu cambio se ha sustituido.`
                  : `Se aplicó un cambio más reciente hecho en otro dispositivo en ${n.label}. Tu cambio en este móvil se ha sustituido.`}
              </p>
              <div className="prefs-notice-actions">
                <button
                  type="button"
                  onClick={() => {
                    recoverRejectedPref(n.key)
                    dismissPrefsNotice(n.id)
                  }}
                >
                  Recuperar el mío
                </button>
                <button type="button" className="link-button" onClick={() => dismissPrefsNotice(n.id)}>
                  Vale
                </button>
              </div>
            </>
          )}
          {n.kind === 'problem' && (
            <>
              <p>{n.message}</p>
              <div className="prefs-notice-actions">
                <button type="button" onClick={retryPrefsNow}>
                  Reintentar ahora
                </button>
                <button type="button" className="link-button" onClick={() => dismissPrefsNotice(n.id)}>
                  Cerrar
                </button>
              </div>
            </>
          )}
          {n.kind === 'reload' && (
            <>
              <p>Has cambiado {n.label} en otro dispositivo. Para verlo aquí hay que recargar PEPA.</p>
              <div className="prefs-notice-actions">
                <button type="button" onClick={() => window.location.reload()}>
                  Aplicar ahora
                </button>
                <button type="button" className="link-button" onClick={() => dismissPrefsNotice(n.id)}>
                  Más tarde
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
