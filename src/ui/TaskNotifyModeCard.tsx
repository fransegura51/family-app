import { useEffect, useState } from 'react'
import { getTaskNotifyMode, setTaskNotifyMode } from '@/data/notifications'
import { TASK_NOTIFY_MODE_OPTIONS, type TaskNotifyMode } from '@/domain/notificationPrefs'

// Ajuste FAMILIAR de a quién llegan los avisos de tareas y eventos. Solo lo cambia un administrador familiar (puede haber varios); el resto lo ve de
// solo lectura. Mientras no se elija, siguen los avisos de siempre: la persona asignada y los administradores.
export function TaskNotifyModeCard({ familyId, isAdmin }: { familyId: string; isAdmin: boolean }) {
  const [mode, setMode] = useState<TaskNotifyMode>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getTaskNotifyMode(familyId).then(
      (m) => {
        if (!cancelled) {
          setMode(m)
          setLoaded(true)
        }
      },
      () => {
        if (!cancelled) {
          setError('No he podido cargar este ajuste.')
          setLoaded(true)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [familyId])

  async function choose(next: 'all' | 'assigned') {
    if (!isAdmin || saving || next === mode) return
    setSaving(true)
    setError(null)
    try {
      await setTaskNotifyMode(familyId, next)
      setMode(next)
    } catch {
      setError('No se ha podido guardar. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" data-help-id="notifications.task-mode">
      <h3>🔔 ¿A quién avisamos de tareas y eventos?</h3>
      {!loaded && <p className="muted">Cargando…</p>}
      {loaded && (
        <>
          {mode === null && (
            <p className="muted">
              Ahora mismo los avisos van a la persona asignada y a los administradores (como siempre). {isAdmin ? 'Elige una opción para cambiarlo.' : ''}
            </p>
          )}
          {TASK_NOTIFY_MODE_OPTIONS.map((o) => (
            <label key={o.value} className="checkbox-label">
              <input type="radio" name="task-notify-mode" checked={mode === o.value} disabled={!isAdmin || saving} onChange={() => void choose(o.value)} />
              <span>
                <strong>{o.label}</strong>
                <br />
                <span className="muted">{o.help}</span>
              </span>
            </label>
          ))}
          {!isAdmin && <p className="muted">Solo un administrador de la familia puede cambiar este ajuste.</p>}
          {mode === 'assigned' && (
            <p className="muted">
              En este modo, al crear una tarea o un evento verás la casilla «Aviso a toda la familia» para avisar a todos solo en ese caso.
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  )
}
