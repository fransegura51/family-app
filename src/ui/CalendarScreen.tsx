import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createEvent, deleteEvent, listUpcomingEvents, updateEvent } from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import { eventDotColors, expandOccurrences, getMonthGridDays, MONTH_LABELS, WEEKDAY_LABELS } from '@/domain/calendar'
import {
  REMINDER_PRESETS,
  REMINDER_UNIT_OPTIONS,
  reminderLabel,
  reminderMinutesFrom,
  type ReminderUnit,
} from '@/domain/reminders'
import type { CalendarEvent, FamilyMember } from '@/domain/types'

const RECURRENCE_OPTIONS = [
  { value: '', label: 'No se repite' },
  { value: 'FREQ=DAILY', label: 'Cada día' },
  { value: 'FREQ=WEEKLY', label: 'Cada semana' },
  { value: 'FREQ=MONTHLY', label: 'Cada mes' },
]

const VIEWS = ['Mes', 'Lista'] as const
type ViewMode = (typeof VIEWS)[number]

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [filterMemberId, setFilterMemberId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('Mes')
  const today = useMemo(() => new Date(), [])
  const [visibleYear, setVisibleYear] = useState(today.getFullYear())
  const [visibleMonth, setVisibleMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(toDateStr(today))
  const [dayModalOpen, setDayModalOpen] = useState(false)

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
  const memberColorById = useMemo(() => new Map(members.map((m) => [m.id, m.color])), [members])

  const monthDays = useMemo(() => getMonthGridDays(visibleYear, visibleMonth), [visibleYear, visibleMonth])

  // Un evento recurrente puede caer varias veces dentro de la cuadrícula
  // visible (42 días) — se calcula una vez por render del mes, no por celda.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    if (monthDays.length === 0) return map
    const rangeStart = monthDays[0].dateStr
    const rangeEnd = monthDays[monthDays.length - 1].dateStr
    for (const ev of filteredEvents) {
      for (const dateStr of expandOccurrences(ev, rangeStart, rangeEnd)) {
        const list = map.get(dateStr) ?? []
        list.push(ev)
        map.set(dateStr, list)
      }
    }
    return map
  }, [filteredEvents, monthDays])

  function goToMonth(delta: number) {
    const d = new Date(visibleYear, visibleMonth + delta, 1)
    setVisibleYear(d.getFullYear())
    setVisibleMonth(d.getMonth())
  }

  function goToToday() {
    setVisibleYear(today.getFullYear())
    setVisibleMonth(today.getMonth())
    setSelectedDate(toDateStr(today))
  }

  async function handleDelete(id: string) {
    try {
      await deleteEvent(id)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el evento')
    }
  }

  if (loading) return <div className="screen">Cargando calendario…</div>

  const selectedDayEvents = eventsByDate.get(selectedDate) ?? []

  return (
    <div className="screen">
      <h1>Calendario</h1>
      {error && <p className="error">{error}</p>}

      <div className="filter-row">
        {VIEWS.map((v) => (
          <button key={v} className={'chip' + (view === v ? ' chip-active' : '')} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>

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

      {view === 'Mes' ? (
        <>
          <div className="month-nav">
            <button type="button" className="link-button" onClick={() => goToMonth(-1)}>
              ‹
            </button>
            <strong>
              {MONTH_LABELS[visibleMonth]} {visibleYear}
            </strong>
            <button type="button" className="link-button" onClick={() => goToMonth(1)}>
              ›
            </button>
            <button type="button" className="link-button" onClick={goToToday}>
              Hoy
            </button>
          </div>

          <div className="month-grid">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="month-grid-weekday">
                {w}
              </div>
            ))}
            {monthDays.map((day) => {
              const dayEvents = eventsByDate.get(day.dateStr) ?? []
              const dots = [...new Set(dayEvents.flatMap((e) => eventDotColors(e, memberColorById)))]
              return (
                <button
                  type="button"
                  key={day.dateStr}
                  className={
                    'month-grid-day' +
                    (day.inMonth ? '' : ' month-grid-day-out') +
                    (day.isToday ? ' month-grid-day-today' : '') +
                    (selectedDate === day.dateStr ? ' month-grid-day-selected' : '')
                  }
                  onClick={() => {
                    setSelectedDate(day.dateStr)
                    setDayModalOpen(true)
                  }}
                >
                  <span>{day.day}</span>
                  <span className="month-grid-dots">
                    {dots.slice(0, 4).map((c, i) => (
                      <span key={i} className="month-grid-dot" style={{ background: c }} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          {dayModalOpen && (
            <DayModal
              selectedDate={selectedDate}
              events={selectedDayEvents}
              members={members}
              editingId={editingId}
              onEdit={setEditingId}
              onCancelEdit={() => setEditingId(null)}
              onDelete={handleDelete}
              onEventChanged={() => {
                setEditingId(null)
                reload()
              }}
              onAdded={reload}
              onClose={() => {
                setDayModalOpen(false)
                setEditingId(null)
              }}
            />
          )}
        </>
      ) : (
        <>
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
                <EventCard
                  key={ev.id}
                  event={ev}
                  memberById={memberById}
                  onEdit={() => setEditingId(ev.id)}
                  onDelete={() => handleDelete(ev.id)}
                />
              ),
            )}
            {filteredEvents.length === 0 && <p className="muted">No hay eventos todavía.</p>}
          </div>

          <AddEventForm members={members} onAdded={reload} />
        </>
      )}
    </div>
  )
}

// Ventana emergente al pinchar un día: agrupa lo que hay ese día por
// persona (un evento con varios miembros aparece en cada grupo), para
// verlo de un vistazo sin tener que abrir cada evento — "lo que tienen
// que hacer cada uno ese día".
function DayModal({
  selectedDate,
  events,
  members,
  editingId,
  onEdit,
  onCancelEdit,
  onDelete,
  onEventChanged,
  onAdded,
  onClose,
}: {
  selectedDate: string
  events: CalendarEvent[]
  members: FamilyMember[]
  editingId: string | null
  onEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onEventChanged: () => void
  onAdded: () => void
  onClose: () => void
}) {
  const memberById = new Map(members.map((m) => [m.id, m]))
  const familyEvents = events.filter((ev) => ev.memberIds.length === 0)
  const groups = members
    .map((m) => ({ member: m, events: events.filter((ev) => ev.memberIds.includes(m.id)) }))
    .filter((g) => g.events.length > 0)

  function renderEvent(ev: CalendarEvent) {
    return editingId === ev.id ? (
      <EditEventForm key={ev.id} event={ev} members={members} onDone={onEventChanged} onCancel={onCancelEdit} />
    ) : (
      <EventCard
        key={ev.id}
        event={ev}
        memberById={memberById}
        onEdit={() => onEdit(ev.id)}
        onDelete={() => onDelete(ev.id)}
      />
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {new Date(selectedDate + 'T00:00').toLocaleDateString('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {events.length === 0 && <p className="muted">Nada este día.</p>}

        {groups.map(({ member, events: memberEvents }) => (
          <div key={member.id} className="day-modal-group">
            <h3>
              <span className="avatar avatar-sm" style={{ background: member.color }}>
                {member.name.charAt(0)}
              </span>
              {member.name}
            </h3>
            <div className="event-list">{memberEvents.map(renderEvent)}</div>
          </div>
        ))}

        {familyEvents.length > 0 && (
          <div className="day-modal-group">
            <h3>Toda la familia</h3>
            <div className="event-list">{familyEvents.map(renderEvent)}</div>
          </div>
        )}

        <AddEventForm key={selectedDate} members={members} onAdded={onAdded} defaultDate={selectedDate} />
      </div>
    </div>
  )
}

function EventCard({
  event: ev,
  memberById,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent
  memberById: Map<string, FamilyMember>
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="card event-card" style={{ borderColor: ev.color ?? undefined }}>
      <strong>{ev.title}</strong>
      <p className="muted">
        {new Date(ev.startAt).toLocaleString('es-ES', {
          dateStyle: 'medium',
          timeStyle: ev.allDay ? undefined : 'short',
        })}
        {ev.recurrenceRule && ' · se repite'}
        {ev.reminders.length > 0 && ` · 🔔 ${ev.reminders.map(reminderLabel).join(', ')}`}
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
        <button type="button" className="link-button" onClick={onEdit}>
          Editar
        </button>
        <button type="button" className="link-button" onClick={onDelete}>
          Borrar
        </button>
      </div>
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

// Varios recordatorios por evento, cada uno en la unidad que se quiera
// (minutos/horas/días/semanas/meses/años) — antes solo se podía elegir
// uno de una lista fija de 4 opciones.
function ReminderPicker({ reminders, onChange }: { reminders: number[]; onChange: (next: number[]) => void }) {
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState<ReminderUnit>('horas')

  function addMinutes(minutes: number) {
    if (minutes > 0 && !reminders.includes(minutes)) {
      onChange([...reminders, minutes].sort((a, b) => a - b))
    }
  }

  function addCustom() {
    const n = Number(amount)
    if (!n || n <= 0) return
    addMinutes(reminderMinutesFrom(n, unit))
  }

  function remove(minutes: number) {
    onChange(reminders.filter((m) => m !== minutes))
  }

  return (
    <div>
      <p className="muted">Recordatorios</p>
      {reminders.length > 0 && (
        <div className="filter-row">
          {reminders.map((m) => (
            <button type="button" key={m} className="chip chip-active" onClick={() => remove(m)}>
              🔔 {reminderLabel(m)} ✕
            </button>
          ))}
        </div>
      )}
      <div className="filter-row">
        {REMINDER_PRESETS.map((m) => (
          <button type="button" key={m} className="chip" onClick={() => addMinutes(m)}>
            {reminderLabel(m)}
          </button>
        ))}
      </div>
      <div className="inline-fields">
        <label>
          Cantidad
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Unidad
          <select value={unit} onChange={(e) => setUnit(e.target.value as ReminderUnit)}>
            {REMINDER_UNIT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" className="link-button" onClick={addCustom}>
        + Añadir recordatorio
      </button>
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
  const [reminders, setReminders] = useState<number[]>(event.reminders)
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
        reminders,
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
      <ReminderPicker reminders={reminders} onChange={setReminders} />
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

function AddEventForm({
  members,
  onAdded,
  defaultDate,
}: {
  members: FamilyMember[]
  onAdded: () => void
  defaultDate?: string
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate ?? '')
  const [time, setTime] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [recurrenceRule, setRecurrenceRule] = useState('')
  const [reminders, setReminders] = useState<number[]>([])
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
        reminders,
        memberIds: selectedMembers,
      })
      setTitle('')
      setDate(defaultDate ?? '')
      setTime('')
      setReminders([])
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
      <ReminderPicker reminders={reminders} onChange={setReminders} />
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
