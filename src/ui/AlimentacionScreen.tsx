import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { paletteByName, pastelPalette } from '@/domain/colors'
import { dedupeStepNumbers } from '@/domain/recipeSteps'
import {
  ALIMENTACION_MENU_ITEM_META,
  alimentacionMenuEntryMeta,
  isCustomAlimentacionMenuKey,
  loadAlimentacionMenuLayout,
  loadAlimentacionPinnedItems,
  saveAlimentacionMenuLayout,
  saveAlimentacionPinnedItems,
  type AlimentacionMenuEntry,
  type AlimentacionMenuGroup,
  type AlimentacionMenuItemKey,
} from '@/state/alimentacionMenu'
import {
  addRecipeIngredientsToShoppingList,
  createRecipe,
  deleteMenuEntry,
  deleteRecipe,
  getRecipePhotoUrl,
  listMenuEntries,
  listRecipes,
  listRecipeSearchHistory,
  logRecipeSearch,
  setMenuEntry,
  updateMenuEntry,
  updateRecipe,
  uploadRecipePhoto,
} from '@/data/food'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { fetchWikibooksRecipe, searchRecipeCandidates, type WikibooksSearchResult } from '@/services/recipeSearch'
import { getFatSecretRecipe, searchFatSecretRecipes, type FatSecretRecipeResult } from '@/services/fatsecretRecipes'
import { searchCookpadRecipes, type CookpadSearchResult } from '@/services/cookpadSearch'
import { parseWikibooksRecipe, type ParsedRecipe } from '@/domain/wikibooksRecipeParser'
import { fetchImageFromUrl, importRecipeFromUrl } from '@/services/recipeUrlImport'
import { listShoppingStores } from '@/data/shoppingStores'
import type { ShoppingStoreEntry } from '@/domain/types'
import type { MealType, MenuEntry, Recipe } from '@/domain/types'
import kitchenHeaderImg from '@/assets/alimentacion/kitchen-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { recipeText } from '@/domain/share'
import { fetchAsShareableFile, shareFiles, shareText } from '@/services/share'

const SUB_TABS = ['Inicio', 'Menú', 'Recetas'] as const
type SubTab = (typeof SUB_TABS)[number]

function isAlimentacionSubTab(key: AlimentacionMenuItemKey): key is SubTab {
  return (SUB_TABS as readonly string[]).includes(key)
}

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

// Petición real: extender el pastel al menú semanal — un color POR
// DÍA DE LA SEMANA (lunes=0..domingo=6, calculado del propio dateStr,
// no de su posición en weekDates()) para que el lunes sea siempre el
// mismo color de una semana a otra, en vez de cambiar según qué día
// caiga primero en la vista de "próximos 7 días".
const WEEKDAY_COLORS = pastelPalette(7)
function weekdayColor(dateStr: string): string {
  const jsDay = new Date(dateStr + 'T00:00').getDay()
  return WEEKDAY_COLORS[(jsDay + 6) % 7]
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
  return found ?? 'Inicio'
}

