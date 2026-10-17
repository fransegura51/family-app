import { useEffect, useState } from 'react'
import { communityStatus } from '@/data/community'
import { accessFromStatus } from '@/domain/communityAccess'
import { getNotificationPrefs, saveNotificationPrefs } from '@/data/notifications'
import { DEFAULT_NOTIFICATION_PREFS, detectDeviceTimezone, listTimezones, timezoneLabel, type NotificationPrefs } from '@/domain/notificationPrefs'
import { TaskSummaryPrefs } from '@/ui/TaskSummaryPrefs'
import { CommunityNoticePrefs } from '@/ui/community/CommunityNoticePrefs'

// Ajustes de avisos de CADA persona (se guardan en el servidor, así que valen en todos sus dispositivos):
//  · Zona horaria propia (quien ya existía empieza en Europe/Madrid; si el móvil está en otra, se ofrece cambiarla, nunca se cambia sola).
//  · Avisos de tareas (componente TaskSummaryPrefs): resumen de las de hoy (08:00 por defecto) y de las atrasadas (09:00), independientes, cada uno con su interruptor y su hora de 24 h.
//  · Avisos de Comunidad (COM-144: franja de avisos personales y sugerencias): solo si Comunidad es visible; se pregunta UNA vez al abrir la pantalla.
export function NotificationPrefsCard() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({ ...DEFAULT_NOTIFICATION_PREFS })
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [communityVisible, setCommunityVisible] = useState(false)
  const device = detectDeviceTimezone()

  useEffect(() => {
    let cancelled = false
    getNotificationPrefs().then(
      (p) => {
        if (!cancelled) {
          setPrefs(p)
          setLoaded(true)
        }
      },
      () => {
        if (!cancelled) {
          setError('No he podido cargar tus ajustes de avisos.')
          setLoaded(true)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    communityStatus().then(
      (st) => {
        // Los avisos de Comunidad solo se ajustan si se puede participar (con permiso solo de lectura no hay conversaciones propias que avisar).
        if (!cancelled) setCommunityVisible(st.visible && accessFromStatus(st).level === 'participate')
      },
      () => undefined, // sin respuesta: el bloque de Comunidad simplemente no sale
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function save(patch: Partial<NotificationPrefs>) {
    const previous = prefs
    setPrefs({ ...prefs, ...patch })
    setError(null)
    setMessage(null)
    try {
      await saveNotificationPrefs(patch)
      setMessage('Guardado')
    } catch {
      setPrefs(previous)
      setError('No se ha podido guardar. Inténtalo de nuevo.')
    }
  }

  const zones = listTimezones()
  const options = zones.includes(prefs.timezone) ? zones : [prefs.timezone, ...zones]

  return (
    <div className="card">
      <h3>🕗 Horarios de tus avisos</h3>
      {!loaded && <p className="muted">Cargando…</p>}
      {loaded && (
        <>
          <label>
            Tu zona horaria
            <select value={prefs.timezone} onChange={(e) => save({ timezone: e.target.value })}>
              {options.map((z) => (
                <option key={z} value={z}>
                  {timezoneLabel(z)}
                </option>
              ))}
            </select>
          </label>
          {device !== prefs.timezone && (
            <p className="muted">
              Tu móvil está en {timezoneLabel(device)}.{' '}
              <button type="button" className="link-button" onClick={() => save({ timezone: device })}>
                Usar esa zona
              </button>
            </p>
          )}
          <TaskSummaryPrefs prefs={prefs} onSave={save} />
          {communityVisible && (
            <>
              <h4>Avisos de Comunidad</h4>
              <CommunityNoticePrefs prefs={prefs} onSave={save} />
            </>
          )}
          {message && <p className="muted">{message}</p>}
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  )
}
