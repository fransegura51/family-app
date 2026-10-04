// Eventos → 🗓️ Plan del día (Fase 1: editable). Un cronograma sencillo, pensado primero para el móvil:
//   · CON HORA: cronológico automático (la hora manda; el orden manual solo desempata coincidencias).
//   · SIN HORA: orden manual (asa ☰ para arrastrar, o ▲▼ para quien no pueda/quiera arrastrar).
//   · Tocar un momento lo edita (nombre, hora opcional, nota, «Mostrar al compartir») en la MISMA fila.
//   · Dos o más momentos a la misma hora: se avisa UNA vez por grupo y se guarda lo que decida la familia.
//   · El × de un momento que viene de «Comida y bebida» explica la relación antes de tocar nada.
// Las reglas viven en domain/eventDayPlan (puras y con pruebas); aquí solo hay pantalla.
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  addEventDayPlanItem,
  deleteEventDayPlanItem,
  listEventDayPlan,
  reorderEventDayPlan,
  resolveGeneratedDayPlanItem,
  updateEventDayPlanItem,
} from '@/data/events'
import {
  coincidenceHeadline,
  draftFromItem,
  draftToPatch,
  EMPTY_DAY_PLAN_DRAFT,
  isLinkedGenerated,
  isPatchEmpty,
  moveId,
  pendingCoincidenceFor,
  splitDayPlan,
  timeGroups,
  timeKey,
  validateDayPlanDraft,
  type DayPlanDraft,
  type TimeGroup,
} from '@/domain/eventDayPlan'
import { errorMessage } from '@/domain/errorMessage'
import type { EventDayPlanItem } from '@/domain/types'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import { useDragReorder } from '@/ui/useDragReorder'

type EditTarget = { mode: 'new' } | { mode: 'edit'; item: EventDayPlanItem }
type CoincidenceStep = 'ask' | 'order' | 'change'

