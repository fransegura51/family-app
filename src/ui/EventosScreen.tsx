import { FormEvent, useEffect, useState } from 'react'
import {
  addEventBudgetItem,
  addEventGuest,
  addEventMenuItem,
  addEventPayment,
  addEventProvider,
  addEventTask,
  archiveEvent,
  createEvent,
  deleteEvent,
  deleteEventBudgetItem,
  deleteEventGuest,
  deleteEventMenuItem,
  deleteEventPayment,
  deleteEventProvider,
  deleteEventTask,
  duplicateEvent,
  getGuestRsvpUrl,
  linkEventToCalendar,
  listEventBudgetItems,
  listEventGuests,
  listEventMenuItems,
  listEventPayments,
  listEventProviders,
  listEventTasks,
  listEvents,
  recalculateAutoTasks,
  regenerateGuestRsvpUrl,
  transferMenuToShopping,
  unarchiveEvent,
  updateEvent,
  updateEventGuest,
  updateEventPayment,
  updateEventTask,
  updateLinkedCalendarEvent,
} from '@/data/events'
import { listExpenses } from '@/data/finance'
import { errorMessage } from '@/domain/errorMessage'
import {
  CELEBRATION_SUBTYPES,
  DUAL_LOCATION_EVENT_TYPES,
  EVENT_MODULES,
  EVENT_TYPES,
  EVENT_TYPE_META,
  eventDateLine,
  eventLocationLines,
  INVITATION_TEMPLATES,
  RECOMMENDED_MODULES,
} from '@/domain/events'
import type {
  EventBudgetItem,
  EventGuest,
  EventGuestInviteScope,
  EventGuestRsvpStatus,
  EventMenuItem,
  EventModuleKey,
  EventPayment,
  EventProvider,
  EventTask,
  EventType,
  FamilyEvent,
} from '@/domain/types'
import { shareText } from '@/services/share'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { ShareFallbackModal } from '@/ui/ShareFallbackModal'

// Módulo Eventos (PEPA Events) — plan aprobado en
// C:\Users\Usuario\.claude\plans\zany-wishing-brook.md.
// Fase 0: motor común configurable + tareas. Fase 1: invitados,
// presupuesto (con gasto real de Economía vía etiqueta), menú →
// traspaso a Compras, ceremonia/ubicaciones, proveedores, pagos/
// fianzas y enlace con Calendario. El resto de módulos (invitaciones/
// RSVP, decoración, actividades, mesas, detalles, regalos, plan del
// día) siguen mostrándose como chips "próximamente" — ver READY_MODULE_KEYS.
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
const READY_MODULE_KEYS = new Set<EventModuleKey>(['tareas', 'invitados', 'presupuesto', 'menu_compra', 'proveedores', 'pagos', 'ceremonia'])

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
      <h1 className="section-title">🎉 Eventos</h1>
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleTypeChange(next: EventType) {
    setType(next)
    if (moduleMode === 'recomendado') setModules(RECOMMENDED_MODULES[next])
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
      </div>

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

      {event.enabledModules.includes('ceremonia') && DUAL_LOCATION_EVENT_TYPES.includes(event.type) && <CeremoniaSection event={event} onChanged={onChanged} />}
      {event.enabledModules.includes('invitados') && <GuestsSection event={event} />}
      {event.enabledModules.includes('presupuesto') && <BudgetSection event={event} />}
      {event.enabledModules.includes('menu_compra') && <MenuSection eventId={event.id} />}
      {event.enabledModules.includes('proveedores') && <ProvidersSection eventId={event.id} />}
      {event.enabledModules.includes('pagos') && <PaymentsSection eventId={event.id} />}

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

      <div className="card event-card" style={{ marginTop: 8 }}>
        <button type="button" className="link-button" onClick={() => setShowModules(true)}>
          ⚙️ Gestionar módulos
        </button>
        <div className="filter-row" style={{ marginTop: 8 }}>
          {event.status === 'planificacion' ? (
            <ConfirmButton
              label="📦 Finalizar y archivar"
              confirmLabel="Archivar"
              className="link-button"
              onConfirm={() => archiveEvent(event.id).then(onArchivedOrDeleted)}
            />
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
    </div>
  )
}

function EditEventModal({ event, onClose, onSaved }: { event: FamilyEvent; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(event.title)
  const [dateStatus, setDateStatus] = useState(event.dateStatus)
  const [eventDate, setEventDate] = useState(event.eventDate ?? '')
  const [venueLabel, setVenueLabel] = useState(event.venueLabel ?? '')
  const [theme, setTheme] = useState(event.theme ?? '')
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
      })
      // Petición de la Skill: "relative tasks update when event date
      // changes" — solo se recalcula si la fecha de verdad ha cambiado.
      if (nextDate !== event.eventDate) await recalculateAutoTasks(event.id, event.type, nextDate)
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
      <strong>👥 Invitados</strong>
      <p className="muted" style={{ margin: '4px 0' }}>
        {guests.length} {guests.length === 1 ? 'invitado/grupo' : 'invitados/grupos'} · {totalPeople} personas en total · {confirmedAdults + confirmedChildren}{' '}
        confirmadas ({confirmedAdults} adultos, {confirmedChildren} niños) · {pending.length} pendientes · {notAttending} no asisten · {unsure} no seguros
      </p>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}
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

function PaymentsSection({ eventId }: { eventId: string }) {
  const [payments, setPayments] = useState<EventPayment[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    listEventPayments(eventId)
      .then(setPayments)
      .catch((err) => setError(errorMessage(err, 'No se pudieron cargar los pagos')))
  }
  useEffect(reload, [eventId])

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

  useEffect(() => {
    getGuestRsvpUrl(guest.id)
      .then(setRsvpUrl)
      .catch((err) => setError(errorMessage(err, 'No se pudo generar el enlace')))
      .finally(() => setLoading(false))
  }, [guest.id])

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

        <p className="muted" style={{ fontSize: 13 }}>
          Elige un tema — el texto sale relleno solo, y se puede editar antes de mandarlo.
        </p>
        <div className="filter-row" style={{ flexWrap: 'wrap' }}>
          {INVITATION_TEMPLATES.map((t) => (
            <button key={t.key} type="button" className={'chip' + (t.key === templateKey ? ' chip-active' : '')} onClick={() => setTemplateKey(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12, borderRadius: 16, padding: 20, background: template.gradient, color: template.text, textAlign: 'center' }}>
          <div style={{ fontSize: 28 }}>{EVENT_TYPE_META[event.type].icon}</div>
          <strong style={{ fontSize: 18 }}>{event.title}</strong>
          {infoLines.map((l) => (
            <p key={l} style={{ margin: '6px 0', fontSize: 13, opacity: 0.9 }}>
              {l}
            </p>
          ))}
        </div>

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
