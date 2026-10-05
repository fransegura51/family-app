// Eventos → 🍽️ «Menú del evento»: el espacio OPERATIVO del menú.
//   · «Comida y bebida» (configurador) = tomar decisiones. Esta pantalla = trabajar con el resultado.
//   · Tres áreas: COMENSALES (lo que PEPA ya sabe de Invitados/RSVP), MENÚ (secciones y platos) y HERRAMIENTAS
//     contextuales (Recetas y Lista de la compra, SOLO si la familia es quien prepara la comida).
//   · Esta pantalla LEE las decisiones de otros bloques; no guarda copias de ellas.
//   · Un plato es solo un nombre: la receta es opcional y PEPA jamás inventa recetas, ingredientes ni cantidades.
//   · Móvil primero: sin formularios en línea que se salgan del ancho; los formularios son hojas apiladas.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addEventMenuItem, deleteEventMenuItem, listEventMenuItems, saveEventMenuSections, updateEventMenuItem } from '@/data/events'
import { loadMenuHubData, type MenuHubData } from '@/data/eventMenuHub'
import { errorMessage } from '@/domain/errorMessage'
import { computeFoodNeedsState, conflictInputsSignature, findMenuConflicts } from '@/domain/eventDietaryNeeds'
import { buildFoodContext, ninosNeedMenuInfantil } from '@/domain/eventFood'
import { MENU_INFANTIL_SECTION_LABEL } from '@/domain/eventFoodMenu'
import {
  NO_FOOD_MESSAGE,
  TOOLS_WAITING_MESSAGE,
  addCustomSection,
  canHideSection,
  categoryForSection,
  conflictInfo,
  dishHasKitchenTools,
  menuToolsMode,
  removeCustomSection,
  reorderVisibleSections,
  resolveMenuSections,
  setSectionHidden,
  showKitchenLinks,
  type MenuToolsMode,
  type SectionView,
  type StoredSection,
} from '@/domain/eventMenuHub'
import { moveId } from '@/domain/eventDayPlan'
import type { EventMenuItem, FamilyEvent, Recipe } from '@/domain/types'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import { DinersPanel } from '@/ui/EventMenuDiners'
import { EventMenuImporter } from '@/ui/EventMenuImporter'
import { PickIngredientsModal } from '@/ui/PickIngredientsModal'
import { useDragReorder } from '@/ui/useDragReorder'
import { showToast } from '@/state/toast'

