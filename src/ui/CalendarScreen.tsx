import { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, TouchEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { findMemberInText } from '@/domain/voiceQuery'
import {
  CALENDARIO_MENU_ITEM_META,
  calendarioMenuEntryMeta,
  isCustomCalendarioMenuKey,
  firstCalendarioView,
  loadCalendarioMenuLayout,
  loadCalendarioPinnedItems,
  saveCalendarioMenuLayout,
  saveCalendarioPinnedItems,
  type CalendarioMenuEntry,
  type CalendarioMenuGroup,
  type CalendarioMenuItemKey,
} from '@/state/calendarioMenu'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { useSectionHome } from '@/ui/useSectionHome'
import { CalendarCategoriesSection } from '@/ui/MenuSettingsScreen'
import {
  completeEventOccurrence,
  createEvent,
  deleteEvent,
  deleteEventOccurrence,
  getCalendarPreferences,
  getEventAttachmentUrl,
  listCalendarCategories,
  listEventCompletions,
  listUpcomingEvents,
  uncompleteEventOccurrence,
  updateEvent,
  uploadEventFile,
  uploadEventPhoto,
  type CalendarColorMode,
  type CalendarPreferences,
  type CalendarTaskCompletionPrefs,
  type CalendarTaskOrder,
  type EventCompletion,
} from '@/data/calendar'
import { listFamilyMembers } from '@/data/family'
import { listContacts } from '@/data/contacts'
import { addPersonalNote, deletePersonalNote, listPersonalNotes, type PersonalNote } from '@/data/personalNotes'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
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
  entryTimeLabel,
  eventDotColors,
  expandOccurrences,
  getMonthGridDays,
  groupEventsAndTasks,
  isWeekend,
  MONTH_LABELS,
  occurrenceAt,
  readableTextColor,
  shortLocationLabel,
  shouldIncludeInPersonal,
  WEEKDAY_LABELS,
} from '@/domain/calendar'
import { toPastel } from '@/domain/colors'
import { shareText } from '@/services/share'
import { ShareFallbackModal } from '@/ui/ShareFallbackModal'
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
import type { CalendarCategory, CalendarEvent, Contact, FamilyMember, Profile } from '@/domain/types'
import calendarHeaderImg from '@/assets/calendario/calendar-header.jpg'
import { getCurrentPosition } from '@/services/geolocation'
import { reverseGeocode } from '@/services/geocoding'
import { LocationPickerModal } from '@/ui/LocationPickerModal'
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
import { errorMessage } from '@/domain/errorMessage'

// Skill: vistas de calendario al estilo de referencia (foto aportada
// por la familia) — Agenda, Familiar, Día, 3 días y Semana se suman al
// Mes y Externos que ya había.
const VIEWS = ['Mes', 'Vista general', 'Semana', '3 días', 'Día', 'Familiar', 'Agenda', 'Personal', 'Externos'] as const
type ViewMode = (typeof VIEWS)[number]

function isCalendarioSubTab(key: CalendarioMenuItemKey): key is ViewMode {
  return (VIEWS as readonly string[]).includes(key)
}

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

