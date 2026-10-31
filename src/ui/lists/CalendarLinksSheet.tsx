import { useCallback, useEffect, useMemo, useState } from 'react'
import { eventsLinkedToList, linkListToEvent, unlinkListFromEvent } from '@/data/lists'
import { listUpcomingEvents } from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import { eventPeopleLabel, matchesEventQuery, type UserList } from '@/domain/lists'

// Vincular una lista a eventos o tareas del Calendario (opcional, varios a varios). No crea recordatorios: el Calendario tiene los suyos.
type CalendarEvent = Awaited<ReturnType<typeof listUpcomingEvents>>[number]
const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

export function CalendarLinksSheet({ list, onClose }: { list: UserList; onClose: () => void }) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [linked, setLinked] = useState<Set<string>>(new Set())
  const [members, setMembers] = useState<{ id: string; name: string }[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [ev, ids] = await Promise.all([listUpcomingEvents(), eventsLinkedToList(list.id)])
        // Un mismo registro nunca sale dos veces (por id); dos eventos distintos con el mismo título se conservan.
        setEvents([...new Map(ev.map((e) => [e.id, e])).values()])
        setLinked(new Set(ids))
        // Los nombres solo se enseñan si se han podido leer los asignados reales; si falla, no se adivina nada.
        listFamilyMembers().then((m) => setMembers(m.map((x) => ({ id: x.id, name: x.name }))), () => setMembers(null))
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

  const peopleOf = useCallback((e: CalendarEvent) => (members ? eventPeopleLabel(e.memberIds, members) : ''), [members])
  const shown = useMemo(() => {
    if (!events) return []
    const now = Date.now() - 24 * 3600 * 1000
    // Siempre se enseñan los ya vinculados (aunque hayan pasado) para poder quitarlos; del resto, lo próximo.
    return events.filter((e) => linked.has(e.id) || e.recurrenceRule || new Date(e.startAt).getTime() >= now).filter((e) => !query.trim() || matchesEventQuery(e.title, peopleOf(e), query)).slice(0, 80)
  }, [events, linked, query, peopleOf])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="Vincular con el Calendario" onClick={(e) => e.stopPropagation()}>
        <h3>Calendario · «{list.title}»</h3>
        <p className="muted">Elige los eventos o tareas a los que pertenece esta lista. Aparecerá en ellos como «Listas vinculadas».</p>
        <input type="search" className="lists-input" placeholder="Buscar por título o por persona" aria-label="Buscar evento o tarea" value={query} onChange={(e) => setQuery(e.target.value)} />
        {error && <p className="error">{error}</p>}
        {events === null && <p className="muted">Cargando…</p>}
        <div className="lists-links">
          {shown.map((e) => (
            <label key={e.id} className="lists-link-row">
              <input type="checkbox" checked={linked.has(e.id)} disabled={busy === e.id} onChange={() => void toggle(e)} />
              <span>
                {e.kind === 'task' ? '☑️' : '📅'} {e.title}
                {peopleOf(e) && <> ({peopleOf(e)})</>}
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
