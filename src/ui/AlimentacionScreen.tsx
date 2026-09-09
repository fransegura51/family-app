import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ReorderableTabBar } from '@/ui/ReorderableTabBar'
import {
  addFoodLog,
  addRecipeIngredientsToShoppingList,
  createRecipe,
  deleteFoodLog,
  deleteMenuEntry,
  deleteRecipe,
  getRecipePhotoUrl,
  listFoodLogs,
  listMenuEntries,
  listRecentFoodLogs,
  listRecipes,
  setMenuEntry,
  updateRecipe,
  uploadRecipePhoto,
} from '@/data/food'
import { listFamilyMembers } from '@/data/family'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { searchRecipe } from '@/services/recipeSearch'
import { parseWikibooksRecipe, type ParsedRecipe } from '@/domain/wikibooksRecipeParser'
import { fetchImageFromUrl, importRecipeFromUrl } from '@/services/recipeUrlImport'
import { listShoppingStores } from '@/data/shoppingStores'
import type { ShoppingStoreEntry } from '@/domain/types'
import {
  addBodyMeasurement,
  deleteBodyMeasurement,
  deleteBodyPhoto,
  getBodyPhotoUrl,
  listBodyMeasurements,
  listBodyPhotos,
  uploadBodyPhoto,
} from '@/data/bodyTracking'
import type { BodyMeasurement, BodyPhoto, FamilyMember, FoodLog, MealType, MenuEntry, Recipe } from '@/domain/types'

const SUB_TABS = ['Menú', 'Recetas', 'Registro', 'Peso'] as const
type SubTab = (typeof SUB_TABS)[number]

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'desayuno', label: 'Desayuno' },
  { value: 'comida', label: 'Comida' },
  { value: 'merienda', label: 'Merienda' },
  { value: 'cena', label: 'Cena' },
  { value: 'snack', label: 'Snack' },
]

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekDates(): string[] {
  const today = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    return toDateStr(d)
  })
}

// Permite entrar directo en una pestaña concreta (p.ej. /alimentacion?tab=registro
// desde el acceso directo de Inicio) en vez de forzar siempre a pasar por "Menú".
function initialTabFromParam(param: string | null): SubTab {
  const found = SUB_TABS.find((t) => t.toLowerCase() === param?.toLowerCase())
  return found ?? 'Menú'
}

export function AlimentacionScreen() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<SubTab>(() => initialTabFromParam(searchParams.get('tab')))

  return (
    <div className="screen">
      <h1>Alimentación</h1>
      <ReorderableTabBar storageKey="alimentacion" tabs={SUB_TABS} active={tab} onSelect={setTab} />

      {tab === 'Menú' && <MenuTab />}
      {tab === 'Recetas' && <RecipesTab />}
      {tab === 'Registro' && <FoodLogTab />}
      {tab === 'Peso' && <WeightTab />}
    </div>
  )
}

// ---------------------------------------------------------------------
// Menú semanal (Skill 15)
// ---------------------------------------------------------------------