export function EventMenuSection({ event, onDerivedDataChanged }: { event: FamilyEvent; onDerivedDataChanged: () => void }) {
  const [data, setData] = useState<MenuHubData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await loadMenuHubData(event.id))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cargar el menú del evento'))
    }
  }, [event.id])
  useEffect(() => {
    void reload()
  }, [reload])

  // Cambios del MENÚ (platos, importación): basta volver a leer los platos; no hace falta recargar toda la pantalla.
  const reloadItems = useCallback(async () => {
    try {
      const items = await listEventMenuItems(event.id)
      setData((d) => (d ? { ...d, items } : d))
    } catch (err) {
      setError(errorMessage(err, 'No se pudo actualizar el menú'))
    }
  }, [event.id])
  // Las secciones se actualizan en pantalla al instante y se guardan aparte (una sola escritura).
  const setSections = useCallback((sections: StoredSection[]) => setData((d) => (d ? { ...d, sections } : d)), [])

  const needsState = useMemo(() => (data ? computeFoodNeedsState(data.guests, data.members, data.needs) : null), [data])

  if (!data || !needsState) {
    return (
      <div className="card event-card" style={{ marginTop: 8 }}>
        <strong>🍽️ Menú del evento</strong>
        {error ? <p className="error">{error}</p> : <p className="muted">Cargando…</p>}
      </div>
    )
  }

  const hasMomentLocation = data.moments.some((m) => Boolean(m.locationLabel?.trim()))
  const ctx = buildFoodContext(event, data.decisions, data.items, needsState, hasMomentLocation)
  const mode = menuToolsMode(ctx)

  return (
    <div className="card event-card" style={{ marginTop: 8 }}>
      <strong>🍽️ Menú del evento</strong>
      {error && <p className="error">{error}</p>}
      {mode === 'sin_comida' && (
        <p style={{ fontSize: 13, margin: '4px 0 0' }}>
          {NO_FOOD_MESSAGE}
          {data.items.length > 0 ? ' Lo que ya tenías guardado se conserva.' : ''}
        </p>
      )}
      <DinersPanel event={event} data={data} state={needsState} onChanged={() => void reload()} onDerivedDataChanged={onDerivedDataChanged} />
      {(mode !== 'sin_comida' || data.items.length > 0) && <MenuManager event={event} data={data} mode={mode} needsState={needsState} onReload={reloadItems} onSectionsChange={setSections} onError={setError} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// MENÚ: secciones → platos
// ---------------------------------------------------------------------
type DishTarget = { mode: 'new'; sectionLabel: string } | { mode: 'edit'; item: EventMenuItem }

export function MenuManager({
  event,
  data,
  mode,
  needsState,
  onReload,
  onSectionsChange,
  onError,
}: {
  event: FamilyEvent
  data: MenuHubData
  mode: MenuToolsMode
  needsState: ReturnType<typeof computeFoodNeedsState>
  // Vuelve a leer SOLO los platos.
  onReload: () => Promise<void>
  onSectionsChange?: (sections: StoredSection[]) => void
  onError: (message: string | null) => void
}) {
  const infantilNeeded = ninosNeedMenuInfantil(data.decisions)
  const resolved = useMemo(() => resolveMenuSections(data.sections, data.items, infantilNeeded), [data.sections, data.items, infantilNeeded])
  const recipeById = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes])
  const [dishSheet, setDishSheet] = useState<DishTarget | null>(null)
  const [sectionsOpen, setSectionsOpen] = useState(false)
  const [importing, setImporting] = useState<{ forcedSection: string | null } | null>(null)
  const [ingredientsFor, setIngredientsFor] = useState<EventMenuItem | null>(null)

  // Cruce menú ↔ necesidades: solo un AVISO para revisar, recalculado cuando cambia algo de verdad.
  const signature = conflictInputsSignature(data.items, needsState.activeNeeds)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const conflicts = useMemo(() => findMenuConflicts(data.items, needsState.activeNeeds), [signature])
  const conflictsByDish = useMemo(() => conflictInfo(conflicts, needsState.activeNeeds, data.guests, data.members), [conflicts, needsState.activeNeeds, data.guests, data.members])

  const hasItems = data.items.length > 0
  const sectionLabels = resolved.config.map((s) => s.label)
  const firstSectionLabel = resolved.visible.find((v) => !v.virtual)?.label ?? ''

  async function persistSections(next: StoredSection[]) {
    onSectionsChange?.(next)
    try {
      await saveEventMenuSections(event.id, next)
    } catch (err) {
      onError(errorMessage(err, 'No se pudieron guardar las secciones'))
    }
  }

  async function saveDish(target: DishTarget, values: DishValues) {
    if (target.mode === 'edit') {
      await updateEventMenuItem(target.item.id, { name: values.name, category: values.category, notes: values.notes, recipeId: values.recipeId, preparedBy: values.preparedBy })
    } else {
      await addEventMenuItem(event.id, values.name, values.category, null, { notes: values.notes, recipeId: values.recipeId, preparedBy: values.preparedBy })
    }
    setDishSheet(null)
    await onReload()
  }

  async function deleteDish(id: string) {
    try {
      await deleteEventMenuItem(id)
      await onReload()
    } catch (err) {
      onError(errorMessage(err, 'No se pudo borrar el plato'))
    }
  }

  function dishRow(dish: EventMenuItem) {
    const recipe = dish.recipeId ? recipeById.get(dish.recipeId) : undefined
    const tools = dishHasKitchenTools(mode, dish.preparedBy)
    const infos = conflictsByDish.get(dish.id) ?? []
    return (
      <div key={dish.id}>
        <div className="menu-dish">
          <button type="button" className="menu-dish-main" onClick={() => setDishSheet({ mode: 'edit', item: dish })}>
            <span className="menu-dish-name">{dish.name}</span>
            {dish.notes && <span className="menu-dish-note">{dish.notes}</span>}
            <span className="menu-dish-badges">
              {mode === 'mixto' && <span>{dish.preparedBy === 'familia' ? '🏠 Nosotros' : dish.preparedBy === 'proveedor' ? '🍴 Proveedor' : '❔ Sin indicar quién lo prepara'}</span>}
              {tools && recipe && <span>📖 {recipe.title}</span>}
              {dish.source === 'importado' && <span>importado</span>}
            </span>
          </button>
          {tools && recipe && recipe.ingredients.length > 0 && (
            <button type="button" className="link-button" aria-label={`Elegir ingredientes de ${dish.name} para Compras`} onClick={() => setIngredientsFor(dish)}>
              🛒
            </button>
          )}
          <ConfirmIconButton icon="✕" className="icon-button" ariaLabel={`Borrar ${dish.name}`} onConfirm={() => void deleteDish(dish.id)} />
        </div>
        {infos.map((info) => (
          <details key={`${dish.id}-${info.category}`} className="menu-conflict">
            <summary>⚠️ {info.headline}</summary>
            <p>{info.detail}</p>
            <p className="muted">Es un aviso para revisar, no una certeza: confírmalo con quien prepara el plato o con el restaurante.</p>
          </details>
        ))}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="muted" style={{ fontSize: 12, fontWeight: 600 }}>
        MENÚ
      </div>

      {importing ? (
        <EventMenuImporter
          eventId={event.id}
          kind={importing.forcedSection ? 'menu_infantil' : 'menu_principal'}
          forcedSection={importing.forcedSection}
          sectionLabels={sectionLabels}
          needsHint={needsState.activeNeeds.length > 0 || data.needs.length > 0}
          onCancel={() => setImporting(null)}
          onDone={() => {
            setImporting(null)
            void onReload()
          }}
        />
      ) : !hasItems ? (
        <div style={{ marginTop: 4 }}>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>
            Todavía no hay menú guardado. Puedes importarlo de un documento o escribirlo tú: un plato es solo su nombre.
          </p>
          <div className="filter-row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="chip" onClick={() => setImporting({ forcedSection: null })}>
              📷 Hacer una foto · 🖼️ Elegir una foto · 📄 Subir PDF
            </button>
            <button type="button" className="chip" onClick={() => setDishSheet({ mode: 'new', sectionLabel: firstSectionLabel })}>
              ✏️ Añadirlo manualmente
            </button>
          </div>
        </div>
      ) : (
        <div className="menu-toolbar">
          <button type="button" onClick={() => setDishSheet({ mode: 'new', sectionLabel: firstSectionLabel })}>
            + Añadir plato
          </button>
          <button type="button" className="link-button" onClick={() => setImporting({ forcedSection: null })}>
            📷 Importar menú
          </button>
          <button type="button" className="link-button" onClick={() => setSectionsOpen(true)}>
            ⚙️ Gestionar secciones
          </button>
        </div>
      )}

      {!importing &&
        hasItems &&
        resolved.visible.map((view) => (
          <div key={view.key} className="menu-section">
            <div className="menu-section-head">
              <strong>{view.label}</strong>
              <span className="muted"> · {view.items.length}</span>
              <span style={{ flex: 1 }} />
              {view.key === 'menu_infantil' && (
                <button type="button" className="link-button" onClick={() => setImporting({ forcedSection: MENU_INFANTIL_SECTION_LABEL })}>
                  📷 Importar
                </button>
              )}
              <button type="button" className="link-button" onClick={() => setDishSheet({ mode: 'new', sectionLabel: categoryForSection(view) ?? '' })}>
                + plato
              </button>
            </div>
            {view.items.length === 0 ? <p className="muted menu-empty">Sin platos todavía.</p> : view.items.map(dishRow)}
          </div>
        ))}

      {!importing && !hasItems && (
        <button type="button" className="link-button" style={{ marginTop: 6 }} onClick={() => setSectionsOpen(true)}>
          ⚙️ Gestionar secciones
        </button>
      )}

      <ToolsFooter mode={mode} />

      {dishSheet && (
        <DishSheet
          target={dishSheet}
          mode={mode}
          sections={resolved.visible}
          recipes={data.recipes}
          onClose={() => setDishSheet(null)}
          onSave={(values) => saveDish(dishSheet, values)}
        />
      )}
      {sectionsOpen && <SectionsSheet resolved={resolved} onChange={(next) => void persistSections(next)} onClose={() => setSectionsOpen(false)} />}
      {ingredientsFor && ingredientsFor.recipeId && recipeById.get(ingredientsFor.recipeId) && (
        <PickIngredientsModal
          recipe={recipeById.get(ingredientsFor.recipeId) as Recipe}
          stores={data.stores}
          eventId={event.id}
          dishName={ingredientsFor.name}
          onCancel={() => setIngredientsFor(null)}
          onDone={(count) => {
            setIngredientsFor(null)
            showToast(`✓ ${count} ingrediente${count === 1 ? '' : 's'} añadido${count === 1 ? '' : 's'} a Compras`)
          }}
          onError={(message) => onError(message)}
        />
      )}
    </div>
  )
}

// Herramientas contextuales: dependen SOLO de quién se encarga de la comida (decisión de «Comida y bebida»).
function ToolsFooter({ mode }: { mode: MenuToolsMode }) {
  if (mode === 'sin_comida') return null
  if (mode === 'esperando') {
    return (
      <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
        {TOOLS_WAITING_MESSAGE}
      </p>
    )
  }
  if (!showKitchenLinks(mode)) {
    return (
      <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
        La comida la pone el restaurante, el catering o el lugar: aquí guardas su menú y revisas comensales y necesidades.
      </p>
    )
  }
  return (
    <div style={{ marginTop: 8 }}>
      <div className="menu-toolbar">
        <Link className="link-button" to="/alimentacion?tab=recetas">
          📖 Recetas
        </Link>
        <Link className="link-button" to="/compras" state={{ tab: 'Lista' }}>
          🛒 Ir a Lista de la compra
        </Link>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
        {mode === 'mixto' ? 'En un evento mixto, indica en cada plato quién se encarga: solo los vuestros usan Recetas y Compras. ' : ''}
        Un plato puede ser solo su nombre; enlazar una receta es opcional. PEPA no inventa ingredientes: al pulsar 🛒 eliges tú qué pasa a Compras.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------
// Hoja «Añadir / Editar plato»
// ---------------------------------------------------------------------
interface DishValues {
  name: string
  category: string | null
  notes: string | null
  recipeId: string | null
  preparedBy: 'familia' | 'proveedor' | null
}

export function DishSheet({
  target,
  mode,
  sections,
  recipes,
  onClose,
  onSave,
}: {
  target: DishTarget
  mode: MenuToolsMode
  sections: SectionView[]
  recipes: Recipe[]
  onClose: () => void
  onSave: (values: DishValues) => Promise<void>
}) {
  const initial = target.mode === 'edit' ? target.item : null
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial ? (initial.category ?? '') : target.mode === 'new' ? target.sectionLabel : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [preparedBy, setPreparedBy] = useState<'familia' | 'proveedor' | ''>(initial?.preparedBy ?? '')
  const [recipeId, setRecipeId] = useState(initial?.recipeId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options = sections.map((s) => s.label)
  if (category && !options.includes(category)) options.push(category)
  // Receta: solo si lo prepara la familia (decisión del evento o, en un evento mixto, la de este plato).
  const showRecipe = mode === 'familia' || (mode === 'mixto' && preparedBy === 'familia')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Ponle un nombre al plato.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name,
        category: category || null,
        notes: notes.trim() || null,
        recipeId: recipeId || null,
        preparedBy: mode === 'mixto' ? (preparedBy || null) : (initial?.preparedBy ?? null),
      })
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar el plato'))
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {initial ? 'Editar plato' : 'Añadir plato'}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <form className="card member-form" onSubmit={submit}>
          {error && <p className="error">{error}</p>}
          <label>
            Plato
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} autoFocus />
          </label>
          <label>
            Sección
            <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
              <option value="">Sin sección</option>
              {options.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nota (opcional)
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
          </label>
          {mode === 'mixto' && (
            <label>
              ¿Quién lo prepara?
              <select value={preparedBy} onChange={(e) => setPreparedBy(e.target.value as 'familia' | 'proveedor' | '')} disabled={saving}>
                <option value="">Sin indicar</option>
                <option value="familia">🏠 Lo preparamos nosotros</option>
                <option value="proveedor">🍴 Lo pone el restaurante / catering / lugar</option>
              </select>
            </label>
          )}
          {showRecipe && (
            <label>
              Receta (opcional)
              <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} disabled={saving}>
                <option value="">Sin receta enlazada</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    📖 {r.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Hoja «Gestionar secciones»: activar, ocultar, recuperar, crear y ordenar
// ---------------------------------------------------------------------
export function SectionsSheet({ resolved, onChange, onClose }: { resolved: ReturnType<typeof resolveMenuSections>; onChange: (next: StoredSection[]) => void; onClose: () => void }) {
  const config = resolved.config
  const visible = resolved.visible.filter((v) => !v.virtual)
  const hidden = resolved.hidden
  const visibleKeys = visible.map((v) => v.key)
  const drag = useDragReorder(visibleKeys, (keys) => onChange(reorderVisibleSections(config, keys)))
  const byKey = new Map(visible.map((v) => [v.key, v]))
  const order = drag.order.filter((k) => byKey.has(k))
  const [label, setLabel] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  function move(key: string, delta: -1 | 1) {
    const next = moveId(order, key, delta)
    if (next === order) return
    drag.setOrder(next)
    onChange(reorderVisibleSections(config, next))
  }

  function add(e: FormEvent) {
    e.preventDefault()
    const result = addCustomSection(config, label)
    setMessage(result.error ?? (result.revived ? 'Esa sección ya existía: la he vuelto a mostrar.' : null))
    if (result.error) return
    setLabel('')
    onChange(result.config)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Gestionar secciones
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Elige las secciones que quieres ver. No hace falta usarlas todas; ocultar una nunca borra platos.
        </p>

        <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 8 }}>
          EN EL MENÚ
        </div>
        {order.map((key, index) => {
          const view = byKey.get(key) as SectionView
          const canHide = canHideSection(view)
          const dragging = drag.draggingId === key
          return (
            <div key={key} data-reorder-row className={'dayplan-row' + (dragging ? ' dayplan-row-dragging' : '')} style={dragging ? { transform: `translateY(${drag.dragOffset}px)` } : undefined}>
              <span className="drag-handle" style={{ touchAction: 'none' }} role="button" aria-label={`Arrastrar ${view.label} para reordenar`} {...drag.handleProps(key)}>
                ☰
              </span>
              <span className="dayplan-main" style={{ cursor: 'default' }}>
                <span className="dayplan-body">
                  <span className="dayplan-title">{view.label}</span>
                  {view.items.length > 0 && <span className="dayplan-note">{view.items.length} plato{view.items.length === 1 ? '' : 's'} · para ocultarla, muévelos o bórralos antes</span>}
                </span>
              </span>
              <button type="button" className="icon-button" aria-label={`Subir ${view.label}`} disabled={index === 0} onClick={() => move(key, -1)}>
                ▲
              </button>
              <button type="button" className="icon-button" aria-label={`Bajar ${view.label}`} disabled={index === order.length - 1} onClick={() => move(key, 1)}>
                ▼
              </button>
              <button type="button" className="link-button" disabled={!canHide} onClick={() => onChange(setSectionHidden(config, key, true))}>
                Ocultar
              </button>
            </div>
          )
        })}

        {hidden.length > 0 && (
          <>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 10 }}>
              OCULTAS (toca para volver a mostrar)
            </div>
            {hidden.map((view) => (
              <div key={view.key} className="dayplan-row">
                <span className="dayplan-main" style={{ cursor: 'default' }}>
                  <span className="dayplan-title">{view.label}</span>
                </span>
                <button type="button" className="link-button" onClick={() => onChange(setSectionHidden(config, view.key, false))}>
                  Mostrar
                </button>
                {view.custom && <ConfirmIconButton icon="✕" className="icon-button" ariaLabel={`Quitar del todo ${view.label}`} onConfirm={() => onChange(removeCustomSection(config, view.key))} />}
              </div>
            ))}
          </>
        )}

        <form onSubmit={add} className="member-form" style={{ marginTop: 10 }}>
          <label>
            + Añadir otra sección
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Por ejemplo: Platos para llevar" />
          </label>
          {message && <p className="muted" style={{ fontSize: 12, margin: 0 }}>{message}</p>}
          <button type="submit" disabled={!label.trim()}>
            Añadir sección
          </button>
        </form>
      </div>
    </div>
  )
}
