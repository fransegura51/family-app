import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { linkListToEvent, listsLinkedToEvent, loadListsOverview, unlinkListFromEvent, type LinkedList } from '@/data/lists'
import type { UserList } from '@/domain/lists'
import '@/ui/lists/lists.css'

// «Listas vinculadas» dentro de un evento o tarea del Calendario: discreto, opcional, sin recordatorios propios. Solo se ven (y se
// pueden abrir) las listas a las que esta persona tiene acceso: la privacidad la hace cumplir el servidor, no esta pantalla.
export function LinkedListsSection({ eventId }: { eventId: string }) {
  const [linked, setLinked] = useState<LinkedList[] | null>(null)
  const [picker, setPicker] = useState<UserList[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => listsLinkedToEvent(eventId).then(setLinked, () => setLinked([]))
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const openPicker = async () => {
    setError(null)
    try {
      const o = await loadListsOverview()
      setPicker(o.lists.filter((l) => !l.archivedAt))
    } catch {
      setError('No se han podido cargar tus listas.')
    }
  }
  const link = async (l: UserList) => {
    try {
      await linkListToEvent(l.id, eventId)
      setPicker(null)
      await reload()
    } catch {
      setError('No se ha podido vincular la lista.')
    }
  }
  const unlink = async (l: LinkedList) => {
    try {
      await unlinkListFromEvent(l.id, eventId)
      await reload()
    } catch {
      setError('No se ha podido quitar el vínculo.')
    }
  }

  if (linked === null) return null
  const ids = new Set(linked.map((l) => l.id))
  return (
    <div className="lists-linked-section" data-help-id="calendar.listas-vinculadas">
      <span className="muted">Listas vinculadas</span>
      {linked.map((l) => (
        <span key={l.id} className="lists-linked-chip">
          <Link to={`/listas/${l.id}`}>📝 {l.title}</Link>
          <button type="button" className="link-button" onClick={() => void unlink(l)} aria-label={`Quitar el vínculo con ${l.title}`}>
            ✕
          </button>
        </span>
      ))}
      <button type="button" className="link-button" onClick={() => (picker ? setPicker(null) : void openPicker())} aria-expanded={!!picker}>
        ＋ Vincular lista
      </button>
      {picker && (
        <div className="lists-linked-picker">
          {picker.filter((l) => !ids.has(l.id)).length === 0 && <span className="muted">No tienes más listas que vincular.</span>}
          {picker
            .filter((l) => !ids.has(l.id))
            .map((l) => (
              <button key={l.id} type="button" className="chip" onClick={() => void link(l)}>
                {l.title}
              </button>
            ))}
        </div>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  )
}
