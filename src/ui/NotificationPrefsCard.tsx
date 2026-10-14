import { useEffect, useState } from 'react'
import { getNotificationPrefs, saveNotificationPrefs } from '@/data/notifications'
import {
  DEFAULT_NOTIFICATION_PREFS,
  detectDeviceTimezone,
  isValidTime,
  listTimezones,
  timezoneLabel,
  type NotificationPrefs,
} from '@/domain/notificationPrefs'

// Ajustes de avisos de CADA persona (se guardan en el servidor, así que valen en todos sus dispositivos):
//  · Zona horaria propia (quien ya existía empieza en Europe/Madrid; si el móvil está en otra, se ofrece cambiarla, nunca se cambia sola).
//  · Resumen diario de tareas pendientes y atrasadas: activado por defecto a las 08:00, con hora propia.
export function NotificationPrefsCard() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({ ...DEFAULT_NOTIFICATION_PREFS })
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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
          <label className="checkbox-label">
            <input type="checkbox" checked={prefs.dailySummaryEnabled} onChange={(e) => save({ dailySummaryEnabled: e.target.checked })} />
            Resumen diario de tareas (pendientes de hoy y atrasadas)
          </label>
          {prefs.dailySummaryEnabled && (
            <label>
              Hora del resumen
              <input
                type="time"
                value={prefs.dailySummaryTime}
                onChange={(e) => {
                  if (isValidTime(e.target.value)) void save({ dailySummaryTime: e.target.value })
                }}
              />
            </label>
          )}
          <p className="muted">
            Solo recibes el resumen si tienes tareas pendientes. La hora es la de tu zona horaria y se ajusta sola con los cambios de hora.
          </p>
          {message && <p className="muted">{message}</p>}
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  )
}
