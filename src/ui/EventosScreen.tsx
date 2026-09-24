import { ChangeEvent, type CSSProperties, FormEvent, type ReactNode, PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import eventosHeaderImg from '@/assets/eventos/eventos-header.jpg'
import {
  addEventActivity,
  addEventBudgetItem,
  addEventDayPlanItem,
  addEventDecorationItem,
  addEventFavorItem,
  addEventGift,
  addEventGuest,
  addEventMenuItem,
  addEventPayment,
  addEventProvider,
  addEventSpecialDetail,
  addEventTable,
  addEventTask,
  addEnabledModules,
  archiveEvent,
  linkEventTaskToCalendar,
  unlinkEventTaskFromCalendar,
  assignGuestTable,
  createEvent,
  deleteEvent,
  deleteEventActivity,
  deleteEventTemplate,
  deleteEventBudgetItem,
  deleteEventDayPlanItem,
  deleteEventDecorationItem,
  deleteEventFavorItem,
  deleteEventGift,
  deleteEventGuest,
  deleteEventMenuItem,
  deleteEventPayment,
  deleteEventProvider,
  deleteEventSpecialDetail,
  deleteEventTable,
  deleteEventTask,
  disableEventOpenLink,
  duplicateEvent,
  getEventInvitation,
  getEventOpenRsvpUrl,
  getGuestRsvpUrl,
  getInvitationPhotoUrl,
  syncEventToCalendar,
  linkPaymentReminder,
  syncRsvpDeadlineReminder,
  listEventActivities,
  listEventBudgetItems,
  listEventDayPlan,
  listEventDecorationItems,
  listEventFavorItems,
  listEventGifts,
  listEventGuests,
  listEventMenuItems,
  listEventPayments,
  listEventProviders,
  listEventSpecialDetails,
  listEventTables,
  listEventTasks,
  listEvents,
  listEventTemplates,
  recalculateAutoTasks,
  regenerateEventOpenRsvpUrl,
  regenerateGuestRsvpUrl,
  saveEventInvitation,
  saveEventTemplate,
  transferActivityMaterialsToShopping,
  transferDecorationItemToShopping,
  transferMenuToShopping,
  unarchiveEvent,
  updateEvent,
  updateEventDecorationItem,
  updateEventFavorItem,
  updateEventGuest,
  updateEventPayment,
  updateEventSpecialDetail,
  updateEventTask,
  uploadInvitationPhoto,
} from '@/data/events'
import { listExpenses, listBudgetCategories } from '@/data/finance'
import { listFamilyMembers } from '@/data/family'
// Fase 10 — reutiliza el mismo almacén de recordatorios que ya usa
// Calendario (calendar_event_reminders) en vez de crear uno propio de
// Eventos; no toca push/cron/service worker, solo configura qué debe
// avisar el pipeline ya existente.
import { listEventReminders, replaceReminders } from '@/data/calendar'
import { REMINDER_UNIT_OPTIONS, reminderMinutesFrom, type EventReminder, type ReminderUnit } from '@/domain/reminders'
import { isInternalTransferCategory } from '@/domain/finance'
import { errorMessage } from '@/domain/errorMessage'
import {
  autoArrangeLayers,
  buildInvitationMessage,
  buildInvitationTemplateLayers,
  buildMapsUrl,
  CELEBRATION_SUBTYPES,
  computeEventConclusions,
  computeEventHealth,
  computeEventStatusSummary,
  countPaymentAlerts,
  daysUntil,
  DUAL_LOCATION_EVENT_TYPES,
  type EventConclusion as EventConclusionType,
  EVENT_MODULES,
  EVENT_TYPES,
  EVENT_TYPE_META,
  eventDateLine,
  eventLocationLines,
  eventLocationMapLines,
  type EventHealthLevel,
  generateEventPlan,
  INVITATION_EMOJI_SUGGESTIONS,
  INVITATION_SHAPES,
  INVITATION_TEMPLATES,
  type InvitationTemplateMeta,
  isOverdueTask,
  isToday,
  makeInvitationLayer,
  rankUpcomingTasks,
  RECOMMENDED_MODULES,
  sortInvitationTemplatesForEvent,
} from '@/domain/events'
// Fase 8 — reutiliza el formateador DD/MM/YYYY que ya existe en
// Previsión (Economía) en vez de escribir uno nuevo para Eventos; es
// una función pura sin ninguna dependencia de Previsión/Economía.
import { formatSpanishDate } from '@/domain/forecastInstallmentPlanForm'
import { pastelPalette } from '@/domain/colors'
import { listShoppingItems } from '@/data/shopping'
import type {
  EventActivity,
  EventBudgetItem,
  EventDayPlanItem,
  EventDecorationItem,
  EventFavorItem,
  EventGiftReceived,
  EventGuest,
  EventGuestInviteScope,
  EventGuestRsvpStatus,
  EventMenuItem,
  EventModuleKey,
  EventPayment,
  EventProvider,
  EventSpecialDetail,
  EventTableSeat,
  EventTask,
  EventTemplate,
  EventType,
  FamilyEvent,
  FamilyMember,
  ShoppingItem,
  InvitationCanvas,
  InvitationLayer,
  InvitationTextStyle,
} from '@/domain/types'
import { shareText } from '@/services/share'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { ShareFallbackModal } from '@/ui/ShareFallbackModal'
import { LocationPickerModal } from '@/ui/LocationPickerModal'

// Módulo Eventos (PEPA Events) — plan aprobado en
// C:\Users\Usuario\.claude\plans\zany-wishing-brook.md.
// Fase 0: motor común configurable + tareas. Fase 1: invitados,
// presupuesto (con gasto real de Economía vía etiqueta), menú →
// traspaso a Compras, ceremonia/ubicaciones, proveedores, pagos/
// fianzas y enlace con Calendario. Fase 2: invitaciones + RSVP público.
// Fase 3: decoración, actividades, mesas, detalles/recuerdos, regalos
// recibidos, plan del día, modo "día del evento" y conclusiones PEPA.
const DATE_STATUS_OPTIONS: { value: FamilyEvent['dateStatus']; label: string }[] = [
  { value: 'pendiente', label: 'Todavía sin fecha' },
  { value: 'provisional', label: 'Fecha provisional' },
  { value: 'confirmada', label: 'Fecha confirmada' },
]

// Fase 7 — el emoji es presentación pura (vive aquí, no en domain/events.ts).
const EVENT_HEALTH_EMOJI: Record<EventHealthLevel, string> = {
  danger: '🔴',
  warning: '🟠',
  progress: '🟡',
  good: '🟢',
}

// Ceremonia (dos ubicaciones) solo tiene sentido en estos tipos —
// aunque el módulo esté activado, en otros tipos no se muestra.
// (DUAL_LOCATION_EVENT_TYPES importado de domain/events.ts, compartido
// con el texto de la invitación/RSVP.)

const RSVP_STATUS_OPTIONS: { value: EventGuestRsvpStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'no_asiste', label: 'No asiste' },
  { value: 'no_seguro', label: 'No seguro' },
]

const INVITE_SCOPE_OPTIONS: { value: EventGuestInviteScope; label: string }[] = [
  { value: 'ambas', label: 'Ceremonia + celebración' },
  { value: 'solo_ceremonia', label: 'Solo ceremonia' },
  { value: 'solo_celebracion', label: 'Solo celebración' },
]