export function DayPlanSection({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventDayPlanItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [removing, setRemoving] = useState<EventDayPlanItem | null>(null)
  const [coincidence, setCoincidence] = useState<{ time: string; step: CoincidenceStep } | null>(null)

  async function reload(): Promise<EventDayPlanItem[]> {
    try {
      const fresh = await listEventDayPlan(eventId)
      setItems(fresh)
      return fresh
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar el plan del día'))
      return items
    }
  }
  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const view = useMemo(() => splitDayPlan(items), [items])
  const groups = useMemo(() => timeGroups(view.timed), [view.timed])
  const groupByTime = new Map(groups.map((g) => [g.time, g]))
  const untimedIds = view.untimed.map((i) => i.id)
  const drag = useDragReorder(untimedIds, (ids) => void commitUntimedOrder(ids))
  const untimedById = new Map(view.untimed.map((i) => [i.id, i]))
  const untimedOrder = drag.order.filter((id) => untimedById.has(id))

  async function commitUntimedOrder(ids: string[]) {
    setError(null)
    try {
      await reorderEventDayPlan(ids)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar el orden'))
    }
    await reload()
  }

  function moveUntimed(id: string, delta: -1 | 1) {
    const next = moveId(untimedOrder, id, delta)
    if (next === untimedOrder) return
    drag.setOrder(next)
    void commitUntimedOrder(next)
  }

  // Un único guardado coherente (nombre + hora + nota + visibilidad) sobre ESA fila; después, si se ha puesto o
  // cambiado una hora y coincide con otros momentos sin confirmar, se pregunta una sola vez por el grupo.
  async function saveItem(target: EditTarget, draft: DayPlanDraft) {
    let itemId: string
    let timeChanged: boolean
    if (target.mode === 'edit') {
      const patch = draftToPatch(draft, target.item)
      itemId = target.item.id
      timeChanged = patch.itemTime !== undefined && patch.itemTime !== null
      if (!isPatchEmpty(patch)) await updateEventDayPlanItem(itemId, patch)
    } else {
      itemId = await addEventDayPlanItem(eventId, draft.title, timeKey(draft.time), draft.note, null, draft.showOnShare)
      timeChanged = timeKey(draft.time) !== null
    }
    const fresh = await reload()
    setEditing(null)
    if (timeChanged) {
      const group = pendingCoincidenceFor(fresh, itemId)
      if (group) setCoincidence({ time: group.time, step: 'ask' })
    }
  }

  async function removeManual(item: EventDayPlanItem) {
    setError(null)
    try {
      await deleteEventDayPlanItem(item.id)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo borrar'))
    }
    await reload()
  }

  async function resolveGenerated(item: EventDayPlanItem, mode: 'both' | 'independent') {
    setError(null)
    try {
      await resolveGeneratedDayPlanItem(item, mode)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo quitar'))
    }
    setRemoving(null)
    await reload()
  }

  async function confirmOrder(ids: string[]) {
    await reorderEventDayPlan(ids, true)
    setCoincidence(null)
    await reload()
  }

  const activeGroup = coincidence ? (groupByTime.get(coincidence.time) ?? null) : null
  // Si el grupo ya no existe (se cambió una hora y queda un solo momento), el aviso se cierra solo.
  useEffect(() => {
    if (coincidence && !activeGroup) setCoincidence(null)
  }, [coincidence, activeGroup])

  function removeButton(item: EventDayPlanItem) {
    if (isLinkedGenerated(item)) {
      return (
        <button type="button" className="icon-button" aria-label={`Quitar ${item.title}`} onClick={() => setRemoving(item)}>
          ✕
        </button>
      )
    }
    return <ConfirmIconButton icon="✕" className="icon-button" ariaLabel={`Borrar ${item.title}`} onConfirm={() => void removeManual(item)} />
  }

  function itemLabel(item: EventDayPlanItem) {
    return (
      <span className="dayplan-body">
        <span className="dayplan-title">
          {item.title}
          {isLinkedGenerated(item) && (
            <span className="dayplan-badge" title="Viene de Comida y bebida" aria-label="Viene de Comida y bebida">
              {' '}
              🍽️
            </span>
          )}
          {!item.showOnShare && <span className="dayplan-internal"> · solo para vosotros</span>}
        </span>
        {item.note && <span className="dayplan-note">{item.note}</span>}
      </span>
    )
  }

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🗓️ Plan del día</strong>
      {error && <p className="error">{error}</p>}

      {items.length === 0 && <p className="muted">Todavía no hay plan del día.</p>}

      {view.timed.length > 0 && (
        <div className="event-list" style={{ marginTop: 8 }}>
          {view.timed.map((item, index) => {
            const time = timeKey(item.itemTime) as string
            const group = groupByTime.get(time)
            const next = view.timed[index + 1]
            const isLastOfGroup = Boolean(group) && (!next || timeKey(next.itemTime) !== time)
            return (
              <div key={item.id}>
                <div className="dayplan-row">
                  <button type="button" className="dayplan-main" onClick={() => setEditing({ mode: 'edit', item })}>
                    <span className="dayplan-time">{time}</span>
                    {itemLabel(item)}
                  </button>
                  {removeButton(item)}
                </div>
                {group && isLastOfGroup && (
                  <button type="button" className={'dayplan-coincide' + (group.confirmed ? '' : ' dayplan-coincide-pending')} onClick={() => setCoincidence({ time: group.time, step: group.confirmed ? 'order' : 'ask' })}>
                    {group.confirmed ? '↳ Coinciden · cambiar orden' : '↳ Misma hora · ¿coinciden?'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {untimedOrder.length > 0 && (
        <>
          <div className="dayplan-section-title">Sin hora</div>
          <div className="event-list">
            {untimedOrder.map((id, index) => {
              const item = untimedById.get(id) as EventDayPlanItem
              const dragging = drag.draggingId === id
              return (
                <div key={id} data-reorder-row className={'dayplan-row' + (dragging ? ' dayplan-row-dragging' : '')} style={dragging ? { transform: `translateY(${drag.dragOffset}px)` } : undefined}>
                  <span className="drag-handle" style={{ touchAction: 'none' }} role="button" aria-label={`Arrastrar ${item.title} para reordenar`} {...drag.handleProps(id)}>
                    ☰
                  </span>
                  <button type="button" className="dayplan-main" onClick={() => setEditing({ mode: 'edit', item })}>
                    {itemLabel(item)}
                  </button>
                  <button type="button" className="icon-button" aria-label={`Subir ${item.title}`} disabled={index === 0} onClick={() => moveUntimed(id, -1)}>
                    ▲
                  </button>
                  <button type="button" className="icon-button" aria-label={`Bajar ${item.title}`} disabled={index === untimedOrder.length - 1} onClick={() => moveUntimed(id, 1)}>
                    ▼
                  </button>
                  {removeButton(item)}
                </div>
              )
            })}
          </div>
        </>
      )}

      <button type="button" className="link-button" style={{ marginTop: 8 }} onClick={() => setEditing({ mode: 'new' })}>
        + Añadir momento
      </button>

      {editing && <DayPlanEditSheet target={editing} onClose={() => setEditing(null)} onSave={(draft) => saveItem(editing, draft)} />}

      {removing && <RemoveGeneratedDialog item={removing} onClose={() => setRemoving(null)} onChoose={(mode) => void resolveGenerated(removing, mode)} />}

      {coincidence && activeGroup && !editing && (
        <CoincidenceDialog
          group={activeGroup}
          step={coincidence.step}
          onStep={(step) => setCoincidence({ time: coincidence.time, step })}
          onClose={() => setCoincidence(null)}
          onConfirmOrder={confirmOrder}
          onEditItem={(item) => setEditing({ mode: 'edit', item })}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Hoja «Editar momento» / «Añadir momento»
// ---------------------------------------------------------------------
function DayPlanEditSheet({ target, onClose, onSave }: { target: EditTarget; onClose: () => void; onSave: (draft: DayPlanDraft) => Promise<void> }) {
  const original = target.mode === 'edit' ? target.item : null
  const [draft, setDraft] = useState<DayPlanDraft>(original ? draftFromItem(original) : EMPTY_DAY_PLAN_DRAFT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    const problem = validateDayPlanDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {original ? 'Editar momento' : 'Añadir momento'}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={handleSubmit}>
          {error && <p className="error">{error}</p>}
          {original && isLinkedGenerated(original) && (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              🍽️ Viene de «Comida y bebida». Puedes cambiarle el nombre, la hora o la nota: seguirá enlazado a su momento.
            </p>
          )}
          <label>
            Nombre
            <input type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} disabled={saving} />
          </label>
          <label>
            🕐 Hora (opcional)
            <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} disabled={saving} />
          </label>
          {draft.time && (
            <button type="button" className="link-button" disabled={saving} onClick={() => setDraft({ ...draft, time: '' })}>
              Quitar la hora
            </button>
          )}
          <label>
            Nota (opcional)
            <textarea value={draft.note} rows={3} onChange={(e) => setDraft({ ...draft, note: e.target.value })} disabled={saving} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={draft.showOnShare} onChange={(e) => setDraft({ ...draft, showOnShare: e.target.checked })} disabled={saving} />
            <span>Mostrar al compartir</span>
          </label>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Si lo desmarcas, este momento es solo para vosotros y no saldrá en el plan que compartáis.
          </p>
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// × sobre un momento que viene de «Comida y bebida»
// ---------------------------------------------------------------------
function RemoveGeneratedDialog({ item, onClose, onChoose }: { item: EventDayPlanItem; onClose: () => void; onChoose: (mode: 'both' | 'independent') => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Quitar «{item.title}»
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="card member-form">
          <p style={{ margin: 0 }}>Este momento viene de «Comida y bebida». ¿Qué quieres hacer?</p>
          <button type="button" onClick={() => onChoose('both')}>
            Quitar de ambos
          </button>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Se quita del Plan del día y se desmarca en «Comida y bebida».
          </p>
          <button type="button" onClick={() => onChoose('independent')}>
            Mantener como independiente
          </button>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Se queda en el Plan del día con su nombre, hora y nota, pero deja de estar ligado a «Comida y bebida».
          </p>
          <button type="button" className="link-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Varios momentos a la misma hora (2, 3 o más): UN solo diálogo para el grupo entero
// ---------------------------------------------------------------------
function CoincidenceDialog({
  group,
  step,
  onStep,
  onClose,
  onConfirmOrder,
  onEditItem,
}: {
  group: TimeGroup
  step: CoincidenceStep
  onStep: (step: CoincidenceStep) => void
  onClose: () => void
  onConfirmOrder: (orderedIds: string[]) => Promise<void>
  onEditItem: (item: EventDayPlanItem) => void
}) {
  const [order, setOrder] = useState(group.items.map((i) => i.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const byId = new Map(group.items.map((i) => [i.id, i]))
  // Si el grupo cambia por fuera (otro momento entra o sale), el orden de trabajo se rehace.
  const groupKey = group.items.map((i) => i.id).join('|')
  useEffect(() => {
    setOrder(group.items.map((i) => i.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await onConfirmOrder(order)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el orden'))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {coincidenceHeadline(group)}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="card member-form">
          {error && <p className="error">{error}</p>}
          {step === 'ask' && (
            <>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {group.items.map((i) => (
                  <li key={i.id}>{i.title}</li>
                ))}
              </ul>
              <p style={{ margin: 0 }}>¿Es correcto que sean a la misma hora?</p>
              <button type="button" onClick={() => onStep('order')}>
                Sí, coinciden
              </button>
              <button type="button" onClick={() => onStep('change')}>
                No, quiero cambiar una hora
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                Decidirlo más tarde
              </button>
            </>
          )}
          {step === 'order' && (
            <>
              <p style={{ margin: 0 }}>¿Cuál quieres que aparezca primero en el Plan del día?</p>
              {order.map((id, index) => (
                <div key={id} className="dayplan-row">
                  <span className="dayplan-main" style={{ cursor: 'default' }}>
                    <span className="dayplan-time">{group.time}</span>
                    <span className="dayplan-title">{byId.get(id)?.title}</span>
                  </span>
                  <button type="button" className="icon-button" aria-label={`Subir ${byId.get(id)?.title}`} disabled={index === 0 || saving} onClick={() => setOrder(moveId(order, id, -1))}>
                    ▲
                  </button>
                  <button type="button" className="icon-button" aria-label={`Bajar ${byId.get(id)?.title}`} disabled={index === order.length - 1 || saving} onClick={() => setOrder(moveId(order, id, 1))}>
                    ▼
                  </button>
                </div>
              ))}
              <button type="button" disabled={saving} onClick={() => void save()}>
                {saving ? 'Guardando…' : 'Guardar orden'}
              </button>
              <button type="button" className="link-button" disabled={saving} onClick={() => onStep('ask')}>
                Atrás
              </button>
            </>
          )}
          {step === 'change' && (
            <>
              <p style={{ margin: 0 }}>¿A cuál le cambias la hora?</p>
              {group.items.map((i) => (
                <div key={i.id} className="dayplan-row">
                  <span className="dayplan-main" style={{ cursor: 'default' }}>
                    <span className="dayplan-title">
                      {i.title} — {group.time}
                    </span>
                  </span>
                  <button type="button" className="link-button" onClick={() => onEditItem(i)}>
                    Cambiar hora
                  </button>
                </div>
              ))}
              <button type="button" className="link-button" onClick={() => onStep('ask')}>
                Atrás
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
