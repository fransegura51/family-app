import { KitchenHeaderWithMenu } from '@/ui/KitchenHeaderWithMenu'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { showToast } from '@/state/toast'
import { ChangeEvent, FormEvent, Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { eventMenuPath } from '@/domain/eventMenuHub'
import { paletteByName, pastelPalette } from '@/domain/colors'
import { dedupeStepNumbers } from '@/domain/recipeSteps'
import { ingredientRowsFrom, newIngredientRow, newStepRow, stepRowsFrom, type IngredientRow, type StepRow } from '@/domain/recipeEditor'
import {
  ALIMENTACION_MENU_ITEM_META,
  alimentacionMenuEntryMeta,
  isCustomAlimentacionMenuKey,
  loadAlimentacionMenuLayout,
  loadAlimentacionPinnedItems,
  saveAlimentacionPinnedItems,
  type AlimentacionMenuEntry,
  type AlimentacionMenuGroup,
  type AlimentacionMenuItemKey,
} from '@/state/alimentacionMenu'
import {
  copyMenuEntries,
  createRecipe,
  deleteMenuEntry,
  deleteRecipe,
  getRecipePhotoUrl,
  listMenuEntries,
  listRecipes,
  listRecipeSearchHistory,
  logRecipeSearch,
  reorderMenuEntries,
  setMenuEntry,
  updateMenuEntry,
  updateRecipe,
  uploadRecipePhoto,
} from '@/data/food'
import { ConfirmIconButton } from '@/ui/ConfirmButton'
import { CocinarTab } from '@/ui/CocinarTab'
import { SectionBreadcrumb } from '@/ui/SectionBreadcrumb'
import { useSectionHome } from '@/ui/useSectionHome'
import { useCloseMenusOnHelp, useHelpDestinations } from '@/help/destinations'
import { HelpDestMark } from '@/help/ui/HelpDest'
import { emitHelpEvent } from '@/help/tours/helpBus'
import { fetchWikibooksRecipe, searchRecipeCandidates, type WikibooksSearchResult } from '@/services/recipeSearch'
import { getFatSecretRecipe, searchFatSecretRecipes, type FatSecretRecipeResult } from '@/services/fatsecretRecipes'
import { searchCookpadRecipes, type CookpadSearchResult } from '@/services/cookpadSearch'
import { parseWikibooksRecipe, type ParsedRecipe } from '@/domain/wikibooksRecipeParser'
import { isValidServings, servingsFromSource } from '@/domain/recipeServings'
import { ScaledIngredients } from '@/ui/ScaledIngredients'
import { servingsSourceNote } from '@/domain/servingsSourceNote'
import { recipeServingsView } from '@/domain/recipeServingsView'
import { fetchImageFromUrl, importRecipeFromUrl } from '@/services/recipeUrlImport'
import { listShoppingStores } from '@/data/shoppingStores'
import type { ShoppingStoreEntry } from '@/domain/types'
import type { MealType, MenuEntry, Recipe } from '@/domain/types'
import kitchenHeaderImg from '@/assets/alimentacion/kitchen-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { recipeText } from '@/domain/share'
import { fetchAsShareableFile, shareFiles, shareText } from '@/services/share'
import { PickIngredientsModal } from '@/ui/PickIngredientsModal'
import { KitchenMenuShoppingSheet } from '@/ui/KitchenMenuShoppingSheet'
import { hasShoppableEntry, type KitchenShoppingScope } from '@/domain/kitchenMenuShopping'
import { CartIcon, PencilIcon, TrashIcon } from '@/ui/MenuActionIcons'
import { DietaryWarnings } from '@/ui/DietaryWarnings'
// EL editor de campos de receta (raciones, etiquetas, ingredientes y pasos) es el MISMO que usa Comunidad: ver src/ui/recipeEditor/RecipeEditorFields.tsx.
import { RecipeEditorFields, RecipeTitleField } from '@/ui/recipeEditor/RecipeEditorFields'
// Comunidad: «Compartir en Comunidad» (hoja para publicar una copia pública, solo se descarga al pulsar) y el aviso «Hay una versión nueva» de las recetas
// que se guardaron desde Comunidad. No cambian nada de lo que ya hacía la Cocina.
import { RecipeUpdateBanner } from '@/ui/community/recipes/RecipeUpdateBanner'
import { ShareToCommunityButton } from '@/ui/community/recipes/ShareToCommunityButton'
import { useCommunityVisible } from '@/ui/community/useCommunityVisible'
import { usePrefChange } from '@/state/prefs/usePrefChange'
// «Importar menú de Comunidad» (Menú semanal): se descarga solo al pulsar el botón.
const CommunityMenuImportModal = lazy(() => import('@/ui/community/menu/CommunityMenuImportModal').then((m) => ({ default: m.CommunityMenuImportModal })))
const RecipePublishHost = lazy(() => import('@/ui/community/recipes/RecipePublishSheet').then((m) => ({ default: m.RecipePublishHost })))

const SUB_TABS = ['Inicio', 'Menú', 'Recetas', 'Cocinar'] as const
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

// `from` (opcional, «AAAA-MM-DD»): empezar en esa fecha en vez de hoy. Lo usa Comunidad tras importar un menú semanal («Ver mi menú»), para enseñar justo
// la semana importada. Una fecha inválida se ignora (se enseña desde hoy, como siempre).
function weekDates(from?: string | null): string[] {
  const parsed = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(from + 'T00:00') : null
  const today = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<SubTab>(() => initialTabFromParam(searchParams.get('tab')))
  // "La cocina de Pepa" del breadcrumb siempre vuelve a Inicio, incluso ya estando en /alimentacion.
  useSectionHome(() => setTab('Inicio'))
  // Petición real: "todas estas pestañas... quiero que hagamos como en
  // economía... el mismo formato que el menú de economía" — mismo
  // desplegable ☰ con sacar/meter/editar (ver economiaMenu.ts /
  // EconomiaMenuDropdown en FinanceScreen.tsx), aplicado aquí.
  const [menuOpen, setMenuOpen] = useState(false)
  useCloseMenusOnHelp(() => setMenuOpen(false))
  // «Llévame» de la Ayuda: cada vista interna de la cocina (no son rutas) se abre por su nombre.
  useHelpDestinations({
    'cocina.inicio': () => setTab('Inicio'),
    'cocina.menu': () => setTab('Menú'),
    'cocina.recetas': () => setTab('Recetas'),
    'cocina.cocinar': () => setTab('Cocinar'),
  })
  const [pinnedItems, setPinnedItems] = useState<AlimentacionMenuItemKey[]>(() => loadAlimentacionPinnedItems())
  const [menuLayout, setMenuLayout] = useState<AlimentacionMenuGroup[]>(() => loadAlimentacionMenuLayout())
  usePrefChange('familyapp:alimentacion-pinned-tabs', () => setPinnedItems(loadAlimentacionPinnedItems()))
  usePrefChange('familyapp:alimentacion-menu-layout', () => setMenuLayout(loadAlimentacionMenuLayout()))
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

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
      <KitchenHeaderWithMenu
        imgSrc={kitchenHeaderImg}
        alt="La cocina de Pepa"
        open={menuOpen}
        ariaLabel={menuOpen ? 'Cerrar menú de Alimentación' : 'Abrir menú de Alimentación'}
        helpId="cocina.menu-vistas"
        onToggle={() => {
            if (!menuOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
            setMenuOpen((v) => !v)
          }}
      />
      <SectionBreadcrumb subsection={ALIMENTACION_MENU_ITEM_META[tab].label} />
      {menuOpen && (
        <AlimentacionMenuDropdown
          activeTab={tab}
          layout={menuLayout}
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

      {tab === 'Inicio' && <HelpDestMark id="cocina.inicio" />}
      {tab === 'Menú' && <HelpDestMark id="cocina.menu" />}
      {tab === 'Recetas' && <HelpDestMark id="cocina.recetas" />}
      {tab === 'Cocinar' && <HelpDestMark id="cocina.cocinar" />}
      {tab === 'Inicio' && <AlimentacionInicioTab onNavigate={setTab} />}
      {tab === 'Menú' && <MenuTab
          onOpenRecipe={(id) => {
            // Desde la ficha emergente de un plato del menú: abre ESA receta en Recetas (con todas sus acciones y la edición).
            setSearchParams({ tab: 'Recetas', receta: id })
            setTab('Recetas')
          }}
        />}
      {tab === 'Recetas' && <RecipesTab />}
      {tab === 'Cocinar' && <CocinarTab onOpenRecipes={() => setTab('Recetas')} />}
    </div>
  )
}

function AlimentacionInicioTab({ onNavigate }: { onNavigate: (tab: SubTab) => void }) {
  // `helpMark`: marca para la Ayuda (visita guiada); no cambia nada visible.
  const shortcuts: { tab: SubTab; body: string; helpMark: { 'data-help-id': string } }[] = [
    { tab: 'Menú', body: 'Planifica desayuno, comida, merienda y cena de toda la semana.', helpMark: { 'data-help-id': 'cocina.inicio-menu' } },
    { tab: 'Recetas', body: 'Busca, importa y organiza las recetas de la familia, con foto y etiquetas.', helpMark: { 'data-help-id': 'cocina.inicio-recetas' } },
    { tab: 'Cocinar', body: 'Dile a Pepa qué ingredientes tienes y te propone qué cocinar, con su receta.', helpMark: { 'data-help-id': 'cocina.inicio-cocinar' } },
  ]
  // Un color pastel por tarjeta, igual que Compras Inicio.
  const cardColors = pastelPalette(shortcuts.length)
  return (
    <div className="event-list" data-help-id="cocina.inicio-tarjetas">
      {shortcuts.map((s, i) => {
        const meta = ALIMENTACION_MENU_ITEM_META[s.tab]
        return (
          <button
            key={s.tab}
            type="button"
            className="section-shortcut-card"
            style={{ background: cardColors[i] }}
            onClick={() => onNavigate(s.tab)}
            {...s.helpMark}
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
  pinnedItems,
  onTogglePin,
  onActivate,
  onClose,
}: {
  activeTab: SubTab
  layout: AlimentacionMenuGroup[]
  pinnedItems: AlimentacionMenuItemKey[]
  onTogglePin: (key: AlimentacionMenuItemKey) => void
  onActivate: (key: AlimentacionMenuItemKey) => void
  onClose: () => void
}) {
  function handleItemActivate(entry: AlimentacionMenuEntry) {
    onActivate(entry.key)
    onClose()
  }

  // Este menú solo deja «📌 Sacar» / «📍 Quitar» (poner el acceso como botón en la pantalla). Ya no hay modo «Editar» (24/10/2026): los «accesos personalizados» no abrían
  // ninguna pantalla y se retiraron; el orden y las categorías que cada persona ya tenía guardados se respetan tal cual.
  return (
    <div className="economia-menu-dropdown">
      {layout.map((group) => {
        const items = group.items.filter((entry) => !isCustomAlimentacionMenuKey(entry.key))
        if (items.length === 0) return null
        return (
          <div key={group.id} className="economia-menu-group">
            {group.name && (
              <div className="economia-menu-group-title">
                <span>{group.name}</span>
              </div>
            )}

            {items.map((entry) => {
              const meta = alimentacionMenuEntryMeta(entry)
              const isTab = isAlimentacionSubTab(entry.key)

              return (
                <div key={entry.key} className={'economia-menu-row' + (isTab && activeTab === entry.key ? ' active' : '')}>
                  <button type="button" className="economia-menu-item" onClick={() => handleItemActivate(entry)}>
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </button>

                  <button
                    type="button"
                    className="economia-menu-pin"
                    onClick={() => onTogglePin(entry.key)}
                    aria-label={pinnedItems.includes(entry.key) ? `Quitar ${meta.label} de la pantalla de Alimentación` : `Sacar ${meta.label} a la pantalla de Alimentación`}
                  >
                    {pinnedItems.includes(entry.key) ? '📍 Quitar' : '📌 Sacar'}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------
// Menú semanal (Skill 15)
// ---------------------------------------------------------------------

export function MenuTab({ onOpenRecipe }: { onOpenRecipe: (recipeId: string) => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const from = searchParams.get('desde')
  const dates = useMemo(() => weekDates(from), [from])
  // Semana anterior / siguiente (de 7 en 7 días desde el primer día que se está viendo) y «Volver a hoy» (24/10/2026: «el menú no tiene botones de semana anterior/siguiente»).
  function goWeek(offsetDays: number | null) {
    const next = new URLSearchParams(searchParams)
    if (offsetDays === null) next.delete('desde')
    else {
      const base = new Date(dates[0] + 'T00:00')
      base.setDate(base.getDate() + offsetDays)
      next.set('desde', toDateStr(base))
    }
    setSearchParams(next, { replace: true })
  }
  const shortDay = (d: string) => new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  const [entries, setEntries] = useState<MenuEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingFor, setAddingFor] = useState<{ date: string; meal: MealType } | null>(null)
  // Bug real: "en menú semanal no se puede editar una vez guardado,
  // solo borrar" — antes la única forma de cambiar un día era Quitar +
  // volver a Añadir desde cero.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Receta cuya ficha está abierta en la ventana emergente (al tocar el nombre de un plato del menú que tiene receta guardada).
  const [viewRecipeId, setViewRecipeId] = useState<string | null>(null)
  // «📥 Importar menú de Comunidad»: solo con Comunidad abierta para la persona (sin consultas si no lo está).
  const communityVisible = useCommunityVisible()
  const [importOpen, setImportOpen] = useState(false)
  // «🛒 Añadir a Compras»: de la semana entera, de un día o de un plato (receta). Solo con recetas enlazadas que tengan ingredientes.
  const [shopping, setShopping] = useState<{ scope: KitchenShoppingScope; title: string } | null>(null)
  // Copiar un día o la semana entera a otra fecha (nunca sustituye: añade detrás de lo que ya haya).
  const [copying, setCopying] = useState<{ scope: 'day'; date: string; target: string } | { scope: 'week' } | null>(null)
  const [copyBusy, setCopyBusy] = useState(false)
  // La semana que se está viendo, siempre la actual (los avisos de otros dispositivos y de Pepa recargan ESTA semana, no la de cuando se abrió la pantalla).
  const datesRef = useRef(dates)
  datesRef.current = dates

  // `silent`: recarga de fondo (avisos de otro dispositivo o de Pepa): sin «Cargando menú…», así no se pierde lo que se está editando.
  function reload(silent = false) {
    if (!silent) setLoading(true)
    const d = datesRef.current
    return Promise.all([listMenuEntries(d[0], d[6]), listRecipes()])
      .then(([e, r]) => {
        setEntries(e)
        setRecipes(r)
      })
      .catch((err: Error) => {
        if (!silent) setError(err.message)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void reload()
  }, [dates]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pepa (VoiceCapture) puede apuntar un plato desde cualquier pantalla de ESTE dispositivo.
  useEffect(() => {
    const onChanged = () => void reload(true)
    window.addEventListener('family-app:menu-changed', onChanged)
    return () => window.removeEventListener('family-app:menu-changed', onChanged)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cambios hechos en OTRO dispositivo de la familia (ordenador ↔ móvil): se recarga en silencio, salvo mientras se edita un plato, se añade uno o se copia.
  useRealtimeRefresh(['menu_entries', 'recipes', 'recipe_ingredients'], () => reload(true), { paused: editingId !== null || addingFor !== null || copying !== null || copyBusy })

  // Reordenar los platos de una comida: sube o baja uno sin tocar los demás (solo cambia el orden).
  function moveDish(slot: MenuEntry[], index: number, delta: -1 | 1) {
    const j = index + delta
    if (j < 0 || j >= slot.length) return
    const ids = slot.map((e) => e.id)
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    setEntries((prev) => {
      const pos = new Set(ids)
      const at = prev.map((e, i) => (pos.has(e.id) ? i : -1)).filter((i) => i >= 0)
      const reordered = ids.map((id) => prev.find((e) => e.id === id) as MenuEntry)
      const next = [...prev]
      at.forEach((pi, k) => {
        next[pi] = reordered[k]
      })
      return next
    })
    reorderMenuEntries(ids).catch(() => {
      setError('No se ha podido guardar el nuevo orden.')
      void reload(true)
    })
  }

  // Copia a otra fecha los platos de los días indicados (con su comida, receta o texto y su orden).
  async function copyDays(sources: string[], targetFor: (date: string) => string) {
    const copies = sources.flatMap((d) => entries.filter((e) => e.entryDate === d).map((e) => ({ entryDate: targetFor(d), mealType: e.mealType, recipeId: e.recipeId, freeText: e.freeText })))
    if (copies.length === 0) {
      setCopying(null)
      return
    }
    setCopyBusy(true)
    try {
      const n = await copyMenuEntries(copies)
      showToast(n === 1 ? 'Copiado 1 plato' : `Copiados ${n} platos`)
      setCopying(null)
      await reload(true)
    } catch {
      setError('No se han podido copiar los platos. No se ha cambiado nada.')
    } finally {
      setCopyBusy(false)
    }
  }
  const plusDays = (date: string, n: number) => {
    const d = new Date(date + 'T00:00')
    d.setDate(d.getDate() + n)
    return toDateStr(d)
  }

  if (loading) return <p className="muted">Cargando menú…</p>

  const viewedRecipe = viewRecipeId ? (recipes.find((r) => r.id === viewRecipeId) ?? null) : null

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="menu-week-nav" role="group" aria-label="Cambiar de semana" data-help-id="cocina.menu-semana-nav">
        <button type="button" onClick={() => goWeek(-7)} aria-label="Semana anterior">
          ‹ Anterior
        </button>
        <span className="menu-week-range" aria-live="polite">
          {shortDay(dates[0])} – {shortDay(dates[6])}
        </span>
        <button type="button" onClick={() => goWeek(7)} aria-label="Semana siguiente">
          Siguiente ›
        </button>
        {from && (
          <button type="button" className="link-button" onClick={() => goWeek(null)}>
            Volver a hoy
          </button>
        )}
      </div>
      {communityVisible === true && (
        <button type="button" className="primary menu-import-community-btn" style={{ width: '100%', minHeight: 44, margin: '0 0 12px' }} onClick={() => setImportOpen(true)} data-help-id="cocina.menu-importar">
          📥 Importar menú de Comunidad
        </button>
      )}
      {hasShoppableEntry(entries, recipes, { scope: 'week' }) && (
        <button
          type="button"
          className="menu-week-shop-btn"
          data-help-id="cocina.menu-semana-compras"
          onClick={() => setShopping({ scope: { scope: 'week' }, title: 'Todos los platos de toda la semana' })}
        >
          🛒 Añadir semana a Compras
        </button>
      )}
      {entries.length > 0 && (
        <div className="menu-copy-week">
          {copying?.scope === 'week' ? (
            <div className="menu-copy-panel" role="group" aria-label="Repetir la semana">
              <span>Se copian los {entries.length} platos de esta semana a la semana siguiente. Lo que ya haya allí se conserva.</span>
              <button type="button" className="primary" disabled={copyBusy} onClick={() => void copyDays(dates, (d) => plusDays(d, 7))}>
                {copyBusy ? 'Copiando…' : 'Copiar'}
              </button>
              <button type="button" className="link-button" onClick={() => setCopying(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" className="link-button" data-help-id="cocina.menu-copiar-semana" onClick={() => setCopying({ scope: 'week' })}>
              📋 Repetir esta semana en la siguiente
            </button>
          )}
        </div>
      )}
      {dates.map((date) => {
        const dayLabel = new Date(date + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
        return (
        <div key={date} className="card menu-day" style={{ background: weekdayColor(date) }} data-help-id="cocina.menu-dia">
          <div className="menu-day-head">
            <strong>{dayLabel}</strong>
            {entries.some((e) => e.entryDate === date) && (
              <button
                type="button"
                className="menu-icon-btn"
                title="Copiar los platos de este día a otro día"
                aria-label={`Copiar los platos de ${dayLabel} a otro día`}
                data-help-id="cocina.menu-copiar-dia"
                onClick={() => setCopying({ scope: 'day', date, target: plusDays(date, 1) })}
              >
                ⧉
              </button>
            )}
            {hasShoppableEntry(entries, recipes, { scope: 'day', date }) && (
              <button
                type="button"
                className="menu-icon-btn"
                title="Añadir a Compras los platos de este día"
                aria-label={`Añadir a Compras los platos de ${dayLabel}`}
                data-help-id="cocina.menu-dia-compras"
                onClick={() => setShopping({ scope: { scope: 'day', date }, title: `Los platos de ${dayLabel}` })}
              >
                🛒
              </button>
            )}
          </div>
          {copying?.scope === 'day' && copying.date === date && (
            <div className="menu-copy-panel" role="group" aria-label={`Copiar ${dayLabel} a otro día`}>
              <label>
                Copiar a
                <select value={copying.target} onChange={(e) => setCopying({ scope: 'day', date, target: e.target.value })}>
                  {[...dates, ...dates.map((d) => plusDays(d, 7))]
                    .filter((d) => d !== date)
                    .map((d) => (
                      <option key={d} value={d}>
                        {new Date(d + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
                      </option>
                    ))}
                </select>
              </label>
              <button type="button" className="primary" disabled={copyBusy} onClick={() => void copyDays([date], () => copying.target)}>
                {copyBusy ? 'Copiando…' : 'Copiar'}
              </button>
              <button type="button" className="link-button" onClick={() => setCopying(null)}>
                Cancelar
              </button>
            </div>
          )}
          {MEAL_TYPES.map((meal) => {
            const slotEntries = entries.filter((e) => e.entryDate === date && e.mealType === meal.value)
            const entry = slotEntries[0]
            // Platos de más en el mismo hueco (p. ej. el acompañamiento de un menú importado de Comunidad): se enseñan debajo del primero.
            const extraEntries = slotEntries.slice(1)
            const recipe = entry?.recipeId ? recipes.find((r) => r.id === entry.recipeId) : null
            const isAdding = addingFor?.date === date && addingFor.meal === meal.value
            // Carrito de un plato: con receta enlazada (sus ingredientes reales) o escrito a mano (un producto con ese texto). Solo se oculta si la receta no tiene ingredientes.
            const cart = (e: MenuEntry, title: string) =>
              hasShoppableEntry([e], recipes, { scope: 'entry', entryId: e.id }) ? (
                <button
                  type="button"
                  className="menu-icon-btn"
                  title={e.recipeId ? 'Añadir sus ingredientes a Compras' : 'Añadir a Compras'}
                  aria-label={e.recipeId ? `Añadir a Compras los ingredientes de ${title}` : `Añadir a Compras ${title}`}
                  onClick={() => setShopping({ scope: { scope: 'entry', entryId: e.id }, title: `«${title}»` })}
                >
                  <CartIcon />
                </button>
              ) : null
            // Un plato (principal o acompañamiento, con receta o escrito a mano): su nombre en una línea propia (ancho completo) y debajo, a la derecha, los iconos pequeños de
            // carrito, lápiz y papelera. Editar cambia solo la receta o el texto: la fecha, la comida y su lugar (principal o acompañamiento) se conservan.
            const dish = (e: MenuEntry, r: Recipe | null | undefined) => {
              const label = r?.title ?? e.freeText ?? 'este plato'
              if (editingId === e.id) {
                return (
                  <MenuEntryPicker
                    recipes={recipes}
                    initialRecipeId={e.recipeId}
                    initialFreeText={e.freeText}
                    onPick={async (pick) => {
                      await updateMenuEntry(e.id, pick)
                      setEditingId(null)
                      void reload(true)
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                )
              }
              return (
                <div className="menu-slot-dish">
                  <div className="menu-slot-name">
                    {r ? (
                      <button type="button" className="link-button menu-recipe-link" onClick={() => setViewRecipeId(r.id)} aria-label={`Ver la receta ${r.title}`}>
                        📖 {r.title}
                      </button>
                    ) : (
                      <span>{e.freeText}</span>
                    )}
                  </div>
                  <div className="menu-slot-actions" data-help-id="cocina.menu-acciones">
                    {slotEntries.length > 1 && (
                      <>
                        <button type="button" className="menu-icon-btn" title="Subir" aria-label={`Subir ${label}`} disabled={slotEntries[0].id === e.id} data-help-id="cocina.menu-subir" onClick={() => moveDish(slotEntries, slotEntries.findIndex((x) => x.id === e.id), -1)}>
                          ↑
                        </button>
                        <button type="button" className="menu-icon-btn" title="Bajar" aria-label={`Bajar ${label}`} disabled={slotEntries[slotEntries.length - 1].id === e.id} onClick={() => moveDish(slotEntries, slotEntries.findIndex((x) => x.id === e.id), 1)}>
                          ↓
                        </button>
                      </>
                    )}
                    {cart(e, label)}
                    <button type="button" className="menu-icon-btn" title="Editar" aria-label={`Editar ${label}`} onClick={() => setEditingId(e.id)}>
                      <PencilIcon />
                    </button>
                    <ConfirmIconButton icon={<TrashIcon />} className="menu-icon-btn" ariaLabel={`Quitar ${label} del menú`} onConfirm={() => deleteMenuEntry(e.id).then(() => reload(true))} />
                  </div>
                </div>
              )
            }
            return (
              <Fragment key={meal.value}>
                <div className="menu-slot">
                  <span className="muted menu-slot-meal">{meal.label}</span>
                  {entry ? (
                    dish(entry, recipe)
                  ) : isAdding ? (
                    <MenuEntryPicker
                      recipes={recipes}
                      onPick={async (pick) => {
                        await setMenuEntry({ entryDate: date, mealType: meal.value, ...pick })
                        emitHelpEvent('cocina.menu-entry-added')
                        setAddingFor(null)
                        void reload(true)
                      }}
                      onCancel={() => setAddingFor(null)}
                    />
                  ) : (
                    <div className="menu-slot-name">
                      <button type="button" className="link-button" data-help-id="cocina.menu-anadir" onClick={() => setAddingFor({ date, meal: meal.value })}>
                        + Añadir
                      </button>
                    </div>
                  )}
                  {extraEntries.length > 0 && (
                    <div className="menu-slot-extras" aria-label={`Más platos de ${meal.label}`}>
                      {extraEntries.map((extra) => {
                        const extraRecipe = extra.recipeId ? recipes.find((r) => r.id === extra.recipeId) : undefined
                        return (
                          <div key={extra.id} className="menu-slot-extra">
                            {dish(extra, extraRecipe)}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {entry &&
                    (isAdding ? (
                      <MenuEntryPicker
                        recipes={recipes}
                        onPick={async (pick) => {
                          await setMenuEntry({ entryDate: date, mealType: meal.value, ...pick })
                          emitHelpEvent('cocina.menu-entry-added')
                          setAddingFor(null)
                          void reload(true)
                        }}
                        onCancel={() => setAddingFor(null)}
                      />
                    ) : (
                      <div className="menu-slot-name menu-slot-add-more">
                        <button type="button" className="link-button" data-help-id="cocina.menu-anadir-otro" onClick={() => setAddingFor({ date, meal: meal.value })}>
                          + Añadir otro plato
                        </button>
                      </div>
                    ))}
                </div>
              </Fragment>
            )
          })}
        </div>
        )
      })}
      {shopping && (
        <KitchenMenuShoppingSheet entries={entries} recipes={recipes} scope={shopping.scope} title={shopping.title} onClose={() => setShopping(null)} />
      )}
      {viewedRecipe && (
        <RecipeQuickViewModal
          recipe={viewedRecipe}
          onClose={() => setViewRecipeId(null)}
          onOpenFull={() => {
            setViewRecipeId(null)
            onOpenRecipe(viewedRecipe.id)
          }}
        />
      )}
      {importOpen && (
        <Suspense fallback={null}>
          <CommunityMenuImportModal
            onClose={(imported) => {
              setImportOpen(false)
              if (imported) void reload(true)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

// Ventana emergente con la ficha de una receta (mismo patrón que las demás ventanas de Cocina: se abre sobre la pantalla, se cierra con ✕ o tocando fuera): foto,
// etiquetas, raciones, ingredientes con cantidades y preparación. Para editarla o usar todas sus acciones, «Abrir la receta completa» lleva a Recetas.
function RecipeQuickViewModal({ recipe, onClose, onOpenFull }: { recipe: Recipe; onClose: () => void; onOpenFull: () => void }) {
  const tagColors = paletteByName(recipe.tags)
  const servingsView = recipeServingsView(recipe.servings, recipe.servingsSource)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label={`Receta: ${recipe.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {recipe.title}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <RecipeImage imagePath={recipe.imagePath} alt={recipe.title} />
        {recipe.tags.length > 0 && (
          <div className="filter-row" style={{ margin: '8px 0 0' }}>
            {recipe.tags.map((t) => (
              <span key={t} className="chip" style={{ background: tagColors.get(t) }}>
                {t}
              </span>
            ))}
          </div>
        )}
        {servingsView ? (
          <p style={{ margin: '8px 0 0', fontSize: 14 }}>👥 Raciones: {servingsView.value}</p>
        ) : recipe.ingredients.some((i) => i.quantity) ? (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
            👥 Raciones: sin indicar.
          </p>
        ) : null}
        <DietaryWarnings ingredients={recipe.ingredients} />
        {recipe.ingredients.length > 0 && <ScaledIngredients key={recipe.id} servings={recipe.servings} ingredients={recipe.ingredients} />}
        {recipe.notes && (
          <div className="day-modal-group">
            <h3>Preparación / notas</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{dedupeStepNumbers(recipe.notes)}</p>
          </div>
        )}
        <button type="button" className="primary" style={{ width: '100%', minHeight: 44, marginTop: 10 }} onClick={onOpenFull}>
          📖 Abrir la receta completa (y editarla)
        </button>
      </div>
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
  const pickedRecipe = recipeId ? recipes.find((r) => r.id === recipeId) : null

  return (
    <span className="menu-picker" data-help-id="cocina.menu-selector">
      <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} data-help-id="cocina.menu-receta">
        <option value="">— receta —</option>
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
      {/* Mismo aviso al elegir la receta para el menú (solo informa: «OK» sigue funcionando igual). */}
      {pickedRecipe && <DietaryWarnings ingredients={pickedRecipe.ingredients} className="fd-warnings-picker" />}
      <input
        type="text"
        placeholder="o texto libre"
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        data-help-id="cocina.menu-texto"
      />
      <button
        type="button"
        className="link-button"
        data-help-id="cocina.menu-ok"
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

const FAVORITES_TAG = 'Favoritos'
const DEFAULT_RECIPE_TAGS = ['Postres', FAVORITES_TAG, 'Fáciles de preparar', 'Vegetariano', 'Rápidas']

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
  // Filtros compactos (en vez de una nube permanente de etiquetas): «⭐ Favoritos» siempre a mano y el resto —etiquetas propias e ingrediente— dentro de «Filtros».
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [ingredientFilter, setIngredientFilter] = useState('')
  const [recipeSearch, setRecipeSearch] = useState('')
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [adding, setAdding] = useState(false)
  // Receta que se está compartiendo en Comunidad (hoja de publicar con vista previa y consentimiento).
  const [sharing, setSharing] = useState<Recipe | null>(null)
  // Llegada desde «Menú del evento» (recipeLinkPath): abre ESA receta una sola vez y recuerda de qué evento viene.
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedRecipeId = searchParams.get('receta')
  const returnEventId = searchParams.get('volver')
  const navigate = useNavigate()
  // Solo mientras el visor abierto viene de «Menú del evento»: así «Volver» aparece dentro de ESA receta y no en una abierta normal.
  const [viewerReturnEventId, setViewerReturnEventId] = useState<string | null>(null)
  function closeViewer() {
    setViewingId(null)
    setViewerReturnEventId(null)
  }

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

  function reload(silent = false) {
    if (!silent) setLoading(true)
    return Promise.all([listRecipes(), listShoppingStores()])
      .then(([r, s]) => {
        setRecipes(r)
        setStores(s)
      })
      .catch((e: Error) => {
        if (!silent) setError(e.message)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cambios de recetas hechos en otro dispositivo; no se recarga mientras se ve, edita, comparte o añade una receta.
  useRealtimeRefresh(['recipes', 'recipe_ingredients'], () => reload(true), { paused: editing !== null || adding || viewingId !== null || sharing !== null || pickingFor !== null })

  // Se abre una sola vez: al abrirla se quita ?receta de la URL, así recargar la lista no la vuelve a abrir.
  useEffect(() => {
    if (!requestedRecipeId || loading) return
    if (recipes.some((r) => r.id === requestedRecipeId)) {
      setViewingId(requestedRecipeId)
      setViewerReturnEventId(returnEventId)
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('receta')
      return next
    }, { replace: true })
  }, [requestedRecipeId, loading, recipes, setSearchParams, returnEventId])

  // Pepa (VoiceCapture) puede guardar una receta desde cualquier pantalla.
  useEffect(() => {
    const onChanged = () => void reload(true)
    window.addEventListener('family-app:recipes-changed', onChanged)
    return () => window.removeEventListener('family-app:recipes-changed', onChanged)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="muted">Cargando recetas…</p>

  const availableTags = collectRecipeTags(recipes)
  // Las etiquetas de receta son texto libre por familia (sin color
  // guardado) — mismo criterio determinista que clases de producto y
  // tiendas en Compras (paletteByName): mismo nombre, siempre el mismo
  // color, en los chips de filtro y en la fila de cada receta.
  const tagColors = paletteByName(availableTags)
  // El ingrediente se busca en los ingredientes de cada receta (NO son etiquetas): «huevo» encuentra «2 huevos».
  const normalizedIngredientFilter = normalizeRecipeSearch(ingredientFilter)
  const activeFilterCount = (tagFilter !== 'Todas' ? 1 : 0) + (normalizedIngredientFilter ? 1 : 0)
  const filteredRecipes = recipes
    .filter((r) => tagFilter === 'Todas' || r.tags.includes(tagFilter))
    .filter((r) => !favoritesOnly || r.tags.includes(FAVORITES_TAG))
    .filter((r) => !normalizedIngredientFilter || r.ingredients.some((i) => normalizeRecipeSearch(i.name).includes(normalizedIngredientFilter)))
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
      {returnEventId && (
        <p style={{ margin: '0 0 8px' }}>
          <Link to={eventMenuPath(returnEventId)}>← Volver al menú del evento</Link>
        </p>
      )}

      <label>
        🔍 Buscar receta guardada
        <input
          type="search"
          value={recipeSearch}
          data-help-id="cocina.recetas-buscar"
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

      <div className="filter-row recipe-quick-filters">
        <button type="button" className={'chip' + (favoritesOnly ? ' chip-active' : '')} aria-pressed={favoritesOnly} data-help-id="cocina.recetas-favoritos" onClick={() => setFavoritesOnly((v) => !v)}>
          ⭐ Favoritos
        </button>
        <button
          type="button"
          className={'chip' + (filtersOpen || activeFilterCount > 0 ? ' chip-active' : '')}
          aria-expanded={filtersOpen}
          aria-controls="recipe-filters-panel"
          data-help-id="cocina.recetas-filtros"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          🎚️ Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
        {(activeFilterCount > 0 || favoritesOnly) && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setTagFilter('Todas')
              setIngredientFilter('')
              setFavoritesOnly(false)
            }}
          >
            Quitar filtros
          </button>
        )}
      </div>
      {filtersOpen && (
        <div id="recipe-filters-panel" className="card recipe-filters-panel">
          <label>
            Con el ingrediente
            <input type="search" value={ingredientFilter} onChange={(e) => setIngredientFilter(e.target.value)} placeholder="Por ejemplo: huevos, arroz…" />
          </label>
          <p className="muted" style={{ margin: '8px 0 4px', fontSize: 13 }}>
            Etiquetas (las que pones tú):
          </p>
          <div className="filter-row" style={{ margin: 0 }}>
            <button type="button" className={'chip' + (tagFilter === 'Todas' ? ' chip-active' : '')} onClick={() => setTagFilter('Todas')}>
              Todas
            </button>
            {availableTags.map((tag) => (
              <button key={tag} type="button" className={'chip' + (tagFilter === tag ? ' chip-active' : '')} style={{ background: tagColors.get(tag) }} onClick={() => setTagFilter(tag)}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="event-list" data-help-id="cocina.recetas-lista">
        {filteredRecipes.map((r) => (
          <button
            key={r.id}
            type="button"
            className="recipe-list-row"
            data-help-id="cocina.receta-fila"
            style={{ background: r.tags[0] ? tagColors.get(r.tags[0]) : undefined }}
            onClick={() => setViewingId(r.id)}
          >
            <RecipeImage imagePath={r.imagePath} alt="" />
            <span>{r.title}</span>
          </button>
        ))}
        {filteredRecipes.length === 0 && (
          <p className="muted">{recipes.length === 0 ? 'Todavía no hay recetas.' : 'Ninguna receta con esos filtros.'}</p>
        )}
      </div>

      <button type="button" className="screen-fab" data-help-id="cocina.receta-nueva" onClick={() => setAdding(true)}>
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
        <div className="modal-overlay" onClick={() => closeViewer()}>
          <div className="modal-sheet" data-help-id="cocina.receta-ficha" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {viewing.title}
              </h2>
              <button type="button" className="modal-close" onClick={() => closeViewer()} aria-label="Cerrar">
                ✕
              </button>
            </div>
            {viewerReturnEventId && (
              <button
                type="button"
                className="link-button"
                style={{ alignSelf: 'flex-start', margin: '6px 0' }}
                onClick={() => {
                  closeViewer()
                  navigate(eventMenuPath(viewerReturnEventId))
                }}
              >
                ← Volver al menú del evento
              </button>
            )}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 'none', marginLeft: 'auto' }} data-help-id="cocina.receta-acciones">
                <button
                  type="button"
                  className="link-button"
                  style={{ fontSize: 20 }}
                  data-help-id="cocina.receta-compras"
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
                      closeViewer()
                      reload()
                    })
                  }
                />
              </div>
            </div>
            {/* Comunidad: si la receta se guardó desde Comunidad y hay versión nueva, aviso con comparación (nunca cambia nada solo). */}
            <RecipeUpdateBanner
              recipe={viewing}
              onUpdated={() => {
                closeViewer()
                reload()
              }}
            />
            {/* Solo sale si Comunidad está abierta para esta persona (sin consultas extra: ver ShareToCommunityButton). */}
            <ShareToCommunityButton onShare={() => setSharing(viewing)} />
            {/* Raciones de la receta (dato estructurado). Si no hay, no se pinta nada: ni fila vacía ni «desconocidas». */}
            {(() => {
              const view = recipeServingsView(viewing.servings, viewing.servingsSource)
              return view ? (
                <p style={{ margin: '8px 0 0', fontSize: 14 }}>
                  👥 Raciones: {view.value}
                  {view.source && (
                    <span className="muted" style={{ display: 'block', fontSize: 13 }}>
                      Fuente original: {view.source}
                    </span>
                  )}
                </p>
              ) : viewing.ingredients.some((i) => i.quantity) ? (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                  👥 Raciones: sin indicar. Las cantidades no se escalan hasta que digas para cuántas personas es.{' '}
                  <button type="button" className="link-button" onClick={() => setEditing(viewing)}>
                    Indicar raciones
                  </button>
                </p>
              ) : null
            })()}
            {/* Aviso de alergias e intolerancias (solo lo ven administradores y adultos con datos anotados; no bloquea ni cambia la receta). */}
            <DietaryWarnings ingredients={viewing.ingredients} />
            {viewing.ingredients.length > 0 && <ScaledIngredients key={viewing.id} servings={viewing.servings} ingredients={viewing.ingredients} />}
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
                closeViewer()
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

      {sharing && (
        <Suspense fallback={null}>
          <RecipePublishHost recipe={sharing} onClose={() => setSharing(null)} />
        </Suspense>
      )}
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
// (Las filas, sus ayudantes y las reglas de etiquetas/raciones están en src/domain/recipeEditor.ts, compartidas con Comunidad.)

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
  // Raciones para las que está escrita la receta. Vacío = desconocidas (se guarda null, nunca 0).
  const [servingsText, setServingsText] = useState(recipe?.servings ? String(recipe.servings) : '')
  // Texto ORIGINAL de la fuente («6-7 personas»). Solo informa: nunca recalcula Raciones ni se modifica al corregir a mano.
  const [servingsSource, setServingsSource] = useState<string | null>(recipe?.servingsSource ?? null)
  const sourceValue = servingsSource ? (servingsFromSource(servingsSource)?.servings ?? null) : null
  const servingsNow = servingsText.trim() === '' ? null : Number(servingsText.trim().replace(',', '.'))
  const [steps, setSteps] = useState<StepRow[]>(() =>
    stepRowsFrom(
      recipe?.notes && !legacyNotes
        ? recipe.notes
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => dedupeStepNumbers(l.trim()).replace(/^\d+\.\s*/, ''))
        : [],
    ),
  )
  const [ingRows, setIngRows] = useState<IngredientRow[]>(() => ingredientRowsFrom(recipe?.ingredients ?? []))
  const [startMode, setStartMode] = useState<'manual' | 'search' | 'url'>('manual')
  const [showImageUrl, setShowImageUrl] = useState(false)
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? [])
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
        servings: result.servings,
        servingsSource: result.servingsSource,
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
          servings: result.servings,
          servingsSource: result.servingsSource,
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
        setFound({ title: detail.name, ingredients: detail.ingredients, steps: detail.directions, servings: null, servingsSource: null })
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
    // Raciones de la fuente: solo se rellenan si la fuente las indica sin ambigüedad; se pueden corregir en el
    // formulario antes de guardar. Si la fuente no las trae, se conserva lo que ya hubiera escrito.
    if (found.servings !== null) {
      setServingsText(String(found.servings))
      setServingsSource(found.servingsSource ?? null)
    }
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
      const servingsValue = servingsNow
      if (servingsValue !== null && !isValidServings(servingsValue)) {
        setError('Las raciones deben ser un número entre 1 y 50, entero o con medio punto (6,5), o déjalo vacío.')
        setSaving(false)
        return
      }
      // El texto de la fuente solo acompaña a unas raciones y se guarda tal cual lo dijo la fuente.
      const input = { title, notes: notesOut, ingredientLines, tags, imagePath, servings: servingsValue, servingsSource }
      if (mode === 'edit' && recipe) {
        await updateRecipe(recipe.id, input)
      } else {
        await createRecipe(input)
        emitHelpEvent('cocina.recipe-created')
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar la receta'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="recipe-form">
      <RecipeTitleField value={title} onChange={setTitle} required placeholder="Nombre de la receta (p. ej. Tortilla de patatas)" suggestions={searchHistory} ariaLabel="Título" helpId="cocina.receta-titulo" />

      {mode === 'add' && (
        <div className="recipe-field">
          <span className="recipe-field-label">¿Cómo quieres empezar?</span>
          <div className="segmented" role="tablist" data-help-id="cocina.receta-modo">
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
              <button type="button" onClick={handleSearch} disabled={!title.trim() || searchStatus === 'searching'} data-help-id="cocina.receta-buscar-boton">
                {searchStatus === 'searching' ? 'Buscando en Internet…' : 'Buscar receta'}
              </button>
              {searchResults.length > 0 && (
                <div className="card" style={{ padding: 8 }} data-help-id="cocina.receta-candidatas">
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
              <input type="url" value={recipeUrl} onChange={(e) => setRecipeUrl(e.target.value)} placeholder="https://..." aria-label="Enlace de la receta" data-help-id="cocina.receta-enlace" />
              <button type="button" onClick={handleImportUrl} disabled={!recipeUrl.trim() || urlImportStatus === 'importing'} data-help-id="cocina.receta-enlace-importar">
                {urlImportStatus === 'importing' ? 'Leyendo la página…' : 'Importar receta'}
              </button>
              {urlImportStatus === 'error' && <p className="error">{urlImportError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="recipe-field" data-help-id="cocina.receta-foto">
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

      <RecipeEditorFields
        servingsText={servingsText}
        onServingsTextChange={setServingsText}
        servingsNote={
          servingsSource && sourceValue !== null ? (
            // Usa siempre el valor ACTUAL del campo (servingsNow), no el punto medio original.
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              {servingsSourceNote(servingsSource, sourceValue, Number.isFinite(servingsNow) ? servingsNow : null)}
            </p>
          ) : null
        }
        tags={tags}
        onTagsChange={setTags}
        tagOptions={availableTags}
        ingredients={ingRows}
        onIngredientsChange={setIngRows}
        steps={steps}
        onStepsChange={setSteps}
        legacyNotes={legacyNotes ? { value: notes, onChange: setNotes } : undefined}
        marks={{
          servings: { 'data-help-id': 'cocina.receta-raciones' },
          tags: { 'data-help-id': 'cocina.receta-etiquetas' },
          ingredients: { 'data-help-id': 'cocina.receta-ingredientes' },
          steps: { 'data-help-id': 'cocina.receta-pasos' },
        }}
      />

      {error && <p className="error">{error}</p>}
      <div className="recipe-form-footer">
        <button type="submit" disabled={saving} {...(mode === 'add' ? { 'data-help-id': 'cocina.receta-guardar' } : {})}>
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

            <button type="button" onClick={useFoundRecipe} data-help-id="cocina.receta-usar">
              Usar esta receta
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
