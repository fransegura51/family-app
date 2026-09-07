import { FormEvent, TouchEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ReorderableTabBar } from '@/ui/ReorderableTabBar'
import { findMemberInText } from '@/domain/voiceQuery'
import {
  completeEventOccurrence,
  createEvent,
  deleteEvent,
  deleteEventOccurrence,
  listEventCompletions,
  listUpcomingEvents,
  uncompleteEventOccurrence,
  updateEvent,
  type EventCompletion,
} from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import { listContacts } from '@/data/contacts'
import { ConfirmButton } from '@/ui/ConfirmButton'
import {
  addFeed,
  completeExternalEventOccurrence,
  deleteFeed,
  dismissExternalEventOccurrence,
  dismissExternalEventSeries,
  listExternalEventCompletions,
  listExternalEventDismissals,
  listExternalEvents,
  listFeeds,
  listHolidayDates,
  syncFeed,
  uncompleteExternalEventOccurrence,
  type ExternalCalendarEvent,
  type ExternalCalendarFeed,
  type ExternalEventCompletion,
  type ExternalEventDismissal,
} from '@/data/externalCalendarFeeds'
import { getCalendarExportUrl } from '@/data/calendarExport'
import {
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  startGoogleConnect,
  type GoogleCalendarStatus,
} from '@/data/googleCalendarSync'
import {
  eventDotColors,
  expandOccurrences,
  getMonthGridDays,
  MONTH_LABELS,
  readableTextColor,
  WEEKDAY_LABELS,
} from '@/domain/calendar'
import {
  REMINDER_PRESETS,
  REMINDER_UNIT_OPTIONS,
  reminderLabel,
  reminderMinutesFrom,
  type EventReminder,
  type ReminderAnchor,
  type ReminderUnit,
} from '@/domain/reminders'
import { MemberAvatar } from '@/ui/MemberAvatar'
import type { CalendarEvent, Contact, FamilyMember } from '@/domain/types'
import { setSelectedCalendarDate } from '@/state/calendarSelection'
import { setCalendarMemberFilter } from '@/state/calendarMemberFilter'
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

// Skill: vistas de calendario al estilo de referencia (foto aportada
// por la familia) — Agenda, Familiar, Día, 3 días y Semana se suman al
// Mes y Externos que ya había.
const VIEWS = ['Mes', 'Vista general', 'Semana', '3 días', 'Día', 'Familiar', 'Agenda', 'Externos'] as const
type ViewMode = (typeof VIEWS)[number]

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Deslizar con el dedo para pasar de mes (en la cuadrícula) o de día (en
// la ventana emergente) — petición real: "arrastro hacia la izquierda
// que pase [el siguiente], arrastro a la derecha que pase [el
// anterior]". Solo cuenta un gesto claro y sobre todo horizontal — si
// no, se deja pasar como el toque/scroll normal (no hay que "robarle"
// el scroll vertical de la pantalla a un gesto casi vertical).
function useSwipeHandlers(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0]
      startRef.current = { x: t.clientX, y: t.clientY }
    },
    onTouchEnd: (e: TouchEvent) => {
      const start = startRef.current
      startRef.current = null
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
      if (dx < 0) onSwipeLeft()
      else onSwipeRight()
    },
  }
}

