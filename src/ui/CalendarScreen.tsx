import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createEvent, deleteEvent, deleteEventOccurrence, listUpcomingEvents, updateEvent } from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import { listCompletions, listTasks } from '@/data/tasks'
import { isTaskDueOn } from '@/domain/tasks'
import {
  addFeed,
  deleteFeed,
  listExternalEvents,
  listFeeds,
  listHolidayDates,
  syncFeed,
  type ExternalCalendarEvent,
  type ExternalCalendarFeed,
} from '@/data/externalCalendarFeeds'
import { eventDotColors, expandOccurrences, getMonthGridDays, MONTH_LABELS, WEEKDAY_LABELS } from '@/domain/calendar'
import {
  REMINDER_PRESETS,
  REMINDER_UNIT_OPTIONS,
  reminderLabel,
  reminderMinutesFrom,
  type EventReminder,
  type ReminderAnchor,
  type ReminderUnit,
} from '@/domain/reminders'
import type { CalendarEvent, FamilyMember, Task, TaskCompletion } from '@/domain/types'
import { setSelectedCalendarDate } from '@/state/calendarSelection'
import {
  buildRecurrenceRule,
  FREQ_OPTIONS,
  matchRecurrencePreset,
  parseRecurrenceRule,
  RECURRENCE_PRESETS,
  recurrenceLabel,
  type RecurrencePreset,
} from '@/domain/recurrence'
import { WeekdayPicker } from '@/ui/WeekdayPicker'

