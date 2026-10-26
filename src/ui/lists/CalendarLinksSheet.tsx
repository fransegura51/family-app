import { useEffect, useMemo, useState } from 'react'
import { eventsLinkedToList, linkListToEvent, unlinkListFromEvent } from '@/data/lists'
import { listUpcomingEvents } from '@/data/calendar'
import { matchesQuery, type UserList } from '@/domain/lists'

// Vincular una lista a eventos o tareas del Calendario (opcional, varios a varios). No crea recordatorios: el Calendario tiene los suyos.
type CalendarEvent = Awaited<ReturnType<typeof listUpcomingEvents>>[number]
const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

export function CalendarLinksSheet({ list, onClose }: { list: UserList; onClose: () => void }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [linked, setLinked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [ev, ids] = await Promise.all([listUpcomingEvents(), eventsLinkedToList(list.id)])
        setEvents(ev)
        setLinked(new Set(ids))
      } catch {
        setError('No se ha podido cargar el Calendario.')
        setEvents([])
      }
    })()
  }, [list.id])

  const toggle = async (e: CalendarEvent) => {
    if (busy) return
    setBusy(e.id)
    setError(null)
    try {
      if (linked.has(e.id)) await unlinkListFromEvent(list.id, e.id)
      else await linkListToEvent(list.id, e.id)
      setLinked((prev) => {
        const n = new Set(prev)
        if (n.has(e.id)) n.delete(e.id)
        else n.add(e.id)
        return n
      })
    } catch {
      setError('No se ha podido cambiar el vínculo. Inténtalo de nuevo.')
    } finally {
      setBusy(null)
    }
  }

  const shown = useMemo(() => {
    if (!events) return []
    const now = Date.now() - 24 * 3600 * 1000
    // Siempre se enseñan los ya vinculados (aunque hayan pasado) para poder quitarlos; del resto, lo próximo.
    return events.filter((e) => linked.has(e.id) || e.recurrenceRule || new Date(e.startAt).getTime() >= now).filter((e) => !query.trim() || matchesQuery(e.title, query)).slice(0, 80)
  }, [events, linked, query])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="Vincular con el Calendario" onClick={(e) => e.stopPropagation()}>
        <h3>Calendario · «{list.title}»</h3>
        <p className="muted">Elige los eventos o tareas a los que pertenece esta lista. Aparecerá en ellos como «Listas vinculadas».</p>
        <input type="search" className="lists-input" placeholder="Buscar evento o tarea" aria-label="Buscar evento o tarea" value={query} onChange={(e) => setQuery(e.target.value)} />
        {error && <p className="error">{error}</p>}
        {events === null && <p className="muted">Cargando…</p>}
        <div className="lists-links">
          {shown.map((e) => (
            <label key={e.id} className="lists-link-row">
              <input type="checkbox" checked={linked.has(e.id)} disabled={busy === e.id} onChange={() => void toggle(e)} />
              <span>
                {e.kind === 'task' ? '☑️' : '📅'} {e.title}
                <span className="muted"> · {fmt(e.startAt)}</span>
              </span>
            </label>
          ))}
          {events && shown.length === 0 && <p className="muted">No hay eventos ni tareas que mostrar.</p>}
        </div>
        <div className="form-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