export function CalendarScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventCompletions, setEventCompletions] = useState<EventCompletion[]>([])
  const [externalEvents, setExternalEvents] = useState<ExternalCalendarEvent[]>([])
  const [externalFeeds, setExternalFeeds] = useState<ExternalCalendarFeed[]>([])
  const [externalDismissals, setExternalDismissals] = useState<ExternalEventDismissal[]>([])
  const [externalCompletions, setExternalCompletions] = useState<ExternalEventCompletion[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  // Botón flotante "Nuevo evento", tocable desde cualquier parte de la
  // pestaña — petición real: "esa misma idea [la de Contactos] la
  // vamos a aplicar al calendario: botón flotante Nuevo evento y
  // formulario en ventana emergente".
  const [addingEvent, setAddingEvent] = useState(false)
  // Con qué miembro preseleccionado se abrió "+ Añadir" desde la
  // columna de esa persona en la vista Familiar — null en el resto de
  // casos (botón flotante normal).
  const [addingEventMemberId, setAddingEventMemberId] = useState<string | null>(null)
  // Vacío = sin filtrar (toda la familia) — varios miembros a la vez,
  // no solo uno, petición real: "quiero que puedas filtrar por cada
  // miembro... y que Pepa detecte solamente las tareas de ese
  // miembro" (mostraba una captura de otra app con varias personas
  // marcables a la vez, con un icono de ojo cada una).
  const [filterMemberIds, setFilterMemberIds] = useState<string[]>([])

  // Pepa vive fuera de esta pantalla (montada en toda la app) — se
  // publica aquí el filtro activo para que sus respuestas del
  // calendario lo tengan en cuenta sin que haga falta nombrar a nadie
  // en la propia pregunta. Se limpia al salir de Calendario, igual que
  // ya se hace con el día seleccionado.
  useEffect(() => {
    setCalendarMemberFilter(filterMemberIds)
    return () => setCalendarMemberFilter([])
  }, [filterMemberIds])

  function toggleFilterMember(id: string) {
    setFilterMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('Mes')
  const today = useMemo(() => new Date(), [])
  const [visibleYear, setVisibleYear] = useState(today.getFullYear())
  const [visibleMonth, setVisibleMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(toDateStr(today))
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set())

  // Publica qué día tienes abierto para que "Apunta por voz" (vive fuera
  // de esta pantalla) lo use como fecha por defecto en vez de caer
  // siempre en hoy cuando no dices ninguna fecha — se limpia al salir
  // de Calendario. El día ya no es una ventana que se pueda cerrar (es
  // una tarjeta fija bajo el mes), así que se publica siempre.
  useEffect(() => {
    setSelectedCalendarDate(selectedDate)
    return () => setSelectedCalendarDate(null)
  }, [selectedDate])

  function reload() {
    setLoading(true)
    Promise.all([
      listUpcomingEvents(),
      listFamilyMembers(),
      listHolidayDates(),
      listExternalEvents(),
      listFeeds(),
      listContacts(),
      listEventCompletions(),
      listExternalEventDismissals(),
      listExternalEventCompletions(),
    ])
      .then(([e, m, h, ee, ef, ct, evc, ed, eec]) => {
        setEvents(e)
        setMembers(m)
        setHolidayDates(h)
        setExternalEvents(ee)
        setExternalFeeds(ef)
        setContacts(ct)
        setEventCompletions(evc)
        setExternalDismissals(ed)
        setExternalCompletions(eec)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

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
        setView('Mes')
      }
    }
    window.addEventListener('family-app:calendar-changed', handleCalendarChanged)
    return () => window.removeEventListener('family-app:calendar-changed', handleCalendarChanged)
  }, [])

  const filteredEvents = useMemo(
    () =>
      filterMemberIds.length === 0
        ? events
        : events.filter((e) => e.memberIds.some((id) => filterMemberIds.includes(id))),
    [events, filterMemberIds],
  )

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const memberColorById = useMemo(() => new Map(members.map((m) => [m.id, m.color])), [members])

  const monthDays = useMemo(() => getMonthGridDays(visibleYear, visibleMonth), [visibleYear, visibleMonth])

  // Un evento recurrente puede caer varias veces dentro de la cuadrícula
  // visible (42 días) — se calcula una vez por render del mes, no por celda.
  // Marcar "hecho" NO lo quita de aquí — sigue viéndose en el calendario,
  // solo que marcado (petición real: "quiero poder verlo posteriormente
  // lo que he hecho y cuándo lo he hecho, no quiero que desaparezca").
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

  const feedById = useMemo(() => new Map(externalFeeds.map((f) => [f.id, f])), [externalFeeds])

  function externalEventColor(feedId: string): string {
    const feed = feedById.get(feedId)
    const member = feed?.memberId ? memberById.get(feed.memberId) : null
    return member?.color ?? '#6b7280'
  }

  // Borrada toda la serie (occurrence_date null) -> no se vuelve a ver
  // en ningún día. Ver el porqué de comparar por (feed_id, uid) y no
  // por `id` en la migración 0052.
  const seriesDismissed = useMemo(
    () => new Set(externalDismissals.filter((d) => d.occurrenceDate === null).map((d) => `${d.feedId}:${d.uid}`)),
    [externalDismissals],
  )
  const occurrenceDismissed = useMemo(
    () =>
      new Set(
        externalDismissals.filter((d) => d.occurrenceDate !== null).map((d) => `${d.feedId}:${d.uid}:${d.occurrenceDate}`),
      ),
    [externalDismissals],
  )
  const externalCompletedSet = useMemo(
    () => new Set(externalCompletions.map((c) => `${c.feedId}:${c.uid}:${c.occurrenceDate}`)),
    [externalCompletions],
  )

  const filteredExternalEvents = useMemo(
    () =>
      externalEvents.filter((ev) => {
        if (seriesDismissed.has(`${ev.feedId}:${ev.uid}`)) return false
        const feed = feedById.get(ev.feedId)
        if (filterMemberIds.length === 0) return true
        return !!feed?.memberId && filterMemberIds.includes(feed.memberId)
      }),
    [externalEvents, feedById, filterMemberIds, seriesDismissed],
  )

  // Una cita del calendario externo (Google/Outlook/...) se ve también
  // aquí, en el calendario propio de la app — petición real: "que se
  // pongan en nuestros colores y tengamos la opción de eliminarlas o
  // marcarlas como hecho, igual que las otras notas" (antes era de
  // solo lectura). El color ya sale bien en cuanto el calendario
  // enlazado tiene un miembro asignado (Externos); borrar/hecho se
  // guardan aparte (ver arriba) porque cada sincronización reemplaza
  // estas filas enteras.
  const externalEventsByDate = useMemo(() => {
    const map = new Map<string, ExternalCalendarEvent[]>()
    if (monthDays.length === 0) return map
    const rangeStart = monthDays[0].dateStr
    const rangeEnd = monthDays[monthDays.length - 1].dateStr
    for (const ev of filteredExternalEvents) {
      for (const dateStr of expandOccurrences(ev, rangeStart, rangeEnd)) {
        if (occurrenceDismissed.has(`${ev.feedId}:${ev.uid}:${dateStr}`)) continue
        const list = map.get(dateStr) ?? []
        list.push(ev)
        map.set(dateStr, list)
      }
    }
    return map
  }, [filteredExternalEvents, monthDays, occurrenceDismissed])

  // Cumpleaños de la familia y de los contactos, en el mes visible —
  // se pidió que se vean también en el calendario, no solo en la
  // pestaña Cumpleaños. Se comparan solo mes y día (los dos últimos
  // trozos de la fecha, "MM-DD"): un cumpleaños es el mismo día todos
  // los años, a diferencia de un evento normal que solo existe en una
  // fecha exacta. Son de solo lectura aquí (sin onEdit/onDeleteSeries):
  // se cambian desde Familia o Contactos, no desde el calendario.
  const birthdaysByDate = useMemo(() => {
    const map = new Map<string, { name: string; color: string }[]>()
    if (monthDays.length === 0) return map
    for (const day of monthDays) {
      const list: { name: string; color: string }[] = []
      for (const m of members) {
        if (m.birthDate && m.birthDate.slice(5) === day.dateStr.slice(5)) list.push({ name: m.name, color: m.color })
      }
      for (const c of contacts) {
        if (c.birthDate && c.birthDate.slice(5) === day.dateStr.slice(5)) list.push({ name: c.name, color: '#f59e0b' })
      }
      if (list.length > 0) map.set(day.dateStr, list)
    }
    return map
  }, [members, contacts, monthDays])

  function goToMonth(delta: number) {
    const d = new Date(visibleYear, visibleMonth + delta, 1)
    setVisibleYear(d.getFullYear())
    setVisibleMonth(d.getMonth())
  }

  // Para deslizar de un día a otro DENTRO de la ventana emergente sin
  // cerrarla — si el día cae en otro mes, la cuadrícula de detrás
  // también se actualiza para que quede en el mismo mes al cerrarla.
  function changeSelectedDate(deltaDays: number) {
    const d = new Date(selectedDate + 'T00:00')
    d.setDate(d.getDate() + deltaDays)
    setSelectedDate(toDateStr(d))
    if (d.getFullYear() !== visibleYear || d.getMonth() !== visibleMonth) {
      setVisibleYear(d.getFullYear())
      setVisibleMonth(d.getMonth())
    }
  }

  const monthSwipe = useSwipeHandlers(
    () => goToMonth(1),
    () => goToMonth(-1),
  )
  const daySwipe = useSwipeHandlers(
    () => changeSelectedDate(1),
    () => changeSelectedDate(-1),
  )
  const threeDaySwipe = useSwipeHandlers(
    () => changeSelectedDate(3),
    () => changeSelectedDate(-3),
  )
  const weekSwipe = useSwipeHandlers(
    () => changeSelectedDate(7),
    () => changeSelectedDate(-7),
  )

  // Días a mostrar en la cuadrícula horaria — Semana empieza en lunes
  // (mismo criterio que WEEKDAY_LABELS en Mes), 3 días y Día parten
  // siempre del día seleccionado.
  const gridDays = useMemo(() => {
    const base = new Date(selectedDate + 'T00:00')
    let start = base
    let count = 1
    if (view === 'Semana') {
      const mondayOffset = (base.getDay() + 6) % 7
      start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - mondayOffset)
      count = 7
    } else if (view === '3 días') {
      count = 3
    }
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
      return { dateStr: toDateStr(d), date: d }
    })
  }, [view, selectedDate])

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

  // Botón "Hecho" al lado de cada evento del día — petición real. Si el
  // evento lleva puntos y está asignado a una sola persona (niño o
  // adulto), esa persona se los lleva al marcarlo — "cuando le
  // asignemos un evento a un niño, solamente para los niños podemos
  // crear una forma de darle puntos... o a los adultos también".
  async function handleCompleteEvent(eventId: string, dateStr: string) {
    try {
      const ev = events.find((e) => e.id === eventId)
      const soleMember = ev && ev.memberIds.length === 1 ? ev.memberIds[0] : null
      await completeEventOccurrence(eventId, dateStr, soleMember, ev?.points ?? 0)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar como hecho')
    }
  }

  // "Hecho" ya no hace desaparecer nada del calendario (petición real:
  // "quiero poder verlo posteriormente lo que he hecho y cuándo lo he
  // hecho, no quiero que desaparezca") — se queda marcado, y desde aquí
  // se puede deshacer si hizo falta marcarlo sin querer.
  async function handleUncompleteEvent(eventId: string, dateStr: string) {
    try {
      await uncompleteEventOccurrence(eventId, dateStr)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo deshacer')
    }
  }

  async function handleDismissExternalOccurrence(feedId: string, uid: string, dateStr: string) {
    try {
      await dismissExternalEventOccurrence(feedId, uid, dateStr)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar ese día')
    }
  }

  async function handleDismissExternalSeries(feedId: string, uid: string) {
    try {
      await dismissExternalEventSeries(feedId, uid)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    }
  }

  async function handleCompleteExternal(feedId: string, uid: string, dateStr: string) {
    try {
      await completeExternalEventOccurrence(feedId, uid, dateStr)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar como hecho')
    }
  }

  async function handleUncompleteExternal(feedId: string, uid: string, dateStr: string) {
    try {
      await uncompleteExternalEventOccurrence(feedId, uid, dateStr)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo deshacer')
    }
  }

  // Sacado de DayModal para poder construir la agenda de CUALQUIER día
  // (no solo el seleccionado) — lo necesitan las vistas nuevas Agenda,
  // Semana, 3 días y Día, además de la propia DayModal de Mes.
  function buildEntriesForDate(dateStr: string): AgendaEntry[] {
    const dayEvents = eventsByDate.get(dateStr) ?? []
    const dayExternalEvents = externalEventsByDate.get(dateStr) ?? []
    const dayBirthdays = birthdaysByDate.get(dateStr) ?? []

    return [
      ...dayEvents.map((ev) => {
        const done = eventCompletions.some((c) => c.eventId === ev.id && c.occurrenceDate === dateStr)
        const who =
          ev.memberIds.length > 0
            ? ev.memberIds
                .map((id) => memberById.get(id)?.name)
                .filter((n): n is string => !!n)
                .join(', ')
            : recurrenceLabel(ev.recurrenceRule) || 'Toda la familia'
        const subtitle = ev.points > 0 && ev.memberIds.length === 1 ? `${who} · ⭐ ${ev.points}` : who
        return {
          key: `ev-${ev.id}`,
          id: ev.id,
          title: ev.title,
          subtitle,
          color: eventColor(ev, memberById),
          allDay: ev.allDay,
          startTime: ev.allDay ? null : hhmm(ev.startAt),
          endTime: !ev.allDay && ev.endAt ? hhmm(ev.endAt) : null,
          isExternal: false,
          recurring: !!ev.recurrenceRule,
          done,
          onEdit: () => setEditingId(ev.id),
          onDeleteSeries: () => handleDelete(ev.id),
          onDeleteOccurrence: () => handleDeleteOccurrence(ev.id, dateStr),
          onComplete: done ? undefined : () => handleCompleteEvent(ev.id, dateStr),
          onUncomplete: done ? () => handleUncompleteEvent(ev.id, dateStr) : undefined,
        }
      }),
      ...dayExternalEvents.map((ev) => {
        const feed = feedById.get(ev.feedId)
        const member = feed?.memberId ? memberById.get(feed.memberId) : null
        const done = externalCompletedSet.has(`${ev.feedId}:${ev.uid}:${dateStr}`)
        return {
          key: `ext-${ev.id}`,
          id: ev.id,
          title: ev.title,
          subtitle: feed?.name ?? 'Calendario externo',
          color: member?.color ?? '#6b7280',
          allDay: ev.allDay,
          startTime: ev.allDay ? null : hhmm(ev.startAt),
          endTime: !ev.allDay && ev.endAt ? hhmm(ev.endAt) : null,
          isExternal: true,
          recurring: !!ev.recurrenceRule,
          done,
          onDeleteSeries: () => handleDismissExternalSeries(ev.feedId, ev.uid),
          onDeleteOccurrence: () => handleDismissExternalOccurrence(ev.feedId, ev.uid, dateStr),
          onComplete: done ? undefined : () => handleCompleteExternal(ev.feedId, ev.uid, dateStr),
          onUncomplete: done ? () => handleUncompleteExternal(ev.feedId, ev.uid, dateStr) : undefined,
        }
      }),
      ...dayBirthdays.map((b, i) => ({
        key: `bday-${i}`,
        id: `bday-${i}`,
        title: `🎂 Cumpleaños de ${b.name}`,
        subtitle: '',
        color: b.color,
        allDay: true,
        startTime: null,
        endTime: null,
        isExternal: false,
        recurring: true,
        done: false,
      })),
    ].sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return (a.startTime ?? '').localeCompare(b.startTime ?? '')
    })
  }

  if (loading) return <div className="screen">Cargando calendario…</div>


  return (
    <div className="screen">
      <h1>Calendario</h1>
      {error && <p className="error">{error}</p>}

      <ReorderableTabBar storageKey="calendario" tabs={VIEWS} active={view} onSelect={setView} />

      {view !== 'Externos' && (
        <div className="filter-row">
          <button
            className={'chip' + (filterMemberIds.length === 0 ? ' chip-active' : '')}
            onClick={() => setFilterMemberIds([])}
          >
            Todos
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              className={'chip' + (filterMemberIds.includes(m.id) ? ' chip-active' : '')}
              style={{ borderColor: m.color }}
              onClick={() => toggleFilterMember(m.id)}
            >
              <MemberAvatar member={m} size={18} />
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

          <div className="month-grid" onTouchStart={monthSwipe.onTouchStart} onTouchEnd={monthSwipe.onTouchEnd}>
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="month-grid-weekday">
                {w}
              </div>
            ))}
            {monthDays.map((day) => {
              // Petición real: la vista Mes tiene que verse como una
              // franja de color por apunte (con su nombre dentro), apiladas
              // una debajo de otra, no como puntitos — mismo criterio de
              // orden (todo el día primero) que ya usa buildEntriesForDate.
              const dayEntries = buildEntriesForDate(day.dateStr)
              const MAX_BARS = 6
              const visibleEntries = dayEntries.slice(0, MAX_BARS)
              const hiddenCount = dayEntries.length - visibleEntries.length
              return (
                <button
                  type="button"
                  key={day.dateStr}
                  className={
                    'month-grid-day month-grid-day-bars' +
                    (day.inMonth ? '' : ' month-grid-day-out') +
                    (day.isToday ? ' month-grid-day-today' : '') +
                    (selectedDate === day.dateStr ? ' month-grid-day-selected' : '')
                  }
                  onClick={() => setSelectedDate(day.dateStr)}
                >
                  <span className="month-grid-daynum">{day.day}</span>
                  <span className="month-grid-bars">
                    {visibleEntries.map((entry) => (
                      <span
                        key={entry.key}
                        className="month-grid-event-bar"
                        style={{ background: entry.color, color: readableTextColor(entry.color) }}
                      >
                        {entry.title}
                      </span>
                    ))}
                    {hiddenCount > 0 && <span className="month-grid-event-more">+{hiddenCount} más</span>}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Ya no es una ventana emergente — se queda fija debajo del
              mes, cambiando de contenido al tocar otro día, para poder
              ir de un día a otro sin que nada tape la cuadrícula
              (petición real). */}
          <DayModal
            selectedDate={selectedDate}
            entries={buildEntriesForDate(selectedDate)}
            events={events}
            members={members}
            editingId={editingId}
            onCancelEdit={() => setEditingId(null)}
            onEventChanged={() => {
              setEditingId(null)
              reload()
            }}
            onNavigateDay={changeSelectedDate}
            swipeHandlers={daySwipe}
          />
        </>
      ) : view === 'Vista general' ? (
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

          {/* Vista Mes tal y como estaba antes de las franjas de color —
              un puntito por apunte, se conserva a petición de la familia
              como alternativa más compacta. */}
          <div className="month-grid" onTouchStart={monthSwipe.onTouchStart} onTouchEnd={monthSwipe.onTouchEnd}>
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="month-grid-weekday">
                {w}
              </div>
            ))}
            {monthDays.map((day) => {
              const dayEvents = eventsByDate.get(day.dateStr) ?? []
              const dayExternalEvents = externalEventsByDate.get(day.dateStr) ?? []
              const dayBirthdays = birthdaysByDate.get(day.dateStr) ?? []
              const externalDots = dayExternalEvents.map((ev) => externalEventColor(ev.feedId))
              const birthdayDots = dayBirthdays.map((b) => b.color)
              const dots = [
                ...new Set([
                  ...dayEvents.flatMap((e) => eventDotColors(e, memberColorById)),
                  ...externalDots,
                  ...birthdayDots,
                ]),
              ]
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
                  onClick={() => setSelectedDate(day.dateStr)}
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

          <DayModal
            selectedDate={selectedDate}
            entries={buildEntriesForDate(selectedDate)}
            events={events}
            members={members}
            editingId={editingId}
            onCancelEdit={() => setEditingId(null)}
            onEventChanged={() => {
              setEditingId(null)
              reload()
            }}
            onNavigateDay={changeSelectedDate}
            swipeHandlers={daySwipe}
          />
        </>
      ) : view === 'Agenda' ? (
        <AgendaListView
          today={today}
          buildEntriesForDate={buildEntriesForDate}
          events={events}
          members={members}
          editingId={editingId}
          onCancelEdit={() => setEditingId(null)}
          onEventChanged={() => {
            setEditingId(null)
            reload()
          }}
        />
      ) : view === 'Familiar' ? (
        <FamilyDayView
          selectedDate={selectedDate}
          members={members}
          memberById={memberById}
          dayEvents={eventsByDate.get(selectedDate) ?? []}
          editingId={editingId}
          onEdit={setEditingId}
          onCancelEdit={() => setEditingId(null)}
          onDelete={handleDelete}
          onDeleteOccurrence={handleDeleteOccurrence}
          onEventChanged={() => {
            setEditingId(null)
            reload()
          }}
          onNavigateDay={changeSelectedDate}
          swipeHandlers={daySwipe}
          onQuickAdd={(memberId) => {
            setAddingEventMemberId(memberId)
            setAddingEvent(true)
          }}
        />
      ) : (
        <>
          <TimeGridView
            days={gridDays}
            eventsByDate={eventsByDate}
            externalEventsByDate={externalEventsByDate}
            birthdaysByDate={birthdaysByDate}
            memberById={memberById}
            feedById={feedById}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            swipeHandlers={view === 'Semana' ? weekSwipe : view === '3 días' ? threeDaySwipe : daySwipe}
          />
          <DayModal
            selectedDate={selectedDate}
            entries={buildEntriesForDate(selectedDate)}
            events={events}
            members={members}
            editingId={editingId}
            onCancelEdit={() => setEditingId(null)}
            onEventChanged={() => {
              setEditingId(null)
              reload()
            }}
            onNavigateDay={changeSelectedDate}
            swipeHandlers={daySwipe}
          />
        </>
      )}

      <button
        type="button"
        className="screen-fab"
        onClick={() => {
          setAddingEventMemberId(null)
          setAddingEvent(true)
        }}
      >
        + Nuevo evento
      </button>

      {addingEvent && (
        <div
          className="modal-overlay"
          onClick={() => {
            setAddingEvent(false)
            setAddingEventMemberId(null)
          }}
        >
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Nuevo evento
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setAddingEvent(false)
                  setAddingEventMemberId(null)
                }}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <AddEventForm
              members={members}
              events={events}
              defaultDate={selectedDate}
              defaultMemberIds={addingEventMemberId ? [addingEventMemberId] : undefined}
              hideHeading
              onAdded={() => {
                reload()
                setAddingEvent(false)
                setAddingEventMemberId(null)
              }}
            />
          </div>
        </div>
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
  isExternal: boolean
  recurring: boolean
  done: boolean
  onEdit?: () => void
  onDeleteSeries?: () => void
  onDeleteOccurrence?: () => void
  onComplete?: () => void
  onUncomplete?: () => void
}