const VIEWS = ['Mes', 'Lista', 'Externos'] as const
type ViewMode = (typeof VIEWS)[number]

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [completions, setCompletions] = useState<TaskCompletion[]>([])
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
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set())

  // Publica qué día tienes abierto para que "Apunta por voz" (vive fuera
  // de esta pantalla) lo use como fecha por defecto en vez de caer
  // siempre en hoy cuando no dices ninguna fecha — se limpia al cerrar
  // la ventana del día o al salir de Calendario.
  useEffect(() => {
    setSelectedCalendarDate(dayModalOpen ? selectedDate : null)
    return () => setSelectedCalendarDate(null)
  }, [dayModalOpen, selectedDate])

  function reload() {
    setLoading(true)
    Promise.all([listUpcomingEvents(), listFamilyMembers(), listHolidayDates(), listTasks(), listCompletions()])
      .then(([e, m, h, t, c]) => {
        setEvents(e)
        setMembers(m)
        setHolidayDates(h)
        setTasks(t)
        setCompletions(c)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  // Una tarea apuntada por voz (o desde Tareas) para una persona tiene
  // que verse aquí también, no solo en Tareas — sin este aviso, el
  // calendario se quedaba igual hasta recargar a mano.
  useEffect(() => {
    function handleTasksChanged() {
      reload()
    }
    window.addEventListener('family-app:tareas-changed', handleTasksChanged)
    return () => window.removeEventListener('family-app:tareas-changed', handleTasksChanged)
  }, [])

  // Cuando se apunta un evento por voz (VoiceCapture vive fuera de esta
  // pantalla, montado en toda la app), esta pantalla no se enteraba —
  // la cuadrícula se quedaba igual hasta recargar a mano aunque el
  // evento sí se hubiera guardado. Al recibir el aviso, se recarga y de
  // paso se salta directamente al día en cuestión con su ventana
  // abierta, para verlo ahí mismo.
  useEffect(() => {
    function handleCalendarChanged(e: Event) {
      const date = (e as CustomEvent<{ date: string }>).detail?.date
      reload()
      if (date) {
        const [y, m] = date.split('-').map(Number)
        setVisibleYear(y)
        setVisibleMonth(m - 1)
        setSelectedDate(date)
        setDayModalOpen(true)
        setView('Mes')
      }
    }
    window.addEventListener('family-app:calendar-changed', handleCalendarChanged)
    return () => window.removeEventListener('family-app:calendar-changed', handleCalendarChanged)
  }, [])

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
      for (const dateStr of expandOccurrences(ev, rangeStart, rangeEnd, holidayDates)) {
        const list = map.get(dateStr) ?? []
        list.push(ev)
        map.set(dateStr, list)
      }
    }
    return map
  }, [filteredEvents, monthDays, holidayDates])

  const filteredTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (!t.memberId) return false // solo tareas asignadas a una persona — "para toda la familia" no aplica aquí
        return filterMemberId === 'all' || t.memberId === filterMemberId
      }),
    [tasks, filterMemberId],
  )

  // Igual que con los eventos: se calcula una vez por mes visible, no
  // por celda. Solo entra una tarea si de verdad toca ese día (repetición
  // incluida) y todavía no está marcada como hecha esa fecha — una tarea
  // ya completada no debería seguir apareciendo como pendiente.
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    if (monthDays.length === 0) return map
    for (const day of monthDays) {
      const due = filteredTasks.filter((t) => {
        if (!isTaskDueOn(t, day.dateStr)) return false
        return !completions.some(
          (c) => c.taskId === t.id && c.memberId === t.memberId && c.completedDate === day.dateStr,
        )
      })
      if (due.length > 0) map.set(day.dateStr, due)
    }
    return map
  }, [filteredTasks, completions, monthDays])

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

  async function handleDeleteOccurrence(id: string, dateStr: string) {
    try {
      await deleteEventOccurrence(id, dateStr)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar ese día')
    }
  }

  if (loading) return <div className="screen">Cargando calendario…</div>

  const selectedDayEvents = eventsByDate.get(selectedDate) ?? []
  const selectedDayTasks = tasksByDate.get(selectedDate) ?? []

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

      {view !== 'Externos' && (
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
      )}

      {view === 'Externos' ? (
        <ExternalCalendarTab members={members} />
      ) : view === 'Mes' ? (
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
              const dayTasks = tasksByDate.get(day.dateStr) ?? []
              const taskDots = dayTasks
                .map((t) => memberColorById.get(t.memberId as string))
                .filter((c): c is string => !!c)
              const dots = [...new Set([...dayEvents.flatMap((e) => eventDotColors(e, memberColorById)), ...taskDots])]
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
              tasks={selectedDayTasks}
              members={members}
              editingId={editingId}
              onEdit={setEditingId}
              onCancelEdit={() => setEditingId(null)}
              onDelete={handleDelete}
              onDeleteOccurrence={handleDeleteOccurrence}
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
                  onDeleteSeries={() => handleDelete(ev.id)}
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

function eventColor(ev: CalendarEvent, memberById: Map<string, FamilyMember>): string {
  if (ev.color) return ev.color
  const first = ev.memberIds[0] ? memberById.get(ev.memberIds[0]) : null
  return first?.color ?? '#9ca3af'
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Un apunte de la agenda del día, evento o tarea, ya con lo que hace
// falta para pintarlo en fila: color, hora (o "todo el día") y un
// subtítulo corto (de quién es, o la repetición).
interface AgendaEntry {
  key: string
  id: string
  title: string
  subtitle: string
  color: string
  allDay: boolean
  startTime: string | null
  endTime: string | null
  isTask: boolean
  recurring: boolean
  onEdit?: () => void
  onDeleteSeries?: () => void
  onDeleteOccurrence?: () => void
}

// Ventana emergente al pinchar un día — agenda cronológica de arriba
// abajo (todo el día primero, luego por hora), al estilo de otras apps
// de calendario familiar, en vez de agrupar por persona: cada apunte ya
// enseña de quién es en su propia tarjeta, así que no hace falta
// separar en secciones por miembro para verlo de un vistazo.
function DayModal({
  selectedDate,
  events,
  tasks,
  members,
  editingId,
  onEdit,
  onCancelEdit,
  onDelete,
  onDeleteOccurrence,
  onEventChanged,
  onAdded,
  onClose,
}: {
  selectedDate: string
  events: CalendarEvent[]
  tasks: Task[]
  members: FamilyMember[]
  editingId: string | null
  onEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onDeleteOccurrence: (id: string, dateStr: string) => void
  onEventChanged: () => void
  onAdded: () => void
  onClose: () => void
}) {
  const memberById = new Map(members.map((m) => [m.id, m]))

  const entries: AgendaEntry[] = [
    ...events.map((ev) => ({
      key: `ev-${ev.id}`,
      id: ev.id,
      title: ev.title,
      subtitle:
        ev.memberIds.length > 0
          ? ev.memberIds
              .map((id) => memberById.get(id)?.name)
              .filter((n): n is string => !!n)
              .join(', ')
          : recurrenceLabel(ev.recurrenceRule) || 'Toda la familia',
      color: eventColor(ev, memberById),
      allDay: ev.allDay,
      startTime: ev.allDay ? null : hhmm(ev.startAt),
      endTime: !ev.allDay && ev.endAt ? hhmm(ev.endAt) : null,
      isTask: false,
      recurring: !!ev.recurrenceRule,
      onEdit: () => onEdit(ev.id),
      onDeleteSeries: () => onDelete(ev.id),
      onDeleteOccurrence: () => onDeleteOccurrence(ev.id, selectedDate),
    })),
    ...tasks.map((t) => ({
      key: `task-${t.id}`,
      id: t.id,
      title: t.title,
      subtitle: (t.memberId && memberById.get(t.memberId)?.name) || (t.recurrenceRule ? recurrenceLabel(t.recurrenceRule) : 'Tarea'),
      color: (t.memberId && memberById.get(t.memberId)?.color) || '#9ca3af',
      allDay: !t.timeOfDay,
      startTime: t.timeOfDay ? t.timeOfDay.slice(0, 5) : null,
      endTime: null,
      isTask: true,
      recurring: false,
    })),
  ].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return (a.startTime ?? '').localeCompare(b.startTime ?? '')
  })

  const allDayEntries = entries.filter((e) => e.allDay)
  const timedEntries = entries.filter((e) => !e.allDay)

  function renderCard(entry: AgendaEntry) {
    if (!entry.isTask && editingId === entry.id) {
      const ev = events.find((e) => e.id === entry.id)!
      return <EditEventForm key={entry.key} event={ev} members={members} onDone={onEventChanged} onCancel={onCancelEdit} />
    }
    return <AgendaCard key={entry.key} entry={entry} />
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

        {entries.length === 0 && <p className="muted">Nada este día.</p>}

        {allDayEntries.length > 0 && (
          <>
            <p className="muted" style={{ margin: '4px 0' }}>
              Todo el día
            </p>
            <div className="agenda-allday-row">
              {allDayEntries.map((entry) =>
                editingId === entry.id && !entry.isTask ? (
                  renderCard(entry)
                ) : (
                  <AgendaAllDayChip key={entry.key} entry={entry} />
                ),
              )}
            </div>
          </>
        )}

        {timedEntries.map((entry) => (
          <div key={entry.key} className="agenda-row">
            <div className="agenda-time">
              <div>{entry.startTime}</div>
              {entry.endTime && <div>{entry.endTime}</div>}
            </div>
            <div style={{ flex: 1 }}>{renderCard(entry)}</div>
          </div>
        ))}

        <AddEventForm key={selectedDate} members={members} onAdded={onAdded} defaultDate={selectedDate} />
      </div>
    </div>
  )
}

// Chip de "todo el día" — solo lectura al vistazo; para editar/borrar se
// usa la tarjeta normal (AgendaCard), no hace falta duplicar esos
// controles en un chip tan pequeño.
function AgendaAllDayChip({ entry }: { entry: AgendaEntry }) {
  return (
    <span className="agenda-allday-chip" style={{ background: entry.color }}>
      {entry.isTask ? '✅ ' : ''}
      {entry.title}
      {entry.subtitle && <span className="agenda-allday-chip-sub"> · {entry.subtitle}</span>}
    </span>
  )
}

function AgendaCard({ entry }: { entry: AgendaEntry }) {
  const [confirming, setConfirming] = useState(false)
  const canEdit = !!entry.onEdit
  return (
    <div className="agenda-card" style={{ background: entry.color }}>
      <div className="agenda-card-title">
        {entry.isTask ? '✅ ' : ''}
        {entry.title}
      </div>
      {entry.subtitle && <div className="agenda-card-subtitle">{entry.subtitle}</div>}
      {canEdit && (
        <div className="agenda-card-actions">
          {!confirming ? (
            <>
              <button type="button" onClick={entry.onEdit}>
                Editar
              </button>
              <button type="button" onClick={() => setConfirming(true)}>
                Borrar
              </button>
            </>
          ) : (
            <>
              {entry.recurring && entry.onDeleteOccurrence && (
                <button type="button" onClick={entry.onDeleteOccurrence}>
                  Solo este día
                </button>
              )}
              <button type="button" onClick={entry.onDeleteSeries}>
                {entry.recurring ? 'Toda la serie' : 'Borrar'}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// Antes de borrar, pide confirmación — y si el evento es recurrente y
// se está viendo desde un día concreto (DayModal pasa onDeleteOccurrence),
// deja elegir entre borrar solo ese día o toda la serie, en vez de
// borrar siempre la serie entera de un solo toque.
function EventCard({
  event: ev,
  memberById,
  onEdit,
  onDeleteSeries,
  onDeleteOccurrence,
}: {
  event: CalendarEvent
  memberById: Map<string, FamilyMember>
  onEdit: () => void
  onDeleteSeries: () => void
  onDeleteOccurrence?: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="card event-card" style={{ borderColor: ev.color ?? undefined }}>
      <strong>{ev.title}</strong>
      <p className="muted">
        {new Date(ev.startAt).toLocaleString('es-ES', {
          dateStyle: 'medium',
          timeStyle: ev.allDay ? undefined : 'short',
        })}
        {!ev.allDay &&
          ev.endAt &&
          ` – ${new Date(ev.endAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
        {ev.recurrenceRule && ` · ${recurrenceLabel(ev.recurrenceRule)}`}
        {ev.reminders.length > 0 &&
          ` · 🔔 ${ev.reminders.map((r) => reminderLabel(r.minutesBefore, r.anchor)).join(', ')}`}
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
        {!confirming ? (
          <button type="button" className="link-button" onClick={() => setConfirming(true)}>
            Borrar
          </button>
        ) : (
          <>
            <span className="muted">¿Seguro?</span>
            {onDeleteOccurrence && ev.recurrenceRule && (
              <button type="button" className="link-button" onClick={onDeleteOccurrence}>
                Solo este día
              </button>
            )}
            <button type="button" className="link-button" onClick={onDeleteSeries}>
              {ev.recurrenceRule ? 'Toda la serie' : 'Borrar'}
            </button>
            <button type="button" className="link-button" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </>
        )}
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
// (minutos/horas/días/semanas/meses/años) y contando desde que EMPIEZA o
// desde que TERMINA el evento — "que me avise media hora antes de
// recogerlo" cuenta desde el final, no desde el principio. La opción de
// "al terminar" solo se ofrece si el evento tiene hora de fin.
function ReminderPicker({
  reminders,
  onChange,
  hasEnd,
}: {
  reminders: EventReminder[]
  onChange: (next: EventReminder[]) => void
  hasEnd: boolean
}) {
  const [amount, setAmount] = useState('1')
  const [unit, setUnit] = useState<ReminderUnit>('horas')
  const [anchor, setAnchor] = useState<ReminderAnchor>('start')

  const sameReminder = (a: EventReminder, b: EventReminder) =>
    a.minutesBefore === b.minutesBefore && a.anchor === b.anchor

  function add(minutesBefore: number, addAnchor: ReminderAnchor) {
    const next = { minutesBefore, anchor: addAnchor }
    if (minutesBefore > 0 && !reminders.some((r) => sameReminder(r, next))) {
      onChange([...reminders, next].sort((a, b) => a.minutesBefore - b.minutesBefore))
    }
  }

  function addCustom() {
    const n = Number(amount)
    if (!n || n <= 0) return
    add(reminderMinutesFrom(n, unit), anchor)
  }

  function remove(target: EventReminder) {
    onChange(reminders.filter((r) => !sameReminder(r, target)))
  }

  return (
    <div>
      <p className="muted">Recordatorios</p>
      {reminders.length > 0 && (
        <div className="filter-row">
          {reminders.map((r) => (
            <button
              type="button"
              key={`${r.minutesBefore}-${r.anchor}`}
              className="chip chip-active"
              onClick={() => remove(r)}
            >
              🔔 {reminderLabel(r.minutesBefore, r.anchor)} ✕
            </button>
          ))}
        </div>
      )}

      {hasEnd && (
        <div className="filter-row">
          <button
            type="button"
            className={'chip' + (anchor === 'start' ? ' chip-active' : '')}
            onClick={() => setAnchor('start')}
          >
            Antes de empezar
          </button>
          <button
            type="button"
            className={'chip' + (anchor === 'end' ? ' chip-active' : '')}
            onClick={() => setAnchor('end')}
          >
            Antes de terminar
          </button>
        </div>
      )}

      <div className="filter-row">
        {REMINDER_PRESETS.map((m) => (
          <button type="button" key={m} className="chip" onClick={() => add(m, anchor)}>
            {reminderLabel(m, anchor)}
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

export interface RecurrenceValue {
  freq: string
  byDay: string[]
  interval: number
  skipHolidays: boolean
  until: string // '' = sin fecha límite
}

// Preajustes de un toque ("Todos los días laborables", "Cada 2
// semanas"…) en vez de tener que elegir frecuencia y días de la semana
// por separado cada vez — cubre lo que se pide casi siempre. "Personalizado"
// se abre solo si hace falta algo que ningún preajuste cubre (p. ej.
// "martes y jueves" sueltos), o si el evento ya tenía guardada una
// combinación así al editarlo.
function RecurrenceControl({ value, onChange }: { value: RecurrenceValue; onChange: (v: RecurrenceValue) => void }) {
  const matched = matchRecurrencePreset(value.freq, value.byDay, value.interval)
  const [customMode, setCustomMode] = useState(!!value.freq && !matched)

  function applyPreset(preset: RecurrencePreset) {
    setCustomMode(false)
    onChange({ ...value, freq: preset.freq, byDay: preset.byDay, interval: preset.interval })
  }

  function toggleDay(code: string) {
    const next = value.byDay.includes(code) ? value.byDay.filter((c) => c !== code) : [...value.byDay, code]
    onChange({ ...value, byDay: next })
  }

  return (
    <div>
      <p className="muted">Repetir</p>
      <div className="recurrence-preset-list">
        {RECURRENCE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={'chip recurrence-preset' + (!customMode && matched?.key === p.key ? ' chip-active' : '')}
            onClick={() => applyPreset(p)}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className={'chip recurrence-preset' + (customMode ? ' chip-active' : '')}
          onClick={() => setCustomMode(true)}
        >
          Personalizado…
        </button>
      </div>

      {customMode && (
        <div className="day-modal-group">
          <label>
            Frecuencia
            <select value={value.freq} onChange={(e) => onChange({ ...value, freq: e.target.value, interval: 1 })}>
              {FREQ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {value.freq === 'WEEKLY' && (
            <div>
              <p className="muted">¿Qué días? (deja vacío para repetir cada 7 días desde la fecha)</p>
              <WeekdayPicker selected={value.byDay} onToggle={toggleDay} />
            </div>
          )}
        </div>
      )}

      {value.freq && (
        <>
          <label>
            Repetir hasta (opcional)
            <input type="date" value={value.until} onChange={(e) => onChange({ ...value, until: e.target.value })} />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value.skipHolidays}
              onChange={(e) => onChange({ ...value, skipHolidays: e.target.checked })}
            />
            Excluir festivos (según el calendario de festivos enlazado en Externos)
          </label>
        </>
      )}
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
  const [endTime, setEndTime] = useState(() => {
    if (event.allDay || !event.endAt) return ''
    const end = new Date(event.endAt)
    return `${pad(end.getHours())}:${pad(end.getMinutes())}`
  })
  const [allDay, setAllDay] = useState(event.allDay)
  const initialRecurrence = parseRecurrenceRule(event.recurrenceRule)
  const [recurrence, setRecurrence] = useState<RecurrenceValue>({
    freq: initialRecurrence.freq,
    byDay: initialRecurrence.byDay,
    interval: initialRecurrence.interval,
    skipHolidays: initialRecurrence.skipHolidays,
    until: initialRecurrence.until ?? '',
  })
  const [reminders, setReminders] = useState<EventReminder[]>(event.reminders)
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
      const endAt = !allDay && endTime ? new Date(`${date}T${endTime}`).toISOString() : null
      await updateEvent(event.id, {
        title,
        startAt,
        endAt,
        allDay,
        recurrenceRule: buildRecurrenceRule(
          recurrence.freq,
          recurrence.byDay,
          recurrence.skipHolidays,
          recurrence.until || null,
          recurrence.interval,
        ),
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
        <div className="inline-fields">
          <label>
            Empieza
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label>
            Termina (opcional)
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
      )}
      <label className="checkbox-label">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        Todo el día
      </label>
      <RecurrenceControl value={recurrence} onChange={setRecurrence} />
      <ReminderPicker reminders={reminders} onChange={setReminders} hasEnd={!allDay && !!endTime} />
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
  const [endTime, setEndTime] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceValue>({
    freq: '',
    byDay: [],
    interval: 1,
    skipHolidays: false,
    until: '',
  })
  const [reminders, setReminders] = useState<EventReminder[]>([])
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
      const endAt = !allDay && endTime ? new Date(`${date}T${endTime}`).toISOString() : null
      await createEvent({
        title,
        startAt,
        endAt,
        allDay,
        recurrenceRule: buildRecurrenceRule(
          recurrence.freq,
          recurrence.byDay,
          recurrence.skipHolidays,
          recurrence.until || null,
          recurrence.interval,
        ),
        reminders,
        memberIds: selectedMembers,
      })
      setTitle('')
      setDate(defaultDate ?? '')
      setTime('')
      setEndTime('')
      setRecurrence({ freq: '', byDay: [], interval: 1, skipHolidays: false, until: '' })
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
        <div className="inline-fields">
          <label>
            Empieza
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label>
            Termina (opcional)
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
      )}
      <label className="checkbox-label">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        Todo el día
      </label>
      <RecurrenceControl value={recurrence} onChange={setRecurrence} />
      <ReminderPicker reminders={reminders} onChange={setReminders} hasEnd={!allDay && !!endTime} />
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

// "Enlazar calendario del móvil": importa citas de Google Calendar,
// Outlook, Apple/iPhone o cualquier otro proveedor vía su URL .ics
// (misma pestaña que pidió la usuaria — mes propio, separado de los
// eventos nativos para no mezclarlos). Los eventos recurrentes del
// .ics se expanden con el mismo RRULE-lite que los eventos nativos
// (ver icsParser.ts) — solo se descarta la recurrencia si el .ics usa
// un FREQ que no se sabe expandir, y entonces el evento se trata como
// uno suelto en su primera fecha, no se pierde entero.
function ExternalCalendarTab({ members }: { members: FamilyMember[] }) {
  const [feeds, setFeeds] = useState<ExternalCalendarFeed[]>([])
  const [extEvents, setExtEvents] = useState<ExternalCalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const today = useMemo(() => new Date(), [])
  const [visibleYear, setVisibleYear] = useState(today.getFullYear())
  const [visibleMonth, setVisibleMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listFeeds(), listExternalEvents()])
      .then(([f, e]) => {
        setFeeds(f)
        setExtEvents(e)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleSync(feedId: string) {
    setSyncingId(feedId)
    setError(null)
    try {
      await syncFeed(feedId)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo sincronizar')
    } finally {
      setSyncingId(null)
    }
  }

  async function handleDeleteFeed(id: string) {
    try {
      await deleteFeed(id)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar el calendario')
    }
  }

  const feedById = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const monthDays = useMemo(() => getMonthGridDays(visibleYear, visibleMonth), [visibleYear, visibleMonth])

  // Un evento recurrente del calendario externo (p. ej. una reunión
  // semanal real de Google Calendar) se expande igual que los eventos
  // nativos — antes solo se guardaba su primera fecha, así que la
  // mayoría de semanas del mes se veían vacías aunque el evento sí
  // existiera, dando la sensación de que el calendario no se había
  // enlazado bien.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, ExternalCalendarEvent[]>()
    if (monthDays.length === 0) return map
    const rangeStart = monthDays[0].dateStr
    const rangeEnd = monthDays[monthDays.length - 1].dateStr
    for (const ev of extEvents) {
      for (const dateStr of expandOccurrences(ev, rangeStart, rangeEnd)) {
        const list = map.get(dateStr) ?? []
        list.push(ev)
        map.set(dateStr, list)
      }
    }
    return map
  }, [extEvents, monthDays])

  function dotColorForFeed(feedId: string): string {
    const feed = feedById.get(feedId)
    const member = feed?.memberId ? memberById.get(feed.memberId) : null
    return member?.color ?? '#6b7280'
  }

  function goToMonth(delta: number) {
    const d = new Date(visibleYear, visibleMonth + delta, 1)
    setVisibleYear(d.getFullYear())
    setVisibleMonth(d.getMonth())
  }

  const selectedDayEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : []

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <div className="card member-form">
        <h2>Calendarios enlazados</h2>
        <p className="muted">
          Copia la "dirección secreta en formato iCal" de tu calendario (Google, Outlook, Apple/iPhone o Android) y
          pégala aquí. Solo se importan las citas — no se puede escribir en tu calendario original.
        </p>
        {feeds.length === 0 && !loading && <p className="muted">Todavía no has enlazado ningún calendario.</p>}
        {feeds.map((f) => (
          <div key={f.id} className="card event-card">
            <strong>{f.name}</strong>
            {f.isHolidayCalendar && <span className="muted"> · 🎌 festivos</span>}
            {f.memberId && memberById.get(f.memberId) && (
              <span className="avatar avatar-sm" style={{ background: memberById.get(f.memberId)!.color }}>
                {memberById.get(f.memberId)!.name.charAt(0)}
              </span>
            )}
            <p className="muted">
              {f.lastSyncedAt
                ? `Última sincronización: ${new Date(f.lastSyncedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}`
                : 'Todavía no sincronizado'}
            </p>
            {f.lastSyncError && <p className="error">{f.lastSyncError}</p>}
            <div className="member-card-actions">
              <button type="button" className="link-button" disabled={syncingId === f.id} onClick={() => handleSync(f.id)}>
                {syncingId === f.id ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
              <button type="button" className="link-button" onClick={() => handleDeleteFeed(f.id)}>
                Quitar
              </button>
            </div>
          </div>
        ))}

        <AddFeedForm members={members} onAdded={reload} />
      </div>

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
      </div>

      <div className="month-grid">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="month-grid-weekday">
            {w}
          </div>
        ))}
        {monthDays.map((day) => {
          const dayEvents = eventsByDate.get(day.dateStr) ?? []
          const dots = [...new Set(dayEvents.map((e) => dotColorForFeed(e.feedId)))]
          const isSelected = selectedDate === day.dateStr
          // A diferencia del calendario nativo (puntitos pequeños), aquí
          // se pinta el recuadro entero del color — a petición de la
          // usuaria, para que se note de un vistazo qué días tienen algo
          // sin tener que fijarse en un puntito diminuto.
          const fillColor = dots[0]
          return (
            <button
              type="button"
              key={day.dateStr}
              className={
                'month-grid-day' +
                (day.inMonth ? '' : ' month-grid-day-out') +
                (day.isToday ? ' month-grid-day-today' : '') +
                (isSelected ? ' month-grid-day-selected' : '') +
                (fillColor && !isSelected ? ' month-grid-day-filled' : '')
              }
              style={fillColor && !isSelected ? { background: fillColor, borderColor: fillColor } : undefined}
              onClick={() => setSelectedDate(day.dateStr)}
            >
              <span>{day.day}</span>
              {dots.length > 1 && (
                <span className="month-grid-dots">
                  {dots.slice(1, 4).map((_, i) => (
                    <span key={i} className="month-grid-dot month-grid-dot-on-fill" />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selectedDate && (
        <div className="modal-overlay" onClick={() => setSelectedDate(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {new Date(selectedDate + 'T00:00').toLocaleDateString('es-ES', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h2>
              <button type="button" className="modal-close" onClick={() => setSelectedDate(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            {selectedDayEvents.length === 0 && <p className="muted">Nada este día.</p>}
            <div className="event-list">
              {selectedDayEvents.map((ev) => (
                <div key={ev.id} className="card event-card">
                  <strong>{ev.title}</strong>
                  <p className="muted">
                    {feedById.get(ev.feedId)?.name}
                    {' · '}
                    {ev.allDay
                      ? 'Todo el día'
                      : new Date(ev.startAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    {!ev.allDay &&
                      ev.endAt &&
                      ` – ${new Date(ev.endAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddFeedForm({ members, onAdded }: { members: FamilyMember[]; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [icsUrl, setIcsUrl] = useState('')
  const [memberId, setMemberId] = useState<string>('')
  const [isHolidayCalendar, setIsHolidayCalendar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const id = await addFeed({ name, icsUrl, memberId: memberId || null, isHolidayCalendar })
      setName('')
      setIcsUrl('')
      setMemberId('')
      setIsHolidayCalendar(false)
      onAdded()
      // Sincroniza en cuanto se añade, para que "vamos a probarlo" se
      // vea de inmediato sin tener que pulsar "Sincronizar ahora" aparte.
      await syncFeed(id).catch(() => {})
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enlazar el calendario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h3>Enlazar calendario</h3>
      <label>
        Nombre
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Google Calendar de Jennifer"
          required
        />
      </label>
      <label>
        URL .ics
        <input
          type="url"
          value={icsUrl}
          onChange={(e) => setIcsUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/..."
          required
        />
      </label>
      <label>
        ¿De quién es? (opcional)
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Toda la familia</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-label">
        <input type="checkbox" checked={isHolidayCalendar} onChange={(e) => setIsHolidayCalendar(e.target.checked)} />
        Es un calendario de festivos (para poder excluirlos de las repeticiones)
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Enlazando…' : 'Enlazar calendario'}
      </button>
    </form>
  )
}
