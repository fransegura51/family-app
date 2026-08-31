import { useEffect, useState } from 'react'
import { listRecentActivity, type ActivityEntry } from '@/data/activity'
import { describeActivity } from '@/domain/activity'

export function ActivityScreen() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRecentActivity()
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="screen">
      <h1>Actividad</h1>
      <p className="muted">Quién hizo qué y cuándo, para lo más importante.</p>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="event-list">
          {entries.map((e) => (
            <div key={e.id} className="card">
              <p>{describeActivity(e)}</p>
              <p className="muted">
                {new Date(e.createdAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          ))}
          {entries.length === 0 && <p className="muted">Todavía no hay actividad registrada.</p>}
        </div>
      )}
    </div>
  )
}