// Ventana emergente al pinchar un día — agenda cronológica de arriba
// abajo (todo el día primero, luego por hora), al estilo de otras apps
// de calendario familiar, en vez de agrupar por persona: cada apunte ya
// enseña de quién es en su propia tarjeta, así que no hace falta
// separar en secciones por miembro para verlo de un vistazo.
function DayModal({
  selectedDate,
  entries,
  events,
  members,
  editingId,
  onCancelEdit,
  onEventChanged,
  onNavigateDay,
  swipeHandlers,
}: {
  selectedDate: string
  entries: AgendaEntry[]
  events: CalendarEvent[]
  members: FamilyMember[]
  editingId: string | null
  onCancelEdit: () => void
  onEventChanged: () => void
  onNavigateDay: (deltaDays: number) => void
  swipeHandlers: { onTouchStart: (e: TouchEvent) => void; onTouchEnd: (e: TouchEvent) => void }
}) {
  return (
    <div className="day-panel" onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}>
      <div className="modal-header">
        {/* Arrastrar con el dedo cambia de día (petición real); estas
            flechas hacen lo mismo con un toque, para quien prefiera
            tocar en vez de deslizar. Ya no hay botón de cerrar — el
            día ya no es una ventana emergente, es una tarjeta fija
            debajo del mes (petición real: "en vez de abrir una
            ventana, que se abra debajo y se siga viendo el
            calendario de arriba, para poder cambiar de día rápido
            tocando arriba"). */}
        <div className="month-nav" style={{ margin: 0 }}>
          <button type="button" className="link-button" onClick={() => onNavigateDay(-1)} aria-label="Día anterior">
            ‹
          </button>
          <h2 className="section-title" style={{ margin: 0 }}>
            {new Date(selectedDate + 'T00:00').toLocaleDateString('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h2>
          <button type="button" className="link-button" onClick={() => onNavigateDay(1)} aria-label="Día siguiente">
            ›
          </button>
        </div>
      </div>

      <DayEntriesBody
        entries={entries}
        editingId={editingId}
        events={events}
        members={members}
        onEventChanged={onEventChanged}
        onCancelEdit={onCancelEdit}
      />
    </div>
  )
}

// Cuerpo de una agenda de un día (chips "todo el día" + filas por
// hora) — lo comparten DayModal (Mes) y AgendaListView (vista Agenda),
// para no duplicar el mismo bloque dos veces.
function DayEntriesBody({
  entries,
  editingId,
  events,
  members,
  onEventChanged,
  onCancelEdit,
  emptyLabel = 'Nada este día.',
}: {
  entries: AgendaEntry[]
  editingId: string | null
  events: CalendarEvent[]
  members: FamilyMember[]
  onEventChanged: () => void
  onCancelEdit: () => void
  emptyLabel?: string
}) {
  const allDayEntries = entries.filter((e) => e.allDay)
  const timedEntries = entries.filter((e) => !e.allDay)

  function renderCard(entry: AgendaEntry) {
    if (editingId === entry.id) {
      const ev = events.find((e) => e.id === entry.id)!
      return <EditEventForm key={entry.key} event={ev} members={members} onDone={onEventChanged} onCancel={onCancelEdit} />
    }
    return <AgendaCard key={entry.key} entry={entry} />
  }

  return (
    <>
      {entries.length === 0 && <p className="muted">{emptyLabel}</p>}

      {allDayEntries.length > 0 && (
        <>
          <p className="muted" style={{ margin: '4px 0' }}>
            Todo el día
          </p>
          <div className="agenda-allday-row">
            {allDayEntries.map((entry) =>
              editingId === entry.id ? renderCard(entry) : <AgendaAllDayChip key={entry.key} entry={entry} />,
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
    </>
  )
}

// Vista "Familiar" (foto de referencia): una columna por miembro para
// el día seleccionado, con su "+" propio y sus eventos — los eventos
// sin nadie asignado (memberIds vacío, "Toda la familia") se agrupan
// en una columna aparte, solo si hay alguno ese día.
function FamilyDayView({
  selectedDate,
  members,
  memberById,
  dayEvents,
  editingId,
  onEdit,
  onCancelEdit,
  onDelete,
  onDeleteOccurrence,
  onEventChanged,
  onNavigateDay,
  onQuickAdd,
  swipeHandlers,
}: {
  selectedDate: string
  members: FamilyMember[]
  memberById: Map<string, FamilyMember>
  dayEvents: CalendarEvent[]
  editingId: string | null
  onEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onDeleteOccurrence: (id: string, dateStr: string) => void
  onEventChanged: () => void
  onNavigateDay: (deltaDays: number) => void
  onQuickAdd: (memberId: string | null) => void
  swipeHandlers: { onTouchStart: (e: TouchEvent) => void; onTouchEnd: (e: TouchEvent) => void }
}) {
  const unassigned = dayEvents.filter((e) => e.memberIds.length === 0)
  const columns: { key: string; label: string; member: FamilyMember | null; events: CalendarEvent[] }[] = [
    ...members.map((m) => ({ key: m.id, label: m.name, member: m, events: dayEvents.filter((e) => e.memberIds.includes(m.id)) })),
    ...(unassigned.length > 0 ? [{ key: 'familia', label: 'Toda la familia', member: null, events: unassigned }] : []),
  ]

  function renderEvent(ev: CalendarEvent) {
    if (editingId === ev.id) {
      return <EditEventForm key={ev.id} event={ev} members={members} onDone={onEventChanged} onCancel={onCancelEdit} />
    }
    return (
      <EventCard
        key={ev.id}
        event={ev}
        memberById={memberById}
        onEdit={() => onEdit(ev.id)}
        onDeleteSeries={() => onDelete(ev.id)}
        onDeleteOccurrence={(dateStr) => onDeleteOccurrence(ev.id, dateStr)}
      />
    )
  }

  return (
    <div onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}>
      <div className="month-nav">
        <button type="button" className="link-button" onClick={() => onNavigateDay(-1)} aria-label="Día anterior">
          ‹
        </button>
        <strong>
          {new Date(selectedDate + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </strong>
        <button type="button" className="link-button" onClick={() => onNavigateDay(1)} aria-label="Día siguiente">
          ›
        </button>
      </div>
      <div className="family-view-columns">
        {columns.map((col) => (
          <div key={col.key} className="family-view-column">
            <div className="family-view-column-header">
              {col.member && <MemberAvatar member={col.member} size={28} />}
              <strong>{col.label}</strong>
            </div>
            <button type="button" className="link-button family-view-add" onClick={() => onQuickAdd(col.member?.id ?? null)}>
              + Añadir
            </button>
            {col.events.length === 0 ? (
              <p className="muted">No hay eventos</p>
            ) : (
              col.events.map((ev) => renderEvent(ev))
            )}
          </div>
        ))}
        {columns.length === 0 && <p className="muted">Añade miembros a la familia para usar esta vista.</p>}
      </div>
    </div>
  )
}

interface TimeGridBlock {
  key: string
  title: string
  color: string
  startMin: number
  endMin: number
  dateStr: string
}

// Reparte bloques que se solapan en el mismo día en "carriles" en
// paralelo (mismo criterio que cualquier agenda por horas: si dos
// cosas coinciden, se ponen una al lado de otra en vez de tapar una a
// la otra) — ordena por hora de inicio y usa el primer carril libre.
function layoutLanes(blocks: TimeGridBlock[]): (TimeGridBlock & { lane: number; laneCount: number })[] {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin)
  const laneEnds: number[] = []
  const placed = sorted.map((b) => {
    let lane = laneEnds.findIndex((end) => end <= b.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(b.endMin)
    } else {
      laneEnds[lane] = b.endMin
    }
    return { ...b, lane }
  })
  const laneCount = Math.max(1, laneEnds.length)
  return placed.map((p) => ({ ...p, laneCount }))
}

// Vistas "Día" / "3 días" / "Semana" (foto de referencia): cuadrícula
// horaria con los bloques posicionados por su hora real — solo de
// vistazo (tocar un bloque o la cabecera de un día selecciona ese día,
// cuya agenda completa con editar/borrar se ve debajo en DayModal, que
// ya tenía toda esa lógica hecha para la vista Mes).
function TimeGridView({
  days,
  eventsByDate,
  externalEventsByDate,
  birthdaysByDate,
  memberById,
  feedById,
  selectedDate,
  onSelectDate,
  swipeHandlers,
}: {
  days: { dateStr: string; date: Date }[]
  eventsByDate: Map<string, CalendarEvent[]>
  externalEventsByDate: Map<string, ExternalCalendarEvent[]>
  birthdaysByDate: Map<string, { name: string; color: string }[]>
  memberById: Map<string, FamilyMember>
  feedById: Map<string, ExternalCalendarFeed>
  selectedDate: string
  onSelectDate: (dateStr: string) => void
  swipeHandlers: { onTouchStart: (e: TouchEvent) => void; onTouchEnd: (e: TouchEvent) => void }
}) {
  const HOUR_HEIGHT = 52

  function timedBlocksForDate(dateStr: string): TimeGridBlock[] {
    const blocks: TimeGridBlock[] = []
    for (const ev of eventsByDate.get(dateStr) ?? []) {
      if (ev.allDay) continue
      const start = new Date(ev.startAt)
      const startMin = start.getHours() * 60 + start.getMinutes()
      const end = ev.endAt ? new Date(ev.endAt) : null
      const endMin = end ? Math.max(end.getHours() * 60 + end.getMinutes(), startMin + 20) : startMin + 60
      blocks.push({ key: `ev-${ev.id}`, title: ev.title, color: eventColor(ev, memberById), startMin, endMin, dateStr })
    }
    for (const ev of externalEventsByDate.get(dateStr) ?? []) {
      if (ev.allDay) continue
      const start = new Date(ev.startAt)
      const startMin = start.getHours() * 60 + start.getMinutes()
      const end = ev.endAt ? new Date(ev.endAt) : null
      const endMin = end ? Math.max(end.getHours() * 60 + end.getMinutes(), startMin + 20) : startMin + 60
      const feed = feedById.get(ev.feedId)
      const member = feed?.memberId ? memberById.get(feed.memberId) : null
      blocks.push({ key: `ext-${ev.id}`, title: ev.title, color: member?.color ?? '#6b7280', startMin, endMin, dateStr })
    }
    return blocks
  }

  function allDayChipsForDate(dateStr: string): { key: string; title: string; color: string }[] {
    const chips: { key: string; title: string; color: string }[] = []
    for (const ev of eventsByDate.get(dateStr) ?? []) {
      if (ev.allDay) chips.push({ key: `ev-${ev.id}`, title: ev.title, color: eventColor(ev, memberById) })
    }
    for (const ev of externalEventsByDate.get(dateStr) ?? []) {
      if (ev.allDay) chips.push({ key: `ext-${ev.id}`, title: ev.title, color: '#6b7280' })
    }
    for (const b of birthdaysByDate.get(dateStr) ?? []) {
      chips.push({ key: `bday-${b.name}`, title: `🎂 ${b.name}`, color: b.color })
    }
    return chips
  }

  let minHour = 8
  let maxHour = 20
  for (const d of days) {
    for (const b of timedBlocksForDate(d.dateStr)) {
      minHour = Math.min(minHour, Math.floor(b.startMin / 60))
      maxHour = Math.max(maxHour, Math.ceil(b.endMin / 60))
    }
  }
  const totalHeight = (maxHour - minHour) * HOUR_HEIGHT

  return (
    <div className="time-grid" onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}>
      <div className="time-grid-header">
        <div className="time-grid-hour-spacer" />
        {days.map((d) => (
          <button
            type="button"
            key={d.dateStr}
            className={'time-grid-day-header' + (d.dateStr === selectedDate ? ' active' : '')}
            onClick={() => onSelectDate(d.dateStr)}
          >
            <span>{d.date.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
            <strong>{d.date.getDate()}</strong>
          </button>
        ))}
      </div>

      <div className="time-grid-allday-row">
        <div className="time-grid-hour-spacer" />
        {days.map((d) => (
          <div key={d.dateStr} className="time-grid-allday-cell">
            {allDayChipsForDate(d.dateStr).map((c) => (
              <span key={c.key} className="time-grid-allday-chip" style={{ background: c.color }}>
                {c.title}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="time-grid-body">
        <div className="time-grid-hours">
          {Array.from({ length: maxHour - minHour }, (_, i) => minHour + i).map((h) => (
            <div key={h} className="time-grid-hour-label" style={{ height: HOUR_HEIGHT }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        <div className="time-grid-columns">
          {days.map((d) => {
            const blocks = layoutLanes(timedBlocksForDate(d.dateStr))
            return (
              <div
                key={d.dateStr}
                className="time-grid-column"
                style={{ height: totalHeight }}
                onClick={() => onSelectDate(d.dateStr)}
              >
                {Array.from({ length: maxHour - minHour }).map((_, i) => (
                  <div key={i} className="time-grid-hour-line" style={{ top: i * HOUR_HEIGHT }} />
                ))}
                {blocks.map((b) => (
                  <button
                    type="button"
                    key={b.key}
                    className="time-grid-block"
                    style={{
                      top: ((b.startMin - minHour * 60) / 60) * HOUR_HEIGHT,
                      height: Math.max(20, ((b.endMin - b.startMin) / 60) * HOUR_HEIGHT),
                      left: `${(b.lane / b.laneCount) * 100}%`,
                      width: `${100 / b.laneCount}%`,
                      background: b.color,
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectDate(b.dateStr)
                    }}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Vista "Agenda" (foto de referencia): lista cronológica continua a
// partir de hoy, agrupada por día — se saltan los días sin nada, salvo
// hoy, que siempre aparece aunque esté vacío (para orientarse).
function AgendaListView({
  today,
  buildEntriesForDate,
  events,
  members,
  editingId,
  onCancelEdit,
  onEventChanged,
}: {
  today: Date
  buildEntriesForDate: (dateStr: string) => AgendaEntry[]
  events: CalendarEvent[]
  members: FamilyMember[]
  editingId: string | null
  onCancelEdit: () => void
  onEventChanged: () => void
}) {
  const AGENDA_DAYS = 30
  const days = useMemo(() => {
    const list: { dateStr: string; date: Date }[] = []
    for (let i = 0; i < AGENDA_DAYS; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
      list.push({ dateStr: toDateStr(d), date: d })
    }
    return list
  }, [today])

  function dayLabel(d: Date, i: number): string {
    const weekdayDate = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    const capitalized = weekdayDate.charAt(0).toUpperCase() + weekdayDate.slice(1)
    if (i === 0) return `Hoy - ${capitalized}`
    if (i === 1) return `Mañana - ${capitalized}`
    return capitalized
  }

  const visibleDays = days
    .map((d, i) => ({ ...d, i, entries: buildEntriesForDate(d.dateStr) }))
    .filter((d) => d.i === 0 || d.entries.length > 0)

  return (
    <div className="event-list">
      {visibleDays.map((d) => (
        <div key={d.dateStr}>
          <div className="agenda-day-header">{dayLabel(d.date, d.i)}</div>
          <DayEntriesBody
            entries={d.entries}
            editingId={editingId}
            events={events}
            members={members}
            onEventChanged={onEventChanged}
            onCancelEdit={onCancelEdit}
            emptyLabel="Nada hoy."
          />
        </div>
      ))}
    </div>
  )
}

// Chip de "todo el día" — solo lectura al vistazo; para editar/borrar se
// usa la tarjeta normal (AgendaCard), no hace falta duplicar esos
// controles en un chip tan pequeño.
// Antes esta etiqueta era solo de adorno: no se podía pulsar para
// editar ni tenía botón de borrar, así que un evento "todo el día"
// (sin hora, como "Cole cerrado") no se podía tocar una vez guardado —
// bug real reportado, se notó porque el autocompletado de títulos
// copia "todo el día" del evento anterior, así que de golpe había
// varios eventos así seguidos, todos igual de intocables.
function AgendaAllDayChip({ entry }: { entry: AgendaEntry }) {
  const [confirming, setConfirming] = useState(false)
  const canDelete = !!entry.onDeleteSeries

  const textColor = readableTextColor(entry.color)

  if (confirming) {
    return (
      <span className="agenda-allday-chip" style={{ background: entry.color, color: textColor }}>
        ¿Seguro?
        <button type="button" className="agenda-allday-chip-action" onClick={entry.onDeleteSeries}>
          Borrar
        </button>
        <button type="button" className="agenda-allday-chip-action" onClick={() => setConfirming(false)}>
          Cancelar
        </button>
      </span>
    )
  }

  return (
    <span
      className={'agenda-allday-chip' + (entry.done ? ' agenda-allday-chip-done' : '')}
      style={{ background: entry.color, color: textColor }}
    >
      <span
        onClick={entry.onEdit}
        style={{ cursor: entry.onEdit ? 'pointer' : 'default' }}
      >
        {entry.done ? '✔️ ' : entry.isExternal ? '🔗 ' : ''}
        {entry.title}
        {entry.subtitle && <span className="agenda-allday-chip-sub"> · {entry.subtitle}</span>}
      </span>
      {/* "Hecho" ya no lo quita del calendario — se queda marcado, y se
          puede deshacer aquí mismo si hizo falta marcarlo sin querer
          (petición real: "quiero poder verlo posteriormente lo que he
          hecho y cuándo lo he hecho, no quiero que desaparezca"). */}
      {entry.onComplete && (
        <button type="button" className="agenda-allday-chip-action" onClick={entry.onComplete}>
          ✓ Hecho
        </button>
      )}
      {entry.onUncomplete && (
        <button type="button" className="agenda-allday-chip-action" onClick={entry.onUncomplete}>
          ↺ Deshacer
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="agenda-allday-chip-close"
          onClick={() => setConfirming(true)}
          aria-label="Borrar"
        >
          ✕
        </button>
      )}
    </span>
  )
}

function AgendaCard({ entry }: { entry: AgendaEntry }) {
  const [confirming, setConfirming] = useState(false)
  const canDelete = !!entry.onDeleteSeries
  return (
    <div
      className={'agenda-card' + (entry.done ? ' agenda-card-done' : '')}
      style={{ background: entry.color, color: readableTextColor(entry.color) }}
    >
      {/* X siempre visible en la esquina — antes solo había "Borrar" en
          texto pequeño abajo, junto a "Editar", y no se veía a simple
          vista dónde quitar algo (bug/petición real: "ponle una X"). */}
      {canDelete && !confirming && (
        <button
          type="button"
          className="agenda-card-close"
          onClick={() => setConfirming(true)}
          aria-label="Borrar"
        >
          ✕
        </button>
      )}
      <div className="agenda-card-title">
        {entry.done ? '✔️ ' : entry.isExternal ? '🔗 ' : ''}
        {entry.title}
      </div>
      {entry.subtitle && <div className="agenda-card-subtitle">{entry.subtitle}</div>}
      {!confirming && (entry.onEdit || entry.onComplete || entry.onUncomplete) && (
        <div className="agenda-card-actions">
          {/* "Hecho" ya no lo quita del calendario — se queda marcado
              (con el título tachado) y se puede deshacer aquí mismo si
              hizo falta marcarlo sin querer (petición real: "quiero
              poder verlo posteriormente lo que he hecho y cuándo, no
              quiero que desaparezca"). */}
          {entry.onComplete && (
            <button type="button" onClick={entry.onComplete}>
              ✓ Hecho
            </button>
          )}
          {entry.onUncomplete && (
            <button type="button" onClick={entry.onUncomplete}>
              ↺ Deshacer
            </button>
          )}
          {entry.onEdit && (
            <button type="button" onClick={entry.onEdit}>
              Editar
            </button>
          )}
        </div>
      )}
      {confirming && (
        <div className="agenda-card-actions">
          <span>¿Seguro?</span>
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
  // Antes solo la vista Mes (DayModal, que ya sabe qué día se está
  // mirando) podía ofrecer "solo este día" — desde Lista, un evento
  // recurrente solo se veía UNA vez (la serie entera, sin ningún día
  // concreto asociado), así que solo se ofrecía borrar la serie
  // entera, sin avisar de que no había otra opción (bug real
  // reportado: "desde el ordenador no me ha dado la opción... se me ha
  // borrado toda la serie sin decírselo yo"). Ahora también se puede
  // elegir un día aquí mismo, escribiéndolo.
  onDeleteOccurrence?: (dateStr: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [pickingDay, setPickingDay] = useState(false)
  const [occurrenceDate, setOccurrenceDate] = useState(() => toDateStr(new Date(ev.startAt)))
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
          return <MemberAvatar key={id} member={m} size={24} />
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
        ) : pickingDay ? (
          <>
            <input
              type="date"
              value={occurrenceDate}
              onChange={(e) => setOccurrenceDate(e.target.value)}
              style={{ width: 140 }}
            />
            <button
              type="button"
              className="link-button"
              onClick={() => {
                onDeleteOccurrence?.(occurrenceDate)
                setPickingDay(false)
                setConfirming(false)
              }}
            >
              Borrar ese día
            </button>
            <button type="button" className="link-button" onClick={() => setPickingDay(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <span className="muted">¿Seguro?</span>
            {onDeleteOccurrence && ev.recurrenceRule && (
              <button type="button" className="link-button" onClick={() => setPickingDay(true)}>
                Solo un día
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
          <MemberAvatar member={m} size={18} />
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
  const [points, setPoints] = useState(event.points)
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
      // Mismo respaldo que al crear: si no hay nadie marcado pero el
      // título ya dice quién es, se asigna solo en vez de quedarse gris.
      const detectedMember = selectedMembers.length === 0 ? findMemberInText(title, members) : null
      const effectiveMembers = selectedMembers.length > 0 ? selectedMembers : detectedMember ? [detectedMember.id] : []
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
        memberIds: effectiveMembers,
        points: effectiveMembers.length === 1 ? points : 0,
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
      {/* Puntos: solo tiene sentido cuando el evento es de una sola
          persona — para un niño, o también para un adulto si se quiere
          (petición real: "cuando le asignemos un evento a un niño...
          podemos crear una forma de darle puntos o recompensas... o a
          los adultos también"). Al marcarlo "Hecho" esa persona se los
          lleva. */}
      {selectedMembers.length === 1 && (
        <label>
          Puntos al marcarlo "Hecho" (opcional)
          <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
      )}
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
  events,
  onAdded,
  defaultDate,
  defaultMemberIds,
  hideHeading,
}: {
  members: FamilyMember[]
  events: CalendarEvent[]
  onAdded: () => void
  defaultDate?: string
  defaultMemberIds?: string[]
  hideHeading?: boolean
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
  const [selectedMembers, setSelectedMembers] = useState<string[]>(defaultMemberIds ?? [])
  const [points, setPoints] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Autocompletado a partir de eventos ya creados con el mismo título
  // (p. ej. "Cole cerrado" un día suelto distinto cada vez) — copia
  // hora, duración, recurrencia, avisos y para quién del más reciente
  // que coincida, dejando la fecha tal cual estuviera y todo editable
  // antes de guardar (igual que ya se hace al escribir un contacto ya
  // creado en Contactos).
  function handleTitleChange(value: string) {
    setTitle(value)
    const matches = events.filter((e) => e.title.trim().toLowerCase() === value.trim().toLowerCase())
    if (matches.length === 0) return
    const match = matches.reduce((latest, e) => (e.startAt > latest.startAt ? e : latest))
    const pad = (n: number) => String(n).padStart(2, '0')
    const start = new Date(match.startAt)
    setTime(match.allDay ? '' : `${pad(start.getHours())}:${pad(start.getMinutes())}`)
    setEndTime(match.allDay || !match.endAt ? '' : (() => {
      const end = new Date(match.endAt!)
      return `${pad(end.getHours())}:${pad(end.getMinutes())}`
    })())
    setAllDay(match.allDay)
    const parsed = parseRecurrenceRule(match.recurrenceRule)
    setRecurrence({
      freq: parsed.freq,
      byDay: parsed.byDay,
      interval: parsed.interval,
      skipHolidays: parsed.skipHolidays,
      until: parsed.until ?? '',
    })
    setReminders(match.reminders)
    setSelectedMembers(match.memberIds)
    setPoints(match.points)
  }

  const uniqueTitles = Array.from(new Set(events.map((e) => e.title)))

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
      // Si no se ha marcado ninguna casilla de "para quién" pero el
      // título ya lo dice ("Baja maternidad Jennifer"), se asigna solo
      // — igual que ya hace Pepa por voz — en vez de guardarlo en gris
      // sin dueño (bug real: se creó así y no salía con su color).
      const detectedMember = selectedMembers.length === 0 ? findMemberInText(title, members) : null
      const effectiveMembers = selectedMembers.length > 0 ? selectedMembers : detectedMember ? [detectedMember.id] : []
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
        memberIds: effectiveMembers,
        points: effectiveMembers.length === 1 ? points : 0,
      })
      setTitle('')
      setDate(defaultDate ?? '')
      setTime('')
      setEndTime('')
      setRecurrence({ freq: '', byDay: [], interval: 1, skipHolidays: false, until: '' })
      setReminders([])
      setSelectedMembers([])
      setPoints(0)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el evento')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      {!hideHeading && <h2>Nuevo evento</h2>}
      <label>
        Título
        <input
          type="text"
          list="event-titles"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          required
        />
        <datalist id="event-titles">
          {uniqueTitles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
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
      {selectedMembers.length === 1 && (
        <label>
          Puntos al marcarlo "Hecho" (opcional)
          <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
      )}
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

      <GoogleCalendarSyncCard />

      <CalendarExportCard />

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
            {f.memberId && memberById.get(f.memberId) && <MemberAvatar member={memberById.get(f.memberId)!} size={24} />}
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
              <ConfirmButton label="Quitar" onConfirm={() => handleDeleteFeed(f.id)} />
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
              style={
                fillColor && !isSelected
                  ? { background: fillColor, borderColor: fillColor, color: readableTextColor(fillColor) }
                  : undefined
              }
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

// Conexión de verdad, cada hora, vía la API de Google Calendar — a
// diferencia de CalendarExportCard (más abajo), que depende de que
// Google decida cuándo mirar la URL. Se recomienda esta primero porque
// SÍ puede cumplir "cada hora" (petición real); la de abajo queda como
// alternativa para quien no quiera dar permiso de escritura o use
// Apple Calendar sin cuenta de Google.
function GoogleCalendarSyncCard() {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  function load() {
    getGoogleCalendarStatus()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(() => {
    // Google trae de vuelta aquí con ?google=connected|error tras el
    // consentimiento (ver google-calendar-oauth-callback) — se lee una
    // vez y se limpia de la URL para que un refresco de página no lo
    // vuelva a mostrar.
    const params = new URLSearchParams(window.location.search)
    const result = params.get('google')
    if (result === 'connected') setNotice('✓ Conectado con Google Calendar.')
    else if (result === 'error') setNotice(`No se pudo conectar (${params.get('detail') ?? 'error'}).`)
    if (result) {
      params.delete('google')
      params.delete('detail')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
    load()
  }, [])

  async function connect() {
    setBusy(true)
    setError('')
    try {
      await startGoogleConnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError('')
    try {
      await disconnectGoogleCalendar()
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card member-form">
      <h2>Conectar con Google Calendar (recomendado)</h2>
      <p className="muted">
        Un solo permiso y la app mantiene un calendario "Family App" dentro de tu Google Calendar siempre al día,
        cada hora — se ve igual en Android y en iPhone si usas la app de Google Calendar en los dos.
      </p>
      {notice && <p className="muted">{notice}</p>}
      {error && <p className="error">{error}</p>}
      {status?.connected ? (
        <>
          <p className="muted">
            {status.lastSyncedAt
              ? `Última sincronización: ${new Date(status.lastSyncedAt).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}`
              : 'Conectado — la primera sincronización llega en la próxima hora en punto.'}
          </p>
          {status.lastSyncError && <p className="error">{status.lastSyncError}</p>}
          <ConfirmButton label="Desconectar" onConfirm={disconnect} />
        </>
      ) : (
        <button type="button" onClick={connect} disabled={busy}>
          {busy ? 'Abriendo Google…' : 'Conectar con Google'}
        </button>
      )}
    </div>
  )
}

// Sentido contrario a "Calendarios enlazados": aquí es el calendario
// de la app el que se ofrece para que Google Calendar (Android/iPhone)
// o Apple Calendar se suscriban — petición real: "quiero que todos los
// datos que hayan en el calendario de la app se pasen al calendario
// del móvil". OJO con lo que se promete: Google/Apple deciden ELLOS
// cada cuánto vuelven a mirar una suscripción por URL (normalmente una
// vez al día), así que "cada hora" no se puede garantizar desde aquí —
// se dice claramente en vez de callarlo.
function CalendarExportCard() {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function load() {
    setError('')
    try {
      setUrl(await getCalendarExportUrl())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso de portapapeles (poco común) — la URL ya está
      // visible en pantalla para copiarla a mano.
    }
  }

  return (
    <div className="card member-form">
      <h2>Exportar tu calendario al móvil</h2>
      <p className="muted">
        Añade esta dirección como "calendario por URL" en Google Calendar (Android o iPhone) o en Apple Calendar
        (iPhone) para ver aquí todo lo que apuntes en la app. Google/Apple deciden cada cuánto la vuelven a mirar
        (normalmente una vez al día) — no se puede forzar a que sea siempre al momento.
      </p>
      {error && <p className="error">{error}</p>}
      {!url && (
        <button type="button" onClick={load}>
          Generar mi enlace
        </button>
      )}
      {url && (
        <>
          <div className="voice-text-form">
            <input type="text" value={url} readOnly onFocus={(e) => e.target.select()} />
            <button type="button" onClick={copy}>
              {copied ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Android: Google Calendar → Ajustes → Añadir calendario → Desde URL. iPhone: Ajustes → Calendario →
            Cuentas → Añadir cuenta → Otra → Añadir calendario suscrito.
          </p>
        </>
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
