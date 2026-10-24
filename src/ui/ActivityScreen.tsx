import { useEffect, useMemo, useState } from 'react'
import { listRecentActivity, resolveRecordNames, type ActivityEntry } from '@/data/activity'
import { describeActivityGroup, groupActivity } from '@/domain/activity'
import { formatDateTime } from '@/domain/dateFormat'

const PAGE = 200

export function ActivityScreen() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listRecentActivity(PAGE)
      .then(async (rows) => {
        const resolved = await resolveRecordNames(rows)
        if (cancelled) return
        setEntries(rows)
        setNames(resolved)
        setHasMore(rows.length === PAGE)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  async function loadMore() {
    const last = entries[entries.length - 1]
    if (!last) return
    setLoadingMore(true)
    try {
      const rows = await listRecentActivity(PAGE, last.createdAt)
      const resolved = await resolveRecordNames(rows)
      setEntries((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))])
      setNames((prev) => new Map([...prev, ...resolved]))
      setHasMore(rows.length === PAGE)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingMore(false)
    }
  }

  const groups = useMemo(() => groupActivity(entries), [entries])

  return (
    <div className="screen">
      <h1>Actividad</h1>
      <p className="muted" data-help-id="actividad.intro">Quién hizo qué y cuándo, para lo más importante. Los cambios seguidos de lo mismo se juntan en una sola línea.</p>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="event-list" data-help-id="actividad.lista">
          {groups.map((g) => (
            <div key={g.key} className="card">
              <p>{describeActivityGroup(g, names)}</p>
              <p className="muted">{g.count > 1 && g.newestAt !== g.oldestAt ? `${formatDateTime(g.oldestAt)} – ${formatDateTime(g.newestAt)}` : formatDateTime(g.newestAt)}</p>
            </div>
          ))}
          {groups.length === 0 && <p className="muted">Todavía no hay actividad registrada.</p>}
          {hasMore && (
            <button type="button" className="link-button" data-help-id="actividad.mas" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Cargando…' : 'Ver más antiguas'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
