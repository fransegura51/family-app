import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  addFoodLog,
  addRecipeIngredientsToShoppingList,
  createRecipe,
  deleteFoodLog,
  deleteMenuEntry,
  deleteRecipe,
  listFoodLogs,
  listMenuEntries,
  listRecentFoodLogs,
  listRecipes,
  setMenuEntry,
} from '@/data/food'
import { listFamilyMembers } from '@/data/family'
import { searchRecipe } from '@/services/recipeSearch'
import { parseWikibooksRecipe, type ParsedRecipe } from '@/domain/wikibooksRecipeParser'
import { searchFoods, getFoodDetail, type FoodSearchResult, type PerGram } from '@/services/fatsecret'
import type { FamilyMember, FoodLog, MealType, MenuEntry, Recipe } from '@/domain/types'

const SUB_TABS = ['Menú', 'Recetas', 'Registro'] as const
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
      <div className="filter-row">
        {SUB_TABS.map((t) => (
          <button key={t} className={'chip' + (tab === t ? ' chip-active' : '')} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Menú' && <MenuTab />}
      {tab === 'Recetas' && <RecipesTab />}
      {tab === 'Registro' && <FoodLogTab />}
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
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => deleteMenuEntry(entry.id).then(reload)}
                    >
                      Quitar
                    </button>
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

function RecipesTab() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    listRecipes()
      .then(setRecipes)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  async function handleGenerateList(recipe: Recipe) {
    try {
      await addRecipeIngredientsToShoppingList(recipe)
      setInfo(`Ingredientes de "${recipe.title}" añadidos a la lista de la compra.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la lista')
    }
  }

  if (loading) return <p className="muted">Cargando recetas…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {info && <p className="muted">{info}</p>}
      <div className="event-list">
        {recipes.map((recipe) => (
          <div key={recipe.id} className="card recipe-card">
            <strong>{recipe.title}</strong>
            {recipe.notes && <p className="muted">{recipe.notes}</p>}
            <ul className="ingredient-list">
              {recipe.ingredients.map((i) => (
                <li key={i.id}>
                  {i.name}
                  {i.quantity && ` — ${i.quantity}${i.unit ? ' ' + i.unit : ''}`}
                </li>
              ))}
            </ul>
            <div className="task-card-actions">
              <button type="button" className="link-button" onClick={() => handleGenerateList(recipe)}>
                Generar lista de la compra
              </button>
              <button type="button" className="link-button" onClick={() => deleteRecipe(recipe.id).then(reload)}>
                Borrar
              </button>
            </div>
          </div>
        ))}
        {recipes.length === 0 && <p className="muted">Todavía no hay recetas.</p>}
      </div>
      <AddRecipeForm onAdded={reload} />
    </div>
  )
}

type SearchStatus = 'idle' | 'searching' | 'not-found' | 'error'

function AddRecipeForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [found, setFound] = useState<ParsedRecipe | null>(null)

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
      setSearchStatus('idle')
    } catch {
      setSearchStatus('error')
    }
  }

  function useFoundRecipe() {
    if (!found) return
    setIngredients(found.ingredients.map((i) => `${i}, ,`).join('\n'))
    setNotes(found.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'))
    setFound(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createRecipe({ title, notes, ingredientLines: ingredients.split('\n') })
      setTitle('')
      setNotes('')
      setIngredients('')
      setSearchStatus('idle')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la receta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nueva receta</h2>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Tortilla de patatas" />
      </label>
      <button type="button" className="link-button" onClick={handleSearch} disabled={!title.trim() || searchStatus === 'searching'}>
        {searchStatus === 'searching' ? 'Buscando en Internet…' : '🔍 Buscar receta en Internet'}
      </button>
      {searchStatus === 'not-found' && (
        <p className="muted">No he encontrado "{title}" en el recetario de Wikibooks — escríbela a mano abajo.</p>
      )}
      {searchStatus === 'error' && <p className="error">No se pudo buscar ahora mismo, inténtalo de nuevo.</p>}

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
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear receta'}
      </button>

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
            <p className="muted">Encontrada en el recetario abierto de Wikibooks.</p>

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
              <button type="button" className="link-button" onClick={() => deleteFoodLog(log.id).then(reload)}>
                Eliminar
              </button>
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

  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [results, setResults] = useState<FoodSearchResult[] | null>(null)
  const [pickingId, setPickingId] = useState<string | null>(null)

  // Cuando FatSecret da datos "por gramo" para el alimento elegido, se
  // guardan aquí para poder recalcular calorías/macros al vuelo según
  // los gramos que teclee la usuaria ("100g de pechuga de pollo").
  const [perGram, setPerGram] = useState<PerGram | null>(null)
  const [grams, setGrams] = useState('100')

  // Últimos alimentos de esta persona, para repetir "café con leche" con
  // un toque en vez de escribirlo y buscarlo en FatSecret cada vez —
  // solo el más reciente de cada nombre, sin importar el día.
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
    setPerGram(null)
    setGrams('100')
  }

  async function handleSearch() {
    if (!description.trim()) return
    setSearchStatus('searching')
    setResults(null)
    try {
      const found = await searchFoods(description.trim())
      if (found.length === 0) {
        setSearchStatus('not-found')
        return
      }
      setResults(found)
      setSearchStatus('idle')
    } catch {
      setSearchStatus('error')
    }
  }

  function applyGrams(pg: PerGram, g: string) {
    const n = Number(g)
    const amount = Number.isFinite(n) && n > 0 ? n : 0
    setCalories(String(Math.round(pg.calories * amount)))
    setProteinG(String(Math.round(pg.proteinG * amount * 10) / 10))
    setCarbsG(String(Math.round(pg.carbsG * amount * 10) / 10))
    setFatG(String(Math.round(pg.fatG * amount * 10) / 10))
  }

  function handleGramsChange(g: string) {
    setGrams(g)
    if (perGram) applyGrams(perGram, g)
  }

  async function handlePick(result: FoodSearchResult) {
    setPickingId(result.id)
    try {
      const detail = await getFoodDetail(result.id)
      setDescription(detail.name)
      setIsEstimated(false)
      setResults(null)
      if (detail.perGram) {
        setPerGram(detail.perGram)
        applyGrams(detail.perGram, grams)
      } else {
        setPerGram(null)
        setCalories(detail.calories != null ? String(Math.round(detail.calories)) : '')
        setProteinG(detail.proteinG != null ? String(detail.proteinG) : '')
        setCarbsG(detail.carbsG != null ? String(detail.carbsG) : '')
        setFatG(detail.fatG != null ? String(detail.fatG) : '')
      }
    } catch {
      setError('No se pudo leer el detalle de ese alimento')
    } finally {
      setPickingId(null)
    }
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
      setSearchStatus('idle')
      setPerGram(null)
      setGrams('100')
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
            Cantidad (gramos)
            <input type="number" value={grams} onChange={(e) => handleGramsChange(e.target.value)} min="1" />
          </label>
          <button
            type="button"
            className="fatsecret-search-button"
            onClick={handleSearch}
            disabled={!description.trim() || searchStatus === 'searching'}
          >
            {searchStatus === 'searching' ? 'Buscando en FatSecret…' : '🔍 Buscar datos reales en FatSecret'}
          </button>
          {searchStatus === 'not-found' && (
            <p className="muted">No he encontrado "{description}" en FatSecret — pon los datos a mano abajo.</p>
          )}
          {searchStatus === 'error' && <p className="error">No se pudo buscar ahora mismo, inténtalo de nuevo.</p>}
          {!perGram && (
            <p className="muted">
              Busca el alimento y elige un resultado para que las calorías y macros se calculen solas según los
              gramos.
            </p>
          )}
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

      {results && (
        <div className="modal-overlay" onClick={() => setResults(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Resultados en FatSecret
              </h2>
              <button type="button" className="modal-close" onClick={() => setResults(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="event-list">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="card recipe-card"
                  style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                  disabled={pickingId === r.id}
                  onClick={() => handlePick(r)}
                >
                  <strong>{r.name}</strong>
                  <p className="muted">{pickingId === r.id ? 'Cargando…' : r.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
