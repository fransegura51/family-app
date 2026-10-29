import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { adminEditProposal, adminListProposals } from '@/data/community'
import type { RecipeDraftInput } from '@/domain/community'
import { stepsFromNotes, stepsToText } from '@/domain/communityRecipeBridge'
import {
  EDIT_DAYS,
  EDIT_DAY_SHORT,
  EDIT_MEALS,
  MAX_RECIPES_PER_MEAL,
  addRecipe,
  buildMenuPayload,
  changedMealTitles,
  emptyRecipeForm,
  formToRecipe,
  mealOf,
  menuChanged,
  moveRecipe,
  recipeToForm,
  recipesOf,
  removeRecipe,
  replaceRecipe,
  setMealFields,
  toEditableMenuItem,
  validateMenuLocal,
  validateRecipeForm,
  type EditableMenuItem,
  type MenuMealKey,
  type Rec,
  type RecipeForm,
} from '@/domain/communityMenuEdit'
import { communityErrorText } from '@/domain/communityErrors'
import { UnsavedChangesDialog } from '@/ui/community/UnsavedChangesDialog'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import { RecipeFields } from '@/ui/community/recipes/RecipeFields'
import { ActionNotice, AdminError, AdminLoading, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { MenuCheckSummary, MenuPreview } from '@/ui/community/admin/MenuPreview'
import { useAdminAction } from '@/ui/community/admin/useAdminData'
import '@/ui/community/admin/menuEditor.css'

// Editor del MENÚ SEMANAL oficial: Semana → Día → Comida → platos y recetas. No es el editor de artículos: trabaja con los siete días, la comida y la cena de cada uno y
// las recetas de cada comida (la primera es el plato principal; las demás, acompañamientos o elementos sencillos). Todo se edita en el propio Centro Editorial.
// Qué NO hace: guardar nunca aprueba ni publica (el servidor sube la versión y exige aprobar de nuevo), no toca fechas ni programación (el contenido completo del elemento se
// conserva y solo cambia `menu`) y no toca recetas de la Cocina ni de otras familias (edita solo el contenido del menú oficial).

type SheetMode = 'edit' | 'replace' | 'new'
interface SheetState {
  day: number
  meal: MenuMealKey
  index: number
  mode: SheetMode
  simple: boolean
  /** Receta tal cual estaba (para conservar lo que el formulario no muestra); null si es nueva o sustituida. */
  original: Rec | null
  form: RecipeForm
}

const MEAL_LABEL: Record<MenuMealKey, string> = { comida: 'Comida', cena: 'Cena' }

async function loadItem(id: string): Promise<EditableMenuItem> {
  // `adminGetMenu` solo devuelve el menú; para conservar la programación y la fuente hace falta el contenido completo del elemento (lo da la lista de propuestas).
  for (const status of ['proposed', 'approved'] as const) {
    const rows = await adminListProposals(status)
    const row = rows.find((r) => r.id === id)
    if (row) {
      const item = toEditableMenuItem(row)
      if (item) return item
    }
  }
  throw new Error('NOT_AVAILABLE')
}

export function MenuEditor({
  menuId,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  menuId: string
  onClose: () => void
  onSaved: (message: string) => void
  /** Avisa de si hay cambios sin guardar (para proteger el cambio de sección). */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const uid = useId()
  const [item, setItem] = useState<EditableMenuItem | null>(null)
  const [menu, setMenu] = useState<Rec | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [day, setDay] = useState(0)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [preview, setPreview] = useState(false)
  const [closing, setClosing] = useState(false)
  const action = useAdminAction()

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const loaded = await loadItem(menuId)
      setItem(loaded)
      setMenu(loaded.menu)
    } catch (e) {
      setLoadError(e instanceof Error && e.message === 'NOT_AVAILABLE' ? 'Este menú ya no se puede editar (puede que se haya publicado o descartado).' : communityErrorText(e))
    } finally {
      setLoading(false)
    }
  }, [menuId])
  useEffect(() => {
    void load()
  }, [load])

  const dirty = item !== null && menu !== null && menuChanged(item.menu, menu)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  const problem = useMemo(() => (menu ? validateMenuLocal(menu) : null), [menu])
  const titleChanges = useMemo(() => (item && menu ? changedMealTitles(item.menu, menu) : []), [item, menu])

  if (loading && !item) return <AdminLoading label="Cargando el menú para editarlo…" />
  if (loadError || !item || !menu) return <AdminError message={loadError ?? 'No se ha podido cargar el menú.'} onRetry={() => void load()} />

  const servings = typeof menu.servings === 'number' ? menu.servings : 4

  const save = async (): Promise<boolean> => {
    if (!dirty || problem) return false
    const r = await action.run(() => adminEditProposal(item.id, item.title, item.body, buildMenuPayload(item.payload, menu), null))
    if (!r.ok) return false
    const approved = item.status === 'approved'
    onSaved(
      `Menú guardado como versión ${r.result}. No se ha aprobado ni publicado${approved ? ': vuelve a estar pendiente de aprobar' : ': sigue pendiente de aprobar'}.`,
    )
    // Se vuelve a leer lo guardado: es la base nueva para detectar cambios y muestra el estado real del servidor.
    await load()
    return true
  }

  const requestClose = () => {
    if (dirty) setClosing(true)
    else onClose()
  }

  const openRecipe = (d: number, meal: MenuMealKey, index: number, mode: SheetMode, simple = false) => {
    const current = mode === 'edit' ? (recipesOf(menu, d, meal)[index] ?? null) : null
    setSheet({ day: d, meal, index, mode, simple: current ? current.simple === true : simple, original: current, form: current ? recipeToForm(current) : emptyRecipeForm(servings, simple) })
  }

  const saveRecipe = (s: SheetState): string | null => {
    const err = validateRecipeForm(s.original, s.form)
    if (err) return err
    const recipe = formToRecipe(s.original, s.form)
    setMenu(s.mode === 'new' ? addRecipe(menu, s.day, s.meal, recipe) : replaceRecipe(menu, s.day, s.meal, s.index, recipe))
    setSheet(null)
    return null
  }

  return (
    <section className="cadm-menued" aria-labelledby={`${uid}-title`} data-help-id="comunidad.menu-editor">
      <header className="cadm-menued-head">
        <h4 id={`${uid}-title`}>Editar el menú: {item.title}</h4>
        <p className="muted cadm-small">
          Versión {item.version} · {item.status === 'approved' ? 'Aprobado o programado' : 'Borrador pendiente de aprobar'}
        </p>
      </header>

      <p className="muted cadm-small">
        Guardar el menú no lo aprueba ni lo publica. No cambia la fecha ni la programación. Solo se edita el contenido de este menú oficial: no se toca ninguna receta de la Cocina de ninguna familia.
      </p>
      {item.status === 'approved' && (
        <p className="cadm-notice cadm-notice-error" role="note">
          Este menú ya está aprobado. Si guardas cambios, vuelve a estar pendiente de aprobar y hará falta aprobarlo de nuevo antes de que se publique.
        </p>
      )}
      <ActionNotice error={action.error} />

      <div className="cadm-menued-days" role="tablist" aria-label="Días de la semana" data-help-id="comunidad.menu-editor-dias">
        {EDIT_DAYS.map((name, i) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${uid}-tab-${i}`}
            aria-selected={day === i}
            aria-controls={`${uid}-panel`}
            aria-label={name}
            className={`cadm-menued-day${day === i ? ' active' : ''}`}
            onClick={() => setDay(i)}
          >
            {EDIT_DAY_SHORT[i]}
          </button>
        ))}
      </div>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${day}`} className="cadm-menued-panel">
        <h5 className="cadm-menued-dayname">{EDIT_DAYS[day].charAt(0).toUpperCase() + EDIT_DAYS[day].slice(1)}</h5>
        {EDIT_MEALS.map(({ key }) => {
          const meal = mealOf(menu, day, key)
          if (!meal) return null
          const recipes = recipesOf(menu, day, key)
          const label = `${MEAL_LABEL[key]} del ${EDIT_DAYS[day]}`
          return (
            <section key={key} className="cadm-menued-meal" aria-label={label}>
              <h6>{MEAL_LABEL[key]}</h6>
              <label htmlFor={`${uid}-${day}-${key}-title`}>Nombre del plato ({label.toLowerCase()})</label>
              <input
                id={`${uid}-${day}-${key}-title`}
                value={typeof meal.title === 'string' ? meal.title : ''}
                maxLength={120}
                onChange={(e) => setMenu(setMealFields(menu, day, key, { title: e.target.value }))}
                data-help-id="comunidad.menu-editor-plato"
              />
              <label htmlFor={`${uid}-${day}-${key}-side`}>Acompañamiento (opcional)</label>
              <input id={`${uid}-${day}-${key}-side`} value={typeof meal.side === 'string' ? meal.side : ''} maxLength={120} onChange={(e) => setMenu(setMealFields(menu, day, key, { side: e.target.value }))} />

              <ol className="cadm-menued-recipes" aria-label={`Recetas: ${label}`}>
                {recipes.map((r, i) => {
                  const title = typeof r.title === 'string' && r.title.trim() ? r.title : 'Receta sin nombre'
                  const simple = r.simple === true
                  const ings = Array.isArray(r.ingredients) ? r.ingredients.length : 0
                  const steps = Array.isArray(r.steps) ? r.steps.length : 0
                  return (
                    <li key={`${i}-${title}`} className="cadm-menued-recipe">
                      <p className="cadm-menued-recipe-title">
                        <strong>{title}</strong>
                        <span className="cadm-menued-tag">{i === 0 ? 'Plato principal' : simple ? 'Elemento sencillo' : 'Acompañamiento'}</span>
                      </p>
                      <p className="muted cadm-small">
                        {ings} {ings === 1 ? 'ingrediente' : 'ingredientes'}
                        {simple ? '' : ` · ${steps} ${steps === 1 ? 'paso' : 'pasos'}`}
                      </p>
                      <div className="cadm-actions">
                        <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => openRecipe(day, key, i, 'edit')} aria-label={`Editar la receta ${title}`} data-help-id="comunidad.menu-editor-receta">
                          Editar receta
                        </button>
                        <button type="button" className="cadm-btn cadm-btn-ghost" onClick={() => openRecipe(day, key, i, 'replace')} aria-label={`Sustituir la receta ${title}`}>
                          Sustituir
                        </button>
                        <button type="button" className="cadm-btn cadm-btn-ghost cadm-btn-icon" disabled={i === 0} onClick={() => setMenu(moveRecipe(menu, day, key, i, -1))} aria-label={`Subir la receta ${title}`}>
                          ↑
                        </button>
                        <button
                          type="button"
                          className="cadm-btn cadm-btn-ghost cadm-btn-icon"
                          disabled={i === recipes.length - 1}
                          onClick={() => setMenu(moveRecipe(menu, day, key, i, 1))}
                          aria-label={`Bajar la receta ${title}`}
                        >
                          ↓
                        </button>
                        <TwoTapButton
                          label="Quitar"
                          armedLabel="Toca otra vez para quitarla"
                          variant="danger"
                          disabled={recipes.length <= 1}
                          onConfirm={() => setMenu(removeRecipe(menu, day, key, i))}
                        />
                      </div>
                    </li>
                  )
                })}
              </ol>
              {recipes.length <= 1 && <p className="muted cadm-small">Cada comida necesita al menos una receta: para cambiarla usa «Sustituir».</p>}
              <div className="cadm-actions">
                <button type="button" className="cadm-btn cadm-btn-secondary" disabled={recipes.length >= MAX_RECIPES_PER_MEAL} onClick={() => openRecipe(day, key, recipes.length, 'new')}>
                  + Añadir receta
                </button>
                <button type="button" className="cadm-btn cadm-btn-ghost" disabled={recipes.length >= MAX_RECIPES_PER_MEAL} onClick={() => openRecipe(day, key, recipes.length, 'new', true)}>
                  + Añadir elemento sencillo
                </button>
              </div>
            </section>
          )
        })}
      </div>

      {titleChanges.length > 0 && (
        <p className="cadm-notice cadm-notice-error" role="note">
          Has cambiado nombres de platos ({titleChanges.join('; ')}). El texto de la publicación no se reescribe solo: revísalo con «Editar el texto» para que diga lo mismo.
        </p>
      )}
      {dirty && problem && (
        <p className="cadm-notice cadm-notice-error" role="note">
          Antes de guardar hay que corregir: {problem}
        </p>
      )}

      <MenuCheckSummary menu={menu} />

      <div className="cadm-actions cadm-menued-footer" role="group" aria-label="Guardar el menú">
        <button type="button" className="cadm-btn cadm-btn-primary" disabled={!dirty || problem !== null || action.busy} onClick={() => void save()} data-help-id="comunidad.menu-editor-guardar">
          {action.busy ? 'Guardando…' : 'Guardar menú'}
        </button>
        <button type="button" className="cadm-btn cadm-btn-secondary" aria-expanded={preview} onClick={() => setPreview((v) => !v)} data-help-id="comunidad.menu-editor-vista">
          {preview ? 'Ocultar la vista previa' : 'Vista previa del menú'}
        </button>
        <button type="button" className="cadm-btn cadm-btn-ghost" onClick={requestClose} disabled={action.busy}>
          Cerrar
        </button>
        {dirty && (
          <span className="cadm-small cadm-menued-dirty" role="status">
            Cambios sin guardar
          </span>
        )}
      </div>

      {preview && <MenuPreview menu={menu} title={item.title} body={item.body} />}

      {sheet && <RecipeSheet state={sheet} onChange={setSheet} onSave={saveRecipe} onCancel={() => setSheet(null)} />}
      {closing && (
        <UnsavedChangesDialog
          saveLabel="Guardar menú"
          busy={action.busy}
          error={action.error ?? (problem ? `Antes de guardar hay que corregir: ${problem}` : null)}
          onKeep={() => setClosing(false)}
          onSave={() => {
            void (async () => {
              if (await save()) {
                setClosing(false)
                onClose()
              }
            })()
          }}
          onDiscard={() => {
            setClosing(false)
            onClose()
          }}
        />
      )}
    </section>
  )
}

