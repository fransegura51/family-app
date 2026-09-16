import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
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
  archiveEvent,
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
  linkEventToCalendar,
  linkPaymentReminder,
  linkRsvpDeadlineReminder,
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
  updateLinkedCalendarEvent,
  updateRsvpDeadlineReminder,
  uploadInvitationPhoto,
} from '@/data/events'
import { listExpenses } from '@/data/finance'
import { errorMessage } from '@/domain/errorMessage'
import {
  autoArrangeLayers,
  buildInvitationTemplateLayers,
  CELEBRATION_SUBTYPES,
  computeEventConclusions,
  DUAL_LOCATION_EVENT_TYPES,
  type EventConclusion as EventConclusionType,
  EVENT_MODULES,
  EVENT_TYPES,
  EVENT_TYPE_META,
  eventDateLine,
  eventLocationLines,
  generateEventPlan,
  INVITATION_EMOJI_SUGGESTIONS,
  INVITATION_SHAPES,
  INVITATION_TEMPLATES,
  isToday,
  makeInvitationLayer,
  RECOMMENDED_MODULES,
} from '@/domain/events'
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
  InvitationCanvas,
  InvitationLayer,
} from '@/domain/types'
import { shareText } from '@/services/share'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { ShareFallbackModal } from '@/ui/ShareFallbackModal'

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

const MODULE_GROUPS: { title: string; keys: EventModuleKey[] }[] = [
  { title: 'Organización', keys: ['invitados', 'tareas', 'ceremonia', 'mesas', 'proveedores', 'plan_dia'] },
  { title: 'Dinero y necesidades', keys: ['presupuesto', 'pagos', 'menu_compra', 'detalles'] },
  { title: 'Celebración', keys: ['invitaciones', 'decoracion', 'actividades', 'regalos'] },
]

// Módulos con sección funcional propia ya construida — el resto se
// queda como chip "próximamente" dentro de su grupo.
const READY_MODULE_KEYS = new Set<EventModuleKey>([
  'tareas',
  'invitados',
  // Invitaciones/RSVP no tiene sección propia aparte — el botón "💌
  // Invitación" de cada invitado (dentro de Invitados) ya cubre la
  // Fase 2 completa (plantilla, autorrelleno, compartir, enlace de
  // RSVP público, recordatorio a pendientes).
  'invitaciones',
  'presupuesto',
  'menu_compra',
  'proveedores',
  'pagos',
  'ceremonia',
  'decoracion',
  'actividades',
  'mesas',
  'detalles',
  'regalos',
  'plan_dia',
])

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
  return `${ev.dateStatus === 'provisional' ? 'Provisional' : 'Confirmada'} · ${ev.eventDate}`
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

