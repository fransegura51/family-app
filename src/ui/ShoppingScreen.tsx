import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  COMPRAS_MENU_ITEM_META,
  comprasMenuEntryMeta,
  isCustomComprasMenuKey,
  loadComprasMenuLayout,
  loadComprasPinnedItems,
  saveComprasMenuLayout,
  saveComprasPinnedItems,
  type ComprasMenuEntry,
  type ComprasMenuGroup,
  type ComprasMenuItemKey,
} from '@/state/comprasMenu'
import {
  addShoppingItem,
  deleteShoppingItem,
  deleteShoppingItems,
  listShoppingItems,
  reorderShoppingItems,
  updateShoppingItem,
  updateShoppingItemStatus,
} from '@/data/shopping'
import { listAllProductPrices, listProducts, setProductNonFood } from '@/data/products'
import {
  listFamilyFoodTypes,
  seedFamilyFoodTypes,
  setProductFoodType,
  type FamilyFoodType,
  type FoodTypeKind,
} from '@/data/foodTypes'
import { classifyFoodType, FOOD_TYPES, NO_FOOD_TYPES } from '@/domain/foodTypes'
import { paletteByName, pastelPalette } from '@/domain/colors'
import {
  createShoppingStore,
  deleteShoppingStore,
  listShoppingStores,
  renameShoppingStore,
  reorderShoppingStores,
} from '@/data/shoppingStores'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { listReceipts } from '@/data/receipts'
import { listBudgetCategories } from '@/data/finance'
import { buildFoodReceiptIds, computeProductStats, isFoodPurchase, isLikelyAlcohol } from '@/domain/products'
import { normalize } from '@/domain/voiceQuery'
import { StoreIcon } from '@/ui/StoreIcon'
import { averagePricesByMonth, basketTotal, compareMonths } from '@/domain/priceTrends'
import { BudgetsTab, ReceiptsTab, type MovementsFilter } from '@/ui/FinanceScreen'
import { ProductTypesModal } from '@/ui/ProductTypesModal'
import { setPendingMovementsFilter } from '@/state/pendingMovementsFilter'
import type {
  Product,
  ProductPrice,
  ShoppingItem,
  ShoppingItemPriority,
  ShoppingItemStatus,
  ShoppingStoreEntry,
} from '@/domain/types'
import comprasHeaderImg from '@/assets/compras/compras-header.jpg'
import { errorMessage } from '@/domain/errorMessage'
import { shoppingListText } from '@/domain/share'
import { shareText } from '@/services/share'

// Petición real: "vamos a organizarla por clases de alimentos..." con
// colores — la clase de un producto (Fruta, Lácteos, Limpieza…) no
// tiene un color guardado en la base de datos, así que se deriva del
// mismo catálogo fijo FOOD_TYPES/NO_FOOD_TYPES (igual en Lista,
// Historial, Tickets y Estadísticas) en vez de solo lo que haya en la
// lista en ese momento — así el mismo nombre de clase da SIEMPRE el
// mismo color aunque cambie lo que se está comprando hoy.
const ALL_CLASS_LABELS = [...FOOD_TYPES.map((t) => t.label), ...NO_FOOD_TYPES.map((t) => t.label), 'Sin clasificar']
export const CLASS_COLORS = paletteByName(ALL_CLASS_LABELS)

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeProductName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// Memoria de compras (Skill 09) aplicada a la propia lista: nombre
// habitual (con marca), cantidad/unidad y último precio pagado, para no
// tener que escribirlo todo de cero cada vez.
interface ProductSuggestion {
  displayName: string
  normalizedName: string
  quantity: string | null
  unit: string | null
  lastPrice: number | null
}

function buildSuggestions(
  products: Product[],
  prices: ProductPrice[],
  foodReceiptIds: Set<string>,
): ProductSuggestion[] {
  const nonFoodProductIds = new Set(products.filter((p) => p.nonFood).map((p) => p.id))
  return products.map((p) => {
    // Un pedido de Amazon que no sea de alimentación no cuenta como "lo
    // sueles comprar" de la lista de la compra — mismo criterio que
    // Historial (uno que sí sea de alimentación, como un café, sí cuenta).
    const ownPrices = prices.filter((pr) => pr.productId === p.id && isFoodPurchase(pr, foodReceiptIds, nonFoodProductIds))
    const stats = computeProductStats(ownPrices)
    const last = [...ownPrices].sort((a, b) => b.recordedDate.localeCompare(a.recordedDate))[0]
    return {
      displayName: p.displayName,
      normalizedName: p.normalizedName,
      quantity: last?.quantity ?? null,
      unit: last?.unit ?? null,
      lastPrice: stats?.lastPrice ?? null,
    }
  })
}

// Memoria e Historial se fusionaron en una sola pestaña "Historial"
// (petición real: "combinar Memoria y Historial para dejarlo en una
// sola sección que se llame Historial"). Tickets y Registro
// Alimentación se mudan aquí desde Economía (petición real: "pasar
// registro alimentación y tickets a compra" — tienen más que ver con
// qué se ha comprado que con el dinero en sí). Sus componentes siguen
// definidos en FinanceScreen.tsx y se importan desde ahí, en vez de
// duplicar todo el código de tickets/categorías en dos archivos.
const SUB_TABS = ['Inicio', 'Lista', 'Historial', 'Tickets', 'Estadística compras'] as const
type SubTab = (typeof SUB_TABS)[number]

function isComprasSubTab(key: ComprasMenuItemKey): key is SubTab {
  return (SUB_TABS as readonly string[]).includes(key)
}