function eventDateLabel(ev: FamilyEvent): string {
  if (ev.dateStatus === 'pendiente' || !ev.eventDate) return 'Sin fecha todavía'
  const label = new Date(`${ev.eventDate}T00:00`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Una línea que reduce su letra (hasta un mínimo) para que el texto quepa entero en vez
// de cortarse con "…" — petición real: "el tamaño del campo se ajusta al texto".
function FitText({ as: Tag, maxSize, minSize = 10, className, style, children }: { as: 'p' | 'strong'; maxSize: number; minSize?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      let size = maxSize
      el.style.fontSize = `${size}px`
      while (el.scrollWidth > el.clientWidth + 0.5 && size > minSize) {
        size -= 0.5
        el.style.fontSize = `${size}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  })
  return (
    <Tag ref={ref as never} className={className} style={style}>
      {children}
    </Tag>
  )
}

// Cabecera en dos filas: el tipo ("Cumpleaños") y debajo el nombre. Si el título ya
// empieza por el tipo ("Cumpleaños de Hugo") se le quita para no repetirlo → "Hugo".
function eventNameWithoutType(ev: FamilyEvent): string {
  const typeWord = EVENT_TYPE_META[ev.type].label.split(' ')[0]
  const stripped = ev.title.replace(new RegExp(`^${typeWord}\\s*(?:de la |del |de los |de las |de |:|-)?\\s*`, 'i'), '').trim()
  return stripped
}

// Cuenta atrás: a 2 semanas se pone amarilla y a la semana roja.
function countdownTone(days: number | null): 'normal' | 'warn' | 'alert' {
  if (days === null || days < 0) return 'normal'
  if (days <= 7) return 'alert'
  if (days <= 14) return 'warn'
  return 'normal'
}

// Fecha corta para la cabecera del evento ("Domingo, 18/10/2026"), para que quepa en una línea.
function eventShortDateLabel(ev: FamilyEvent): string {
  if (ev.dateStatus === 'pendiente' || !ev.eventDate) return 'Sin fecha todavía'
  const [y, m, d] = ev.eventDate.split('-')
  const weekday = new Date(`${ev.eventDate}T00:00`).toLocaleDateString('es-ES', { weekday: 'long' })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d}/${m}/${y}`
}

function ModulePickerChips({ modules, onChange }: { modules: EventModuleKey[]; onChange: (next: EventModuleKey[]) => void }) {
  return (
    <div className="filter-row" style={{ flexWrap: 'wrap' }}>
      {EVENT_MODULES.map((m) => {
        const checked = modules.includes(m.key)
        return (
          <button
            key={m.key}
            type="button"
            className={'chip' + (checked ? ' chip-active' : '')}
            onClick={() => onChange(checked ? modules.filter((k) => k !== m.key) : [...modules, m.key])}
          >
            {m.icon} {m.label}
          </button>
        )
      })}
    </div>
  )
}

const EVENT_MODULE_KEYS = new Set(EVENT_MODULES.map((m) => m.key))

// Fase 4 — deep-link real: /eventos?event=<uuid>&modulo=<clave>. No
// hace falta ninguna ruta ":id" nueva (":id" habría exigido tocar
// App.tsx/el 404.html de GitHub Pages) — con la SPA ya cargada,
// react-router resuelve el mismo "/eventos" con query string sin
// ningún salto de página, y un id inexistente o no autorizado
// simplemente no aparece en `events` (ya viene filtrado por RLS), así
// que el fallback a la lista de eventos es automático.
function validInitialModule(raw: string | null): EventModuleKey | null {
  return raw && EVENT_MODULE_KEYS.has(raw as EventModuleKey) ? (raw as EventModuleKey) : null
}

export function EventosScreen() {
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialModule, setInitialModule] = useState<EventModuleKey | null>(null)

  function reload() {
    listEvents(showArchived)
      .then(setEvents)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los eventos')))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [showArchived])

  // Consume el deep-link una sola vez, en cuanto los eventos ya están
  // cargados (antes no se sabe si el id es válido) — y limpia la URL
  // después, para que navegar dentro de Eventos a partir de ahí no
  // vuelva a forzar el mismo módulo.
  useEffect(() => {
    if (loading) return
    const eventParam = searchParams.get('event')
    if (!eventParam) return
    if (events.some((e) => e.id === eventParam)) {
      setSelectedId(eventParam)
      setInitialModule(validInitialModule(searchParams.get('modulo')))
    }
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, events])

  const selected = events.find((e) => e.id === selectedId) ?? null

  if (loading) return <div className="screen">Cargando eventos…</div>

  return (
    <div className="screen">
      {/* Petición real, con imagen de referencia: cabecera con foto para
          Eventos, igual que Familia/Alimentación/Calendario — esta
          sección tampoco tiene menú ☰ (una sola pantalla), así que solo
          sustituye el <h1> de texto plano, sin botón de menú encima. */}
      <div className="kitchen-header">
        <img src={eventosHeaderImg} alt="Eventos" className="kitchen-header-img" />
      </div>
      {error && <p className="error">{error}</p>}

      {selected ? (
        <EventDetail
          event={selected}
          initialModule={initialModule}
          onBack={() => setSelectedId(null)}
          onChanged={reload}
          onArchivedOrDeleted={() => {
            setSelectedId(null)
            reload()
          }}
          onDuplicated={(id) => {
            reload()
            setSelectedId(id)
          }}
        />
      ) : (
        <>
          <button type="button" onClick={() => setShowCreate(true)}>
            + Nuevo evento
          </button>
          {showCreate && (
            <CreateEventModal
              onClose={() => setShowCreate(false)}
              onCreated={(id) => {
                setShowCreate(false)
                reload()
                setSelectedId(id)
              }}
            />
          )}

          <div className="filter-row" style={{ marginTop: 12 }}>
            <button type="button" className={'chip' + (!showArchived ? ' chip-active' : '')} onClick={() => setShowArchived(false)}>
              En marcha
            </button>
            <button type="button" className={'chip' + (showArchived ? ' chip-active' : '')} onClick={() => setShowArchived(true)}>
              Archivados
            </button>
          </div>

          <div className="event-list" style={{ marginTop: 12 }}>
            {events.length === 0 && (
              <p className="muted">{showArchived ? 'Todavía no hay eventos archivados.' : 'Todavía no hay ningún evento — crea el primero.'}</p>
            )}
            {events
              .filter((ev) => showArchived === (ev.status === 'archivado'))
              .map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  className="card event-card"
                  style={{ textAlign: 'left', width: '100%' }}
                  onClick={() => setSelectedId(ev.id)}
                >
                  <strong>
                    {EVENT_TYPE_META[ev.type].icon} {ev.title}
                  </strong>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    {eventDateLabel(ev)}
                  </p>
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [type, setType] = useState<EventType>('cumpleanos')
  const [title, setTitle] = useState('')
  const [subtype, setSubtype] = useState(CELEBRATION_SUBTYPES[0])
  const [ageTurning, setAgeTurning] = useState('')
  const [dateStatus, setDateStatus] = useState<FamilyEvent['dateStatus']>('pendiente')
  const [eventDate, setEventDate] = useState('')
  const [moduleMode, setModuleMode] = useState<'recomendado' | 'elegir'>('recomendado')
  const [modules, setModules] = useState<EventModuleKey[]>(RECOMMENDED_MODULES.cumpleanos)
  const [theme, setTheme] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listEventTemplates()
      .then(setTemplates)
      .catch(() => {})
  }, [])

  function handleTypeChange(next: EventType) {
    setType(next)
    if (moduleMode === 'recomendado') setModules(RECOMMENDED_MODULES[next])
  }

  function handleUseTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((tpl) => tpl.id === id)
    if (!t) return
    setType(t.type)
    if (t.subtype) setSubtype(t.subtype)
    setTheme(t.theme)
    setModuleMode('elegir')
    setModules(t.enabledModules)
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!title.trim()) {
      setError('Ponle un nombre al evento.')
      return
    }
    if (type === 'cumpleanos' && !ageTurning.trim()) {
      setError('¿Cuántos años cumple?')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const details: Record<string, unknown> = {}
      if (type === 'cumpleanos') details.ageTurning = Number(ageTurning)
      const id = await createEvent({
        type,
        subtype: type === 'celebracion' ? subtype : null,
        title,
        dateStatus,
        eventDate: dateStatus === 'pendiente' ? null : eventDate || null,
        details,
        enabledModules: modules,
        theme,
      })
      onCreated(id)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el evento'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo evento
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          {templates.length > 0 && (
            <label>
              Usar plantilla (opcional)
              <div className="inline-fields">
                <select value={templateId} onChange={(e) => handleUseTemplate(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Sin plantilla</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {templateId && (
                  <ConfirmIconButton
                    icon="✕"
                    className="icon-button"
                    ariaLabel="Borrar plantilla"
                    onConfirm={() =>
                      deleteEventTemplate(templateId).then(() => {
                        setTemplates((ts) => ts.filter((t) => t.id !== templateId))
                        setTemplateId('')
                      })
                    }
                  />
                )}
              </div>
            </label>
          )}
          <label>
            Nombre del evento
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cumpleaños de Eric" autoFocus />
          </label>
          <label>
            Tipo
            <select value={type} onChange={(e) => handleTypeChange(e.target.value as EventType)}>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_META[t].icon} {EVENT_TYPE_META[t].label}
                </option>
              ))}
            </select>
          </label>
          {type === 'celebracion' && (
            <label>
              Tipo de celebración
              <select value={subtype} onChange={(e) => setSubtype(e.target.value)}>
                {CELEBRATION_SUBTYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
          {type === 'cumpleanos' && (
            <label>
              ¿Cuántos años cumple?
              <input type="number" min={0} value={ageTurning} onChange={(e) => setAgeTurning(e.target.value)} />
            </label>
          )}
          <label>
            Fecha
            <select value={dateStatus} onChange={(e) => setDateStatus(e.target.value as FamilyEvent['dateStatus'])}>
              {DATE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {dateStatus !== 'pendiente' && (
            <label>
              {dateStatus === 'provisional' ? 'Fecha provisional' : 'Fecha'}
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </label>
          )}

          <strong style={{ marginTop: 8 }}>¿Qué quieres usar en este evento?</strong>
          <div className="filter-row">
            <button
              type="button"
              className={'chip' + (moduleMode === 'recomendado' ? ' chip-active' : '')}
              onClick={() => {
                setModuleMode('recomendado')
                setModules(RECOMMENDED_MODULES[type])
              }}
            >
              Recomendado
            </button>
            <button type="button" className={'chip' + (moduleMode === 'elegir' ? ' chip-active' : '')} onClick={() => setModuleMode('elegir')}>
              Elegir yo
            </button>
          </div>
          {moduleMode === 'elegir' && <ModulePickerChips modules={modules} onChange={setModules} />}
          <p className="muted" style={{ fontSize: 12 }}>
            Podrás activar o desactivar módulos más adelante desde el propio evento.
          </p>

          <button type="submit" disabled={saving}>
            {saving ? 'Creando…' : 'Crear evento'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Petición real: "reorganizar Eventos con este aspecto o similar" —
// antes EventDetail apilaba las 12+ secciones de un evento, todas
// visibles a la vez, en una sola página larguísima. Ahora es un
// dashboard compacto (cabecera con cuenta atrás, "Preparación del
// evento", "Pepa te recomienda" con las tareas más urgentes, y una
// rejilla de tarjetas — una por módulo activado) y cada tarjeta abre
// SU sección a pantalla completa (openModule) en vez de tenerlas todas
// desplegadas. Los 12 componentes de sección de abajo (GuestsSection,
// BudgetSection...) no cambian nada por dentro, solo CUÁNDO se montan.
function EventDetail({
  event,
  initialModule = null,
  onBack,
  onChanged,
  onArchivedOrDeleted,
  onDuplicated,
}: {
  event: FamilyEvent
  initialModule?: EventModuleKey | null
  onBack: () => void
  onChanged: () => void
  onArchivedOrDeleted: () => void
  onDuplicated: (id: string) => void
}) {
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [showAllTasks, setShowAllTasks] = useState(false)
  // Fase 8 — rediseño de Preparativos: qué tarea se está editando ahora
  // mismo (ficha compacta + modal de edición, en vez de una fila de
  // tabla con checkbox+texto+fecha+responsable+✕ compitiendo por sitio).
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  // Fase 1 — reforma de Editar/•••: un único punto de entrada
  // ("Gestionar evento") en vez de dos controles compitiendo por la
  // misma clase de acción, ver ManageEventModal más abajo.
  const [showManage, setShowManage] = useState(false)
  const [showPlan, setShowPlan] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const [openModule, setOpenModule] = useState<EventModuleKey | 'compras' | null>(initialModule)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Un evento con la fecha confirmada que todavía no está en el Calendario (p. ej. uno
  // confirmado antes de que esto fuera automático) se apunta al abrirlo.
  useEffect(() => {
    if (event.status === 'planificacion' && event.dateStatus === 'confirmada' && event.eventDate && !event.calendarEventId) {
      syncEventToCalendar(event.id)
        .then((result) => {
          if (result) onChanged()
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, event.dateStatus, event.eventDate])

  // Igual con el recordatorio del plazo de RSVP: un evento con plazo y sin recordatorio
  // (puesto antes de que esto fuera automático) lo recibe al abrirlo.
  useEffect(() => {
    if (event.status === 'planificacion' && event.rsvpDeadline && !event.rsvpDeadlineCalendarEventId) {
      syncRsvpDeadlineReminder(event.id)
        .then((result) => {
          if (result) onChanged()
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, event.rsvpDeadline])

  function reloadTasks() {
    listEventTasks(event.id)
      .then(setTasks)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las tareas')))
  }
  useEffect(reloadTasks, [event.id])

  const pendingTasks = tasks.filter((t) => !t.done)
  const visibleTasks = showAllTasks ? pendingTasks : pendingTasks.slice(0, 5)
  const hasTasksModule = event.enabledModules.includes('tareas')

  async function handleAddTask(ev: FormEvent) {
    ev.preventDefault()
    if (!newTaskTitle.trim()) return
    try {
      await addEventTask(event.id, newTaskTitle)
      setNewTaskTitle('')
      reloadTasks()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la tarea'))
    }
  }

  // ---------------------------------------------------------------
  // Datos "de un vistazo" para el dashboard — una carga ligera propia,
  // aparte de la que hace cada sección al abrirse (mismo patrón que ya
  // usan PepaConclusions/BudgetSection/EndSummaryModal, cada una con
  // su propio fetch independiente en vez de compartir un estado
  // central). Cada lista solo se pide si el módulo correspondiente
  // está activado en ESTE evento.
  // ---------------------------------------------------------------
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [budgetItems, setBudgetItems] = useState<EventBudgetItem[]>([])
  const [budgetSpent, setBudgetSpent] = useState<number | null>(null)
  const [menuItems, setMenuItems] = useState<EventMenuItem[]>([])
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([])
  const [decorationItems, setDecorationItems] = useState<EventDecorationItem[]>([])
  const [activities, setActivities] = useState<EventActivity[]>([])
  const [tables, setTables] = useState<EventTableSeat[]>([])
  const [providers, setProviders] = useState<EventProvider[]>([])
  const [payments, setPayments] = useState<EventPayment[]>([])
  const [favorItems, setFavorItems] = useState<EventFavorItem[]>([])
  const [specialDetails, setSpecialDetails] = useState<EventSpecialDetail[]>([])
  const [gifts, setGifts] = useState<EventGiftReceived[]>([])
  const [dayPlan, setDayPlan] = useState<EventDayPlanItem[]>([])
  // Fase 6 — responsable de una tarea: miembros reales de la familia,
  // para el desplegable "Sin asignar" / miembro — nunca inferido.
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([])
  useEffect(() => {
    listFamilyMembers().then(setFamilyMembers).catch(() => {})
  }, [])

  function reloadDashboardStats() {
    const has = (k: EventModuleKey) => event.enabledModules.includes(k)
    if (has('invitados')) listEventGuests(event.id).then(setGuests).catch(() => {})
    if (has('presupuesto')) {
      listEventBudgetItems(event.id).then(setBudgetItems).catch(() => {})
      if (event.tagId) {
        // FASE 6D.3 — auditoría: este `!e.isIncome && !isInternalTransferCategory(...)` (y sus 3 réplicas en este archivo) es el
        // LADO DEL GASTO de un evento (cuánto se ha gastado con su etiqueta), no "ingreso real": una devolución (is_income=true)
        // ya queda fuera por `!e.isIncome`, sin necesidad de isRealIncome. No es el mismo caso que FinanceScreen.tsx — no se toca.
        Promise.all([listExpenses(), listBudgetCategories()])
          .then(([expenses, categories]) =>
            setBudgetSpent(
              expenses
                .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
                .reduce((sum, e) => sum + e.amount, 0),
            ),
          )
          .catch(() => setBudgetSpent(null))
      }
    }
    if (has('menu_compra')) {
      listEventMenuItems(event.id).then(setMenuItems).catch(() => {})
      listShoppingItems()
        .then((items) => setShoppingItems(items.filter((i) => i.eventId === event.id)))
        .catch(() => {})
    }
    if (has('decoracion')) listEventDecorationItems(event.id).then(setDecorationItems).catch(() => {})
    if (has('actividades')) listEventActivities(event.id).then(setActivities).catch(() => {})
    if (has('mesas')) listEventTables(event.id).then(setTables).catch(() => {})
    if (has('proveedores')) listEventProviders(event.id).then(setProviders).catch(() => {})
    if (has('pagos')) listEventPayments(event.id).then(setPayments).catch(() => {})
    if (has('detalles')) {
      listEventFavorItems(event.id).then(setFavorItems).catch(() => {})
      listEventSpecialDetails(event.id).then(setSpecialDetails).catch(() => {})
    }
    if (has('regalos')) listEventGifts(event.id).then(setGifts).catch(() => {})
    if (has('plan_dia')) listEventDayPlan(event.id).then(setDayPlan).catch(() => {})
  }
  useEffect(reloadDashboardStats, [event.id, event.enabledModules, event.tagId, refreshKey])

  // Fase 2 — "Estado del evento": sustituye el porcentaje agregado de
  // "Preparación del evento" (auditoría: 0/6 tareas + 16/16 invitados
  // daba "50 %", escondiendo justo las tareas atrasadas detrás de un
  // número tranquilizador) por indicadores independientes y
  // verificables, vía computeEventStatusSummary — sin fórmula nueva
  // que combine cosas sin relación entre sí.
  const hasGuestsModule = event.enabledModules.includes('invitados')
  const hasBudgetModule = event.enabledModules.includes('presupuesto')
  const hasPaymentsModule = event.enabledModules.includes('pagos')
  const hasMenuModule = event.enabledModules.includes('menu_compra')
  const taskDoneCount = tasks.filter((t) => t.done).length
  const budgetPlanned = budgetItems.reduce((sum, i) => sum + i.plannedAmount, 0)
  const statusSummary = computeEventStatusSummary({ tasks, guests, payments, plannedBudget: budgetPlanned, spentBudget: budgetSpent })

  // Fase 7 — barra dinámica: "corresponde" evaluar ubicación exacta
  // solo si el evento ya tiene algún lugar en texto — uno que todavía
  // no ha decidido dónde será no se penaliza por algo que ni existe.
  const eventLocations = DUAL_LOCATION_EVENT_TYPES.includes(event.type)
    ? [
        { label: event.ceremonyLocationLabel, hasCoords: event.ceremonyLocationLatitude != null },
        { label: event.celebrationLocationLabel, hasCoords: event.celebrationLocationLatitude != null },
      ]
    : [{ label: event.venueLabel, hasCoords: event.venueLatitude != null }]
  const setLocations = eventLocations.filter((l) => l.label)
  const paymentAlerts = countPaymentAlerts(payments)
  const eventHealth = computeEventHealth({
    hasTasksModule,
    tasksTotal: statusSummary.tasksTotal,
    tasksDone: statusSummary.tasksDone,
    tasksOverdue: statusSummary.tasksOverdue,
    hasGuestsModule,
    guestsTotalPeople: statusSummary.guestsTotalPeople,
    guestsConfirmedPeople: statusSummary.guestsConfirmedPeople,
    guestsPendingCount: statusSummary.guestsPendingCount,
    hasBudgetModule,
    budgetPlanned: statusSummary.budgetPlanned,
    budgetSpent: statusSummary.budgetSpent,
    hasPaymentsModule,
    paymentsOverdueCount: paymentAlerts.overdue,
    paymentsDueSoonCount: paymentAlerts.dueSoon,
    locationApplicable: setLocations.length > 0,
    hasExactLocation: setLocations.length > 0 && setLocations.every((l) => l.hasCoords),
    hasMenuModule,
    menuItemsTotal: menuItems.length,
    menuItemsTransferred: menuItems.filter((i) => i.transferred).length,
    nextMilestone: statusSummary.nextMilestone,
  })

  // "Pepa te recomienda" — hasta 3 tareas pendientes, vencidas primero
  // y luego las más próximas (rankUpcomingTasks, domain/events.ts).
  const upcomingTasks = rankUpcomingTasks(tasks).slice(0, 3)

  // Cuenta atrás — solo si hay fecha puesta (un evento "pendiente" sin
  // fecha no tiene nada que contar).
  const daysToEvent = event.eventDate ? daysUntil(event.eventDate) : null

  // Rejilla de tarjetas: una por módulo activado con sección propia —
  // "invitaciones" no tiene sección aparte (el botón 💌 de cada
  // invitado, dentro de Invitados, ya la cubre entera). "Ceremonia" ya
  // no es una tarjeta de la rejilla (Fase 1 — reforma Editar/•••): sus
  // campos viven en "Información del evento" dentro de "Gestionar
  // evento", para no duplicar una tercera superficie de edición
  // estructural (auditoría, hallazgo E). "Compras" es una clave propia
  // (no un EventModuleKey real) ligada al mismo módulo que "Menú y
  // compra": las dos aparecen o desaparecen juntas.
  interface ModuleCardDef {
    key: EventModuleKey | 'compras'
    icon: string
    label: string
    stat: string
  }
  const moduleCards: ModuleCardDef[] = []
  for (const mod of EVENT_MODULES) {
    if (!event.enabledModules.includes(mod.key)) continue
    if (mod.key === 'invitaciones') continue
    if (mod.key === 'ceremonia') continue
    let stat = ''
    switch (mod.key) {
      case 'tareas':
        stat = tasks.length > 0 ? `${taskDoneCount} de ${tasks.length} completadas` : 'Sin tareas'
        break
      case 'invitados':
        stat = guests.length > 0 ? `${statusSummary.guestsTotalPeople} personas · ${statusSummary.guestsConfirmedPeople} confirmadas` : 'Sin invitados'
        break
      case 'presupuesto':
        stat = budgetSpent !== null ? `${budgetSpent.toFixed(2)} € de ${budgetPlanned.toFixed(2)} €` : `Planeado: ${budgetPlanned.toFixed(2)} €`
        break
      case 'menu_compra': {
        const pending = menuItems.filter((i) => !i.transferred).length
        stat = menuItems.length === 0 ? 'Sin elementos' : pending > 0 ? `${pending} sin traspasar` : 'Todo traspasado'
        break
      }
      case 'decoracion': {
        const comprados = decorationItems.filter((i) => i.status === 'comprado').length
        stat = decorationItems.length === 0 ? 'Sin ideas' : `${decorationItems.length} ideas · ${comprados} compradas`
        break
      }
      case 'actividades':
        stat = activities.length > 0 ? `${activities.length} preparadas` : 'Sin actividades'
        break
      case 'mesas':
        stat = tables.length > 0 ? `${tables.length} mesas` : 'Sin mesas'
        break
      case 'proveedores':
        stat = providers.length > 0 ? `${providers.length} proveedores` : 'Sin proveedores'
        break
      case 'pagos': {
        const pending = payments.filter((p) => p.status !== 'pagado').length
        stat = payments.length === 0 ? 'Sin pagos' : pending > 0 ? `${pending} pendientes` : 'Todo pagado'
        break
      }
      case 'detalles': {
        const count = favorItems.length + specialDetails.length
        stat = count > 0 ? `${count} detalles` : 'Sin detalles'
        break
      }
      case 'regalos':
        stat = gifts.length > 0 ? `${gifts.length} registrados` : 'Sin regalos'
        break
      case 'plan_dia':
        stat = dayPlan.length > 0 ? `${dayPlan.length} momentos planeados` : 'Sin preparar'
        break
    }
    moduleCards.push({ key: mod.key, icon: mod.icon, label: mod.label, stat })
    if (mod.key === 'menu_compra') {
      const pendingShopping = shoppingItems.filter((i) => i.status === 'pendiente').length
      moduleCards.push({
        key: 'compras',
        icon: '🛍️',
        label: 'Compras',
        stat: shoppingItems.length === 0 ? 'Nada pendiente' : pendingShopping > 0 ? `${pendingShopping} pendientes` : 'Todo comprado',
      })
    }
  }
  const cardColors = pastelPalette(moduleCards.length)

  function renderOpenModule() {
    switch (openModule) {
      case 'tareas': {
        const editingTask = tasks.find((t) => t.id === editingTaskId) ?? null
        return (
          <div className="card event-card">
            <strong>{EVENT_MODULES.find((m) => m.key === 'tareas')?.icon} Preparativos</strong>
            {pendingTasks.length === 0 && <p className="muted">No hay nada pendiente.</p>}
            <div className="event-list" style={{ marginTop: 8 }}>
              {visibleTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  responsible={familyMembers.find((m) => m.id === t.assignedMemberId) ?? null}
                  onToggleDone={() => updateEventTask(t.id, { done: true }).then(reloadTasks)}
                  onEdit={() => setEditingTaskId(t.id)}
                  onDelete={() => deleteEventTask(t.id).then(reloadTasks)}
                />
              ))}
            </div>
            {pendingTasks.length > 5 && (
              <button type="button" className="link-button" onClick={() => setShowAllTasks((v) => !v)}>
                {showAllTasks ? 'Ver menos' : `Ver todas (${pendingTasks.length})`}
              </button>
            )}
            <form onSubmit={handleAddTask} className="inline-fields" style={{ marginTop: 8 }}>
              <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="+ Añadir tarea" style={{ flex: 1 }} />
              <button type="submit">Añadir</button>
            </form>
            {editingTask && (
              <TaskEditModal
                task={editingTask}
                familyMembers={familyMembers}
                onClose={() => setEditingTaskId(null)}
                onSaved={() => {
                  setEditingTaskId(null)
                  reloadTasks()
                }}
              />
            )}
          </div>
        )
      }
      case 'invitados':
        return <GuestsSection key={`invitados-${refreshKey}`} event={event} />
      case 'mesas':
        return <TablesSection key={`mesas-${refreshKey}`} event={event} />
      case 'presupuesto':
        return <BudgetSection key={`presupuesto-${refreshKey}`} event={event} />
      case 'menu_compra':
        return <MenuSection key={`menu-${refreshKey}`} eventId={event.id} />
      case 'compras':
        return <EventShoppingSection items={shoppingItems} />
      case 'decoracion':
        return <DecorationSection key={`decoracion-${refreshKey}`} eventId={event.id} />
      case 'actividades':
        return <ActivitiesSection key={`actividades-${refreshKey}`} eventId={event.id} />
      case 'proveedores':
        return <ProvidersSection eventId={event.id} />
      case 'pagos':
        return <PaymentsSection event={event} />
      case 'detalles':
        return <DetailsSection eventId={event.id} />
      case 'regalos':
        return <GiftsSection eventId={event.id} />
      case 'plan_dia':
        return <DayPlanSection eventId={event.id} />
      default:
        return null
    }
  }

  if (openModule !== null) {
    return (
      <div>
        <button type="button" className="link-button" onClick={() => setOpenModule(null)}>
          ‹ {EVENT_TYPE_META[event.type].icon} {event.title}
        </button>
        {error && <p className="error">{error}</p>}
        <div style={{ marginTop: 8 }}>{renderOpenModule()}</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="link-button" onClick={onBack}>
          ← Todos los eventos
        </button>
        <div className="filter-row" style={{ gap: 4 }}>
          <button type="button" className="link-button" onClick={() => setShowManage(true)}>
            ⚙️ Gestionar evento
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="card event-card event-hero-card" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Petición real: dos filas —el tipo y debajo el nombre— con el
                emoji más grande repartido entre las dos, para todos los eventos. */}
            <div className="event-hero-title">
              <span className="event-hero-emoji">{EVENT_TYPE_META[event.type].icon}</span>
              <div style={{ minWidth: 0 }}>
                <FitText as="strong" maxSize={18}>
                  {EVENT_TYPE_META[event.type].label}
                </FitText>
                {eventNameWithoutType(event) && (
                  <FitText as="strong" maxSize={18}>
                    {eventNameWithoutType(event)}
                  </FitText>
                )}
              </div>
            </div>
            {/* Petición real: fecha corta ("Domingo, 18/10/2026") en una sola
                línea, con el estado (✔️ confirmada / ❓ provisional) DETRÁS de
                la fecha —es un botón que abre la edición— y el lugar del
                mismo tamaño que la fecha, para que la cuenta atrás pueda
                ser más grande. */}
            <FitText as="p" maxSize={14} className="muted event-hero-line" style={{ margin: '6px 0 0' }}>
              📅 {eventShortDateLabel(event)}
              {event.eventDate && (
                <button
                  type="button"
                  className="event-status-badge"
                  onClick={() => setShowManage(true)}
                  title={event.dateStatus === 'confirmada' ? 'Fecha confirmada — tocar para editar' : 'Fecha provisional — tocar para editar'}
                  aria-label={event.dateStatus === 'confirmada' ? 'Fecha confirmada' : 'Fecha provisional'}
                >
                  {event.dateStatus === 'confirmada' ? '✔️' : '❓'}
                </button>
              )}
            </FitText>
            {event.venueLabel && (
              <FitText as="p" maxSize={14} className="muted event-hero-line" style={{ margin: '2px 0 0' }}>
                🏠 {event.venueLabel}
              </FitText>
            )}
            <FitText as="p" maxSize={14} className="muted event-hero-line" style={{ margin: '2px 0 0' }}>
              🎨 Tema: {event.theme || 'no'}
            </FitText>
            {event.status === 'archivado' && <p className="muted">📦 Archivado</p>}
          </div>
          {/* Petición real: cuenta atrás "30 días para celebrarlo" junto
              al título, en un círculo pastel — solo tiene sentido con
              fecha puesta y evento todavía en marcha. */}
          {event.status === 'planificacion' && daysToEvent !== null && (
            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 104 }}>
              <div className={`event-countdown event-countdown-${countdownTone(daysToEvent)}`}>
                {daysToEvent > 0 ? (
                  <strong className="event-countdown-number">{daysToEvent}</strong>
                ) : daysToEvent === 0 ? (
                  <strong className="event-countdown-number" style={{ fontSize: 22 }}>¡Hoy!</strong>
                ) : (
                  <span style={{ fontSize: 11 }}>Ya pasó</span>
                )}
              </div>
              {daysToEvent >= 0 && (
                <span className="muted" style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.2 }}>
                  {daysToEvent === 0 ? '¡Celebrarlo hoy! 🎉' : 'días para celebrarlo 🎉'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {event.status === 'planificacion' && event.dateStatus === 'confirmada' && isToday(event.eventDate) && <EventDayBanner event={event} />}
      {event.status === 'planificacion' && <PepaConclusions event={event} />}

      {/* Fase 2 — "Estado del evento": auditoría real encontró que
          "Preparación del evento" (media de %tareas y %invitados) podía
          enseñar "50 %" con 0 de 6 tareas hechas y 2 ya vencidas, solo
          porque los invitados estaban confirmados — un número que
          escondía justo el problema en vez de mostrarlo. Se sustituye
          por indicadores independientes y verificables, sin inventar
          otra fórmula agregada; lo urgente (atrasadas) tiene su propia
          prioridad visual en vez de diluirse en una media. */}
      {(hasTasksModule && statusSummary.tasksTotal > 0) ||
      (hasGuestsModule && statusSummary.guestsTotalPeople > 0) ||
      (hasBudgetModule && statusSummary.budgetSpent !== null) ? (
        <div className="card event-card" style={{ marginTop: 8 }}>
          <strong>Estado del evento</strong>
          {/* Fase 7 — barra dinámica: el color (level) nunca depende solo
              de la media interna (progress) — una incidencia real
              (tarea/pago atrasado, presupuesto superado) fija el color
              directamente. El número de "progress" no se enseña nunca,
              solo se usa para el ancho de la barra. */}
          <div className={`event-health-bar event-health-${eventHealth.level}`} style={{ marginTop: 8 }}>
            <div className="event-health-bar-fill" style={{ width: `${eventHealth.progress}%` }} />
          </div>
          <p style={{ margin: '6px 0 0', fontWeight: 600 }}>
            {EVENT_HEALTH_EMOJI[eventHealth.level]} {eventHealth.label} · {eventHealth.message}
          </p>
          <div className="event-readiness-stats" style={{ marginTop: 10 }}>
            {hasTasksModule && statusSummary.tasksTotal > 0 && (
              <div>
                <strong>
                  {statusSummary.tasksDone} de {statusSummary.tasksTotal}
                </strong>
                <span className="muted"> tareas completadas</span>
                {statusSummary.tasksOverdue > 0 && (
                  <div style={{ color: '#dc2626', fontWeight: 600, marginTop: 2 }}>
                    🔴 {statusSummary.tasksOverdue} {statusSummary.tasksOverdue === 1 ? 'atrasada' : 'atrasadas'}
                  </div>
                )}
              </div>
            )}
            {hasGuestsModule && statusSummary.guestsTotalPeople > 0 && (
              <div>
                <strong>
                  {statusSummary.guestsConfirmedPeople} de {statusSummary.guestsTotalPeople}
                </strong>
                <span className="muted"> invitados confirmados</span>
                {statusSummary.guestsPendingCount > 0 && (
                  <div className="muted" style={{ marginTop: 2 }}>
                    {statusSummary.guestsPendingCount} {statusSummary.guestsPendingCount === 1 ? 'pendiente de responder' : 'pendientes de responder'}
                  </div>
                )}
              </div>
            )}
            {hasBudgetModule && statusSummary.budgetSpent !== null && (
              <div>
                <strong>{statusSummary.budgetSpent.toFixed(2)} €</strong>
                <span className="muted"> de {statusSummary.budgetPlanned.toFixed(2)} €</span>
              </div>
            )}
          </div>
          {statusSummary.nextMilestone && (
            <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
              Próximo hito: {statusSummary.nextMilestone.kind === 'tarea' ? '✅' : '🧾'} {statusSummary.nextMilestone.label} —{' '}
              {statusSummary.nextMilestone.daysUntil === 0 ? 'hoy' : statusSummary.nextMilestone.daysUntil === 1 ? 'mañana' : `en ${statusSummary.nextMilestone.daysUntil} días`}
            </p>
          )}
        </div>
      ) : null}

      {hasTasksModule && upcomingTasks.length > 0 && (
        <div className="card event-card event-recommend-card" style={{ marginTop: 8 }}>
          <strong>💡 Pepa te recomienda</strong>
          <p className="muted" style={{ margin: '2px 0 8px', fontSize: 13 }}>
            Estas son las próximas tareas importantes:
          </p>
          <div className="event-list">
            {upcomingTasks.map(({ task, priority, daysUntil: d }) => {
              const responsible = familyMembers.find((m) => m.id === task.assignedMemberId)
              return (
                <div key={task.id} className="inline-fields" style={{ alignItems: 'center' }}>
                  <span className={`event-priority-dot event-priority-${priority}`} aria-hidden="true" />
                  <input type="checkbox" checked={task.done} onChange={() => updateEventTask(task.id, { done: true }).then(reloadTasks)} />
                  <span style={{ flex: 1 }}>
                    {task.title}
                    {responsible && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {' '}
                        · Responsable: {responsible.name}
                      </span>
                    )}
                  </span>
                  {task.dueDate && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {d !== null && d < 0 ? `Venció el ${formatSpanishDate(task.dueDate)}` : `Vence el ${formatSpanishDate(task.dueDate)}`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <button type="button" className="link-button" onClick={() => setOpenModule('tareas')}>
            Ver todas →
          </button>
        </div>
      )}

      <div className="card-grid" style={{ marginTop: 8 }}>
        {moduleCards.map((card, i) => (
          <button
            key={card.key}
            type="button"
            className="card event-module-card home-card"
            style={{ background: cardColors[i] }}
            onClick={() => setOpenModule(card.key)}
          >
            <div>
              <h2>{card.label}</h2>
              <p className="muted">{card.stat}</p>
            </div>
            <span className="home-card-icon">{card.icon}</span>
          </button>
        ))}
      </div>

      {event.status === 'planificacion' && (
        <div className="card event-card" style={{ marginTop: 8 }}>
          <button type="button" className="link-button" onClick={() => setShowPlan(true)}>
            🪄 Organízamelo Pepa
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Propuesta de presupuesto, menú, decoración y actividades típicas de este tipo de evento — revisas y eliges qué aplicar, no se escribe nada solo.
          </p>
        </div>
      )}

      {showManage && (
        <ManageEventModal
          event={event}
          onClose={() => setShowManage(false)}
          onChanged={onChanged}
          onSaveTemplate={() => {
            setShowManage(false)
            setShowSaveTemplate(true)
          }}
          onArchive={() => {
            setShowManage(false)
            setShowEndSummary(true)
          }}
          onReactivate={() => {
            setShowManage(false)
            unarchiveEvent(event.id).then(onChanged)
          }}
          onDuplicate={() => {
            setShowManage(false)
            duplicateEvent(event.id).then(onDuplicated)
          }}
          onDelete={() => deleteEvent(event.id).then(onArchivedOrDeleted)}
        />
      )}
      {showPlan && (
        <OrganizamePepaModal
          event={event}
          onClose={() => setShowPlan(false)}
          onApplied={() => {
            setShowPlan(false)
            setRefreshKey((k) => k + 1)
            onChanged()
          }}
        />
      )}
      {showSaveTemplate && <SaveTemplateModal event={event} onClose={() => setShowSaveTemplate(false)} onSaved={() => setShowSaveTemplate(false)} />}
      {showEndSummary && (
        <EndSummaryModal
          event={event}
          onClose={() => setShowEndSummary(false)}
          onConfirmed={() => {
            setShowEndSummary(false)
            archiveEvent(event.id).then(onArchivedOrDeleted)
          }}
        />
      )}
    </div>
  )
}

// Fase 1 — reforma de Editar/•••: auditoría real ("no queda claro qué
// se administra desde cada uno") encontró que "Editar" y "•••" son en
// realidad la misma clase de acción (configurar el evento) repartida
// sin ningún criterio visible al usuario, y que además "Ceremonia"
// (para Comunión/Bautizo/Boda) era una TERCERA superficie de edición
// estructural, aparte de las otras dos. Un único punto de entrada
// ("Gestionar evento"), con tres grupos claramente separados:
// Información (qué es el evento) / Secciones (qué módulos tiene
// activos — única fuente de verdad de enabledModules, ver
// addEnabledModules en data/events.ts, reutilizada también por
// "Organízamelo Pepa") / Acciones (duplicar, archivar, borrar — las
// destructivas al final, separadas visualmente). No se duplica ningún
// dato de Ceremonia: reutiliza tal cual CeremoniaSection (mismas
// columnas, mismo guardado), solo cambia DÓNDE se muestra.
function ManageEventModal({
  event,
  onClose,
  onChanged,
  onSaveTemplate,
  onArchive,
  onReactivate,
  onDuplicate,
  onDelete,
}: {
  event: FamilyEvent
  onClose: () => void
  onChanged: () => void
  onSaveTemplate: () => void
  onArchive: () => void
  onReactivate: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(event.title)
  const [dateStatus, setDateStatus] = useState(event.dateStatus)
  const [eventDate, setEventDate] = useState(event.eventDate ?? '')
  const [venueLabel, setVenueLabel] = useState(event.venueLabel ?? '')
  const [venueCoords, setVenueCoords] = useState(
    event.venueLatitude != null && event.venueLongitude != null ? { latitude: event.venueLatitude, longitude: event.venueLongitude } : null,
  )
  const [theme, setTheme] = useState(event.theme ?? '')
  const [rsvpDeadline, setRsvpDeadline] = useState(event.rsvpDeadline ?? '')
  const [savingInfo, setSavingInfo] = useState(false)
  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoSaved, setInfoSaved] = useState(false)

  const [modules, setModules] = useState<EventModuleKey[]>(event.enabledModules)
  const [savingModules, setSavingModules] = useState(false)
  const [modulesError, setModulesError] = useState<string | null>(null)
  const [modulesSaved, setModulesSaved] = useState(false)

  async function handleSaveInfo(ev: FormEvent) {
    ev.preventDefault()
    setSavingInfo(true)
    setInfoError(null)
    setInfoSaved(false)
    try {
      const nextDate = dateStatus === 'pendiente' ? null : eventDate || null
      await updateEvent(event.id, {
        title,
        dateStatus,
        eventDate: nextDate,
        venueLabel: venueLabel || null,
        venueLatitude: venueCoords?.latitude ?? null,
        venueLongitude: venueCoords?.longitude ?? null,
        theme: theme || null,
        rsvpDeadline: rsvpDeadline || null,
      })
      // Petición de la Skill: "relative tasks update when event date
      // changes" — solo se recalcula si la fecha de verdad ha cambiado.
      if (nextDate !== event.eventDate) await recalculateAutoTasks(event.id, event.type, nextDate)
      onChanged()
      setInfoSaved(true)
    } catch (err) {
      setInfoError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingInfo(false)
    }
  }

  async function handleSaveModules() {
    setSavingModules(true)
    setModulesError(null)
    setModulesSaved(false)
    try {
      await updateEvent(event.id, { enabledModules: modules })
      onChanged()
      setModulesSaved(true)
    } catch (err) {
      setModulesError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSavingModules(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Gestionar evento
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <strong style={{ fontSize: 13, display: 'block', marginTop: 4 }}>Información del evento</strong>
        <form className="card member-form" onSubmit={handleSaveInfo} style={{ marginTop: 4 }}>
          {infoError && <p className="error">{infoError}</p>}
          <label>
            Nombre
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            Fecha
            <select value={dateStatus} onChange={(e) => setDateStatus(e.target.value as FamilyEvent['dateStatus'])}>
              {DATE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {dateStatus !== 'pendiente' && (
            <label>
              {dateStatus === 'provisional' ? 'Fecha provisional' : 'Fecha'}
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </label>
          )}
          <label>
            Lugar (como se ve en la invitación)
            <input type="text" value={venueLabel} onChange={(e) => setVenueLabel(e.target.value)} placeholder="Ej. en mi casa, Restaurante La Terraza…" />
          </label>
          <EventLocationCoordsPicker coords={venueCoords} onCoordsChange={setVenueCoords} />
          <label>
            Tema
            <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </label>
          <label>
            Plazo de RSVP (opcional)
            <input type="date" value={rsvpDeadline} onChange={(e) => setRsvpDeadline(e.target.value)} />
          </label>
          <button type="submit" disabled={savingInfo}>
            {savingInfo ? 'Guardando…' : infoSaved ? '✓ Guardado' : 'Guardar información'}
          </button>
        </form>

        {DUAL_LOCATION_EVENT_TYPES.includes(event.type) && event.enabledModules.includes('ceremonia') && (
          <CeremoniaSection event={event} onChanged={onChanged} />
        )}

        <strong style={{ fontSize: 13, display: 'block', marginTop: 16 }}>Secciones del evento</strong>
        <p className="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>
          Los módulos que quites se ocultan, pero no se borra nada — puedes reactivarlos cuando quieras.
        </p>
        {modulesError && <p className="error">{modulesError}</p>}
        <ModulePickerChips modules={modules} onChange={setModules} />
        <button
          type="button"
          className="link-button"
          onClick={handleSaveModules}
          disabled={savingModules}
          style={{ marginTop: 8 }}
        >
          {savingModules ? 'Guardando…' : modulesSaved ? '✓ Guardado' : 'Guardar secciones'}
        </button>

        <strong style={{ fontSize: 13, display: 'block', marginTop: 16 }}>Acciones del evento</strong>
        <div className="event-list" style={{ marginTop: 4 }}>
          <button type="button" className="link-button" onClick={onSaveTemplate} style={{ display: 'block' }}>
            💾 Guardar como plantilla
          </button>
          <button type="button" className="link-button" onClick={onDuplicate} style={{ display: 'block' }}>
            📋 Duplicar
          </button>
        </div>

        {/* Destructivas/de ciclo de vida, separadas visualmente al final
            (auditoría, hallazgo E: "estructural" vs "operativo" mezclados
            dentro del mismo menú era parte de la confusión). */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
          {event.status === 'planificacion' ? (
            <button type="button" className="link-button" onClick={onArchive} style={{ display: 'block' }}>
              📦 Finalizar y archivar
            </button>
          ) : (
            <button type="button" className="link-button" onClick={onReactivate} style={{ display: 'block' }}>
              Reactivar
            </button>
          )}
          <div style={{ marginTop: 4 }}>
            <ConfirmButton label="Borrar evento" confirmLabel="Borrar" className="link-button" onConfirm={onDelete} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Petición real: "Compras" en la rejilla del dashboard — mini-vista de
// solo lectura con los pendientes de ESTE evento (shopping_items.
// event_id, hasta ahora escrito pero nunca leído de vuelta, ver
// listShoppingItems). La gestión de verdad (marcar comprado, añadir,
// borrar) se sigue haciendo en Compras — aquí solo se ve qué falta y
// se enlaza allí.
// Fase 8 — rediseño de Preparativos: ficha compacta táctil en vez de
// una fila de tabla (checkbox+texto+fecha+responsable+✕ compitiendo
// por el mismo espacio horizontal, con la fecha en ISO crudo). Título
// protagonista, fecha/responsable como línea secundaria, acciones
// (editar/borrar) detrás de "⋯" — nunca un select permanente ni la ✕
// siempre visible.
function TaskCard({
  task,
  responsible,
  onToggleDone,
  onEdit,
  onDelete,
}: {
  task: EventTask
  responsible: FamilyMember | null
  onToggleDone: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const overdue = isOverdueTask(task)
  return (
    <div className="card event-task-card">
      <input type="checkbox" checked={task.done} onChange={onToggleDone} aria-label={`Marcar "${task.title}" como hecha`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{task.title}</div>
        {(task.dueDate || responsible) && (
          <div className="muted event-task-card-meta">
            {task.dueDate && (
              <span style={overdue ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                📅 {formatSpanishDate(task.dueDate)}
                {overdue ? ' · 🔴 Atrasada' : ''}
              </span>
            )}
            {responsible && <span>👤 {responsible.name}</span>}
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <button type="button" className="icon-button" aria-label={`Más opciones de "${task.title}"`} onClick={() => setShowMenu((v) => !v)}>
          ⋯
        </button>
        {showMenu && (
          <>
            {/* Capa invisible para cerrar el menú al tocar fuera, mismo patrón que modal-overlay. */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 1 }} onClick={() => setShowMenu(false)} />
            <div className="event-task-menu">
              <button
                type="button"
                className="link-button"
                style={{ display: 'block', width: '100%', textAlign: 'left' }}
                onClick={() => {
                  setShowMenu(false)
                  onEdit()
                }}
              >
                ✏️ Editar
              </button>
              <ConfirmButton label="🗑️ Borrar" confirmLabel="Borrar" className="link-button" onConfirm={onDelete} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TaskEditModal({
  task,
  familyMembers,
  onClose,
  onSaved,
}: {
  task: EventTask
  familyMembers: FamilyMember[]
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [dueDate, setDueDate] = useState(task.dueDate ?? '')
  const [assignedMemberId, setAssignedMemberId] = useState(task.assignedMemberId ?? '')
  // Fase 9 — la propia presencia de calendarEventId es el estado
  // inicial del interruptor; no hay una columna booleana aparte.
  const [showInCalendar, setShowInCalendar] = useState(task.calendarEventId != null)
  // Fase 10 — recordatorio de la tarea: como mucho uno (no una lista),
  // igual que el plazo de RSVP (DEFAULT_DEADLINE_REMINDERS). Solo tiene
  // sentido si la tarea está enlazada al Calendario.
  const [reminderChoice, setReminderChoice] = useState<'none' | 'same_day' | '1_day' | '1_week' | 'custom'>('none')
  const [customAmount, setCustomAmount] = useState('1')
  const [customUnit, setCustomUnit] = useState<ReminderUnit>('dias')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!task.calendarEventId) return
    listEventReminders(task.calendarEventId)
      .then((reminders) => {
        const r = reminders[0]
        if (!r) setReminderChoice('none')
        else if (r.minutesBefore === 0) setReminderChoice('same_day')
        else if (r.minutesBefore === 1440) setReminderChoice('1_day')
        else if (r.minutesBefore === 10080) setReminderChoice('1_week')
        else setReminderChoice('custom')
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function remindersForChoice(): EventReminder[] {
    switch (reminderChoice) {
      case 'none':
        return []
      case 'same_day':
        return [{ minutesBefore: 0, anchor: 'start' }]
      case '1_day':
        return [{ minutesBefore: 1440, anchor: 'start' }]
      case '1_week':
        return [{ minutesBefore: 10080, anchor: 'start' }]
      case 'custom':
        return [{ minutesBefore: reminderMinutesFrom(Number(customAmount) || 1, customUnit), anchor: 'start' }]
    }
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!title.trim()) {
      setError('Ponle un título.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateEventTask(task.id, { title, dueDate: dueDate || null, assignedMemberId: assignedMemberId || null })
      const wasLinked = task.calendarEventId != null
      let linkedId: string | null = task.calendarEventId
      if (showInCalendar && !wasLinked && dueDate) linkedId = await linkEventTaskToCalendar(task.id)
      else if (!showInCalendar && wasLinked) {
        await unlinkEventTaskFromCalendar(task.id)
        linkedId = null
      }
      if (linkedId) await replaceReminders(linkedId, remindersForChoice())
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Editar tarea
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Título
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <label>
            Fecha
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value)
                if (!e.target.value) setShowInCalendar(false)
              }}
            />
          </label>
          <label>
            Responsable
            {/* Fase 6 — nunca inferido: "Sin asignar" sigue siéndolo salvo que alguien elija a mano. */}
            <select value={assignedMemberId} onChange={(e) => setAssignedMemberId(e.target.value)}>
              <option value="">Sin asignar</option>
              {familyMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-fields" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={showInCalendar} disabled={!dueDate} onChange={(e) => setShowInCalendar(e.target.checked)} />
            <span>📅 Mostrar en Calendario</span>
          </label>
          {!dueDate && (
            <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
              Ponle una fecha para poder mostrarla en el Calendario.
            </p>
          )}
          {showInCalendar && (
            <label>
              Recordatorio
              <select value={reminderChoice} onChange={(e) => setReminderChoice(e.target.value as typeof reminderChoice)}>
                <option value="none">🔔 Sin aviso</option>
                <option value="same_day">🔔 El mismo día</option>
                <option value="1_day">🔔 1 día antes</option>
                <option value="1_week">🔔 1 semana antes</option>
                <option value="custom">🔔 Personalizado</option>
              </select>
            </label>
          )}
          {showInCalendar && reminderChoice === 'custom' && (
            <div className="inline-fields">
              <input
                type="number"
                min={1}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                style={{ width: 70 }}
                aria-label="Cantidad del recordatorio personalizado"
              />
              <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as ReminderUnit)} aria-label="Unidad del recordatorio personalizado">
                {REMINDER_UNIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: 12 }}>
                antes
              </span>
            </div>
          )}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function EventShoppingSection({ items }: { items: ShoppingItem[] }) {
  const pending = items.filter((i) => i.status === 'pendiente')
  const bought = items.filter((i) => i.status === 'comprado')
  return (
    <div className="card event-card">
      <strong>🛍️ Compras</strong>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>
        Lo que se ha traspasado a la lista de la compra para este evento — márcalo como comprado o añade más desde
        Compras → Lista de la compra.
      </p>
      {items.length === 0 ? (
        <p className="muted">Todavía no hay nada traspasado a Compras.</p>
      ) : (
        <div className="price-row-list">
          {pending.map((i) => (
            <div key={i.id} className="price-row">
              <span className="price-row-name">{i.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                Pendiente
              </span>
            </div>
          ))}
          {bought.map((i) => (
            <div key={i.id} className="price-row">
              <span className="price-row-name" style={{ textDecoration: 'line-through' }}>
                {i.name}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                ✓
              </span>
            </div>
          ))}
        </div>
      )}
      <Link to="/compras" className="link-button" style={{ display: 'inline-block', marginTop: 8 }}>
        Ver todo en Compras →
      </Link>
    </div>
  )
}

// Petición real: "Y que va a buscar si pongo en mi casa?" — un enlace
// de mapa hecho con el texto de "Lugar" tal cual no sirve si ese texto
// es informal ("en mi casa"). "Creo que es menos trabajo eligiendo
// directamente la ubicación del sitio en el mapa, como en el
// calendario. Se puede poner Lugar para que aparezca en la invitación
// y Ubicación para enviar a todos" — mismo buscador que ya usa
// Calendario (Nominatim/OpenStreetMap, gratis), pero como campo aparte
// de "Lugar": elegir aquí una sugerencia solo guarda coordenadas, sin
// tocar el texto que se ve en la invitación.
function EventLocationCoordsPicker({
  coords,
  onCoordsChange,
}: {
  coords: { latitude: number; longitude: number } | null
  onCoordsChange: (c: { latitude: number; longitude: number } | null) => void
}) {
  const [showMap, setShowMap] = useState(false)
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)

  function handleConfirmMapLocation(result: { latitude: number; longitude: number; label: string | null }) {
    onCoordsChange({ latitude: result.latitude, longitude: result.longitude })
    setPickedLabel(result.label)
    setShowMap(false)
  }

  return (
    <div>
      <label>
        Ubicación (para el enlace del mapa que reciben los invitados)
        <div className="inline-fields">
          <button type="button" className="link-button" onClick={() => setShowMap(true)}>
            🔍 Buscar en el mapa
          </button>
        </div>
      </label>
      {showMap && (
        <LocationPickerModal
          initialCoords={coords}
          onConfirm={handleConfirmMapLocation}
          onClose={() => setShowMap(false)}
        />
      )}
      {coords && (
        <div className="filter-row" style={{ marginTop: 4, alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12 }}>✓ {pickedLabel ?? 'Ubicación real guardada'}</span>
          {/* Petición real: "esa ubicación se puede abrir también en
              Google Maps?" — para comprobar que el punto elegido es el
              correcto antes de guardar, no solo cuando lo reciben los
              invitados. */}
          <a href={buildMapsUrl(pickedLabel ?? '', coords)} target="_blank" rel="noopener noreferrer" className="link-button" style={{ textDecoration: 'none' }}>
            🔍 Ver en Google Maps
          </a>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onCoordsChange(null)
              setPickedLabel(null)
            }}
          >
            Quitar
          </button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        "Lugar" es lo que verán en la invitación (puede ser "en mi casa" o cualquier cosa); esta búsqueda es solo para que el enlace del mapa lleve a la dirección real.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------
// Ceremonia — solo Comunión/Bautizo/Boda (dos ubicaciones posibles).
// Reutilizada tal cual dentro de "Información del evento" en
// ManageEventModal (Fase 1) — no se duplica ningún dato ni lógica de
// guardado, solo cambia dónde se muestra.
// ---------------------------------------------------------------------

function CeremoniaSection({ event, onChanged }: { event: FamilyEvent; onChanged: () => void }) {
  const [ceremonyLocationLabel, setCeremonyLocationLabel] = useState(event.ceremonyLocationLabel ?? '')
  const [ceremonyCoords, setCeremonyCoords] = useState(
    event.ceremonyLocationLatitude != null && event.ceremonyLocationLongitude != null
      ? { latitude: event.ceremonyLocationLatitude, longitude: event.ceremonyLocationLongitude }
      : null,
  )
  const [ceremonyTime, setCeremonyTime] = useState(event.ceremonyTime ?? '')
  const [celebrationLocationLabel, setCelebrationLocationLabel] = useState(event.celebrationLocationLabel ?? '')
  const [celebrationCoords, setCelebrationCoords] = useState(
    event.celebrationLocationLatitude != null && event.celebrationLocationLongitude != null
      ? { latitude: event.celebrationLocationLatitude, longitude: event.celebrationLocationLongitude }
      : null,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateEvent(event.id, {
        ceremonyLocationLabel: ceremonyLocationLabel || null,
        ceremonyLocationLatitude: ceremonyCoords?.latitude ?? null,
        ceremonyLocationLongitude: ceremonyCoords?.longitude ?? null,
        ceremonyTime: ceremonyTime || null,
        celebrationLocationLabel: celebrationLocationLabel || null,
        celebrationLocationLatitude: celebrationCoords?.latitude ?? null,
        celebrationLocationLongitude: celebrationCoords?.longitude ?? null,
      })
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🕊️ Ceremonia</strong>
      <p className="muted" style={{ fontSize: 13 }}>
        Dos sitios posibles — al invitar a cada familia, eliges si va a los dos o solo a uno.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="card member-form">
        <label>
          Iglesia / lugar de la ceremonia (como se ve en la invitación)
          <input type="text" value={ceremonyLocationLabel} onChange={(e) => setCeremonyLocationLabel(e.target.value)} />
        </label>
        <EventLocationCoordsPicker coords={ceremonyCoords} onCoordsChange={setCeremonyCoords} />
        <label>
          Hora de la ceremonia
          <input type="time" value={ceremonyTime} onChange={(e) => setCeremonyTime(e.target.value)} />
        </label>
        <label>
          Lugar de la celebración (como se ve en la invitación)
          <input type="text" value={celebrationLocationLabel} onChange={(e) => setCelebrationLocationLabel(e.target.value)} />
        </label>
        <EventLocationCoordsPicker coords={celebrationCoords} onCoordsChange={setCelebrationCoords} />
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Invitados.
// ---------------------------------------------------------------------

const GUEST_FILTER_OPTIONS: { value: EventGuestRsvpStatus | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  ...RSVP_STATUS_OPTIONS,
]

function GuestsSection({ event }: { event: FamilyEvent }) {
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [invitationGuest, setInvitationGuest] = useState<EventGuest | null>(null)
  const [showDesigner, setShowDesigner] = useState(false)
  const [statusFilter, setStatusFilter] = useState<EventGuestRsvpStatus | 'todos'>('todos')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)
  const hasScope = DUAL_LOCATION_EVENT_TYPES.includes(event.type)

  function reload() {
    listEventGuests(event.id)
      .then(setGuests)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los invitados')))
  }
  useEffect(reload, [event.id])

  const totalPeople = guests.reduce((sum, g) => sum + g.adultsCount + g.childrenCount, 0)
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmado')
  const confirmedAdults = confirmed.reduce((sum, g) => sum + (g.rsvpAdultsCount ?? g.adultsCount), 0)
  const confirmedChildren = confirmed.reduce((sum, g) => sum + (g.rsvpChildrenCount ?? g.childrenCount), 0)
  const pending = guests.filter((g) => g.rsvpStatus === 'pendiente')
  const notAttending = guests.filter((g) => g.rsvpStatus === 'no_asiste').length
  const unsure = guests.filter((g) => g.rsvpStatus === 'no_seguro').length
  const visibleGuests = statusFilter === 'todos' ? guests : guests.filter((g) => g.rsvpStatus === statusFilter)

  async function handleRsvpStatusChange(guest: EventGuest, status: EventGuestRsvpStatus) {
    try {
      await updateEventGuest(guest.id, {
        rsvpStatus: status,
        rsvpAdultsCount: status === 'confirmado' ? (guest.rsvpAdultsCount ?? guest.adultsCount) : null,
        rsvpChildrenCount: status === 'confirmado' ? (guest.rsvpChildrenCount ?? guest.childrenCount) : null,
      })
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    }
  }

  // Petición de la Skill: "Provide Remind pending as a manual share
  // workflow. PEPA prepares text; user shares through native share
  // sheet" — un único aviso con los nombres, nunca se manda solo.
  async function handleRemindPending() {
    const text = `Recordatorio: todavía falta por confirmar ${pending.length === 1 ? 'la asistencia de' : 'la asistencia de'} ${pending
      .map((g) => g.displayName)
      .join(', ')} a "${event.title}". ¡Avisadnos cuando podáis! 🙏`
    try {
      const shown = await shareText({ title: event.title, text })
      setNotice(shown ? null : 'Copiado al portapapeles.')
    } catch {
      setManualShare({ title: event.title, text })
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>👥 Invitados</strong>
        <button type="button" className="link-button" onClick={() => setShowDesigner(true)}>
          🎨 Diseño de la invitación
        </button>
      </div>
      <p className="muted" style={{ margin: '4px 0' }}>
        {guests.length} {guests.length === 1 ? 'invitado/grupo' : 'invitados/grupos'} · {totalPeople} personas en total · {confirmedAdults + confirmedChildren}{' '}
        confirmadas ({confirmedAdults} adultos, {confirmedChildren} niños) · {pending.length} pendientes · {notAttending} no asisten · {unsure} no seguros
      </p>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <EventOpenLinkBlock event={event} />
      {pending.length > 0 && (
        <button type="button" className="link-button" onClick={handleRemindPending}>
          🔔 Recordar a pendientes ({pending.length})
        </button>
      )}
      {guests.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EventGuestRsvpStatus | 'todos')}>
            {GUEST_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="event-list" style={{ marginTop: 8 }}>
        {visibleGuests.map((g) => (
          <div key={g.id} className="card task-card">
            <div className="task-card-main" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{g.displayName}</strong>
                <div>
                  <button type="button" className="link-button" onClick={() => setInvitationGuest(g)}>
                    💌 Invitación
                  </button>
                  <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar invitado" onConfirm={() => deleteEventGuest(g.id).then(reload)} />
                </div>
              </div>
              <p className="muted" style={{ margin: '2px 0' }}>
                {g.adultsCount} adultos, {g.childrenCount} niños
                {g.notes ? ` · ${g.notes}` : ''}
              </p>
              <div className="filter-row" style={{ flexWrap: 'wrap' }}>
                <select value={g.rsvpStatus} onChange={(e) => handleRsvpStatusChange(g, e.target.value as EventGuestRsvpStatus)}>
                  {RSVP_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {hasScope && (
                  <select
                    value={g.inviteScope ?? 'ambas'}
                    onChange={(e) => updateEventGuest(g.id, { inviteScope: e.target.value as EventGuestInviteScope }).then(reload)}
                  >
                    {INVITE_SCOPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {g.rsvpStatus === 'confirmado' && (
                <div className="inline-fields" style={{ marginTop: 4 }}>
                  <label style={{ flex: 1 }}>
                    Adultos que vienen
                    <input
                      type="number"
                      min={0}
                      value={g.rsvpAdultsCount ?? 0}
                      onChange={(e) => updateEventGuest(g.id, { rsvpAdultsCount: Number(e.target.value) }).then(reload)}
                    />
                  </label>
                  <label style={{ flex: 1 }}>
                    Niños que vienen
                    <input
                      type="number"
                      min={0}
                      value={g.rsvpChildrenCount ?? 0}
                      onChange={(e) => updateEventGuest(g.id, { rsvpChildrenCount: Number(e.target.value) }).then(reload)}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        ))}
        {guests.length === 0 && <p className="muted">Todavía no hay invitados.</p>}
        {guests.length > 0 && visibleGuests.length === 0 && <p className="muted">Nadie con ese estado por ahora.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir invitado
      </button>
      {showAdd && (
        <AddGuestModal
          event={event}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
      {invitationGuest && <InvitationModal event={event} guest={invitationGuest} onClose={() => setInvitationGuest(null)} />}
      {manualShare && <ShareFallbackModal title={manualShare.title} text={manualShare.text} onClose={() => setManualShare(null)} />}
      {showDesigner && <InvitationCanvasEditor event={event} onClose={() => setShowDesigner(false)} onSaved={() => setShowDesigner(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — enlace de RSVP abierto. Petición de la Skill: "For informal
// events, an open RSVP link may allow recipient to type minimal
// identification and adult/child counts" — cada envío crea un
// invitado nuevo directamente (ver event-rsvp), sin pasar por aquí.
// ---------------------------------------------------------------------

function EventOpenLinkBlock({ event }: { event: FamilyEvent }) {
  const [token, setToken] = useState(event.openRsvpToken)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)

  useEffect(() => {
    if (event.openRsvpToken) getEventOpenRsvpUrl(event.id).then(setUrl).catch(() => {})
  }, [event.id, event.openRsvpToken])

  async function handleActivate() {
    setLoading(true)
    setError(null)
    try {
      const newUrl = await getEventOpenRsvpUrl(event.id)
      setUrl(newUrl)
      setToken('activo')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo activar el enlace'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRegenerate() {
    setLoading(true)
    setError(null)
    try {
      const newUrl = await regenerateEventOpenRsvpUrl(event.id)
      setUrl(newUrl)
      setNotice('Enlace nuevo generado — el anterior ha dejado de funcionar.')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo regenerar'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDisable() {
    setLoading(true)
    setError(null)
    try {
      await disableEventOpenLink(event.id)
      setToken(null)
      setUrl(null)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo desactivar'))
    } finally {
      setLoading(false)
    }
  }

  async function handleShare() {
    if (!url) return
    const text = [`Confirma tu asistencia a "${event.title}" aquí: ${url}`, ...eventLocationMapLines(event, { inviteScope: null })].join('\n')
    try {
      const shown = await shareText({ title: event.title, text })
      setNotice(shown ? null : 'Copiado al portapapeles.')
    } catch {
      setManualShare({ title: event.title, text })
    }
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #eee' }}>
      <strong style={{ fontSize: 13 }}>🔗 Enlace abierto (opcional)</strong>
      <p className="muted" style={{ fontSize: 12, margin: '2px 0 4px' }}>
        Para invitar sin lista cerrada — quien lo abre escribe su nombre y cuántos vienen, y crea su propio invitado.
      </p>
      {error && <p className="error">{error}</p>}
      {notice && <p className="points-badge">{notice}</p>}
      {!token && (
        <button type="button" className="link-button" onClick={handleActivate} disabled={loading}>
          {loading ? 'Activando…' : 'Activar enlace abierto'}
        </button>
      )}
      {token && (
        <div className="filter-row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="link-button" onClick={handleShare} disabled={!url}>
            📤 Compartir
          </button>
          <button type="button" className="link-button" onClick={handleRegenerate} disabled={loading}>
            🔄 Regenerar
          </button>
          <button type="button" className="link-button" onClick={handleDisable} disabled={loading}>
            🚫 Desactivar
          </button>
        </div>
      )}
      {manualShare && <ShareFallbackModal title={manualShare.title} text={manualShare.text} onClose={() => setManualShare(null)} />}
    </div>
  )
}

function AddGuestModal({ event, onClose, onAdded }: { event: FamilyEvent; onClose: () => void; onAdded: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [adultsCount, setAdultsCount] = useState('1')
  const [childrenCount, setChildrenCount] = useState('0')
  const [notes, setNotes] = useState('')
  const [inviteScope, setInviteScope] = useState<EventGuestInviteScope>('ambas')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasScope = DUAL_LOCATION_EVENT_TYPES.includes(event.type)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!displayName.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventGuest(event.id, {
        displayName,
        adultsCount: Number(adultsCount) || 0,
        childrenCount: Number(childrenCount) || 0,
        notes: notes || null,
        inviteScope: hasScope ? inviteScope : null,
      })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo invitado
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre o familia
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Familia García" autoFocus />
          </label>
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Adultos
              <input type="number" min={0} value={adultsCount} onChange={(e) => setAdultsCount(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Niños
              <input type="number" min={0} value={childrenCount} onChange={(e) => setChildrenCount(e.target.value)} />
            </label>
          </div>
          {hasScope && (
            <label>
              A qué está invitado
              <select value={inviteScope} onChange={(e) => setInviteScope(e.target.value as EventGuestInviteScope)}>
                {INVITE_SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Notas (opcional)
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Alergia, comentario..." />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Presupuesto.
// ---------------------------------------------------------------------

function BudgetSection({ event }: { event: FamilyEvent }) {
  const [items, setItems] = useState<EventBudgetItem[]>([])
  const [spent, setSpent] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventBudgetItems(event.id)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el presupuesto')))
    if (event.tagId) {
      // Petición real: "no sé en qué circunstancias se podría dar que
      // se haga un traspaso entre cuentas por un cumpleaños pero más
      // vale prevenir así que inclúyelo" — mismo criterio que ya usa
      // toda Economía (isInternalTransferCategory): un traspaso entre
      // cuentas propias, si alguna vez llevara esta etiqueta por error,
      // no debe contar como gasto real del evento.
      Promise.all([listExpenses(), listBudgetCategories()])
        .then(([expenses, categories]) =>
          setSpent(
            expenses
              .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
              .reduce((sum, e) => sum + e.amount, 0),
          ),
        )
        .catch(() => setSpent(null))
    }
  }
  useEffect(reload, [event.id, event.tagId])

  const planned = items.reduce((sum, i) => sum + i.plannedAmount, 0)

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>💰 Presupuesto</strong>
      <p className="muted" style={{ margin: '4px 0' }}>
        Planeado: <strong>{planned.toFixed(2)} €</strong>
        {spent !== null && (
          <>
            {' · '}Gastado en Economía: <strong>{spent.toFixed(2)} €</strong>
          </>
        )}
      </p>
      {spent !== null && (
        <p className="muted" style={{ fontSize: 12 }}>
          Se suma solo lo etiquetado "{event.title}" en Economía — pon esa etiqueta a los gastos del evento para que cuenten aquí, sin duplicar nada.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {items.map((i) => (
          <div key={i.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>{i.category}</span>
            <span>{i.plannedAmount.toFixed(2)} €</span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar partida" onConfirm={() => deleteEventBudgetItem(i.id).then(reload)} />
          </div>
        ))}
        {items.length === 0 && <p className="muted">Todavía no hay partidas de presupuesto.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir partida
      </button>
      {showAdd && (
        <AddBudgetItemModal
          eventId={event.id}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddBudgetItemModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!category.trim()) {
      setError('Ponle un nombre a la partida.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventBudgetItem(eventId, category, Number(amount) || 0)
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nueva partida
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Concepto
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Tarta, local, invitaciones..." autoFocus />
          </label>
          <label>
            Presupuesto (€)
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Menú y compra.
// ---------------------------------------------------------------------

function MenuSection({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventMenuItem[]>([])
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)

  function reload() {
    listEventMenuItems(eventId)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el menú')))
  }
  useEffect(reload, [eventId])

  async function handleAdd(ev: FormEvent) {
    ev.preventDefault()
    if (!newName.trim()) return
    try {
      await addEventMenuItem(eventId, newName)
      setNewName('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    }
  }

  const pending = items.filter((i) => !i.transferred)

  async function handleTransfer() {
    if (pending.length === 0) return
    // Petición de la Skill: "User confirms transfer to PEPA Purchases" —
    // resumen antes de escribir nada, como con cualquier escritura
    // cruzada entre módulos.
    if (!window.confirm(`Se van a crear ${pending.length} producto${pending.length === 1 ? '' : 's'} en Compras. ¿Confirmas?`)) return
    setTransferring(true)
    setError(null)
    try {
      const count = await transferMenuToShopping(eventId)
      setNotice(`✓ ${count} producto${count === 1 ? '' : 's'} añadido${count === 1 ? '' : 's'} a Compras.`)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo traspasar'))
    } finally {
      setTransferring(false)
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🍽️ Menú y compra</strong>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {items.map((i) => (
          <div key={i.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {i.name}
              {i.transferred ? ' · ✓ en Compras' : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar producto" onConfirm={() => deleteEventMenuItem(i.id).then(reload)} />
          </div>
        ))}
        {items.length === 0 && <p className="muted">Todavía no hay nada en el menú.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 8 }}>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="+ Añadir al menú" style={{ flex: 1 }} />
        <button type="submit">Añadir</button>
      </form>
      {pending.length > 0 && (
        <button type="button" className="link-button" onClick={handleTransfer} disabled={transferring} style={{ marginTop: 8 }}>
          {transferring ? 'Traspasando…' : `→ Confirmar traspaso a Compras (${pending.length})`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Proveedores.
// ---------------------------------------------------------------------

function ProvidersSection({ eventId }: { eventId: string }) {
  const [providers, setProviders] = useState<EventProvider[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventProviders(eventId)
      .then(setProviders)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los proveedores')))
  }
  useEffect(reload, [eventId])

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>📇 Proveedores</strong>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {providers.map((p) => (
          <div key={p.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {p.name}
              {p.type ? ` · ${p.type}` : ''}
              {p.contactNote ? ` · ${p.contactNote}` : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar proveedor" onConfirm={() => deleteEventProvider(p.id).then(reload)} />
          </div>
        ))}
        {providers.length === 0 && <p className="muted">Todavía no hay proveedores.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir proveedor
      </button>
      {showAdd && (
        <AddProviderModal
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddProviderModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [contactNote, setContactNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventProvider(eventId, { name, type: type || null, contactNote: contactNote || null })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo proveedor
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label>
            Tipo (opcional)
            <input type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="Catering, fotógrafo..." />
          </label>
          <label>
            Contacto (opcional)
            <input type="text" value={contactNote} onChange={(e) => setContactNote(e.target.value)} placeholder="Teléfono, email..." />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Pagos / fianzas.
// ---------------------------------------------------------------------

function PaymentsSection({ event }: { event: FamilyEvent }) {
  const eventId = event.id
  const [payments, setPayments] = useState<EventPayment[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkingReminderId, setLinkingReminderId] = useState<string | null>(null)

  function reload() {
    listEventPayments(eventId)
      .then(setPayments)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los pagos')))
  }
  useEffect(reload, [eventId])

  async function handleRemindPayment(p: EventPayment) {
    setLinkingReminderId(p.id)
    setError(null)
    try {
      await linkPaymentReminder(p, event.title)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo poner el recordatorio'))
    } finally {
      setLinkingReminderId(null)
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🧾 Pagos y fianzas</strong>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {payments.map((p) => {
          const remaining = p.totalAmount - p.depositPaid
          return (
            <div key={p.id} className="card task-card">
              <div className="task-card-main" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{p.concept}</strong>
                  <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar pago" onConfirm={() => deleteEventPayment(p.id).then(reload)} />
                </div>
                <p className="muted" style={{ margin: '2px 0' }}>
                  {p.totalAmount.toFixed(2)} € · pagado {p.depositPaid.toFixed(2)} € · pendiente {remaining.toFixed(2)} €
                  {p.dueDate ? ` · vence ${p.dueDate}` : ''}
                </p>
                {remaining > 0 && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => updateEventPayment(p.id, { depositPaid: p.totalAmount, status: 'pagado' }).then(reload)}
                  >
                    Marcar como pagado del todo
                  </button>
                )}
                {p.dueDate && remaining > 0 && !p.reminderCalendarEventId && (
                  <button type="button" className="link-button" onClick={() => handleRemindPayment(p)} disabled={linkingReminderId === p.id}>
                    {linkingReminderId === p.id ? 'Poniendo…' : '🔔 Recordarme'}
                  </button>
                )}
                {p.reminderCalendarEventId && <span className="muted" style={{ fontSize: 12 }}>🔔 Recordatorio puesto</span>}
              </div>
            </div>
          )
        })}
        {payments.length === 0 && <p className="muted">Todavía no hay pagos apuntados.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir pago
      </button>
      {showAdd && (
        <AddPaymentModal
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddPaymentModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [concept, setConcept] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [depositPaid, setDepositPaid] = useState('0')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!concept.trim()) {
      setError('Ponle un concepto.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventPayment(eventId, {
        concept,
        totalAmount: Number(totalAmount) || 0,
        depositPaid: Number(depositPaid) || 0,
        dueDate: dueDate || null,
      })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo pago
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Concepto
            <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Fianza del local..." autoFocus />
          </label>
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Total (€)
              <input type="number" min={0} step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
            </label>
            <label style={{ flex: 1 }}>
              Ya pagado (€)
              <input type="number" min={0} step="0.01" value={depositPaid} onChange={(e) => setDepositPaid(e.target.value)} />
            </label>
          </div>
          <label>
            Vence (opcional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Invitaciones + RSVP público (Fase 2) — plantilla rellenable (tema de
// color, texto autorrelleno editable) y enlace personalizado por
// invitado, compartido con el menú nativo del móvil. El editor en
// capas de verdad (arrastrar/pellizcar/rotar) llega en la Fase 3.
// ---------------------------------------------------------------------

function InvitationModal({ event, guest, onClose }: { event: FamilyEvent; guest: EventGuest; onClose: () => void }) {
  const sortedTemplates = useMemo(() => sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event), [event])
  const [templateKey, setTemplateKey] = useState(sortedTemplates[0].key)
  const [message, setMessage] = useState('¡Nos encantaría contar contigo!')
  const [rsvpUrl, setRsvpUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)
  const [customCanvas, setCustomCanvas] = useState<InvitationCanvas | null>(null)
  const [customTemplateKey, setCustomTemplateKey] = useState<string | null>(null)
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    getGuestRsvpUrl(guest.id)
      .then(setRsvpUrl)
      .catch((err) => setError(errorMessage(err, 'No se pudo generar el enlace')))
      .finally(() => setLoading(false))
    // El diseño en capas (Fase 3) es opcional — si no se ha creado
    // ninguno todavía, seguimos con la tarjeta de tema simple de
    // siempre; un fallo aquí no debe bloquear el enlace de RSVP.
    getEventInvitation(event.id)
      .then(async (invitation) => {
        if (!invitation || invitation.canvas.layers.length === 0) return
        setCustomCanvas(invitation.canvas)
        setCustomTemplateKey(invitation.templateKey)
        if (invitation.backgroundImagePath) {
          getInvitationPhotoUrl(invitation.backgroundImagePath)
            .then(setCustomBackgroundUrl)
            .catch(() => {})
        }
        const paths = invitation.canvas.layers.map((l) => l.photoPath).filter((p): p is string => !!p)
        const urls = await Promise.all(paths.map((p) => getInvitationPhotoUrl(p).catch(() => null)))
        const map: Record<string, string> = {}
        paths.forEach((p, i) => {
          if (urls[i]) map[p] = urls[i] as string
        })
        setPhotoUrls(map)
      })
      .catch(() => {})
  }, [guest.id, event.id])

  const template = INVITATION_TEMPLATES.find((t) => t.key === templateKey) ?? INVITATION_TEMPLATES[0]
  const infoLines = [eventDateLine(event), ...eventLocationLines(event, guest)]

  // Petición real: "prepara que cuando se mande la invitación se mande
  // automáticamente también la ubicación" — la invitación es una
  // imagen (no se puede hacer clicable nada dentro), así que el enlace
  // de mapa real va en el mismo texto que la acompaña al compartir, no
  // hace falta un paso aparte.
  function buildShareText(): string {
    return [`${EVENT_TYPE_META[event.type].icon} ${event.title}`, ...infoLines, ...eventLocationMapLines(event, guest), '', message, '', `Confirma tu asistencia aquí: ${rsvpUrl}`].join('\n')
  }

  async function handleShare() {
    if (!rsvpUrl) return
    setSharing(true)
    setNotice(null)
    try {
      const shown = await shareText({ title: event.title, text: buildShareText() })
      setNotice(shown ? null : 'Copiado al portapapeles.')
    } catch {
      setManualShare({ title: event.title, text: buildShareText() })
    } finally {
      setSharing(false)
    }
  }

  async function handleRegenerate() {
    setLoading(true)
    setError(null)
    try {
      const url = await regenerateGuestRsvpUrl(guest.id)
      setRsvpUrl(url)
      setNotice('Enlace nuevo generado — el anterior ha dejado de funcionar.')
    } catch (err) {
      setError(errorMessage(err, 'No se pudo regenerar'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Invitación para {guest.displayName}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {notice && <p className="points-badge">{notice}</p>}

        {customCanvas ? (
          <InvitationCanvasView canvas={customCanvas} templateKey={customTemplateKey} photoUrls={photoUrls} backgroundImageUrl={customBackgroundUrl} />
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13 }}>
              Elige un tema — el texto sale relleno solo, y se puede editar antes de mandarlo. Para un diseño con foto, texto y emoji a tu gusto, usa "🎨
              Diseño de la invitación" en Invitados.
            </p>
            <InvitationTemplatePicker templates={sortedTemplates} selectedKey={templateKey} onSelect={(t) => setTemplateKey(t.key)} />

            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                marginTop: 12,
                borderRadius: 16,
                padding: 20,
                background: template.gradient,
                color: template.text,
                textAlign: 'center',
                aspectRatio: template.imageAspect ? `${template.imageAspect} / 1` : '3 / 4',
              }}
            >
              <InvitationBackground templateKey={template.key} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 28 }}>{EVENT_TYPE_META[event.type].icon}</div>
                <strong style={{ fontSize: 18 }}>{event.title}</strong>
                {infoLines.map((l) => (
                  <p key={l} style={{ margin: '6px 0', fontSize: 13, opacity: 0.9 }}>
                    {l}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}

        <label style={{ marginTop: 12, display: 'block' }}>
          Mensaje
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
        </label>

        <p className="muted" style={{ fontSize: 12, marginTop: 8, wordBreak: 'break-all' }}>
          {loading ? 'Generando enlace de confirmación…' : rsvpUrl}
        </p>

        <button type="button" onClick={handleShare} disabled={loading || sharing || !rsvpUrl} style={{ marginTop: 8 }}>
          {sharing ? 'Compartiendo…' : '📤 Compartir invitación'}
        </button>
        {!loading && rsvpUrl && (
          <button type="button" className="link-button" onClick={handleRegenerate} style={{ marginTop: 8 }}>
            🔄 Regenerar enlace (invalida el anterior)
          </button>
        )}
      </div>
      {manualShare && <ShareFallbackModal title={manualShare.title} text={manualShare.text} onClose={() => setManualShare(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Mesas. Asignación simple, sin plano 3D.
// ---------------------------------------------------------------------

function TablesSection({ event }: { event: FamilyEvent }) {
  const [tables, setTables] = useState<EventTableSeat[]>([])
  const [guests, setGuests] = useState<EventGuest[]>([])
  const [newName, setNewName] = useState('')
  const [newCapacity, setNewCapacity] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventTables(event.id)
      .then(setTables)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las mesas')))
    listEventGuests(event.id)
      .then(setGuests)
      .catch(() => {})
  }
  useEffect(reload, [event.id])

  async function handleAdd(ev: FormEvent) {
    ev.preventDefault()
    if (!newName.trim()) return
    try {
      await addEventTable(event.id, newName, newCapacity ? Number(newCapacity) : null)
      setNewName('')
      setNewCapacity('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🪑 Mesas</strong>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {tables.map((t) => {
          const seated = guests.filter((g) => g.tableId === t.id)
          const seatedCount = seated.reduce((sum, g) => sum + g.adultsCount + g.childrenCount, 0)
          return (
            <div key={t.id} className="card task-card">
              <div className="task-card-main" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>
                    {t.name}
                    {t.capacity ? ` (${seatedCount}/${t.capacity})` : ` (${seatedCount})`}
                  </strong>
                  <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar mesa" onConfirm={() => deleteEventTable(t.id).then(reload)} />
                </div>
                <p className="muted" style={{ margin: '2px 0' }}>
                  {seated.length === 0 ? 'Sin invitados asignados.' : seated.map((g) => g.displayName).join(', ')}
                </p>
              </div>
            </div>
          )
        })}
        {tables.length === 0 && <p className="muted">Todavía no hay mesas.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 8 }}>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="+ Añadir mesa" style={{ flex: 1 }} />
        <input type="number" min={0} value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} placeholder="Aforo" style={{ width: 70 }} />
        <button type="submit">Añadir</button>
      </form>
      {guests.length > 0 && tables.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Asignar invitados a una mesa:
          </p>
          <div className="event-list">
            {guests.map((g) => (
              <div key={g.id} className="inline-fields" style={{ alignItems: 'center' }}>
                <span style={{ flex: 1 }}>{g.displayName}</span>
                <select value={g.tableId ?? ''} onChange={(e) => assignGuestTable(g.id, e.target.value || null).then(reload)}>
                  <option value="">Sin mesa</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Decoración. Opcional; PEPA propone, la familia elige todo/
// algo/nada.
// ---------------------------------------------------------------------

function DecorationSection({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventDecorationItem[]>([])
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventDecorationItems(eventId)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar la decoración')))
  }
  useEffect(reload, [eventId])

  async function handleAdd(ev: FormEvent) {
    ev.preventDefault()
    if (!newName.trim()) return
    try {
      await addEventDecorationItem(eventId, newName)
      setNewName('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    }
  }

  async function handleTransfer(item: EventDecorationItem) {
    try {
      await transferDecorationItemToShopping(item)
      setNotice(`✓ "${item.name}" añadido a Compras.`)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo traspasar'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🎈 Decoración</strong>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {items.map((i) => (
          <div key={i.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <select value={i.status} onChange={(e) => updateEventDecorationItem(i.id, { status: e.target.value as EventDecorationItem['status'] }).then(reload)}>
              <option value="idea">Idea</option>
              <option value="elegido">Elegido</option>
              <option value="comprado">Comprado</option>
            </select>
            <span style={{ flex: 1 }}>
              {i.name}
              {i.transferredToShopping ? ' · ✓ en Compras' : ''}
            </span>
            {!i.transferredToShopping && (
              <button type="button" className="link-button" onClick={() => handleTransfer(i)}>
                → Compras
              </button>
            )}
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventDecorationItem(i.id).then(reload)} />
          </div>
        ))}
        {items.length === 0 && <p className="muted">Ninguna idea todavía — no hace falta decoración si no la quieres.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 8 }}>
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="+ Añadir idea" style={{ flex: 1 }} />
        <button type="submit">Añadir</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Actividades / juegos. Contextual y opcional.
// ---------------------------------------------------------------------

function ActivitiesSection({ eventId }: { eventId: string }) {
  const [activities, setActivities] = useState<EventActivity[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventActivities(eventId)
      .then(setActivities)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar las actividades')))
  }
  useEffect(reload, [eventId])

  async function handleTransfer(activity: EventActivity) {
    try {
      await transferActivityMaterialsToShopping(activity)
      setNotice(`✓ Material de "${activity.title}" añadido a Compras.`)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo traspasar'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🎲 Actividades y juegos</strong>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {activities.map((a) => (
          <div key={a.id} className="card task-card">
            <div className="task-card-main" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{a.title}</strong>
                <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar actividad" onConfirm={() => deleteEventActivity(a.id).then(reload)} />
              </div>
              <p className="muted" style={{ margin: '2px 0' }}>
                {[a.ageRange, a.durationMinutes ? `${a.durationMinutes} min` : null].filter(Boolean).join(' · ')}
              </p>
              {a.materialsNote && (
                <p className="muted" style={{ margin: '2px 0' }}>
                  Material: {a.materialsNote}
                  {a.transferredToShopping ? ' · ✓ en Compras' : ''}
                </p>
              )}
              {a.materialsNote && !a.transferredToShopping && (
                <button type="button" className="link-button" onClick={() => handleTransfer(a)}>
                  → Compras
                </button>
              )}
            </div>
          </div>
        ))}
        {activities.length === 0 && <p className="muted">Todavía no hay actividades apuntadas.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir actividad
      </button>
      {showAdd && (
        <AddActivityModal
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddActivityModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [ageRange, setAgeRange] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('')
  const [materialsNote, setMaterialsNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!title.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventActivity(eventId, {
        title,
        ageRange: ageRange || null,
        durationMinutes: durationMinutes ? Number(durationMinutes) : null,
        materialsNote: materialsNote || null,
      })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nueva actividad
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Búsqueda del tesoro..." autoFocus />
          </label>
          <div className="inline-fields">
            <label style={{ flex: 1 }}>
              Edad (opcional)
              <input type="text" value={ageRange} onChange={(e) => setAgeRange(e.target.value)} placeholder="4-8 años" />
            </label>
            <label style={{ flex: 1 }}>
              Duración (min)
              <input type="number" min={0} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
            </label>
          </div>
          <label>
            Material necesario (opcional)
            <input type="text" value={materialsNote} onChange={(e) => setMaterialsNote(e.target.value)} placeholder="Globos, premios..." />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Detalles/recuerdos (por tipo de artículo) + Detalles
// especiales (por persona) — un único módulo 'detalles' con dos formas
// distintas a propósito.
// ---------------------------------------------------------------------

function DetailsSection({ eventId }: { eventId: string }) {
  const [favors, setFavors] = useState<EventFavorItem[]>([])
  const [specials, setSpecials] = useState<EventSpecialDetail[]>([])
  const [showAddFavor, setShowAddFavor] = useState(false)
  const [showAddSpecial, setShowAddSpecial] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventFavorItems(eventId)
      .then(setFavors)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los detalles')))
    listEventSpecialDetails(eventId)
      .then(setSpecials)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los detalles especiales')))
  }
  useEffect(reload, [eventId])

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🎁 Detalles / recuerdos</strong>
      <p className="muted" style={{ fontSize: 13 }}>
        Para los invitados en general, y aparte, para personas concretas (padrinos, testigos...).
      </p>
      {error && <p className="error">{error}</p>}

      <p className="muted" style={{ margin: '8px 0 4px', fontSize: 13, fontWeight: 600 }}>
        Recuerdos para invitados
      </p>
      <div className="event-list">
        {favors.map((f) => (
          <div key={f.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <select value={f.status} onChange={(e) => updateEventFavorItem(f.id, { status: e.target.value as EventFavorItem['status'] }).then(reload)}>
              <option value="pendiente">Pendiente</option>
              <option value="encargado">Encargado</option>
              <option value="listo">Listo</option>
            </select>
            <span style={{ flex: 1 }}>
              {f.itemType}
              {f.quantityNeeded ? ` · ${f.quantityNeeded}` : ''}
              {f.supplier ? ` · ${f.supplier}` : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventFavorItem(f.id).then(reload)} />
          </div>
        ))}
        {favors.length === 0 && <p className="muted">Ninguno todavía.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAddFavor(true)}>
        + Añadir recuerdo
      </button>

      <p className="muted" style={{ margin: '12px 0 4px', fontSize: 13, fontWeight: 600 }}>
        Detalles para personas especiales
      </p>
      <div className="event-list">
        {specials.map((s) => (
          <div key={s.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <select
              value={s.status}
              onChange={(e) => updateEventSpecialDetail(s.id, { status: e.target.value as EventSpecialDetail['status'] }).then(reload)}
            >
              <option value="pendiente">Pendiente</option>
              <option value="comprado">Comprado</option>
              <option value="preparado">Preparado</option>
            </select>
            <span style={{ flex: 1 }}>
              {s.recipientName}
              {s.relationship ? ` (${s.relationship})` : ''}
              {s.detail ? ` · ${s.detail}` : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventSpecialDetail(s.id).then(reload)} />
          </div>
        ))}
        {specials.length === 0 && <p className="muted">Ninguno todavía.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAddSpecial(true)}>
        + Añadir persona especial
      </button>

      {showAddFavor && (
        <AddFavorModal
          eventId={eventId}
          onClose={() => setShowAddFavor(false)}
          onAdded={() => {
            setShowAddFavor(false)
            reload()
          }}
        />
      )}
      {showAddSpecial && (
        <AddSpecialDetailModal
          eventId={eventId}
          onClose={() => setShowAddSpecial(false)}
          onAdded={() => {
            setShowAddSpecial(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddFavorModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [itemType, setItemType] = useState('')
  const [quantityNeeded, setQuantityNeeded] = useState('')
  const [supplier, setSupplier] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!itemType.trim()) {
      setError('Dile qué es.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventFavorItem(eventId, { itemType, quantityNeeded: quantityNeeded ? Number(quantityNeeded) : null, supplier: supplier || null })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo recuerdo
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Qué es
            <input type="text" value={itemType} onChange={(e) => setItemType(e.target.value)} placeholder="Bolsa de chuches, estuche..." autoFocus />
          </label>
          <label>
            Cantidad necesaria (opcional)
            <input type="number" min={0} value={quantityNeeded} onChange={(e) => setQuantityNeeded(e.target.value)} />
          </label>
          <label>
            Proveedor (opcional)
            <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

function AddSpecialDetailModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [recipientName, setRecipientName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [detail, setDetail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!recipientName.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventSpecialDetail(eventId, { recipientName, relationship: relationship || null, detail: detail || null })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Persona especial
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre
            <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Abuela Pepa" autoFocus />
          </label>
          <label>
            Relación (opcional)
            <input type="text" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Madrina, testigo..." />
          </label>
          <label>
            Idea de detalle (opcional)
            <input type="text" value={detail} onChange={(e) => setDetail(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Regalos recibidos. PRIVADO, opcional.
// ---------------------------------------------------------------------

function GiftsSection({ eventId }: { eventId: string }) {
  const [gifts, setGifts] = useState<EventGiftReceived[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventGifts(eventId)
      .then(setGifts)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los regalos')))
  }
  useEffect(reload, [eventId])

  const totalCash = gifts.reduce((sum, g) => sum + (g.cashAmount ?? 0), 0)

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🎀 Regalos recibidos</strong>
      <p className="muted" style={{ fontSize: 12 }}>
        Privado — nunca se muestra en la página pública de RSVP.
      </p>
      {error && <p className="error">{error}</p>}
      {gifts.length > 0 && (
        <p className="muted" style={{ margin: '4px 0' }}>
          Total en efectivo: <strong>{totalCash.toFixed(2)} €</strong>
        </p>
      )}
      <div className="event-list">
        {gifts.map((g) => (
          <div key={g.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ flex: 1 }}>
              {g.guestName}
              {g.giftDescription ? ` · ${g.giftDescription}` : ''}
              {g.cashAmount ? ` · ${g.cashAmount.toFixed(2)} €` : ''}
            </span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventGift(g.id).then(reload)} />
          </div>
        ))}
        {gifts.length === 0 && <p className="muted">Todavía no hay nada apuntado.</p>}
      </div>
      <button type="button" className="link-button" onClick={() => setShowAdd(true)}>
        + Añadir regalo
      </button>
      {showAdd && (
        <AddGiftModal
          eventId={eventId}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AddGiftModal({ eventId, onClose, onAdded }: { eventId: string; onClose: () => void; onAdded: () => void }) {
  const [guestName, setGuestName] = useState('')
  const [giftDescription, setGiftDescription] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!guestName.trim()) {
      setError('Ponle un nombre.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addEventGift(eventId, { guestName, giftDescription: giftDescription || null, cashAmount: cashAmount ? Number(cashAmount) : null })
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo regalo
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            De quién
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} autoFocus />
          </label>
          <label>
            Qué regaló (opcional)
            <input type="text" value={giftDescription} onChange={(e) => setGiftDescription(e.target.value)} />
          </label>
          <label>
            Importe en efectivo (opcional)
            <input type="number" min={0} step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Añadir'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Plan del día. Cronológico; protagonista el día del evento.
// ---------------------------------------------------------------------

function DayPlanSection({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventDayPlanItem[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newTime, setNewTime] = useState('')
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventDayPlan(eventId)
      .then(setItems)
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el plan del día')))
  }
  useEffect(reload, [eventId])

  async function handleAdd(ev: FormEvent) {
    ev.preventDefault()
    if (!newTitle.trim()) return
    try {
      await addEventDayPlanItem(eventId, newTitle, newTime || null)
      setNewTitle('')
      setNewTime('')
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    }
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🗓️ Plan del día</strong>
      {error && <p className="error">{error}</p>}
      <div className="event-list" style={{ marginTop: 8 }}>
        {items.map((i) => (
          <div key={i.id} className="inline-fields" style={{ alignItems: 'center' }}>
            <span style={{ fontWeight: 600, minWidth: 48 }}>{i.itemTime ? i.itemTime.slice(0, 5) : '—'}</span>
            <span style={{ flex: 1 }}>{i.title}</span>
            <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar" onConfirm={() => deleteEventDayPlanItem(i.id).then(reload)} />
          </div>
        ))}
        {items.length === 0 && <p className="muted">Todavía no hay plan del día.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields" style={{ marginTop: 8 }}>
        <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: 90 }} />
        <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="+ Añadir al plan" style={{ flex: 1 }} />
        <button type="submit">Añadir</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — modo "día del evento". Petición de la Skill: el día del
// evento, la pantalla debe destacar lo inmediato (asistencia
// confirmada, compras pendientes, próximo momento del plan) — nunca se
// muestra si el evento no está en marcha o la fecha no está confirmada.
// ---------------------------------------------------------------------

function EventDayBanner({ event }: { event: FamilyEvent }) {
  const [confirmedPeople, setConfirmedPeople] = useState<number | null>(null)
  const [pendingPurchases, setPendingPurchases] = useState(0)
  const [nextPlanItem, setNextPlanItem] = useState<EventDayPlanItem | null>(null)

  useEffect(() => {
    if (event.enabledModules.includes('invitados')) {
      listEventGuests(event.id).then((guests) => {
        const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmado')
        setConfirmedPeople(confirmed.reduce((sum, g) => sum + (g.rsvpAdultsCount ?? g.adultsCount) + (g.rsvpChildrenCount ?? g.childrenCount), 0))
      })
    }
    Promise.all([
      event.enabledModules.includes('menu_compra') ? listEventMenuItems(event.id) : Promise.resolve([]),
      event.enabledModules.includes('decoracion') ? listEventDecorationItems(event.id) : Promise.resolve([]),
    ]).then(([menu, decoration]) => {
      setPendingPurchases(menu.filter((i) => !i.transferred).length + decoration.filter((i) => !i.transferredToShopping).length)
    })
    if (event.enabledModules.includes('plan_dia')) {
      listEventDayPlan(event.id).then((items) => {
        const now = new Date().toTimeString().slice(0, 5)
        setNextPlanItem(items.find((i) => !i.itemTime || i.itemTime.slice(0, 5) >= now) ?? null)
      })
    }
  }, [event.id, event.enabledModules])

  return (
    <div className="card event-card" style={{ marginTop: 8, background: '#eef2ff', borderColor: '#c7d2fe' }}>
      <strong>🎉 ¡Hoy es el día!</strong>
      <div className="event-list" style={{ marginTop: 4 }}>
        {confirmedPeople !== null && <p style={{ margin: '2px 0' }}>👥 {confirmedPeople} personas confirmadas</p>}
        {pendingPurchases > 0 && <p style={{ margin: '2px 0' }}>🛒 {pendingPurchases} cosas todavía sin pasar a Compras</p>}
        {nextPlanItem && (
          <p style={{ margin: '2px 0' }}>
            🗓️ Siguiente: {nextPlanItem.itemTime ? `${nextPlanItem.itemTime.slice(0, 5)} · ` : ''}
            {nextPlanItem.title}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Conclusiones de PEPA por reglas. Contextual, no un panel
// gigante aparte (petición de la Skill) — se enseña solo si hay algo
// que decir de verdad.
// ---------------------------------------------------------------------

function PepaConclusions({ event }: { event: FamilyEvent }) {
  const [conclusions, setConclusions] = useState<EventConclusionType[]>([])

  useEffect(() => {
    Promise.all([
      event.enabledModules.includes('invitados') ? listEventGuests(event.id) : Promise.resolve([]),
      event.enabledModules.includes('tareas') ? listEventTasks(event.id) : Promise.resolve([]),
      event.enabledModules.includes('pagos') ? listEventPayments(event.id) : Promise.resolve([]),
      event.enabledModules.includes('presupuesto') ? listEventBudgetItems(event.id) : Promise.resolve([]),
      event.tagId && event.enabledModules.includes('presupuesto') ? listExpenses() : Promise.resolve(null),
      event.tagId && event.enabledModules.includes('presupuesto') ? listBudgetCategories() : Promise.resolve([]),
    ]).then(([guests, tasks, payments, budgetItems, expenses, categories]) => {
      const plannedBudget = budgetItems.reduce((sum, i) => sum + i.plannedAmount, 0)
      const spentBudget = expenses
        ? expenses
            .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
            .reduce((sum, e) => sum + e.amount, 0)
        : null
      setConclusions(
        computeEventConclusions({
          rsvpDeadline: event.rsvpDeadline,
          guests,
          tasks,
          payments,
          plannedBudget,
          spentBudget,
        }),
      )
    })
  }, [event.id, event.enabledModules, event.rsvpDeadline, event.tagId])

  if (conclusions.length === 0) return null

  return (
    <div className="card event-card" style={{ marginTop: 8, background: '#fdf4ff', borderColor: '#f0abfc' }}>
      <strong>🧠 Pepa dice</strong>
      <div className="event-list" style={{ marginTop: 4 }}>
        {conclusions.map((c) => (
          <p key={c.id} style={{ margin: '2px 0' }}>
            {c.icon} {c.text}
          </p>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 3 — Editor de invitaciones en capas de verdad. Petición de la
// Skill: "Think WhatsApp / Instagram Stories simplicity" — un único
// gesto de arrastre en el "tirador" de la esquina mueve tamaño Y
// rotación a la vez (igual que un texto de Instagram Stories), en vez
// de un lienzo estilo Canva de escritorio con herramientas separadas.
// Un solo diseño por evento (event_invitations, unique(event_id)); el
// invite_scope de cada invitado no cambia el diseño.
// ---------------------------------------------------------------------

function InvitationShapeGraphic({ shapeKey, color, size }: { shapeKey?: string; color?: string; size: number }) {
  const c = color || '#ffffff'
  switch (shapeKey) {
    case 'anillo':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="10" />
        </svg>
      )
    case 'estrella':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <polygon points="50,5 61,38 96,38 68,59 79,92 50,72 21,92 32,59 4,38 39,38" fill={c} />
        </svg>
      )
    case 'confeti':
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="20" cy="20" r="6" fill={c} />
          <circle cx="70" cy="15" r="5" fill={c} />
          <circle cx="50" cy="50" r="7" fill={c} />
          <circle cx="80" cy="70" r="5" fill={c} />
          <circle cx="25" cy="75" r="6" fill={c} />
          <circle cx="55" cy="85" r="4" fill={c} />
        </svg>
      )
    case 'ondas':
      return (
        <svg width={size} height={size * 0.4} viewBox="0 0 100 40">
          <path d="M0,20 Q12,0 25,20 T50,20 T75,20 T100,20" fill="none" stroke={c} strokeWidth="6" />
        </svg>
      )
    case 'brillos':
      // Petición real: "una capa de brillos, elementos de brillos... como
      // si fuese purpurina" — varios destellos de 4 puntas (forma ✨) a
      // distinto tamaño, cada uno parpadeando con su propio desfase
      // (animate nativo de SVG, sin CSS global ni imagen de textura).
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          {[
            [22, 28, 16, 0],
            [70, 20, 11, 0.4],
            [50, 55, 20, 0.8],
            [80, 68, 13, 1.2],
            [18, 75, 12, 1.6],
          ].map(([cx, cy, r, delay], i) => (
            <g key={i} transform={`translate(${cx},${cy})`}>
              <path
                d={`M0,${-r} Q${r * 0.15},${-r * 0.15} ${r},0 Q${r * 0.15},${r * 0.15} 0,${r} Q${-r * 0.15},${r * 0.15} ${-r},0 Q${-r * 0.15},${-r * 0.15} 0,${-r} Z`}
                fill={c}
              >
                <animate attributeName="opacity" values="0.25;1;0.25" dur="1.6s" begin={`${delay}s`} repeatCount="indefinite" />
              </path>
            </g>
          ))}
        </svg>
      )
    case 'circulo':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill={c} />
        </svg>
      )
  }
}

function darkenHexColor(hex: string, amount: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return hex
  const num = parseInt(clean, 16)
  const c = (v: number) => Math.max(0, Math.min(255, v))
  const r = c((num >> 16) - amount)
  const g = c(((num >> 8) & 0xff) - amount)
  const b = c((num & 0xff) - amount)
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

// Petición real: "que al texto se le pueda dar formato 3D" — capas de
// sombra escalonadas en un tono más oscuro del propio color del texto,
// el truco clásico de CSS para simular relieve/extrusión sin librerías.
function text3dShadow(color: string): string {
  const dark = darkenHexColor(color, 70)
  const steps = [1, 2, 3, 4, 5].map((i) => `${i}px ${i}px 0 ${dark}`)
  return [...steps, '6px 6px 10px rgba(0,0,0,0.35)'].join(', ')
}

const RAINBOW_STOPS = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF3B30']
const IRIDESCENT_STOPS = ['#FFD1E8', '#C9F0FF', '#E0C9FF', '#FFF3C4', '#C9FFE0', '#FFD1E8']
const METALLIC_STOPS = ['#6E6E73', '#F5F5F7', '#8E8E93', '#FFFFFF', '#5A5A5E', '#D1D1D6', '#6E6E73']

// Estilo → clase CSS (relleno plano, capa "text"/"event_data" sin
// curvar) — ver .invitation-*-text en styles.css para cada animación.
const TEXT_STYLE_CLASS: Partial<Record<InvitationTextStyle, string>> = {
  sparkle: 'invitation-glitter-text',
  rainbow_static: 'invitation-rainbow-static-text',
  rainbow_animated: 'invitation-rainbow-animated-text',
  iridescent: 'invitation-iridescent-text',
  metallic: 'invitation-metallic-text',
}

// Mismos estilos que TEXT_STYLE_CLASS pero para la variante curvada
// (SVG con textPath, que no puede usar background-clip). "sparkle"
// anima el hueco entre dos franjas del propio color; el resto recorre
// una paleta fija de colores.
function TextGradientDef({ id, style, color }: { id: string; style: InvitationTextStyle; color: string }) {
  if (style === 'sparkle') {
    return (
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={color} />
        <stop offset="45%" stopColor={color} />
        <stop offset="50%" stopColor="#ffffff" />
        <stop offset="55%" stopColor={color} />
        <stop offset="100%" stopColor={color} />
        <animate attributeName="x1" values="-1;1" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="x2" values="0;2" dur="2.2s" repeatCount="indefinite" />
      </linearGradient>
    )
  }
  const isRainbow = style === 'rainbow_static' || style === 'rainbow_animated'
  const stops = isRainbow ? RAINBOW_STOPS : style === 'metallic' ? METALLIC_STOPS : IRIDESCENT_STOPS
  const animated = style === 'rainbow_animated' || style === 'iridescent' || style === 'metallic'
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      {stops.map((c, i) => (
        <stop key={i} offset={`${(i / (stops.length - 1)) * 100}%`} stopColor={c} />
      ))}
      {animated && (
        <>
          <animate attributeName="x1" values="0;-2;0" dur={style === 'iridescent' ? '7s' : '5s'} repeatCount="indefinite" />
          <animate attributeName="x2" values="1;-1;1" dur={style === 'iridescent' ? '7s' : '5s'} repeatCount="indefinite" />
        </>
      )}
    </linearGradient>
  )
}

// "fontSize" se reutiliza como tamaño base en píxeles para foto/forma,
// no solo para texto — evita añadir un campo más al tipo por algo tan
// parecido (ver domain/types.ts, InvitationLayer).
function InvitationLayerVisual({ layer, photoUrls }: { layer: InvitationLayer; photoUrls: Record<string, string> }) {
  switch (layer.type) {
    case 'text':
    case 'event_data': {
      const color = layer.color || '#ffffff'
      const fontSize = layer.fontSize ?? 16
      const fontFamily = layer.fontFamily || 'inherit'
      const fontWeight = layer.type === 'text' ? 700 : 400
      const style = layer.textStyle ?? 'normal'
      const hasGradientFill = style !== 'normal' && style !== '3d'

      // Curvar solo tiene sentido en una línea — "event_data" (varias
      // líneas de fecha/ubicación) siempre se queda recto.
      if (layer.type === 'text' && layer.curve) {
        const text = (layer.text ?? '').replace(/\n/g, ' ')
        const bend = clamp(layer.curve, -100, 100)
        const pathId = `curve-${layer.id}`
        const gradientId = `fill-${layer.id}`
        const width = Math.max(220, text.length * fontSize * 0.62)
        const height = Math.max(80, Math.abs(bend) * 0.9 + fontSize * 1.6)
        const midY = height / 2
        const d = `M 10 ${midY} Q ${width / 2} ${midY - bend} ${width - 10} ${midY}`
        const dark = darkenHexColor(color, 70)
        const fill = hasGradientFill ? `url(#${gradientId})` : color
        return (
          <svg width={width} height={height} style={{ overflow: 'visible', display: 'block' }}>
            <path id={pathId} d={d} fill="none" />
            {hasGradientFill && (
              <defs>
                <TextGradientDef id={gradientId} style={style} color={color} />
              </defs>
            )}
            {style === '3d' &&
              [5, 4, 3, 2, 1].map((i) => (
                <text key={i} fontSize={fontSize} fontFamily={fontFamily} fontWeight={fontWeight} fill={dark} transform={`translate(${i}, ${i})`}>
                  <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%" textAnchor="middle">
                    {text}
                  </textPath>
                </text>
              ))}
            <text fontSize={fontSize} fontFamily={fontFamily} fontWeight={fontWeight} fill={fill}>
              <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%" textAnchor="middle">
                {text}
              </textPath>
            </text>
          </svg>
        )
      }

      const className = TEXT_STYLE_CLASS[style]
      return (
        <div
          className={className}
          style={
            {
              color: className ? undefined : color,
              fontSize,
              fontFamily,
              fontWeight,
              whiteSpace: 'pre-line',
              textAlign: 'center',
              textShadow: className ? 'none' : style === '3d' ? text3dShadow(color) : '0 1px 4px rgba(0,0,0,0.25)',
              '--glitter-base': color,
            } as CSSProperties
          }
        >
          {layer.text}
        </div>
      )
    }
    case 'emoji':
      return <div style={{ fontSize: layer.fontSize ?? 48, lineHeight: 1 }}>{layer.text}</div>
    case 'shape':
      return <InvitationShapeGraphic shapeKey={layer.shapeKey} color={layer.color} size={layer.fontSize ?? 60} />
    case 'photo': {
      const url = layer.photoPath ? photoUrls[layer.photoPath] : undefined
      const size = layer.fontSize ?? 120
      return url ? (
        <img src={url} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 12, display: 'block' }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: 12, background: 'rgba(255,255,255,0.35)' }} />
      )
    }
    default:
      return null
  }
}

// Renderer de solo lectura — reutilizado tanto en el editor (sin
// selección/gestos) como en el previo dentro de InvitationModal, para
// que "lo que ves es lo que se manda" sea literal.
// Arte decorativo propio por plantilla — nunca un personaje con
// copyright, solo formas geométricas simples (círculos, óvalos,
// triángulos) con el espíritu de cada tema. Petición real: "no quiero
// un simple fondo colorido, quiero plantillas bonitas temáticas... como
// las de las fotos adjuntas" (referencias de Canva/Pinterest — esos
// diseños concretos no se pueden copiar, son de terceros). Vive aquí
// (no en domain/events.ts) porque ese archivo es .ts sin JSX. No es una
// capa editable — va detrás de las capas del usuario, fija al elegir
// plantilla (igual que el degradado de fondo).
function InvitationBackgroundArt({ artKey }: { artKey: string }) {
  const common = { style: { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', pointerEvents: 'none' as const } }
  switch (artKey) {
    case 'globos':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[
            [40, 300, 32, '#ffffff'],
            [80, 340, 24, '#F472B6'],
            [255, 310, 30, '#ffffff'],
            [220, 350, 22, '#34D399'],
          ].map(([cx, cy, r, fill], i) => (
            <g key={i}>
              <ellipse cx={cx as number} cy={cy as number} rx={r as number} ry={(r as number) * 1.15} fill={fill as string} opacity={0.9} />
              <polygon
                points={`${(cx as number) - 5},${(cy as number) + (r as number) * 1.1} ${(cx as number) + 5},${(cy as number) + (r as number) * 1.1} ${cx},${(cy as number) + (r as number) * 1.1 + 8}`}
                fill={fill as string}
                opacity={0.9}
              />
              <path
                d={`M${cx} ${(cy as number) + (r as number) * 1.1 + 8} q 6 20 -4 40 q -8 18 4 36`}
                stroke={fill as string}
                strokeWidth={1.5}
                fill="none"
                opacity={0.6}
              />
            </g>
          ))}
          {[[30, 60], [270, 90], [150, 40], [60, 150], [250, 200], [190, 60]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 4 : 3} fill="#ffffff" opacity={0.7} />
          ))}
        </svg>
      )
    case 'monstruo':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="monster-body" light="#5EEAD4" dark="#0D9488" />
            <MascotGradient id="monster-horn" light="#2DD4BF" dark="#0F766E" />
          </defs>
          <g opacity={0.9}>
            {Array.from({ length: 8 }).map((_, i) => (
              <polygon key={i} points={`${i * 40 + 5},18 ${i * 40 + 25},18 ${i * 40 + 15},42`} fill={i % 2 === 0 ? '#FBBF24' : '#F472B6'} />
            ))}
            <line x1={0} y1={18} x2={300} y2={18} stroke="#ffffff" strokeWidth={2} opacity={0.5} />
          </g>
          {/* Bug real visto probando en vivo: a tamaño completo, el
              monstruo tapaba el texto de fecha que va por defecto a
              y=0.78 — se encoge y se mete en la esquina para dejar el
              centro libre para las capas de texto del usuario. */}
          {groundShadow(66, 418, 62)}
          <g transform="translate(46 366) scale(0.6)" strokeLinejoin="round">
            <circle cx={-25} cy={-50} r={11} fill="url(#monster-horn)" stroke="#115E59" strokeWidth={2} />
            <circle cx={5} cy={-60} r={9} fill="url(#monster-horn)" stroke="#115E59" strokeWidth={2} />
            <circle cx={30} cy={-48} r={10} fill="url(#monster-horn)" stroke="#115E59" strokeWidth={2} />
            <ellipse cx={0} cy={0} rx={75} ry={70} fill="url(#monster-body)" stroke="#115E59" strokeWidth={3} />
            {blush(-42, 8, 11)}
            {blush(42, 14, 11)}
            {sparkleEye(-20, -15, 20)}
            {sparkleEye(22, -6, 15)}
            <path d="M-15 25 q 15 18 35 2" stroke="#115E59" strokeWidth={3.5} fill="none" strokeLinecap="round" />
          </g>
          {[[240, 260], [265, 220], [220, 300]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 7, 3)} fill="#FBBF24" opacity={0.85} />
          ))}
        </svg>
      )
    case 'futbol':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[[45, 340, 38], [255, 70, 26]].map(([cx, cy, r], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r={r} fill="#ffffff" />
              <polygon
                points={ballPentagon(cx, cy, r * 0.42)}
                fill="#1F2937"
              />
              {[0, 1, 2, 3, 4].map((k) => {
                const a = (Math.PI * 2 * k) / 5 - Math.PI / 2
                const x1 = cx + Math.cos(a) * r * 0.42
                const y1 = cy + Math.sin(a) * r * 0.42
                const x2 = cx + Math.cos(a) * r * 0.95
                const y2 = cy + Math.sin(a) * r * 0.95
                return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1F2937" strokeWidth={2} />
              })}
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1F2937" strokeWidth={2} />
            </g>
          ))}
          {[[200, 330], [90, 60], [240, 220]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 6, 3)} fill="#ffffff" opacity={0.8} />
          ))}
        </svg>
      )
    case 'unicornio':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="uni-body" light="#ffffff" dark="#E9D8FD" />
            <MascotGradient id="uni-horn" light="#FEF3C7" dark="#F59E0B" />
          </defs>
          <path d="M20 60 A130 130 0 0 1 280 60" stroke="#FCA5A5" strokeWidth={10} fill="none" opacity={0.7} />
          <path d="M35 60 A115 115 0 0 1 265 60" stroke="#FDE68A" strokeWidth={10} fill="none" opacity={0.7} />
          <path d="M50 60 A100 100 0 0 1 250 60" stroke="#A7F3D0" strokeWidth={10} fill="none" opacity={0.7} />
          {groundShadow(198, 366, 58)}
          <g transform="translate(190 320) rotate(-6)" strokeLinejoin="round">
            <ellipse cx={0} cy={4} rx={50} ry={36} fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2.5} />
            <path d="M-46 -14 Q-64 -46 -38 -60 Q-14 -50 -22 -20 Z" fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2.5} />
            <circle cx={-38} cy={-32} r={22} fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2.5} />
            <ellipse cx={-56} cy={-24} rx={13} ry={9} fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2} />
            <polygon points="-46,-52 -38,-80 -30,-52" fill="url(#uni-horn)" stroke="#B45309" strokeWidth={2} />
            <polygon points="-24,-52 -18,-68 -12,-52" fill="url(#uni-body)" stroke="#C4B5FD" strokeWidth={2} />
            {[-10, 2, 14, 26].map((dy, i) => (
              <path
                key={i}
                d={`M-32 ${-38 + dy} q -26 8 -14 30`}
                stroke={['#F472B6', '#C4B5FD', '#93C5FD', '#FDE68A'][i]}
                strokeWidth={9}
                fill="none"
                strokeLinecap="round"
              />
            ))}
            {sparkleEye(-45, -31, 9.5)}
            {blush(-58, -16, 7)}
            <path d="M-62 -22 q -4 3 0 6" stroke="#C2793F" strokeWidth={2} fill="none" strokeLinecap="round" />
            <line x1={-25} y1={34} x2={-25} y2={54} stroke="url(#uni-body)" strokeWidth={9} strokeLinecap="round" />
            <line x1={0} y1={36} x2={0} y2={56} stroke="url(#uni-body)" strokeWidth={9} strokeLinecap="round" />
            <line x1={25} y1={34} x2={25} y2={54} stroke="url(#uni-body)" strokeWidth={9} strokeLinecap="round" />
          </g>
          {[[40, 90], [230, 140], [60, 250], [260, 260]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 6, 3)} fill="#ffffff" opacity={0.85} />
          ))}
        </svg>
      )
    case 'dorado':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <g opacity={0.9}>
            <circle cx={150} cy={330} r={70} fill="none" stroke="#D4AF6A" strokeWidth={3} />
            <circle cx={150} cy={330} r={58} fill="none" stroke="#D4AF6A" strokeWidth={1.5} />
            <circle cx={150} cy={330} r={82} fill="none" stroke="#D4AF6A" strokeWidth={1} opacity={0.6} />
          </g>
          {[[40, 60], [260, 90], [230, 200], [50, 220], [270, 300], [30, 340]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 === 0 ? 5 : 3, 2)} fill="#D4AF6A" opacity={0.85} />
          ))}
          <path d="M0 40 h300 M0 44 h300" stroke="#D4AF6A" strokeWidth={0.5} opacity={0.3} />
        </svg>
      )
    case 'floral':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[[45, 350, 1], [255, 55, 0.8], [255, 360, 0.65]].map(([cx, cy, scale], i) => (
            <g key={i} transform={`translate(${cx} ${cy}) scale(${scale})`}>
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <ellipse key={deg} cx={0} cy={-16} rx={10} ry={16} fill={['#FBCFE8', '#FDBA74', '#FECDD3'][deg / 60] ?? '#FBCFE8'} opacity={0.9} transform={`rotate(${deg})`} />
              ))}
              <circle cx={0} cy={0} r={8} fill="#FDE68A" />
            </g>
          ))}
          <path d="M45 380 q -6 -40 10 -70" stroke="#86EFAC" strokeWidth={3} fill="none" opacity={0.8} />
          <path d="M255 90 q 10 30 -4 55" stroke="#86EFAC" strokeWidth={3} fill="none" opacity={0.8} />
          {[[150, 70], [90, 130], [210, 260]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.5} fill="#FDBA74" opacity={0.7} />
          ))}
        </svg>
      )
    case 'celeste':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[[70, 350, 1], [230, 60, 0.8], [40, 90, 0.6]].map(([cx, cy, scale], i) => (
            <g key={i} transform={`translate(${cx} ${cy}) scale(${scale})`} fill="#ffffff" opacity={0.85}>
              <circle cx={-24} cy={0} r={20} />
              <circle cx={0} cy={-10} r={26} />
              <circle cx={26} cy={0} r={20} />
              <rect x={-26} y={0} width={78} height={20} rx={10} />
            </g>
          ))}
          {[[150, 140], [200, 200], [90, 220], [250, 300], [30, 260]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 5, 2)} fill="#ffffff" opacity={0.9} />
          ))}
        </svg>
      )
    case 'disco':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <clipPath id="disco-ball-clip">
              <circle r={36} />
            </clipPath>
          </defs>
          {/* Bola de espejos de verdad (esfera + rejilla de facetas), no
              una diana — la primera versión con anillos concéntricos no
              se leía como bola de discoteca. Va a la esquina (no
              centrada arriba) porque el emoji del tipo de evento
              también se coloca ahí por defecto — bug real visto
              probando en vivo, se pisaban los dos. */}
          <g transform="translate(228 80) scale(0.8)">
            <line x1={0} y1={-70} x2={0} y2={-37} stroke="#ffffff" strokeWidth={1.5} opacity={0.6} />
            {[['#F472B6', -34], ['#38BDF8', 0], ['#FBBF24', 34]].map(([color, dx], i) => (
              <polygon key={i} points={`0,0 ${(dx as number) - 10},120 ${(dx as number) + 10},120`} fill={color as string} opacity={0.14} />
            ))}
            <circle r={36} fill="#CBD5F5" />
            <g clipPath="url(#disco-ball-clip)">
              {[-27, -18, -9, 0, 9, 18, 27].map((y) => (
                <line key={`h${y}`} x1={-36} y1={y} x2={36} y2={y} stroke="#7C86B8" strokeWidth={1} opacity={0.55} />
              ))}
              {Array.from({ length: 10 }).map((_, i) => {
                const x = -45 + i * 10
                return <line key={`d1${i}`} x1={x} y1={-40} x2={x + 18} y2={40} stroke="#7C86B8" strokeWidth={0.8} opacity={0.45} />
              })}
              {Array.from({ length: 10 }).map((_, i) => {
                const x = -45 + i * 10
                return <line key={`d2${i}`} x1={x} y1={40} x2={x + 18} y2={-40} stroke="#7C86B8" strokeWidth={0.8} opacity={0.45} />
              })}
            </g>
            <circle r={36} fill="none" stroke="#ffffff" strokeWidth={1} opacity={0.4} />
            <ellipse cx={-11} cy={-13} rx={11} ry={6} fill="#ffffff" opacity={0.55} transform="rotate(-25 -11 -13)" />
          </g>
          {[[40, 200], [260, 230], [70, 320], [230, 340], [30, 60], [270, 130]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 === 0 ? 8 : 5, 3)} fill="#ffffff" opacity={0.85} />
          ))}
        </svg>
      )
    case 'dinosaurios':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {/* Silueta de cuello largo (tipo braquiosaurio) — se lee mucho
              mejor a tamaño pequeño que una forma libre; la primera
              versión con un path complejo parecía una mancha. */}
          <defs>
            <MascotGradient id="dino-body" light="#A3E635" dark="#4D7C0F" />
            <MascotGradient id="dino-belly" light="#FEF9C3" dark="#FDE68A" />
          </defs>
          {groundShadow(110, 402, 66)}
          <g transform="translate(100 355) scale(0.62)" strokeLinejoin="round">
            <path d="M50 15 Q95 -5 85 25 Q72 18 50 28 Z" fill="url(#dino-body)" stroke="#365314" strokeWidth={3} />
            <ellipse cx={0} cy={15} rx={58} ry={34} fill="url(#dino-body)" stroke="#365314" strokeWidth={3} />
            <ellipse cx={0} cy={28} rx={34} ry={16} fill="url(#dino-belly)" />
            <ellipse cx={-68} cy={-28} rx={15} ry={36} fill="url(#dino-body)" stroke="#365314" strokeWidth={3} transform="rotate(-22 -68 -28)" />
            <circle cx={-92} cy={-56} r={19} fill="url(#dino-body)" stroke="#365314" strokeWidth={3} />
            {sparkleEye(-97, -60, 7)}
            {blush(-84, -48, 6)}
            {[-25, -5, 15].map((x, i) => (
              <polygon key={i} points={`${x},-10 ${x + 10},-26 ${x + 20},-10`} fill="url(#dino-belly)" stroke="#365314" strokeWidth={2} />
            ))}
            {[-32, -6, 22, 40].map((x, i) => (
              <ellipse key={i} cx={x} cy={44} rx={10} ry={16} fill="url(#dino-body)" stroke="#365314" strokeWidth={2.5} />
            ))}
          </g>
          {[[220, 90], [250, 130], [200, 60]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx={7} ry={4} fill="#4D7C0F" opacity={0.6} transform={`rotate(${i * 30} ${x} ${y})`} />
          ))}
          {[[250, 340], [270, 310], [235, 365]].map(([x, y], i) => (
            <path key={i} d={`M${x} ${y} q -6 -10 0 -18 q 6 8 0 18`} fill="#166534" opacity={0.5} />
          ))}
        </svg>
      )
    case 'videojuegos':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {/* Mando genérico (D-pad + botones) — sin logotipo ni forma de
              ninguna marca concreta, no es ninguna videoconsola real. */}
          <g transform="translate(230 340)">
            <rect x={-55} y={-30} width={110} height={60} rx={28} fill="#A78BFA" opacity={0.9} />
            <rect x={-40} y={-7} width={24} height={8} fill="#312E81" />
            <rect x={-32} y={-15} width={8} height={24} fill="#312E81" />
            <circle cx={30} cy={-8} r={6} fill="#4ADE80" />
            <circle cx={44} cy={2} r={6} fill="#F472B6" />
          </g>
          {[[40, 70], [90, 50], [60, 110], [30, 140]].map(([x, y], i) => (
            <rect key={i} x={x - 5} y={y - 5} width={10} height={10} fill={['#4ADE80', '#F472B6', '#FBBF24', '#38BDF8'][i]} opacity={0.85} />
          ))}
          {[[260, 200], [50, 300], [230, 100]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 7, 3)} fill="#FBBF24" opacity={0.8} />
          ))}
        </svg>
      )
    case 'corazones':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[[50, 340, 1], [250, 70, 0.7], [235, 330, 0.55], [55, 80, 0.5]].map(([x, y, s], i) => (
            <path
              key={i}
              d={`M${x} ${(y as number) + 14 * (s as number)} C${(x as number) - 26 * (s as number)} ${(y as number) - 8 * (s as number)} ${(x as number) - 14 * (s as number)} ${(y as number) - 26 * (s as number)} ${x} ${(y as number) - 10 * (s as number)} C${(x as number) + 14 * (s as number)} ${(y as number) - 26 * (s as number)} ${(x as number) + 26 * (s as number)} ${(y as number) - 8 * (s as number)} ${x} ${(y as number) + 14 * (s as number)} Z`}
              fill="#ffffff"
              opacity={0.9}
            />
          ))}
          {[[150, 150], [90, 220], [210, 250], [170, 40]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 5, 2)} fill="#ffffff" opacity={0.6} />
          ))}
        </svg>
      )
    case 'ositos':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="bear-fur" light="#E8C39E" dark="#B98756" />
            <MascotGradient id="bear-fur-dark" light="#C89666" dark="#9C6B3E" />
          </defs>
          {groundShadow(60, 415, 64)}
          <g transform="translate(60 355) scale(0.62)" strokeLinejoin="round">
            <ellipse cx={0} cy={40} rx={54} ry={48} fill="url(#bear-fur-dark)" stroke="#6B4423" strokeWidth={3} />
            <circle cx={-40} cy={30} r={17} fill="url(#bear-fur-dark)" stroke="#6B4423" strokeWidth={2.5} />
            <circle cx={40} cy={30} r={17} fill="url(#bear-fur-dark)" stroke="#6B4423" strokeWidth={2.5} />
            <circle cx={-38} cy={-70} r={17} fill="url(#bear-fur)" stroke="#6B4423" strokeWidth={2.5} />
            <circle cx={38} cy={-70} r={17} fill="url(#bear-fur)" stroke="#6B4423" strokeWidth={2.5} />
            <circle cx={-38} cy={-70} r={8} fill="#F4A9C0" />
            <circle cx={38} cy={-70} r={8} fill="#F4A9C0" />
            <circle cx={0} cy={-40} r={50} fill="url(#bear-fur)" stroke="#6B4423" strokeWidth={3} />
            {blush(-32, -22, 10)}
            {blush(32, -22, 10)}
            {sparkleEye(-17, -46, 9)}
            {sparkleEye(17, -46, 9)}
            <ellipse cx={0} cy={-24} rx={16} ry={12} fill="#FBF3E3" stroke="#6B4423" strokeWidth={2} />
            <ellipse cx={0} cy={-28} rx={6} ry={4.5} fill="#3F2A16" />
            <path d="M0 -23 v6 M-9 -1 Q0 8 9 -1" stroke="#6B4423" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          </g>
          {[[230, 300], [255, 340], [210, 350]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx={6} ry={9} fill="#ffffff" opacity={0.7} transform={`rotate(${i * 25} ${x} ${y})`} />
          ))}
          {[[240, 90], [60, 60], [200, 140]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 5, 2)} fill="#ffffff" opacity={0.6} />
          ))}
        </svg>
      )
    case 'gatitos':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="cat-fur" light="#F5F3FF" dark="#C4B5FD" />
          </defs>
          {groundShadow(250, 400, 58)}
          <g transform="translate(250 350) scale(0.72)" strokeLinejoin="round">
            <path d="M38 20 Q64 8 56 -22" stroke="url(#cat-fur)" strokeWidth={15} fill="none" strokeLinecap="round" />
            <ellipse cx={0} cy={16} rx={42} ry={34} fill="url(#cat-fur)" stroke="#8B7BC7" strokeWidth={2.5} />
            {[-1, 1].map((s) => (
              <ellipse key={s} cx={s * 22} cy={44} rx={11} ry={8} fill="#ffffff" stroke="#8B7BC7" strokeWidth={2} />
            ))}
            <circle cx={0} cy={-34} r={32} fill="url(#cat-fur)" stroke="#8B7BC7" strokeWidth={2.5} />
            <polygon points="-26,-56 -8,-58 -15,-80" fill="url(#cat-fur)" stroke="#8B7BC7" strokeWidth={2.5} />
            <polygon points="8,-58 26,-56 15,-80" fill="url(#cat-fur)" stroke="#8B7BC7" strokeWidth={2.5} />
            <polygon points="-20,-58 -11,-59 -15,-73" fill="#F9A8D4" />
            <polygon points="11,-59 20,-58 15,-73" fill="#F9A8D4" />
            {blush(-24, -18, 8)}
            {blush(24, -18, 8)}
            {sparkleEye(-14, -34, 10)}
            {sparkleEye(14, -34, 10)}
            <path d="M0 -22 q -5 5 0 8 q 5 -3 0 -8" fill="#F9A8D4" stroke="#8B7BC7" strokeWidth={1} />
            <path d="M-4 -14 Q0 -9 4 -14" stroke="#6D28D9" strokeWidth={2} fill="none" strokeLinecap="round" />
            {[-1, 1].map((s) => (
              <g key={s} opacity={0.6}>
                <line x1={s * 6} y1={-20} x2={s * 30} y2={-24} stroke="#6D28D9" strokeWidth={1.2} />
                <line x1={s * 6} y1={-16} x2={s * 30} y2={-16} stroke="#6D28D9" strokeWidth={1.2} />
              </g>
            ))}
          </g>
          {[[40, 80], [70, 130], [30, 200]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx={10} ry={7} fill="#ffffff" opacity={0.5} />
          ))}
          <circle cx={50} cy={330} r={16} fill="none" stroke="#ffffff" strokeWidth={4} opacity={0.6} />
        </svg>
      )
    case 'coches':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <g opacity={0.9}>
            {Array.from({ length: 20 }).map((_, i) => (
              <rect key={i} x={(i % 10) * 30} y={i < 10 ? 0 : 16} width={30} height={16} fill={(i + Math.floor(i / 10)) % 2 === 0 ? '#ffffff' : '#1F2937'} />
            ))}
          </g>
          <g transform="translate(210 340)">
            <rect x={-60} y={-18} width={120} height={30} rx={12} fill="#DC2626" />
            <polygon points="-30,-18 -10,-38 40,-38 50,-18" fill="#DC2626" />
            <rect x={-8} y={-33} width={40} height={16} fill="#BFDBFE" opacity={0.8} />
            <circle cx={-32} cy={14} r={14} fill="#1F2937" />
            <circle cx={-32} cy={14} r={5} fill="#9CA3AF" />
            <circle cx={38} cy={14} r={14} fill="#1F2937" />
            <circle cx={38} cy={14} r={5} fill="#9CA3AF" />
          </g>
          {[0, 1, 2].map((i) => (
            <line key={i} x1={20} y1={330 + i * 12} x2={70} y2={330 + i * 12} stroke="#ffffff" strokeWidth={3} opacity={0.5} />
          ))}
          {[[240, 250], [40, 120], [260, 160]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 6, 3)} fill="#ffffff" opacity={0.8} />
          ))}
        </svg>
      )
    case 'robots':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="robot-body" light="#F1F5F9" dark="#94A3B8" />
            <MascotGradient id="robot-head" light="#E2E8F0" dark="#64748B" />
            <radialGradient id="robot-eye" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#FDE68A" />
              <stop offset="100%" stopColor="#F59E0B" />
            </radialGradient>
          </defs>
          {groundShadow(230, 388, 56)}
          <g transform="translate(230 350) scale(0.78)" strokeLinejoin="round">
            <line x1={0} y1={-90} x2={0} y2={-72} stroke="#94A3B8" strokeWidth={3} />
            <circle cx={0} cy={-96} r={7} fill="url(#robot-eye)" stroke="#B45309" strokeWidth={1.5} />
            <rect x={-36} y={-72} width={72} height={52} rx={14} fill="url(#robot-head)" stroke="#475569" strokeWidth={2.5} />
            <circle cx={-16} cy={-48} r={10} fill="url(#robot-eye)" stroke="#B45309" strokeWidth={1.5} />
            <circle cx={16} cy={-48} r={10} fill="url(#robot-eye)" stroke="#B45309" strokeWidth={1.5} />
            <circle cx={-18} cy={-51} r={3} fill="#ffffff" opacity={0.85} />
            <circle cx={14} cy={-51} r={3} fill="#ffffff" opacity={0.85} />
            <path d="M-10 -28 Q0 -21 10 -28" stroke="#475569" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <rect x={-44} y={-14} width={88} height={62} rx={14} fill="url(#robot-body)" stroke="#475569" strokeWidth={2.5} />
            <rect x={-18} y={8} width={36} height={22} rx={5} fill="#475569" />
            <circle cx={0} cy={19} r={7} fill="url(#robot-eye)" stroke="#B45309" strokeWidth={1.5} />
            <circle cx={-30} cy={2} r={4} fill="#CBD5E1" stroke="#64748B" strokeWidth={1} />
            <circle cx={30} cy={2} r={4} fill="#CBD5E1" stroke="#64748B" strokeWidth={1} />
            <rect x={-58} y={-8} width={16} height={38} rx={7} fill="url(#robot-body)" stroke="#475569" strokeWidth={2} />
            <rect x={42} y={-8} width={16} height={38} rx={7} fill="url(#robot-body)" stroke="#475569" strokeWidth={2} />
            <rect x={-26} y={48} width={18} height={28} rx={5} fill="url(#robot-head)" stroke="#475569" strokeWidth={2} />
            <rect x={8} y={48} width={18} height={28} rx={5} fill="url(#robot-head)" stroke="#475569" strokeWidth={2} />
          </g>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={40 + i * 14} cy={340} r={4} fill="none" stroke="#CBD5E1" strokeWidth={2} opacity={0.6} />
          ))}
          <path d="M40 320 h60 M70 320 v-30 M40 250 h30" stroke="#CBD5E1" strokeWidth={2} fill="none" opacity={0.35} />
          {[[260, 240], [40, 100], [220, 80]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, 6, 3)} fill="#FBBF24" opacity={0.75} />
          ))}
        </svg>
      )
    case 'superheroe':
      return (
        <svg {...common} viewBox="0 0 300 400">
          {/* Superhéroe infantil genérico (cara redonda, antifaz,
              estrella en el pecho) — sin ningún emblema ni color de una
              franquicia concreta, para no evocar a ningún personaje con
              copyright. La primera versión era una silueta sin cara y
              no resultaba nada entrañable. */}
          <defs>
            <MascotGradient id="hero-cape" light="#EF4444" dark="#B91C1C" />
            <MascotGradient id="hero-suit" light="#3B82F6" dark="#1E3A8A" />
            <MascotGradient id="hero-skin" light="#FDE0C4" dark="#F2B681" />
          </defs>
          {groundShadow(70, 375, 52)}
          <g transform="translate(70 340) scale(0.66)" strokeLinejoin="round">
            <path d="M-30 -10 Q-70 20 -55 90 Q-30 60 -15 70 Z" fill="url(#hero-cape)" stroke="#7F1D1D" strokeWidth={2.5} />
            <path d="M30 -10 Q70 20 55 90 Q30 60 15 70 Z" fill="url(#hero-cape)" stroke="#7F1D1D" strokeWidth={2.5} />
            <path d="M-32 20 Q-38 70 0 82 Q38 70 32 20 Q0 34 -32 20 Z" fill="url(#hero-suit)" stroke="#1E3A8A" strokeWidth={2.5} />
            <path d={starPath(0, 48, 13, 6)} fill="#FDE68A" />
            <circle cx={0} cy={-18} r={34} fill="url(#hero-skin)" stroke="#C2793F" strokeWidth={2.5} />
            <path d="M-34 -22 Q0 -46 34 -22 L30 -8 Q0 -26 -30 -8 Z" fill="url(#hero-suit)" stroke="#1E3A8A" strokeWidth={2.5} />
            {sparkleEye(-13, -14, 9)}
            {sparkleEye(13, -14, 9)}
            {blush(-20, -2, 7)}
            {blush(20, -2, 7)}
            <path d="M-10 4 Q0 12 10 4" stroke="#B45309" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <circle cx={-46} cy={30} r={13} fill="url(#hero-skin)" stroke="#C2793F" strokeWidth={2} />
            <path d="M28 30 Q52 4 46 -16" stroke="url(#hero-suit)" strokeWidth={17} fill="none" strokeLinecap="round" />
            <circle cx={46} cy={-18} r={13} fill="url(#hero-skin)" stroke="#C2793F" strokeWidth={2} />
          </g>
          {[[240, 90], [60, 60], [255, 230]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i === 0 ? 16 : 9, i === 0 ? 7 : 4)} fill="#FDE68A" opacity={0.85} />
          ))}
        </svg>
      )
    case 'superheroina':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <defs>
            <MascotGradient id="heroina-cape" light="#F472B6" dark="#BE185D" />
            <MascotGradient id="heroina-suit" light="#A78BFA" dark="#6D28D9" />
            <MascotGradient id="heroina-skin" light="#FDE0C4" dark="#F2B681" />
            <MascotGradient id="heroina-hair" light="#7C3AED" dark="#4C1D95" />
          </defs>
          {groundShadow(230, 375, 52)}
          <g transform="translate(230 340) scale(0.66)" strokeLinejoin="round">
            <path d="M-30 -14 Q-70 16 -55 86 Q-30 56 -15 66 Z" fill="url(#heroina-cape)" stroke="#9D174D" strokeWidth={2.5} />
            <path d="M30 -14 Q70 16 55 86 Q30 56 15 66 Z" fill="url(#heroina-cape)" stroke="#9D174D" strokeWidth={2.5} />
            <path d="M-30 18 Q-36 66 0 78 Q36 66 30 18 Q0 32 -30 18 Z" fill="url(#heroina-suit)" stroke="#5B21B6" strokeWidth={2.5} />
            <path d={starPath(0, 44, 12, 5.5)} fill="#FBCFE8" />
            <path d="M-34 -46 Q0 -66 34 -46 Q40 0 24 22 Q0 4 -24 22 Q-40 0 -34 -46 Z" fill="url(#heroina-hair)" />
            <circle cx={0} cy={-20} r={32} fill="url(#heroina-skin)" stroke="#C2793F" strokeWidth={2.5} />
            <path d="M-32 -24 Q0 -44 32 -24 L28 -10 Q0 -26 -28 -10 Z" fill="url(#heroina-suit)" stroke="#5B21B6" strokeWidth={2.5} />
            {sparkleEye(-12, -16, 8.5)}
            {sparkleEye(12, -16, 8.5)}
            {blush(-19, -4, 6.5)}
            {blush(19, -4, 6.5)}
            <path d="M-9 2 Q0 9 9 2" stroke="#B45309" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <circle cx={-28} cy={-40} r={9} fill="url(#heroina-hair)" />
            <circle cx={28} cy={-40} r={9} fill="url(#heroina-hair)" />
            <circle cx={44} cy={28} r={12} fill="url(#heroina-skin)" stroke="#C2793F" strokeWidth={2} />
            <path d="M-26 28 Q-50 2 -44 -18" stroke="url(#heroina-suit)" strokeWidth={16} fill="none" strokeLinecap="round" />
            <circle cx={-44} cy={-18} r={12} fill="url(#heroina-skin)" stroke="#C2793F" strokeWidth={2} />
          </g>
          {[[50, 90], [230, 60], [45, 230]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i === 0 ? 16 : 9, i === 0 ? 7 : 4)} fill="#FBCFE8" opacity={0.85} />
          ))}
        </svg>
      )
    case 'pijamas':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <g transform="translate(230 90)">
            <path d="M30 -30 A38 38 0 1 0 32 40 A30 30 0 1 1 30 -30 Z" fill="#FDE68A" opacity={0.9} />
          </g>
          {[[70, 60], [180, 40], [60, 150], [250, 200], [90, 250], [220, 300]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 === 0 ? 8 : 5, 3)} fill="#ffffff" opacity={0.85} />
          ))}
          <g transform="translate(70 350)" opacity={0.9}>
            <path d="M-45 0 Q-45 -30 0 -30 Q45 -30 45 0 Z" fill="#818CF8" />
            <rect x={-45} y={0} width={90} height={14} rx={4} fill="#6366F1" />
          </g>
          <text x={165} y={330} fontSize={26} fill="#ffffff" opacity={0.7} fontFamily="inherit">
            Zzz
          </text>
        </svg>
      )
    case 'kpop':
      return (
        <svg {...common} viewBox="0 0 300 400">
          <g opacity={0.25}>
            {[60, 150, 240].map((x, i) => (
              <polygon key={i} points={`${x},0 ${x - 40},400 ${x + 40},400`} fill={['#F472B6', '#A78BFA', '#38BDF8'][i]} />
            ))}
          </g>
          <g transform="translate(150 335)">
            <ellipse cx={0} cy={-38} rx={14} ry={18} fill="#F5D0FE" />
            <rect x={-3} y={-20} width={6} height={26} fill="#E9D5FF" />
            <path d="M-16 6 L16 6 L10 16 L-10 16 Z" fill="#E9D5FF" />
            {Array.from({ length: 10 }).map((_, i) => (
              <line key={i} x1={0} y1={-56} x2={Math.cos((Math.PI * i) / 9 - Math.PI) * 15} y2={-56 + Math.sin((Math.PI * i) / 9 - Math.PI) * 15} stroke="#F5D0FE" strokeWidth={1} />
            ))}
          </g>
          {[[60, 80], [230, 120], [80, 260], [240, 300], [40, 340]].map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 === 0 ? 7 : 5, 3)} fill="#ffffff" opacity={0.85} />
          ))}
          {[[190, 200], [110, 150]].map(([x, y], i) => (
            <text key={i} x={x} y={y} fontSize={20} fill="#ffffff" opacity={0.75}>
              ♪
            </text>
          ))}
        </svg>
      )
    case 'confeti':
    default:
      return (
        <svg {...common} viewBox="0 0 300 400">
          {[
            [30, 40, '#F472B6', 'c'],
            [270, 70, '#FBBF24', 't'],
            [250, 340, '#34D399', 'c'],
            [40, 330, '#7C3AED', 's'],
            [150, 30, '#FBBF24', 's'],
            [90, 370, '#F472B6', 't'],
            [220, 190, '#34D399', 'c'],
            [60, 190, '#7C3AED', 't'],
          ].map(([x, y, color, shape], i) =>
            shape === 'c' ? (
              <circle key={i} cx={x as number} cy={y as number} r={5} fill={color as string} opacity={0.8} />
            ) : shape === 's' ? (
              <rect key={i} x={(x as number) - 4} y={(y as number) - 4} width={8} height={8} rx={2} fill={color as string} opacity={0.8} transform={`rotate(20 ${x} ${y})`} />
            ) : (
              <polygon key={i} points={`${x as number},${(y as number) - 6} ${(x as number) + 6},${(y as number) + 5} ${(x as number) - 6},${(y as number) + 5}`} fill={color as string} opacity={0.8} />
            ),
          )}
        </svg>
      )
  }
}

function starPath(cx: number, cy: number, outerR: number, innerR: number): string {
  let d = ''
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const a = (Math.PI * i) / 4 - Math.PI / 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    d += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' '
  }
  return d + 'Z'
}

function ballPentagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 5 })
    .map((_, k) => {
      const a = (Math.PI * 2 * k) / 5 - Math.PI / 2
      return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`
    })
    .join(' ')
}

// Petición real: "deberían ser más elaborados, especialmente los
// personajes... que gusten tanto a niños como a padres" — degradado
// suave (esfera con luz), contorno tipo pegatina, sombra en el suelo,
// brillo en el ojo y mofletes sonrosados, en vez de formas planas de un
// solo color. Se reutiliza en todas las mascotas (monstruo, osito,
// gatito, dinosaurio, unicornio, superhéroes, robot).
function MascotGradient({ id, light, dark }: { id: string; light: string; dark: string }) {
  return (
    <radialGradient id={id} cx="32%" cy="26%" r="80%">
      <stop offset="0%" stopColor={light} />
      <stop offset="100%" stopColor={dark} />
    </radialGradient>
  )
}

function groundShadow(cx: number, cy: number, rx: number) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.26} fill="#000000" opacity={0.15} />
}

function sparkleEye(cx: number, cy: number, r: number, pupil = '#1F2937') {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#ffffff" />
      <circle cx={cx} cy={cy} r={r * 0.62} fill={pupil} />
      <circle cx={cx - r * 0.28} cy={cy - r * 0.28} r={r * 0.24} fill="#ffffff" />
    </g>
  )
}

function blush(cx: number, cy: number, r: number, color = '#F472B6') {
  return <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.68} fill={color} opacity={0.4} />
}

// Petición real: "obras de arte" — cuando la plantilla trae una imagen
// propia (template.image, encargada fuera con licencia en regla), se
// usa esa foto en vez del dibujo SVG; si no, cae al arte por reglas de
// siempre. Mismo sitio para el editor y para la vista previa de solo
// lectura, así no hay que tocar dos veces cuando llegue cada imagen.
function InvitationBackground({ templateKey }: { templateKey: string | null }) {
  const template = INVITATION_TEMPLATES.find((t) => t.key === templateKey)
  if (template?.image) {
    return <img src={template.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  }
  return <InvitationBackgroundArt artKey={template?.artKey ?? 'confeti'} />
}

// Petición real: "no quiero que vean todos esos chips para empezar" —
// con 96 temas, una fila de chips que se envuelve obliga a repasarlos
// todos. En su lugar: un botón que abre una rueda horizontal de
// miniaturas (ya en el orden de sortInvitationTemplatesForEvent, más
// probable primero) que se desliza con el dedo — scroll nativo con
// scroll-snap, sin librería de gestos — y un toque selecciona y cierra.
function InvitationTemplatePicker({
  templates,
  selectedKey,
  onSelect,
}: {
  templates: InvitationTemplateMeta[]
  selectedKey: string
  onSelect: (template: InvitationTemplateMeta) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = templates.find((t) => t.key === selectedKey) ?? templates[0]
  const selectedThumbRef = useRef<HTMLButtonElement>(null)
  const didCenterOnce = useRef(false)

  // Petición real: "que la rueda vuelva a abrirse donde te quedaste, no
  // de nuevo al principio" — la rueda se queda siempre montada (solo se
  // oculta con display:none) para que el navegador conserve el scroll
  // entre un cierre y la siguiente apertura; lo único que se hace a
  // mano es centrar la seleccionada la primera vez que aparece.
  useEffect(() => {
    if (open && !didCenterOnce.current) {
      didCenterOnce.current = true
      selectedThumbRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
    }
  }, [open])

  return (
    <div className="invitation-template-picker">
      <button type="button" className="invitation-template-toggle" onClick={() => setOpen((v) => !v)}>
        🎨 Elige tu plantilla — {selected.label} {open ? '▲' : '▼'}
      </button>
      <div className="invitation-template-carousel" style={{ display: open ? 'flex' : 'none' }}>
        {templates.map((t) => (
          <button
            key={t.key}
            type="button"
            ref={t.key === selectedKey ? selectedThumbRef : undefined}
            className={'invitation-template-thumb' + (t.key === selectedKey ? ' invitation-template-thumb-active' : '')}
            onClick={() => {
              onSelect(t)
              setOpen(false)
            }}
          >
            <span className="invitation-template-thumb-preview">
              <InvitationBackground templateKey={t.key} />
            </span>
            <span className="invitation-template-thumb-label">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function InvitationCanvasView({
  canvas,
  templateKey,
  photoUrls,
  backgroundImageUrl,
}: {
  canvas: InvitationCanvas
  templateKey: string | null
  photoUrls: Record<string, string>
  backgroundImageUrl?: string | null
}) {
  const template = INVITATION_TEMPLATES.find((t) => t.key === templateKey)
  const aspectRatio = !backgroundImageUrl && template?.imageAspect ? `${template.imageAspect} / 1` : '3 / 4'
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio,
        borderRadius: 16,
        overflow: 'hidden',
        background: canvas.backgroundGradient || INVITATION_TEMPLATES[0].gradient,
      }}
    >
      {backgroundImageUrl ? (
        <img
          src={backgroundImageUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `translate(${(canvas.backgroundOffsetX ?? 0) * 100}%, ${(canvas.backgroundOffsetY ?? 0) * 100}%) scale(${canvas.backgroundScale ?? 1})`,
          }}
        />
      ) : (
        <InvitationBackground templateKey={templateKey} />
      )}
      {canvas.layers
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((layer) => (
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              left: `${layer.x * 100}%`,
              top: `${layer.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
            }}
          >
            <InvitationLayerVisual layer={layer} photoUrls={photoUrls} />
          </div>
        ))}
    </div>
  )
}

const LAYER_COLOR_PRESETS = ['#ffffff', '#1f2233', '#4C6EF5', '#F472B6', '#FBBF24', '#34D399']
const LAYER_FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'inherit', label: 'Normal' },
  { value: 'Georgia, serif', label: 'Con serifa' },
  { value: '"Brush Script MT", cursive', label: 'Manuscrita' },
]

const TEXT_STYLE_OPTIONS: { value: InvitationTextStyle; label: string }[] = [
  { value: '3d', label: '🧊 3D' },
  { value: 'sparkle', label: '✨ Purpurina' },
  { value: 'rainbow_static', label: '🌈 Arcoíris fijo' },
  { value: 'rainbow_animated', label: '🌈 Arcoíris animado' },
  { value: 'iridescent', label: '🌟 Iridiscente' },
  { value: 'metallic', label: '🥈 Metalizado' },
]

interface DragState {
  mode: 'move' | 'transform'
  layerId: string
  // 'move'
  startClientX?: number
  startClientY?: number
  rectW?: number
  rectH?: number
  x0?: number
  y0?: number
  // 'transform'
  centerPx?: { x: number; y: number }
  dist0?: number
  angle0?: number
  scale0?: number
  rotation0?: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function InvitationCanvasEditor({ event, onClose, onSaved }: { event: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const sortedTemplates = useMemo(() => sortInvitationTemplatesForEvent(INVITATION_TEMPLATES, event), [event])
  const [templateKey, setTemplateKey] = useState(sortedTemplates[0].key)
  const [backgroundGradient, setBackgroundGradient] = useState(sortedTemplates[0].gradient)
  const [layers, setLayers] = useState<InvitationLayer[]>([])
  const [history, setHistory] = useState<InvitationLayer[][]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  // Petición real: "que cualquier usuario pueda importar una imagen
  // que le guste para hacer la invitación" — foto de fondo A PANTALLA
  // COMPLETA (distinta de "+ Foto", que añade una capa suelta movible)
  // — sustituye al degradado/dibujo de la plantilla, guardada en
  // event_invitations.background_image_path (columna ya existía desde
  // la Fase 0, sin usar hasta ahora).
  const [backgroundImagePath, setBackgroundImagePath] = useState<string | null>(null)
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null)
  // Petición real: "que se pueda ajustar el tamaño del fondo con los
  // dedos, con un botón ajustar fondo que sea editable si está marcado
  // y cuando no lo está esté fijo" — arrastrar mueve, pellizcar con dos
  // dedos hace zoom; solo activo mientras adjustingBackground es true,
  // para no interferir con el arrastre normal de las capas de texto.
  const [backgroundOffsetX, setBackgroundOffsetX] = useState(0)
  const [backgroundOffsetY, setBackgroundOffsetY] = useState(0)
  const [backgroundScale, setBackgroundScale] = useState(1)
  const [adjustingBackground, setAdjustingBackground] = useState(false)
  const bgDragRef = useRef<{ pointers: Map<number, { x: number; y: number }>; startOffsetX: number; startOffsetY: number; startScale: number; startDist: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingBackground, setUploadingBackground] = useState(false)
  const [addMenu, setAddMenu] = useState<'emoji' | 'forma' | null>(null)
  const [customEmoji, setCustomEmoji] = useState('')
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    getEventInvitation(event.id)
      .then(async (invitation) => {
        // Antes miraba layers.length > 0 para decidir si había "algo
        // guardado" — pero un diseño guardado con la foto de fondo en
        // blanco a propósito (0 capas) volvía a rellenarse solo al
        // reabrir. Lo que importa es si existe fila guardada, no si
        // tiene capas.
        if (invitation) {
          setTemplateKey(invitation.templateKey || INVITATION_TEMPLATES[0].key)
          setBackgroundGradient(invitation.canvas.backgroundGradient || INVITATION_TEMPLATES[0].gradient)
          setLayers(invitation.canvas.layers)
          setBackgroundOffsetX(invitation.canvas.backgroundOffsetX ?? 0)
          setBackgroundOffsetY(invitation.canvas.backgroundOffsetY ?? 0)
          setBackgroundScale(invitation.canvas.backgroundScale ?? 1)
          if (invitation.backgroundImagePath) {
            setBackgroundImagePath(invitation.backgroundImagePath)
            getInvitationPhotoUrl(invitation.backgroundImagePath)
              .then(setBackgroundImageUrl)
              .catch(() => {})
          }
          const paths = invitation.canvas.layers.map((l) => l.photoPath).filter((p): p is string => !!p)
          const urls = await Promise.all(paths.map((p) => getInvitationPhotoUrl(p).catch(() => null)))
          const map: Record<string, string> = {}
          paths.forEach((p, i) => {
            if (urls[i]) map[p] = urls[i] as string
          })
          setPhotoUrls(map)
        } else {
          setLayers(buildInvitationTemplateLayers(event, sortedTemplates[0]))
        }
      })
      .catch((err) => setError(errorMessage(err, 'No se pudo cargar el diseño')))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  const selected = layers.find((l) => l.id === selectedId) ?? null

  function pushHistory() {
    setHistory((h) => [...h.slice(-19), layers])
  }

  function handleUndo() {
    if (history.length === 0) return
    setLayers(history[history.length - 1])
    setHistory((h) => h.slice(0, -1))
  }

  function updateSelected(patch: Partial<InvitationLayer>) {
    if (!selectedId) return
    setLayers((ls) => ls.map((l) => (l.id === selectedId ? { ...l, ...patch } : l)))
  }

  function handleAddLayer(layer: InvitationLayer) {
    pushHistory()
    const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex), 0)
    setLayers((ls) => [...ls, { ...layer, zIndex: maxZ + 1 }])
    setSelectedId(layer.id)
    setAddMenu(null)
  }

  function handleDuplicate() {
    if (!selected) return
    pushHistory()
    const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex), 0)
    const copy: InvitationLayer = { ...selected, id: `${selected.id}-copy-${Date.now()}`, x: clamp(selected.x + 0.05, 0, 1), y: clamp(selected.y + 0.05, 0, 1), zIndex: maxZ + 1 }
    setLayers((ls) => [...ls, copy])
    setSelectedId(copy.id)
  }

  function handleDeleteSelected() {
    if (!selectedId) return
    pushHistory()
    setLayers((ls) => ls.filter((l) => l.id !== selectedId))
    setSelectedId(null)
  }

  function handleReorder(direction: 1 | -1) {
    if (!selected) return
    pushHistory()
    const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex)
    const idx = sorted.findIndex((l) => l.id === selected.id)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const tmp = sorted[idx].zIndex
    sorted[idx].zIndex = sorted[swapIdx].zIndex
    sorted[swapIdx].zIndex = tmp
    setLayers(sorted)
  }

  function handleRestoreTemplate() {
    pushHistory()
    setLayers(buildInvitationTemplateLayers(event, INVITATION_TEMPLATES.find((t) => t.key === templateKey)))
    setSelectedId(null)
    setBackgroundImagePath(null)
    setBackgroundImageUrl(null)
    setBackgroundOffsetX(0)
    setBackgroundOffsetY(0)
    setBackgroundScale(1)
    setAdjustingBackground(false)
  }

  async function handleBackgroundPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingBackground(true)
    setError(null)
    try {
      const path = await uploadInvitationPhoto(event.id, file)
      const url = await getInvitationPhotoUrl(path)
      // Petición real: "para la foto subida debe ser editable de 0, ya
      // que es probable que sean plantillas que no sean nuestras y que
      // las quieran rellenar" — el icono/título/fecha que rellenamos
      // por defecto tiene sentido sobre nuestro propio arte, pero sobre
      // una plantilla ajena (traída de fuera) solo estorbaría. Se borra
      // solo la primera vez que se sube una foto de fondo, no en cada
      // cambio posterior, para no tirar un diseño ya empezado; se puede
      // deshacer con "↩️ Deshacer" si no era lo que querían.
      if (!backgroundImagePath) {
        pushHistory()
        setLayers([])
        setSelectedId(null)
      }
      setBackgroundImagePath(path)
      setBackgroundImageUrl(url)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo subir la foto de fondo'))
    } finally {
      setUploadingBackground(false)
    }
  }

  function handleRemoveBackgroundPhoto() {
    setBackgroundImagePath(null)
    setBackgroundImageUrl(null)
    setBackgroundOffsetX(0)
    setBackgroundOffsetY(0)
    setBackgroundScale(1)
    setAdjustingBackground(false)
  }

  // Un dedo mueve (pan), dos dedos hacen zoom (pinch) — solo mientras
  // "🔧 Ajustar fondo" está activo; si no, el fondo queda fijo y los
  // toques van a las capas de texto de siempre.
  function handleBackgroundPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!adjustingBackground) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    if (!bgDragRef.current) {
      bgDragRef.current = { pointers: new Map(), startOffsetX: backgroundOffsetX, startOffsetY: backgroundOffsetY, startScale: backgroundScale, startDist: 0 }
    }
    bgDragRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (bgDragRef.current.pointers.size === 2) {
      const pts = [...bgDragRef.current.pointers.values()]
      bgDragRef.current.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      bgDragRef.current.startScale = backgroundScale
    } else {
      bgDragRef.current.startOffsetX = backgroundOffsetX
      bgDragRef.current.startOffsetY = backgroundOffsetY
    }
  }

  function handleBackgroundPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = bgDragRef.current
    if (!drag || !drag.pointers.has(e.pointerId)) return
    e.stopPropagation()
    const prev = drag.pointers.get(e.pointerId)!
    drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...drag.pointers.values()]
    if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1
      setBackgroundScale(clamp(drag.startScale * (dist / drag.startDist), 1, 3))
    } else if (pts.length === 1 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const dx = (e.clientX - prev.x) / rect.width
      const dy = (e.clientY - prev.y) / rect.height
      setBackgroundOffsetX((x) => clamp(x + dx, -0.5, 0.5))
      setBackgroundOffsetY((y) => clamp(y + dy, -0.5, 0.5))
    }
  }

  function handleBackgroundPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    bgDragRef.current?.pointers.delete(e.pointerId)
    if (bgDragRef.current && bgDragRef.current.pointers.size === 0) bgDragRef.current = null
  }

  function handlePrettify() {
    pushHistory()
    setLayers((ls) => autoArrangeLayers(ls))
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingPhoto(true)
    setError(null)
    try {
      const path = await uploadInvitationPhoto(event.id, file)
      const url = await getInvitationPhotoUrl(path)
      setPhotoUrls((m) => ({ ...m, [path]: url }))
      handleAddLayer(makeInvitationLayer('photo', { photoPath: path, fontSize: 130, zIndex: 0 }))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo subir la foto'))
    } finally {
      setUploadingPhoto(false)
    }
  }

  function handleLayerPointerDown(e: ReactPointerEvent<HTMLDivElement>, layer: InvitationLayer) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory()
    setSelectedId(layer.id)
    const rect = canvasRef.current!.getBoundingClientRect()
    dragRef.current = { mode: 'move', layerId: layer.id, startClientX: e.clientX, startClientY: e.clientY, rectW: rect.width, rectH: rect.height, x0: layer.x, y0: layer.y }
  }

  function handleHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>, layer: InvitationLayer) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    pushHistory()
    setSelectedId(layer.id)
    const rect = canvasRef.current!.getBoundingClientRect()
    const centerPx = { x: rect.left + layer.x * rect.width, y: rect.top + layer.y * rect.height }
    const dx0 = e.clientX - centerPx.x
    const dy0 = e.clientY - centerPx.y
    dragRef.current = {
      mode: 'transform',
      layerId: layer.id,
      centerPx,
      dist0: Math.hypot(dx0, dy0) || 1,
      angle0: Math.atan2(dy0, dx0),
      scale0: layer.scale,
      rotation0: layer.rotation,
    }
  }

  function handleDragPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    if (d.mode === 'move') {
      const dx = (e.clientX - d.startClientX!) / d.rectW!
      const dy = (e.clientY - d.startClientY!) / d.rectH!
      setLayers((ls) => ls.map((l) => (l.id === d.layerId ? { ...l, x: clamp(d.x0! + dx, 0, 1), y: clamp(d.y0! + dy, 0, 1) } : l)))
    } else {
      const dx = e.clientX - d.centerPx!.x
      const dy = e.clientY - d.centerPx!.y
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      const newScale = clamp(d.scale0! * (dist / d.dist0!), 0.3, 3)
      const newRotation = d.rotation0! + (angle - d.angle0!) * (180 / Math.PI)
      setLayers((ls) => ls.map((l) => (l.id === d.layerId ? { ...l, scale: newScale, rotation: newRotation } : l)))
    }
  }

  function handleDragPointerUp() {
    dragRef.current = null
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveEventInvitation(event.id, templateKey, { backgroundGradient, layers, backgroundOffsetX, backgroundOffsetY, backgroundScale }, backgroundImagePath)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el diseño'))
    } finally {
      setSaving(false)
    }
  }

  const currentTemplate = INVITATION_TEMPLATES.find((t) => t.key === templateKey)
  const canvasAspectRatio = !backgroundImageUrl && currentTemplate?.imageAspect ? `${currentTemplate.imageAspect} / 1` : '3 / 4'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Diseño de la invitación
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : (
          <>
            <InvitationTemplatePicker
              templates={sortedTemplates}
              selectedKey={templateKey}
              onSelect={(t) => {
                setTemplateKey(t.key)
                setBackgroundGradient(t.gradient)
                // Petición real: "no quiero que el texto se salga de
                // ese área, habrá que ajustarlo tarjeta por tarjeta" —
                // si todavía son las 3 capas por defecto sin tocar,
                // recolocarlas en el hueco de la plantilla nueva;
                // si ya hay capas propias (añadidas, movidas, borradas...
                // el recuento ya no cuadra), se respetan tal cual.
                if (layers.length === 3) {
                  pushHistory()
                  setLayers(buildInvitationTemplateLayers(event, t))
                }
              }}
            />
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              O usa tu propia foto como fondo entero, en vez de un tema:
            </p>
            <div className="filter-row" style={{ marginTop: 2 }}>
              <label className="chip" style={{ cursor: 'pointer' }}>
                {uploadingBackground ? 'Subiendo…' : backgroundImageUrl ? '🖼️ Cambiar foto de fondo' : '🖼️ Usar mi foto de fondo'}
                <input type="file" accept="image/*" onChange={handleBackgroundPhotoChange} style={{ display: 'none' }} disabled={uploadingBackground} />
              </label>
              {backgroundImageUrl && (
                <button type="button" className="link-button" onClick={handleRemoveBackgroundPhoto}>
                  Quitar foto de fondo
                </button>
              )}
              {backgroundImageUrl && (
                <button
                  type="button"
                  className={'chip' + (adjustingBackground ? ' chip-active' : '')}
                  onClick={() => setAdjustingBackground((v) => !v)}
                >
                  🔧 Ajustar fondo
                </button>
              )}
            </div>
            {adjustingBackground && (
              <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                Arrastra la foto para moverla y pellizca con dos dedos para hacer zoom.
              </p>
            )}

            <div
              ref={canvasRef}
              onPointerDown={() => setSelectedId(null)}
              style={{ position: 'relative', width: '100%', aspectRatio: canvasAspectRatio, borderRadius: 16, overflow: 'hidden', background: backgroundGradient, marginTop: 10, touchAction: 'none' }}
            >
              {backgroundImageUrl ? (
                <img
                  src={backgroundImageUrl}
                  alt=""
                  onPointerDown={handleBackgroundPointerDown}
                  onPointerMove={handleBackgroundPointerMove}
                  onPointerUp={handleBackgroundPointerUp}
                  onPointerCancel={handleBackgroundPointerUp}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: `translate(${backgroundOffsetX * 100}%, ${backgroundOffsetY * 100}%) scale(${backgroundScale})`,
                    touchAction: adjustingBackground ? 'none' : undefined,
                    cursor: adjustingBackground ? 'grab' : undefined,
                  }}
                />
              ) : (
                <InvitationBackground templateKey={templateKey} />
              )}
              {layers
                .slice()
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((layer) => (
                  <div
                    key={layer.id}
                    onPointerDown={(e) => handleLayerPointerDown(e, layer)}
                    onPointerMove={handleDragPointerMove}
                    onPointerUp={handleDragPointerUp}
                    onPointerCancel={handleDragPointerUp}
                    style={{
                      position: 'absolute',
                      left: `${layer.x * 100}%`,
                      top: `${layer.y * 100}%`,
                      transform: `translate(-50%, -50%) rotate(${layer.rotation}deg) scale(${layer.scale})`,
                      cursor: 'grab',
                      touchAction: 'none',
                      outline: layer.id === selectedId ? '2px dashed #ffffff' : 'none',
                      outlineOffset: 4,
                    }}
                  >
                    <InvitationLayerVisual layer={layer} photoUrls={photoUrls} />
                    {layer.id === selectedId && (
                      <div
                        onPointerDown={(e) => handleHandlePointerDown(e, layer)}
                        onPointerMove={handleDragPointerMove}
                        onPointerUp={handleDragPointerUp}
                        onPointerCancel={handleDragPointerUp}
                        style={{
                          position: 'absolute',
                          right: -14,
                          bottom: -14,
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: '#4C6EF5',
                          border: '2px solid white',
                          cursor: 'grab',
                          touchAction: 'none',
                        }}
                      />
                    )}
                  </div>
                ))}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Arrastra para mover; el punto azul de la esquina cambia tamaño y rotación a la vez.
            </p>

            <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="chip" onClick={() => handleAddLayer(makeInvitationLayer('text', { text: 'Texto', color: '#ffffff', fontSize: 18, fontFamily: 'inherit' }))}>
                + Texto
              </button>
              <button type="button" className="chip" onClick={() => setAddMenu(addMenu === 'emoji' ? null : 'emoji')}>
                + Emoji
              </button>
              <button type="button" className="chip" onClick={() => setAddMenu(addMenu === 'forma' ? null : 'forma')}>
                + Forma
              </button>
              <label className="chip" style={{ cursor: 'pointer' }}>
                {uploadingPhoto ? 'Subiendo…' : '+ Foto'}
                <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: 'none' }} disabled={uploadingPhoto} />
              </label>
              <button type="button" className="chip" onClick={() => handleAddLayer(makeInvitationLayer('event_data', { text: buildInvitationMessage(event), color: '#ffffff', fontSize: 14 }))}>
                + Texto de invitación
              </button>
            </div>
            {addMenu === 'emoji' && (
              <>
                {/* Petición real: "los emojis salen muy pocos, lo suyo
                    sería poder usar cualquier emoji del teclado" — el
                    teclado emoji nativo del móvil ya funciona en
                    cualquier campo de texto, así que basta con un campo
                    donde pegar/escribir cualquiera; los botones de abajo
                    siguen para los más usados, de un toque. */}
                <form
                  style={{ display: 'flex', gap: 6, marginTop: 4 }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    const em = customEmoji.trim()
                    if (!em) return
                    handleAddLayer(makeInvitationLayer('emoji', { text: em, fontSize: 48 }))
                    setCustomEmoji('')
                  }}
                >
                  <input
                    type="text"
                    value={customEmoji}
                    onChange={(e) => setCustomEmoji(e.target.value)}
                    placeholder="Escribe o pega cualquier emoji del teclado"
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="chip" disabled={!customEmoji.trim()}>
                    + Añadir
                  </button>
                </form>
                <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
                  {INVITATION_EMOJI_SUGGESTIONS.map((em) => (
                    <button key={em} type="button" className="chip" onClick={() => handleAddLayer(makeInvitationLayer('emoji', { text: em, fontSize: 48 }))}>
                      {em}
                    </button>
                  ))}
                </div>
              </>
            )}
            {addMenu === 'forma' && (
              <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                {INVITATION_SHAPES.map((s) => (
                  <button key={s.key} type="button" className="chip" onClick={() => handleAddLayer(makeInvitationLayer('shape', { shapeKey: s.key, color: '#ffffff', fontSize: 60 }))}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="card member-form" style={{ marginTop: 8 }}>
                <strong style={{ fontSize: 13 }}>Elemento seleccionado</strong>
                {(selected.type === 'text' || selected.type === 'event_data' || selected.type === 'shape') && (
                  <div className="filter-row" style={{ marginTop: 4, alignItems: 'center' }}>
                    {LAYER_COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSelected({ color: c })}
                        style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: selected.color === c ? '2px solid #4C6EF5' : '1px solid #d8dae8' }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
                    {/* Petición real: "mejor pon un botón que puedas
                        elegir el color de la letra de una paleta más
                        amplia" — input[type=color] nativo abre la rueda
                        de color completa del móvil, sin límite a los 6
                        rápidos de arriba. */}
                    <input
                      type="color"
                      className="color-wheel-input"
                      value={selected.color && /^#[0-9a-fA-F]{6}$/.test(selected.color) ? selected.color : '#ffffff'}
                      onChange={(e) => updateSelected({ color: e.target.value })}
                      aria-label="Elegir cualquier color"
                    />
                  </div>
                )}
                {(selected.type === 'text' || selected.type === 'event_data') && (
                  <label style={{ marginTop: 8, display: 'block' }}>
                    Texto
                    <textarea value={selected.text ?? ''} onChange={(e) => updateSelected({ text: e.target.value })} rows={2} />
                  </label>
                )}
                {(selected.type === 'text' || selected.type === 'event_data') && (
                  <label style={{ marginTop: 8, display: 'block' }}>
                    Fuente
                    <select value={selected.fontFamily || 'inherit'} onChange={(e) => updateSelected({ fontFamily: e.target.value })}>
                      {LAYER_FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {/* Petición real: "formato 3D", "letras de brillos...
                    purpurina", "un color arcoíris... uno fijo [que
                    cambia a lo largo de lo escrito, no con el tiempo] y
                    otro que vaya cambiando conforme lo mires", "otro
                    estilo iridiscente" — todos rellenos alternativos del
                    texto; tocar el que ya está activo lo quita (vuelve
                    a "normal"). Curvar (más abajo) es la forma, no el
                    relleno, y sí se puede combinar con cualquiera de
                    estos. */}
                {(selected.type === 'text' || selected.type === 'event_data') && (
                  <div className="filter-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                    {TEXT_STYLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={'chip' + ((selected.textStyle ?? 'normal') === opt.value ? ' chip-active' : '')}
                        onClick={() => updateSelected({ textStyle: (selected.textStyle ?? 'normal') === opt.value ? 'normal' : opt.value })}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {selected.type === 'text' && (
                  <label style={{ marginTop: 8, display: 'block' }}>
                    Curvar texto {selected.curve ? `(${selected.curve > 0 ? '⌣ arriba' : '⌢ abajo'})` : '(recto)'}
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={selected.curve ?? 0}
                      onChange={(e) => updateSelected({ curve: Number(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                  </label>
                )}
                <div className="filter-row" style={{ marginTop: 8 }}>
                  {/* Petición real: "he insertado una foto y no consigo
                      editar su tamaño" — con ±2 el cambio era
                      imperceptible en una foto/forma de 60-300px (sí se
                      notaba en texto, de 10-40px); foto/forma usan un
                      paso mayor. El punto azul de la esquina (pellizcar/
                      arrastrar) sigue siendo el gesto principal. */}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => updateSelected({ fontSize: Math.max(10, (selected.fontSize ?? 16) - (selected.type === 'text' || selected.type === 'event_data' ? 2 : 15)) })}
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => updateSelected({ fontSize: (selected.fontSize ?? 16) + (selected.type === 'text' || selected.type === 'event_data' ? 2 : 15) })}
                  >
                    A+
                  </button>
                  <button type="button" className="link-button" onClick={() => handleReorder(1)}>
                    ⬆ Adelante
                  </button>
                  <button type="button" className="link-button" onClick={() => handleReorder(-1)}>
                    ⬇ Atrás
                  </button>
                  <button type="button" className="link-button" onClick={handleDuplicate}>
                    ⧉ Duplicar
                  </button>
                  <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar elemento" onConfirm={handleDeleteSelected} />
                </div>
              </div>
            )}

            <div className="filter-row" style={{ marginTop: 12 }}>
              <button type="button" className="link-button" onClick={handleUndo} disabled={history.length === 0}>
                ↩️ Deshacer
              </button>
              <button type="button" className="link-button" onClick={handlePrettify}>
                ✨ Pepa, hazla bonita
              </button>
              <ConfirmButton label="↺ Restaurar plantilla" confirmLabel="Restaurar" className="link-button" onConfirm={handleRestoreTemplate} />
            </div>

            <button type="button" onClick={handleSave} disabled={saving} style={{ marginTop: 12 }}>
              {saving ? 'Guardando…' : '💾 Guardar diseño'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — "Organízamelo Pepa". Petición de la Skill (08-data-
// integration-ai.md): "Show a summary of proposed writes before user
// confirms" — nada se escribe hasta que el usuario pulsa "Aplicar", y
// puede destildar cualquier línea suelta antes de confirmar.
// ---------------------------------------------------------------------

function OrganizamePepaModal({ event, onClose, onApplied }: { event: FamilyEvent; onClose: () => void; onApplied: () => void }) {
  const plan = generateEventPlan(event)
  const [modulesChecked, setModulesChecked] = useState(() => new Set(plan.missingModules))
  const [budgetChecked, setBudgetChecked] = useState(() => new Set(plan.budgetItems.map((_, i) => i)))
  const [menuChecked, setMenuChecked] = useState(() => new Set(plan.menuItems.map((_, i) => i)))
  const [decorationChecked, setDecorationChecked] = useState(() => new Set(plan.decorationItems.map((_, i) => i)))
  const [activitiesChecked, setActivitiesChecked] = useState(() => new Set(plan.activities.map((_, i) => i)))
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle<T>(set: Set<T>, setSet: (s: Set<T>) => void, i: T) {
    const next = new Set(set)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSet(next)
  }

  const totalCount = budgetChecked.size + menuChecked.size + decorationChecked.size + activitiesChecked.size

  async function handleApply() {
    setApplying(true)
    setError(null)
    try {
      if (modulesChecked.size > 0) {
        await addEnabledModules(event.id, event.enabledModules, [...modulesChecked])
      }
      await Promise.all([
        ...plan.budgetItems.filter((_, i) => budgetChecked.has(i)).map((b) => addEventBudgetItem(event.id, b.category, b.plannedAmount)),
        ...plan.menuItems.filter((_, i) => menuChecked.has(i)).map((m) => addEventMenuItem(event.id, m.name)),
        ...plan.decorationItems.filter((_, i) => decorationChecked.has(i)).map((d) => addEventDecorationItem(event.id, d.name)),
        ...plan.activities.filter((_, i) => activitiesChecked.has(i)).map((a) => addEventActivity(event.id, { title: a.title, ageRange: a.ageRange ?? null })),
      ])
      onApplied()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo aplicar la propuesta'))
    } finally {
      setApplying(false)
    }
  }

  const nothingToPropose = plan.budgetItems.length + plan.menuItems.length + plan.decorationItems.length + plan.activities.length === 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            🪄 Organízamelo Pepa
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <p className="muted" style={{ fontSize: 13 }}>
          Propuesta típica de {EVENT_TYPE_META[event.type].label.toLowerCase()} — destilda lo que no te haga falta antes de aplicar. Las tareas no están
          aquí porque ya se crearon solas al hacer el evento.
        </p>

        {nothingToPropose && plan.missingModules.length === 0 && <p className="muted">Este tipo de evento no tiene ninguna propuesta automática de partida.</p>}

        {plan.missingModules.length > 0 && (
          <>
            <strong style={{ fontSize: 13 }}>Módulos que hacen falta para esto</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.missingModules.map((m) => {
                const meta = EVENT_MODULES.find((em) => em.key === m)
                return (
                  <label key={m} className="inline-fields" style={{ alignItems: 'center' }}>
                    <input type="checkbox" checked={modulesChecked.has(m)} onChange={() => toggle(modulesChecked, setModulesChecked, m)} />
                    <span>
                      {meta?.icon} {meta?.label}
                    </span>
                  </label>
                )
              })}
            </div>
          </>
        )}

        {plan.budgetItems.length > 0 && (
          <>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 10 }}>💰 Presupuesto</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.budgetItems.map((b, i) => (
                <label key={b.category} className="inline-fields" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={budgetChecked.has(i)} onChange={() => toggle(budgetChecked, setBudgetChecked, i)} />
                  <span style={{ flex: 1 }}>{b.category}</span>
                  <span>{b.plannedAmount.toFixed(2)} €</span>
                </label>
              ))}
            </div>
          </>
        )}

        {plan.menuItems.length > 0 && (
          <>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 10 }}>🍽️ Menú</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.menuItems.map((m, i) => (
                <label key={m.name} className="inline-fields" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={menuChecked.has(i)} onChange={() => toggle(menuChecked, setMenuChecked, i)} />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {plan.decorationItems.length > 0 && (
          <>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 10 }}>🎈 Decoración</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.decorationItems.map((d, i) => (
                <label key={d.name} className="inline-fields" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={decorationChecked.has(i)} onChange={() => toggle(decorationChecked, setDecorationChecked, i)} />
                  <span>{d.name}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {plan.activities.length > 0 && (
          <>
            <strong style={{ fontSize: 13, display: 'block', marginTop: 10 }}>🎲 Actividades</strong>
            <div className="event-list" style={{ marginTop: 4 }}>
              {plan.activities.map((a, i) => (
                <label key={a.title} className="inline-fields" style={{ alignItems: 'center' }}>
                  <input type="checkbox" checked={activitiesChecked.has(i)} onChange={() => toggle(activitiesChecked, setActivitiesChecked, i)} />
                  <span>{a.title}</span>
                </label>
              ))}
            </div>
          </>
        )}

        {!nothingToPropose && (
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Pepa va a añadir {totalCount} {totalCount === 1 ? 'elemento' : 'elementos'} en total.
          </p>
        )}

        <button type="button" onClick={handleApply} disabled={applying || (nothingToPropose && modulesChecked.size === 0)} style={{ marginTop: 12 }}>
          {applying ? 'Aplicando…' : 'Aplicar'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — plantillas personales. Petición de la Skill
// (06-custom-event.md): "Do not copy old live RSVP/expense state into
// new occurrences" — solo se guarda la configuración, nunca datos en
// marcha (ver saveEventTemplate).
// ---------------------------------------------------------------------

function SaveTemplateModal({ event, onClose, onSaved }: { event: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(event.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre a la plantilla.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveEventTemplate(name, event)
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la plantilla'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Guardar como plantilla
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          Se guarda el tipo, el tema y los módulos activados — nunca invitados, RSVP ni gastos. Útil para eventos que se repiten (la comida de Navidad, el
          cumpleaños de cada año...).
        </p>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          <label>
            Nombre de la plantilla
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Comida de Navidad" autoFocus />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar plantilla'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Fase 4 — resumen final al archivar (master-spec, punto 16: "Provide
// an end summary such as: budget vs spent, final attendance, task
// completion, net cost where gifts received are tracked").
// ---------------------------------------------------------------------

function EndSummaryModal({ event, onClose, onConfirmed }: { event: FamilyEvent; onClose: () => void; onConfirmed: () => void }) {
  const [loading, setLoading] = useState(true)
  const [confirmedPeople, setConfirmedPeople] = useState(0)
  const [taskStats, setTaskStats] = useState({ done: 0, total: 0 })
  const [plannedBudget, setPlannedBudget] = useState<number | null>(null)
  const [spentBudget, setSpentBudget] = useState<number | null>(null)
  const [cashGifts, setCashGifts] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      event.enabledModules.includes('invitados') ? listEventGuests(event.id) : Promise.resolve([]),
      event.enabledModules.includes('tareas') ? listEventTasks(event.id) : Promise.resolve([]),
      event.enabledModules.includes('presupuesto') ? listEventBudgetItems(event.id) : Promise.resolve([]),
      event.tagId && event.enabledModules.includes('presupuesto') ? listExpenses() : Promise.resolve(null),
      event.enabledModules.includes('regalos') ? listEventGifts(event.id) : Promise.resolve([]),
      event.tagId && event.enabledModules.includes('presupuesto') ? listBudgetCategories() : Promise.resolve([]),
    ]).then(([guests, tasks, budgetItems, expenses, gifts, categories]) => {
      const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmado')
      setConfirmedPeople(confirmed.reduce((sum, g) => sum + (g.rsvpAdultsCount ?? g.adultsCount) + (g.rsvpChildrenCount ?? g.childrenCount), 0))
      setTaskStats({ done: tasks.filter((t) => t.done).length, total: tasks.length })
      if (event.enabledModules.includes('presupuesto')) {
        setPlannedBudget(budgetItems.reduce((sum, i) => sum + i.plannedAmount, 0))
        setSpentBudget(
          expenses
            ? expenses
                .filter((e) => e.tagId === event.tagId && !e.isIncome && !isInternalTransferCategory(e.category, categories))
                .reduce((sum, e) => sum + e.amount, 0)
            : null,
        )
      }
      if (event.enabledModules.includes('regalos')) {
        setCashGifts(gifts.reduce((sum, g) => sum + (g.cashAmount ?? 0), 0))
      }
      setLoading(false)
    })
  }, [event.id, event.enabledModules, event.tagId])

  const netCost = spentBudget !== null && cashGifts !== null ? spentBudget - cashGifts : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Resumen de {event.title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {loading ? (
          <p className="muted">Calculando…</p>
        ) : (
          <div className="event-list">
            {event.enabledModules.includes('invitados') && <p>👥 Asistencia final: {confirmedPeople} personas confirmadas</p>}
            {taskStats.total > 0 && (
              <p>
                ✅ Tareas: {taskStats.done} de {taskStats.total} hechas
              </p>
            )}
            {plannedBudget !== null && (
              <p>
                💰 Presupuesto: {plannedBudget.toFixed(2)} € planeados{spentBudget !== null ? ` · ${spentBudget.toFixed(2)} € gastados` : ''}
              </p>
            )}
            {cashGifts !== null && <p>🎀 Regalos en efectivo: {cashGifts.toFixed(2)} €</p>}
            {netCost !== null && <p>🧮 Coste neto (gastado menos regalos): {netCost.toFixed(2)} €</p>}
            {confirmedPeople === 0 && taskStats.total === 0 && plannedBudget === null && cashGifts === null && (
              <p className="muted">No hay datos suficientes todavía para un resumen — se puede archivar igual.</p>
            )}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Archivar guarda todo esto tal cual está — invitados, presupuesto, tareas e invitación no se borran, y se puede reactivar cuando quieras.
        </p>
        <ConfirmButton label="📦 Archivar" confirmLabel="Confirmar" onConfirm={onConfirmed} />
      </div>
    </div>
  )
}