export function EventosScreen() {
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  function reload() {
    listEvents(showArchived)
      .then(setEvents)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los eventos')))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [showArchived])

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

function EventDetail({
  event,
  onBack,
  onChanged,
  onArchivedOrDeleted,
  onDuplicated,
}: {
  event: FamilyEvent
  onBack: () => void
  onChanged: () => void
  onArchivedOrDeleted: () => void
  onDuplicated: (id: string) => void
}) {
  const [tasks, setTasks] = useState<EventTask[]>([])
  const [showAllTasks, setShowAllTasks] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [showModules, setShowModules] = useState(false)
  const [showPlan, setShowPlan] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [showEndSummary, setShowEndSummary] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [linkingCalendar, setLinkingCalendar] = useState(false)

  async function handleLinkCalendar() {
    setLinkingCalendar(true)
    setError(null)
    try {
      await linkEventToCalendar(event)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir al calendario'))
    } finally {
      setLinkingCalendar(false)
    }
  }

  async function handleUpdateLinkedCalendar() {
    setLinkingCalendar(true)
    setError(null)
    try {
      await updateLinkedCalendarEvent(event)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo actualizar el calendario'))
    } finally {
      setLinkingCalendar(false)
    }
  }

  const [linkingReminder, setLinkingReminder] = useState(false)

  async function handleLinkRsvpReminder() {
    setLinkingReminder(true)
    setError(null)
    try {
      await linkRsvpDeadlineReminder(event)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo poner el recordatorio'))
    } finally {
      setLinkingReminder(false)
    }
  }

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

  return (
    <div>
      <button type="button" className="link-button" onClick={onBack}>
        ← Todos los eventos
      </button>
      {error && <p className="error">{error}</p>}

      <div className="card event-card" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <strong style={{ fontSize: 18 }}>
            {EVENT_TYPE_META[event.type].icon} {event.title}
          </strong>
          <button type="button" className="link-button" onClick={() => setShowEdit(true)}>
            Editar
          </button>
        </div>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {eventDateLabel(event)}
          {event.venueLabel ? ` · ${event.venueLabel}` : ''}
        </p>
        {event.status === 'archivado' && <p className="muted">📦 Archivado</p>}
        {/* Petición de la Skill: nunca crear un compromiso firme en
            Calendario mientras la fecha no esté confirmada, y siempre
            como acción explícita del usuario, no automática. */}
        {event.dateStatus === 'confirmada' && event.eventDate && !event.calendarEventId && (
          <button type="button" className="link-button" onClick={handleLinkCalendar} disabled={linkingCalendar} style={{ marginTop: 4 }}>
            {linkingCalendar ? 'Añadiendo…' : '📅 Añadir al calendario'}
          </button>
        )}
        {event.calendarEventId && (
          <p className="muted" style={{ marginTop: 4 }}>
            ✓ En el calendario ·{' '}
            <button type="button" className="link-button" onClick={handleUpdateLinkedCalendar} disabled={linkingCalendar}>
              {linkingCalendar ? 'Actualizando…' : 'Actualizar'}
            </button>
          </p>
        )}
        {event.rsvpDeadline && !event.rsvpDeadlineCalendarEventId && (
          <button type="button" className="link-button" onClick={handleLinkRsvpReminder} disabled={linkingReminder} style={{ marginTop: 4, display: 'block' }}>
            {linkingReminder ? 'Poniendo recordatorio…' : `🔔 Recordarme el plazo de RSVP (${event.rsvpDeadline})`}
          </button>
        )}
        {event.rsvpDeadline && event.rsvpDeadlineCalendarEventId && <p className="muted" style={{ marginTop: 4 }}>🔔 Recordatorio de plazo puesto</p>}
      </div>

      {event.status === 'planificacion' && event.dateStatus === 'confirmada' && isToday(event.eventDate) && <EventDayBanner event={event} />}
      {event.status === 'planificacion' && <PepaConclusions event={event} />}

      {hasTasksModule && (
        <div className="card event-card" style={{ marginTop: 8 }}>
          <strong>Pendiente ahora</strong>
          {pendingTasks.length === 0 && <p className="muted">No hay nada pendiente.</p>}
          <div className="event-list">
            {visibleTasks.map((t) => (
              <div key={t.id} className="inline-fields" style={{ alignItems: 'center' }}>
                <input type="checkbox" checked={t.done} onChange={() => updateEventTask(t.id, { done: true }).then(reloadTasks)} />
                <span style={{ flex: 1 }}>
                  {t.title}
                  {t.dueDate ? ` · ${t.dueDate}` : ''}
                </span>
                <ConfirmIconButton icon="✕" className="icon-button" ariaLabel="Borrar tarea" onConfirm={() => deleteEventTask(t.id).then(reloadTasks)} />
              </div>
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
        </div>
      )}

      {event.enabledModules.includes('ceremonia') && DUAL_LOCATION_EVENT_TYPES.includes(event.type) && (
        <CeremoniaSection key={`ceremonia-${refreshKey}`} event={event} onChanged={onChanged} />
      )}
      {event.enabledModules.includes('invitados') && <GuestsSection key={`invitados-${refreshKey}`} event={event} />}
      {event.enabledModules.includes('mesas') && <TablesSection key={`mesas-${refreshKey}`} event={event} />}
      {event.enabledModules.includes('presupuesto') && <BudgetSection key={`presupuesto-${refreshKey}`} event={event} />}
      {event.enabledModules.includes('menu_compra') && <MenuSection key={`menu-${refreshKey}`} eventId={event.id} />}
      {event.enabledModules.includes('decoracion') && <DecorationSection key={`decoracion-${refreshKey}`} eventId={event.id} />}
      {event.enabledModules.includes('actividades') && <ActivitiesSection key={`actividades-${refreshKey}`} eventId={event.id} />}
      {event.enabledModules.includes('proveedores') && <ProvidersSection eventId={event.id} />}
      {event.enabledModules.includes('pagos') && <PaymentsSection event={event} />}
      {event.enabledModules.includes('detalles') && <DetailsSection eventId={event.id} />}
      {event.enabledModules.includes('regalos') && <GiftsSection eventId={event.id} />}
      {event.enabledModules.includes('plan_dia') && <DayPlanSection eventId={event.id} />}

      {MODULE_GROUPS.map((group) => {
        const groupModules = group.keys.filter((k) => event.enabledModules.includes(k) && !READY_MODULE_KEYS.has(k))
        if (groupModules.length === 0) return null
        return (
          <div key={group.title} className="card event-card" style={{ marginTop: 8 }}>
            <strong>{group.title}</strong>
            <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              {groupModules.map((key) => {
                const meta = EVENT_MODULES.find((m) => m.key === key)
                if (!meta) return null
                return (
                  <span key={key} className="chip" style={{ opacity: 0.6 }}>
                    {meta.icon} {meta.label} · próximamente
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}

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

      <div className="card event-card" style={{ marginTop: 8 }}>
        <div className="filter-row" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="link-button" onClick={() => setShowModules(true)}>
            ⚙️ Gestionar módulos
          </button>
          <button type="button" className="link-button" onClick={() => setShowSaveTemplate(true)}>
            💾 Guardar como plantilla
          </button>
        </div>
        <div className="filter-row" style={{ marginTop: 8 }}>
          {event.status === 'planificacion' ? (
            <button type="button" className="link-button" onClick={() => setShowEndSummary(true)}>
              📦 Finalizar y archivar
            </button>
          ) : (
            <button type="button" className="link-button" onClick={() => unarchiveEvent(event.id).then(onChanged)}>
              Reactivar
            </button>
          )}
          <button type="button" className="link-button" onClick={() => duplicateEvent(event.id).then(onDuplicated)}>
            Duplicar
          </button>
          <ConfirmButton label="Borrar evento" confirmLabel="Borrar" className="link-button" onConfirm={() => deleteEvent(event.id).then(onArchivedOrDeleted)} />
        </div>
      </div>

      {showEdit && (
        <EditEventModal
          event={event}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)
            onChanged()
          }}
        />
      )}
      {showModules && (
        <ModulesModal
          event={event}
          onClose={() => setShowModules(false)}
          onSaved={() => {
            setShowModules(false)
            onChanged()
          }}
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

function EditEventModal({ event, onClose, onSaved }: { event: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(event.title)
  const [dateStatus, setDateStatus] = useState(event.dateStatus)
  const [eventDate, setEventDate] = useState(event.eventDate ?? '')
  const [venueLabel, setVenueLabel] = useState(event.venueLabel ?? '')
  const [theme, setTheme] = useState(event.theme ?? '')
  const [rsvpDeadline, setRsvpDeadline] = useState(event.rsvpDeadline ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const nextDate = dateStatus === 'pendiente' ? null : eventDate || null
      await updateEvent(event.id, {
        title,
        dateStatus,
        eventDate: nextDate,
        venueLabel: venueLabel || null,
        theme: theme || null,
        rsvpDeadline: rsvpDeadline || null,
      })
      // Petición de la Skill: "relative tasks update when event date
      // changes" — solo se recalcula si la fecha de verdad ha cambiado.
      if (nextDate !== event.eventDate) await recalculateAutoTasks(event.id, event.type, nextDate)
      const nextDeadline = rsvpDeadline || null
      if (nextDeadline !== event.rsvpDeadline && event.rsvpDeadlineCalendarEventId) {
        await updateRsvpDeadlineReminder({ ...event, rsvpDeadline: nextDeadline })
      }
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
            Editar evento
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
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
            Sitio
            <input type="text" value={venueLabel} onChange={(e) => setVenueLabel(e.target.value)} />
          </label>
          <label>
            Tema
            <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </label>
          <label>
            Plazo de RSVP (opcional)
            <input type="date" value={rsvpDeadline} onChange={(e) => setRsvpDeadline(e.target.value)} />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ModulesModal({ event, onClose, onSaved }: { event: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const [modules, setModules] = useState<EventModuleKey[]>(event.enabledModules)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateEvent(event.id, { enabledModules: modules })
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
            Gestionar módulos
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <p className="muted" style={{ fontSize: 13 }}>
          Los módulos que quites se ocultan, pero no se borra nada — puedes reactivarlos cuando quieras.
        </p>
        <ModulePickerChips modules={modules} onChange={setModules} />
        <button type="button" onClick={handleSave} disabled={saving} style={{ marginTop: 12 }}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Ceremonia — solo Comunión/Bautizo/Boda (dos ubicaciones posibles).
// ---------------------------------------------------------------------

function CeremoniaSection({ event, onChanged }: { event: FamilyEvent; onChanged: () => void }) {
  const [ceremonyLocationLabel, setCeremonyLocationLabel] = useState(event.ceremonyLocationLabel ?? '')
  const [ceremonyTime, setCeremonyTime] = useState(event.ceremonyTime ?? '')
  const [celebrationLocationLabel, setCelebrationLocationLabel] = useState(event.celebrationLocationLabel ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateEvent(event.id, {
        ceremonyLocationLabel: ceremonyLocationLabel || null,
        ceremonyTime: ceremonyTime || null,
        celebrationLocationLabel: celebrationLocationLabel || null,
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
          Iglesia / lugar de la ceremonia
          <input type="text" value={ceremonyLocationLabel} onChange={(e) => setCeremonyLocationLabel(e.target.value)} />
        </label>
        <label>
          Hora de la ceremonia
          <input type="time" value={ceremonyTime} onChange={(e) => setCeremonyTime(e.target.value)} />
        </label>
        <label>
          Lugar de la celebración
          <input type="text" value={celebrationLocationLabel} onChange={(e) => setCelebrationLocationLabel(e.target.value)} />
        </label>
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
    try {
      const shown = await shareText({ title: event.title, text: `Confirma tu asistencia a "${event.title}" aquí: ${url}` })
      setNotice(shown ? null : 'Copiado al portapapeles.')
    } catch {
      setManualShare({ title: event.title, text: `Confirma tu asistencia a "${event.title}" aquí: ${url}` })
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
      listExpenses()
        .then((expenses) => setSpent(expenses.filter((e) => e.tagId === event.tagId && !e.isIncome).reduce((sum, e) => sum + e.amount, 0)))
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
  const [templateKey, setTemplateKey] = useState(INVITATION_TEMPLATES[0].key)
  const [message, setMessage] = useState('¡Nos encantaría contar contigo!')
  const [rsvpUrl, setRsvpUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualShare, setManualShare] = useState<{ title: string; text: string } | null>(null)
  const [customCanvas, setCustomCanvas] = useState<InvitationCanvas | null>(null)
  const [customTemplateKey, setCustomTemplateKey] = useState<string | null>(null)
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

  function buildShareText(): string {
    return [`${EVENT_TYPE_META[event.type].icon} ${event.title}`, ...infoLines, '', message, '', `Confirma tu asistencia aquí: ${rsvpUrl}`].join('\n')
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
          <InvitationCanvasView canvas={customCanvas} templateKey={customTemplateKey} photoUrls={photoUrls} />
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13 }}>
              Elige un tema — el texto sale relleno solo, y se puede editar antes de mandarlo. Para un diseño con foto, texto y emoji a tu gusto, usa "🎨
              Diseño de la invitación" en Invitados.
            </p>
            <div className="filter-row" style={{ flexWrap: 'wrap' }}>
              {INVITATION_TEMPLATES.map((t) => (
                <button key={t.key} type="button" className={'chip' + (t.key === templateKey ? ' chip-active' : '')} onClick={() => setTemplateKey(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div
              style={{ position: 'relative', overflow: 'hidden', marginTop: 12, borderRadius: 16, padding: 20, background: template.gradient, color: template.text, textAlign: 'center' }}
            >
              <InvitationBackgroundArt artKey={template.artKey} />
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
    ]).then(([guests, tasks, payments, budgetItems, expenses]) => {
      const plannedBudget = budgetItems.reduce((sum, i) => sum + i.plannedAmount, 0)
      const spentBudget = expenses ? expenses.filter((e) => e.tagId === event.tagId && !e.isIncome).reduce((sum, e) => sum + e.amount, 0) : null
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
    case 'circulo':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill={c} />
        </svg>
      )
  }
}

// "fontSize" se reutiliza como tamaño base en píxeles para foto/forma,
// no solo para texto — evita añadir un campo más al tipo por algo tan
// parecido (ver domain/types.ts, InvitationLayer).
function InvitationLayerVisual({ layer, photoUrls }: { layer: InvitationLayer; photoUrls: Record<string, string> }) {
  switch (layer.type) {
    case 'text':
    case 'event_data':
      return (
        <div
          style={{
            color: layer.color || '#ffffff',
            fontSize: layer.fontSize ?? 16,
            fontFamily: layer.fontFamily || 'inherit',
            fontWeight: layer.type === 'text' ? 700 : 400,
            whiteSpace: 'pre-line',
            textAlign: 'center',
            textShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}
        >
          {layer.text}
        </div>
      )
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
          <g opacity={0.9}>
            {Array.from({ length: 8 }).map((_, i) => (
              <polygon key={i} points={`${i * 40 + 5},18 ${i * 40 + 25},18 ${i * 40 + 15},42`} fill={i % 2 === 0 ? '#FBBF24' : '#F472B6'} />
            ))}
            <line x1={0} y1={18} x2={300} y2={18} stroke="#ffffff" strokeWidth={2} opacity={0.5} />
          </g>
          <g transform="translate(70 330)">
            <ellipse cx={0} cy={0} rx={75} ry={70} fill="#0D9488" />
            <circle cx={-25} cy={-50} r={10} fill="#0D9488" />
            <circle cx={5} cy={-58} r={8} fill="#0D9488" />
            <circle cx={30} cy={-48} r={9} fill="#0D9488" />
            <circle cx={-20} cy={-15} r={22} fill="#ffffff" />
            <circle cx={-20} cy={-15} r={11} fill="#1F2937" />
            <circle cx={-16} cy={-19} r={4} fill="#ffffff" />
            <circle cx={22} cy={-8} r={16} fill="#ffffff" />
            <circle cx={22} cy={-8} r={8} fill="#1F2937" />
            <path d="M-15 25 q 15 18 35 2" stroke="#1F2937" strokeWidth={3} fill="none" strokeLinecap="round" />
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
          <path d="M20 60 A130 130 0 0 1 280 60" stroke="#FCA5A5" strokeWidth={10} fill="none" opacity={0.7} />
          <path d="M35 60 A115 115 0 0 1 265 60" stroke="#FDE68A" strokeWidth={10} fill="none" opacity={0.7} />
          <path d="M50 60 A100 100 0 0 1 250 60" stroke="#A7F3D0" strokeWidth={10} fill="none" opacity={0.7} />
          <g transform="translate(190 320) rotate(-8)">
            <ellipse cx={0} cy={0} rx={48} ry={34} fill="#ffffff" />
            <path d="M-30 -20 L-55 -55 L-15 -30 Z" fill="#ffffff" />
            <polygon points="-52,-58 -46,-78 -38,-56" fill="#FDE68A" />
            {[-8, 4, 16].map((dy, i) => (
              <path key={i} d={`M-40 ${-30 + dy} q -18 6 -10 22`} stroke={['#F472B6', '#C4B5FD', '#93C5FD'][i]} strokeWidth={6} fill="none" strokeLinecap="round" />
            ))}
            <circle cx={-38} cy={-28} r={3} fill="#4C1D95" />
            <line x1={-25} y1={30} x2={-25} y2={50} stroke="#ffffff" strokeWidth={7} strokeLinecap="round" />
            <line x1={0} y1={32} x2={0} y2={52} stroke="#ffffff" strokeWidth={7} strokeLinecap="round" />
            <line x1={25} y1={30} x2={25} y2={50} stroke="#ffffff" strokeWidth={7} strokeLinecap="round" />
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
              se leía como bola de discoteca. */}
          <g transform="translate(150 86)">
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

function InvitationCanvasView({ canvas, templateKey, photoUrls }: { canvas: InvitationCanvas; templateKey: string | null; photoUrls: Record<string, string> }) {
  const art = INVITATION_TEMPLATES.find((t) => t.key === templateKey)?.artKey ?? 'confeti'
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '3 / 4',
        borderRadius: 16,
        overflow: 'hidden',
        background: canvas.backgroundGradient || INVITATION_TEMPLATES[0].gradient,
      }}
    >
      <InvitationBackgroundArt artKey={art} />
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
  const [templateKey, setTemplateKey] = useState(INVITATION_TEMPLATES[0].key)
  const [backgroundGradient, setBackgroundGradient] = useState(INVITATION_TEMPLATES[0].gradient)
  const [layers, setLayers] = useState<InvitationLayer[]>([])
  const [history, setHistory] = useState<InvitationLayer[][]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [addMenu, setAddMenu] = useState<'emoji' | 'forma' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    getEventInvitation(event.id)
      .then(async (invitation) => {
        if (invitation && invitation.canvas.layers.length > 0) {
          setTemplateKey(invitation.templateKey || INVITATION_TEMPLATES[0].key)
          setBackgroundGradient(invitation.canvas.backgroundGradient || INVITATION_TEMPLATES[0].gradient)
          setLayers(invitation.canvas.layers)
          const paths = invitation.canvas.layers.map((l) => l.photoPath).filter((p): p is string => !!p)
          const urls = await Promise.all(paths.map((p) => getInvitationPhotoUrl(p).catch(() => null)))
          const map: Record<string, string> = {}
          paths.forEach((p, i) => {
            if (urls[i]) map[p] = urls[i] as string
          })
          setPhotoUrls(map)
        } else {
          setLayers(buildInvitationTemplateLayers(event))
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
    setLayers(buildInvitationTemplateLayers(event))
    setSelectedId(null)
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
      await saveEventInvitation(event.id, templateKey, { backgroundGradient, layers })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el diseño'))
    } finally {
      setSaving(false)
    }
  }

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
            <div className="filter-row" style={{ flexWrap: 'wrap' }}>
              {INVITATION_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={'chip' + (t.key === templateKey ? ' chip-active' : '')}
                  onClick={() => {
                    setTemplateKey(t.key)
                    setBackgroundGradient(t.gradient)
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              ref={canvasRef}
              onPointerDown={() => setSelectedId(null)}
              style={{ position: 'relative', width: '100%', aspectRatio: '3 / 4', borderRadius: 16, overflow: 'hidden', background: backgroundGradient, marginTop: 10, touchAction: 'none' }}
            >
              <InvitationBackgroundArt artKey={INVITATION_TEMPLATES.find((t) => t.key === templateKey)?.artKey ?? 'confeti'} />
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
              <button type="button" className="chip" onClick={() => handleAddLayer(makeInvitationLayer('event_data', { text: [eventDateLine(event), ...eventLocationLines(event, { inviteScope: null })].join('\n'), color: '#ffffff', fontSize: 14 }))}>
                + Datos del evento
              </button>
            </div>
            {addMenu === 'emoji' && (
              <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                {INVITATION_EMOJI_SUGGESTIONS.map((em) => (
                  <button key={em} type="button" className="chip" onClick={() => handleAddLayer(makeInvitationLayer('emoji', { text: em, fontSize: 48 }))}>
                    {em}
                  </button>
                ))}
              </div>
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
                  <div className="filter-row" style={{ marginTop: 4 }}>
                    {LAYER_COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSelected({ color: c })}
                        style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: selected.color === c ? '2px solid #4C6EF5' : '1px solid #d8dae8' }}
                        aria-label={`Color ${c}`}
                      />
                    ))}
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
                <div className="filter-row" style={{ marginTop: 8 }}>
                  <button type="button" className="link-button" onClick={() => updateSelected({ fontSize: Math.max(10, (selected.fontSize ?? 16) - 2) })}>
                    A-
                  </button>
                  <button type="button" className="link-button" onClick={() => updateSelected({ fontSize: (selected.fontSize ?? 16) + 2 })}>
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
        await updateEvent(event.id, { enabledModules: [...event.enabledModules, ...modulesChecked] })
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
    ]).then(([guests, tasks, budgetItems, expenses, gifts]) => {
      const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmado')
      setConfirmedPeople(confirmed.reduce((sum, g) => sum + (g.rsvpAdultsCount ?? g.adultsCount) + (g.rsvpChildrenCount ?? g.childrenCount), 0))
      setTaskStats({ done: tasks.filter((t) => t.done).length, total: tasks.length })
      if (event.enabledModules.includes('presupuesto')) {
        setPlannedBudget(budgetItems.reduce((sum, i) => sum + i.plannedAmount, 0))
        setSpentBudget(expenses ? expenses.filter((e) => e.tagId === event.tagId && !e.isIncome).reduce((sum, e) => sum + e.amount, 0) : null)
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
