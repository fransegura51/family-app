import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { previewMenuImport, runMenuImport } from '@/data/communityMenu'
import { communityErrorText } from '@/domain/communityErrors'
import {
  MENU_MAX_SERVINGS,
  MENU_MEALS,
  MENU_MIN_SERVINGS,
  dayLabel,
  formatDayDate,
  formatWeekRange,
  importResultLines,
  selectRecipes,
  targetMondayOptions,
  defaultTargetMonday,
  toIsoDate,
  type CommunityMenu,
  type ConflictMode,
  type DuplicateMode,
  type MenuDayName,
  type MenuImportPreview,
  type MenuImportResult,
  type MenuMealKey,
  type SelectedRecipe,
  type MenuScope,
  type MenuSelection,
  type PreviewSlot,
} from '@/domain/communityMenu'
import { normalizeKey } from '@/domain/communityRecipeDiff'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import '@/ui/community/menu/communityMenu.css'

// «Importar a mi Cocina»: hoja inferior con TODO el recorrido en un solo sitio, sin sorpresas:
//   1. qué se importa (semana, un día, una comida o cena, una receta) · 2. semana de destino (lunes a domingo) · 3. para cuántas personas
//   4. VISTA PREVIA (solo lectura, la calcula el servidor con la Cocina de TU familia): qué se creará, qué recetas ya tienes y qué hay ya en tu menú
//   5. qué hacer con lo que ya tienes apuntado — por defecto se RESPETA; sustituir exige marcar una casilla expresa
//   6. confirmar → una sola operación en el servidor, todo o nada, y el resultado en claro.
// Pulsar dos veces o reintentar no duplica nada: cada confirmación lleva una clave de importación y el servidor devuelve lo ya hecho.
// Solo se LEE el menú oficial: no se envía nada de tu familia a Comunidad.
export interface MenuImportSheetProps {
  postId: string
  menu: CommunityMenu
  initial: MenuSelection
  initialServings: number
  // Punto de extensión (avisos de alergias): recibe las recetas que se van a importar y devuelve los avisos que se enseñan antes de confirmar. Esta hoja no
  // implementa ninguna lógica de alergias.
  renderWarnings?: (items: SelectedRecipe[]) => ReactNode
  onClose: () => void
  // Tras importar, «Añadir los ingredientes a Compras» abre la hoja de Compras con la misma selección y raciones.
  onAddToShopping?: (selection: MenuSelection, servings: number) => void
}

type PreviewState = { status: 'loading' } | { status: 'ok'; data: MenuImportPreview } | { status: 'error'; message: string }

const SCOPE_OPTIONS: { id: MenuScope; label: string; help: string }[] = [
  { id: 'week', label: 'Toda la semana', help: '7 días, con comida y cena' },
  { id: 'day', label: 'Un día', help: 'su comida y su cena' },
  { id: 'meal', label: 'Una comida o una cena', help: 'con su acompañamiento' },
  { id: 'recipe', label: 'Una sola receta', help: 'solo se guarda en tu Cocina, sin apuntarla en el menú' },
]

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function errorText(e: unknown): string {
  return e instanceof Error && e.name === 'CommunityMenuError' ? e.message : communityErrorText(e)
}