export function CalendarScreen({ profile }: { profile: Profile }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [eventCompletions, setEventCompletions] = useState<EventCompletion[]>([])
  const [externalEvents, setExternalEvents] = useState<ExternalCalendarEvent[]>([])
  const [externalFeeds, setExternalFeeds] = useState<ExternalCalendarFeed[]>([])
  const [externalDismissals, setExternalDismissals] = useState<ExternalEventDismissal[]>([])
  const [externalCompletions, setExternalCompletions] = useState<ExternalEventCompletion[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>([])
  // FASE CALENDARIO — categorías propias del Calendario y preferencias de visualización POR USUARIO
  // (profiles: calendar_color_mode/calendar_task_order, nunca families/localStorage — ver data/calendar.ts).
  const [categories, setCategories] = useState<CalendarCategory[]>([])
  // Valor inicial = el nuevo default ('categorias', el modo híbrido) — solo se ve en el instante antes
  // de que reload() resuelva getCalendarPreferences(), y en ese instante tampoco hay categories/events
  // todavía, así que no llega a notarse ningún color "equivocado".
  const [calendarPrefs, setCalendarPrefs] = useState<CalendarPreferences>({
    colorMode: 'categorias',
    taskOrder: 'eventos_primero',
    taskCompletion: { strikethrough: true, doneColor: null, moveCompletedToEnd: false },
  })
  // RETOQUE — engranaje ⚙️ junto a "Categoría (opcional)" (Evento/Tarea, alta y edición): gestionar
  // calendar_categories SIN salir del formulario que se tenga a medias. Nunca se navega a Configuración
  // (eso desmontaría CalendarScreen y con él cualquier formulario abierto, perdiendo lo escrito) — se
  // reutiliza CalendarCategoriesSection tal cual, montada aparte en un modal propio de esta pantalla.
  const [managingCategories, setManagingCategories] = useState(false)
  // Solo recarga las categorías (nunca events/members/... como el reload() grande, que además pondría
  // loading=true y desmontaría toda la pantalla con "Cargando calendario…" — se perdería el formulario
  // abierto detrás del modal de categorías). Así, al crear una categoría nueva ahí, el desplegable
  // "Categoría (opcional)" del formulario la ve de inmediato en cuanto se cierra el modal.
  function reloadCategories() {
    listCalendarCategories().then(setCategories).catch(() => {})
  }
  // Quién soy yo dentro de la familia (si tengo un miembro propio enlazado) — lo necesita Personal para
  // enseñar MIS Eventos/Tareas, además de mis notas. Mismo patrón que myMemberId en FinanceScreen.tsx.
  const myMemberId = useMemo(() => members.find((m) => m.linkedProfileId === profile.id)?.id ?? null, [members, profile.id])
  // Botón flotante "Nuevo evento", tocable desde cualquier parte de la
  // pestaña — petición real: "esa misma idea [la de Contactos] la
  // vamos a aplicar al calendario: botón flotante Nuevo evento y
  // formulario en ventana emergente".
  const [addingEvent, setAddingEvent] = useState(false)
  // FASE CALENDARIO — segundo FAB, formulario reducido (ver AddTaskForm).
  const [addingTask, setAddingTask] = useState(false)
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
  // Bug real reportado: "calendario tampoco se puede compartir" — no
  // fallaba, caía en copiar al portapapeles EN SILENCIO cuando no hay
  // menú nativo de compartir (típico en ordenador), sin avisar nada —
  // parecía que no había pasado nada. Mismo aviso que ya tienen
  // Compras/Recetas.
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  // Bug real reportado: "no hace nada" al tocar compartir, sin poder
  // ver la pantalla del móvil para saber en qué paso se queda — marca
  // qué evento está en ello para dar una señal visible de que el toque
  // SÍ se ha registrado, aunque lo que pase después dependa del navegador.
  const [sharingEventKey, setSharingEventKey] = useState<string | null>(null)
  const [sharingNoteId, setSharingNoteId] = useState<string | null>(null)
  // Bug real reportado: "en Android y en ordenador no funciona, en
  // iPhone sí" (confirmado en dos Android distintos) — cuando ni el
  // menú nativo ni el portapapeles funcionan aquí, en vez de un aviso
  // sin más se abre una ventana con el texto listo para copiar a mano
  // o mandar directo por WhatsApp/email.
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)
  function flashShareNotice(msg: string) {
    setShareNotice(msg)
    setTimeout(() => setShareNotice(null), 5000)
  }
  const [editingId, setEditingId] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(() => firstCalendarioView(loadCalendarioMenuLayout()))
  // "Calendario" del breadcrumb siempre vuelve a 'Vista general' (el identificador interno de "Inicio"
  // en UI) — no a firstCalendarioView(), que puede ser otra vista si la familia reordenó su menú ☰.
  useSectionHome(() => setView('Vista general'))
  // Petición real: "esas pestañas las metes en una con tres rayas
  // igual, un desplegable... con el mismo formato que economía, que se
  // puedan sacar, que se puedan quitar, que se puedan editar" — mismo
  // desplegable ☰ que Economía/Alimentación/Compras/Ubicación. Los
  // nombres de los miembros (filtro de abajo) se quedan siempre
  // visibles, fuera del desplegable — petición real explícita.
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false)
  const [pinnedViews, setPinnedViews] = useState<CalendarioMenuItemKey[]>(() => loadCalendarioPinnedItems())
  const [calendarMenuLayout, setCalendarMenuLayout] = useState<CalendarioMenuGroup[]>(() => loadCalendarioMenuLayout())
  const [calendarPlaceholderNotice, setCalendarPlaceholderNotice] = useState(false)
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
      listPersonalNotes(),
      listCalendarCategories(),
      getCalendarPreferences(),
    ])
      .then(([e, m, h, ee, ef, ct, evc, ed, eec, pn, cat, prefs]) => {
        setEvents(e)
        setMembers(m)
        setHolidayDates(h)
        setExternalEvents(ee)
        setExternalFeeds(ef)
        setContacts(ct)
        setEventCompletions(evc)
        setExternalDismissals(ed)
        setExternalCompletions(eec)
        setPersonalNotes(pn)
        setCategories(cat)
        setCalendarPrefs(prefs)
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
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  // Solo las categorías CON color — "sin color de categoría" cae de forma segura en el color de miembro
  // (ver eventColor/eventDotColors más abajo), nunca en un string vacío que pudiera pintar algo invisible.
  const categoryColorById = useMemo(() => new Map(categories.filter((c) => c.color).map((c) => [c.id, c.color as string])), [categories])

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
    // FASE CALENDARIO — orden Eventos/Tareas cuando ambos caen el mismo día (Configuración → Calendario).
    // Un único punto de orden para TODA la pantalla: DayModal/Agenda/Mes/TimeGridView/Familiar parten
    // todos de este mismo mapa. Sort ESTABLE (garantizado desde ES2019): dentro de cada tipo se conserva
    // el orden que ya traía la lista, nunca se reordena por ningún otro criterio aquí.
    const taskFirst = calendarPrefs.taskOrder === 'tareas_primero'
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.kind === b.kind) return 0
        return (a.kind === 'task') === taskFirst ? -1 : 1
      })
    }
    return map
  }, [filteredEvents, monthDays, holidayDates, calendarPrefs.taskOrder])

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
      setError(errorMessage(err, 'No se pudo borrar el evento'))
    }
  }

  async function handleDeleteOccurrence(id: string, dateStr: string) {
    try {
      await deleteEventOccurrence(id, dateStr)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar ese día'))
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
      setError(errorMessage(err, 'No se pudo marcar como hecho'))
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
      setError(errorMessage(err, 'No se pudo deshacer'))
    }
  }

  // Petición real: "Calendario: compartir un evento específico... que la
  // otra persona se lo pueda anotar en su calendario, no tiene por qué
  // ser de nuestra app" — se manda como .ics suelto (sin nuestro RRULE
  // ni recordatorios internos), recolocado sobre el día que se está
  // viendo si el evento es recurrente.
  async function handleShareEvent(ev: CalendarEvent, dateStr: string) {
    const key = `${ev.id}-${dateStr}`
    setSharingEventKey(key)
    const occ = occurrenceAt(ev, dateStr)
    const when = new Date(occ.startAt).toLocaleString('es-ES', {
      dateStyle: 'medium',
      timeStyle: ev.allDay ? undefined : 'short',
    })
    const plainText = [ev.title, when, ev.description?.trim() || null].filter(Boolean).join('\n')
    // Bug real reportado, varias veces, en Android y ordenador (nunca en
    // iPhone): compartir el .ics como ARCHIVO abría el menú nativo, pero
    // WhatsApp/Instagram/etc. no aparecían como destino — la mayoría de
    // apps de Android no se registran para recibir text/calendar, así
    // que canShare()/share() podían "tener éxito" técnicamente sin
    // ofrecer ningún sitio real donde mandarlo. Texto plano sí lo acepta
    // cualquier app de mensajería, así que ahora se comparte siempre así
    // — se pierde el "añadir directo al calendario" de un .ics real,
    // pero se gana que el menú "con quién compartir" salga siempre
    // poblado.
    try {
      const shownText = await shareText({ title: ev.title, text: plainText })
      if (!shownText) flashShareNotice('Copiado al portapapeles.')
    } catch {
      // Ni el menú nativo ni el portapapeles han podido usarse aquí — la
      // pantalla ofrece la ventana de respaldo (copiar / WhatsApp / email).
      setManualShare({ title: ev.title, text: plainText })
    } finally {
      setSharingEventKey((k) => (k === key ? null : k))
    }
  }

  // Petición real: "en las notas no se puede compartir" — las notas
  // personales (🔒 privadas dentro de la familia, ver PersonalNotesView)
  // se pueden mandar igualmente fuera de la app, mismo mecanismo que
  // eventos/contactos: menú nativo con texto plano → portapapeles →
  // ventana de respaldo.
  async function handleShareNote(note: PersonalNote) {
    setSharingNoteId(note.id)
    try {
      const shownText = await shareText({ title: 'Nota', text: note.text })
      if (!shownText) flashShareNotice('Copiado al portapapeles.')
    } catch {
      setManualShare({ title: 'Nota', text: note.text })
    } finally {
      setSharingNoteId((id) => (id === note.id ? null : id))
    }
  }

  async function handleDismissExternalOccurrence(feedId: string, uid: string, dateStr: string) {
    try {
      await dismissExternalEventOccurrence(feedId, uid, dateStr)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar ese día'))
    }
  }

  async function handleDismissExternalSeries(feedId: string, uid: string) {
    try {
      await dismissExternalEventSeries(feedId, uid)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar'))
    }
  }

  async function handleCompleteExternal(feedId: string, uid: string, dateStr: string) {
    try {
      await completeExternalEventOccurrence(feedId, uid, dateStr)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo marcar como hecho'))
    }
  }

  async function handleUncompleteExternal(feedId: string, uid: string, dateStr: string) {
    try {
      await uncompleteExternalEventOccurrence(feedId, uid, dateStr)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo deshacer'))
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
        // El emoji de categoría NUNCA depende del modo de color (Parte 6) — sigue visible aunque la
        // persona esté viendo colores por miembro.
        const category = ev.categoryId ? categoryById.get(ev.categoryId) : null
        const titleWithCategory = category ? `${category.emoji} ${ev.title}` : ev.title
        const baseColors = eventColors(ev, memberById, calendarPrefs.colorMode, categoryColorById)
        const colors = effectiveEntryColors(ev.kind, baseColors, done, calendarPrefs.taskCompletion)
        return {
          key: `ev-${ev.id}`,
          id: ev.id,
          title: ev.visibility === 'private' ? `🔒 ${titleWithCategory}` : titleWithCategory,
          subtitle,
          color: colors[0],
          colors,
          allDay: ev.allDay,
          startTime: ev.allDay ? null : hhmm(ev.startAt),
          endTime: !ev.allDay && ev.endAt ? hhmm(ev.endAt) : null,
          isExternal: false,
          recurring: !!ev.recurrenceRule,
          done,
          kind: ev.kind,
          strikethrough: shouldStrikethroughEntry(ev.kind, done, calendarPrefs.taskCompletion),
          onEdit: () => setEditingId(ev.id),
          onDeleteSeries: () => handleDelete(ev.id),
          onDeleteOccurrence: () => handleDeleteOccurrence(ev.id, dateStr),
          onComplete: done ? undefined : () => handleCompleteEvent(ev.id, dateStr),
          onUncomplete: done ? () => handleUncompleteEvent(ev.id, dateStr) : undefined,
          onShare: () => handleShareEvent(ev, dateStr),
          sharing: sharingEventKey === `${ev.id}-${dateStr}`,
          attachmentStoragePath: ev.attachmentStoragePath,
          attachmentKind: ev.attachmentKind,
          attachmentOriginalName: ev.attachmentOriginalName,
          locationLabel: ev.locationLabel,
          locationLatitude: ev.locationLatitude,
          locationLongitude: ev.locationLongitude,
          note: ev.note,
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
          colors: [member?.color ?? '#6b7280'],
          allDay: ev.allDay,
          startTime: ev.allDay ? null : hhmm(ev.startAt),
          endTime: !ev.allDay && ev.endAt ? hhmm(ev.endAt) : null,
          isExternal: true,
          recurring: !!ev.recurrenceRule,
          done,
          strikethrough: done,
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
        colors: [b.color],
        allDay: true,
        startTime: null,
        endTime: null,
        isExternal: false,
        recurring: true,
        done: false,
        strikethrough: false,
      })),
    ].sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return (a.startTime ?? '').localeCompare(b.startTime ?? '')
    })
  }

  function persistCalendarMenuLayout(next: CalendarioMenuGroup[]) {
    setCalendarMenuLayout(next)
    saveCalendarioMenuLayout(next)
  }

  function toggleCalendarPinnedItem(key: CalendarioMenuItemKey) {
    setPinnedViews((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      saveCalendarioPinnedItems(next)
      return next
    })
  }

  function handleCalendarMenuAction(key: CalendarioMenuItemKey) {
    if (isCalendarioSubTab(key)) setView(key)
  }

  const flatCalendarMenuEntries = calendarMenuLayout.flatMap((g) => g.items)

  if (loading) return <div className="screen">Cargando calendario…</div>


  return (
    <div className="screen">
      {/* Petición real, con imagen de referencia: "ahora lo mismo con
          Calendario" (mismo tratamiento que "La cocina de Pepa"). */}
      <div className="kitchen-header">
        <img src={calendarHeaderImg} alt="Calendario" className="kitchen-header-img" />
        <button
          type="button"
          className="kitchen-header-menu-fab kitchen-header-menu-fab-floating"
          onClick={() => {
            if (!calendarMenuOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
            setCalendarMenuOpen((v) => !v)
          }}
          aria-label={calendarMenuOpen ? 'Cerrar menú de Calendario' : 'Abrir menú de Calendario'}
        >
          {calendarMenuOpen ? '✕' : '☰'} Menú
        </button>
      </div>
      <SectionBreadcrumb subsection={CALENDARIO_MENU_ITEM_META[view].label} />
      {error && <p className="error">{error}</p>}
      {shareNotice && <p className="points-badge">{shareNotice}</p>}

      {calendarMenuOpen && (
        <CalendarioMenuDropdown
          activeTab={view}
          layout={calendarMenuLayout}
          onLayoutChange={persistCalendarMenuLayout}
          pinnedItems={pinnedViews}
          onTogglePin={toggleCalendarPinnedItem}
          onActivate={handleCalendarMenuAction}
          onClose={() => setCalendarMenuOpen(false)}
        />
      )}

      {pinnedViews.length > 0 && (
        <div className="filter-row">
          {flatCalendarMenuEntries
            .filter((entry) => pinnedViews.includes(entry.key))
            .map((entry) => {
              const meta = calendarioMenuEntryMeta(entry)
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={'chip' + (isCalendarioSubTab(entry.key) && view === entry.key ? ' chip-active' : '')}
                  onClick={() => {
                    if (isCustomCalendarioMenuKey(entry.key)) {
                      setCalendarPlaceholderNotice(true)
                      setTimeout(() => setCalendarPlaceholderNotice(false), 2500)
                    } else {
                      handleCalendarMenuAction(entry.key)
                    }
                  }}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
        </div>
      )}
      {calendarPlaceholderNotice && (
        <p className="muted" style={{ fontSize: 12 }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {view !== 'Externos' && view !== 'Personal' && (
        <MemberFilterDropdown
          members={members}
          selected={filterMemberIds}
          onToggle={toggleFilterMember}
          onClear={() => setFilterMemberIds([])}
        />
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
                    (selectedDate === day.dateStr ? ' month-grid-day-selected' : '') +
                    (isWeekend(day.dateStr) ? ' month-grid-day-weekend' : '')
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
                        <EventColorDots colors={entry.colors} style={{ marginLeft: 0, marginRight: 3 }} />
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
            categories={categories}
            taskOrder={calendarPrefs.taskOrder}
            editingId={editingId}
            onCancelEdit={() => setEditingId(null)}
            onEventChanged={() => {
              setEditingId(null)
              reload()
            }}
            onNavigateDay={changeSelectedDate}
            swipeHandlers={daySwipe}
            onManageCategories={() => setManagingCategories(true)}
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
                  ...dayEvents.flatMap((e) => eventDotColors(e, memberColorById, calendarPrefs.colorMode, categoryColorById)),
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
                    (selectedDate === day.dateStr ? ' month-grid-day-selected' : '') +
                    (isWeekend(day.dateStr) ? ' month-grid-day-weekend' : '')
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
            categories={categories}
            taskOrder={calendarPrefs.taskOrder}
            editingId={editingId}
            onCancelEdit={() => setEditingId(null)}
            onEventChanged={() => {
              setEditingId(null)
              reload()
            }}
            onNavigateDay={changeSelectedDate}
            swipeHandlers={daySwipe}
            onManageCategories={() => setManagingCategories(true)}
          />
        </>
      ) : view === 'Agenda' ? (
        <AgendaListView
          today={today}
          buildEntriesForDate={buildEntriesForDate}
          events={events}
          members={members}
          categories={categories}
          taskOrder={calendarPrefs.taskOrder}
          editingId={editingId}
          onCancelEdit={() => setEditingId(null)}
          onEventChanged={() => {
            setEditingId(null)
            reload()
          }}
          onManageCategories={() => setManagingCategories(true)}
        />
      ) : view === 'Familiar' ? (
        <FamilyDayView
          selectedDate={selectedDate}
          members={members}
          memberById={memberById}
          categoryById={categoryById}
          categories={categories}
          categoryColorById={categoryColorById}
          colorMode={calendarPrefs.colorMode}
          taskCompletion={calendarPrefs.taskCompletion}
          taskOrder={calendarPrefs.taskOrder}
          dayEvents={eventsByDate.get(selectedDate) ?? []}
          eventCompletions={eventCompletions}
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
          onQuickAdd={(memberId) => {
            setAddingEventMemberId(memberId)
            setAddingEvent(true)
          }}
          onShareEvent={handleShareEvent}
          onComplete={handleCompleteEvent}
          onUncomplete={handleUncompleteEvent}
          onManageCategories={() => setManagingCategories(true)}
        />
      ) : view === 'Personal' ? (
        <PersonalView
          selectedDate={selectedDate}
          myMemberId={myMemberId}
          entries={buildEntriesForDate(selectedDate)}
          events={events}
          members={members}
          categories={categories}
          taskOrder={calendarPrefs.taskOrder}
          editingId={editingId}
          onCancelEdit={() => setEditingId(null)}
          onEventChanged={() => {
            setEditingId(null)
            reload()
          }}
          notes={personalNotes}
          onNavigateDay={changeSelectedDate}
          swipeHandlers={daySwipe}
          onAdd={async (text) => {
            await addPersonalNote(selectedDate, text)
            reload()
          }}
          onDelete={async (id) => {
            await deletePersonalNote(id)
            reload()
          }}
          onShare={handleShareNote}
          sharingNoteId={sharingNoteId}
          onManageCategories={() => setManagingCategories(true)}
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
            categoryById={categoryById}
            categoryColorById={categoryColorById}
            colorMode={calendarPrefs.colorMode}
            eventCompletions={eventCompletions}
            taskCompletion={calendarPrefs.taskCompletion}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onComplete={handleCompleteEvent}
            onUncomplete={handleUncompleteEvent}
            swipeHandlers={view === 'Semana' ? weekSwipe : view === '3 días' ? threeDaySwipe : daySwipe}
          />
          <DayModal
            selectedDate={selectedDate}
            entries={buildEntriesForDate(selectedDate)}
            events={events}
            members={members}
            categories={categories}
            taskOrder={calendarPrefs.taskOrder}
            editingId={editingId}
            onCancelEdit={() => setEditingId(null)}
            onEventChanged={() => {
              setEditingId(null)
              reload()
            }}
            onNavigateDay={changeSelectedDate}
            swipeHandlers={daySwipe}
            onManageCategories={() => setManagingCategories(true)}
          />
        </>
      )}

      {/* FASE CALENDARIO — Parte 23: Personal ya no se queda fuera (antes se ocultaba porque Personal
          era solo notas; ahora también enseña Eventos/Tareas propios, así que crear uno tiene el mismo
          sentido aquí que en cualquier otra vista). Dos FABs en vez de uno — mismo patrón de grupo
          vertical que .finance-fab-group (Economía), clase propia para no tocar ningún otro .screen-fab
          de la app. "Nuevo evento" se queda en el mismo sitio exacto de siempre (bottom:90px/right:16px,
          column-reverse) para no desplazar el control ya conocido. */}
      <div className="calendar-fab-group">
        <button
          type="button"
          className="calendar-fab"
          onClick={() => {
            setAddingEventMemberId(null)
            setAddingEvent(true)
          }}
        >
          + Nuevo evento
        </button>
        <button type="button" className="calendar-fab calendar-fab-task" onClick={() => setAddingTask(true)}>
          + Nueva tarea
        </button>
      </div>

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
              categories={categories}
              defaultDate={selectedDate}
              defaultMemberIds={addingEventMemberId ? [addingEventMemberId] : undefined}
              hideHeading
              onAdded={() => {
                reload()
                setAddingEvent(false)
                setAddingEventMemberId(null)
              }}
              onManageCategories={() => setManagingCategories(true)}
              defaultVisibility={view === 'Personal' ? 'private' : 'shared'}
            />
          </div>
        </div>
      )}

      {addingTask && (
        <div className="modal-overlay" onClick={() => setAddingTask(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Nueva tarea
              </h2>
              <button type="button" className="modal-close" onClick={() => setAddingTask(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <AddTaskForm
              members={members}
              categories={categories}
              defaultDate={selectedDate}
              onAdded={() => {
                reload()
                setAddingTask(false)
              }}
              onManageCategories={() => setManagingCategories(true)}
              defaultVisibility={view === 'Personal' ? 'private' : 'shared'}
            />
          </div>
        </div>
      )}

      {manualShare && (
        <ShareFallbackModal title={manualShare.title} text={manualShare.text} onClose={() => setManualShare(null)} />
      )}

      {managingCategories &&
        createPortal(
          <ManageCategoriesModal
            onClose={() => {
              setManagingCategories(false)
              reloadCategories()
            }}
          />,
          document.body,
        )}
    </div>
  )
}

// RETOQUE — engranaje ⚙️ (ver CategoryDropdown): la misma gestión de categorías de Configuración →
// Calendario → Categorías del calendario (CalendarCategoriesSection, reutilizada tal cual, nunca una
// segunda implementación), en un modal propio — nunca una navegación de verdad a /menu-organizar, que
// desmontaría esta pantalla (y con ella cualquier formulario de Evento/Tarea abierto detrás) para
// recargarla desde cero. Mismo patrón modal-overlay/modal-sheet que el resto de la app, en un portal a
// document.body (igual que CalendarCategoryEmojiPicker) para que quede siempre por encima, aunque el
// propio formulario de Evento/Tarea ya esté dentro de otro modal-overlay.
function ManageCategoriesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            ⚙️ Categorías del calendario
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <CalendarCategoriesSection />
      </div>
    </div>
  )
}

// RETOQUE — tres modos mutuamente excluyentes (Configuración → Calendario → Colores del calendario),
// resueltos en un único sitio para que NINGUNA vista pueda usar una regla distinta de otra:
//   'miembros'        — ignora la categoría por completo, siempre el/los color(es) de persona de siempre.
//   'categorias'      — híbrido ("Categorías + personas"): categoría si la tiene con color; si no, cae
//                        en el/los color(es) de persona de siempre. Es el comportamiento que YA tenía el
//                        único modo "categorías" de antes — mismo literal, sin cambios.
//   'solo_categorias' — solo categoría: si la categoría no tiene color, neutro directo — NUNCA cae en
//                        el color de persona en este modo (a diferencia del híbrido).
// Fallback seguro en los tres modos: sin nada aplicable, el gris de siempre, nunca invisible.
//
// Fase 5 (plan de pendientes) — un color POR CADA miembro asignado, nunca solo el primero: mismo bug que
// ya se corrigió para la Vista general (eventDotColors, domain/calendar.ts) pero que seguía sin
// corregirse en el resto de vistas (Mes, Agenda, Semana/Día, chips, Tareas, Vista familiar) — todas
// pintaban solo a la primera persona asignada. Única función de color del archivo: ya no existe una
// variante "solo la primera persona" aparte.
function eventColors(ev: CalendarEvent, memberById: Map<string, FamilyMember>, colorMode: CalendarColorMode, categoryColorById: Map<string, string>): string[] {
  if (ev.color) return [ev.color]
  if (colorMode !== 'miembros' && ev.categoryId) {
    const categoryColor = categoryColorById.get(ev.categoryId)
    if (categoryColor) return [categoryColor]
  }
  if (colorMode === 'solo_categorias') return ['#9ca3af']
  const colors = ev.memberIds.map((id) => memberById.get(id)?.color).filter((c): c is string => !!c)
  return colors.length > 0 ? colors : ['#9ca3af']
}

// RETOQUE — "Tareas completadas" (Configuración → Calendario): tachar/color de completada son
// preferencias PERSONALES, pero solo para Tareas — un Evento completado sigue tachándose SIEMPRE, igual
// que antes de este retoque (auditado: nunca hubo ajuste para Eventos, no se toca su comportamiento
// histórico). El color de completada es una capa visual FINAL: gana sobre el resultado de los tres
// modos (auditado: ev.color — "el color propio del evento" — no lo escribe ningún formulario hoy,
// createEvent/updateEvent no aceptan ese campo; es una columna heredada sin UI que la rellene, así que
// no hay conflicto real con hacer que el color de completada gane también sobre ella).
function shouldStrikethroughEntry(kind: 'event' | 'task' | undefined, done: boolean, taskCompletion: CalendarTaskCompletionPrefs): boolean {
  if (!done) return false
  if (kind !== 'task') return true
  return taskCompletion.strikethrough
}

// Mismo criterio de "Tareas completadas" que arriba, para la versión con un color por persona: el color
// de "Tarea completada" (cuando está fijado) sustituye a TODOS los colores por persona, nunca se mezcla
// con ellos — una tarea hecha se ve de un solo color igual que antes, sin puntitos de más.
function effectiveEntryColors(kind: 'event' | 'task' | undefined, baseColors: string[], done: boolean, taskCompletion: CalendarTaskCompletionPrefs): string[] {
  if (kind === 'task' && done && taskCompletion.doneColor) return [taskCompletion.doneColor]
  return baseColors
}

// Fase 5 (plan de pendientes) — "un punto por persona en todas las vistas", igual que ya hacía la Vista
// general (eventDotColors): con una sola persona no se ve nada nuevo (ninguna vista cambia su aspecto de
// siempre); con varias, un puntito por cada una, al lado del título — nunca reemplaza al acento de color
// de siempre (franja/borde/fondo), que sigue usando solo el primero, sin tocar ese CSS ya probado.
function EventColorDots({ colors, style }: { colors: string[]; style?: CSSProperties }) {
  if (colors.length <= 1) return null
  return (
    <span className="event-color-dots" style={style}>
      {colors.slice(0, 6).map((c, i) => (
        <span key={i} className="event-color-dot" style={{ background: c }} />
      ))}
    </span>
  )
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
  // Fase 5 (plan de pendientes) — un color por cada persona asignada (color[0] === color de arriba,
  // siempre); el acento de color de siempre (franja/fondo) sigue usando solo `color`, nunca se toca esa
  // parte — esto solo añade los puntitos extra cuando hay más de una persona.
  colors: string[]
  allDay: boolean
  startTime: string | null
  endTime: string | null
  isExternal: boolean
  recurring: boolean
  done: boolean
  // RETOQUE — 'event' | 'task' para los apuntes propios (externos/cumpleaños no lo llevan, no
  // aplica): decide si el tachado/color de completada siguen el comportamiento histórico de Eventos
  // (siempre) o las preferencias personales de Tareas completadas.
  kind?: 'event' | 'task'
  // Ya calculado aquí (shouldStrikethroughEntry) para que AgendaRow/EventCard sean puramente
  // presentacionales — nunca vuelven a mirar kind/preferencias por su cuenta.
  strikethrough: boolean
  onEdit?: () => void
  onDeleteSeries?: () => void
  onDeleteOccurrence?: () => void
  onComplete?: () => void
  onUncomplete?: () => void
  // Solo los eventos propios lo llevan (ni los externos ni los
  // cumpleaños) — petición real: "Calendario: compartir un evento
  // específico... que la otra persona se lo pueda anotar en su
  // calendario, no tiene por qué ser de nuestra app".
  onShare?: () => void
  // Señal visible de que el toque en 📤 SÍ se ha registrado, mientras
  // se espera a ver si se abre el menú o no (bug real: "no hace nada").
  sharing?: boolean
  // Adjuntos del propio evento (Skill de adjuntos, formato "Nuevo
  // evento" de referencia): foto grande en la tarjeta, archivo,
  // ubicación y nota — solo los llevan los eventos propios, nunca los
  // externos/cumpleaños.
  attachmentStoragePath?: string | null
  attachmentKind?: 'foto' | 'archivo' | null
  attachmentOriginalName?: string | null
  locationLabel?: string | null
  locationLatitude?: number | null
  locationLongitude?: number | null
  note?: string | null
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
  categories,
  taskOrder,
  editingId,
  onCancelEdit,
  onEventChanged,
  onNavigateDay,
  swipeHandlers,
  onManageCategories,
}: {
  selectedDate: string
  entries: AgendaEntry[]
  events: CalendarEvent[]
  members: FamilyMember[]
  categories: CalendarCategory[]
  taskOrder: CalendarTaskOrder
  editingId: string | null
  onCancelEdit: () => void
  onEventChanged: () => void
  onNavigateDay: (deltaDays: number) => void
  swipeHandlers: { onTouchStart: (e: TouchEvent) => void; onTouchEnd: (e: TouchEvent) => void }
  onManageCategories: () => void
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
        categories={categories}
        taskOrder={taskOrder}
        onEventChanged={onEventChanged}
        onCancelEdit={onCancelEdit}
        onManageCategories={onManageCategories}
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
  categories,
  taskOrder,
  onEventChanged,
  onCancelEdit,
  emptyLabel = 'Nada este día.',
  onManageCategories,
}: {
  entries: AgendaEntry[]
  editingId: string | null
  events: CalendarEvent[]
  members: FamilyMember[]
  categories: CalendarCategory[]
  taskOrder: CalendarTaskOrder
  onEventChanged: () => void
  onCancelEdit: () => void
  emptyLabel?: string
  onManageCategories: () => void
}) {
  function renderCard(entry: AgendaEntry) {
    if (editingId === entry.id) {
      const ev = events.find((e) => e.id === entry.id)!
      return (
        <EditEventForm
          key={entry.key}
          event={ev}
          members={members}
          categories={categories}
          onDone={onEventChanged}
          onCancel={onCancelEdit}
          onManageCategories={onManageCategories}
        />
      )
    }
    return <AgendaRow key={entry.key} entry={entry} />
  }

  // RETOQUE (Parte 1) — Eventos y Tareas son bloques visuales distintos, con su propio encabezado,
  // en vez de una sola lista mezclada (antes: "todo el día" primero, con hora después, sin mirar
  // kind — una Tarea, siempre all_day, se colaba entre los Eventos de todo el día de verdad). El
  // orden de los dos bloques respeta calendarPrefs.taskOrder (la preferencia YA existente, nunca una
  // nueva); dentro del bloque "Eventos" se conserva el orden de siempre (todo el día antes que con
  // hora: ya venía así en `entries`, groupEventsAndTasks solo filtra, nunca reordena). Un bloque sin
  // nada no se pinta — ni su encabezado ni el bloque vacío.
  const groups = groupEventsAndTasks(entries, taskOrder)

  return (
    <>
      {entries.length === 0 && <p className="muted">{emptyLabel}</p>}

      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <div key={group.label}>
              <div className="calendar-section-header">{group.label}</div>
              <div className="agenda-day-block">
                {group.items.map((entry) => (
                  <div key={entry.key}>{renderCard(entry)}</div>
                ))}
              </div>
            </div>
          ),
      )}
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
  categoryById,
  categories,
  categoryColorById,
  colorMode,
  taskCompletion,
  taskOrder,
  dayEvents,
  eventCompletions,
  editingId,
  onEdit,
  onCancelEdit,
  onDelete,
  onDeleteOccurrence,
  onEventChanged,
  onNavigateDay,
  onQuickAdd,
  onShareEvent,
  onComplete,
  onUncomplete,
  onManageCategories,
}: {
  selectedDate: string
  members: FamilyMember[]
  memberById: Map<string, FamilyMember>
  categoryById: Map<string, CalendarCategory>
  categories: CalendarCategory[]
  categoryColorById: Map<string, string>
  colorMode: CalendarColorMode
  taskCompletion: CalendarTaskCompletionPrefs
  taskOrder: CalendarTaskOrder
  dayEvents: CalendarEvent[]
  eventCompletions: EventCompletion[]
  editingId: string | null
  onEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onDeleteOccurrence: (id: string, dateStr: string) => void
  onEventChanged: () => void
  onNavigateDay: (deltaDays: number) => void
  onQuickAdd: (memberId: string | null) => void
  onShareEvent: (event: CalendarEvent, dateStr: string) => void
  // BUG CALENDARIO-15 (auditoría): Familiar no ofrecía completar ni Evento ni Tarea — reutiliza
  // exactamente handleCompleteEvent/handleUncompleteEvent (calendar_event_completions), nunca un
  // mecanismo propio de esta vista.
  onComplete: (id: string, dateStr: string) => void
  onUncomplete: (id: string, dateStr: string) => void
  onManageCategories: () => void
}) {
  const unassigned = dayEvents.filter((e) => e.memberIds.length === 0)
  const columns: { key: string; label: string; member: FamilyMember | null; events: CalendarEvent[] }[] = [
    ...members.map((m) => ({ key: m.id, label: m.name, member: m, events: dayEvents.filter((e) => e.memberIds.includes(m.id)) })),
    ...(unassigned.length > 0 ? [{ key: 'familia', label: 'Toda la familia', member: null, events: unassigned }] : []),
  ]

  function renderEvent(ev: CalendarEvent) {
    if (editingId === ev.id) {
      return (
        <EditEventForm
          key={ev.id}
          event={ev}
          members={members}
          categories={categories}
          onDone={onEventChanged}
          onCancel={onCancelEdit}
          onManageCategories={onManageCategories}
        />
      )
    }
    const done = eventCompletions.some((c) => c.eventId === ev.id && c.occurrenceDate === selectedDate)
    const baseColors = eventColors(ev, memberById, colorMode, categoryColorById)
    const colors = effectiveEntryColors(ev.kind, baseColors, done, taskCompletion)
    return (
      <EventCard
        key={ev.id}
        event={ev}
        color={colors[0]}
        colors={colors}
        categoryById={categoryById}
        done={done}
        strikethrough={shouldStrikethroughEntry(ev.kind, done, taskCompletion)}
        onComplete={() => onComplete(ev.id, selectedDate)}
        onUncomplete={() => onUncomplete(ev.id, selectedDate)}
        onEdit={() => onEdit(ev.id)}
        onDeleteSeries={() => onDelete(ev.id)}
        onDeleteOccurrence={(dateStr) => onDeleteOccurrence(ev.id, dateStr)}
        onShare={() => onShareEvent(ev, selectedDate)}
      />
    )
  }

  return (
    // Sin gesto de deslizar para cambiar de día aquí — bug real: las
    // columnas se desplazan de lado para ver a cada persona, y ese
    // mismo gesto se confundía con "cambiar de día" a mitad de
    // deslizar. Solo las flechas cambian de día en esta vista.
    <div>
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
        {/* BUG CALENDARIO (validación real iPhone) — el fondo de columna usaba SIEMPRE el pastel del
            miembro, incluso en "Colores de categorías", contradiciendo ese modo (las tarjetas de dentro
            sí lo respetaban, la columna no). Regla exacta por modo: 'miembros'/'categorias' (híbrido)
            conservan la identificación cromática de la persona en la columna — el híbrido lo permite a
            propósito (cae en persona cuando falta categoría); 'solo_categorias' nunca usa color de
            miembro como codificación, columna neutra. */}
        {columns.map((col) => (
          <div
            key={col.key}
            className="family-view-column"
            style={{ background: colorMode === 'solo_categorias' ? '#f3f4f6' : toPastel(col.member?.color ?? '#9ca3af') }}
          >
            <div className="family-view-column-header">
              {col.member && <MemberAvatar member={col.member} size={28} />}
              <strong>{col.label}</strong>
            </div>
            <button type="button" className="link-button family-view-add" onClick={() => onQuickAdd(col.member?.id ?? null)}>
              + Añadir
            </button>
            {/* RETOQUE — el texto vacío anterior (que solo mencionaba "eventos") ya no era correcto:
                esta columna mezcla Eventos Y Tareas (ver groupEventsAndTasks más abajo), así que un
                texto que solo hablara de un tipo describía mal a alguien con únicamente del otro.
                "Sin planes" cubre ambos sin distinguir. Si solo hay tareas (o solo eventos),
                col.events.length > 0 y se entra por la otra rama: el bloque correspondiente se
                pinta solo, sin ningún mensaje de vacío a medias. */}
            {col.events.length === 0 ? (
              <p className="muted">Sin planes</p>
            ) : (
              // RETOQUE (Parte 1/4) — misma regla transversal que DayEntriesBody: Eventos y Tareas
              // son bloques distintos dentro de cada columna, con el mismo orden configurado
              // (calendarPrefs.taskOrder), un encabezado solo cuando ese bloque tiene algo.
              groupEventsAndTasks(col.events, taskOrder).map(
                (group) =>
                  group.items.length > 0 && (
                    <div key={group.label}>
                      <div className="calendar-section-header">{group.label}</div>
                      {group.items.map((ev) => renderEvent(ev))}
                    </div>
                  ),
              )
            )}
          </div>
        ))}
        {columns.length === 0 && <p className="muted">Añade miembros a la familia para usar esta vista.</p>}
      </div>
    </div>
  )
}

// Petición real original: "un nuevo modo... personal... lo que cada usuario quiera poner y que solo lo
// pueda ver ese usuario" — las notas siguen siendo EXACTAMENTE eso (notes viene ya filtrado por user_id
// desde el servidor, RLS de personal_calendar_notes, migración 0088). FASE CALENDARIO (Parte 16,
// corrección de bug de auditoría): Personal dejó de ser "solo notas" — la auditoría encontró que no
// mostraba Eventos ni Tareas propios, y eso no era el comportamiento querido. Ahora también enseña MIS
// Eventos y Tareas (las de mi propio miembro enlazado, myMemberId — ver CalendarScreen), reutilizando
// DayEntriesBody tal cual (mismo editar/completar/compartir que Mes/Agenda, ningún mecanismo nuevo) —
// las notas personales se quedan exactamente igual, debajo, sin perder ningún dato ni comportamiento.
function PersonalView({
  selectedDate,
  myMemberId,
  entries,
  events,
  members,
  categories,
  taskOrder,
  editingId,
  onCancelEdit,
  onEventChanged,
  notes,
  onNavigateDay,
  swipeHandlers,
  onAdd,
  onDelete,
  onShare,
  sharingNoteId,
  onManageCategories,
}: {
  selectedDate: string
  myMemberId: string | null
  entries: AgendaEntry[]
  events: CalendarEvent[]
  members: FamilyMember[]
  categories: CalendarCategory[]
  taskOrder: CalendarTaskOrder
  editingId: string | null
  onCancelEdit: () => void
  onEventChanged: () => void
  notes: PersonalNote[]
  onNavigateDay: (deltaDays: number) => void
  swipeHandlers: { onTouchStart: (e: TouchEvent) => void; onTouchEnd: (e: TouchEvent) => void }
  onAdd: (text: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onShare: (note: PersonalNote) => void
  sharingNoteId: string | null
  onManageCategories: () => void
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const dayNotes = notes.filter((n) => n.noteDate === selectedDate)
  // Mis propios Eventos/Tareas: asignados a MI miembro, MÁS cualquier privado mío (ver
  // shouldIncludeInPersonal) — nunca "Toda la familia" sin más ni los de otra persona, eso ya se ve
  // en Mes/Agenda/Familiar.
  const myEntries = entries.filter((entry) => {
    if (entry.isExternal) return false
    const ev = events.find((e) => e.id === entry.id)
    return !!ev && shouldIncludeInPersonal(ev, myMemberId)
  })

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onAdd(trimmed)
      setText('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="month-nav" onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}>
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

      {myMemberId ? (
        <DayEntriesBody
          entries={myEntries}
          editingId={editingId}
          events={events}
          members={members}
          categories={categories}
          taskOrder={taskOrder}
          onEventChanged={onEventChanged}
          onCancelEdit={onCancelEdit}
          emptyLabel="Nada tuyo este día."
          onManageCategories={onManageCategories}
        />
      ) : (
        <p className="muted" style={{ fontSize: 12 }}>
          Tu cuenta no está enlazada a ningún miembro de la familia todavía, así que aquí no se pueden mostrar tus Eventos y
          Tareas — las notas de abajo siguen funcionando igual.
        </p>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        🔒 Notas privadas — solo tú puedes ver lo que apuntes aquí, ni el resto de la familia lo verá.
      </p>

      <form onSubmit={handleAdd} className="inline-fields">
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe algo para este día…" />
        <button type="submit" disabled={!text.trim() || saving}>
          {saving ? 'Guardando…' : '+ Añadir'}
        </button>
      </form>

      <div className="event-list">
        {dayNotes.map((n) => (
          <div key={n.id} className="task-card">
            <div className="task-card-main">
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{n.text}</p>
            </div>
            <button
              type="button"
              className="icon-button-share"
              onClick={() => onShare(n)}
              disabled={sharingNoteId === n.id}
              aria-label="Compartir nota"
            >
              {sharingNoteId === n.id ? '…' : '📤'}
            </button>
            <ConfirmIconButton onConfirm={() => onDelete(n.id)} ariaLabel="Borrar nota" />
          </div>
        ))}
        {dayNotes.length === 0 && <p className="muted">Nada apuntado este día.</p>}
      </div>
    </div>
  )
}

interface TimeGridBlock {
  key: string
  title: string
  color: string
  colors: string[]
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
  categoryById,
  categoryColorById,
  colorMode,
  eventCompletions,
  taskCompletion,
  selectedDate,
  onSelectDate,
  onComplete,
  onUncomplete,
  swipeHandlers,
}: {
  days: { dateStr: string; date: Date }[]
  eventsByDate: Map<string, CalendarEvent[]>
  externalEventsByDate: Map<string, ExternalCalendarEvent[]>
  birthdaysByDate: Map<string, { name: string; color: string }[]>
  memberById: Map<string, FamilyMember>
  feedById: Map<string, ExternalCalendarFeed>
  categoryById: Map<string, CalendarCategory>
  categoryColorById: Map<string, string>
  colorMode: CalendarColorMode
  eventCompletions: EventCompletion[]
  taskCompletion: CalendarTaskCompletionPrefs
  selectedDate: string
  onSelectDate: (dateStr: string) => void
  onComplete: (eventId: string, dateStr: string) => void
  onUncomplete: (eventId: string, dateStr: string) => void
  swipeHandlers: { onTouchStart: (e: TouchEvent) => void; onTouchEnd: (e: TouchEvent) => void }
}) {
  const HOUR_HEIGHT = 52

  // El emoji de categoría nunca depende del modo de color (Parte 6) — por eso usa categoryById (siempre
  // disponible) y no categoryColorById (solo presente en modo "categorías").
  function titleWithCategoryEmoji(ev: CalendarEvent): string {
    const category = ev.categoryId ? categoryById.get(ev.categoryId) : null
    return category ? `${category.emoji} ${ev.title}` : ev.title
  }

  function timedBlocksForDate(dateStr: string): TimeGridBlock[] {
    const blocks: TimeGridBlock[] = []
    for (const ev of eventsByDate.get(dateStr) ?? []) {
      if (ev.allDay) continue
      const start = new Date(ev.startAt)
      const startMin = start.getHours() * 60 + start.getMinutes()
      const end = ev.endAt ? new Date(ev.endAt) : null
      const endMin = end ? Math.max(end.getHours() * 60 + end.getMinutes(), startMin + 20) : startMin + 60
      const title = titleWithCategoryEmoji(ev)
      const colors = eventColors(ev, memberById, colorMode, categoryColorById)
      blocks.push({
        key: `ev-${ev.id}`,
        title: ev.visibility === 'private' ? `🔒 ${title}` : title,
        color: colors[0],
        colors,
        startMin,
        endMin,
        dateStr,
      })
    }
    for (const ev of externalEventsByDate.get(dateStr) ?? []) {
      if (ev.allDay) continue
      const start = new Date(ev.startAt)
      const startMin = start.getHours() * 60 + start.getMinutes()
      const end = ev.endAt ? new Date(ev.endAt) : null
      const endMin = end ? Math.max(end.getHours() * 60 + end.getMinutes(), startMin + 20) : startMin + 60
      const feed = feedById.get(ev.feedId)
      const member = feed?.memberId ? memberById.get(feed.memberId) : null
      const color = member?.color ?? '#6b7280'
      blocks.push({ key: `ext-${ev.id}`, title: ev.title, color, colors: [color], startMin, endMin, dateStr })
    }
    return blocks
  }

  // "Todo el día" es solo para Eventos de día completo de verdad —
  // una Tarea sin hora NUNCA es un evento de todo el día (Parte 7),
  // así que se excluye aquí y se representa aparte en tasksForDate().
  function allDayChipsForDate(dateStr: string): { key: string; title: string; color: string; colors: string[] }[] {
    const chips: { key: string; title: string; color: string; colors: string[] }[] = []
    for (const ev of eventsByDate.get(dateStr) ?? []) {
      if (!ev.allDay || ev.kind === 'task') continue
      const hasPhoto = ev.attachmentKind === 'foto'
      const hasLocation = !!ev.locationLabel || (ev.locationLatitude != null && ev.locationLongitude != null)
      const prefix = (ev.visibility === 'private' ? '🔒' : '') + (hasPhoto ? '📷' : '') + (hasLocation ? '📍' : '')
      const title = titleWithCategoryEmoji(ev)
      const colors = eventColors(ev, memberById, colorMode, categoryColorById)
      chips.push({ key: `ev-${ev.id}`, title: prefix ? `${prefix} ${title}` : title, color: colors[0], colors })
    }
    for (const ev of externalEventsByDate.get(dateStr) ?? []) {
      if (ev.allDay) chips.push({ key: `ext-${ev.id}`, title: ev.title, color: '#6b7280', colors: ['#6b7280'] })
    }
    for (const b of birthdaysByDate.get(dateStr) ?? []) {
      chips.push({ key: `bday-${b.name}`, title: `🎂 ${b.name}`, color: b.color, colors: [b.color] })
    }
    return chips
  }

  // Bloque "Tareas" propio (Parte 8): nunca se inventa una hora, se
  // listan las Tareas de ese día con su circulito de completar, color
  // y tachado según las preferencias (mismas funciones que ya usan
  // AgendaRow/FamilyDayView, para que el resultado sea idéntico).
  function tasksForDate(dateStr: string): {
    key: string
    eventId: string
    dateStr: string
    title: string
    color: string
    colors: string[]
    done: boolean
    strikethrough: boolean
  }[] {
    const tasks: { key: string; eventId: string; dateStr: string; title: string; color: string; colors: string[]; done: boolean; strikethrough: boolean }[] = []
    for (const ev of eventsByDate.get(dateStr) ?? []) {
      if (ev.kind !== 'task') continue
      const done = eventCompletions.some((c) => c.eventId === ev.id && c.occurrenceDate === dateStr)
      const baseColors = eventColors(ev, memberById, colorMode, categoryColorById)
      const colors = effectiveEntryColors(ev.kind, baseColors, done, taskCompletion)
      const hasPhoto = ev.attachmentKind === 'foto'
      const hasLocation = !!ev.locationLabel || (ev.locationLatitude != null && ev.locationLongitude != null)
      const prefix = (ev.visibility === 'private' ? '🔒' : '') + (hasPhoto ? '📷' : '') + (hasLocation ? '📍' : '')
      const title = titleWithCategoryEmoji(ev)
      tasks.push({
        key: `task-${ev.id}`,
        eventId: ev.id,
        dateStr,
        title: prefix ? `${prefix} ${title}` : title,
        color: colors[0],
        colors,
        done,
        strikethrough: shouldStrikethroughEntry(ev.kind, done, taskCompletion),
      })
    }
    if (!taskCompletion.moveCompletedToEnd) return tasks
    return [...tasks.filter((t) => !t.done), ...tasks.filter((t) => t.done)]
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
              <span key={c.key} className="time-grid-allday-chip" style={{ background: c.color, color: readableTextColor(c.color) }}>
                {c.title}
                <EventColorDots colors={c.colors} />
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="time-grid-tasks-row">
        <div className="time-grid-hour-spacer" />
        {days.map((d) => {
          const tasks = tasksForDate(d.dateStr)
          if (tasks.length === 0) return <div key={d.dateStr} className="time-grid-tasks-cell" />
          const doneCount = tasks.filter((t) => t.done).length
          const showDoneHeader = taskCompletion.moveCompletedToEnd && doneCount > 0
          const firstDoneIndex = showDoneHeader ? tasks.findIndex((t) => t.done) : -1
          return (
            <div key={d.dateStr} className="time-grid-tasks-cell">
              <div className="time-grid-tasks-label">Tareas</div>
              {tasks.map((t, i) => (
                <div key={t.key}>
                  {i === firstDoneIndex && <div className="time-grid-tasks-subheader">Completadas</div>}
                  <div className="time-grid-task-row">
                    <span className="completion-circle-chip" style={{ background: t.color }}>
                      <CompletionCircle
                        done={t.done}
                        color={t.color}
                        onComplete={() => onComplete(t.eventId, t.dateStr)}
                        onUncomplete={() => onUncomplete(t.eventId, t.dateStr)}
                      />
                    </span>
                    <span
                      className={'time-grid-task-title' + (t.strikethrough ? ' time-grid-task-title-struck' : '')}
                      onClick={() => onSelectDate(d.dateStr)}
                    >
                      {t.title}
                      <EventColorDots colors={t.colors} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
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
                  <div
                    key={`bg-${i}`}
                    className={'time-grid-hour-bg' + (i % 2 === 1 ? ' time-grid-hour-bg-alt' : '')}
                    style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  />
                ))}
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
                      color: readableTextColor(b.color),
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectDate(b.dateStr)
                    }}
                  >
                    {b.title}
                    <EventColorDots colors={b.colors} />
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
  categories,
  taskOrder,
  editingId,
  onCancelEdit,
  onEventChanged,
  onManageCategories,
}: {
  today: Date
  buildEntriesForDate: (dateStr: string) => AgendaEntry[]
  events: CalendarEvent[]
  members: FamilyMember[]
  categories: CalendarCategory[]
  taskOrder: CalendarTaskOrder
  editingId: string | null
  onCancelEdit: () => void
  onEventChanged: () => void
  onManageCategories: () => void
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
            categories={categories}
            taskOrder={taskOrder}
            onEventChanged={onEventChanged}
            onCancelEdit={onCancelEdit}
            emptyLabel="Nada hoy."
            onManageCategories={onManageCategories}
          />
        </div>
      ))}
    </div>
  )
}

// Foto grande sobre la tarjeta del evento (formato de referencia,
// como "Moto") — la url firmada se pide sola, no llega ya resuelta.
// onClick opcional: EventCard (Vista Familiar) la usa para abrir PhotoLightbox — antes no tenía ninguna
// interacción propia (la tarjeta entera no tiene onClick, solo el botón "Editar"), así que añadirla no
// cambia ningún comportamiento existente.
function EventAttachmentPhoto({ storagePath, onClick }: { storagePath: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getEventAttachmentUrl(storagePath)
      .then((u) => active && setUrl(u))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [storagePath])
  if (!url) return null
  if (onClick) {
    return (
      <button type="button" className="agenda-card-photo-button" onClick={onClick} aria-label="Ver foto del evento">
        <img src={url} alt="" className="agenda-card-photo" />
      </button>
    )
  }
  return <img src={url} alt="" className="agenda-card-photo" />
}

const agendaCheckSvg = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

// RETOQUE — lenguaje visual único de pendiente/completado en todo Calendario: antes AgendaRow usaba
// este círculo+check y EventCard (Vista Familiar) un botón de texto aparte ("✓ Hecho"/"↺ Deshacer"),
// visualmente irreconciliables entre sí (validación real iPhone). Ahora los dos reutilizan este MISMO
// componente — el círculo de AgendaRow es la referencia, por ser el que ya se veía en más vistas
// (Mes/Agenda/Personal/Día). "Editar"/"Borrar" siguen aparte, no se tocan.
function CompletionCircle({
  done,
  color,
  onComplete,
  onUncomplete,
}: {
  done: boolean
  color: string
  onComplete?: () => void
  onUncomplete?: () => void
}) {
  if (!onComplete && !onUncomplete) return null
  return (
    <button
      type="button"
      className={'completion-circle' + (done ? ' completion-circle-done' : '')}
      style={done ? { color } : undefined}
      onClick={(e) => {
        e.stopPropagation()
        ;(done ? onUncomplete : onComplete)?.()
      }}
      aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecho'}
    >
      {agendaCheckSvg}
    </button>
  )
}

// Franja de color ancha con el check dentro (petición real: "una
// franja de color al principio... más ancha... dentro de la franja
// pondría el círculo para tocarlo como hecho"), hora a la derecha
// (como en la referencia de Apple Calendario), borrar deslizando en
// vez de una X fija, y tocar la fila para editar — mismo lenguaje
// visual que ya se aplicó a la Lista de la compra. Sustituye a la
// antigua "pastilla" de color entero por evento.
const AGENDA_SWIPE_OPEN = -84

function AgendaRow({ entry }: { entry: AgendaEntry }) {
  const [confirming, setConfirming] = useState(false)
  const canDelete = !!entry.onDeleteSeries
  const [openX, setOpenX] = useState(0)
  const [liveX, setLiveX] = useState<number | null>(null)
  const startXRef = useRef(0)
  const swiping = useRef(false)
  // Miniatura de la foto del evento (petición real: la foto grande solo se veía en Vista Familiar —
  // aquí se ve una miniatura, y tocarla abre PhotoLightbox en vez de editar el evento). Propia de esta
  // fila, no se coordina con ninguna otra — como mucho una foto abierta a la vez tiene sentido en la UI.
  const [showingPhoto, setShowingPhoto] = useState(false)

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    startXRef.current = e.clientX
    swiping.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!swiping.current) return
    const raw = openX + (e.clientX - startXRef.current)
    setLiveX(Math.min(0, Math.max(AGENDA_SWIPE_OPEN, raw)))
  }
  function handlePointerUp() {
    if (!swiping.current) return
    swiping.current = false
    const current = liveX ?? openX
    setOpenX(current < AGENDA_SWIPE_OPEN / 2 ? AGENDA_SWIPE_OPEN : 0)
    setLiveX(null)
  }
  // Bug real: deslizar una fila para borrar cambiaba de día a la vez,
  // porque el gesto de borrar usa Pointer Events (arriba) mientras que
  // el cambio de día (useSwipeHandlers, más arriba en el árbol) usa
  // Touch Events nativos — son dos sistemas de eventos distintos que el
  // navegador dispara los dos para el mismo toque, así que parar la
  // propagación del pointerdown/move no frena el touchstart/touchend
  // que sigue subiendo hasta el .day-panel. Se paran aquí también, en
  // el mismo elemento, para que el cambio de día no vea ningún gesto.
  function stopTouchPropagation(e: TouchEvent<HTMLDivElement>) {
    e.stopPropagation()
  }

  function handleDeleteTap() {
    setOpenX(0)
    // Un evento recurrente necesita elegir "solo este día" o "toda la
    // serie" — deslizar y soltar no basta para decidir eso, así que se
    // pregunta aquí en vez de borrar directamente (a diferencia de un
    // evento suelto, donde el propio gesto de deslizar ya es la
    // confirmación).
    if (entry.recurring && entry.onDeleteOccurrence) setConfirming(true)
    else entry.onDeleteSeries?.()
  }

  if (confirming) {
    return (
      <div className="agenda-row-confirm">
        <span>¿Borrar "{entry.title}"?</span>
        <div className="agenda-row-confirm-actions">
          {entry.onDeleteOccurrence && (
            <button type="button" className="link-button" onClick={entry.onDeleteOccurrence}>
              Solo este día
            </button>
          )}
          <button type="button" className="link-button" onClick={entry.onDeleteSeries}>
            Toda la serie
          </button>
          <button type="button" className="link-button" onClick={() => setConfirming(false)}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  const translateX = liveX ?? openX

  return (
    <div className="agenda-row-outer">
      {canDelete && (
        <div className="agenda-row-delete-behind">
          <button type="button" className="agenda-row-delete-btn" onClick={handleDeleteTap} aria-label={`Eliminar ${entry.title}`}>
            🗑 Eliminar
          </button>
        </div>
      )}
      <div
        className={'agenda-row-inner' + (entry.done ? ' agenda-row-done' : '') + (entry.strikethrough ? ' agenda-row-struck' : '')}
        style={{
          // Petición real: "en los chips de los apuntes... pondría el
          // fondo de la tarjeta en una versión pastel del color
          // distintivo de cada usuario" — la franja de la izquierda
          // (.agenda-stripe) se queda con el color sólido de acento.
          background: toPastel(entry.color),
          transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
          transition: liveX == null ? undefined : 'none',
        }}
        onPointerDown={canDelete ? handlePointerDown : undefined}
        onPointerMove={canDelete ? handlePointerMove : undefined}
        onPointerUp={canDelete ? handlePointerUp : undefined}
        onPointerCancel={canDelete ? handlePointerUp : undefined}
        onTouchStart={canDelete ? stopTouchPropagation : undefined}
        onTouchEnd={canDelete ? stopTouchPropagation : undefined}
      >
        <div className="agenda-stripe" style={{ background: entry.color }}>
          <CompletionCircle done={entry.done} color={entry.color} onComplete={entry.onComplete} onUncomplete={entry.onUncomplete} />
        </div>
        <button
          type="button"
          className="agenda-row-body"
          onClick={() => {
            if (openX !== 0) {
              setOpenX(0)
              return
            }
            entry.onEdit?.()
          }}
        >
          {/* Título en su propia línea a todo lo ancho (petición real:
              "ver más título en la fila compacta") — antes competía por
              sitio con la hora en la misma línea y se truncaba antes de
              tiempo. La hora baja a una segunda línea, junto al
              subtítulo. */}
          <span className="agenda-row-title">
            {entry.isExternal ? '🔗 ' : ''}
            {entry.title}
            {entry.attachmentKind === 'foto' && ' 📷'}
            {entry.attachmentKind === 'archivo' && ' 📎'}
            {entry.note && ' 📝'}
            <EventColorDots colors={entry.colors} />
          </span>
          <span className="agenda-row-meta">
            <span className="agenda-row-sub">{entry.locationLabel ? `📍 ${entry.locationLabel}` : entry.subtitle}</span>
            {/* "Todo el día"/"Tarea" ocupa el mismo hueco que la hora en las demás filas (petición
                real: "pon 'todo el día' donde en los demás viene la hora") en vez de una etiqueta
                aparte arriba del grupo. RETOQUE (Parte 2): una Tarea nunca se representa como "Todo
                el día" (entryTimeLabel), aunque siga guardándose con all_day=true por compatibilidad. */}
            <span className="agenda-row-time">{entryTimeLabel(entry)}</span>
          </span>
        </button>
        {entry.attachmentKind === 'foto' && entry.attachmentStoragePath && (
          <AgendaRowThumb storagePath={entry.attachmentStoragePath} onOpen={() => setShowingPhoto(true)} />
        )}
        {entry.onShare && (
          <button
            type="button"
            className="icon-button-share agenda-row-share"
            onClick={(e) => {
              e.stopPropagation()
              entry.onShare?.()
            }}
            disabled={entry.sharing}
            aria-label="Compartir"
          >
            {entry.sharing ? '…' : '📤'}
          </button>
        )}
      </div>
      {/* El visor se renderiza FUERA de .agenda-row-inner a propósito: esa fila puede llevar un
          transform (deslizar para borrar), y un transform en un antepasado convierte position:fixed en
          relativo a ÉL en vez de a la pantalla — el visor dejaría de ser realmente a pantalla completa
          si la fila estuviera a medio deslizar. */}
      {showingPhoto && entry.attachmentStoragePath && (
        <PhotoLightbox storagePath={entry.attachmentStoragePath} onClose={() => setShowingPhoto(false)} />
      )}
    </div>
  )
}

// Miniatura de la foto en la fila compacta — interacción propia e independiente de la fila: tocarla
// abre PhotoLightbox, nunca el editor del evento (petición real explícita). Para en seco el click Y el
// pointerdown (este último porque .agenda-row-inner escucha pointerdown/move/up para el gesto de
// deslizar-para-borrar en TODA la fila — sin pararlo aquí, tocar la miniatura también arrancaría ese
// gesto). Reutiliza getEventAttachmentUrl, igual que EventAttachmentPhoto — no es una copia de esa
// lógica, es la misma función, solo con una clase CSS de tamaño distinta.
function AgendaRowThumb({ storagePath, onOpen }: { storagePath: string; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getEventAttachmentUrl(storagePath)
      .then((u) => active && setUrl(u))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [storagePath])
  if (!url) return null
  return (
    <button
      type="button"
      className="agenda-row-thumb"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      aria-label="Ver foto del evento"
    >
      <img src={url} alt="" />
    </button>
  )
}

// Visor simple de una foto de evento — overlay a pantalla completa, sin carrusel, sin edición, sin
// descarga: solo ver la foto más grande y cerrar. No existía ya un visor así en la app: Compras/
// Documentos abren la foto en una pestaña nueva del navegador (ShoppingScreen.tsx handleViewPhoto,
// mismo patrón en DocumentsScreen.tsx), que aquí no encaja porque la foto de un evento se pensó para
// verse dentro de la propia pantalla de Calendario. Reutiliza getEventAttachmentUrl, igual que
// EventAttachmentPhoto — mismo bucket, misma URL firmada, sin lógica nueva de acceso a Storage.
function PhotoLightbox({ storagePath, onClose }: { storagePath: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getEventAttachmentUrl(storagePath)
      .then((u) => active && setUrl(u))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [storagePath])
  return (
    <div className="photo-lightbox-overlay" onClick={onClose}>
      <button type="button" className="photo-lightbox-close" onClick={onClose} aria-label="Cerrar foto">
        ✕
      </button>
      {url && <img src={url} alt="" className="photo-lightbox-image" onClick={(e) => e.stopPropagation()} />}
    </div>
  )
}

// Adjunto tipo "archivo" (no imagen) en la tarjeta de un evento — solo
// un enlace, sin previsualización.
function EventAttachmentFileLink({ storagePath, name }: { storagePath: string; name: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    getEventAttachmentUrl(storagePath)
      .then(setUrl)
      .catch(() => {})
  }, [storagePath])
  return (
    <div className="agenda-card-subtitle">
      📎{' '}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
          {name ?? 'Archivo'}
        </a>
      ) : (
        name ?? 'Archivo'
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
  color,
  colors,
  categoryById,
  done = false,
  strikethrough,
  onComplete,
  onUncomplete,
  onEdit,
  onDeleteSeries,
  onDeleteOccurrence,
  onShare,
}: {
  event: CalendarEvent
  // RETOQUE — antes el borde solo usaba ev.color (el color propio y explícito del evento, raro) y se
  // quedaba sin colorear en el resto de casos: la vista Familiar era la única que NO reflejaba el modo
  // de color activo (miembro/categoría/híbrido) mientras TODAS las demás vistas sí — ahora el llamador
  // (FamilyDayView) resuelve el color con eventColors() de siempre y lo pasa ya hecho aquí, para que
  // ninguna vista tenga su propia regla aparte. El borde sigue usando solo este primer color (sin
  // cambios); `colors` (abajo) es solo para el puntito extra por persona cuando hay más de una.
  color: string
  // Fase 5 (plan de pendientes) — un color por persona asignada, para EventColorDots junto al título;
  // colors[0] === color de arriba, siempre.
  colors: string[]
  categoryById?: Map<string, CalendarCategory>
  // BUG CALENDARIO-15 (auditoría): esta tarjeta (Vista Familiar) no ofrecía "Hecho" aunque
  // calendar_event_completions ya existiera y DayModal/Agenda sí lo usaran — mismo motor, mismo
  // mecanismo, nunca uno nuevo (completeEventOccurrence/uncompleteEventOccurrence, data/calendar.ts).
  done?: boolean
  // RETOQUE — ya resuelto por el llamador (shouldStrikethroughEntry), igual que color: un Evento
  // completado se tacha siempre (comportamiento histórico); una Tarea sigue "Tachar al completar".
  // Por defecto = done, para que un llamador que no la pase (ninguno hoy) conserve el aspecto de siempre.
  strikethrough?: boolean
  onComplete?: () => void
  onUncomplete?: () => void
  onEdit: () => void
  onDeleteSeries: () => void
  onShare?: () => void
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
  const [showingPhoto, setShowingPhoto] = useState(false)
  const mapsUrl =
    ev.locationLatitude != null && ev.locationLongitude != null
      ? `https://www.google.com/maps?q=${ev.locationLatitude},${ev.locationLongitude}`
      : null
  return (
    <div className="card event-card" style={{ borderColor: color }}>
      {ev.attachmentKind === 'foto' && ev.attachmentStoragePath && (
        <EventAttachmentPhoto storagePath={ev.attachmentStoragePath} onClick={() => setShowingPhoto(true)} />
      )}
      {showingPhoto && ev.attachmentStoragePath && (
        <PhotoLightbox storagePath={ev.attachmentStoragePath} onClose={() => setShowingPhoto(false)} />
      )}
      <strong style={strikethrough ?? done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined}>
        {ev.visibility === 'private' && '🔒 '}
        {ev.categoryId && categoryById?.get(ev.categoryId) ? `${categoryById.get(ev.categoryId)!.emoji} ` : ''}
        {ev.title}
        <EventColorDots colors={colors} />
      </strong>
      {/* RETOQUE (Parte 4.1/4.3) — compactación de Familiar: la fecha ya aparece arriba del todo
          ("lunes, 5 de octubre"), repetirla aquí dentro de cada tarjeta era la info redundante más
          grande de la tarjeta — ahora solo la hora/"Todo el día"/"Tarea" (entryTimeLabel, misma
          regla transversal que el resto de vistas). Los recordatorios, antes listados en texto
          completo ("10 minutos antes de que empiece, 1 hora antes..."), se resumen en un solo 🔔 — el
          detalle completo sigue disponible al editar. */}
      <p className="muted">
        {entryTimeLabel({ kind: ev.kind, allDay: ev.allDay, startTime: ev.allDay ? null : hhmm(ev.startAt), endTime: !ev.allDay && ev.endAt ? hhmm(ev.endAt) : null })}
        {ev.recurrenceRule && ` · ${recurrenceLabel(ev.recurrenceRule)}`}
        {ev.reminders.length > 0 && ' · 🔔'}
      </p>
      {/* RETOQUE (Parte 4.4) — locationLabel puede ser una dirección postal completa (prioriza la
          dirección, ver services/geocoding.ts): aquí se enseña solo el primer segmento
          (shortLocationLabel, puramente de presentación, el dato guardado no cambia). */}
      {(ev.locationLabel || mapsUrl) && (
        <p className="muted">
          📍 {ev.locationLabel ? shortLocationLabel(ev.locationLabel) : ''}
          {mapsUrl && (
            <>
              {ev.locationLabel ? ' · ' : ''}
              <a href={mapsUrl} target="_blank" rel="noreferrer">
                Ver mapa
              </a>
            </>
          )}
        </p>
      )}
      {ev.attachmentKind === 'archivo' && ev.attachmentStoragePath && (
        <EventAttachmentFileLink storagePath={ev.attachmentStoragePath} name={ev.attachmentOriginalName} />
      )}
      {ev.note && <p className="muted">📝 {ev.note}</p>}
      {/* RETOQUE (Parte 4.2) — el avatar de esta persona ya está en la cabecera de su columna
          (family-view-column-header); repetirlo en cada tarjeta era redundante, se quita de aquí sin
          tocar el avatar de la cabecera. */}
      <div className="member-card-actions">
        {/* AgendaRow apoya este mismo círculo sobre su propia franja de color (.agenda-stripe) para que
            el aro blanco/check de color contrasten — aquí, sin franja, se envuelve en un fondo del
            mismo color en miniatura para el mismo contraste, sin tocar nada de AgendaRow. */}
        {(onComplete || onUncomplete) && (
          <span className="completion-circle-chip" style={{ background: color }}>
            <CompletionCircle done={done} color={color} onComplete={onComplete} onUncomplete={onUncomplete} />
          </span>
        )}
        {/* RETOQUE (Parte 5) — "Editar"/"Borrar" en palabras pasan a icono (✏️/✕), igual formato
            compacto que 📤 (el mismo icono de compartir que PEPA ya usa aquí, sin inventar uno
            nuevo) — reutiliza la MISMA clase .icon-button-share (mismo tamaño/borde/grosor), con su
            aria-label/title propios. El sub-flujo de confirmación de borrado (¿Seguro?/Solo un
            día/Toda la serie/Cancelar) no se toca, solo su disparador inicial. */}
        <button type="button" className="icon-button-share" onClick={onEdit} aria-label="Editar" title="Editar">
          ✏️
        </button>
        {onShare && (
          <button type="button" className="icon-button-share" onClick={onShare} aria-label="Compartir" title="Compartir">
            📤
          </button>
        )}
        {!confirming ? (
          <button type="button" className="icon-button-share" onClick={() => setConfirming(true)} aria-label="Borrar" title="Borrar">
            ✕
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

// Filtro de personas del calendario, convertido en desplegable (mismo
// patrón que "Filtrar por" en Economía/Compras) en vez de una fila de
// chips — petición real: "los chips de Filtro de persona al inicio los
// metas también en un desplegable con su color al inicio". Multi-
// selección: se queda abierto entre toques para poder marcar varios
// antes de cerrar, a diferencia del de Economía (una sola opción).
function MemberFilterDropdown({
  members,
  selected,
  onToggle,
  onClear,
}: {
  members: FamilyMember[]
  selected: string[]
  onToggle: (id: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const summary = selected.length === 0 ? 'Todos' : members.filter((m) => selected.includes(m.id)).map((m) => m.name).join(', ')

  return (
    <div>
      <button type="button" className="category-picker-toggle" onClick={() => setOpen(true)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {selected.length > 0 && (
            <span style={{ display: 'flex', flex: 'none' }}>
              {members
                .filter((m) => selected.includes(m.id))
                .slice(0, 4)
                .map((m, i) => (
                  <span
                    key={m.id}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: m.color,
                      marginLeft: i === 0 ? 0 : -6,
                      border: '2px solid white',
                    }}
                  />
                ))}
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Filtrar por: {summary}
          </span>
        </span>
        <span className="muted">▼</span>
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Filtrar por persona
              </h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="category-picker-panel" style={{ maxHeight: 'none', border: 'none' }}>
              <button type="button" className="category-picker-row" style={{ justifyContent: 'space-between' }} onClick={onClear}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#9ca3af' }} />
                  Todos
                </span>
                {selected.length === 0 && <span aria-hidden="true">✓</span>}
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="category-picker-row"
                  style={{ justifyContent: 'space-between' }}
                  onClick={() => onToggle(m.id)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: m.color }} />
                    {m.name}
                  </span>
                  {selected.includes(m.id) && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Envuelve un control ya existente (Repetición, Recordatorio) en un
// desplegable cerrado por defecto — petición real: "pondría las
// repeticiones, los recordatorios... en desplegables" — sin tocar el
// control de dentro, que conserva toda su funcionalidad (preajustes,
// modo personalizado, varios recordatorios con distinto ancla...).
function FieldDropdown({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" className="category-picker-toggle" onClick={() => setOpen(true)}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}: {summary}
        </span>
        <span className="muted">▼</span>
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {label}
              </h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

// "¿Para quién?" como desplegable — petición real: "el de para quien
// que lleve al principio la franja de color definida para cada uno".
// Multi-selección igual que el MemberPicker de chips que sustituye,
// solo que en forma de lista con el color por delante de cada nombre.
function WhoDropdown({
  members,
  selected,
  onToggle,
}: {
  members: FamilyMember[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const summary = selected.length === 0 ? 'Toda la familia' : members.filter((m) => selected.includes(m.id)).map((m) => m.name).join(', ')

  return (
    <div>
      <p className="muted">¿Para quién?</p>
      <button type="button" className="category-picker-toggle" onClick={() => setOpen(true)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {selected.length > 0 && (
            <span style={{ display: 'flex', flex: 'none' }}>
              {members
                .filter((m) => selected.includes(m.id))
                .slice(0, 4)
                .map((m, i) => (
                  <span
                    key={m.id}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: m.color,
                      marginLeft: i === 0 ? 0 : -6,
                      border: '2px solid white',
                    }}
                  />
                ))}
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        </span>
        <span className="muted">▼</span>
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                ¿Para quién?
              </h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="category-picker-panel" style={{ maxHeight: 'none', border: 'none' }}>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="category-picker-row"
                  style={{ justifyContent: 'space-between' }}
                  onClick={() => onToggle(m.id)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: m.color }} />
                    {m.name}
                  </span>
                  {selected.includes(m.id) && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// FASE CALENDARIO — categoría opcional, compartida por Evento y Tarea (Parte 4/5). Mismo patrón visual
// exacto que WhoDropdown (justo arriba): un desplegable en ventana emergente, "Sin categoría" como
// opción explícita además de cada categoría real — nunca una taxonomía obligatoria. Las categorías en
// sí se crean/editan solo desde Configuración → Calendario (Parte 27), nunca desde aquí.
function CategoryDropdown({
  categories,
  selected,
  onChange,
  onManageCategories,
}: {
  categories: CalendarCategory[]
  selected: string | null
  onChange: (id: string | null) => void
  // RETOQUE — engranaje junto a "Categoría (opcional)" para gestionar calendar_categories sin salir del
  // formulario (nunca Economía/Compras/Eventos — ver ManageCategoriesModal en CalendarScreen). Antes,
  // con 0 categorías, este componente devolvía null entero (ni la etiqueta se veía) — ahora la etiqueta
  // + el engranaje se ven SIEMPRE, para poder crear la primera categoría desde aquí mismo; el selector
  // en sí (el botón "▼" y su modal) sigue apareciendo solo si ya hay alguna, exactamente como antes.
  onManageCategories: () => void
}) {
  const [open, setOpen] = useState(false)
  const selectedCategory = selected ? categories.find((c) => c.id === selected) : null
  const summary = selectedCategory ? `${selectedCategory.emoji} ${selectedCategory.name}` : 'Sin categoría'

  return (
    <div>
      <p className="muted calendar-category-field-label">
        Categoría (opcional)
        <button
          type="button"
          className="calendar-category-manage-btn"
          onClick={onManageCategories}
          aria-label="Gestionar categorías del calendario"
          title="Gestionar categorías del calendario"
        >
          ⚙️
        </button>
      </p>
      {categories.length > 0 && (
        <button type="button" className="category-picker-toggle" onClick={() => setOpen(true)}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
          <span className="muted">▼</span>
        </button>
      )}
      {open && categories.length > 0 && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Categoría
              </h2>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="category-picker-panel" style={{ maxHeight: 'none', border: 'none' }}>
              <button
                type="button"
                className="category-picker-row"
                style={{ justifyContent: 'space-between' }}
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
              >
                <span>Sin categoría</span>
                {!selected && <span aria-hidden="true">✓</span>}
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="category-picker-row"
                  style={{ justifyContent: 'space-between' }}
                  onClick={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                >
                  <span>
                    {c.emoji} {c.name}
                  </span>
                  {selected === c.id && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Varios recordatorios por evento, cada uno en la unidad que se quiera
// (minutos/horas/días/semanas/meses/años) y contando desde que EMPIEZA o
// desde que TERMINA el evento — "que me avise media hora antes de
// recogerlo" cuenta desde el final, no desde el principio. La opción de
// "al terminar" solo se ofrece si el evento tiene hora de fin.
// Mismo formato de lista que Repetición (petición real: "los
// recordatorios que se vean en el mismo formato que las repeticiones")
// — preajustes como filas con indicador redondo en vez de chips
// sueltos para quitar por un lado y chips para añadir por otro. A
// diferencia de Repetición (una sola opción activa), aquí varias filas
// pueden estar marcadas a la vez: cada una es su propio
// recordatorio independiente.
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
  const [customMode, setCustomMode] = useState(false)

  const sameReminder = (a: EventReminder, b: EventReminder) => a.minutesBefore === b.minutesBefore && a.anchor === b.anchor
  const isActive = (minutesBefore: number) => reminders.some((r) => sameReminder(r, { minutesBefore, anchor }))

  function toggle(minutesBefore: number) {
    const target = { minutesBefore, anchor }
    if (reminders.some((r) => sameReminder(r, target))) onChange(reminders.filter((r) => !sameReminder(r, target)))
    else onChange([...reminders, target].sort((a, b) => a.minutesBefore - b.minutesBefore))
  }

  function addCustom() {
    const n = Number(amount)
    if (!n || n <= 0) return
    const target = { minutesBefore: reminderMinutesFrom(n, unit), anchor }
    if (!reminders.some((r) => sameReminder(r, target))) onChange([...reminders, target].sort((a, b) => a.minutesBefore - b.minutesBefore))
    setCustomMode(false)
  }

  return (
    <div>
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

      <div className="recurrence-preset-list">
        <button
          type="button"
          className={'chip recurrence-preset' + (reminders.length === 0 ? ' chip-active' : '')}
          onClick={() => onChange([])}
        >
          Sin recordatorio
        </button>
        {REMINDER_PRESETS.map((m) => (
          <button
            type="button"
            key={m}
            className={'chip recurrence-preset' + (isActive(m) ? ' chip-active' : '')}
            onClick={() => toggle(m)}
          >
            {reminderLabel(m, anchor)}
          </button>
        ))}
        <button
          type="button"
          className={'chip recurrence-preset' + (customMode ? ' chip-active' : '')}
          onClick={() => setCustomMode((v) => !v)}
        >
          Personalizado…
        </button>
      </div>

      {customMode && (
        <div className="day-modal-group">
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
      )}
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

// Ubicación + adjunto (foto/archivo) + nota de un evento — formato
// "Nuevo evento" de referencia. Comparte estos tres campos entre
// AddEventForm y EditEventForm; quien la usa decide cuándo subir el
// archivo (en el propio handleSubmit, junto con crear/guardar el
// evento).
function EventExtrasFields({
  locationLabel,
  onLocationLabelChange,
  coords,
  onCoordsChange,
  attachmentFile,
  onAttachmentFileChange,
  existingAttachment,
  onRemoveExistingAttachment,
  note,
  onNoteChange,
}: {
  locationLabel: string
  onLocationLabelChange: (v: string) => void
  coords: { latitude: number; longitude: number } | null
  onCoordsChange: (c: { latitude: number; longitude: number } | null) => void
  attachmentFile: File | null
  onAttachmentFileChange: (f: File | null) => void
  existingAttachment: { kind: 'foto' | 'archivo'; name: string | null } | null
  onRemoveExistingAttachment: () => void
  note: string
  onNoteChange: (v: string) => void
}) {
  const [locating, setLocating] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ubicación/Adjunto/Nota empiezan plegados y se abren al tocar su
  // icono (petición real: "que solo se desplieguen si se le da al
  // icono") — si el evento YA trae algo en alguno, ese arranca
  // desplegado para no esconder un dato que ya existía.
  const [openSections, setOpenSections] = useState<Set<'location' | 'attachment' | 'note'>>(() => {
    const initial = new Set<'location' | 'attachment' | 'note'>()
    if (locationLabel || coords) initial.add('location')
    if (existingAttachment || attachmentFile) initial.add('attachment')
    if (note) initial.add('note')
    return initial
  })
  function toggleSection(key: 'location' | 'attachment' | 'note') {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Petición real: "no siempre es la ubicación actual la que se quiere
  // adjuntar" — el GPS ya no es la única forma, se puede buscar
  // cualquier sitio por nombre/dirección (sin mapa de pago, Nominatim
  // es gratis). Petición posterior: "que dar a buscar te lleve
  // directamente al mapa" — el botón abre el mapa interactivo en vez de
  // una lista de texto, y ya no hace falta haber escrito nada antes.
  function handleConfirmMapLocation(result: { latitude: number; longitude: number; label: string | null }) {
    if (result.label) onLocationLabelChange(result.label)
    onCoordsChange({ latitude: result.latitude, longitude: result.longitude })
    setShowMap(false)
  }

  async function handleUseCurrentPosition() {
    setLocating(true)
    setError(null)
    try {
      const pos = await getCurrentPosition()
      onCoordsChange(pos)
      // Se rellena el nombre del sitio solo — antes se quedaba vacío
      // aunque la ubicación sí se hubiera capturado (bug real).
      const label = await reverseGeocode(pos.latitude, pos.longitude)
      if (label) onLocationLabelChange(label)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo obtener la ubicación'))
    } finally {
      setLocating(false)
    }
  }

  return (
    <>
      <div className="filter-row">
        <button
          type="button"
          className={'chip' + (openSections.has('location') ? ' chip-active' : '')}
          onClick={() => toggleSection('location')}
        >
          📍 Ubicación
        </button>
        <button
          type="button"
          className={'chip' + (openSections.has('attachment') ? ' chip-active' : '')}
          onClick={() => toggleSection('attachment')}
        >
          📷📎 Adjunto
        </button>
        <button
          type="button"
          className={'chip' + (openSections.has('note') ? ' chip-active' : '')}
          onClick={() => toggleSection('note')}
        >
          📝 Nota
        </button>
      </div>

      {openSections.has('location') && (
        <>
          <label>
            Ubicación (opcional)
            <div className="inline-fields">
              <input
                type="text"
                value={locationLabel}
                onChange={(e) => onLocationLabelChange(e.target.value)}
                placeholder="Nombre del sitio o dirección"
                style={{ flex: 1 }}
              />
              <button type="button" className="link-button" onClick={() => setShowMap(true)}>
                🔍 Buscar en el mapa
              </button>
            </div>
          </label>
          {showMap && (
            <LocationPickerModal
              initialQuery={locationLabel}
              initialCoords={coords}
              onConfirm={handleConfirmMapLocation}
              onClose={() => setShowMap(false)}
            />
          )}
          <div className="inline-fields">
            <button type="button" className="link-button" onClick={handleUseCurrentPosition} disabled={locating}>
              {coords ? '✓ Ubicación real guardada' : locating ? 'Obteniendo…' : '📍 Usar mi ubicación actual'}
            </button>
            {coords && (
              <button type="button" className="link-button" onClick={() => onCoordsChange(null)}>
                Quitar coordenadas
              </button>
            )}
          </div>
        </>
      )}

      {openSections.has('attachment') && (
        <label>
          Foto o archivo adjunto (opcional)
          {existingAttachment && !attachmentFile ? (
            <div className="inline-fields">
              <span>
                {existingAttachment.kind === 'foto' ? '📷' : '📎'} {existingAttachment.name ?? 'Adjunto actual'}
              </span>
              <button type="button" className="link-button" onClick={onRemoveExistingAttachment}>
                Quitar
              </button>
            </div>
          ) : (
            <input type="file" onChange={(e) => onAttachmentFileChange(e.target.files?.[0] ?? null)} />
          )}
        </label>
      )}

      {openSections.has('note') && (
        <label>
          Nota (opcional)
          <textarea value={note} onChange={(e) => onNoteChange(e.target.value)} rows={2} />
        </label>
      )}

      {error && <p className="error">{error}</p>}
    </>
  )
}

// Sube el adjunto pendiente (si lo hay) y devuelve los campos listos
// para mandar a createEvent/updateEvent.
async function resolveEventAttachment(
  file: File | null,
): Promise<{ attachmentStoragePath: string | null; attachmentKind: 'foto' | 'archivo' | null; attachmentOriginalName: string | null }> {
  if (!file) return { attachmentStoragePath: null, attachmentKind: null, attachmentOriginalName: null }
  if (file.type.startsWith('image/')) {
    const path = await uploadEventPhoto(file)
    return { attachmentStoragePath: path, attachmentKind: 'foto', attachmentOriginalName: file.name }
  }
  const path = await uploadEventFile(file)
  return { attachmentStoragePath: path, attachmentKind: 'archivo', attachmentOriginalName: file.name }
}

function EditEventForm({
  event,
  members,
  categories,
  onDone,
  onCancel,
  onManageCategories,
}: {
  event: CalendarEvent
  members: FamilyMember[]
  categories: CalendarCategory[]
  onDone: () => void
  onCancel: () => void
  onManageCategories: () => void
}) {
  // FASE CALENDARIO — una Tarea se edita con el mismo formulario reducido con el que se crea (Parte 2/3:
  // sin hora, sin repetición, sin recordatorios) — nunca se le ofrecen campos que nunca tuvo. El `kind`
  // de un registro no cambia nunca desde aquí (no hay conversión Evento↔Tarea en esta fase).
  const isTask = event.kind === 'task'
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
  const [locationLabel, setLocationLabel] = useState(event.locationLabel ?? '')
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    event.locationLatitude != null && event.locationLongitude != null
      ? { latitude: event.locationLatitude, longitude: event.locationLongitude }
      : null,
  )
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentRemoved, setAttachmentRemoved] = useState(false)
  const [note, setNote] = useState(event.note ?? '')
  const [visibility, setVisibility] = useState<'shared' | 'private'>(event.visibility)
  const [categoryId, setCategoryId] = useState<string | null>(event.categoryId)
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
      const effectiveAllDay = isTask ? true : allDay
      const startAt = new Date(`${date}T${effectiveAllDay ? '00:00' : time || '00:00'}`).toISOString()
      const endAt = !effectiveAllDay && endTime ? new Date(`${date}T${endTime}`).toISOString() : null
      // Mismo respaldo que al crear: si no hay nadie marcado pero el
      // título ya dice quién es, se asigna solo en vez de quedarse gris.
      const detectedMember = selectedMembers.length === 0 ? findMemberInText(title, members) : null
      const effectiveMembers = selectedMembers.length > 0 ? selectedMembers : detectedMember ? [detectedMember.id] : []
      const attachment = attachmentFile
        ? await resolveEventAttachment(attachmentFile)
        : attachmentRemoved
          ? { attachmentStoragePath: null, attachmentKind: null, attachmentOriginalName: null }
          : {
              attachmentStoragePath: event.attachmentStoragePath,
              attachmentKind: event.attachmentKind,
              attachmentOriginalName: event.attachmentOriginalName,
            }
      await updateEvent(event.id, {
        title,
        startAt,
        endAt,
        allDay: effectiveAllDay,
        recurrenceRule: isTask
          ? null
          : buildRecurrenceRule(recurrence.freq, recurrence.byDay, recurrence.skipHolidays, recurrence.until || null, recurrence.interval),
        reminders: isTask ? [] : reminders,
        memberIds: effectiveMembers,
        points: effectiveMembers.length === 1 ? points : 0,
        locationLabel: locationLabel.trim() || null,
        locationLatitude: coords?.latitude ?? null,
        locationLongitude: coords?.longitude ?? null,
        note: note.trim() || null,
        // RETOQUE — antes se forzaba 'shared' para toda Tarea aquí mismo (bug de privacidad real: una
        // Tarea no podía ser privada ni aunque el usuario lo pidiera) — ahora el checkbox "🔒 Solo yo"
        // se ofrece y se respeta igual para Evento y para Tarea.
        visibility,
        categoryId,
        ...attachment,
      })
      onDone()
    } catch (err) {
      setError(errorMessage(err, isTask ? 'No se pudo guardar la tarea' : 'No se pudo guardar el evento'))
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
      {/* Petición real: "quiero que las notas se puedan poner con una
          etiqueta de personal y que se vean solo en el calendario del
          usuario que las pone... que los demás usuarios aunque sean de
          la familia no lo puedan ver" — convive con el resto de
          eventos de la familia (mismas vistas), pero el servidor
          filtra quién puede llegar a leerlo (RLS, ver migración 0089).
          RETOQUE: antes vivía dentro de {!isTask && ...} (bug real: una Tarea no podía marcarse
          privada) — ahora se ofrece igual para Evento y para Tarea. */}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={visibility === 'private'}
          onChange={(e) => setVisibility(e.target.checked ? 'private' : 'shared')}
        />
        🔒 Privado — Solo yo puedo verlo
      </label>
      {!isTask && (
        <>
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
          <FieldDropdown
            label="Repetición"
            summary={
              recurrenceLabel(buildRecurrenceRule(recurrence.freq, recurrence.byDay, recurrence.skipHolidays, recurrence.until || null, recurrence.interval)) ||
              'No se repite'
            }
          >
            <RecurrenceControl value={recurrence} onChange={setRecurrence} />
          </FieldDropdown>
          <FieldDropdown
            label="Recordatorio"
            summary={reminders.length === 0 ? 'Sin recordatorio' : reminders.map((r) => reminderLabel(r.minutesBefore, r.anchor)).join(', ')}
          >
            <ReminderPicker reminders={reminders} onChange={setReminders} hasEnd={!allDay && !!endTime} />
          </FieldDropdown>
        </>
      )}
      <WhoDropdown members={members} selected={selectedMembers} onToggle={toggleMember} />
      <CategoryDropdown categories={categories} selected={categoryId} onChange={setCategoryId} onManageCategories={onManageCategories} />
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
      <EventExtrasFields
        locationLabel={locationLabel}
        onLocationLabelChange={setLocationLabel}
        coords={coords}
        onCoordsChange={setCoords}
        attachmentFile={attachmentFile}
        onAttachmentFileChange={setAttachmentFile}
        existingAttachment={
          !attachmentRemoved && event.attachmentKind
            ? { kind: event.attachmentKind, name: event.attachmentOriginalName }
            : null
        }
        onRemoveExistingAttachment={() => setAttachmentRemoved(true)}
        note={note}
        onNoteChange={setNote}
      />
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
  categories,
  onAdded,
  defaultDate,
  defaultMemberIds,
  hideHeading,
  onManageCategories,
  defaultVisibility = 'shared',
}: {
  members: FamilyMember[]
  events: CalendarEvent[]
  categories: CalendarCategory[]
  onAdded: () => void
  defaultDate?: string
  defaultMemberIds?: string[]
  hideHeading?: boolean
  onManageCategories: () => void
  // RETOQUE — 'private' cuando se crea desde Calendario → Personal (ver CalendarScreen): el checkbox
  // empieza marcado, dejando claro que "aquí se crea privado por defecto" sin tener que tocar nada más;
  // desde cualquier otra vista sigue siendo 'shared' por defecto, como siempre.
  defaultVisibility?: 'shared' | 'private'
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
  const [locationLabel, setLocationLabel] = useState('')
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [visibility, setVisibility] = useState<'shared' | 'private'>(defaultVisibility)
  const [categoryId, setCategoryId] = useState<string | null>(null)
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
      const attachment = await resolveEventAttachment(attachmentFile)
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
        locationLabel: locationLabel.trim() || null,
        locationLatitude: coords?.latitude ?? null,
        locationLongitude: coords?.longitude ?? null,
        note: note.trim() || null,
        visibility,
        categoryId,
        ...attachment,
      })
      setTitle('')
      setDate(defaultDate ?? '')
      setTime('')
      setEndTime('')
      setRecurrence({ freq: '', byDay: [], interval: 1, skipHolidays: false, until: '' })
      setReminders([])
      setSelectedMembers([])
      setPoints(0)
      setLocationLabel('')
      setCoords(null)
      setAttachmentFile(null)
      setNote('')
      setVisibility(defaultVisibility)
      setCategoryId(null)
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el evento'))
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
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={visibility === 'private'}
          onChange={(e) => setVisibility(e.target.checked ? 'private' : 'shared')}
        />
        🔒 Privado — Solo yo puedo verlo
      </label>
      <FieldDropdown
        label="Repetición"
        summary={
          recurrenceLabel(buildRecurrenceRule(recurrence.freq, recurrence.byDay, recurrence.skipHolidays, recurrence.until || null, recurrence.interval)) ||
          'No se repite'
        }
      >
        <RecurrenceControl value={recurrence} onChange={setRecurrence} />
      </FieldDropdown>
      <FieldDropdown
        label="Recordatorio"
        summary={reminders.length === 0 ? 'Sin recordatorio' : reminders.map((r) => reminderLabel(r.minutesBefore, r.anchor)).join(', ')}
      >
        <ReminderPicker reminders={reminders} onChange={setReminders} hasEnd={!allDay && !!endTime} />
      </FieldDropdown>
      <WhoDropdown members={members} selected={selectedMembers} onToggle={toggleMember} />
      <CategoryDropdown categories={categories} selected={categoryId} onChange={setCategoryId} onManageCategories={onManageCategories} />
      {selectedMembers.length === 1 && (
        <label>
          Puntos al marcarlo "Hecho" (opcional)
          <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
      )}
      <EventExtrasFields
        locationLabel={locationLabel}
        onLocationLabelChange={setLocationLabel}
        coords={coords}
        onCoordsChange={setCoords}
        attachmentFile={attachmentFile}
        onAttachmentFileChange={setAttachmentFile}
        existingAttachment={null}
        onRemoveExistingAttachment={() => {}}
        note={note}
        onNoteChange={setNote}
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear evento'}
      </button>
    </form>
  )
}

// FASE CALENDARIO — formulario REDUCIDO de Tarea (Parte 2/3): Título + Fecha (obligatorios);
// ¿Para quién?/Categoría/Ubicación/Adjunto/Nota/Puntos (opcionales, reutilizando EXACTAMENTE los mismos
// componentes que el Evento completo — WhoDropdown, CategoryDropdown, EventExtrasFields — nunca
// sistemas paralelos). Sin hora, sin fin, sin repetición, sin recordatorios: allDay:true fijo, nunca una
// hora inventada. syncToGoogle:false fijo (Parte 25: una Tarea nunca sincroniza por defecto — ver la
// migración 0184, que reutiliza calendar_events.sync_to_google tal cual, sin columna nueva).
function AddTaskForm({
  members,
  categories,
  onAdded,
  defaultDate,
  onManageCategories,
  defaultVisibility = 'shared',
}: {
  members: FamilyMember[]
  categories: CalendarCategory[]
  onAdded: () => void
  defaultDate?: string
  onManageCategories: () => void
  defaultVisibility?: 'shared' | 'private'
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(defaultDate ?? '')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [points, setPoints] = useState(0)
  const [locationLabel, setLocationLabel] = useState('')
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  // RETOQUE — una Tarea también puede ser privada (antes no había ningún control: createEvent siempre
  // recibía 'shared' sin que el usuario pudiera elegir, bug real confirmado en pruebas con Personal).
  const [visibility, setVisibility] = useState<'shared' | 'private'>(defaultVisibility)
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
      const detectedMember = selectedMembers.length === 0 ? findMemberInText(title, members) : null
      const effectiveMembers = selectedMembers.length > 0 ? selectedMembers : detectedMember ? [detectedMember.id] : []
      const attachment = await resolveEventAttachment(attachmentFile)
      await createEvent({
        title,
        startAt: new Date(`${date}T00:00`).toISOString(),
        endAt: null,
        allDay: true,
        recurrenceRule: null,
        reminders: [],
        memberIds: effectiveMembers,
        points: effectiveMembers.length === 1 ? points : 0,
        locationLabel: locationLabel.trim() || null,
        locationLatitude: coords?.latitude ?? null,
        locationLongitude: coords?.longitude ?? null,
        note: note.trim() || null,
        visibility,
        kind: 'task',
        categoryId,
        syncToGoogle: false,
        ...attachment,
      })
      setTitle('')
      setDate(defaultDate ?? '')
      setSelectedMembers([])
      setCategoryId(null)
      setPoints(0)
      setLocationLabel('')
      setCoords(null)
      setAttachmentFile(null)
      setNote('')
      setVisibility(defaultVisibility)
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear la tarea'))
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
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={visibility === 'private'}
          onChange={(e) => setVisibility(e.target.checked ? 'private' : 'shared')}
        />
        🔒 Privado — Solo yo puedo verlo
      </label>
      <WhoDropdown members={members} selected={selectedMembers} onToggle={toggleMember} />
      <CategoryDropdown categories={categories} selected={categoryId} onChange={setCategoryId} onManageCategories={onManageCategories} />
      {selectedMembers.length === 1 && (
        <label>
          Puntos al marcarla "Hecha" (opcional)
          <input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
      )}
      <EventExtrasFields
        locationLabel={locationLabel}
        onLocationLabelChange={setLocationLabel}
        coords={coords}
        onCoordsChange={setCoords}
        attachmentFile={attachmentFile}
        onAttachmentFileChange={setAttachmentFile}
        existingAttachment={null}
        onRemoveExistingAttachment={() => {}}
        note={note}
        onNoteChange={setNote}
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear tarea'}
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
      setError(errorMessage(err, 'No se pudo sincronizar'))
    } finally {
      setSyncingId(null)
    }
  }

  async function handleDeleteFeed(id: string) {
    try {
      await deleteFeed(id)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar el calendario'))
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
          <div key={f.id} className="card event-card" style={{ background: toPastel(dotColorForFeed(f.id)) }}>
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
                (fillColor && !isSelected ? ' month-grid-day-filled' : '') +
                (isWeekend(day.dateStr) ? ' month-grid-day-weekend' : '')
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
      .catch((err) => setError(errorMessage(err, String(err))))
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
      setError(errorMessage(err, String(err)))
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
      setError(errorMessage(err, String(err)))
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
      setError(errorMessage(err, String(err)))
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
      setError(errorMessage(err, 'No se pudo enlazar el calendario'))
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

// Copia de EconomiaMenuDropdown adaptada a las claves de Calendario —
// mismas clases CSS .economia-menu-* (genéricas).
function OpensFirstBadge() {
  return (
    <span className="muted" style={{ fontSize: 11, marginLeft: 8, fontWeight: 400 }}>
      ⭐ Al abrir
    </span>
  )
}

function CalendarioMenuDropdown({
  activeTab,
  layout,
  onLayoutChange,
  pinnedItems,
  onTogglePin,
  onActivate,
  onClose,
}: {
  activeTab: ViewMode
  layout: CalendarioMenuGroup[]
  onLayoutChange: (next: CalendarioMenuGroup[]) => void
  pinnedItems: CalendarioMenuItemKey[]
  onTogglePin: (key: CalendarioMenuItemKey) => void
  onActivate: (key: CalendarioMenuItemKey) => void
  onClose: () => void
}) {
  const openFirstKey = firstCalendarioView(layout)
  const [editMode, setEditMode] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [addingGroupName, setAddingGroupName] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingCustomItem, setAddingCustomItem] = useState(false)
  const [newItemIcon, setNewItemIcon] = useState('📌')
  const [newItemLabel, setNewItemLabel] = useState('')
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null)
  const [editItemIcon, setEditItemIcon] = useState('')
  const [editItemLabel, setEditItemLabel] = useState('')
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  function moveItem(groupId: string, index: number, direction: -1 | 1) {
    const group = layout.find((g) => g.id === groupId)
    if (!group) return
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= group.items.length) return
    const items = [...group.items]
    ;[items[index], items[newIndex]] = [items[newIndex], items[index]]
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items } : g)))
  }

  function moveItemToGroup(itemKey: CalendarioMenuItemKey, fromGroupId: string, toGroupId: string) {
    if (fromGroupId === toGroupId) return
    const moved = layout.find((g) => g.id === fromGroupId)?.items.find((it) => it.key === itemKey)
    if (!moved) return
    onLayoutChange(
      layout.map((g) => {
        if (g.id === fromGroupId) return { ...g, items: g.items.filter((it) => it.key !== itemKey) }
        if (g.id === toGroupId) return { ...g, items: [...g.items, moved] }
        return g
      }),
    )
  }

  function handleAddGroup(e: FormEvent) {
    e.preventDefault()
    if (!addingGroupName.trim()) return
    onLayoutChange([...layout, { id: crypto.randomUUID(), name: addingGroupName.trim(), items: [] }])
    setAddingGroupName('')
    setAddingGroup(false)
  }

  function handleRenameGroup(id: string) {
    onLayoutChange(layout.map((g) => (g.id === id ? { ...g, name: renameValue.trim() || null } : g)))
    setRenamingGroupId(null)
  }

  function deleteGroup(id: string) {
    const group = layout.find((g) => g.id === id)
    const rest = layout.filter((g) => g.id !== id)
    if (!group || rest.length === 0) return
    const [first, ...others] = rest
    onLayoutChange([{ ...first, items: [...first.items, ...group.items] }, ...others])
  }

  function handleAddCustomItem(e: FormEvent) {
    e.preventDefault()
    if (!newItemLabel.trim()) return
    const entry: CalendarioMenuEntry = { key: `custom:${crypto.randomUUID()}`, icon: newItemIcon, label: newItemLabel.trim() }
    onLayoutChange(layout.map((g, i) => (i === 0 ? { ...g, items: [...g.items, entry] } : g)))
    setNewItemIcon('📌')
    setNewItemLabel('')
    setAddingCustomItem(false)
  }

  function handleSaveItem(groupId: string, key: CalendarioMenuItemKey) {
    onLayoutChange(
      layout.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((it) => (it.key === key ? { ...it, icon: editItemIcon, label: editItemLabel.trim() || it.label } : it)) }
          : g,
      ),
    )
    setEditingItemKey(null)
  }

  function deleteItem(groupId: string, key: CalendarioMenuItemKey) {
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((it) => it.key !== key) } : g)))
  }

  function handleItemActivate(entry: CalendarioMenuEntry) {
    if (isCustomCalendarioMenuKey(entry.key)) {
      setPlaceholderNotice(true)
      setTimeout(() => setPlaceholderNotice(false), 2500)
      return
    }
    onActivate(entry.key)
    onClose()
  }

  return (
    <div className="economia-menu-dropdown">
      <button type="button" className="link-button economia-menu-edit-toggle" onClick={() => setEditMode((v) => !v)}>
        {editMode ? '✓ Listo' : '✏️ Editar'}
      </button>

      {layout.map((group) => (
        <div key={group.id} className="economia-menu-group">
          {(group.name || editMode) &&
            (renamingGroupId === group.id ? (
              <form
                className="inline-fields"
                style={{ margin: '4px 4px 6px' }}
                onSubmit={(e) => {
                  e.preventDefault()
                  handleRenameGroup(group.id)
                }}
              >
                <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus style={{ flex: 1 }} />
                <button type="submit">Guardar</button>
              </form>
            ) : (
              <div className="economia-menu-group-title">
                <span>{group.name ?? 'Sin categoría'}</span>
                {editMode && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="link-button"
                      style={{ padding: '2px 6px' }}
                      onClick={() => {
                        setRenamingGroupId(group.id)
                        setRenameValue(group.name ?? '')
                      }}
                      aria-label={`Renombrar categoría ${group.name ?? ''}`}
                    >
                      ✎
                    </button>
                    {layout.length > 1 && (
                      <ConfirmIconButton
                        icon="✕"
                        className="link-button"
                        ariaLabel={`Eliminar categoría ${group.name ?? ''}`}
                        onConfirm={() => deleteGroup(group.id)}
                      />
                    )}
                  </span>
                )}
              </div>
            ))}

          {group.items.map((entry, i) => {
            const meta = calendarioMenuEntryMeta(entry)
            const isTab = isCalendarioSubTab(entry.key)
            const isCustom = isCustomCalendarioMenuKey(entry.key)

            if (editMode && editingItemKey === entry.key) {
              return (
                <form
                  key={entry.key}
                  className="inline-fields"
                  style={{ margin: '2px 4px' }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveItem(group.id, entry.key)
                  }}
                >
                  <input type="text" value={editItemIcon} onChange={(e) => setEditItemIcon(e.target.value)} style={{ width: 48, textAlign: 'center', flex: 'none' }} maxLength={4} autoFocus />
                  <input type="text" value={editItemLabel} onChange={(e) => setEditItemLabel(e.target.value)} style={{ flex: 1 }} />
                  <button type="submit">Guardar</button>
                </form>
              )
            }

            return (
              <div key={entry.key} className={'economia-menu-row' + (isTab && activeTab === entry.key ? ' active' : '')}>
                {editMode ? (
                  <span className="economia-menu-item">
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                    {entry.key === openFirstKey && <OpensFirstBadge />}
                  </span>
                ) : (
                  <button type="button" className="economia-menu-item" onClick={() => handleItemActivate(entry)}>
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                    {entry.key === openFirstKey && <OpensFirstBadge />}
                  </button>
                )}

                {editMode ? (
                  <span className="economia-menu-edit-controls">
                    <button type="button" className="link-button" style={{ padding: '2px 6px' }} disabled={i === 0} onClick={() => moveItem(group.id, i, -1)} aria-label={`Subir ${meta.label}`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      style={{ padding: '2px 6px' }}
                      disabled={i === group.items.length - 1}
                      onClick={() => moveItem(group.id, i, 1)}
                      aria-label={`Bajar ${meta.label}`}
                    >
                      ↓
                    </button>
                    <select
                      value={group.id}
                      onChange={(e) => moveItemToGroup(entry.key, group.id, e.target.value)}
                      aria-label={`Mover ${meta.label} a otra categoría`}
                    >
                      {layout.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name ?? 'Sin categoría'}
                        </option>
                      ))}
                    </select>
                    {isCustom && (
                      <>
                        <button
                          type="button"
                          className="link-button"
                          style={{ padding: '2px 6px' }}
                          onClick={() => {
                            setEditingItemKey(entry.key)
                            setEditItemIcon(meta.icon)
                            setEditItemLabel(meta.label)
                          }}
                          aria-label={`Renombrar ${meta.label}`}
                        >
                          ✎
                        </button>
                        <ConfirmIconButton
                          icon="✕"
                          className="link-button"
                          ariaLabel={`Eliminar ${meta.label}`}
                          onConfirm={() => deleteItem(group.id, entry.key)}
                        />
                      </>
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="economia-menu-pin"
                    onClick={() => onTogglePin(entry.key)}
                    aria-label={pinnedItems.includes(entry.key) ? `Quitar ${meta.label} de la pantalla de Calendario` : `Sacar ${meta.label} a la pantalla de Calendario`}
                  >
                    {pinnedItems.includes(entry.key) ? '📍 Quitar' : '📌 Sacar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {placeholderNotice && (
        <p className="muted" style={{ fontSize: 12, padding: '4px 12px' }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {editMode && (
        <>
          {addingCustomItem ? (
            <form onSubmit={handleAddCustomItem} className="inline-fields" style={{ margin: '6px 4px' }}>
              <input
                type="text"
                value={newItemIcon}
                onChange={(e) => setNewItemIcon(e.target.value)}
                style={{ width: 48, textAlign: 'center', flex: 'none' }}
                maxLength={4}
                aria-label="Icono"
              />
              <input
                type="text"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                placeholder="Nombre del acceso"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="submit">Crear</button>
            </form>
          ) : (
            <button type="button" className="economia-menu-item" onClick={() => setAddingCustomItem(true)}>
              <span aria-hidden="true">📌</span>
              Nuevo acceso
            </button>
          )}

          {addingGroup ? (
            <form onSubmit={handleAddGroup} className="inline-fields" style={{ margin: '6px 4px' }}>
              <input
                type="text"
                value={addingGroupName}
                onChange={(e) => setAddingGroupName(e.target.value)}
                placeholder="Nombre de la categoría"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="submit">Crear</button>
            </form>
          ) : (
            <button type="button" className="economia-menu-item" onClick={() => setAddingGroup(true)}>
              <span aria-hidden="true">➕</span>
              Nueva categoría
            </button>
          )}
        </>
      )}
    </div>
  )
}