function MenuTab() {
  const dates = useMemo(weekDates, [])
  const [entries, setEntries] = useState<MenuEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<{ date: string; meal: MealType } | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listMenuEntries(dates[0], dates[6]), listRecipes()])
      .then(([e, r]) => {
        setEntries(e)
        setRecipes(r)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="muted">Cargando menú…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {dates.map((date) => (
        <div key={date} className="card menu-day">
          <strong>
            {new Date(date + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
          </strong>
          {MEAL_TYPES.filter((m) => m.value !== 'snack').map((meal) => {
            const entry = entries.find((e) => e.entryDate === date && e.mealType === meal.value)
            const recipe = entry?.recipeId ? recipes.find((r) => r.id === entry.recipeId) : null
            const isAdding = addingFor?.date === date && addingFor.meal === meal.value
            return (
              <div key={meal.value} className="menu-row">
                <span className="muted menu-meal-label">{meal.label}</span>
                {entry ? (
                  <>
                    <span>{recipe?.title ?? entry.freeText}</span>
                    <ConfirmButton label="Quitar" onConfirm={() => deleteMenuEntry(entry.id).then(reload)} />
                  </>
                ) : isAdding ? (
                  <MenuEntryPicker
                    recipes={recipes}
                    onPick={async (pick) => {
                      await setMenuEntry({ entryDate: date, mealType: meal.value, ...pick })
                      setAddingFor(null)
                      reload()
                    }}
                    onCancel={() => setAddingFor(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setAddingFor({ date, meal: meal.value })}
                  >
                    + Añadir
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function MenuEntryPicker({
  recipes,
  onPick,
  onCancel,
}: {
  recipes: Recipe[]
  onPick: (input: { recipeId: string | null; freeText: string | null }) => void
  onCancel: () => void
}) {
  const [recipeId, setRecipeId] = useState('')
  const [freeText, setFreeText] = useState('')

  return (
    <span className="menu-picker">
      <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
        <option value="">— receta —</option>
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
      <input
        type="text"
        placeholder="o texto libre"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
      />
      <button
        type="button"
        className="link-button"
        onClick={() => onPick({ recipeId: recipeId || null, freeText: recipeId ? null : freeText || null })}
      >
        OK
      </button>
      <button type="button" className="link-button" onClick={onCancel}>
        ✕
      </button>
    </span>
  )
}

// ---------------------------------------------------------------------
// Recetas (Skill 15)
// ---------------------------------------------------------------------

const DEFAULT_RECIPE_TAGS = ['Postres', 'Favoritos', 'Fáciles de preparar', 'Vegetariano', 'Rápidas']

function collectRecipeTags(recipes: Recipe[]): string[] {
  const set = new Set(DEFAULT_RECIPE_TAGS)
  for (const r of recipes) for (const t of r.tags) if (t.trim()) set.add(t.trim())
  return [...set].sort((a, b) => a.localeCompare(b))
}

function RecipeImage({ imagePath, alt }: { imagePath: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!imagePath) {
      setUrl(null)
      return
    }
    let cancelled = false
    getRecipePhotoUrl(imagePath)
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [imagePath])

  if (!url) return null
  return <img src={url} alt={alt} className="recipe-image" />
}

function RecipesTab() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [stores, setStores] = useState<ShoppingStoreEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  // Petición real: "no siempre hay que comprar todos los ingredientes...
  // que se pueda elegir qué productos añadir y en qué tienda
  // comprarlos" — se abre un paso intermedio en vez de mandarlos todos
  // de golpe.
  const [pickingFor, setPickingFor] = useState<Recipe | null>(null)
  const [tagFilter, setTagFilter] = useState('Todas')
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [adding, setAdding] = useState(false)

  function reload() {
    setLoading(true)
    Promise.all([listRecipes(), listShoppingStores()])
      .then(([r, s]) => {
        setRecipes(r)
        setStores(s)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  if (loading) return <p className="muted">Cargando recetas…</p>

  const availableTags = collectRecipeTags(recipes)
  const filteredRecipes = recipes
    .filter((r) => tagFilter === 'Todas' || r.tags.includes(tagFilter))
    .sort((a, b) => a.title.localeCompare(b.title))
  const viewing = viewingId ? (recipes.find((r) => r.id === viewingId) ?? null) : null

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {info && <p className="muted">{info}</p>}

      <div className="filter-row">
        <button type="button" className={'chip' + (tagFilter === 'Todas' ? ' chip-active' : '')} onClick={() => setTagFilter('Todas')}>
          Todas
        </button>
        {availableTags.map((tag) => (
          <button key={tag} type="button" className={'chip' + (tagFilter === tag ? ' chip-active' : '')} onClick={() => setTagFilter(tag)}>
            {tag}
          </button>
        ))}
      </div>

      <div className="event-list">
        {filteredRecipes.map((r) => (
          <button key={r.id} type="button" className="recipe-list-row" onClick={() => setViewingId(r.id)}>
            <RecipeImage imagePath={r.imagePath} alt="" />
            <span>{r.title}</span>
          </button>
        ))}
        {filteredRecipes.length === 0 && (
          <p className="muted">{recipes.length === 0 ? 'Todavía no hay recetas.' : 'Ninguna receta con esa etiqueta.'}</p>
        )}
      </div>

      <button type="button" className="screen-fab" onClick={() => setAdding(true)}>
        + Nueva receta
      </button>

      {adding && (
        <div className="modal-overlay" onClick={() => setAdding(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Nueva receta
              </h2>
              <button type="button" className="modal-close" onClick={() => setAdding(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <RecipeForm
              mode="add"
              availableTags={availableTags}
              onDone={() => {
                setAdding(false)
                reload()
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        </div>
      )}

      {viewing && !editing && (
        <div className="modal-overlay" onClick={() => setViewingId(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {viewing.title}
              </h2>
              <button type="button" className="modal-close" onClick={() => setViewingId(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <RecipeImage imagePath={viewing.imagePath} alt={viewing.title} />
            {viewing.tags.length > 0 && (
              <div className="filter-row" style={{ marginTop: 8 }}>
                {viewing.tags.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {viewing.ingredients.length > 0 && (
              <div className="day-modal-group">
                <h3>Ingredientes</h3>
                <ul className="ingredient-list">
                  {viewing.ingredients.map((i) => (
                    <li key={i.id}>
                      {i.name}
                      {i.quantity && ` — ${i.quantity}${i.unit ? ' ' + i.unit : ''}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {viewing.notes && (
              <div className="day-modal-group">
                <h3>Preparación / notas</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{viewing.notes}</p>
              </div>
            )}
            <div className="task-card-actions">
              <button type="button" className="link-button" onClick={() => setPickingFor(viewing)}>
                Añadir a la lista de la compra
              </button>
              <button type="button" className="link-button" onClick={() => setEditing(viewing)} aria-label="Editar">
                ✏️ Editar
              </button>
              <ConfirmButton
                onConfirm={() =>
                  deleteRecipe(viewing.id).then(() => {
                    setViewingId(null)
                    reload()
                  })
                }
              />
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Editar receta
              </h2>
              <button type="button" className="modal-close" onClick={() => setEditing(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <RecipeForm
              mode="edit"
              recipe={editing}
              availableTags={availableTags}
              onDone={() => {
                setEditing(null)
                setViewingId(null)
                reload()
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}

      {pickingFor && (
        <PickIngredientsModal
          recipe={pickingFor}
          stores={stores}
          onCancel={() => setPickingFor(null)}
          onDone={(count) => {
            setPickingFor(null)
            setInfo(`${count} ${count === 1 ? 'ingrediente añadido' : 'ingredientes añadidos'} de "${pickingFor.title}" a la lista de la compra.`)
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  )
}

function PickIngredientsModal({
  recipe,
  stores,
  onCancel,
  onDone,
  onError,
}: {
  recipe: Recipe
  stores: ShoppingStoreEntry[]
  onCancel: () => void
  onDone: (count: number) => void
  onError: (message: string) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(recipe.ingredients.map((i) => i.id)))
  const [storeByIngredient, setStoreByIngredient] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState(false)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleConfirm() {
    setSaving(true)
    try {
      const selections = [...selected].map((ingredientId) => ({
        ingredientId,
        store: storeByIngredient.get(ingredientId) || null,
      }))
      await addRecipeIngredientsToShoppingList(recipe, selections)
      onDone(selections.length)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo generar la lista')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Añadir a la lista
          </h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="muted">Elige qué ingredientes hacen falta y, si quieres, en qué tienda comprar cada uno.</p>
        <div className="event-list">
          {recipe.ingredients.map((i) => (
            <div key={i.id} className="card" style={{ padding: 10 }}>
              <label className="checkbox-label" style={{ marginBottom: 6 }}>
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                {i.name}
                {i.quantity && ` — ${i.quantity}${i.unit ? ' ' + i.unit : ''}`}
              </label>
              {selected.has(i.id) && (
                <select
                  value={storeByIngredient.get(i.id) ?? ''}
                  onChange={(e) => setStoreByIngredient((prev) => new Map(prev).set(i.id, e.target.value))}
                >
                  <option value="">Sin tienda concreta</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={handleConfirm} disabled={saving || selected.size === 0}>
          {saving ? 'Añadiendo…' : `Añadir ${selected.size} a la lista`}
        </button>
      </div>
    </div>
  )
}

type SearchStatus = 'idle' | 'searching' | 'not-found' | 'error'

// Petición real: "hay que poder editar las recetas no solo comprar o
// borrar" — mismo formulario para crear y editar (mode), como ya se
// hace con el ticket de Compras (ReceiptForm mode="add"|"edit").
function RecipeForm({
  mode,
  recipe,
  availableTags,
  onDone,
  onCancel,
}: {
  mode: 'add' | 'edit'
  recipe?: Recipe
  availableTags: string[]
  onDone: () => void
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(recipe?.title ?? '')
  const [notes, setNotes] = useState(recipe?.notes ?? '')
  const [ingredients, setIngredients] = useState(
    recipe ? recipe.ingredients.map((i) => [i.name, i.quantity ?? '', i.unit ?? ''].join(', ')).join('\n') : '',
  )
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? [])
  const [newTag, setNewTag] = useState('')
  // Petición real: "que las recetas tengan una imagen en la cabecera...
  // si no [importada] que se pueda subir una foto propia o buscar una
  // de internet" — sin API de búsqueda de pago, "buscar de internet" es
  // pegar la URL de una foto ya encontrada en el navegador.
  const [imagePath, setImagePath] = useState<string | null>(recipe?.imagePath ?? null)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [found, setFound] = useState<ParsedRecipe | null>(null)
  const [foundSource, setFoundSource] = useState<'wikibooks' | 'url' | null>(null)
  const [foundImagePath, setFoundImagePath] = useState<string | null>(null)
  const [recipeUrl, setRecipeUrl] = useState('')
  const [urlImportStatus, setUrlImportStatus] = useState<'idle' | 'importing' | 'error'>('idle')
  const [urlImportError, setUrlImportError] = useState<string | null>(null)

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  function handleAddNewTag() {
    const t = newTag.trim()
    if (!t) return
    if (!tags.includes(t)) setTags((prev) => [...prev, t])
    setNewTag('')
  }

  async function handleUploadImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageBusy(true)
    setImageError(null)
    try {
      setImagePath(await uploadRecipePhoto(file))
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'No se pudo subir la foto')
    } finally {
      setImageBusy(false)
    }
  }

  async function handleFetchImageUrl() {
    if (!imageUrlInput.trim()) return
    setImageBusy(true)
    setImageError(null)
    try {
      setImagePath(await fetchImageFromUrl(imageUrlInput.trim()))
      setImageUrlInput('')
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'No se pudo descargar esa imagen')
    } finally {
      setImageBusy(false)
    }
  }

  // Petición real: "subir recetas mediante la URL de otras páginas" —
  // reutiliza el mismo paso de revisión que la búsqueda en Wikibooks
  // (found/useFoundRecipe), en vez de guardar directamente lo leído.
  async function handleImportUrl() {
    if (!recipeUrl.trim()) return
    setUrlImportStatus('importing')
    setUrlImportError(null)
    try {
      const result = await importRecipeFromUrl(recipeUrl.trim())
      setFound({
        title: result.title || title,
        ingredients: result.ingredients,
        steps: result.instructions ? result.instructions.split('\n').filter(Boolean) : [],
      })
      setFoundSource('url')
      setFoundImagePath(result.imagePath)
      setUrlImportStatus('idle')
    } catch (err) {
      setUrlImportStatus('error')
      setUrlImportError(err instanceof Error ? err.message : 'No se pudo importar la receta')
    }
  }

  async function handleSearch() {
    if (!title.trim()) return
    setSearchStatus('searching')
    setFound(null)
    try {
      const page = await searchRecipe(title.trim())
      if (!page) {
        setSearchStatus('not-found')
        return
      }
      const parsed = parseWikibooksRecipe(page.title, page.wikitext)
      if (parsed.ingredients.length === 0 && parsed.steps.length === 0) {
        setSearchStatus('not-found')
        return
      }
      setFound(parsed)
      setFoundSource('wikibooks')
      setSearchStatus('idle')
    } catch {
      setSearchStatus('error')
    }
  }

  function useFoundRecipe() {
    if (!found) return
    if (found.title && !title.trim()) setTitle(found.title)
    setIngredients(found.ingredients.map((i) => `${i}, ,`).join('\n'))
    setNotes(found.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'))
    if (foundImagePath) setImagePath(foundImagePath)
    setFound(null)
    setFoundImagePath(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const input = { title, notes, ingredientLines: ingredients.split('\n'), tags, imagePath }
      if (mode === 'edit' && recipe) {
        await updateRecipe(recipe.id, input)
      } else {
        await createRecipe(input)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la receta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="member-form">
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Tortilla de patatas" />
      </label>

      {mode === 'add' && (
        <>
          <button type="button" className="link-button" onClick={handleSearch} disabled={!title.trim() || searchStatus === 'searching'}>
            {searchStatus === 'searching' ? 'Buscando en Internet…' : '🔍 Buscar receta en Internet'}
          </button>
          {searchStatus === 'not-found' && (
            <p className="muted">No he encontrado "{title}" en el recetario de Wikibooks — escríbela a mano abajo.</p>
          )}
          {searchStatus === 'error' && <p className="error">No se pudo buscar ahora mismo, inténtalo de nuevo.</p>}

          <label>
            O importar desde la URL de otra web de recetas
            <input type="url" value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} placeholder="https://..." />
          </label>
          <button
            type="button"
            className="link-button"
            onClick={handleImportUrl}
            disabled={!recipeUrl.trim() || urlImportStatus === 'importing'}
          >
            {urlImportStatus === 'importing' ? 'Leyendo la página…' : '🔗 Importar desde esa URL'}
          </button>
          {urlImportStatus === 'error' && <p className="error">{urlImportError}</p>}
        </>
      )}

      <label style={{ marginBottom: 0 }}>Imagen de cabecera (opcional)</label>
      {imagePath && <RecipeImage imagePath={imagePath} alt="" />}
      <div className="inline-fields">
        <label className="link-button" style={{ cursor: 'pointer' }}>
          {imageBusy ? 'Subiendo…' : '📷 Subir foto'}
          <input type="file" accept="image/*" onChange={handleUploadImage} style={{ display: 'none' }} disabled={imageBusy} />
        </label>
        {imagePath && (
          <button type="button" className="link-button" onClick={() => setImagePath(null)}>
            ✕ Quitar imagen
          </button>
        )}
      </div>
      <label>
        O pegar la URL de una foto encontrada en internet
        <input type="url" value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} placeholder="https://..." />
      </label>
      <button type="button" className="link-button" onClick={handleFetchImageUrl} disabled={!imageUrlInput.trim() || imageBusy}>
        {imageBusy ? 'Descargando…' : '🌐 Usar esa foto'}
      </button>
      {imageError && <p className="error">{imageError}</p>}

      <label style={{ marginBottom: 0 }}>Etiquetas (opcional)</label>
      <div className="filter-row">
        {availableTags.map((tag) => (
          <button key={tag} type="button" className={'chip' + (tags.includes(tag) ? ' chip-active' : '')} onClick={() => toggleTag(tag)}>
            {tag}
          </button>
        ))}
      </div>
      <div className="inline-fields">
        <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nueva etiqueta" />
        <button type="button" className="link-button" onClick={handleAddNewTag} disabled={!newTag.trim()}>
          + Añadir
        </button>
      </div>

      <label>
        Ingredientes (uno por línea: nombre, cantidad, unidad)
        <textarea
          rows={4}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          placeholder={'Tomate, 4, unidades\nAceite, 2, cucharadas'}
        />
      </label>
      <label>
        Preparación / notas
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear receta'}
        </button>
        {onCancel && (
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      {found && (
        <div className="modal-overlay" onClick={() => setFound(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {found.title}
              </h2>
              <button type="button" className="modal-close" onClick={() => setFound(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <p className="muted">
              {foundSource === 'url' ? 'Importada desde la URL indicada.' : 'Encontrada en el recetario abierto de Wikibooks.'}
            </p>

            {found.ingredients.length > 0 && (
              <div className="day-modal-group">
                <h3>Ingredientes</h3>
                <ul className="ingredient-list">
                  {found.ingredients.map((ing, i) => (
                    <li key={i}>{ing}</li>
                  ))}
                </ul>
              </div>
            )}

            {found.steps.length > 0 && (
              <div className="day-modal-group">
                <h3>Preparación</h3>
                <ol className="ingredient-list">
                  {found.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>
            )}

            <button type="button" onClick={useFoundRecipe}>
              Usar esta receta
            </button>
          </div>
        </div>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------
// Registro de alimentación (Skill 14/16)
// ---------------------------------------------------------------------

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00')
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function FoodLogTab() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const todayStr = useMemo(() => toDateStr(new Date()), [])
  // Antes solo se veía (y por tanto solo se podía borrar) el registro de
  // HOY — en cuanto pasaba la medianoche, lo comido el día anterior
  // desaparecía de la vista sin ninguna forma de llegar hasta ahí (bug
  // real: la usuaria no encontraba cómo eliminar un registro de ayer).
  const [date, setDate] = useState(todayStr)

  useEffect(() => {
    listFamilyMembers()
      .then((m) => {
        setMembers(m)
        if (m.length > 0) setActiveMemberId(m[0].id)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  function reload() {
    if (!activeMemberId) return
    setLoading(true)
    listFoodLogs(activeMemberId, date)
      .then(setLogs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [activeMemberId, date]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeMember = members.find((m) => m.id === activeMemberId)
  const showDetail = activeMember?.memberType === 'admin' || activeMember?.memberType === 'adult'

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="day-nav">
        <button type="button" className="link-button" onClick={() => setDate((d) => shiftDate(d, -1))}>
          ← Día anterior
        </button>
        <strong>
          {date === todayStr
            ? 'Hoy'
            : new Date(date + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
        </strong>
        <button
          type="button"
          className="link-button"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          disabled={date >= todayStr}
        >
          Día siguiente →
        </button>
        {/* Input nativo en vez de un calendario propio — en el móvil abre
            directamente el selector de fecha del sistema (rápido, con
            meses navegables), sin tener que construir uno a mano. */}
        <input
          type="date"
          className="day-nav-date"
          value={date}
          max={todayStr}
          aria-label="Ir a una fecha"
          onChange={(e) => e.target.value && setDate(e.target.value)}
        />
      </div>
      <div className="filter-row">
        {members.map((m) => (
          <button
            key={m.id}
            className={'chip' + (activeMemberId === m.id ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => setActiveMemberId(m.id)}
          >
            <MemberAvatar member={m} size={18} />
            {m.name}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <div className="event-list">
          {logs.map((log) => (
            <div key={log.id} className="card task-card">
              <div className="task-card-main">
                <strong>{log.description}</strong>
                <p className="muted">
                  {MEAL_TYPES.find((m) => m.value === log.mealType)?.label}
                  {showDetail && log.calories != null && ` · ${log.calories} kcal`}
                  {showDetail &&
                    (log.proteinG != null || log.carbsG != null || log.fatG != null) &&
                    ` · P ${log.proteinG ?? '?'}g / HC ${log.carbsG ?? '?'}g / G ${log.fatG ?? '?'}g`}
                  {showDetail && ` · ${log.isEstimated ? 'estimado' : 'exacto'}`}
                </p>
              </div>
              <ConfirmButton label="Eliminar" onConfirm={() => deleteFoodLog(log.id).then(reload)} />
            </div>
          ))}
          {logs.length === 0 && <p className="muted">{date === todayStr ? 'Nada registrado hoy.' : 'Nada registrado ese día.'}</p>}
        </div>
      )}

      {activeMemberId && (
        <AddFoodLogForm
          members={members}
          activeMemberId={activeMemberId}
          date={date}
          showDetail={showDetail}
          onAdded={reload}
        />
      )}
    </div>
  )
}

function AddFoodLogForm({
  members,
  activeMemberId,
  date,
  showDetail,
  onAdded,
}: {
  members: FamilyMember[]
  activeMemberId: string
  date: string
  showDetail: boolean
  onAdded: () => void
}) {
  const [mealType, setMealType] = useState<MealType>('comida')
  const [description, setDescription] = useState('')
  const [calories, setCalories] = useState('')
  const [proteinG, setProteinG] = useState('')
  const [carbsG, setCarbsG] = useState('')
  const [fatG, setFatG] = useState('')
  const [isEstimated, setIsEstimated] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Comida compartida ("lentejas para los cuatro") frente a individual
  // ("tortilla francesa solo para Jennifer") — por defecto solo la
  // persona activa, y se puede marcar a más gente o "Todos" de golpe.
  const [selectedIds, setSelectedIds] = useState<string[]>([activeMemberId])

  useEffect(() => {
    setSelectedIds([activeMemberId])
  }, [activeMemberId])

  function toggleMember(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleAll() {
    setSelectedIds((prev) => (prev.length === members.length ? [activeMemberId] : members.map((m) => m.id)))
  }

  // Últimos alimentos de esta persona, para repetir "café con leche" con
  // un toque en vez de escribirlo de cero cada vez — solo el más
  // reciente de cada nombre, sin importar el día.
  const [recentFoods, setRecentFoods] = useState<FoodLog[]>([])

  function loadRecent() {
    listRecentFoodLogs(activeMemberId)
      .then((logs) => {
        const seen = new Set<string>()
        const unique: FoodLog[] = []
        for (const log of logs) {
          const key = log.description.trim().toLowerCase()
          if (seen.has(key)) continue
          seen.add(key)
          unique.push(log)
          if (unique.length >= 8) break
        }
        setRecentFoods(unique)
      })
      .catch(() => {
        // Sin recientes no pasa nada, se sigue pudiendo escribir a mano.
      })
  }

  useEffect(loadRecent, [activeMemberId]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickRecent(log: FoodLog) {
    setDescription(log.description)
    setMealType(log.mealType)
    setCalories(log.calories != null ? String(log.calories) : '')
    setProteinG(log.proteinG != null ? String(log.proteinG) : '')
    setCarbsG(log.carbsG != null ? String(log.carbsG) : '')
    setFatG(log.fatG != null ? String(log.fatG) : '')
    setIsEstimated(log.isEstimated)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (selectedIds.length === 0) {
      setError('Elige al menos una persona')
      return
    }
    setSaving(true)
    setError(null)
    try {
      for (const id of selectedIds) {
        await addFoodLog({
          memberId: id,
          date,
          mealType,
          description,
          calories: calories ? Number(calories) : null,
          proteinG: proteinG ? Number(proteinG) : null,
          carbsG: carbsG ? Number(carbsG) : null,
          fatG: fatG ? Number(fatG) : null,
          isEstimated,
        })
      }
      setDescription('')
      setCalories('')
      setProteinG('')
      setCarbsG('')
      setFatG('')
      setIsEstimated(true)
      setSelectedIds([activeMemberId])
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Registrar comida</h2>
      <label>
        Para quién
        <span className="muted" style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
          Marca a más de uno para una comida compartida ("lentejas para los cuatro")
        </span>
      </label>
      <div className="filter-row">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className={'chip' + (selectedIds.includes(m.id) ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => toggleMember(m.id)}
          >
            <MemberAvatar member={m} size={18} />
            {m.name}
          </button>
        ))}
        {members.length > 1 && (
          <button
            type="button"
            className={'chip' + (selectedIds.length === members.length ? ' chip-active' : '')}
            onClick={toggleAll}
          >
            Todos
          </button>
        )}
      </div>
      <label>
        Momento
        <select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
          {MEAL_TYPES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Qué comió
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
      </label>
      {recentFoods.length > 0 && (
        <div className="filter-row">
          {recentFoods.map((log) => (
            <button key={log.id} type="button" className="chip" onClick={() => pickRecent(log)}>
              {log.description}
            </button>
          ))}
        </div>
      )}
      {showDetail && (
        <>
          <label>
            Calorías (opcional)
            <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} />
          </label>
          <label>
            Proteína (g, opcional)
            <input type="number" value={proteinG} onChange={(e) => setProteinG(e.target.value)} />
          </label>
          <label>
            Hidratos (g, opcional)
            <input type="number" value={carbsG} onChange={(e) => setCarbsG(e.target.value)} />
          </label>
          <label>
            Grasa (g, opcional)
            <input type="number" value={fatG} onChange={(e) => setFatG(e.target.value)} />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!isEstimated}
              onChange={(e) => setIsEstimated(!e.target.checked)}
            />
            Dato exacto (no estimado)
          </label>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Peso y medidas
// ---------------------------------------------------------------------

function WeightTab() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([])
  const [photos, setPhotos] = useState<BodyPhoto[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listFamilyMembers()
      .then((m) => {
        setMembers(m)
        if (m.length > 0) setActiveMemberId(m[0].id)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  function reload() {
    if (!activeMemberId) return
    setLoading(true)
    Promise.all([listBodyMeasurements(activeMemberId), listBodyPhotos(activeMemberId)])
      .then(async ([m, p]) => {
        setMeasurements(m)
        setPhotos(p)
        const entries = await Promise.all(p.map(async (ph) => [ph.id, await getBodyPhotoUrl(ph.storagePath)] as const))
        setPhotoUrls(Object.fromEntries(entries))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [activeMemberId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDeleteMeasurement(id: string) {
    await deleteBodyMeasurement(id)
    reload()
  }

  async function handleDeletePhoto(photo: BodyPhoto) {
    await deleteBodyPhoto(photo)
    reload()
  }

  const withWeight = measurements.filter((m) => m.weightKg != null)
  const first = withWeight[0]
  const latest = withWeight[withWeight.length - 1]
  const weightDiff = latest && first && latest.id !== first.id ? latest.weightKg! - first.weightKg! : null

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="filter-row">
        {members.map((m) => (
          <button
            key={m.id}
            className={'chip' + (activeMemberId === m.id ? ' chip-active' : '')}
            style={{ borderColor: m.color }}
            onClick={() => setActiveMemberId(m.id)}
          >
            <MemberAvatar member={m} size={18} />
            {m.name}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <>
          {withWeight.length >= 2 && (
            <div className="card">
              <h2>Evolución del peso</h2>
              {weightDiff != null && (
                <p className="muted">
                  {weightDiff <= 0
                    ? `Ha perdido ${Math.abs(weightDiff).toFixed(1)} kg desde el `
                    : `Ha ganado ${weightDiff.toFixed(1)} kg desde el `}
                  {new Date(first.measuredDate + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </p>
              )}
              <WeightChart measurements={withWeight} />
            </div>
          )}

          <div className="event-list">
            {[...measurements].reverse().map((m) => (
              <div key={m.id} className="card task-card">
                <div className="task-card-main">
                  <strong>
                    {new Date(m.measuredDate + 'T00:00').toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </strong>
                  <p className="muted">
                    {m.weightKg != null && `${m.weightKg} kg`}
                    {m.waistCm != null && ` · Cintura ${m.waistCm} cm`}
                    {m.abdomenCm != null && ` · Abdomen ${m.abdomenCm} cm`}
                    {m.armCm != null && ` · Brazo ${m.armCm} cm`}
                    {m.legCm != null && ` · Pierna ${m.legCm} cm`}
                  </p>
                </div>
                <ConfirmButton label="Eliminar" onConfirm={() => handleDeleteMeasurement(m.id)} />
              </div>
            ))}
            {measurements.length === 0 && <p className="muted">Todavía no hay medidas registradas.</p>}
          </div>

          {activeMemberId && <AddMeasurementForm memberId={activeMemberId} onAdded={reload} />}

          <h2>Fotos de evolución</h2>
          <div className="gallery-grid">
            {photos.map((p) => (
              <div key={p.id} className="gallery-item">
                {photoUrls[p.id] && <img src={photoUrls[p.id]} alt={p.caption ?? ''} />}
                <ConfirmIconButton
                  className="gallery-item-delete"
                  ariaLabel="Borrar foto"
                  onConfirm={() => handleDeletePhoto(p)}
                />
                {p.caption && <p className="muted">{p.caption}</p>}
                <p className="muted gallery-item-date">
                  {new Date(p.photoDate + 'T00:00').toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            ))}
            {photos.length === 0 && <p className="muted">Todavía no hay fotos de evolución.</p>}
          </div>

          {activeMemberId && <AddPhotoFormBody memberId={activeMemberId} onAdded={reload} />}
        </>
      )}
    </div>
  )
}

function WeightChart({ measurements }: { measurements: BodyMeasurement[] }) {
  const points = measurements as (BodyMeasurement & { weightKg: number })[]
  if (points.length < 2) return null

  const width = 300
  const height = 120
  const padding = 24
  const weights = points.map((p) => p.weightKg)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const range = max - min || 1

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2)
    const y = height - padding - ((p.weightKg - min) / range) * (height - padding * 2)
    return { x, y }
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="weight-chart" role="img" aria-label="Gráfico de evolución del peso">
      <polyline points={coords.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="3" fill="var(--primary)" />
      ))}
      <text x={padding} y={12} fontSize="10" fill="#6b7280">
        {max} kg
      </text>
      <text x={padding} y={height - 6} fontSize="10" fill="#6b7280">
        {min} kg
      </text>
    </svg>
  )
}

function AddMeasurementForm({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [date, setDate] = useState(() => toDateStr(new Date()))
  const [weightKg, setWeightKg] = useState('')
  const [waistCm, setWaistCm] = useState('')
  const [abdomenCm, setAbdomenCm] = useState('')
  const [armCm, setArmCm] = useState('')
  const [legCm, setLegCm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addBodyMeasurement({
        memberId,
        date,
        weightKg: weightKg ? Number(weightKg) : null,
        waistCm: waistCm ? Number(waistCm) : null,
        abdomenCm: abdomenCm ? Number(abdomenCm) : null,
        armCm: armCm ? Number(armCm) : null,
        legCm: legCm ? Number(legCm) : null,
      })
      setWeightKg('')
      setWaistCm('')
      setAbdomenCm('')
      setArmCm('')
      setLegCm('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Registrar peso y medidas</h2>
      <label>
        Fecha
        <input type="date" value={date} max={toDateStr(new Date())} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Peso (kg)
        <input type="number" step="0.1" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
      </label>
      <label>
        Cintura (cm, opcional)
        <input type="number" step="0.1" value={waistCm} onChange={(e) => setWaistCm(e.target.value)} />
      </label>
      <label>
        Abdomen (cm, opcional)
        <input type="number" step="0.1" value={abdomenCm} onChange={(e) => setAbdomenCm(e.target.value)} />
      </label>
      <label>
        Brazo (cm, opcional)
        <input type="number" step="0.1" value={armCm} onChange={(e) => setArmCm(e.target.value)} />
      </label>
      <label>
        Pierna (cm, opcional)
        <input type="number" step="0.1" value={legCm} onChange={(e) => setLegCm(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

function AddPhotoFormBody({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [date, setDate] = useState(() => toDateStr(new Date()))
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Elige una foto')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await uploadBodyPhoto({ memberId, date, file, caption })
      setFile(null)
      setCaption('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Subir foto de evolución</h2>
      <label>
        Foto
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
      </label>
      <label>
        Fecha
        <input type="date" value={date} max={toDateStr(new Date())} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Nota (opcional)
        <input type="text" value={caption} onChange={(e) => setCaption(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Subiendo…' : 'Subir'}
      </button>
    </form>
  )
}
