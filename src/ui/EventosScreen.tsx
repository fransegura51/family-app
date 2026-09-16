import { FormEvent, useEffect, useState } from 'react'
import {
  addEventTask,
  archiveEvent,
  createEvent,
  deleteEvent,
  deleteEventTask,
  duplicateEvent,
  listEventTasks,
  listEvents,
  recalculateAutoTasks,
  unarchiveEvent,
  updateEvent,
  updateEventTask,
} from '@/data/events'
import { errorMessage } from '@/domain/errorMessage'
import { CELEBRATION_SUBTYPES, EVENT_MODULES, EVENT_TYPES, EVENT_TYPE_META, RECOMMENDED_MODULES } from '@/domain/events'
import type { EventModuleKey, EventTask, EventType, FamilyEvent } from '@/domain/types'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'

// Módulo Eventos (PEPA Events) — Fase 0 del plan aprobado en
// C:\Users\Usuario\.claude\plans\zany-wishing-brook.md: motor común
// configurable (alta mínima + selector de módulos), pantalla de inicio
// del evento con "Pendiente ahora", checklist por tipo, y Archivar/
// Duplicar básicos. El resto de módulos (invitados, presupuesto,
// menú+compra, invitaciones/RSVP...) llegan en fases siguientes — aquí
// solo se muestran como chips "próximamente" dentro de sus grupos.
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

      {MODULE_GROUPS.map((group) => {
        const groupModules = group.keys.filter((k) => event.enabledModules.includes(k))
        if (groupModules.length === 0) return null
        return (
          <div key={group.title} className="card event-card" style={{ marginTop: 8 }}>
            <strong>{group.title}</strong>
            <div className="filter-row" style={{ flexWrap: 'wrap', marginTop: 4 }}>
              {groupModules.map((key) => {
                const meta = EVENT_MODULES.find((m) => m.key === key)
                if (!meta) return null
                const isReady = key === 'tareas'
                return (
                  <span key={key} className="chip" style={{ opacity: isReady ? 1 : 0.6 }}>
                    {meta.icon} {meta.label}
                    {!isReady ? ' · próximamente' : ''}
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