export function MenuImportSheet({ postId, menu, initial, initialServings, renderWarnings, onClose, onAddToShopping }: MenuImportSheetProps) {
  const uid = useId()
  const dialogRef = useDialogFocus<HTMLDivElement>()
  const today = useMemo(() => toIsoDate(new Date()), [])
  const weekOptions = useMemo(() => targetMondayOptions(menu, today), [menu, today])

  const [scope, setScope] = useState<MenuScope>(initial.scope)
  const [day, setDay] = useState<MenuDayName>(initial.day ?? menu.days[0].day)
  const [meal, setMeal] = useState<MenuMealKey>(initial.meal ?? 'comida')
  const [recipeIndex, setRecipeIndex] = useState(initial.recipeIndex ?? 0)
  const [target, setTarget] = useState(() => defaultTargetMonday(menu, today))
  const [servings, setServings] = useState(initialServings)
  const [onConflict, setOnConflict] = useState<ConflictMode>('skip')
  const [duplicates, setDuplicates] = useState<DuplicateMode>('reuse')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [phase, setPhase] = useState<'edit' | 'working' | 'done'>('edit')
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' })
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MenuImportResult | null>(null)
  const sending = useRef(false)
  // Clave de la confirmación: la misma mientras no cambie nada (reintentos y dobles toques), otra si cambian las opciones.
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null)

  // Lo elegido, siempre válido para ESTE menú (el día o la comida que no existan se sustituyen por la primera que haya).
  const dayData = menu.days.find((d) => d.day === day) ?? menu.days[0]
  const mealsOfDay = MENU_MEALS.filter((m) => dayData.meals[m.key])
  const mealEff: MenuMealKey = mealsOfDay.some((m) => m.key === meal) ? meal : (mealsOfDay[0]?.key ?? 'comida')
  const recipesOfMeal = dayData.meals[mealEff]?.recipes ?? []
  const indexEff = Math.min(recipeIndex, Math.max(recipesOfMeal.length - 1, 0))
  const selection: MenuSelection = useMemo(
    () => ({ scope, day: dayData.day, meal: mealEff, recipeIndex: indexEff }),
    [scope, dayData.day, mealEff, indexEff],
  )
  const params = useMemo(
    () => ({
      postId,
      scope,
      day: scope === 'week' ? null : dayData.day,
      meal: scope === 'meal' || scope === 'recipe' ? mealEff : null,
      recipeIndex: scope === 'recipe' ? indexEff : null,
      targetStart: scope === 'recipe' ? null : target,
      servings,
      duplicateRecipes: duplicates,
    }),
    [postId, scope, dayData.day, mealEff, indexEff, target, servings, duplicates],
  )
  const paramsKey = JSON.stringify(params)

  // Vista previa: una llamada de solo lectura cada vez que cambian las opciones (con una pequeña espera para no pedir mientras se está tocando).
  useEffect(() => {
    if (phase !== 'edit') return
    let cancelled = false
    setPreview({ status: 'loading' })
    const timer = window.setTimeout(() => {
      previewMenuImport(params)
        .then((data) => {
          if (!cancelled) setPreview({ status: 'ok', data })
        })
        .catch((e) => {
          if (!cancelled) setPreview({ status: 'error', message: errorText(e) })
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, phase])

  const data = preview.status === 'ok' ? preview.data : null
  const busySlots = data ? data.slots.filter((s) => s.existing.length > 0) : []
  const hasBusy = busySlots.length > 0
  const hasKnown = data ? data.slots.some((s) => s.recipes.some((r) => r.existingRecipes.length > 0)) : false
  // Lo que se escribirá de verdad según lo elegido para los huecos ocupados.
  const writeSlots = data ? (onConflict === 'skip' ? data.slots.filter((s) => s.existing.length === 0) : data.slots) : []
  const dishCount = writeSlots.reduce((n, s) => n + s.recipes.length, 0)
  const newRecipes = new Set(writeSlots.flatMap((s) => s.recipes.filter((r) => r.action === 'create').map((r) => normalizeKey(r.title)))).size
  const reusedRecipes = new Set(writeSlots.flatMap((s) => s.recipes.filter((r) => r.action === 'reuse').map((r) => normalizeKey(r.title)))).size
  const warnings = renderWarnings ? renderWarnings(selectRecipes(menu, selection)) : null

  const needsReplaceOk = onConflict === 'replace' && hasBusy
  const canConfirm = phase === 'edit' && data !== null && (scope === 'recipe' ? data.slots.length > 0 : writeSlots.length > 0) && (!needsReplaceOk || confirmReplace)
  const nothingToDo = data !== null && scope !== 'recipe' && onConflict === 'skip' && writeSlots.length === 0

  async function confirm() {
    if (sending.current || !canConfirm) return
    sending.current = true
    setPhase('working')
    setError(null)
    const fingerprint = JSON.stringify([params, onConflict])
    if (keyRef.current?.fingerprint !== fingerprint) keyRef.current = { fingerprint, key: newKey() }
    try {
      const r = await runMenuImport({ ...params, onConflict }, keyRef.current.key)
      setResult(r)
      setPhase('done')
    } catch (e) {
      // Todo o nada: si falla, no se ha guardado nada. Reintentar con la misma clave es seguro aunque la respuesta se haya perdido por el camino.
      setError(errorText(e) + ' No se ha duplicado nada: puedes volver a intentarlo.')
      setPhase('edit')
    } finally {
      sending.current = false
    }
  }

  const closeable = phase !== 'working'
  const titleId = `${uid}-title`
  const kitchenMenuLink = result?.targetStart ? `/alimentacion?tab=${encodeURIComponent('Menú')}&desde=${result.targetStart}` : null

  return (
    <div className="modal-overlay" role="presentation" onClick={() => closeable && onClose()} onKeyDown={(e) => e.key === 'Escape' && closeable && onClose()}>
      <div ref={dialogRef} className="modal-sheet community-menu-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="community-menu-sheet-head">
          <h2 id={titleId}>{phase === 'done' ? '✅ Listo' : scope === 'recipe' ? '📥 Guardar receta en mi Cocina' : '📥 Importar a mi Cocina'}</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={!closeable} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {phase === 'done' && result ? (
          <div className="community-menu-sheet-body">
            <p className="community-notice ok" role="status">
              {result.replayed ? 'Esto ya se había guardado antes; no se ha duplicado nada.' : 'Se ha guardado en tu Cocina.'}
            </p>
            <ul className="community-menu-result">
              {importResultLines(result).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {result.skipped.length > 0 && (
              <details>
                <summary>¿Qué comidas se han respetado?</summary>
                <ul>
                  {result.skipped.map((s) => (
                    <li key={s.date + s.meal}>
                      {formatDayDate(s.date)} · {s.meal}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="community-menu-sheet-links">
              {kitchenMenuLink && <Link to={kitchenMenuLink}>🍽️ Ver mi menú de esa semana</Link>}
              <Link to={`/alimentacion?tab=Recetas`}>📖 Ver mis recetas</Link>
              {onAddToShopping && (
                <button type="button" className="link-button" onClick={() => onAddToShopping(selection, servings)}>
                  🛒 Añadir los ingredientes a Compras
                </button>
              )}
            </div>
            <div className="community-menu-sheet-actions">
              <button type="button" className="primary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="community-menu-sheet-body">
              <fieldset className="community-menu-fieldset">
                <legend>¿Qué quieres guardar?</legend>
                {SCOPE_OPTIONS.map((o) => (
                  <label key={o.id} className="community-menu-radio">
                    <input type="radio" name={`${uid}-scope`} checked={scope === o.id} onChange={() => setScope(o.id)} disabled={phase === 'working'} />
                    <span>
                      <strong>{o.label}</strong> <span className="muted">· {o.help}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {scope !== 'week' && (
                <div className="community-menu-fields">
                  <label>
                    Día
                    <select value={dayData.day} onChange={(e) => setDay(e.target.value as MenuDayName)} disabled={phase === 'working'}>
                      {menu.days.map((d) => (
                        <option key={d.day} value={d.day}>
                          {dayLabel(d.day)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(scope === 'meal' || scope === 'recipe') && (
                    <label>
                      Comida o cena
                      <select value={mealEff} onChange={(e) => setMeal(e.target.value as MenuMealKey)} disabled={phase === 'working'}>
                        {mealsOfDay.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}: {dayData.meals[m.key]?.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {scope === 'recipe' && (
                    <label>
                      Receta
                      <select value={indexEff} onChange={(e) => setRecipeIndex(Number(e.target.value))} disabled={phase === 'working'}>
                        {recipesOfMeal.map((r, i) => (
                          <option key={i} value={i}>
                            {i === 0 ? 'Plato principal' : 'Acompañamiento'}: {r.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {scope !== 'recipe' && (
                <div className="community-menu-fields">
                  <label>
                    ¿Para qué semana?
                    <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={phase === 'working'}>
                      {weekOptions.map((w) => (
                        <option key={w} value={w}>
                          Semana {formatWeekRange(w)}
                          {w === menu.weekStart ? ' (la de este menú)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="community-servings" role="group" aria-label="¿Para cuántas personas?">
                <span className="community-menu-small">¿Para cuántas personas?</span>
                <button type="button" aria-label="Una ración menos" onClick={() => setServings((s) => Math.max(MENU_MIN_SERVINGS, s - 1))} disabled={servings <= MENU_MIN_SERVINGS || phase === 'working'}>
                  −
                </button>
                <span className="community-servings-value" aria-live="polite">
                  {servings} {servings === 1 ? 'persona' : 'personas'}
                </span>
                <button type="button" aria-label="Una ración más" onClick={() => setServings((s) => Math.min(MENU_MAX_SERVINGS, s + 1))} disabled={servings >= MENU_MAX_SERVINGS || phase === 'working'}>
                  +
                </button>
              </div>
              {servings !== menu.servings && (
                <p className="muted community-menu-small">Las cantidades de las recetas se guardan ajustadas a {servings} (el menú original es para {menu.servings}). Son orientativas.</p>
              )}

              <h3 className="community-menu-h3">Esto es lo que pasará</h3>
              <div aria-live="polite" className="community-menu-preview">
                {preview.status === 'loading' && <p className="muted">Mirando tu Cocina y tu menú…</p>}
                {preview.status === 'error' && (
                  <p className="error" role="alert">
                    {preview.message}
                  </p>
                )}
                {data && (
                  <>
                    <p className="community-menu-summary">
                      {scope === 'recipe'
                        ? data.slots[0]?.recipes[0]?.action === 'reuse'
                          ? 'Ya tienes una receta con este nombre: no se creará otra, se usará la tuya.'
                          : 'Se guardará 1 receta nueva en tu Cocina.'
                        : `${dishCount} ${dishCount === 1 ? 'plato' : 'platos'} en tu menú · ${newRecipes} ${newRecipes === 1 ? 'receta nueva' : 'recetas nuevas'}${reusedRecipes > 0 ? ` · ${reusedRecipes} que ya tienes` : ''}`}
                    </p>
                    {scope !== 'recipe' && (
                      <ul className="community-menu-slots">
                        {data.slots.map((s) => (
                          <SlotRow key={s.day + s.meal} slot={s} willSkip={onConflict === 'skip' && s.existing.length > 0} conflict={onConflict} />
                        ))}
                      </ul>
                    )}
                    {scope === 'recipe' && data.slots[0] && (
                      <ul className="community-menu-slots">
                        {data.slots[0].recipes.map((r) => (
                          <li key={r.index}>
                            <strong>{r.title}</strong>
                            <RecipeStatus recipe={r} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>

              {hasBusy && scope !== 'recipe' && (
                <fieldset className="community-menu-fieldset community-menu-conflict">
                  <legend>Ya tienes platos apuntados en {busySlots.length === 1 ? 'una comida' : `${busySlots.length} comidas`}. ¿Qué hacemos?</legend>
                  <label className="community-menu-radio">
                    <input type="radio" name={`${uid}-conflict`} checked={onConflict === 'skip'} onChange={() => setOnConflict('skip')} />
                    <span>
                      <strong>Respetar lo que ya tengo</strong> <span className="muted">(recomendado) · esas comidas no se tocan</span>
                    </span>
                  </label>
                  <label className="community-menu-radio">
                    <input type="radio" name={`${uid}-conflict`} checked={onConflict === 'append'} onChange={() => setOnConflict('append')} />
                    <span>
                      <strong>Añadir además</strong> <span className="muted">· los platos nuevos van detrás de los que ya tengo</span>
                    </span>
                  </label>
                  <label className="community-menu-radio">
                    <input type="radio" name={`${uid}-conflict`} checked={onConflict === 'replace'} onChange={() => setOnConflict('replace')} />
                    <span>
                      <strong>Sustituir lo que ya tengo</strong> <span className="muted">· se quitan de tu menú los platos de esas comidas (tus recetas no se borran)</span>
                    </span>
                  </label>
                  {onConflict === 'replace' && (
                    <label className="community-menu-confirm-replace">
                      <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
                      <span>Sí, quiero quitar de mi menú: {busySlots.flatMap((s) => s.existing.map((x) => x.label)).filter(Boolean).slice(0, 6).join(', ') || 'esos platos'}.</span>
                    </label>
                  )}
                </fieldset>
              )}

              {hasKnown && (
                <fieldset className="community-menu-fieldset">
                  <legend>Recetas que ya tienes con el mismo nombre</legend>
                  <label className="community-menu-radio">
                    <input type="radio" name={`${uid}-dup`} checked={duplicates === 'reuse'} onChange={() => setDuplicates('reuse')} />
                    <span>
                      <strong>Usar las mías</strong> <span className="muted">(recomendado) · no se duplican ni se cambian</span>
                    </span>
                  </label>
                  <label className="community-menu-radio">
                    <input type="radio" name={`${uid}-dup`} checked={duplicates === 'copy'} onChange={() => setDuplicates('copy')} />
                    <span>
                      <strong>Crear una copia aparte</strong> <span className="muted">· se guarda también la del menú</span>
                    </span>
                  </label>
                </fieldset>
              )}

              {warnings && <div className="community-menu-warnings">{warnings}</div>}

              <p className="muted community-menu-small">
                Nada se envía a Comunidad: solo se lee el menú. Todo se guarda de una vez o no se guarda nada; si pulsas dos veces, no se duplica.
              </p>
              {nothingToDo && (
                <p className="community-notice" role="status">
                  Todas esas comidas ya tienen algo apuntado y has elegido respetarlas, así que no hay nada que guardar. Elige otra semana u otra opción.
                </p>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="community-menu-sheet-actions community-menu-sticky">
              <button type="button" className="primary" onClick={() => void confirm()} disabled={!canConfirm}>
                {phase === 'working' ? 'Guardando…' : scope === 'recipe' ? '📥 Guardar esta receta' : onConflict === 'replace' && hasBusy ? 'Sustituir e importar' : '📥 Importar'}
              </button>
              <button type="button" className="link-button" onClick={onClose} disabled={!closeable}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RecipeStatus({ recipe }: { recipe: PreviewSlot['recipes'][number] }) {
  if (recipe.action === 'reuse' && recipe.existingRecipes[0]) {
    return (
      <span className="community-menu-badge reuse">
        Ya la tienes: se usa la tuya{recipe.existingRecipes[0].sameContent ? '' : ' (es parecida pero no igual)'}
      </span>
    )
  }
  if (recipe.existingRecipes.length > 0) return <span className="community-menu-badge">Ya tienes una con este nombre: se crea una copia aparte</span>
  return <span className="community-menu-badge new">Receta nueva</span>
}

function SlotRow({ slot, willSkip, conflict }: { slot: PreviewSlot; willSkip: boolean; conflict: ConflictMode }) {
  const busy = slot.existing.length > 0
  return (
    <li className={'community-menu-slot' + (willSkip ? ' skipped' : '')}>
      <p className="community-menu-slot-title">
        {slot.date ? formatDayDate(slot.date) : dayLabel(slot.day)} · {slot.meal === 'cena' ? 'cena' : 'comida'}
      </p>
      <p className="community-menu-slot-plan">
        {slot.title}
        {slot.side && <span className="muted"> + {slot.side}</span>}
      </p>
      {busy ? (
        <p className="community-menu-slot-status warn">
          Ya tienes: {slot.existing.map((x) => x.label || 'un plato').join(', ')}.{' '}
          {conflict === 'skip' ? 'Se respeta: no se importa esta comida.' : conflict === 'append' ? 'Se añade detrás.' : 'Se sustituye.'}
        </p>
      ) : (
        <p className="community-menu-slot-status">Libre: se apuntará.</p>
      )}
      {!willSkip && slot.recipes.some((r) => r.existingRecipes.length > 0) && (
        <p className="community-menu-slot-status">
          {slot.recipes
            .filter((r) => r.existingRecipes.length > 0)
            .map((r) => `«${r.title}»: ${r.action === 'reuse' ? 'ya la tienes, se usa la tuya' : 'ya tienes otra con este nombre'}`)
            .join(' · ')}
        </p>
      )}
    </li>
  )
}
