import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createEvent, deleteEvent, listUpcomingEvents, updateEvent } from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import type { CalendarEvent, FamilyMember } from '@/domain/types'

const RECURRENCE_OPTIONS = [
  { value: '', label: 'No se repite' },
  { value: 'FREQ=DAILY', label: 'Cada día' },
  { value: 'FREQ=WEEKLY', label: 'Cada semana' },
  { value: 'FREQ=MONTHLY', label: 'Cada mes' },
]

const REMINDER_OPTIONS = [
  { value: '', label: 'Sin recordatorio' },
  { value: '10', label: '10 min antes' },
  { value: '30', label: '30 min antes' },
  { value: '60', label: '1 hora antes' },
  { value: '1440', label: '1 día antes' },
]

export function CalendarScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [filterMemberId, setFilterMemberId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listUpcomingEvents(), listFamilyMembers()])
      .then(([e, m]) => {
        setEvents(e)
        setMembers(m)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const filteredEvents = useMemo(
    () =>
      filterMemberId === 'all'
        ? events
        : events.filter((e) => e.memberIds.includes(filterMemberId)),
    [events, filterMemberId],
  )

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  async function handleDelete(id: string) {
    try {
      await deleteEvent(id)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el evento')
    }
  }

  if (loading) return <div className="screen">Cargando calendario…</div>

  return (
    <div className="screen">
      <h1>Calendario</h1>
      {error && <p className="error">{error}</p>}

      <div className="filter-row">
        <button
          className={'chip' + (filterMemberId === 'all' ? ' chip-active' : '')}
          onClick={() => setFilterMemberId('all')}
        >
          Todos
        </button>
        {members.map((m) => (
          <button
            key={m.id}
            className={'chip' + (filterMemberId === m.id ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => setFilterMemberId(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="event-list">
        {filteredEvents.map((ev) =>
          editingId === ev.id ? (
            <EditEventForm
              key={ev.id}
              event={ev}
              members={members}
              onDone={() => {
                setEditingId(null)
                reload()
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={ev.id} className="card event-card" style={{ borderColor: ev.color ?? undefined }}>
              <strong>{ev.title}</strong>
              <p className="muted">
                {new Date(ev.startAt).toLocaleString('es-ES', {
                  dateStyle: 'medium',
                  timeStyle: ev.allDay ? undefined : 'short',
                })}
                {ev.recurrenceRule && ' · se repite'}
                {ev.reminderMinutes != null && ` · 🔔 ${ev.reminderMinutes} min antes`}
              </p>
              <div className="member-chips">
                {ev.memberIds.map((id) => {
                  const m = memberById.get(id)
                  if (!m) return null
                  return (
                    <span key={id} className="avatar avatar-sm" style={{ background: m.color }}>
                      {m.name.charAt(0)}
                    </span>
                  )
                })}
              </div>
              <div className="member-card-actions">
                <button type="button" className="link-button" onClick={() => setEditingId(ev.id)}>
                  Editar
                </button>
                <button type="button" className="link-button" onClick={() => handleDelete(ev.id)}>
                  Borrar
                </button>
              </div>
            </div>
          ),
        )}
        {filteredEvents.length === 0 && <p className="muted">No hay eventos todavía.</p>}
      </div>

      <AddEventForm members={members} onAdded={reload} />
    </div>
  )
}

function MemberPicker({
  members,
  selected,
  onToggle,
}: {
  members: FamilyMember[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="filter-row">
      {members.map((m) => (
        <button
          type="button"
          key={m.id}
          className={'chip' + (selected.includes(m.id) ? ' chip-active' : '')}
          style={{ borderColor: m.color }}
          onClick={() => onToggle(m.id)}
        >
          {m.name}
        </button>
      ))}
    </div>
  )
}

function EditEventForm({
  event,
  members,
  onDone,
  onCancel,
}: {
  event: CalendarEvent
  members: FamilyMember[]
  onDone: () => void
  onCancel: () => void
}) {
  const start = new Date(event.startAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const [title, setTitle] = useState(event.title)
  // Componentes en hora LOCAL del navegador, no UTC: new Date(...).toISOString()
  // desplazaría la hora mostrada según el huso horario (bug real detectado al probar).
  const [date, setDate] = useState(
    `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
  )
  const [time, setTime] = useState(
    event.allDay ? '' : `${pad(start.getHours())}:${pad(start.getMinutes())}`,
  )
  const [allDay, setAllDay] = useState(event.allDay)
  const [recurrenceRule, setRecurrenceRule] = useState(event.recurrenceRule ?? '')
  const [reminderMinutes, setReminderMinutes] = useState(
    event.reminderMinutes != null ? String(event.reminderMinutes) : '',
  )
  const [selectedMembers, setSelectedMembers] = useState<string[]>(event.memberIds)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleMember(id: string) {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const startAt = new Date(`${date}T${allDay ? '00:00' : time || '00:00'}`).toISOString()
      await updateEvent(event.id, {
        title,
        startAt,
        allDay,
        recurrenceRule: recurrenceRule || null,
        reminderMinutes: reminderMinutes ? Number(reminderMinutes) : null,
        memberIds: selectedMembers,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el evento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {!allDay && (
        <label>
          Hora
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      )}
      <label className="checkbox-label">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        Todo el día
      </label>
      <label>
        Repetir
        <select value={recurrenceRule} onChange={(e) => setRecurrenceRule(e.target.value)}>
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Recordatorio
        <select value={reminderMinutes} onChange={(e) => setReminderMinutes(e.target.value)}>
          {REMINDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="muted">¿Para quién?</p>
        <MemberPicker members={members} selected={selectedMembers} onToggle={toggleMember} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

function AddEventForm({ members, onAdded }: { members: FamilyMember[]; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState('')
  const [reminderMinutes, setReminderMinutes] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function toggleMember(id: string) {
    setSelectedMembers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!date) return
    setSaving(true)
    setError(null)
    try {
      const startAt = new Date(`${date}T${allDay ? '00:00' : time || '00:00'}`).toISOString()
      await createEvent({
        title,
        startAt,
        allDay,
        recurrenceRule: recurrenceRule || null,
        reminderMinutes: reminderMinutes ? Number(reminderMinutes) : null,
        memberIds: selectedMembers,
      })
      setTitle('')
      setDate('')
      setTime('')
      setReminderMinutes('')
      setSelectedMembers([])
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el evento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo evento</h2>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {!allDay && (
        <label>
          Hora
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      )}
      <label className="checkbox-label">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        Todo el día
      </label>
      <label>
        Repetir
        <select value={recurrenceRule} onChange={(e) => setRecurrenceRule(e.target.value)}>
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Recordatorio
        <select value={reminderMinutes} onChange={(e) => setReminderMinutes(e.target.value)}>
          {REMINDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="muted">¿Para quién?</p>
        <MemberPicker members={members} selected={selectedMembers} onToggle={toggleMember} />
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear evento'}
      </button>
    </form>
  )
}
