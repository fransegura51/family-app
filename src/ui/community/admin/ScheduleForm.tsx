import { useId, useState } from 'react'
import { formatMadridAt, madridDay, parseScheduleInput } from '@/domain/communityEditorial'

// ¿Devolvió «aprobar» un artículo PROGRAMADO (no publicado)? Con su instante de publicación.
export function isScheduled(result: unknown): boolean {
  return typeof result === 'object' && result !== null && (result as { scheduled?: unknown }).scheduled === true && typeof (result as { publishAt?: unknown }).publishAt === 'string'
}

export function publishAtOf(result: unknown): string {
  return String((result as { publishAt?: unknown }).publishAt ?? '')
}

// Reprogramar un artículo ya aprobado y sin publicar: día y hora de Madrid (entre ahora y 60 días). No publica nada: solo cambia cuándo saldrá.
export function ScheduleForm({ current, busy, error, onSave, onCancel }: { current: string; busy: boolean; error: string | null; onSave: (iso: string) => void; onCancel: () => void }) {
  const id = useId()
  const [date, setDate] = useState(madridDay(current) ?? '')
  const [time, setTime] = useState('10:00')
  const [problem, setProblem] = useState<string | null>(null)
  return (
    <form
      className="cadm-noteform"
      onSubmit={(e) => {
        e.preventDefault()
        const r = parseScheduleInput(date, time)
        setProblem(r.ok ? null : r.message)
        if (r.ok) onSave(r.iso)
      }}
    >
      <p className="cadm-noteform-title">Reprogramar la publicación</p>
      <p className="muted cadm-small">
        Ahora está programado para el {formatMadridAt(current)} (hora de Madrid). Elige otro día y hora; solo se puede dentro de los próximos 60 días. Esto no lo publica: solo cambia cuándo saldrá.
      </p>
      <label htmlFor={`${id}-date`}>Día</label>
      <input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <label htmlFor={`${id}-time`}>Hora (hora de Madrid)</label>
      <input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      {(problem || error) && (
        <p className="error cadm-small" role="alert">
          {problem ?? error}
        </p>
      )}
      <div className="cadm-actions">
        <button type="submit" className="cadm-btn cadm-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar la nueva hora'}
        </button>
        <button type="button" className="cadm-btn cadm-btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
