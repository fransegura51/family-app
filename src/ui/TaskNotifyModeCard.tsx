import { useEffect, useState } from 'react'
import { getEventNotifyMode, getTaskNotifyMode, setEventNotifyMode, setTaskNotifyMode } from '@/data/notifications'
import { resolveNotifyMode } from '@/domain/eventRecipients'
import { TASK_NOTIFY_MODE_OPTIONS, type TaskNotifyMode } from '@/domain/notificationPrefs'

// Ajuste FAMILIAR de a quién llegan los avisos, SEPARADO para tareas y para eventos (NOT-03). Solo lo cambia un administrador familiar (puede haber varios); el resto lo ve de
// solo lectura. Mientras no se elija: las tareas avisan a quien las tiene asignadas y los eventos a toda la familia activa. «Aviso a toda la familia» de cada tarea o evento
// se sigue respetando, y si lo asignado es un menor sin cuenta avisan siempre los adultos con cuenta.
function ModeChoice({ kind, title, familyId, isAdmin }: { kind: 'task' | 'event'; title: string; familyId: string; isAdmin: boolean }) {
  const [mode, setMode] = useState<TaskNotifyMode>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(kind === 'task' ? getTaskNotifyMode : getEventNotifyMode)(familyId).then(
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
  }, [familyId, kind])

  async function choose(next: 'all' | 'assigned') {
    if (!isAdmin || saving || next === resolveNotifyMode(kind, mode)) return
    setSaving(true)
    setError(null)
    try {
      await (kind === 'task' ? setTaskNotifyMode : setEventNotifyMode)(familyId, next)
      setMode(next)
    } catch {
      setError('No se ha podido guardar. Inténtalo de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const current = resolveNotifyMode(kind, mode)
  return (
    <div data-testid={`notify-mode-${kind}`}>
      <h4>{title}</h4>
      {!loaded && <p className="muted">Cargando…</p>}
      {loaded && (
        <>
          {mode === null && (
            <p className="muted">
              Sin elegir: {kind === 'task' ? 'solo avisan a quien tiene la tarea asignada' : 'avisan a toda la familia activa'}. {isAdmin ? 'Elige una opción para cambiarlo.' : ''}
            </p>
          )}
          {TASK_NOTIFY_MODE_OPTIONS.map((o) => (
            <label key={o.value} className="checkbox-label">
              <input type="radio" name={`${kind}-notify-mode`} checked={current === o.value} disabled={!isAdmin || saving} onChange={() => void choose(o.value)} />
              <span>
                <strong>{o.label}</strong>
                <br />
                <span className="muted">{o.help.replace('tareas y eventos', kind === 'task' ? 'tareas' : 'eventos')}</span>
              </span>
            </label>
          ))}
          {current === 'assigned' && (
            <p className="muted">En este modo, al crear {kind === 'task' ? 'una tarea' : 'un evento'} verás la casilla «Aviso a toda la familia» para avisar a todos solo en ese caso.</p>
          )}
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  )
}

export function TaskNotifyModeCard({ familyId, isAdmin }: { familyId: string; isAdmin: boolean }) {
  return (
    <div className="card" data-help-id="notifications.task-mode">
      <h3>🔔 ¿A quién avisamos de tareas y eventos?</h3>
      <ModeChoice kind="task" title="Avisos de tareas" familyId={familyId} isAdmin={isAdmin} />
      <ModeChoice kind="event" title="Avisos de eventos" familyId={familyId} isAdmin={isAdmin} />
      {!isAdmin && <p className="muted">Solo un administrador de la familia puede cambiar este ajuste.</p>}
    </div>
  )
}
