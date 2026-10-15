import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SUGGESTION_WINDOW_TEXT, parseSuggestionHours, suggestionEveryLabel, validateWindow, windowSummary } from '@/domain/communityProfile'
import { COMMUNITY_SUGGESTION_MAX_HOURS, COMMUNITY_SUGGESTION_MIN_HOURS, timezoneLabel, type NotificationPrefs } from '@/domain/notificationPrefs'
import '@/ui/community/communityProfile.css'

// Avisos de Comunidad (COM-144): avisos PERSONALES (a cualquier hora o franja propia) y SUGERENCIAS de Comunidad (cadencia propia; siempre entre 08:00 y 21:00).
// Componente compartido: se monta en «Mi perfil» de Comunidad y en Familia → «Horarios de tus avisos» (la «Configuración → Notificaciones» de PEPA). Quien lo monta
// ya ha cargado los ajustes y se ocupa de guardarlos (onSave) y de enseñar «Guardado» o el error; aquí solo se valida lo que escribe la persona.
export function CommunityNoticePrefs({
  prefs,
  onSave,
  showZoneHint = false,
}: {
  prefs: NotificationPrefs
  onSave: (patch: Partial<NotificationPrefs>) => void | Promise<void>
  // En «Mi perfil» se explica dónde se cambia la zona horaria; en Familia ya se está justo encima.
  showZoneHint?: boolean
}) {
  const [start, setStart] = useState(prefs.personalWindowStart)
  const [end, setEnd] = useState(prefs.personalWindowEnd)
  const [hours, setHours] = useState(String(prefs.communitySuggestionEveryHours))
  const [problem, setProblem] = useState<string | null>(null)

  function saveWindow() {
    const p = validateWindow(start, end)
    setProblem(p)
    if (!p) void onSave({ personalCommunityMode: 'window', personalWindowStart: start, personalWindowEnd: end })
  }

  function saveHours() {
    const n = parseSuggestionHours(hours)
    if (n === null) {
      setProblem(`Escribe un número de horas entre ${COMMUNITY_SUGGESTION_MIN_HOURS} y ${COMMUNITY_SUGGESTION_MAX_HOURS}.`)
      return
    }
    setProblem(null)
    void onSave({ communitySuggestionEveryHours: n })
  }

  const hoursNumber = parseSuggestionHours(hours)

  return (
    <>
      <fieldset className="community-notice-group">
        <legend>Avisos personales de Comunidad</legend>
        <p className="muted">Son los avisos sobre conversaciones que sigues, comentarios en tus publicaciones y respuestas a tus comentarios.</p>
        <label className="checkbox-label">
          <input
            type="radio"
            name="personal-mode"
            checked={prefs.personalCommunityMode === 'any'}
            onChange={() => {
              setProblem(null)
              void onSave({ personalCommunityMode: 'any' })
            }}
          />
          A cualquier hora
        </label>
        <label className="checkbox-label">
          <input type="radio" name="personal-mode" checked={prefs.personalCommunityMode === 'window'} onChange={saveWindow} />
          Establecer franja horaria
        </label>
        {prefs.personalCommunityMode === 'window' && (
          <div className="community-window-fields">
            <label>
              Desde
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label>
              Hasta
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <button type="button" onClick={saveWindow}>
              Guardar franja
            </button>
          </div>
        )}
        <p className="muted" aria-live="polite">
          Ahora: {windowSummary(prefs.personalCommunityMode, prefs.personalWindowStart, prefs.personalWindowEnd)}. Las horas son las de tu zona horaria ({timezoneLabel(prefs.timezone)}).
          {showZoneHint && (
            <>
              {' '}
              Si quieres cambiarla, hazlo en <Link to="/familia">Familia</Link>, en «Horarios de tus avisos».
            </>
          )}
        </p>
      </fieldset>

      <fieldset className="community-notice-group">
        <legend>Sugerencias de Comunidad</legend>
        <label className="checkbox-label">
          <input type="checkbox" checked={prefs.communitySuggestionsEnabled} onChange={(e) => void onSave({ communitySuggestionsEnabled: e.target.checked })} />
          Recibir sugerencias de Comunidad («Para ti en Comunidad»)
        </label>
        {prefs.communitySuggestionsEnabled && (
          <>
            <div className="community-window-fields">
              <label>
                Una sugerencia cada (horas)
                <input type="number" inputMode="numeric" min={COMMUNITY_SUGGESTION_MIN_HOURS} max={COMMUNITY_SUGGESTION_MAX_HOURS} value={hours} onChange={(e) => setHours(e.target.value)} />
              </label>
              <button type="button" onClick={saveHours}>
                Guardar
              </button>
            </div>
            <p className="muted">
              Ahora: {suggestionEveryLabel(prefs.communitySuggestionEveryHours)}. Puedes elegir entre {COMMUNITY_SUGGESTION_MIN_HOURS} y {COMMUNITY_SUGGESTION_MAX_HOURS} horas
              {hoursNumber !== null && hoursNumber !== prefs.communitySuggestionEveryHours ? ` (sin guardar: ${suggestionEveryLabel(hoursNumber)})` : ''}.
            </p>
          </>
        )}
        <p className="muted">{SUGGESTION_WINDOW_TEXT} No se acumulan: si pasa la hora, simplemente se salta.</p>
      </fieldset>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </>
  )
}