export function AlimentacionScreen() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<SubTab>(() => initialTabFromParam(searchParams.get('tab')))
  // Petición real: "todas estas pestañas... quiero que hagamos como en
  // economía... el mismo formato que el menú de economía" — mismo
  // desplegable ☰ con sacar/meter/editar (ver economiaMenu.ts /
  // EconomiaMenuDropdown en FinanceScreen.tsx), aplicado aquí.
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<AlimentacionMenuItemKey[]>(() => loadAlimentacionPinnedItems())
  const [menuLayout, setMenuLayout] = useState<AlimentacionMenuGroup[]>(() => loadAlimentacionMenuLayout())
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  function persistMenuLayout(next: AlimentacionMenuGroup[]) {
    setMenuLayout(next)
    saveAlimentacionMenuLayout(next)
  }

  function togglePinnedItem(key: AlimentacionMenuItemKey) {
    setPinnedItems((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      saveAlimentacionPinnedItems(next)
      return next
    })
  }

  function handleAction(key: AlimentacionMenuItemKey) {
    if (isAlimentacionSubTab(key)) setTab(key)
    // Un acceso personalizado no lleva a ningún sitio todavía.
  }

  const flatMenuEntries = menuLayout.flatMap((g) => g.items)

  return (
    <div className="screen">
      {/* Petición real, con imagen de referencia: "pon esta imagen en
          la cabecera de la cocina de Pepa y quita el texto" — la foto
          ya trae el título "La cocina de Pepa" dibujado, así que el
          <h1> de texto plano sobra. "Habrá que resaltar el botón del
          menú": al no haber ya un fondo liso detrás, el ☰ pasa a ser
          una píldora opaca con sombra (en vez del círculo gris de
          section-menu-fab, pensado para fondos lisos), para que se
          vea igual de bien encima de cualquier parte de la foto. */}
      <div className="kitchen-header">
        <img src={kitchenHeaderImg} alt="La cocina de Pepa" className="kitchen-header-img" />
        <button
          type="button"
          className="kitchen-header-menu-fab kitchen-header-menu-fab-floating"
          onClick={() => {
            if (!menuOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
            setMenuOpen((v) => !v)
          }}
          aria-label={menuOpen ? 'Cerrar menú de Alimentación' : 'Abrir menú de Alimentación'}
        >
          {menuOpen ? '✕' : '☰'} Menú
        </button>
      </div>
      {menuOpen && (
        <AlimentacionMenuDropdown
          activeTab={tab}
          layout={menuLayout}
          onLayoutChange={persistMenuLayout}
          pinnedItems={pinnedItems}
          onTogglePin={togglePinnedItem}
          onActivate={handleAction}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {pinnedItems.length > 0 && (
        <div className="filter-row">
          {flatMenuEntries
            .filter((entry) => pinnedItems.includes(entry.key))
            .map((entry) => {
              const meta = alimentacionMenuEntryMeta(entry)
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={'chip' + (isAlimentacionSubTab(entry.key) && tab === entry.key ? ' chip-active' : '')}
                  onClick={() => {
                    if (isCustomAlimentacionMenuKey(entry.key)) {
                      setPlaceholderNotice(true)
                      setTimeout(() => setPlaceholderNotice(false), 2500)
                    } else {
                      handleAction(entry.key)
                    }
                  }}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
        </div>
      )}
      {placeholderNotice && (
        <p className="muted" style={{ fontSize: 12 }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {tab === 'Inicio' && <AlimentacionInicioTab onNavigate={setTab} />}
      {tab === 'Menú' && <MenuTab />}
      {tab === 'Recetas' && <RecipesTab />}
    </div>
  )
}

function AlimentacionInicioTab({ onNavigate }: { onNavigate: (tab: SubTab) => void }) {
  const shortcuts: { tab: SubTab; body: string }[] = [
    { tab: 'Menú', body: 'Planifica desayuno, comida, merienda y cena de toda la semana.' },
    { tab: 'Recetas', body: 'Busca, importa y organiza las recetas de la familia, con foto y etiquetas.' },
  ]
  // Un color pastel por tarjeta, igual que Compras Inicio.
  const cardColors = pastelPalette(shortcuts.length)
  return (
    <div className="event-list">
      {shortcuts.map((s, i) => {
        const meta = ALIMENTACION_MENU_ITEM_META[s.tab]
        return (
          <button
            key={s.tab}
            type="button"
            className="section-shortcut-card"
            style={{ background: cardColors[i] }}
            onClick={() => onNavigate(s.tab)}
          >
            <span className="section-shortcut-card-icon" aria-hidden="true">
              {meta.icon}
            </span>
            <span>
              <strong>{meta.label}</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {s.body}
              </p>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Petición real: "todas estas pestañas... quiero que haga su menú de
// inicio con tres rayas arriba y metas todas las pestañas en el menú
// de inicio, meter y sacar para obtenerla fuera o dentro, poder editar
// nuevas pestañas y hacerlo con el mismo formato que el menú de
// economía" — copia de EconomiaMenuDropdown (ver FinanceScreen.tsx)
// adaptada a las claves de Alimentación; incluso reutiliza las mismas
// clases CSS .economia-menu-* (genéricas, no específicas de Economía).
function AlimentacionMenuDropdown({
  activeTab,
  layout,
  onLayoutChange,
  pinnedItems,
  onTogglePin,
  onActivate,
  onClose,
}: {
  activeTab: SubTab
  layout: AlimentacionMenuGroup[]
  onLayoutChange: (next: AlimentacionMenuGroup[]) => void
  pinnedItems: AlimentacionMenuItemKey[]
  onTogglePin: (key: AlimentacionMenuItemKey) => void
  onActivate: (key: AlimentacionMenuItemKey) => void
  onClose: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [addingGroupName, setAddingGroupName] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [addingCustomItem, setAddingCustomItem] = useState(false)
  const [newItemIcon, setNewItemIcon] = useState('📌')
  const [newItemLabel, setNewItemLabel] = useState('')
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null)
  const [editItemIcon, setEditItemIcon] = useState('')
  const [editItemLabel, setEditItemLabel] = useState('')
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  function moveItem(groupId: string, index: number, direction: -1 | 1) {
    const group = layout.find((g) => g.id === groupId)
    if (!group) return
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= group.items.length) return
    const items = [...group.items]
    ;[items[index], items[newIndex]] = [items[newIndex], items[index]]
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items } : g)))
  }

  function moveItemToGroup(itemKey: AlimentacionMenuItemKey, fromGroupId: string, toGroupId: string) {
    if (fromGroupId === toGroupId) return
    const moved = layout.find((g) => g.id === fromGroupId)?.items.find((it) => it.key === itemKey)
    if (!moved) return
    onLayoutChange(
      layout.map((g) => {
        if (g.id === fromGroupId) return { ...g, items: g.items.filter((it) => it.key !== itemKey) }
        if (g.id === toGroupId) return { ...g, items: [...g.items, moved] }
        return g
      }),
    )
  }

  function handleAddGroup(e: FormEvent) {
    e.preventDefault()
    if (!addingGroupName.trim()) return
    onLayoutChange([...layout, { id: crypto.randomUUID(), name: addingGroupName.trim(), items: [] }])
    setAddingGroupName('')
    setAddingGroup(false)
  }

  function handleRenameGroup(id: string) {
    onLayoutChange(layout.map((g) => (g.id === id ? { ...g, name: renameValue.trim() || null } : g)))
    setRenamingGroupId(null)
  }

  function deleteGroup(id: string) {
    const group = layout.find((g) => g.id === id)
    const rest = layout.filter((g) => g.id !== id)
    if (!group || rest.length === 0) return
    const [first, ...others] = rest
    onLayoutChange([{ ...first, items: [...first.items, ...group.items] }, ...others])
  }

  function handleAddCustomItem(e: FormEvent) {
    e.preventDefault()
    if (!newItemLabel.trim()) return
    const entry: AlimentacionMenuEntry = { key: `custom:${crypto.randomUUID()}`, icon: newItemIcon, label: newItemLabel.trim() }
    onLayoutChange(layout.map((g, i) => (i === 0 ? { ...g, items: [...g.items, entry] } : g)))
    setNewItemIcon('📌')
    setNewItemLabel('')
    setAddingCustomItem(false)
  }

  function handleSaveItem(groupId: string, key: AlimentacionMenuItemKey) {
    onLayoutChange(
      layout.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((it) => (it.key === key ? { ...it, icon: editItemIcon, label: editItemLabel.trim() || it.label } : it)) }
          : g,
      ),
    )
    setEditingItemKey(null)
  }

  function deleteItem(groupId: string, key: AlimentacionMenuItemKey) {
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((it) => it.key !== key) } : g)))
  }

  function handleItemActivate(entry: AlimentacionMenuEntry) {
    if (isCustomAlimentacionMenuKey(entry.key)) {
      setPlaceholderNotice(true)
      setTimeout(() => setPlaceholderNotice(false), 2500)
      return
    }
    onActivate(entry.key)
    onClose()
  }

  return (
    <div className="economia-menu-dropdown">
      <button type="button" className="link-button economia-menu-edit-toggle" onClick={() => setEditMode((v) => !v)}>
        {editMode ? '✓ Listo' : '✏️ Editar'}
      </button>

      {layout.map((group) => (
        <div key={group.id} className="economia-menu-group">
          {(group.name || editMode) &&
            (renamingGroupId === group.id ? (
              <form
                className="inline-fields"
                style={{ margin: '4px 4px 6px' }}
                onSubmit={(e) => {
                  e.preventDefault()
                  handleRenameGroup(group.id)
                }}
              >
                <input type="text" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus style={{ flex: 1 }} />
                <button type="submit">Guardar</button>
              </form>
            ) : (
              <div className="economia-menu-group-title">
                <span>{group.name ?? 'Sin categoría'}</span>
                {editMode && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="link-button"
                      style={{ padding: '2px 6px' }}
                      onClick={() => {
                        setRenamingGroupId(group.id)
                        setRenameValue(group.name ?? '')
                      }}
                      aria-label={`Renombrar categoría ${group.name ?? ''}`}
                    >
                      ✎
                    </button>
                    {layout.length > 1 && (
                      <ConfirmIconButton
                        icon="✕"
                        className="link-button"
                        ariaLabel={`Eliminar categoría ${group.name ?? ''}`}
                        onConfirm={() => deleteGroup(group.id)}
                      />
                    )}
                  </span>
                )}
              </div>
            ))}

          {group.items.map((entry, i) => {
            const meta = alimentacionMenuEntryMeta(entry)
            const isTab = isAlimentacionSubTab(entry.key)
            const isCustom = isCustomAlimentacionMenuKey(entry.key)

            if (editMode && editingItemKey === entry.key) {
              return (
                <form
                  key={entry.key}
                  className="inline-fields"
                  style={{ margin: '2px 4px' }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleSaveItem(group.id, entry.key)
                  }}
                >
                  <input type="text" value={editItemIcon} onChange={(e) => setEditItemIcon(e.target.value)} style={{ width: 48, textAlign: 'center', flex: 'none' }} maxLength={4} autoFocus />
                  <input type="text" value={editItemLabel} onChange={(e) => setEditItemLabel(e.target.value)} style={{ flex: 1 }} />
                  <button type="submit">Guardar</button>
                </form>
              )
            }

            return (
              <div key={entry.key} className={'economia-menu-row' + (isTab && activeTab === entry.key ? ' active' : '')}>
                {editMode ? (
                  <span className="economia-menu-item">
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </span>
                ) : (
                  <button type="button" className="economia-menu-item" onClick={() => handleItemActivate(entry)}>
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </button>
                )}

                {editMode ? (
                  <span className="economia-menu-edit-controls">
                    <button type="button" className="link-button" style={{ padding: '2px 6px' }} disabled={i === 0} onClick={() => moveItem(group.id, i, -1)} aria-label={`Subir ${meta.label}`}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      style={{ padding: '2px 6px' }}
                      disabled={i === group.items.length - 1}
                      onClick={() => moveItem(group.id, i, 1)}
                      aria-label={`Bajar ${meta.label}`}
                    >
                      ↓
                    </button>
                    <select
                      value={group.id}
                      onChange={(e) => moveItemToGroup(entry.key, group.id, e.target.value)}
                      aria-label={`Mover ${meta.label} a otra categoría`}
                    >
                      {layout.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name ?? 'Sin categoría'}
                        </option>
                      ))}
                    </select>
                    {isCustom && (
                      <>
                        <button
                          type="button"
                          className="link-button"
                          style={{ padding: '2px 6px' }}
                          onClick={() => {
                            setEditingItemKey(entry.key)
                            setEditItemIcon(meta.icon)
                            setEditItemLabel(meta.label)
                          }}
                          aria-label={`Renombrar ${meta.label}`}
                        >
                          ✎
                        </button>
                        <ConfirmIconButton
                          icon="✕"
                          className="link-button"
                          ariaLabel={`Eliminar ${meta.label}`}
                          onConfirm={() => deleteItem(group.id, entry.key)}
                        />
                      </>
                    )}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="economia-menu-pin"
                    onClick={() => onTogglePin(entry.key)}
                    aria-label={pinnedItems.includes(entry.key) ? `Quitar ${meta.label} de la pantalla de Alimentación` : `Sacar ${meta.label} a la pantalla de Alimentación`}
                  >
                    {pinnedItems.includes(entry.key) ? '📍 Quitar' : '📌 Sacar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {placeholderNotice && (
        <p className="muted" style={{ fontSize: 12, padding: '4px 12px' }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {editMode && (
        <>
          {addingCustomItem ? (
            <form onSubmit={handleAddCustomItem} className="inline-fields" style={{ margin: '6px 4px' }}>
              <input
                type="text"
                value={newItemIcon}
                onChange={(e) => setNewItemIcon(e.target.value)}
                style={{ width: 48, textAlign: 'center', flex: 'none' }}
                maxLength={4}
                aria-label="Icono"
              />
              <input
                type="text"
                value={newItemLabel}
                onChange={(e) => setNewItemLabel(e.target.value)}
                placeholder="Nombre del acceso"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="submit">Crear</button>
            </form>
          ) : (
            <button type="button" className="economia-menu-item" onClick={() => setAddingCustomItem(true)}>
              <span aria-hidden="true">📌</span>
              Nuevo acceso
            </button>
          )}

          {addingGroup ? (
            <form onSubmit={handleAddGroup} className="inline-fields" style={{ margin: '6px 4px' }}>
              <input
                type="text"
                value={addingGroupName}
                onChange={(e) => setAddingGroupName(e.target.value)}
                placeholder="Nombre de la categoría"
                autoFocus
                style={{ flex: 1 }}
              />
              <button type="submit">Crear</button>
            </form>
          ) : (
            <button type="button" className="economia-menu-item" onClick={() => setAddingGroup(true)}>
              <span aria-hidden="true">➕</span>
              Nueva categoría
            </button>
          )}
        </>
      )}
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
  // Bug real: "en menú semanal no se puede editar una vez guardado,
  // solo borrar" — antes la única forma de cambiar un día era Quitar +
  // volver a Añadir desde cero.
  const [editingId, setEditingId] = useState<string | null>(null)

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

  // Pepa (VoiceCapture) puede apuntar un plato desde cualquier pantalla.
  useEffect(() => {
    window.addEventListener('family-app:menu-changed', reload)
    return () => window.removeEventListener('family-app:menu-changed', reload)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="muted">Cargando menú…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {dates.map((date) => (
        <div key={date} className="card menu-day" style={{ background: weekdayColor(date) }}>
          <strong>
            {new Date(date + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
          </strong>
          {MEAL_TYPES.filter((m) => m.value !== 'snack').map((meal) => {
            const entry = entries.find((e) => e.entryDate === date && e.mealType === meal.value)
            const recipe = entry?.recipeId ? recipes.find((r) => r.id === entry.recipeId) : null
            const isAdding = addingFor?.date === date && addingFor.meal === meal.value
            const isEditing = entry && editingId === entry.id
            return (
              <div key={meal.value} className="menu-row">
                <span className="muted menu-meal-label">{meal.label}</span>
                {entry && isEditing ? (
                  <MenuEntryPicker
                    recipes={recipes}
                    initialRecipeId={entry.recipeId}
                    initialFreeText={entry.freeText}
                    onPick={async (pick) => {
                      await updateMenuEntry(entry.id, pick)
                      setEditingId(null)
                      reload()
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : entry ? (
                  <>
                    <span>{recipe?.title ?? entry.freeText}</span>
                    <button type="button" className="link-button" onClick={() => setEditingId(entry.id)}>
                      Editar
                    </button>
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
  initialRecipeId,
  initialFreeText,
}: {
  recipes: Recipe[]
  onPick: (input: { recipeId: string | null; freeText: string | null }) => void
  onCancel: () => void
  initialRecipeId?: string | null
  initialFreeText?: string | null
}) {
  const [recipeId, setRecipeId] = useState(initialRecipeId ?? '')
  const [freeText, setFreeText] = useState(initialFreeText ?? '')

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

function normalizeRecipeSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

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
  const [recipeSearch, setRecipeSearch] = useState('')
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [adding, setAdding] = useState(false)

  // Petición real: "Recetas: compartir una receta" — título, ingredientes
  // y preparación en texto, más la foto si la receta tiene una (falla en
  // silencio si no se puede bajar: mejor compartir solo el texto que no
  // compartir nada).
  async function handleShareRecipe(recipe: Recipe) {
    const text = recipeText(recipe)
    try {
      let photoFile: File | null = null
      if (recipe.imagePath) {
        try {
          const url = await getRecipePhotoUrl(recipe.imagePath)
          photoFile = await fetchAsShareableFile(url, `${recipe.title}.jpg`, 'image/jpeg')
        } catch {
          photoFile = null
        }
      }
      const shared = photoFile
        ? await shareFiles([photoFile], { title: recipe.title, text })
        : false
      if (!shared) {
        const sharedText = await shareText({ title: recipe.title, text })
        setInfo(sharedText ? null : 'Copiado al portapapeles.')
      }
    } catch (err) {
      setError(errorMessage(err, 'No se pudo compartir la receta'))
    }
  }

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
  // Las etiquetas de receta son texto libre por familia (sin color
  // guardado) — mismo criterio determinista que clases de producto y
  // tiendas en Compras (paletteByName): mismo nombre, siempre el mismo
  // color, en los chips de filtro y en la fila de cada receta.
  const tagColors = paletteByName(availableTags)
  const filteredRecipes = recipes
    .filter((r) => tagFilter === 'Todas' || r.tags.includes(tagFilter))
    .sort((a, b) => a.title.localeCompare(b.title))
  const viewing = viewingId ? (recipes.find((r) => r.id === viewingId) ?? null) : null

  // Petición real: "entre la foto y la fila de etiquetas... un
  // buscador para buscar las recetas que tenga guardadas y que me
  // lleve directamente a las recetas" — busca solo entre lo ya
  // guardado (no en internet, para eso está "+ Nueva receta") y
  // pinchar un resultado abre directamente su ficha.
  const normalizedRecipeSearch = normalizeRecipeSearch(recipeSearch)
  const recipeSearchMatches = normalizedRecipeSearch
    ? recipes
        .filter((r) => normalizeRecipeSearch(r.title).includes(normalizedRecipeSearch))
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 8)
    : []

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {info && <p className="muted">{info}</p>}

      <label>
        🔍 Buscar receta guardada
        <input
          type="search"
          value={recipeSearch}
          onChange={(e) => setRecipeSearch(e.target.value)}
          placeholder="Escribe el nombre de la receta…"
        />
      </label>
      {normalizedRecipeSearch && (
        <div className="card" style={{ padding: 8, marginBottom: 12 }}>
          {recipeSearchMatches.map((r) => (
            <button
              key={r.id}
              type="button"
              className="recipe-list-row"
              style={{ background: r.tags[0] ? tagColors.get(r.tags[0]) : undefined }}
              onClick={() => {
                setViewingId(r.id)
                setRecipeSearch('')
              }}
            >
              <RecipeImage imagePath={r.imagePath} alt="" />
              <span>{r.title}</span>
            </button>
          ))}
          {recipeSearchMatches.length === 0 && <p className="muted" style={{ margin: '4px 8px' }}>Ninguna receta guardada con ese nombre.</p>}
        </div>
      )}

      <div className="filter-row">
        <button type="button" className={'chip' + (tagFilter === 'Todas' ? ' chip-active' : '')} onClick={() => setTagFilter('Todas')}>
          Todas
        </button>
        {availableTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={'chip' + (tagFilter === tag ? ' chip-active' : '')}
            style={{ background: tagColors.get(tag) }}
            onClick={() => setTagFilter(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="event-list">
        {filteredRecipes.map((r) => (
          <button
            key={r.id}
            type="button"
            className="recipe-list-row"
            style={{ background: r.tags[0] ? tagColors.get(r.tags[0]) : undefined }}
            onClick={() => setViewingId(r.id)}
          >
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
            {/* Petición real: las acciones de la receta, arriba a la altura de
                las etiquetas y solo con símbolos (compra, compartir, editar,
                borrar), en vez de una fila de texto al final de todo. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
              <div className="filter-row" style={{ margin: 0 }}>
                {viewing.tags.map((t) => (
                  <span key={t} className="chip" style={{ background: tagColors.get(t) }}>
                    {t}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 'none', marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="link-button"
                  style={{ fontSize: 20 }}
                  onClick={() => setPickingFor(viewing)}
                  title="Añadir a la lista de la compra"
                  aria-label="Añadir a la lista de la compra"
                >
                  🛒
                </button>
                <button
                  type="button"
                  className="link-button"
                  style={{ fontSize: 20 }}
                  onClick={() => handleShareRecipe(viewing)}
                  title="Compartir receta"
                  aria-label="Compartir receta"
                >
                  📤
                </button>
                <button
                  type="button"
                  className="link-button"
                  style={{ fontSize: 20 }}
                  onClick={() => setEditing(viewing)}
                  title="Editar receta"
                  aria-label="Editar receta"
                >
                  ✏️
                </button>
                <ConfirmIconButton
                  icon="✕"
                  className="link-button"
                  ariaLabel="Borrar receta"
                  onConfirm={() =>
                    deleteRecipe(viewing.id).then(() => {
                      setViewingId(null)
                      reload()
                    })
                  }
                />
              </div>
            </div>
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
                <p style={{ whiteSpace: 'pre-wrap' }}>{dedupeStepNumbers(viewing.notes)}</p>
              </div>
            )}
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
      onError(errorMessage(err, 'No se pudo generar la lista'))
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

// Petición real: "quiero recetas con fotos... búscate la vida... hay
// un montón de páginas en Internet... si hay que sacarla de FatSecret
// que tenemos el API, la sacamos de ahí" — el buscador mezcla dos
// fuentes gratis en la misma lista de candidatas: Wikibooks (en
// español, pocas fotos) y FatSecret (con foto casi siempre, pero en
// inglés/EE.UU. en el plan gratis — ver comentario en
// fatsecretRecipes.ts).
type RecipeCandidate =
  | ({ source: 'wikibooks' } & WikibooksSearchResult)
  | ({ source: 'fatsecret' } & FatSecretRecipeResult)
  | ({ source: 'cookpad' } & CookpadSearchResult)

// Petición real: "hay que poder editar las recetas no solo comprar o
// borrar" — mismo formulario para crear y editar (mode), como ya se
// hace con el ticket de Compras (ReceiptForm mode="add"|"edit").
// Filas del formulario de receta: cada ingrediente y cada paso es su propia
// fila (petición real: "el aspecto del formulario de nueva receta no me
// gusta... darle un aspecto más profesional"), y al guardar se convierten
// al mismo texto de siempre (una línea "nombre, cantidad, unidad" por
// ingrediente y "1. paso" por paso), así que no cambia nada en la base de datos.
interface IngredientRow {
  id: string
  name: string
  quantity: string
  unit: string
}
interface StepRow {
  id: string
  text: string
}
let formRowSeq = 0
const newIngredientRow = (over: Partial<IngredientRow> = {}): IngredientRow => ({ id: `ing-${++formRowSeq}`, name: '', quantity: '', unit: '', ...over })
const newStepRow = (text = ''): StepRow => ({ id: `step-${++formRowSeq}`, text })
const UNIT_SUGGESTIONS = ['g', 'kg', 'ml', 'l', 'unidades', 'cucharadas', 'cucharaditas', 'tazas', 'pizca', 'dientes', 'lonchas']

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
  // Si las notas de una receta ya guardada no son una lista numerada de
  // pasos (texto libre), se editan tal cual en un solo cuadro en vez de
  // convertirlas a pasos — no se estropea lo que ya había.
  const legacyNotes =
    !!recipe?.notes && !recipe.notes.split('\n').filter((l) => l.trim()).every((l) => /^\d+\.\s/.test(l.trim()))
  const [notes, setNotes] = useState(recipe?.notes ?? '')
  const [steps, setSteps] = useState<StepRow[]>(() =>
    recipe?.notes && !legacyNotes
      ? recipe.notes
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => newStepRow(dedupeStepNumbers(l.trim()).replace(/^\d+\.\s*/, '')))
      : [newStepRow(), newStepRow()],
  )
  const [ingRows, setIngRows] = useState<IngredientRow[]>(() =>
    recipe && recipe.ingredients.length > 0
      ? recipe.ingredients.map((i) => newIngredientRow({ name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '' }))
      : [newIngredientRow(), newIngredientRow(), newIngredientRow()],
  )
  const [startMode, setStartMode] = useState<'manual' | 'search' | 'url'>('manual')
  const [showImageUrl, setShowImageUrl] = useState(false)
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
  const [searchResults, setSearchResults] = useState<RecipeCandidate[]>([])
  const [found, setFound] = useState<ParsedRecipe | null>(null)
  const [foundSource, setFoundSource] = useState<'wikibooks' | 'url' | 'fatsecret' | 'cookpad' | null>(null)
  const [foundImagePath, setFoundImagePath] = useState<string | null>(null)
  const [recipeUrl, setRecipeUrl] = useState('')
  const [urlImportStatus, setUrlImportStatus] = useState<'idle' | 'importing' | 'error'>('idle')
  const [urlImportError, setUrlImportError] = useState<string | null>(null)
  const [searchHistory, setSearchHistory] = useState<string[]>([])

  useEffect(() => {
    listRecipeSearchHistory()
      .then(setSearchHistory)
      .catch(() => {})
  }, [])

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
      setImageError(errorMessage(err, 'No se pudo subir la foto'))
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
      setImageError(errorMessage(err, 'No se pudo descargar esa imagen'))
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
      setUrlImportError(errorMessage(err, 'No se pudo importar la receta'))
    }
  }

  // Petición real: "quiero que al buscar una receta en internet se
  // abra una búsqueda... y pueda elegir la que quiera, no que me coja
  // la primera que encuentre" — y después: "quiero recetas con
  // fotos... si hay que sacarla de FatSecret que tenemos el API,
  // sácala de ahí" — y por último: "lo que quiero es importar esa web
  // entera y poder buscar allí" (Cookpad no tiene API gratis, así que
  // se lee su propia página de búsqueda — ver cookpadSearch.ts). Se
  // buscan las tres fuentes a la vez y se juntan en una sola lista de
  // candidatas; solo se trae el texto completo de la que se elija.
  async function handleSearch() {
    const query = title.trim()
    if (!query) return
    setSearchStatus('searching')
    setFound(null)
    setSearchResults([])
    logRecipeSearch(query).catch(() => {})
    setSearchHistory((prev) => [query, ...prev.filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 30))
    try {
      const [wikibooks, fatsecret, cookpad] = await Promise.all([
        searchRecipeCandidates(title.trim()).catch(() => []),
        searchFatSecretRecipes(title.trim()).catch(() => []),
        searchCookpadRecipes(title.trim()).catch(() => []),
      ])
      const results: RecipeCandidate[] = [
        ...cookpad.map((r): RecipeCandidate => ({ source: 'cookpad', ...r })),
        ...fatsecret.map((r): RecipeCandidate => ({ source: 'fatsecret', ...r })),
        ...wikibooks.map((r): RecipeCandidate => ({ source: 'wikibooks', ...r })),
      ]
      if (results.length === 0) {
        setSearchStatus('not-found')
        return
      }
      setSearchResults(results)
      setSearchStatus('idle')
    } catch {
      setSearchStatus('error')
    }
  }

  async function handleSelectCandidate(candidate: RecipeCandidate) {
    setSearchStatus('searching')
    setFoundImagePath(null)
    try {
      if (candidate.source === 'cookpad') {
        // Misma función que "importar desde una URL" — ya descarga y
        // guarda la foto, así que no hace falta ningún paso aparte.
        const result = await importRecipeFromUrl(candidate.url)
        if (result.ingredients.length === 0) {
          setSearchStatus('not-found')
          setSearchResults([])
          return
        }
        setFound({
          title: result.title || candidate.title,
          ingredients: result.ingredients,
          steps: result.instructions ? result.instructions.split('\n').filter(Boolean) : [],
        })
        setFoundSource('cookpad')
        setFoundImagePath(result.imagePath)
        setSearchResults([])
        setSearchStatus('idle')
        return
      }

      if (candidate.source === 'fatsecret') {
        const detail = await getFatSecretRecipe(candidate.id)
        if (detail.ingredients.length === 0 && detail.directions.length === 0) {
          setSearchStatus('not-found')
          setSearchResults([])
          return
        }
        // La foto de FatSecret está en su propio servidor — se
        // descarga y se guarda en nuestro storage, igual que con
        // cualquier otra receta importada (nunca se enlaza en caliente
        // a una web externa).
        let downloadedImagePath: string | null = null
        if (detail.imageUrl) {
          try {
            downloadedImagePath = await fetchImageFromUrl(detail.imageUrl)
          } catch {
            downloadedImagePath = null
          }
        }
        setFound({ title: detail.name, ingredients: detail.ingredients, steps: detail.directions })
        setFoundSource('fatsecret')
        setFoundImagePath(downloadedImagePath)
        setSearchResults([])
        setSearchStatus('idle')
        return
      }

      const page = await fetchWikibooksRecipe(candidate.title)
      const parsed = page ? parseWikibooksRecipe(page.title, page.wikitext) : null
      if (!parsed || (parsed.ingredients.length === 0 && parsed.steps.length === 0)) {
        setSearchStatus('not-found')
        setSearchResults([])
        return
      }
      setFound(parsed)
      setFoundSource('wikibooks')
      setSearchResults([])
      setSearchStatus('idle')
    } catch {
      setSearchStatus('error')
    }
  }

  function useFoundRecipe() {
    if (!found) return
    if (found.title && !title.trim()) setTitle(found.title)
    setIngRows(found.ingredients.length > 0 ? found.ingredients.map((i) => newIngredientRow({ name: i })) : [newIngredientRow()])
    setSteps(found.steps.length > 0 ? found.steps.map((st) => newStepRow(dedupeStepNumbers(st).replace(/^\d+\.\s*/, ''))) : [newStepRow()])
    setStartMode('manual')
    if (foundImagePath) setImagePath(foundImagePath)
    setFound(null)
    setFoundImagePath(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const ingredientLines = ingRows
        .filter((r) => r.name.trim())
        .map((r) => [r.name.replace(/,/g, ' ').trim(), r.quantity.trim(), r.unit.trim()].join(', '))
      const notesOut = legacyNotes
        ? notes
        : steps
            .map((st) => st.text.trim())
            .filter(Boolean)
            .map((t, i) => `${i + 1}. ${t}`)
            .join('\n')
      const input = { title, notes: notesOut, ingredientLines, tags, imagePath }
      if (mode === 'edit' && recipe) {
        await updateRecipe(recipe.id, input)
      } else {
        await createRecipe(input)
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la receta'))
    } finally {
      setSaving(false)
    }
  }

  function updateIngredient(id: string, patch: Partial<IngredientRow>) {
    setIngRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addIngredientAfter(id: string | null) {
    setIngRows((rows) => {
      const at = id ? rows.findIndex((r) => r.id === id) + 1 : rows.length
      return [...rows.slice(0, at), newIngredientRow(), ...rows.slice(at)]
    })
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((rows) => {
      const target = index + direction
      if (target < 0 || target >= rows.length) return rows
      const next = [...rows]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <form onSubmit={handleSubmit} className="recipe-form">
      <div className="recipe-field">
        <input
          className="recipe-title-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Nombre de la receta (p. ej. Tortilla de patatas)"
          list="recipe-search-history"
          autoComplete="off"
          aria-label="Título"
        />
        <datalist id="recipe-search-history">
          {searchHistory.map((q) => (
            <option key={q} value={q} />
          ))}
        </datalist>
      </div>

      {mode === 'add' && (
        <div className="recipe-field">
          <span className="recipe-field-label">¿Cómo quieres empezar?</span>
          <div className="segmented" role="tablist">
            {(
              [
                ['manual', '✍️ Escribirla'],
                ['search', '🔍 Buscar'],
                ['url', '🔗 Enlace'],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={startMode === key} className={startMode === key ? 'segmented-active' : ''} onClick={() => setStartMode(key)}>
                {label}
              </button>
            ))}
          </div>

          {startMode === 'search' && (
            <div className="recipe-start-panel">
              <p className="muted">Busca por el nombre de arriba en Cookpad, FatSecret y Wikibooks y elige la que más se parezca.</p>
              <button type="button" onClick={handleSearch} disabled={!title.trim() || searchStatus === 'searching'}>
                {searchStatus === 'searching' ? 'Buscando en Internet…' : 'Buscar receta'}
              </button>
              {searchResults.length > 0 && (
                <div className="card" style={{ padding: 8 }}>
                  <p className="muted" style={{ margin: '4px 8px' }}>
                    Elige cuál es la tuya:
                  </p>
                  {searchResults.map((r) => {
                    const key = r.source === 'wikibooks' ? `wb-${r.title}` : `${r.source}-${r.id}`
                    const label = r.source === 'wikibooks' ? r.displayName : r.source === 'fatsecret' ? r.name : r.title
                    const sourceLabel =
                      r.source === 'cookpad'
                        ? 'Cookpad (español, con foto)'
                        : r.source === 'fatsecret'
                          ? 'FatSecret (en inglés, con foto)'
                          : 'Wikibooks (en español)'
                    return (
                      <button key={key} type="button" className="recipe-list-row" onClick={() => handleSelectCandidate(r)} disabled={searchStatus === 'searching'}>
                        {r.source !== 'wikibooks' && r.imageUrl && <img src={r.imageUrl} alt="" className="recipe-image" />}
                        <span>
                          {label}
                          <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                            {sourceLabel}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {searchStatus === 'not-found' && <p className="muted">No he encontrado "{title}" en Cookpad, Wikibooks ni FatSecret — puedes escribirla tú.</p>}
              {searchStatus === 'error' && <p className="error">No se pudo buscar ahora mismo, inténtalo de nuevo.</p>}
            </div>
          )}

          {startMode === 'url' && (
            <div className="recipe-start-panel">
              <p className="muted">Pega el enlace de una receta de otra web y la leo por ti.</p>
              <input type="url" value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} placeholder="https://..." aria-label="Enlace de la receta" />
              <button type="button" onClick={handleImportUrl} disabled={!recipeUrl.trim() || urlImportStatus === 'importing'}>
                {urlImportStatus === 'importing' ? 'Leyendo la página…' : 'Importar receta'}
              </button>
              {urlImportStatus === 'error' && <p className="error">{urlImportError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="recipe-field">
        <span className="recipe-field-label">Foto</span>
        {imagePath ? (
          <div className="recipe-photo">
            <RecipeImage imagePath={imagePath} alt="" />
            <div className="recipe-photo-actions">
              <label className="recipe-photo-btn">
                {imageBusy ? 'Subiendo…' : 'Cambiar'}
                <input type="file" accept="image/*" onChange={handleUploadImage} style={{ display: 'none' }} disabled={imageBusy} />
              </label>
              <button type="button" className="recipe-photo-btn" onClick={() => setImagePath(null)}>
                Quitar
              </button>
            </div>
          </div>
        ) : (
          <label className="recipe-photo-drop">
            <span aria-hidden="true" style={{ fontSize: 28 }}>
              📷
            </span>
            <strong>{imageBusy ? 'Subiendo…' : 'Añadir foto'}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              Sale en la cabecera de la receta
            </span>
            <input type="file" accept="image/*" onChange={handleUploadImage} style={{ display: 'none' }} disabled={imageBusy} />
          </label>
        )}
        <button type="button" className="link-button" style={{ fontSize: 13, alignSelf: 'flex-start' }} onClick={() => setShowImageUrl((v) => !v)}>
          🌐 Usar una foto de internet
        </button>
        {showImageUrl && (
          <div className="recipe-inline-row">
            <input type="url" value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} placeholder="Pega el enlace de la foto" aria-label="Enlace de la foto" />
            <button type="button" onClick={handleFetchImageUrl} disabled={!imageUrlInput.trim() || imageBusy}>
              {imageBusy ? '…' : 'Usar'}
            </button>
          </div>
        )}
        {imageError && <p className="error">{imageError}</p>}
      </div>

      <div className="recipe-field">
        <span className="recipe-field-label">Etiquetas</span>
        <div className="filter-row">
          {availableTags.map((tag) => (
            <button key={tag} type="button" className={'chip' + (tags.includes(tag) ? ' chip-active' : '')} onClick={() => toggleTag(tag)}>
              {tag}
            </button>
          ))}
          {tags
            .filter((t) => !availableTags.includes(t))
            .map((tag) => (
              <button key={tag} type="button" className="chip chip-active" onClick={() => toggleTag(tag)}>
                {tag} ✕
              </button>
            ))}
        </div>
        <div className="recipe-inline-row">
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddNewTag()
              }
            }}
            placeholder="Nueva etiqueta"
            aria-label="Nueva etiqueta"
          />
          <button type="button" onClick={handleAddNewTag} disabled={!newTag.trim()}>
            Añadir
          </button>
        </div>
      </div>

      <div className="recipe-field">
        <span className="recipe-field-label">Ingredientes</span>
        {ingRows.map((r) => (
          <div key={r.id} className="recipe-ing-row">
            <input
              className="recipe-ing-name"
              type="text"
              value={r.name}
              onChange={(e) => updateIngredient(r.id, { name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addIngredientAfter(r.id)
                }
              }}
              placeholder="Ingrediente"
              aria-label="Ingrediente"
            />
            <input className="recipe-ing-qty" type="text" inputMode="decimal" value={r.quantity} onChange={(e) => updateIngredient(r.id, { quantity: e.target.value })} placeholder="Cant." aria-label="Cantidad" />
            <input className="recipe-ing-unit" type="text" list="recipe-units" value={r.unit} onChange={(e) => updateIngredient(r.id, { unit: e.target.value })} placeholder="Unidad" aria-label="Unidad" />
            <button type="button" className="recipe-row-remove" aria-label="Quitar ingrediente" onClick={() => setIngRows((rows) => (rows.length > 1 ? rows.filter((x) => x.id !== r.id) : [newIngredientRow()]))}>
              ✕
            </button>
          </div>
        ))}
        <datalist id="recipe-units">
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        <button type="button" className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => addIngredientAfter(null)}>
          + Añadir ingrediente
        </button>
      </div>

      {legacyNotes ? (
        <div className="recipe-field">
          <span className="recipe-field-label">Preparación / notas</span>
          <textarea rows={6} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Preparación / notas" />
        </div>
      ) : (
        <div className="recipe-field">
          <span className="recipe-field-label">Preparación</span>
          {steps.map((st, i) => (
            <div key={st.id} className="recipe-step-row">
              <span className="recipe-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <textarea
                rows={2}
                value={st.text}
                onChange={(e) => setSteps((rows) => rows.map((x) => (x.id === st.id ? { ...x, text: e.target.value } : x)))}
                placeholder={i === 0 ? 'Describe el primer paso…' : 'Siguiente paso…'}
                aria-label={`Paso ${i + 1}`}
              />
              <div className="recipe-step-actions">
                <button type="button" className="recipe-row-remove" aria-label="Subir paso" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                  ↑
                </button>
                <button type="button" className="recipe-row-remove" aria-label="Bajar paso" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}>
                  ↓
                </button>
                <button type="button" className="recipe-row-remove" aria-label="Quitar paso" onClick={() => setSteps((rows) => (rows.length > 1 ? rows.filter((x) => x.id !== st.id) : [newStepRow()]))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="link-button" style={{ alignSelf: 'flex-start' }} onClick={() => setSteps((rows) => [...rows, newStepRow()])}>
            + Añadir paso
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="recipe-form-footer">
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
              {foundSource === 'url'
                ? 'Importada desde la URL indicada.'
                : foundSource === 'cookpad'
                  ? 'Encontrada buscando en Cookpad.'
                  : foundSource === 'fatsecret'
                    ? 'Encontrada en FatSecret — está en inglés, tradúcela al guardar si quieres.'
                    : 'Encontrada en el recetario abierto de Wikibooks.'}
            </p>

            {foundImagePath && <RecipeImage imagePath={foundImagePath} alt={found.title} />}

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