export function ShoppingScreen() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<SubTab>('Inicio')
  // Petición real: "todas estas pestañas... quiero que hagamos como en
  // economía... el mismo formato que el menú de economía" — mismo
  // desplegable ☰ con sacar/meter/editar (ver economiaMenu.ts /
  // EconomiaMenuDropdown en FinanceScreen.tsx), aplicado aquí.
  const [menuOpen, setMenuOpen] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<ComprasMenuItemKey[]>(() => loadComprasPinnedItems())
  const [menuLayout, setMenuLayout] = useState<ComprasMenuGroup[]>(() => loadComprasMenuLayout())
  const [placeholderNotice, setPlaceholderNotice] = useState(false)

  function persistMenuLayout(next: ComprasMenuGroup[]) {
    setMenuLayout(next)
    saveComprasMenuLayout(next)
  }

  function togglePinnedItem(key: ComprasMenuItemKey) {
    setPinnedItems((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      saveComprasPinnedItems(next)
      return next
    })
  }

  function handleAction(key: ComprasMenuItemKey) {
    if (isComprasSubTab(key)) setTab(key)
    // Un acceso personalizado no lleva a ningún sitio todavía.
  }

  // "Ver movimientos →" desde Estadística compras — Compras y Economía
  // son rutas distintas, así que el filtro viaja por pendingMovementsFilter
  // (ver ese archivo) en vez de por props.
  function handleViewMovements(filter: MovementsFilter) {
    setPendingMovementsFilter(filter)
    navigate('/dinero')
  }

  const flatMenuEntries = menuLayout.flatMap((g) => g.items)

  return (
    <div className="screen">
      {/* Petición real, con imagen de referencia: "cabecera para la
          sección de compras, hacer lo mismo que con las anteriores"
          (mismo tratamiento que "La cocina de Pepa" y Calendario). */}
      <div className="kitchen-header">
        <img src={comprasHeaderImg} alt="Compras" className="kitchen-header-img" />
        <button
          type="button"
          className="kitchen-header-menu-fab kitchen-header-menu-fab-floating"
          onClick={() => {
            if (!menuOpen) window.scrollTo({ top: 0, behavior: 'smooth' })
            setMenuOpen((v) => !v)
          }}
          aria-label={menuOpen ? 'Cerrar menú de Compras' : 'Abrir menú de Compras'}
        >
          {menuOpen ? '✕' : '☰'} Menú
        </button>
      </div>
      {menuOpen && (
        <ComprasMenuDropdown
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
              const meta = comprasMenuEntryMeta(entry)
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={'chip' + (isComprasSubTab(entry.key) && tab === entry.key ? ' chip-active' : '')}
                  onClick={() => {
                    if (isCustomComprasMenuKey(entry.key)) {
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

      {tab === 'Inicio' && <ComprasInicioTab onNavigate={setTab} />}
      {tab === 'Lista' && <ShoppingListTab />}
      {tab === 'Historial' && <HistoryTab />}
      {tab === 'Tickets' && <ReceiptsTab />}
      {tab === 'Estadística compras' && (
        <BudgetsTab group="alimentacion" seedCategories={[]} onViewMovements={handleViewMovements} />
      )}
    </div>
  )
}

function ComprasInicioTab({ onNavigate }: { onNavigate: (tab: SubTab) => void }) {
  const shortcuts: { tab: SubTab; body: string }[] = [
    { tab: 'Lista', body: 'La lista de la compra, agrupada por tienda y clase de producto.' },
    { tab: 'Historial', body: 'Precios de lo que sueles comprar — Alimentos y Otros (ropa, electrónica...), con buscador.' },
    { tab: 'Tickets', body: 'Sube la foto del ticket y consulta el gasto por tienda.' },
    { tab: 'Estadística compras', body: 'Cuánto se lleva registrado en Alimentación y en Otros, y en qué.' },
  ]
  // Petición real: extender el pastel también a estas tarjetas de
  // acceso rápido, igual que Inicio/Eventos — un color por tarjeta.
  const cardColors = pastelPalette(shortcuts.length)
  return (
    <div className="event-list">
      {shortcuts.map((s, i) => {
        const meta = COMPRAS_MENU_ITEM_META[s.tab]
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

// Copia de EconomiaMenuDropdown/AlimentacionMenuDropdown adaptada a las
// claves de Compras — mismas clases CSS .economia-menu-* (genéricas).
function ComprasMenuDropdown({
  activeTab,
  layout,
  onLayoutChange,
  pinnedItems,
  onTogglePin,
  onActivate,
  onClose,
}: {
  activeTab: SubTab
  layout: ComprasMenuGroup[]
  onLayoutChange: (next: ComprasMenuGroup[]) => void
  pinnedItems: ComprasMenuItemKey[]
  onTogglePin: (key: ComprasMenuItemKey) => void
  onActivate: (key: ComprasMenuItemKey) => void
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

  function moveItemToGroup(itemKey: ComprasMenuItemKey, fromGroupId: string, toGroupId: string) {
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
    const entry: ComprasMenuEntry = { key: `custom:${crypto.randomUUID()}`, icon: newItemIcon, label: newItemLabel.trim() }
    onLayoutChange(layout.map((g, i) => (i === 0 ? { ...g, items: [...g.items, entry] } : g)))
    setNewItemIcon('📌')
    setNewItemLabel('')
    setAddingCustomItem(false)
  }

  function handleSaveItem(groupId: string, key: ComprasMenuItemKey) {
    onLayoutChange(
      layout.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((it) => (it.key === key ? { ...it, icon: editItemIcon, label: editItemLabel.trim() || it.label } : it)) }
          : g,
      ),
    )
    setEditingItemKey(null)
  }

  function deleteItem(groupId: string, key: ComprasMenuItemKey) {
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((it) => it.key !== key) } : g)))
  }

  function handleItemActivate(entry: ComprasMenuEntry) {
    if (isCustomComprasMenuKey(entry.key)) {
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
            const meta = comprasMenuEntryMeta(entry)
            const isTab = isComprasSubTab(entry.key)
            const isCustom = isCustomComprasMenuKey(entry.key)

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
                    aria-label={pinnedItems.includes(entry.key) ? `Quitar ${meta.label} de la pantalla de Compras` : `Sacar ${meta.label} a la pantalla de Compras`}
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
// Lista (Skill 06/07)
// ---------------------------------------------------------------------

const PRIORITIES: { value: ShoppingItemPriority; label: string }[] = [
  { value: 'alta', label: 'Alta' },
  { value: 'normal', label: 'Normal' },
  { value: 'baja', label: 'Baja' },
]

function ShoppingListTab() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [stores, setStores] = useState<ShoppingStoreEntry[]>([])
  // Petición real: "vamos a organizarla por clases de alimentos...
  // conforme se apunten que la app vaya organizándolas por clases
  // conforme a las clases que ya tenemos" — mismo catálogo de
  // clasificación que Tickets/Historial de precios, para agrupar cada
  // tienda por pasillo en vez de una lista suelta.
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [foodTypesByKind, setFoodTypesByKind] = useState<Record<FoodTypeKind, FamilyFoodType[]>>({
    alimentacion: [],
    no_alimentos: [],
  })
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shoppingMode, setShoppingMode] = useState(false)
  // Botón flotante "Añadir producto", tocable desde cualquier parte de
  // la pestaña — misma idea ya aplicada a Contactos y Calendario,
  // petición real: "en compras lo mismo, botón flotante Añadir
  // producto y formulario emergente".
  const [addingItem, setAddingItem] = useState(false)
  // Tocar el nombre de un producto pendiente lo abre para editarlo
  // (petición real: "que se puedan editar los productos tocándolos") —
  // mismo modal que "Añadir producto", pero precargado con sus datos.
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null)
  // Cada tienda se puede plegar tocando su nombre — petición real: "que
  // la lista de cada supermercado sea extensible y se contraiga si se
  // toca el nombre de la tienda". Empiezan todas desplegadas.
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set())
  function toggleStoreCollapsed(store: string) {
    setCollapsedStores((prev) => {
      const next = new Set(prev)
      if (next.has(store)) next.delete(store)
      else next.add(store)
      return next
    })
  }

  // Petición real: "Compras: compartir la lista de una tienda o de
  // todas, que se pueda elegir en el momento de compartir" — solo lo
  // pendiente (lo ya comprado no tiene sentido mandarlo a nadie). Sin
  // Web Share API (ordenador) se copia al portapapeles y se avisa aquí.
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  function flashShareNotice(msg: string) {
    setShareNotice(msg)
    setTimeout(() => setShareNotice(null), 2500)
  }

  function pendingLines(storeItems: ShoppingItem[]) {
    return storeItems
      .filter((i) => i.status === 'pendiente')
      .map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit }))
  }

  async function shareGroups(groups: { store: string; items: { name: string; quantity: string | null; unit: string | null }[] }[], title: string) {
    const nonEmpty = groups.filter((g) => g.items.length > 0)
    if (nonEmpty.length === 0) {
      flashShareNotice('No hay nada pendiente que compartir.')
      return
    }
    try {
      const shared = await shareText({ title, text: shoppingListText(nonEmpty) })
      flashShareNotice(shared ? '' : 'Copiado al portapapeles.')
    } catch (err) {
      flashShareNotice(errorMessage(err, 'No se pudo compartir'))
    }
  }

  async function handleShareStore(store: string, storeItems: ShoppingItem[]) {
    await shareGroups([{ store, items: pendingLines(storeItems) }], `Lista de la compra — ${store}`)
  }

  async function handleShareAll() {
    await shareGroups(
      storeGroups.map(([store, storeItems]) => ({ store, items: pendingLines(storeItems) })),
      'Lista de la compra',
    )
  }

  // Solo se enseña "Cargando…" (que desmonta el formulario de abajo) la
  // primera vez — si no, cada "reload" tras añadir un producto borraba
  // lo que llevaras escrito en el formulario, incluida la tienda que se
  // deja puesta a propósito entre productos seguidos.
  function reload() {
    setLoading(true)
    Promise.all([
      listShoppingItems(),
      listProducts(),
      listAllProductPrices(),
      listShoppingStores(),
      listReceipts(),
      listBudgetCategories(),
      listFamilyFoodTypes('alimentacion'),
      listFamilyFoodTypes('no_alimentos'),
    ])
      .then(([shoppingItems, products, prices, shoppingStores, receipts, categories, foodKinds, noFoodKinds]) => {
        setItems(shoppingItems)
        setSuggestions(buildSuggestions(products, prices, buildFoodReceiptIds(receipts, categories)))
        setStores(shoppingStores)
        setAllProducts(products)
        setFoodTypesByKind({ alimentacion: foodKinds, no_alimentos: noFoodKinds })
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setLoading(false)
        setInitialized(true)
      })
  }

  useEffect(reload, [])

  // Si se apunta un producto por voz (VoiceCapture está fuera de esta
  // pantalla, montado en toda la app) estando ya aquí, que aparezca al
  // momento en vez de tener que recargar a mano.
  useEffect(() => {
    window.addEventListener('family-app:compras-changed', reload)
    return () => window.removeEventListener('family-app:compras-changed', reload)
  }, [])

  // "Pepa, Mercadona" (sin producto) navega aquí y pide ver esa tienda
  // directamente — petición real: "cuando le diga Aldi, que me abra
  // directamente la lista de Aldi". Se hace scroll al grupo en cuanto
  // aparece en el DOM (puede tardar un tick si la pantalla se acaba de
  // montar por la propia navegación).
  useEffect(() => {
    function handleFocusStore(e: Event) {
      const store = (e as CustomEvent<{ store: string }>).detail?.store
      if (!store) return
      // Si la tienda a la que Pepa navega está plegada, se despliega
      // sola — si no, el usuario haría scroll a una cabecera cerrada
      // sin ver el producto que acaba de apuntar.
      setCollapsedStores((prev) => {
        if (!prev.has(store)) return prev
        const next = new Set(prev)
        next.delete(store)
        return next
      })
      const target = normalize(store)
      const tryScroll = (attempt: number) => {
        const el = document.getElementById(`shopping-store-${target}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else if (attempt < 10) {
          setTimeout(() => tryScroll(attempt + 1), 150)
        }
      }
      tryScroll(0)
    }
    window.addEventListener('family-app:focus-store', handleFocusStore)
    return () => window.removeEventListener('family-app:focus-store', handleFocusStore)
  }, [])

  const pending = items.filter((i) => i.status === 'pendiente')
  const bought = items.filter((i) => i.status === 'comprado')
  const total = pending.length + bought.length

  // Petición real: "en modo compra, si va reconociendo los precios...
  // que te los vaya sumando... para ir sabiendo el dinero que va
  // gastando conforme vas comprando" — usa el precio del propio
  // producto si ya lo trae (p. ej. de un ticket ya enlazado) y, si no,
  // el último precio pagado guardado en la Memoria de precios (mismo
  // dato que ya se enseña junto a cada línea, "X €/ud"). Los productos
  // sin ningún precio conocido no cuentan para el total, pero se
  // avisa de cuántos son para que el total no parezca "el gasto real"
  // cuando en realidad falta alguno por contar.
  const suggestionByName = useMemo(
    () => new Map(suggestions.map((s) => [s.normalizedName, s])),
    [suggestions],
  )
  // Tiendas sin color propio en la base de datos: mismo criterio que
  // CLASS_COLORS — se deriva de TODAS las tiendas de la familia
  // (`stores`, no solo las que tienen algo pendiente hoy) para que el
  // color de una tienda coincida siempre con el que se ve en Tickets
  // y Estadísticas.
  const storeColors = useMemo(() => paletteByName(stores.map((s) => s.name)), [stores])
  function knownPriceFor(item: ShoppingItem): number | null {
    if (item.price != null) return item.price
    return suggestionByName.get(normalizeProductName(item.name))?.lastPrice ?? null
  }
  const boughtPrices = bought.map((i) => knownPriceFor(i))
  const boughtTotal = boughtPrices.reduce((sum: number, p) => sum + (p ?? 0), 0)
  const boughtWithoutPrice = boughtPrices.filter((p) => p == null).length

  // Los marcados con ✓ ya NO desaparecen de aquí — se quedan tachados
  // en su sitio hasta "Finalizar compra" (petición real: poder seguir
  // viendo lo que ya se cogió mientras se sigue comprando lo demás).
  const visible = items.filter((i) => i.status === 'pendiente' || i.status === 'comprado')

  // Agrupa "detallado por tienda" — en Mercadona esto, en la pescadería
  // lo otro — para verlo separado al programar/hacer la compra. Los
  // productos sin tienda asignada caen en un grupo aparte, al final.
  const itemsByStore = new Map<string, ShoppingItem[]>()
  for (const item of visible) {
    const key = item.store || 'Sin tienda'
    const list = itemsByStore.get(key) ?? []
    list.push(item)
    itemsByStore.set(key, list)
  }
  const storeGroups = [...itemsByStore.entries()].sort((a, b) => {
    if (a[0] === 'Sin tienda') return 1
    if (b[0] === 'Sin tienda') return -1
    return a[0].localeCompare(b[0])
  })

  // Petición real: "vamos a organizarla por clases de alimentos...
  // conforme se apunten que la app vaya organizándolas por clases
  // conforme a las clases que ya tenemos. De esa manera en la tienda
  // será más fácil comprar porque productos similares suelen estar
  // juntos" — dentro de CADA tienda, un segundo nivel de agrupación por
  // clase (mismo criterio que resolveDraftLineClass en Tickets: la
  // clase ya guardada del producto si se conoce, si no se adivina por
  // el nombre). El arrastre para reordenar a mano sigue existiendo,
  // pero dentro de cada clase — entre clases ya no tiene sentido, las
  // decide la propia app.
  const productByNormalizedName = new Map(allProducts.map((p) => [p.normalizedName, p]))

  function resolveItemClass(item: ShoppingItem): { kind: FoodTypeKind; label: string; icon: string } {
    const existing = productByNormalizedName.get(normalizeProductName(item.name))
    let kind: FoodTypeKind
    let classification: string
    if (existing) {
      kind = existing.nonFood ? 'no_alimentos' : 'alimentacion'
      classification = existing.category?.trim() || (kind === 'alimentacion' ? classifyFoodType(item.name).label : '')
    } else {
      // Sin producto conocido todavía: mismo criterio de "tienda física
      // = Alimentos por defecto" que ya usa el resto de la app — se
      // adivina por el nombre, nunca se deja "Sin tienda"/"Sin clase"
      // solo por ser nuevo.
      kind = 'alimentacion'
      classification = classifyFoodType(item.name).label
    }
    const known = classification ? foodTypesByKind[kind].find((t) => t.name === classification) : undefined
    const label = classification || 'Sin clasificar'
    const icon = known?.icon ?? (classification ? (kind === 'alimentacion' ? classifyFoodType(item.name).icon : '❓') : '❓')
    return { kind, label, icon }
  }

  const FOOD_TYPE_ORDER = FOOD_TYPES.map((t) => t.label)
  const NO_FOOD_TYPE_ORDER = NO_FOOD_TYPES.map((t) => t.label)
  function classGroupRank(kind: FoodTypeKind, label: string): number {
    if (label === 'Sin clasificar') return 1000
    const canonical = kind === 'alimentacion' ? FOOD_TYPE_ORDER : NO_FOOD_TYPE_ORDER
    const idx = canonical.indexOf(label)
    const kindOffset = kind === 'alimentacion' ? 0 : 500
    return kindOffset + (idx >= 0 ? idx : 400)
  }

  function classGroupsFor(storeItems: ShoppingItem[]) {
    const groups = new Map<string, { kind: FoodTypeKind; label: string; icon: string; items: ShoppingItem[] }>()
    for (const item of storeItems) {
      const resolved = resolveItemClass(item)
      const key = `${resolved.kind}:${resolved.label}`
      const group = groups.get(key) ?? { kind: resolved.kind, label: resolved.label, icon: resolved.icon, items: [] }
      group.items.push(item)
      groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => {
      const rankDiff = classGroupRank(a.kind, a.label) - classGroupRank(b.kind, b.label)
      return rankDiff !== 0 ? rankDiff : a.label.localeCompare(b.label, 'es')
    })
  }

  async function setStatus(id: string, status: ShoppingItemStatus) {
    try {
      await updateShoppingItemStatus(id, status)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo actualizar'))
    }
  }

  // Borra solo lo ya tachado (comprado) de esa tienda al terminar la
  // compra — lo que se quedó sin marcar sigue pendiente en la lista
  // (petición real: si queda algo sin tachar, que no lo borre).
  async function finalizePurchase(storeItems: ShoppingItem[]) {
    try {
      const boughtIds = storeItems.filter((i) => i.status === 'comprado').map((i) => i.id)
      await deleteShoppingItems(boughtIds)
      reload()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo finalizar la compra'))
    }
  }

  if (loading && !initialized) return <p className="muted">Cargando lista…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="shopping-toolbar">
        <p className="points-badge">
          {bought.length}/{total || 0} comprados
        </p>
        {shoppingMode && bought.length > 0 && (
          <p className="points-badge shopping-running-total">
            🧾 {boughtTotal.toFixed(2)} €
            {boughtWithoutPrice > 0 &&
              ` (${boughtWithoutPrice} sin precio conocido)`}
          </p>
        )}
        <button type="button" className="link-button" onClick={() => setShoppingMode(!shoppingMode)}>
          {shoppingMode ? 'Salir de modo compra' : '🛒 Modo compra'}
        </button>
        {pending.length > 0 && (
          <button type="button" className="link-button" onClick={handleShareAll}>
            📤 Compartir todo
          </button>
        )}
      </div>
      {shareNotice && <p className="muted" style={{ fontSize: 12 }}>{shareNotice}</p>}

      <h2 className="section-title">Pendientes</h2>
      {storeGroups.map(([store, storeItems]) => {
        // Petición real: "si solo hay un producto de una tienda quiero
        // que también salga el nombre de la tienda y su logotipo" —
        // antes la cabecera (nombre, logo, plegar, compartir) solo
        // aparecía con más de una tienda en la lista; con una sola
        // (aunque fuera un único producto) se quedaba sin decir de
        // dónde era.
        const collapsed = collapsedStores.has(store)
        return (
        <div key={store} id={`shopping-store-${normalize(store)}`}>
          <h3
            className="shopping-store-heading shopping-store-heading-toggle"
            role="button"
            tabIndex={0}
            onClick={() => toggleStoreCollapsed(store)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') toggleStoreCollapsed(store)
            }}
          >
            <span className="shopping-store-chevron">{collapsed ? '▸' : '▾'}</span>
            {store === 'Sin tienda' ? '🏬' : <StoreIconBadge name={store} size={20} />} {store}
            <span className="muted"> ({storeItems.length})</span>
            <button
              type="button"
              className="icon-button-share"
              style={{ marginLeft: 'auto' }}
              aria-label={`Compartir lista de ${store}`}
              onClick={(e) => {
                e.stopPropagation()
                handleShareStore(store, storeItems)
              }}
            >
              📤
            </button>
          </h3>
          {!collapsed && (
            <>
              {classGroupsFor(storeItems).map((group) => (
                <div key={`${store}:${group.kind}:${group.label}`} className="shopping-class-group">
                  <p className="shopping-class-heading" style={{ background: CLASS_COLORS.get(group.label) }}>
                    {group.icon} {group.label}
                  </p>
                  <DraggableStoreGroup
                    items={group.items}
                    suggestions={suggestions}
                    shoppingMode={shoppingMode}
                    rowColor={CLASS_COLORS.get(group.label)}
                    onSetStatus={setStatus}
                    onDeleted={reload}
                    onReordered={reload}
                    onEdit={setEditingItem}
                  />
                </div>
              ))}
              {/* Los comprados se quedan tachados a la vista; solo se
                  limpia la tienda entera al terminar de comprar allí. */}
              <ConfirmButton
                className="link-button shopping-finish-button"
                label="✅ Finalizar compra"
                confirmLabel="Sí, finalizar"
                onConfirm={() => finalizePurchase(storeItems)}
              />
            </>
          )}
        </div>
        )
      })}
      {visible.length === 0 && <p className="muted">Nada pendiente.</p>}

      {/* Petición real: "pon una nota... en letra pequeña como los
          productos se borran y editan" — ni el check ni deslizar ni
          tocar el nombre se ven como acciones a la primera, así que se
          explican aquí en vez de dejarlos por descubrir. */}
      {visible.length > 0 && (
        <p className="muted" style={{ fontSize: 12 }}>
          Toca un producto para editarlo, desliza hacia la izquierda para borrarlo.
        </p>
      )}

      {/* Petición real: "pondría las tiendas que Pepa reconoce por voz
          debajo de la lista de pendientes" — antes iba justo encima,
          delante de lo que de verdad se mira primero al entrar. */}
      <StoreManager stores={stores} storeColors={storeColors} onChanged={reload} />

      {!shoppingMode && (
        <button type="button" className="screen-fab" onClick={() => setAddingItem(true)}>
          + Añadir producto
        </button>
      )}

      {addingItem && (
        <div className="modal-overlay" onClick={() => setAddingItem(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Añadir producto
              </h2>
              <button type="button" className="modal-close" onClick={() => setAddingItem(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            {/* A diferencia de Contactos/Calendario, aquí NO se cierra
                sola al guardar — se pensó para añadir varios productos
                seguidos sin reabrir el formulario cada vez (la tienda
                se queda puesta a propósito entre uno y otro, ver
                AddShoppingItemForm). Se cierra a mano con la ✕ cuando
                ya no se quiera añadir más. */}
            <AddShoppingItemForm
              suggestions={suggestions}
              knownStores={[...new Set(items.map((i) => i.store).filter((s): s is string => !!s))]}
              hideHeading
              onAdded={reload}
            />
          </div>
        </div>
      )}

      {editingItem && (
        <div className="modal-overlay" onClick={() => setEditingItem(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                Editar producto
              </h2>
              <button type="button" className="modal-close" onClick={() => setEditingItem(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            <EditShoppingItemForm
              item={editingItem}
              suggestions={suggestions}
              knownStores={[...new Set(items.map((i) => i.store).filter((s): s is string => !!s))]}
              onSaved={() => {
                reload()
                setEditingItem(null)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Logo de verdad para cadenas conocidas (Mercadona, Aldi...) o un icono
// relacionado para las que no tienen una marca única (petición real: "en
// vez de ponerme Aldi con la x, me lo pones con el nombre, pero con el
// logotipo también... el que no tenga logotipo, le pones algo
// relacionado"). El logo se referencia en vivo desde la web pública del
// propio favicon del dominio de la cadena — no se guarda ninguna imagen
// de marca en la aplicación.
//
// Tocar el icono lleva directamente a la lista de esa tienda (petición
// real: "cuando toque el icono de un supermercado, quiero que se abra
// la lista de ese supermercado") — mismo aviso que ya usa la voz para
// "Pepa, Mercadona", solo que disparado con un toque. stopPropagation
// para no arrastrar el toque a lo que tenga alrededor (p. ej. el
// nombre en Tiendas, que sigue abriendo el renombrado como siempre).
function StoreIconBadge({ name, size = 18 }: { name: string; size?: number }) {
  function handleClick(e: { stopPropagation: () => void }) {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('family-app:focus-store', { detail: { store: name } }))
  }

  return (
    <span role="button" aria-label={`Ir a la lista de ${name}`} onClick={handleClick} style={{ cursor: 'pointer' }}>
      <StoreIcon name={name} size={size} />
    </span>
  )
}

// Tiendas que Pepa reconoce por voz al apuntar en la compra — editable
// desde aquí, no fija en el código, para que cada familia tenga las
// suyas (petición real: "que puedas añadir los supermercados que
// quieras o quitar los que quieras... si vendo la aplicación y otra
// persona tiene Carbo Bravo, que pueda cambiarlo").
// Lista vertical, arrastrable con el dedo — petición real: "los
// supermercados quiero poder tocarlos con el dedo, coger Aldi y
// ponerlo debajo del Líder" (lo piensa como una lista de arriba a
// abajo, no como chips en fila). Mismo mecanismo, asa y persistencia
// (sort_order en la base de datos) que DraggableStoreGroup, para que
// se comporte exactamente igual que la lista de la compra.
function StoreManager({
  stores,
  storeColors,
  onChanged,
}: {
  stores: ShoppingStoreEntry[]
  storeColors: Map<string, string>
  onChanged: () => void
}) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [order, setOrder] = useState(stores)
  const dragRef = useRef<{ id: string; startY: number; startIndex: number; itemHeight: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  useEffect(() => {
    if (!dragRef.current) setOrder(stores)
  }, [stores])

  function handleDragStart(e: ReactPointerEvent, id: string, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const index = order.findIndex((s) => s.id === id)
    dragRef.current = { id, startY: e.clientY, startIndex: index, itemHeight: el.offsetHeight + 8 }
    setDraggingId(id)
  }

  function handleDragMove(e: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dy = e.clientY - drag.startY
    const shift = Math.round(dy / drag.itemHeight)
    const newIndex = Math.min(order.length - 1, Math.max(0, drag.startIndex + shift))
    if (shift !== 0 && newIndex !== drag.startIndex) {
      setOrder((prev) => {
        const currentIndex = prev.findIndex((s) => s.id === drag.id)
        if (currentIndex === -1 || currentIndex === newIndex) return prev
        const next = [...prev]
        const [moved] = next.splice(currentIndex, 1)
        next.splice(newIndex, 0, moved)
        return next
      })
      // Bug real ("al ordenar varias líneas se montan los productos"):
      // tras mover un elemento en la lista, había que reiniciar aquí el
      // punto de referencia — si no, el siguiente cálculo seguía
      // contando desde el dedo hasta el principio del gesto entero, y
      // el desplazamiento se iba acumulando con cada salto en vez de
      // medirse solo desde el último salto.
      drag.startY += shift * drag.itemHeight
      drag.startIndex = newIndex
      setDragOffset(dy - shift * drag.itemHeight)
    } else {
      setDragOffset(dy)
    }
  }

  function handleDragEnd() {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setDragOffset(0)
    if (!drag) return
    reorderShoppingStores(order.map((s) => s.id)).then(onChanged)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createShoppingStore(newName.trim())
      setNewName('')
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir la tienda'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRename(id: string) {
    if (!editingName.trim()) return
    setError(null)
    try {
      await renameShoppingStore(id, editingName.trim())
      setEditingId(null)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo renombrar'))
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteShoppingStore(id)
      onChanged()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo quitar'))
    }
  }

  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>
        🏬 Tiendas que Pepa reconoce por voz
      </p>
      {/* Petición real: "que explique cómo se mandan productos a la
          lista de supermercados... Mercadona, patatas, cómo decirlo,
          igual que están las otras cosas explicadas" — mismo patrón de
          ejemplos que ya se usa en el panel de Pepa (🎤 Añadir), aquí
          al lado de donde se dan de alta las tiendas. */}
      <p className="muted" style={{ fontSize: 13 }}>
        Para apuntar un producto en la tienda que quieras, di el nombre de la tienda y el producto — por ejemplo,
        "Mercadona, patatas" o "Hipervel, leche" — y Pepa lo pone en la lista de esa tienda.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {order.map((s) =>
          editingId === s.id ? (
            <div key={s.id} className="card task-card" style={{ background: storeColors.get(s.name) }}>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                style={{ flex: 1 }}
                autoFocus
              />
              <button type="button" className="link-button" onClick={() => handleRename(s.id)} aria-label="Guardar">
                ✓
              </button>
              <button type="button" className="link-button" onClick={() => setEditingId(null)} aria-label="Cancelar">
                ✕
              </button>
            </div>
          ) : (
            <div
              key={s.id}
              className={'card task-card' + (draggingId === s.id ? ' shopping-item-dragging' : '')}
              style={{
                background: storeColors.get(s.name),
                transform: draggingId === s.id ? `translateY(${dragOffset}px)` : undefined,
              }}
            >
              <span
                className="shopping-drag-handle"
                onPointerDown={(e) => handleDragStart(e, s.id, e.currentTarget.parentElement as HTMLElement)}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                aria-label="Arrastrar para reordenar"
              >
                ⠿
              </span>
              <span
                onClick={() => {
                  setEditingId(s.id)
                  setEditingName(s.name)
                }}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1 }}
              >
                <StoreIconBadge name={s.name} />
                {s.name}
              </span>
              <ConfirmIconButton className="link-button" ariaLabel={`Quitar ${s.name}`} onConfirm={() => handleDelete(s.id)} />
            </div>
          ),
        )}
        {order.length === 0 && <p className="muted">Ninguna todavía.</p>}
      </div>
      <form onSubmit={handleAdd} className="inline-fields">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nueva tienda (p. ej. Mercadona)"
        />
        <button type="submit" disabled={saving || !newName.trim()}>
          Añadir
        </button>
      </form>
    </div>
  )
}

// Arrastrar un producto con el dedo para subirlo o bajarlo en la lista
// (petición real: "poder ordenarlos por lugar en la lista de compra").
// El orden se guarda de verdad (sort_order en la base de datos), no es
// solo visual — se mantiene igual la próxima vez que se abra la lista.
// El "asa" para arrastrar tiene `touch-action: none` en el CSS para que
// el propio navegador no intente hacer scroll de la pantalla mientras
// se mueve el dedo por encima, sin necesitar trucos con preventDefault.
function DraggableStoreGroup({
  items,
  suggestions,
  shoppingMode,
  rowColor,
  onSetStatus,
  onDeleted,
  onReordered,
  onEdit,
}: {
  items: ShoppingItem[]
  suggestions: ProductSuggestion[]
  shoppingMode: boolean
  rowColor?: string
  onSetStatus: (id: string, status: ShoppingItemStatus) => void
  onDeleted: () => void
  onReordered: () => void
  onEdit: (item: ShoppingItem) => void
}) {
  const [order, setOrder] = useState(items)
  const dragRef = useRef<{ id: string; startY: number; startIndex: number; itemHeight: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  // La lista de fuera (filtrada/ordenada por la base de datos) manda —
  // se sincroniza salvo mientras se está arrastrando, para no pelearse
  // con el propio gesto en marcha.
  useEffect(() => {
    if (!dragRef.current) setOrder(items)
  }, [items])

  function handleTouchStart(e: ReactPointerEvent, id: string, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const index = order.findIndex((i) => i.id === id)
    dragRef.current = { id, startY: e.clientY, startIndex: index, itemHeight: el.offsetHeight + 10 }
    setDraggingId(id)
  }

  function handleTouchMove(e: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dy = e.clientY - drag.startY
    const shift = Math.round(dy / drag.itemHeight)
    const newIndex = Math.min(order.length - 1, Math.max(0, drag.startIndex + shift))
    if (shift !== 0 && newIndex !== drag.startIndex) {
      setOrder((prev) => {
        const currentIndex = prev.findIndex((i) => i.id === drag.id)
        if (currentIndex === -1 || currentIndex === newIndex) return prev
        const next = [...prev]
        const [moved] = next.splice(currentIndex, 1)
        next.splice(newIndex, 0, moved)
        return next
      })
      // Bug real ("al ordenar varias líneas se montan los productos"):
      // tras mover un elemento, había que reiniciar aquí el punto de
      // referencia — si no, el siguiente cálculo seguía contando desde
      // el principio de todo el gesto, y el desplazamiento se iba
      // acumulando con cada salto en vez de medirse solo desde el
      // último. Esto también hacía que el orden final guardado no
      // fuera siempre el que se veía en pantalla al soltar.
      drag.startY += shift * drag.itemHeight
      drag.startIndex = newIndex
      setDragOffset(dy - shift * drag.itemHeight)
    } else {
      setDragOffset(dy)
    }
  }

  function handleTouchEnd() {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setDragOffset(0)
    if (!drag) return
    reorderShoppingItems(order.map((i) => i.id)).then(onReordered)
  }

  return (
    <div className="price-row-list">
      {order.map((item) => {
        const done = item.status === 'comprado'
        // Todo el detalle (cantidad/unidad, prioridad, precio) en una
        // sola línea con el nombre, estilo Memoria — petición real:
        // "más estrecha, al estilo de Memoria... en una sola línea".
        const known = suggestions.find((s) => s.normalizedName === normalizeProductName(item.name))
        const detailParts = [
          [item.quantity, item.unit].filter(Boolean).join(' '),
          !shoppingMode && item.priority !== 'normal' ? `prioridad ${item.priority}` : null,
          known?.lastPrice != null ? `${known.lastPrice.toFixed(2)} €/ud` : null,
        ].filter(Boolean)
        const label = item.name + (detailParts.length > 0 ? ` · ${detailParts.join(' · ')}` : '')
        return (
          <ShoppingItemRow
            key={item.id}
            item={item}
            label={label}
            done={done}
            dragging={draggingId === item.id}
            dragOffsetY={dragOffset}
            shoppingMode={shoppingMode}
            rowColor={rowColor}
            onSetStatus={onSetStatus}
            onDelete={(id) => deleteShoppingItem(id).then(onDeleted)}
            onEdit={onEdit}
            onDragStart={handleTouchStart}
            onDragMove={handleTouchMove}
            onDragEnd={handleTouchEnd}
          />
        )
      })}
    </div>
  )
}

const SWIPE_OPEN_X = -76

// Fila de un producto: check ligero (círculo vacío hasta marcarlo,
// petición real: el check cuadrado con el aspa siempre dibujada hacía
// que la lista pareciera ya comprada de un vistazo) + borrar
// deslizando en vez de un aspa fija siempre visible junto al check.
// Tocar el nombre lo abre para editarlo (petición real: "que se
// puedan editar los productos tocándolos").
function ShoppingItemRow({
  item,
  label,
  done,
  dragging,
  dragOffsetY,
  shoppingMode,
  rowColor,
  onSetStatus,
  onDelete,
  onEdit,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  item: ShoppingItem
  label: string
  done: boolean
  dragging: boolean
  dragOffsetY: number
  shoppingMode: boolean
  rowColor?: string
  onSetStatus: (id: string, status: ShoppingItemStatus) => void
  onDelete: (id: string) => void
  onEdit: (item: ShoppingItem) => void
  onDragStart: (e: ReactPointerEvent, id: string, el: HTMLElement) => void
  onDragMove: (e: ReactPointerEvent) => void
  onDragEnd: () => void
}) {
  const [openX, setOpenX] = useState(0)
  const [liveX, setLiveX] = useState<number | null>(null)
  const swipeStartX = useRef(0)
  const swiping = useRef(false)

  function handleSwipeStart(e: ReactPointerEvent) {
    if (shoppingMode) return
    swipeStartX.current = e.clientX
    swiping.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleSwipeMove(e: ReactPointerEvent) {
    if (!swiping.current) return
    const raw = openX + (e.clientX - swipeStartX.current)
    setLiveX(Math.min(0, Math.max(SWIPE_OPEN_X, raw)))
  }

  function handleSwipeEnd() {
    if (!swiping.current) return
    swiping.current = false
    const current = liveX ?? openX
    setOpenX(current < SWIPE_OPEN_X / 2 ? SWIPE_OPEN_X : 0)
    setLiveX(null)
  }

  const translateX = liveX ?? openX

  return (
    <div className="shopping-row-outer" style={{ overflow: dragging ? 'visible' : 'hidden' }}>
      {!shoppingMode && (
        <div className="shopping-row-delete-behind">
          <button
            type="button"
            className="shopping-row-delete-btn"
            onClick={() => onDelete(item.id)}
            aria-label={`Eliminar ${item.name}`}
          >
            🗑 Eliminar
          </button>
        </div>
      )}
      <div
        className={
          'price-row shopping-row-inner' +
          (dragging ? ' shopping-item-dragging' : '') +
          (done ? ' shopping-item-done' : '') +
          (shoppingMode ? (done ? ' shopping-mode-done' : ' shopping-mode-pending') : '')
        }
        style={{
          transform: dragging ? `translateY(${dragOffsetY}px)` : translateX !== 0 ? `translateX(${translateX}px)` : undefined,
          transition: liveX == null ? undefined : 'none',
          background: shoppingMode ? undefined : rowColor,
        }}
        onPointerDown={handleSwipeStart}
        onPointerMove={handleSwipeMove}
        onPointerUp={handleSwipeEnd}
        onPointerCancel={handleSwipeEnd}
      >
        {!shoppingMode && (
          <span
            className="shopping-drag-handle"
            onPointerDown={(e) => {
              e.stopPropagation()
              onDragStart(e, item.id, e.currentTarget.parentElement as HTMLElement)
            }}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            aria-label="Arrastrar para reordenar"
          >
            ⠿
          </span>
        )}
        <button
          type="button"
          className="price-row-name price-row-name-button"
          onClick={() => {
            if (openX !== 0) {
              setOpenX(0)
              return
            }
            onEdit(item)
          }}
        >
          {label}
        </button>
        {/* Marcar/desmarcar comprado — ya NO borra el producto de la
            lista, solo lo tacha (petición real: seguir viéndolo
            mientras se sigue comprando el resto). */}
        <button
          type="button"
          className={'shopping-check' + (done ? ' shopping-check-checked' : '')}
          onClick={() => onSetStatus(item.id, done ? 'pendiente' : 'comprado')}
          aria-label={done ? 'Marcar como pendiente' : 'Comprado'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function AddShoppingItemForm({
  suggestions,
  knownStores,
  hideHeading,
  onAdded,
}: {
  suggestions: ProductSuggestion[]
  knownStores: string[]
  hideHeading?: boolean
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [store, setStore] = useState('')
  const [priority, setPriority] = useState<ShoppingItemPriority>('normal')
  const [matchedPrice, setMatchedPrice] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Al escribir "LE" ya aparece "Leche" (con su marca habitual) en el
  // desplegable nativo del input; al completarlo (a mano o eligiéndolo)
  // se rellenan cantidad/unidad/precio con lo último comprado (Skill 09)
  // — el precio no se guarda aquí, solo se muestra como referencia hasta
  // marcarlo comprado.
  function handleNameChange(value: string) {
    setName(value)
    const match = suggestions.find((s) => s.normalizedName === value.trim().toLowerCase())
    if (match) {
      setQuantity(match.quantity ?? '')
      setUnit(match.unit ?? '')
      setMatchedPrice(match.lastPrice)
    } else {
      setMatchedPrice(null)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addShoppingItem({ name, quantity, unit, priority, tripId: null, store: store || null })
      setName('')
      setQuantity('')
      setUnit('')
      setMatchedPrice(null)
      // La tienda NO se limpia adrede: al añadir varios productos seguidos
      // de la misma tienda ("en Mercadona: patatas, huevos, leche") no
      // hace falta volver a escribirla cada vez.
      onAdded()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      {!hideHeading && <h2>Añadir producto</h2>}
      <label>
        Nombre
        <input
          type="text"
          list="product-suggestions"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
        />
        <datalist id="product-suggestions">
          {suggestions.map((s) => (
            <option key={s.normalizedName} value={s.displayName} />
          ))}
        </datalist>
      </label>
      {matchedPrice != null && <p className="muted">Último precio: {matchedPrice.toFixed(2)} €</p>}
      <div className="inline-fields">
        <label>
          Cantidad
          <input type="text" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="2" />
        </label>
        <label>
          Unidad
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" />
        </label>
      </div>
      <label>
        Tienda (opcional)
        <input type="text" list="known-stores" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
        <datalist id="known-stores">
          {knownStores.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label>
        Prioridad
        <select value={priority} onChange={(e) => setPriority(e.target.value as ShoppingItemPriority)}>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Añadiendo…' : 'Añadir'}
      </button>
    </form>
  )
}

// Editar un producto ya apuntado — mismos campos que al añadirlo,
// precargados con lo que ya tenía.
function EditShoppingItemForm({
  item,
  suggestions,
  knownStores,
  onSaved,
}: {
  item: ShoppingItem
  suggestions: ProductSuggestion[]
  knownStores: string[]
  onSaved: () => void
}) {
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [unit, setUnit] = useState(item.unit ?? '')
  const [store, setStore] = useState(item.store ?? '')
  const [priority, setPriority] = useState<ShoppingItemPriority>(item.priority)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateShoppingItem(item.id, { name, quantity, unit, priority, store: store || null })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <label>
        Nombre
        <input type="text" list="product-suggestions-edit" value={name} onChange={(e) => setName(e.target.value)} required />
        <datalist id="product-suggestions-edit">
          {suggestions.map((s) => (
            <option key={s.normalizedName} value={s.displayName} />
          ))}
        </datalist>
      </label>
      <div className="inline-fields">
        <label>
          Cantidad
          <input type="text" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="2" />
        </label>
        <label>
          Unidad
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" />
        </label>
      </div>
      <label>
        Tienda
        <input type="text" list="known-stores-edit" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
        <datalist id="known-stores-edit">
          {knownStores.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>
      <label>
        Prioridad
        <select value={priority} onChange={(e) => setPriority(e.target.value as ShoppingItemPriority)}>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Historial (Skill 09/11 + antes "Precios" en Dinero) — fusiona lo que
// eran dos pestañas separadas, Memoria e Historial, en una sola.
// Petición real: "combinar Memoria y Historial para dejarlo en una
// sola sección que se llame Historial... falta que le integres a
// Memoria el filtro de fechas que hay en Historial, las flechas si el
// precio ha subido o bajado". Sigue sin normalizar por cantidad (1L vs
// 1,5L cuentan igual): compara lo que se pagó cada vez, que es el dato
// que hay sin pedir cantidades exactas en cada compra.
// ---------------------------------------------------------------------

function formatFullDate(d: string): string {
  return new Date(`${d}T00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

function PriceDelta({ percent }: { percent: number | null }) {
  if (percent == null) return null
  const rounded = Math.round(percent * 10) / 10
  if (Math.abs(rounded) < 0.5) return <span className="muted"> · sin cambios</span>
  const up = rounded > 0
  return (
    <span style={{ color: up ? '#c0392b' : '#1e8449', fontWeight: 600, marginLeft: 8 }}>
      {up ? '▲' : '▼'} {Math.abs(rounded)}%
    </span>
  )
}

interface ProductDetail {
  productId: string
  name: string
  lines: string[]
  nonFood: boolean
  // Clasificación de alimento actual (nombre exacto de family_food_types,
  // o cadena vacía si todavía no se ha elegido ninguna a mano) — para
  // el desplegable editable junto al botón 🚫.
  foodType: string
}

// Petición real: "en Historial de precios vamos a fusionar Alimentos y
// No Alimentos al mismo estilo que las cuentas separadas" — un solo
// tab con dos vistas (chip Alimentos / chip Otros) en vez de dos
// pestañas separadas que cargaban los mismos datos por duplicado.
function HistoryTab() {
  const [mode, setMode] = useState<FoodTypeKind>('alimentacion')
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stores, setStores] = useState<ShoppingStoreEntry[]>([])
  const [foodReceiptIds, setFoodReceiptIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Petición real: "le quitamos el filtro de meses... y en cambio
  // vamos a poner un filtro por palabra para que no se tenga que
  // repasar toda la lista cada vez que se quiera meter un producto a
  // la lista de la compra" — la comparación de precio mes a mes se
  // sigue haciendo igual, solo que siempre contra el mes real actual
  // en vez de dejar navegar a un mes distinto.
  const [query, setQuery] = useState('')
  // Petición real: "vamos a añadir un botón... añadir a la lista de la
  // compra... con el precio que hay marcado" — un solo toque para
  // apuntarlo, con el último precio ya puesto. "added" evita mandarlo
  // dos veces si se toca otra vez.
  const [added, setAdded] = useState<Set<string>>(new Set())
  // Ventana emergente con el detalle de un producto — el detalle no
  // cabe en una fila de una sola línea, así que sale al tocar el
  // nombre (petición real, y ahora también compara precio entre
  // tiendas y en el tiempo).
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  // Al mandar un producto a la lista se pregunta antes en qué tienda
  // quiere comprarse — petición real: "que pregunte en qué tienda
  // queremos comprarlo".
  const [addingToList, setAddingToList] = useState<{ productId: string; name: string; price: number | null } | null>(
    null,
  )
  // Petición real: "botón de engranaje con el cual se abre una
  // ventana emergente con las clasificaciones... la hacemos para
  // todos los productos, misma separación por un botón Alimentos y
  // Otros" — un solo array con las clases de LOS DOS conjuntos
  // (filtradas por `kind` donde haga falta), para no duplicar la
  // carga/siembra por cada uno.
  const [foodTypes, setFoodTypes] = useState<FamilyFoodType[]>([])
  const [showFoodTypesModal, setShowFoodTypesModal] = useState(false)
  const seededKindsRef = useRef(new Set<FoodTypeKind>())

  function reloadFoodTypes() {
    return Promise.all([listFamilyFoodTypes('alimentacion'), listFamilyFoodTypes('no_alimentos')]).then(([a, b]) =>
      setFoodTypes([...a, ...b]),
    )
  }

  // Siembra cada conjunto por separado la primera vez que está vacío
  // — mismo patrón que las categorías de Presupuesto Generales — para
  // que Alimentos y Otros empiecen con sus propias clases de fábrica
  // (FOOD_TYPES / NO_FOOD_TYPES) sin tener que darlas de alta a mano.
  async function ensureFoodTypesSeeded(kind: FoodTypeKind, existing: FamilyFoodType[]): Promise<FamilyFoodType[]> {
    if (seededKindsRef.current.has(kind) || existing.length > 0) return existing
    seededKindsRef.current.add(kind)
    const seed = kind === 'alimentacion' ? FOOD_TYPES : NO_FOOD_TYPES
    await seedFamilyFoodTypes(
      seed.map((t) => ({ name: t.label, icon: t.icon })),
      kind,
    )
    return listFamilyFoodTypes(kind)
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      listAllProductPrices(),
      listProducts(),
      listShoppingStores(),
      listReceipts(),
      listBudgetCategories(),
      listFamilyFoodTypes('alimentacion'),
      listFamilyFoodTypes('no_alimentos'),
    ])
      .then(async ([p, prod, st, receipts, categories, foodKindTypes, noFoodKindTypes]) => {
        foodKindTypes = await ensureFoodTypesSeeded('alimentacion', foodKindTypes)
        noFoodKindTypes = await ensureFoodTypesSeeded('no_alimentos', noFoodKindTypes)
        setPrices(p)
        setProducts(prod)
        setStores(st)
        setFoodReceiptIds(buildFoodReceiptIds(receipts, categories))
        setFoodTypes([...foodKindTypes, ...noFoodKindTypes])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const currentMonth = todayStr().slice(0, 7)
  const previousMonth = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [currentMonth])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p.displayName])), [products])
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const nonFoodProductIds = useMemo(() => new Set(products.filter((p) => p.nonFood).map((p) => p.id)), [products])

  // Cada vista ve solo lo suyo — Alimentos nunca mezcla ropa/electrónica
  // de Amazon, y Otros no arrastra nada de comida. Un pedido de Amazon
  // marcado como "Alimentación" (p. ej. café) sí cuenta como comida —
  // no todo lo de Amazon es Otros por defecto. Un producto marcado a
  // mano como Otros (ver el botón 🚫 en su ficha) nunca cuenta como
  // comida, sea cual sea la tienda.
  const scopedPrices = useMemo(
    () => prices.filter((p) => isFoodPurchase(p, foodReceiptIds, nonFoodProductIds) === (mode === 'alimentacion')),
    [prices, mode, foodReceiptIds, nonFoodProductIds],
  )

  const purchases = useMemo(
    () =>
      scopedPrices.map((p) => {
        const qty = Number(p.quantity)
        return {
          productId: p.productId,
          price: p.price,
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
          recordedDate: p.recordedDate,
        }
      }),
    [scopedPrices],
  )

  const withStats = useMemo(
    () =>
      products
        .map((product) => ({
          product,
          stats: computeProductStats(scopedPrices.filter((p) => p.productId === product.id)),
        }))
        .filter((x) => x.stats !== null),
    [products, scopedPrices],
  )

  // Petición real: limitar a los 10 más comprados — a igual número de
  // compras, se prioriza lo no alcohólico, pero nunca por delante de
  // algo comprado de verdad más veces.
  const suggestions = withStats
    .filter((x) => x.stats!.isDue)
    .sort((a, b) => {
      if (b.stats!.count !== a.stats!.count) return b.stats!.count - a.stats!.count
      return Number(isLikelyAlcohol(a.product.displayName)) - Number(isLikelyAlcohol(b.product.displayName))
    })
    .slice(0, 10)

  const comparisons = useMemo(() => {
    const monthly = averagePricesByMonth(purchases)
    return compareMonths(monthly, currentMonth, previousMonth)
      .map((c) => ({ ...c, name: productById.get(c.productId) ?? '?' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [purchases, currentMonth, previousMonth, productById])

  // Petición real: "quita el filtro de abajo, que se puedan ver todos
  // los productos... comprados alguna vez" — la lista ya no se limita
  // a `comparisons` (solo lo comprado ESTE mes, para poder compararlo
  // con el anterior); se ve todo el catálogo con precio conocido, y
  // cuando SÍ hay compra este mes y el anterior, se sigue mostrando la
  // comparación real (🔺/🔻); si no, solo el último precio.
  const allProducts = useMemo(
    () =>
      withStats
        .map(({ product, stats }) => {
          const inThisMonth = comparisons.find((c) => c.productId === product.id)
          return (
            inThisMonth ?? {
              productId: product.id,
              name: product.displayName,
              currentPrice: stats!.lastPrice,
              previousPrice: null,
              deltaPercent: null,
            }
          )
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [withStats, comparisons],
  )

  const filteredProducts = useMemo(() => {
    const q = normalizeProductName(query)
    if (!q) return allProducts
    return allProducts.filter((c) => normalizeProductName(c.name).includes(q))
  }, [allProducts, query])

  const currentBasket = useMemo(() => basketTotal(purchases, currentMonth), [purchases, currentMonth])
  const previousBasket = useMemo(() => basketTotal(purchases, previousMonth), [purchases, previousMonth])
  const basketDeltaPercent = previousBasket > 0 ? ((currentBasket - previousBasket) / previousBasket) * 100 : null

  // Ventana emergente de un producto: cada cuántos días se suele
  // comprar, estadísticas de siempre, el % de subida/bajada de este
  // mes frente al anterior (comparación EN EL TIEMPO) y — petición
  // real — el precio en cada tienda donde se ha comprado, para
  // comparar ENTRE TIENDAS cuál sale más barata.
  function openDetail(productId: string, name: string) {
    const productPrices = scopedPrices.filter((p) => p.productId === productId)
    const stats = computeProductStats(productPrices)
    const lines: string[] = []
    if (stats) {
      if (stats.avgDaysBetween != null) lines.push(`Sueles comprarlo cada ${Math.round(stats.avgDaysBetween)} días.`)
      lines.push(
        `${stats.count} ${stats.count === 1 ? 'compra' : 'compras'} · media ${stats.avgPrice.toFixed(2)} €/ud · mínimo ${stats.minPrice.toFixed(2)} €/ud · máximo ${stats.maxPrice.toFixed(2)} €/ud.`,
      )
    }
    const comparison = comparisons.find((c) => c.productId === productId)
    if (comparison?.deltaPercent != null) {
      const rounded = Math.round(comparison.deltaPercent * 10) / 10
      if (Math.abs(rounded) >= 0.5) {
        lines.push(`Este mes ha ${rounded > 0 ? 'subido' : 'bajado'} un ${Math.abs(rounded)}% frente al mes anterior.`)
      }
    }

    // Última vez comprado en cada tienda y a qué precio — si es en más
    // de una, se marca cuál sale más barata.
    const byStore = new Map<string, { price: number; date: string }>()
    for (const p of [...productPrices].sort((a, b) => a.recordedDate.localeCompare(b.recordedDate))) {
      byStore.set(p.store || 'Sin tienda concreta', { price: p.price, date: p.recordedDate })
    }
    const storeEntries = [...byStore.entries()].sort((a, b) => a[1].price - b[1].price)
    if (storeEntries.length > 1) {
      const cheapest = storeEntries[0][1].price
      lines.push('Por tienda:')
      for (const [store, info] of storeEntries) {
        const flag = info.price === cheapest ? ' — más barata' : ''
        lines.push(`${store}: ${info.price.toFixed(2)} €/ud (${formatFullDate(info.date)})${flag}`)
      }
    } else if (storeEntries.length === 1) {
      lines.push(`Comprado en ${storeEntries[0][0]}.`)
    }

    const product = productsById.get(productId)
    setDetail({ productId, name, lines, nonFood: product?.nonFood ?? false, foodType: product?.category ?? '' })
  }

  // Excepción manual a la regla de tienda (ver isFoodPurchase) —
  // petición real: "Bombona y Plantas aparecen como Alimentación". Al
  // cambiarlo el producto se mueve de pestaña (Alimentación ↔ No
  // alimentos), así que se cierra la ficha en vez de dejarla abierta
  // sobre un producto que ya no pertenece a esta lista.
  async function handleToggleNonFood() {
    if (!detail) return
    const nextNonFood = !detail.nonFood
    try {
      await setProductNonFood(detail.productId, nextNonFood)
      setProducts((prev) => prev.map((p) => (p.id === detail.productId ? { ...p, nonFood: nextNonFood } : p)))
      setDetail(null)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar la clasificación'))
    }
  }

  // Petición real: "en cada alimento su clasificación editable en un
  // desplegable" — vacío ("Automático") borra la excepción manual y
  // vuelve a dejar que decida classifyFoodType por el nombre.
  async function handleChangeFoodType(nextType: string) {
    if (!detail) return
    try {
      await setProductFoodType(detail.productId, nextType || null)
      setProducts((prev) => prev.map((p) => (p.id === detail.productId ? { ...p, category: nextType || null } : p)))
      setDetail({ ...detail, foodType: nextType })
    } catch (err) {
      setError(errorMessage(err, 'No se pudo cambiar la clasificación'))
    }
  }

  async function confirmAddToList(store: string | null) {
    if (!addingToList) return
    const { productId, name, price } = addingToList
    try {
      await addShoppingItem({ name, quantity: '', unit: '', priority: 'normal', tripId: null, price, store })
      setAdded((prev) => new Set(prev).add(productId))
      setAddingToList(null)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo añadir a la lista'))
    }
  }

  // Petición real: "que se agrupe por clase, igual que en la Lista de
  // la compra" — mismo catálogo/colores que ShoppingListTab
  // (CLASS_COLORS), para que la clase de un producto luzca igual en
  // Lista e Historial. Sin producto ya clasificado, se adivina por el
  // nombre igual que resolveItemClass.
  function classForProduct(productId: string, name: string): { label: string; icon: string } {
    const product = productsById.get(productId)
    const catalog = mode === 'alimentacion' ? FOOD_TYPES : NO_FOOD_TYPES
    const classification = product?.category?.trim() || (mode === 'alimentacion' ? classifyFoodType(name).label : '')
    const known = classification ? catalog.find((t) => t.label === classification) : undefined
    return { label: classification || 'Sin clasificar', icon: known?.icon ?? '❓' }
  }
  const catalogOrder = (mode === 'alimentacion' ? FOOD_TYPES : NO_FOOD_TYPES).map((t) => t.label)
  function classRank(label: string): number {
    if (label === 'Sin clasificar') return 1000
    const idx = catalogOrder.indexOf(label)
    return idx >= 0 ? idx : 500
  }
  const groupedProducts = useMemo(() => {
    const groups = new Map<string, { label: string; icon: string; rows: typeof filteredProducts }>()
    for (const row of filteredProducts) {
      const cls = classForProduct(row.productId, row.name)
      const group = groups.get(cls.label) ?? { label: cls.label, icon: cls.icon, rows: [] }
      group.rows.push(row)
      groups.set(cls.label, group)
    }
    return [...groups.values()].sort((a, b) => classRank(a.label) - classRank(b.label) || a.label.localeCompare(b.label, 'es'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProducts, productsById, mode])

  if (loading) return <p className="muted">Cargando historial…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <p className="muted">Se construye solo: cada vez que guardas el precio de un producto comprado, queda aquí.</p>

      <div className="filter-row">
        <button type="button" className={'chip' + (mode === 'alimentacion' ? ' chip-active' : '')} onClick={() => setMode('alimentacion')}>
          Alimentos
        </button>
        <button type="button" className={'chip' + (mode === 'no_alimentos' ? ' chip-active' : '')} onClick={() => setMode('no_alimentos')}>
          Otros
        </button>
      </div>

      <h2 className="section-title">Sugerencias para la próxima compra</h2>
      <div className="price-row-list">
        {suggestions.map(({ product, stats }) => (
          <div
            key={product.id}
            className="price-row"
            style={{ background: CLASS_COLORS.get(classForProduct(product.id, product.displayName).label) }}
          >
            <button
              type="button"
              className="price-row-name price-row-name-button"
              onClick={() => openDetail(product.id, product.displayName)}
            >
              {product.displayName}
            </button>
            <span className="price-row-price">{stats!.lastPrice.toFixed(2)} €/ud</span>
            <button
              type="button"
              className="link-button"
              disabled={added.has(product.id)}
              onClick={() =>
                setAddingToList({ productId: product.id, name: product.displayName, price: stats!.lastPrice })
              }
              title="Añadir a la lista de la compra"
            >
              {added.has(product.id) ? '✓' : '🛒'}
            </button>
          </div>
        ))}
        {suggestions.length === 0 && <p className="muted">Sin sugerencias todavía.</p>}
      </div>

      <div className="inline-fields" style={{ margin: '8px 0' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar un producto para añadirlo a la lista…"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="link-button"
          onClick={() => setShowFoodTypesModal(true)}
          title="Clasificaciones de productos"
          aria-label="Clasificaciones de productos"
        >
          ⚙️
        </button>
      </div>

      <div className="card event-card">
        <strong>Total de la compra</strong>
        <p>
          {currentBasket.toFixed(2)} €
          <PriceDelta percent={basketDeltaPercent} />
        </p>
        {previousBasket > 0 && <p className="muted">Mes anterior: {previousBasket.toFixed(2)} €</p>}
      </div>

      <p className="muted">
        Todo lo que has comprado alguna vez, con su último precio — cuando también se compró el mes anterior, se ve
        la comparación (🔺 rojo si ha subido, 🔻 verde si ha bajado). Toca el nombre de un producto para ver cada
        cuánto lo compras y comparar precio entre tiendas.
      </p>

      {groupedProducts.map((group) => (
        <div key={group.label} className="shopping-class-group">
          <p className="shopping-class-heading" style={{ background: CLASS_COLORS.get(group.label) }}>
            {group.icon} {group.label}
          </p>
          <div className="price-row-list">
            {group.rows.map((c, i) => (
              <div
                key={c.productId}
                className="price-row"
                style={{ background: i % 2 === 1 ? CLASS_COLORS.get(group.label) : undefined }}
              >
                <button
                  type="button"
                  className="price-row-name price-row-name-button"
                  onClick={() => openDetail(c.productId, c.name)}
                >
                  {c.name}
                </button>
                <span className="price-row-price">
                  {c.currentPrice!.toFixed(2)} €<PriceDelta percent={c.deltaPercent} />
                </span>
                <button
                  type="button"
                  className="link-button"
                  disabled={added.has(c.productId)}
                  onClick={() => setAddingToList({ productId: c.productId, name: c.name, price: c.currentPrice })}
                  title="Añadir a la lista de la compra"
                >
                  {added.has(c.productId) ? '✓' : '🛒'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {filteredProducts.length === 0 && (
        <p className="muted">
          {query.trim()
            ? 'Ningún producto coincide con esa búsqueda.'
            : 'Todavía no hay ningún producto con precio registrado (tickets o lista de la compra).'}
        </p>
      )}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {detail.name}
              </h2>
              <button type="button" className="modal-close" onClick={() => setDetail(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>
            {detail.lines.map((line, i) => (
              <p key={i} className="muted">
                {line}
              </p>
            ))}
            <div className="inline-fields" style={{ marginTop: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="link-button"
                onClick={handleToggleNonFood}
                title={detail.nonFood ? 'Quitar marca de Otros' : 'Marcar como Otros'}
              >
                {detail.nonFood ? '✅' : '🚫'}
              </button>
              {/* Petición real: "en cada alimento su clasificación
                  editable en un desplegable al lado del símbolo no
                  alimento" — solo las clases del conjunto de esta
                  pestaña (Alimentos u Otros). En Alimentos, vacío
                  significa automático (se ve entre paréntesis lo que
                  classifyFoodType habría elegido); en Otros no hay
                  adivinador, así que vacío es simplemente "sin
                  clasificar". */}
              <select value={detail.foodType} onChange={(e) => handleChangeFoodType(e.target.value)}>
                <option value="">
                  {mode === 'alimentacion' ? `Automático (${classifyFoodType(detail.name).label})` : 'Sin clasificar'}
                </option>
                {foodTypes
                  .filter((t) => t.kind === mode)
                  .map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.icon} {t.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {showFoodTypesModal && (
        <ProductTypesModal
          types={foodTypes}
          initialKind={mode}
          onClose={() => setShowFoodTypesModal(false)}
          onChanged={reloadFoodTypes}
        />
      )}

      {addingToList && (
        <div className="modal-overlay" onClick={() => setAddingToList(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                ¿En qué tienda?
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setAddingToList(null)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Añadir "{addingToList.name}" a la lista de la compra.
            </p>
            <div className="event-list">
              {stores.map((s) => (
                <div
                  key={s.id}
                  className="card task-card store-picker-option"
                  role="button"
                  tabIndex={0}
                  onClick={() => confirmAddToList(s.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') confirmAddToList(s.name)
                  }}
                >
                  <StoreIcon name={s.name} size={20} />
                  <span>{s.name}</span>
                </div>
              ))}
              <div
                className="card task-card store-picker-option"
                role="button"
                tabIndex={0}
                onClick={() => confirmAddToList(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') confirmAddToList(null)
                }}
              >
                🏬 <span>Sin tienda concreta</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