// ---- Hoja de una receta (modal móvil, con zona segura de iOS) -----------------------------------------------------------------------------
function RecipeSheet({ state, onChange, onSave, onCancel }: { state: SheetState; onChange: (s: SheetState) => void; onSave: (s: SheetState) => string | null; onCancel: () => void }) {
  const uid = useId()
  const ref = useDialogFocus<HTMLDivElement>()
  const [error, setError] = useState<string | null>(null)
  const f = state.form
  const set = (patch: Partial<RecipeForm>) => {
    setError(null)
    onChange({ ...state, form: { ...f, ...patch } })
  }
  const draft: RecipeDraftInput = { servings: f.servings, ingredients: f.ingredients, steps: stepsToText(f.steps), tags: f.tags }
  const heading = state.mode === 'edit' ? 'Editar la receta' : state.mode === 'replace' ? 'Sustituir la receta' : state.simple ? 'Añadir un elemento sencillo' : 'Añadir una receta'

  return (
    <div className="modal-overlay" role="presentation">
      <div
        ref={ref}
        className="modal-sheet cadm-menued-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-h`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      >
        <h4 id={`${uid}-h`}>{heading}</h4>
        {state.mode === 'replace' && <p className="muted cadm-small">Rellena la receta nueva: sustituirá a la actual solo al guardar. Nada se publica.</p>}
        <label htmlFor={`${uid}-title`}>Nombre de la receta</label>
        <input id={`${uid}-title`} value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />

        <RecipeFields value={draft} onChange={(d) => set({ servings: d.servings, ingredients: d.ingredients, steps: stepsFromNotes(d.steps), tags: d.tags })} />

        <fieldset className="cadm-fieldset">
          <legend>Tiempos (minutos, opcional)</legend>
          <div className="cadm-menued-time">
            <label htmlFor={`${uid}-active`}>Trabajo activo</label>
            <input id={`${uid}-active`} inputMode="numeric" value={f.activeMin} onChange={(e) => set({ activeMin: e.target.value.replace(/\D/g, '') })} />
            <label htmlFor={`${uid}-total`}>Tiempo total</label>
            <input id={`${uid}-total`} inputMode="numeric" value={f.totalMin} onChange={(e) => set({ totalMin: e.target.value.replace(/\D/g, '') })} />
          </div>
        </fieldset>

        <label htmlFor={`${uid}-tip`}>Consejo (opcional)</label>
        <textarea id={`${uid}-tip`} rows={2} maxLength={400} value={f.tip} onChange={(e) => set({ tip: e.target.value })} />

        <label className="cadm-menued-check">
          <input type="checkbox" checked={f.freezeIdeal} onChange={(e) => set({ freezeIdeal: e.target.checked })} /> Ideal para cocinar de más y congelar
        </label>
        <label htmlFor={`${uid}-freeze`}>Nota de conservación o congelación (opcional)</label>
        <textarea id={`${uid}-freeze`} rows={2} maxLength={300} value={f.freezeNote} onChange={(e) => set({ freezeNote: e.target.value })} />

        <label className="cadm-menued-check">
          <input type="checkbox" checked={f.simple} onChange={(e) => set({ simple: e.target.checked })} /> Elemento sencillo (sin pasos, como una pieza de fruta)
        </label>

        {error && (
          <p className="cadm-notice cadm-notice-error" role="alert">
            {error}
          </p>
        )}
        <div className="cadm-actions cadm-menued-sheet-actions">
          <button
            type="button"
            className="cadm-btn cadm-btn-primary"
            onClick={() => {
              const err = onSave(state)
              if (err) setError(err)
            }}
          >
            Guardar receta
          </button>
          <button type="button" className="cadm-btn cadm-btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
