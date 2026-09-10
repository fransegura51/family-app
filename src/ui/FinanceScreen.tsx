import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  addExpense,
  addWalletTransaction,
  createBudget,
  createBudgetCategoriesBulk,
  createBudgetCategory,
  createGoal,
  createTag,
  deleteBudget,
  deleteBudgetCategory,
  deleteExpense,
  deleteGoal,
  deleteTag,
  deleteWalletTransaction,
  listBudgetCategories,
  listBudgets,
  listExpenses,
  listGoals,
  listTags,
  listWalletTransactions,
  reorderBudgetCategories,
  updateBudgetCategory,
  updateExpense,
  updateTag,
} from '@/data/finance'
import {
  disconnectBank,
  listAspsps,
  listBankAccounts,
  listBankConnections,
  listBankTransactions,
  startBankConnection,
  syncBankTransactions,
  type Aspsp,
} from '@/data/bank'
import { getFinanceMonthStartDay, listFamilyMembers } from '@/data/family'
import {
  economiaMenuEntryMeta,
  isCustomEconomiaMenuKey,
  loadEconomiaMenuLayout,
  saveEconomiaMenuLayout,
  type EconomiaMenuEntry,
  type EconomiaMenuGroup,
  type EconomiaMenuItemKey,
} from '@/state/economiaMenu'
import { createShoppingStore, listShoppingStores } from '@/data/shoppingStores'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { deleteReceipt, getReceiptUrl, listReceipts, updateReceipt, uploadReceipt } from '@/data/receipts'
import { listAllProductPrices, listProducts } from '@/data/products'
import { buildFoodReceiptIds, isFoodPurchase } from '@/domain/products'
import { averagePricesByMonth, compareMonths, decomposeSpendChange, type RawPurchase } from '@/domain/priceTrends'
import {
  deleteProductPricesByReceipt,
  listProductPricesByReceipt,
  recordProductPurchase,
  type ReceiptLineDetail,
} from '@/data/products'
import {
  budgetPeriodRange,
  budgetSpent,
  isFoodCategory,
  isInternalTransferCategory,
  resolveCategoryClassification,
  resolveExpenseFixed,
  walletBalance,
  walletCategoryTotal,
} from '@/domain/finance'
import { MONTH_LABELS } from '@/domain/calendar'
import { PRESET_LABELS, rangeForPreset, toDateStr, type SpendRangePreset } from '@/domain/dateRanges'
import { findKnownStore } from '@/domain/voiceQuery'
import { analyzeReceiptPhoto } from '@/services/receiptPhoto'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import { StoreIcon } from '@/ui/StoreIcon'
import type {
  BankAccount,
  BankConnection,
  Budget,
  BudgetCategory,
  BudgetPeriod,
  Expense,
  ExpenseSource,
  FamilyMember,
  KidGoal,
  KidWalletTransaction,
  Receipt,
  Tag,
  WalletTransactionType,
} from '@/domain/types'
import economiaHeaderImg from '@/assets/economia/economia-header.jpg'

// Tickets y Registro Alimentación se mudan a Compras (petición real:
// "estoy pensando si pasar registro alimentación y tickets a compra")
// — Economía se queda solo con el dinero en sí (Gastos, Presupuesto,
// Educación financiera). Sus componentes (ReceiptsTab, BudgetsTab)
// siguen definidos en este archivo y se exportan para que
// ShoppingScreen los use, en vez de duplicar todo el código de
// tickets/categorías en dos sitios.
//
// Skill de Pepa, punto 3: "Resumen · Conclusiones de Pepa ·
// Estadísticas · Movimientos · Presupuesto General · Educación
// Financiera". Resumen y Conclusiones se combinan en una sola pestaña
// (van siempre juntas, mismo periodo, misma pantalla) en vez de dos
// pestañas casi vacías por separado.
const SUB_TABS = ['Resumen', 'Estadísticas', 'Movimientos', 'Presupuesto Generales', 'Banco', 'Educación financiera'] as const
type SubTab = (typeof SUB_TABS)[number]

// El desplegable de Economía mezcla pestañas (SubTab) con accesos
// sueltos ("accion:categorias"...) en la misma lista — este guard
// distingue cuáles de sus claves son de verdad una pestaña (para el
// "📌 Sacar/📍 Quitar" y resaltar la activa, ver EconomiaMenuDropdown).
function isEconomiaSubTab(key: EconomiaMenuItemKey): key is SubTab {
  return (SUB_TABS as readonly string[]).includes(key)
}

// Petición real: "quiero que los quites de ahí [debajo de las
// tarjetas del banco]... lo metes dentro del desplegable, y le pones
// un botón para sacar alguno de ellos... que pica el botón y se sale
// directamente [a] la pantalla de Economía, donde están situados
// ahora" — mismo concepto que los 4 iconos fijos del ☰ Menú global
// (PINNED_COUNT), pero aquí sin límite fijo: nada visible fuera del
// desplegable por defecto, la familia decide qué sacar. Luego: "las
// tres pestañas [Categorías/Etiquetas/Nuevo movimiento] ponle también
// el botón de sacar y meter" — no solo las 6 pestañas, cualquier
// acceso del desplegable se puede sacar. Guardado en el dispositivo
// (como el orden del menú), no por familia.
const ECONOMIA_PINNED_KEY = 'familyapp:economia-pinned-tabs'
const ECONOMIA_FIXED_KEYS: readonly string[] = [...SUB_TABS, 'accion:categorias', 'accion:etiquetas', 'accion:movimiento']

// Los accesos personalizados ("custom:<id>") no están en ninguna lista
// fija — se validan por forma en vez de por pertenencia, para que
// también se puedan sacar/meter (petición real: "ponle también el
// botón de sacar y meter" ya se aplicó a los 3 accesos fijos; los
// personalizados nuevos siguen la misma regla).
function isValidEconomiaMenuKey(k: unknown): k is EconomiaMenuItemKey {
  return typeof k === 'string' && (ECONOMIA_FIXED_KEYS.includes(k) || k.startsWith('custom:'))
}

function loadEconomiaPinnedItems(): EconomiaMenuItemKey[] {
  try {
    const raw = localStorage.getItem(ECONOMIA_PINNED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isValidEconomiaMenuKey) : []
  } catch {
    return []
  }
}

function saveEconomiaPinnedItems(items: EconomiaMenuItemKey[]) {
  try {
    localStorage.setItem(ECONOMIA_PINNED_KEY, JSON.stringify(items))
  } catch {
    // Sin localStorage (privado/bloqueado) — se queda todo dentro del
    // desplegable, no rompe nada.
  }
}

// Skill de Pepa, punto 24: "Ver X registros →" tiene que abrir
// Movimientos filtrado EXACTAMENTE con el conjunto que produjo el
// dato — se comparte este estado entre Estadísticas y Movimientos en
// vez de duplicar la lógica de filtrado en cada estadística.
export interface MovementsFilter {
  label: string
  from?: string
  to?: string
  category?: string
  // Una categoría con subcategorías (p. ej. "Compras y familia") no
  // tiene gastos con ese nombre EXACTO casi nunca — los gastos están
  // en sus hijas ("Ropa y accesorios", "Niños"...). "Ver movimientos"
  // de una categoría así tiene que incluir toda la familia, no solo
  // los apuntados directamente a la categoría padre sin subcategoría.
  categoryGroup?: string[]
  store?: string
  tagId?: string
  necessity?: 'debo' | 'necesito' | 'quiero'
  isFixed?: boolean
  isIncome?: boolean
}

export function FinanceScreen() {
  const [tab, setTab] = useState<SubTab>('Resumen')
  const [movementsFilter, setMovementsFilter] = useState<MovementsFilter | null>(null)
  // Petición real: "al tocar un área del dónut no debe llevarme
  // directamente a los movimientos filtrados... desde los movimientos
  // filtrados quiero poder volver a la vista anterior" — se recuerda
  // desde qué pestaña se saltó para poder deshacer el salto, no solo
  // quitar el filtro (que te deja en Movimientos igualmente).
  const [previousTab, setPreviousTab] = useState<SubTab | null>(null)
  // Categorías y etiquetas se cargan aquí, una vez, para que los 3
  // botones flotantes (Categorías / Etiquetas / Nuevo movimiento) estén
  // disponibles en cualquier pestaña de Economía — petición real: "cada
  // vez que quiero hacer una de esas 3 cosas no me acuerdo en qué
  // página está el botón". Cada pestaña sigue cargando sus propios
  // gastos/categorías para sus cálculos; `refreshKey` solo fuerza a la
  // pestaña activa a remontarse (y recargar sus datos) cuando algo
  // cambia desde uno de estos 3 modales.
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCategories, setShowCategories] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [showNewMovement, setShowNewMovement] = useState(false)
  // Petición real: "no me has puesto para poder agregar cuentas a esa
  // pantalla" — "+ Añadir cuenta" en las tarjetas de saldo manda a
  // Banco y abre directamente su formulario de conectar, aunque esa
  // pestaña ya estuviera montada de antes (por eso un contador, no un
  // booleano: cada toque es una señal nueva).
  const [openConnectSignal, setOpenConnectSignal] = useState(0)
  // Petición real: "cuando pulse al recuadro [de una cuenta] me tiene
  // que llevar a la pestaña de esa cuenta, si hay otra cuenta que me
  // lleve a la de la otra cuenta" — cada tarjeta manda a Banco ya
  // filtrado a esa cuenta en concreto.
  const [focusAccountId, setFocusAccountId] = useState<string | null>(null)
  // Petición real: "donde ahora pone Economía, pones el círculo con
  // las tres rayas... es un desplegable de todos los demás categorías,
  // y ese lo deja con las categorías que tenía antes" — desplegable
  // propio de Economía (☰ junto al título, igual que "☰ Inicio" en la
  // referencia de Wallet) con las mismas pestañas que ya tenía esta
  // pantalla (Resumen/Estadísticas/Movimientos/...), como forma
  // alternativa de cambiar de pestaña sin tocar la fila de chips.
  const [economiaMenuOpen, setEconomiaMenuOpen] = useState(false)
  const [pinnedItems, setPinnedItems] = useState<EconomiaMenuItemKey[]>(() => loadEconomiaPinnedItems())
  // Petición real: "¿cómo puedo crear un acceso nuevo, con su propio
  // nombre e icono, no solo una carpeta para agrupar los que ya hay?"
  // — el layout (grupos + accesos, fijos o personalizados) vive aquí
  // arriba para que tanto el desplegable como la fila de "sacados"
  // (que necesita el icono/nombre real de un acceso personalizado)
  // lean del mismo sitio.
  const [menuLayout, setMenuLayout] = useState<EconomiaMenuGroup[]>(() => loadEconomiaMenuLayout())
  const [pinnedPlaceholderNotice, setPinnedPlaceholderNotice] = useState(false)

  function persistMenuLayout(next: EconomiaMenuGroup[]) {
    setMenuLayout(next)
    saveEconomiaMenuLayout(next)
  }

  function togglePinnedItem(key: EconomiaMenuItemKey) {
    setPinnedItems((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      saveEconomiaPinnedItems(next)
      return next
    })
  }

  function handleEconomiaAction(key: EconomiaMenuItemKey) {
    if (key === 'accion:categorias') setShowCategories(true)
    else if (key === 'accion:etiquetas') setShowTags(true)
    else if (key === 'accion:movimiento') setShowNewMovement(true)
    else if (isEconomiaSubTab(key)) setTab(key)
    // Un acceso personalizado no lleva a ningún sitio todavía — el
    // propio EconomiaMenuDropdown enseña el aviso "aún no hay nada
    // aquí" al tocarlo.
  }

  const flatMenuEntries = menuLayout.flatMap((g) => g.items)

  function reloadShared() {
    Promise.all([listBudgetCategories(), listTags()]).then(([c, t]) => {
      setCategories(c)
      setTags(t)
    })
  }

  useEffect(reloadShared, [])

  function handleChanged() {
    reloadShared()
    setRefreshKey((k) => k + 1)
  }

  function viewMovements(filter: MovementsFilter) {
    setPreviousTab((prev) => (tab === 'Movimientos' ? prev : tab))
    setMovementsFilter(filter)
    setTab('Movimientos')
  }

  return (
    <div className="screen">
      {/* Petición real, con imagen de referencia: "y la de Economía"
          (mismo tratamiento de foto que las demás cabeceras) — "aquí
          tendrás que bajar los botones de las cuentas por debajo de la
          cabecera y desplazar también el resto de la página para
          ajustar bien todo": las tarjetas de cuenta ya no van DENTRO
          de la cabecera de color de antes (esa desaparece con la
          foto), pasan a su propio bloque justo debajo, sobre el fondo
          normal de la página. */}
      <div className="kitchen-header">
        <img src={economiaHeaderImg} alt="Economía" className="kitchen-header-img" />
        <button
          type="button"
          className="kitchen-header-menu-fab"
          onClick={() => setEconomiaMenuOpen((v) => !v)}
          aria-label={economiaMenuOpen ? 'Cerrar menú de Economía' : 'Abrir menú de Economía'}
        >
          {economiaMenuOpen ? '✕' : '☰'} Menú
        </button>
      </div>
      {economiaMenuOpen && (
        <EconomiaMenuDropdown
          activeTab={tab}
          layout={menuLayout}
          onLayoutChange={persistMenuLayout}
          pinnedItems={pinnedItems}
          onTogglePin={togglePinnedItem}
          onActivate={handleEconomiaAction}
          onClose={() => setEconomiaMenuOpen(false)}
        />
      )}
      <AccountBalanceCards
        key={`${tab}-${refreshKey}`}
        onAddAccount={() => {
          setOpenConnectSignal((n) => n + 1)
          setTab('Banco')
        }}
        onSelectAccount={(accountId) => {
          setFocusAccountId(accountId)
          setTab('Banco')
        }}
        onViewAll={() => setTab('Banco')}
      />

      {/* Petición real: "quiero que los quites de ahí [debajo de las
          tarjetas del banco]" — ya no hay una fila fija; solo aparece
          aquí lo que la familia haya sacado del desplegable con "📌
          Sacar" (pestañas o los 3 accesos, "ponle también el botón de
          sacar y meter"). */}
      {pinnedItems.length > 0 && (
        <div className="filter-row">
          {flatMenuEntries
            .filter((entry) => pinnedItems.includes(entry.key))
            .map((entry) => {
              const meta = economiaMenuEntryMeta(entry)
              return (
                <button
                  key={entry.key}
                  type="button"
                  className={'chip' + (isEconomiaSubTab(entry.key) && tab === entry.key ? ' chip-active' : '')}
                  onClick={() => {
                    if (isCustomEconomiaMenuKey(entry.key)) {
                      setPinnedPlaceholderNotice(true)
                      setTimeout(() => setPinnedPlaceholderNotice(false), 2500)
                    } else {
                      handleEconomiaAction(entry.key)
                    }
                  }}
                >
                  {meta.icon} {meta.label}
                </button>
              )
            })}
        </div>
      )}
      {pinnedPlaceholderNotice && (
        <p className="muted" style={{ fontSize: 12 }}>
          Todavía no hay nada aquí — pídemelo cuando lo necesites y lo construyo.
        </p>
      )}

      {tab === 'Resumen' && <ResumenTab key={refreshKey} onViewMovements={viewMovements} />}
      {tab === 'Estadísticas' && <EstadisticasTab key={refreshKey} onViewMovements={viewMovements} />}
      {tab === 'Movimientos' && (
        <ExpensesTab
          key={refreshKey}
          filter={movementsFilter}
          onClearFilter={() => setMovementsFilter(null)}
          previousTabLabel={previousTab}
          onBack={
            previousTab
              ? () => {
                  setTab(previousTab)
                  setPreviousTab(null)
                  setMovementsFilter(null)
                }
              : undefined
          }
        />
      )}
      {tab === 'Presupuesto Generales' && (
        <BudgetsTab key={refreshKey} group="generales" seedCategories={MASTER_CATEGORY_SEED} />
      )}
      {tab === 'Banco' && <BankTab key={refreshKey} openConnectSignal={openConnectSignal} focusAccountId={focusAccountId} />}
      {tab === 'Educación financiera' && <KidsFinanceTab />}

      {showCategories && (
        <CategoriesModal categories={categories} onClose={() => setShowCategories(false)} onChanged={handleChanged} />
      )}
      {showTags && <TagsModal tags={tags} onClose={() => setShowTags(false)} onChanged={handleChanged} />}
      {showNewMovement && (
        <NewMovementModal
          categories={categories}
          onClose={() => setShowNewMovement(false)}
          onAdded={() => {
            setShowNewMovement(false)
            handleChanged()
          }}
        />
      )}
    </div>
  )
}

// Petición real: "esa pestaña dentro de Inicio del desplegable quiero
// que se puedan editar y que se puedan cambiar de posición... más
// arriba, más abajo, agruparla como quiera... por categoría" — y
// después: "me tienes que poner en el desplegable un botón para añadir
// categorías, que yo pueda añadir categorías y editarlas". Modo normal
// (toca = cambia de pestaña o abre la acción) vs modo edición (✏️
// arriba): ↑/↓ para reordenar dentro de su categoría, un desplegable
// para moverlo a otra, y "+ Nueva categoría" para crear encabezados con
// nombre propio (ver src/state/economiaMenu.ts, guardado en el
// dispositivo). Los 3 accesos que antes eran botones flotantes
// (Categorías/Etiquetas/Nuevo movimiento) viven aquí también.
function EconomiaMenuDropdown({
  activeTab,
  layout,
  onLayoutChange,
  pinnedItems,
  onTogglePin,
  onActivate,
  onClose,
}: {
  activeTab: SubTab
  layout: EconomiaMenuGroup[]
  onLayoutChange: (next: EconomiaMenuGroup[]) => void
  pinnedItems: EconomiaMenuItemKey[]
  onTogglePin: (key: EconomiaMenuItemKey) => void
  onActivate: (key: EconomiaMenuItemKey) => void
  onClose: () => void
}) {
  const [editMode, setEditMode] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [addingGroupName, setAddingGroupName] = useState('')
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Petición real: "¿cómo puedo crear un acceso nuevo, con su propio
  // nombre e icono, no solo una carpeta para agrupar los que ya hay?"
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

  function moveItemToGroup(itemKey: EconomiaMenuItemKey, fromGroupId: string, toGroupId: string) {
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

  // El primer grupo nunca desaparece (es el que recoge los accesos de
  // cualquier categoría que se borre), así que siempre queda un sitio
  // donde vivir para todos los accesos.
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
    const entry: EconomiaMenuEntry = { key: `custom:${crypto.randomUUID()}`, icon: newItemIcon, label: newItemLabel.trim() }
    onLayoutChange(layout.map((g, i) => (i === 0 ? { ...g, items: [...g.items, entry] } : g)))
    setNewItemIcon('📌')
    setNewItemLabel('')
    setAddingCustomItem(false)
  }

  function handleSaveItem(groupId: string, key: EconomiaMenuItemKey) {
    onLayoutChange(
      layout.map((g) =>
        g.id === groupId
          ? { ...g, items: g.items.map((it) => (it.key === key ? { ...it, icon: editItemIcon, label: editItemLabel.trim() || it.label } : it)) }
          : g,
      ),
    )
    setEditingItemKey(null)
  }

  function deleteItem(groupId: string, key: EconomiaMenuItemKey) {
    onLayoutChange(layout.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((it) => it.key !== key) } : g)))
  }

  function handleItemActivate(entry: EconomiaMenuEntry) {
    if (isCustomEconomiaMenuKey(entry.key)) {
      // Petición real (antes, para el ☰ global, ahora aquí): un acceso
      // personalizado no lleva a ningún sitio todavía — se avisa sin
      // cerrar el desplegable, en vez de un toque que no hace nada.
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
            const meta = economiaMenuEntryMeta(entry)
            const isTab = isEconomiaSubTab(entry.key)
            const isCustom = isCustomEconomiaMenuKey(entry.key)

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
                    {/* Petición real: "¿cómo la puedo... editar, quitar?"
                        — solo los accesos personalizados se pueden
                        renombrar/borrar, los 9 fijos son secciones
                        reales de la app. */}
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
                    aria-label={pinnedItems.includes(entry.key) ? `Quitar ${meta.label} de la pantalla de Economía` : `Sacar ${meta.label} a la pantalla de Economía`}
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

// Petición real: "debajo de Economía Pepa me vas a poner tarjetas de
// saldo con las cuentas de los bancos que te vayamos añadiendo, que se
// puedan poner más o menos, que se puedan añadir o quitar, como está
// en la foto [captura de la app Wallet]" — una tarjeta por cada cuenta
// bancaria enlazada; crecen o decrecen solas al conectar/desconectar
// un banco en la pestaña Banco, sin nada más que tocar aquí. El saldo
// lo trae la propia sincronización (enable-banking-sync-transactions →
// syncBalance) — si una cuenta todavía no se ha sincronizado nunca, se
// avisa en vez de inventar un 0.
// Petición real, con captura de referencia exacta (app Wallet, pantalla
// "Mis cuentas en Wallet"): rejilla de 2 columnas, cada cuenta en un
// color sólido distinto (no una tira que se desliza de lado, ni todas
// del mismo azul degradado como antes).
const ACCOUNT_CARD_COLORS = ['#2f6e6e', '#4a5568', '#0f6b4c', '#4a90d9', '#8854d0', '#c0392b']

function AccountBalanceCards({
  onAddAccount,
  onSelectAccount,
  onViewAll,
}: {
  onAddAccount: () => void
  onSelectAccount: (accountId: string) => void
  onViewAll: () => void
}) {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [connections, setConnections] = useState<BankConnection[]>([])

  useEffect(() => {
    Promise.all([listBankAccounts(), listBankConnections()])
      .then(([a, c]) => {
        setAccounts(a)
        setConnections(c)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="account-cards-block">
      <div className="account-cards-heading">
        <strong>Mis cuentas</strong>
        <button type="button" className="account-cards-view-all" onClick={onViewAll} aria-label="Ver todas las cuentas">
          ›
        </button>
      </div>
      <div className="account-cards-grid">
        {accounts.map((a, i) => {
          const bankName = connections.find((c) => c.id === a.connectionId)?.aspspName ?? 'Banco'
          return (
            <button
              key={a.id}
              type="button"
              className="account-card"
              style={{ background: ACCOUNT_CARD_COLORS[i % ACCOUNT_CARD_COLORS.length] }}
              onClick={() => onSelectAccount(a.id)}
            >
              <div className="account-card-bank">🏦 {bankName}</div>
              <div className="account-card-name">{a.iban ? `•• ${a.iban.slice(-4)}` : a.name ?? 'Cuenta'}</div>
              <div className="account-card-balance">{a.balance != null ? `${a.balance.toFixed(2)} €` : 'Sincronizando…'}</div>
            </button>
          )
        })}
        {/* Petición real: "no me has puesto para poder agregar cuentas
            a esa pantalla" — entrada directa al formulario de conectar
            banco (ya en Banco), sin tener que saber que vive ahí. */}
        <button type="button" className="account-card account-card-add" onClick={onAddAccount}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          <span>Añadir cuenta</span>
        </button>
      </div>
    </div>
  )
}

// Skill de Pepa, punto 22: enlazar cuentas bancarias reales (varias
// por familia) — mismo patrón que Google Calendar (startGoogleConnect
// redirige, la vuelta ocurre en enable-banking-auth-callback con
// ?bank=connected|error). Los movimientos importados alimentan
// Movimientos (source='banco', módulo de conciliación con tickets
// pendiente aparte).
function BankTab({
  openConnectSignal,
  focusAccountId,
}: {
  openConnectSignal?: number
  focusAccountId?: string | null
} = {}) {
  const [connections, setConnections] = useState<BankConnection[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  // Petición real: la lista tiene que verse y editarse igual que
  // Movimientos (fecha, detalle, importe, categoría y etiqueta
  // editables) — no el texto suelto del banco. Cada movimiento del
  // banco ya está enlazado a un gasto real (bank_transactions.matched_expense_id,
  // ver enable-banking-sync-transactions), así que se muestra y se
  // edita ESE gasto, reutilizando el mismo EditExpenseInline de Movimientos.
  const [linkedExpenses, setLinkedExpenses] = useState<Expense[]>([])
  // Petición real: "cuando pulse al recuadro [de una cuenta] me tiene
  // que llevar a la pestaña de esa cuenta... si hay otra cuenta que me
  // lleve a la de la otra cuenta" — con varias cuentas enlazadas, cada
  // tarjeta de saldo filtra aquí a SU cuenta en vez de mezclar los
  // movimientos de todas. expenseAccountId hace de puente porque
  // linkedExpenses (Movimientos reales) no lleva de por sí a qué
  // cuenta de banco pertenece, solo bank_transactions lo sabe.
  const [expenseAccountId, setExpenseAccountId] = useState<Map<string, string>>(new Map())
  const [activeAccountId, setActiveAccountId] = useState<string | null>(focusAccountId ?? null)
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [showConnect, setShowConnect] = useState(false)
  // Solo importa para la primera sincronización de cada cuenta — a
  // partir de ahí cada sincronización (manual o del cron 4 veces al
  // día, ver 0077_schedule_bank_sync.sql) es incremental de verdad,
  // solo trae lo nuevo desde el último movimiento ya guardado.
  const [syncDays, setSyncDays] = useState(90)
  // Petición real: "en banco dijimos de poder filtrar por fechas pero
  // no veo ningún filtro" — misma pestaña "📅 Fecha" desplegable que
  // Resumen/Estadísticas/Presupuesto, aquí sobre los movimientos ya
  // enlazados a gastos.
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  // Petición real: "que me pongas una pestaña que sea gastos fijos,
  // gastos variables... y que me pongas para poder filtrar por
  // ingresos... para saber cuánto tenemos de cada" — Fijo/Variable se
  // resuelve por movimiento (resolveExpenseFixed: categoría, o el
  // propio movimiento si lo has marcado a mano en su edición).
  const [typeFilter, setTypeFilter] = useState<'todos' | 'fijos' | 'variables' | 'ingresos'>('todos')
  const [monthStartDay, setMonthStartDay] = useState(1)
  const [visibleCount, setVisibleCount] = useState(50)

  // Petición real: "no me has puesto para poder agregar cuentas a esa
  // pantalla" — el botón "+ Añadir cuenta" de las tarjetas de saldo
  // (arriba de Economía) manda aquí y abre este formulario solo,
  // aunque la pestaña Banco ya estuviera montada de antes.
  const lastConnectSignalRef = useRef(openConnectSignal)
  useEffect(() => {
    if (openConnectSignal != null && openConnectSignal !== lastConnectSignalRef.current) {
      lastConnectSignalRef.current = openConnectSignal
      setShowConnect(true)
    }
  }, [openConnectSignal])

  // Idem para el filtro por cuenta: si Banco ya estaba montado y se
  // toca otra tarjeta de saldo, hay que volver a aplicar el filtro
  // aunque el valor técnicamente ya se recibiera una vez antes.
  const lastFocusAccountRef = useRef(focusAccountId)
  useEffect(() => {
    if (focusAccountId !== undefined && focusAccountId !== lastFocusAccountRef.current) {
      lastFocusAccountRef.current = focusAccountId
      setActiveAccountId(focusAccountId)
    }
  }, [focusAccountId])

  useEffect(() => {
    setVisibleCount(50)
  }, [preset, customFrom, customTo, typeFilter, activeAccountId])

  function reload() {
    setLoading(true)
    Promise.all([
      listBankConnections(),
      listBankAccounts(),
      listBankTransactions(),
      listExpenses(),
      listBudgetCategories(),
      listTags(),
      getFinanceMonthStartDay(),
    ])
      .then(([c, a, t, allExpenses, cats, tgs, monthStart]) => {
        setConnections(c)
        setAccounts(a)
        setCategories(cats)
        setTags(tgs)
        setMonthStartDay(monthStart)
        const matchedIds = new Set(t.map((bt) => bt.matchedExpenseId).filter((id): id is string => !!id))
        setLinkedExpenses(allExpenses.filter((e) => matchedIds.has(e.id)).sort((a, b) => b.expenseDate.localeCompare(a.expenseDate)))
        setExpenseAccountId(new Map(t.filter((bt) => bt.matchedExpenseId).map((bt) => [bt.matchedExpenseId as string, bt.accountId])))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // Enable Banking trae de vuelta aquí con ?bank=connected|error tras
    // el consentimiento — se lee una vez y se limpia de la URL para que
    // un refresco de página no lo vuelva a mostrar.
    const params = new URLSearchParams(window.location.search)
    const result = params.get('bank')
    if (result === 'connected') setNotice('✓ Banco conectado.')
    else if (result === 'error') setNotice(`No se pudo conectar (${params.get('detail') ?? 'error'}).`)
    if (result) {
      params.delete('bank')
      params.delete('detail')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
    reload()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true)
    setError(null)
    try {
      const result = await syncBankTransactions(syncDays)
      setNotice(`✓ ${result.totalSynced} movimiento${result.totalSynced === 1 ? '' : 's'} sincronizado${result.totalSynced === 1 ? '' : 's'}.`)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <p className="muted">Cargando cuentas bancarias…</p>

  const activeConnections = connections.filter((c) => c.status === 'active')
  const [from, to] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  const byAccount = activeAccountId
    ? linkedExpenses.filter((e) => expenseAccountId.get(e.id) === activeAccountId)
    : linkedExpenses
  const dateFilteredExpenses = byAccount.filter((e) => e.expenseDate >= from && e.expenseDate <= to)
  const filteredExpenses = dateFilteredExpenses.filter((e) => {
    if (typeFilter === 'todos') return true
    if (typeFilter === 'ingresos') return e.isIncome || isInternalTransferCategory(e.category, categories)
    if (e.isIncome) return false
    const isFixed = resolveExpenseFixed(e, categories)
    return typeFilter === 'fijos' ? isFixed === true : isFixed !== true
  })
  const typeFilterTotal = filteredExpenses.reduce((sum, e) => sum + e.amount, 0)
  const activeAccountLabel = activeAccountId
    ? (() => {
        const acc = accounts.find((a) => a.id === activeAccountId)
        const bankName = connections.find((c) => c.id === acc?.connectionId)?.aspspName
        return acc ? `${bankName ?? 'Banco'} · ${acc.iban ? `•• ${acc.iban.slice(-4)}` : (acc.name ?? 'Cuenta')}` : null
      })()
    : null

  return (
    <div>
      {notice && <p className="points-badge">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {activeConnections.length === 0 ? (
        <p className="muted">
          Todavía no hay ningún banco enlazado. Al enlazar una cuenta, sus movimientos se pueden traer aquí y
          usarlos en Economía junto con los tickets.
        </p>
      ) : (
        activeConnections.map((c) => {
          const connAccounts = accounts.filter((a) => a.connectionId === c.id)
          return (
            <div key={c.id} className="card event-card" style={{ marginBottom: 8 }}>
              <strong>🏦 {c.aspspName}</strong>
              <p className="muted" style={{ margin: '4px 0' }}>
                {connAccounts.length} {connAccounts.length === 1 ? 'cuenta' : 'cuentas'}
                {c.validUntil && ` · válido hasta ${c.validUntil.slice(0, 10)}`}
              </p>
              {/* Caso real (Caja Rural Central / Ruralvía): el banco autoriza el
                  permiso pero no dice a qué cuenta si no se le indica el IBAN —
                  antes esto se quedaba en "0 cuentas" sin ninguna pista de qué
                  hacer. Comprobado en la API de Enable Banking: la sesión queda
                  AUTHORIZED con accounts: [] y access.accounts: null. */}
              {connAccounts.length === 0 && (
                <p className="error" style={{ margin: '4px 0', fontSize: 13 }}>
                  El banco ha autorizado el acceso pero no ha dicho a qué cuenta. Desconecta esta conexión y vuelve a
                  conectar escribiendo el <strong>IBAN</strong> de la cuenta en el campo opcional (recarga la página antes
                  si no ves ese campo).
                </p>
              )}
              {connAccounts.map((a) => (
                <p key={a.id} className="muted" style={{ margin: '2px 0', fontSize: 13 }}>
                  · {a.name ?? 'Cuenta'} {a.iban ? `(${a.iban})` : ''} {a.currency ?? ''}
                </p>
              ))}
              <ConfirmButton
                label="Desconectar"
                confirmLabel="¿Seguro?"
                className="link-button"
                onConfirm={() => disconnectBank(c.id).then(reload)}
              />
            </div>
          )
        })
      )}

      {activeConnections.length > 0 && (
        <>
          <div className="inline-fields" style={{ alignItems: 'center' }}>
            <button type="button" onClick={handleSync} disabled={syncing} style={{ flex: 'none' }}>
              {syncing ? 'Sincronizando…' : '🔄 Sincronizar movimientos'}
            </button>
            <select value={syncDays} onChange={(e) => setSyncDays(Number(e.target.value))} style={{ flex: 'none' }}>
              <option value={30}>Traer al menos: último mes</option>
              <option value={90}>Traer al menos: últimos 3 meses</option>
              <option value={365}>Traer al menos: último año</option>
              <option value={0}>Traer al menos: todo el histórico</option>
            </select>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Se sincroniza sola 4 veces al día trayendo solo lo nuevo. Para ampliar hacia atrás elige aquí un periodo
            más largo y pulsa "Sincronizar" — pero el banco solo entrega el histórico que él mismo tenga disponible
            para consultar, aunque se pida más.
          </p>
        </>
      )}

      <button type="button" className="link-button" onClick={() => setShowConnect((v) => !v)}>
        {showConnect ? 'Cerrar' : '+ Conectar banco'}
      </button>
      {showConnect && (
        <ConnectBankForm
          connecting={connecting}
          onConnecting={setConnecting}
          onError={(msg) => setError(msg)}
        />
      )}

      {linkedExpenses.length > 0 && (
        <>
          <p className="muted" style={{ marginTop: 16, fontWeight: 600 }}>
            Movimientos del banco ({filteredExpenses.length} de {linkedExpenses.length})
          </p>
          <p className="muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
            Cada uno se categoriza solo. Toca uno para editar su categoría o etiqueta — es el mismo movimiento que
            aparece en Movimientos.
          </p>
          {activeAccountLabel && (
            <div className="card event-card" style={{ marginBottom: 8 }}>
              <strong>Cuenta: {activeAccountLabel}</strong>
              <button type="button" className="link-button" onClick={() => setActiveAccountId(null)}>
                ✕ Ver todas las cuentas
              </button>
            </div>
          )}
          <DateFilterTab
            preset={preset}
            onPresetChange={setPreset}
            customFrom={customFrom}
            onCustomFromChange={setCustomFrom}
            customTo={customTo}
            onCustomToChange={setCustomTo}
          />
          {/* Petición real: "que me pongas una pestaña que sea gastos
              fijos, gastos variables... y también poder filtrar por
              ingresos... para saber cuánto tenemos de cada". */}
          <div className="filter-row" style={{ marginTop: 8 }}>
            <button type="button" className={'chip' + (typeFilter === 'todos' ? ' chip-active' : '')} onClick={() => setTypeFilter('todos')}>
              Todos
            </button>
            <button type="button" className={'chip' + (typeFilter === 'fijos' ? ' chip-active' : '')} onClick={() => setTypeFilter('fijos')}>
              Gastos fijos
            </button>
            <button type="button" className={'chip' + (typeFilter === 'variables' ? ' chip-active' : '')} onClick={() => setTypeFilter('variables')}>
              Gastos variables
            </button>
            <button type="button" className={'chip' + (typeFilter === 'ingresos' ? ' chip-active' : '')} onClick={() => setTypeFilter('ingresos')}>
              Ingresos
            </button>
          </div>
          {typeFilter !== 'todos' && (
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Total {typeFilter === 'fijos' ? 'fijo' : typeFilter === 'variables' ? 'variable' : 'de ingresos'}: <strong>{typeFilterTotal.toFixed(2)} €</strong>
            </p>
          )}
          <div className="price-row-list">
            {filteredExpenses.length === 0 && <p className="muted">Ningún movimiento en este periodo.</p>}
            {filteredExpenses.slice(0, visibleCount).map((e) =>
              editingId === e.id ? (
                <EditExpenseInline
                  key={e.id}
                  expense={e}
                  categories={categories}
                  tags={tags}
                  onDone={() => {
                    setEditingId(null)
                    reload()
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <MovementRow
                  key={e.id}
                  expense={e}
                  category={categories.find((c) => c.name === e.category)}
                  tag={tags.find((t) => t.id === e.tagId)}
                  onClick={() => setEditingId(e.id)}
                />
              ),
            )}
          </div>
          {/* Petición real: "no puedo ver los movimientos antes del
              24/08 pero sí que hay movimientos anteriores... ¿hay algún
              límite de página?" — el corte fijo de 50 se llevaba los más
              antiguos del periodo por delante en vez de avisar. */}
          {filteredExpenses.length > visibleCount && (
            <button type="button" className="link-button" onClick={() => setVisibleCount((n) => n + 50)}>
              Ver {Math.min(50, filteredExpenses.length - visibleCount)} más ({filteredExpenses.length - visibleCount} restantes)
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ConnectBankForm({
  connecting,
  onConnecting,
  onError,
}: {
  connecting: boolean
  onConnecting: (v: boolean) => void
  onError: (msg: string) => void
}) {
  const [country, setCountry] = useState('ES')
  const [aspsps, setAspsps] = useState<Aspsp[]>([])
  const [loadingAspsps, setLoadingAspsps] = useState(false)
  const [selected, setSelected] = useState('')
  // IBAN opcional — caso real: Caja Rural Central (hub Ruralvía) autoriza
  // el consentimiento "global" pero devuelve 0 cuentas; con el IBAN se
  // pide acceso a esa cuenta concreta, que sí devuelve (ver bank.ts).
  const [iban, setIban] = useState('')

  function loadAspsps(c: string) {
    setLoadingAspsps(true)
    setSelected('')
    listAspsps(c)
      .then(setAspsps)
      .catch((err: Error) => onError(err.message))
      .finally(() => setLoadingAspsps(false))
  }

  useEffect(() => loadAspsps(country), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    if (!selected) return
    const aspsp = aspsps.find((a) => a.name === selected)
    if (!aspsp) return
    onConnecting(true)
    onError('')
    try {
      await startBankConnection(aspsp.name, aspsp.country, iban)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
      onConnecting(false)
    }
  }

  return (
    <div className="card member-form">
      <label>
        País
        <select
          value={country}
          onChange={(e) => {
            setCountry(e.target.value)
            loadAspsps(e.target.value)
          }}
        >
          <option value="ES">España</option>
          <option value="FI">Finlandia</option>
          <option value="FR">Francia</option>
          <option value="DE">Alemania</option>
          <option value="IT">Italia</option>
          <option value="PT">Portugal</option>
        </select>
      </label>
      <label>
        Banco
        {loadingAspsps ? (
          <p className="muted">Cargando bancos…</p>
        ) : (
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Elige un banco</option>
            {aspsps.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </label>
      <label>
        IBAN de la cuenta (opcional, recomendado en cajas rurales)
        <input
          type="text"
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="ES00 0000 0000 0000 0000 0000"
          autoComplete="off"
          inputMode="text"
        />
      </label>
      <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Algunos bancos (Caja Rural / Ruralvía, entre otros) autorizan el acceso pero no dicen a qué cuenta si no se les
        indica el IBAN. Si al conectar te sale "0 cuentas", vuelve a conectar poniendo aquí el IBAN de la cuenta que
        quieres enlazar.
      </p>
      {/* Caso real (móvil Android + Ruralvía): el teléfono intercepta el
          enlace del banco para abrir su app y el navegador se queda en
          "Redirigir a su proveedor de servicios de cuenta" para siempre.
          Comprobado que el mismo enlace, en un navegador de ordenador,
          llega al login del banco en segundos — la conexión se guarda en
          el servidor, así que da igual desde dónde se haga. */}
      <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
        Si en el móvil se queda en "Redirigir a su proveedor de servicios de cuenta" sin avanzar, es que el teléfono
        intenta abrir la app del banco y no vuelve: conéctalo desde un ordenador (la cuenta quedará enlazada igual
        para todos los dispositivos).
      </p>
      <button type="button" onClick={handleConnect} disabled={!selected || connecting}>
        {connecting ? 'Abriendo el banco…' : 'Conectar'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------
// Resumen + Conclusiones de Pepa (Skill de Pepa, puntos 4/5)
// ---------------------------------------------------------------------

const NECESSITY_LABELS: Record<'debo' | 'necesito' | 'quiero', string> = {
  debo: 'Debo',
  necesito: 'Necesito',
  quiero: 'Quiero',
}

// Selector de periodo (Hoy/Esta semana/Este mes/Este año/Rango de
// fecha) — petición real: "eso lo metas en una pestaña, la pestaña se
// tiene que llamar Fecha y que tenga un desplegable... el rango de
// fecha que te ponga desde hasta... lo colocas donde está ahora mismo
// la pestaña que pone hoy". Antes era una fila entera de chips
// siempre visible; ahora es una única pestaña "📅 Fecha: …" que
// despliega las opciones al tocarla, con los campos desde/hasta
// dentro del propio desplegable al elegir "Rango de fecha". Mismo
// componente en los 4 sitios de Economía que usaban la fila de chips.
function DateFilterTab({
  preset,
  onPresetChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
}: {
  preset: SpendRangePreset
  onPresetChange: (p: SpendRangePreset) => void
  customFrom: string
  onCustomFromChange: (d: string) => void
  customTo: string
  onCustomToChange: (d: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ margin: '8px 0' }}>
      <button type="button" className={'chip' + (open ? ' chip-active' : '')} onClick={() => setOpen((v) => !v)}>
        📅 Fecha: {PRESET_LABELS[preset]} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="category-picker-panel" style={{ maxHeight: 'none', marginTop: 6 }}>
          {(['dia', 'semana', 'mes', 'año', 'rango'] as SpendRangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              className={'category-picker-row' + (preset === p ? ' chip-active' : '')}
              onClick={() => {
                onPresetChange(p)
                if (p !== 'rango') setOpen(false)
              }}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
          {preset === 'rango' && (
            <div className="inline-fields" style={{ padding: '10px 12px' }}>
              <label>
                Desde
                <input type="date" value={customFrom} onChange={(e) => onCustomFromChange(e.target.value)} />
              </label>
              <label>
                Hasta
                <input type="date" value={customTo} onChange={(e) => onCustomToChange(e.target.value)} />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Petición real: "las conclusiones de Pepa deben variar a diario, no
// siempre ser las mismas... tener más ocurrencias que una frase fija"
// — de un grupo de observaciones reales (nunca inventadas) que quepan
// ese día, se enseña un subconjunto que rota según la fecha, para que
// aún con un ritmo de gasto estable haya algo distinto que leer.
function pickDaily<T>(pool: T[], count: number): T[] {
  if (pool.length <= count) return pool
  const dayIndex = Math.floor(Date.now() / 86_400_000)
  const start = dayIndex % pool.length
  const picked: T[] = []
  for (let i = 0; i < count; i++) picked.push(pool[(start + i) % pool.length])
  return picked
}

function ResumenTab({ onViewMovements }: { onViewMovements: (f: MovementsFilter) => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  const [monthStartDay, setMonthStartDay] = useState(1)

  useEffect(() => {
    Promise.all([listExpenses(), listBudgetCategories(), listTags()])
      .then(([e, c, t]) => {
        setExpenses(e)
        setCategories(c)
        setTags(t)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    getFinanceMonthStartDay()
      .then(setMonthStartDay)
      .catch(() => {})
  }, [])

  if (loading) return <p className="muted">Cargando resumen…</p>

  const [from, to] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  const inRange = expenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to)
  const real = inRange.filter((e) => e.kind === 'real')
  const totalIncome = real.filter((e) => e.isIncome).reduce((s, e) => s + e.amount, 0)
  const totalSpent = real.filter((e) => !e.isIncome).reduce((s, e) => s + e.amount, 0)
  const ahorro = totalIncome - totalSpent
  // Skill de Pepa, punto 1: no se inventa una tasa de ahorro sin
  // ingresos con los que calcularla.
  const tasaAhorro = totalIncome > 0 ? (ahorro / totalIncome) * 100 : null

  // Periodo anterior EQUIVALENTE (misma duración, justo antes), para las
  // conclusiones — Skill de Pepa, punto 5: "en comparaciones mostrar
  // siempre porcentaje + euros, nunca depender solo del porcentaje".
  const fromMs = new Date(from + 'T00:00').getTime()
  const toMs = new Date(to + 'T00:00').getTime()
  const spanMs = Math.max(toMs - fromMs, 86_400_000)
  const prevTo = toDateStr(new Date(fromMs - 86_400_000))
  const prevFrom = toDateStr(new Date(fromMs - spanMs))
  const prevReal = expenses.filter((e) => e.kind === 'real' && e.expenseDate >= prevFrom && e.expenseDate <= prevTo)
  const prevSpent = prevReal.filter((e) => !e.isIncome).reduce((s, e) => s + e.amount, 0)

  const conclusions: { text: string; filter?: MovementsFilter }[] = []
  if (real.length === 0) {
    conclusions.push({ text: 'Todavía no hay movimientos en este periodo para sacar conclusiones.' })
  } else {
    if (prevReal.length === 0) {
      conclusions.push({ text: 'No hay datos del periodo anterior para comparar todavía — con el tiempo Pepa podrá comparar la evolución.' })
    } else {
      const deltaPct = prevSpent > 0 ? ((totalSpent - prevSpent) / prevSpent) * 100 : null
      const deltaEur = totalSpent - prevSpent
      if (deltaPct === null) {
        conclusions.push({ text: `Habéis gastado ${totalSpent.toFixed(2)} € — no había gasto en el periodo anterior con el que comparar.` })
      } else if (Math.abs(deltaPct) < 3) {
        conclusions.push({ text: `Habéis mantenido prácticamente el mismo ritmo de gasto que el periodo anterior y vuestra economía se mantiene estable.` })
      } else {
        const sign = deltaPct > 0 ? '+' : ''
        conclusions.push({
          text: `Habéis gastado un ${sign}${deltaPct.toFixed(0)}% (${sign}${deltaEur.toFixed(2)} €) ${deltaPct > 0 ? 'más' : 'menos'} que en el periodo anterior.`,
          filter: { label: `Gastos — ${PRESET_LABELS[preset]}`, from, to, isIncome: false },
        })
      }
    }
    if (tasaAhorro !== null) {
      if (tasaAhorro >= 20) conclusions.push({ text: `Vuestra tasa de ahorro es del ${tasaAhorro.toFixed(0)}% — una economía saneada.` })
      else if (tasaAhorro < 0) conclusions.push({ text: `Este periodo habéis gastado más de lo que habéis ingresado (${ahorro.toFixed(2)} €).` })
    }

    // Más señales reales, además del ritmo de gasto y el ahorro, para
    // que la sección tenga contenido variado incluso cuando esos dos
    // primeros apartados salen iguales varios días seguidos.
    const nonIncome = real.filter((e) => !e.isIncome)
    const categoryTotals = new Map<string, number>()
    for (const e of nonIncome) categoryTotals.set(e.category, (categoryTotals.get(e.category) ?? 0) + e.amount)
    const prevCategoryTotals = new Map<string, number>()
    for (const e of prevReal.filter((e) => !e.isIncome)) prevCategoryTotals.set(e.category, (prevCategoryTotals.get(e.category) ?? 0) + e.amount)

    let topCategoryCandidate: { text: string; filter?: MovementsFilter } | null = null
    if (categoryTotals.size > 0) {
      const [topCatName, topCatTotal] = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0]
      const icon = categories.find((c) => c.name === topCatName)?.icon ?? ''
      const pct = totalSpent > 0 ? (topCatTotal / totalSpent) * 100 : 0
      topCategoryCandidate = {
        text: `La categoría en la que más habéis gastado es ${icon} ${topCatName}, con ${topCatTotal.toFixed(2)} € (${pct.toFixed(0)}% del total).`,
        filter: { label: `${topCatName} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, category: topCatName },
      }
    }

    let biggestMoverCandidate: { text: string; filter?: MovementsFilter } | null = null
    if (prevReal.length > 0) {
      let best: { name: string; deltaEur: number; deltaPct: number | null } | null = null
      for (const [name, total] of categoryTotals) {
        const prevTotal = prevCategoryTotals.get(name) ?? 0
        const deltaEur = total - prevTotal
        if (Math.abs(deltaEur) < 5) continue
        if (!best || Math.abs(deltaEur) > Math.abs(best.deltaEur)) best = { name, deltaEur, deltaPct: prevTotal > 0 ? (deltaEur / prevTotal) * 100 : null }
      }
      if (best) {
        const sign = best.deltaEur > 0 ? '+' : ''
        const pctText = best.deltaPct !== null ? ` (${sign}${best.deltaPct.toFixed(0)}%)` : ''
        biggestMoverCandidate = {
          text: `La categoría que más ha cambiado respecto al periodo anterior es ${best.name}: ${sign}${best.deltaEur.toFixed(2)} €${pctText}.`,
          filter: { label: `${best.name} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, category: best.name },
        }
      }
    }

    let topStoreCandidate: { text: string; filter?: MovementsFilter } | null = null
    const storeInfo = new Map<string, { count: number; total: number }>()
    for (const e of nonIncome) {
      if (!e.store) continue
      const cur = storeInfo.get(e.store) ?? { count: 0, total: 0 }
      cur.count++
      cur.total += e.amount
      storeInfo.set(e.store, cur)
    }
    if (storeInfo.size > 0) {
      const [storeName, info] = [...storeInfo.entries()].sort((a, b) => b[1].count - a[1].count)[0]
      if (info.count >= 2) {
        topStoreCandidate = {
          text: `Vuestro comercio más frecuente ha sido ${storeName}, con ${info.count} compras (${info.total.toFixed(2)} €).`,
          filter: { label: `${storeName} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, store: storeName },
        }
      }
    }

    let biggestExpenseCandidate: { text: string; filter?: MovementsFilter } | null = null
    if (nonIncome.length > 0) {
      const biggest = [...nonIncome].sort((a, b) => b.amount - a.amount)[0]
      biggestExpenseCandidate = {
        text: `El gasto más alto del periodo ha sido ${biggest.category}${biggest.store ? ` en ${biggest.store}` : ''}: ${biggest.amount.toFixed(2)} € el ${biggest.expenseDate}.`,
        filter: { label: `${biggest.category} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, category: biggest.category },
      }
    }

    let necessityCandidate: { text: string; filter?: MovementsFilter } | null = null
    const quieroTotal = nonIncome
      .filter((e) => resolveCategoryClassification(e.category, categories).necessity === 'quiero')
      .reduce((s, e) => s + e.amount, 0)
    if (quieroTotal > 0) {
      const pct = totalSpent > 0 ? (quieroTotal / totalSpent) * 100 : 0
      necessityCandidate = {
        text: `Un ${pct.toFixed(0)}% de lo gastado (${quieroTotal.toFixed(2)} €) ha sido "Quiero" — gasto no esencial.`,
        filter: { label: `Quiero — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, necessity: 'quiero' },
      }
    }

    let fixedVariableCandidate: { text: string; filter?: MovementsFilter } | null = null
    const fixedTotal = nonIncome.filter((e) => resolveExpenseFixed(e, categories) === true).reduce((s, e) => s + e.amount, 0)
    if (fixedTotal > 0) {
      const pct = totalSpent > 0 ? (fixedTotal / totalSpent) * 100 : 0
      fixedVariableCandidate = {
        text: `El ${pct.toFixed(0)}% de vuestro gasto (${fixedTotal.toFixed(2)} €) es fijo; el resto, variable.`,
        filter: { label: `Fijo — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, isFixed: true },
      }
    }

    let tagCandidate: { text: string; filter?: MovementsFilter } | null = null
    const tagCounts = new Map<string, number>()
    for (const e of nonIncome) if (e.tagId) tagCounts.set(e.tagId, (tagCounts.get(e.tagId) ?? 0) + 1)
    if (tagCounts.size > 0) {
      const [tagId, count] = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0]
      const tag = tags.find((t) => t.id === tagId)
      if (tag && count >= 2) {
        tagCandidate = {
          text: `La etiqueta que más se repite es ${tag.name}, en ${count} movimientos.`,
          filter: { label: `${tag.name} — ${PRESET_LABELS[preset]}`, from, to, isIncome: false, tagId: tag.id },
        }
      }
    }

    const extraPool = [
      topCategoryCandidate,
      biggestMoverCandidate,
      topStoreCandidate,
      biggestExpenseCandidate,
      necessityCandidate,
      fixedVariableCandidate,
      tagCandidate,
    ].filter((c): c is { text: string; filter?: MovementsFilter } => c !== null)
    conclusions.push(...pickDaily(extraPool, 3))
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <DateFilterTab
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      <div className="card event-card">
        <strong>Resumen — {PRESET_LABELS[preset]}</strong>
        <p style={{ color: '#1e8449', margin: '6px 0 0' }}>
          Ingresos: +{totalIncome.toFixed(2)} €{' '}
          <button type="button" className="link-button" onClick={() => onViewMovements({ label: `Ingresos — ${PRESET_LABELS[preset]}`, from, to, isIncome: true })}>
            Ver registros →
          </button>
        </p>
        <p style={{ color: '#c0392b', margin: '4px 0' }}>
          Gastos: -{totalSpent.toFixed(2)} €{' '}
          <button type="button" className="link-button" onClick={() => onViewMovements({ label: `Gastos — ${PRESET_LABELS[preset]}`, from, to, isIncome: false })}>
            Ver registros →
          </button>
        </p>
        <p style={{ margin: '4px 0' }}>
          <strong>Ahorro: {ahorro.toFixed(2)} €</strong>
          {tasaAhorro !== null && <span className="muted"> · Tasa de ahorro {tasaAhorro.toFixed(0)}%</span>}
        </p>
      </div>

      <h2 className="section-title">Conclusiones de Pepa</h2>
      {conclusions.map((c, i) => (
        <div key={i} className="card event-card">
          <p style={{ margin: 0 }}>{c.text}</p>
          {c.filter && (
            <button type="button" className="link-button" onClick={() => onViewMovements(c.filter!)}>
              +info →
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------
// Estadísticas (Skill de Pepa, puntos 7-17)
// ---------------------------------------------------------------------

interface BreakdownSlice {
  key: string
  label: string
  icon?: string
  color?: string
  total: number
  count: number
  hasChildren?: boolean
}

const DONUT_COLORS = ['#4C6EF5', '#e8590c', '#2f9e44', '#ae3ec9', '#f08c00', '#1098ad', '#e64980', '#748ffc', '#20c997', '#fa5252']

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// Recorte de anillo (donut) entre dos ángulos — el rodaja real que se
// toca, no una fila de texto aparte.
function donutSlicePath(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
  const clampedEnd = Math.min(endAngle, startAngle + 359.99) // círculo completo (1 sola porción) es un caso degenerado en SVG
  const startOuter = polarToCartesian(cx, cy, rOuter, clampedEnd)
  const endOuter = polarToCartesian(cx, cy, rOuter, startAngle)
  const startInner = polarToCartesian(cx, cy, rInner, clampedEnd)
  const endInner = polarToCartesian(cx, cy, rInner, startAngle)
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ')
}

// Dónut de verdad interactivo: cada porción es su propio <path> de SVG
// con su propio onClick — antes era un único div con conic-gradient
// (no se puede tocar una porción concreta, solo listar el texto
// debajo). Petición real, muy insistida: "cuando lo toque [el dónut]
// que se ponga otro subdónut al lado con la categoría que ha
// tocado... en el dónut, no en la lista" — se aplica igual a todos los
// dónuts de la app (categorías, etiquetas, Debo/Necesito/Quiero,
// Fijo/variable, reparto por tienda), sin ninguna lista aparte debajo.
function SvgDonut({
  slices,
  centerLabel,
  highlightedKey,
  onSliceClick,
  size = 190,
  colors = DONUT_COLORS,
}: {
  slices: { key: string; total: number; color?: string; label?: string }[]
  centerLabel: { name: string; total: number }
  highlightedKey: string | null
  onSliceClick: (key: string) => void
  size?: number
  colors?: string[]
}) {
  if (slices.length === 0) {
    return <p className="muted">No hay movimientos en este periodo para esta vista.</p>
  }
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2
  const rInner = rOuter * 0.52
  const grandTotal = slices.reduce((s, x) => s + x.total, 0)
  let cumulative = 0
  // Petición real: "dentro del dónut, como hasta ahora, la categoría
  // que hemos elegido... pero la leyenda me la pone debajo a lo que
  // pertenece cada color, aplícalo a todos los dónuts" — un intento
  // anterior (icono dentro de la porción) "se quedaba mal"; en vez de
  // eso, el centro del dónut se queda igual (nombre + importe de la
  // porción tocada) y debajo se añade una leyenda de color → nombre,
  // solo informativa (no se toca, seguimos sin listas que controlen el
  // dónut — solo se explica qué es cada color).
  const legendEntries = slices
    .map((s, i) => ({ key: s.key, label: s.label ?? s.key, color: s.color ?? colors[i % colors.length], total: s.total }))
    .filter((s) => s.total > 0)

  return (
    <div className="donut-ring-wrap">
      <div className="donut-ring" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
          {slices.map((s, i) => {
            const pct = grandTotal > 0 ? (s.total / grandTotal) * 360 : 0
            if (pct <= 0) return null
            const start = cumulative
            cumulative += pct
            // Petición real: "no quiero que las otras partes
            // desaparezcan, quiero que se quede el color como más
            // apagado, que se vea que no está activo" — antes la
            // porción no tocada se sustituía por un gris plano (perdía
            // del todo su color); ahora conserva su propio color
            // siempre, solo baja la opacidad si hay otra activa.
            const dimmed = highlightedKey != null && highlightedKey !== s.key
            // Petición real: "los colores de los demás gastos no deben
            // ponerse gris, sino aclararse para que se siga viendo las
            // proporciones" — 0.3 se veía casi gris con muchos colores
            // ya de por sí pálidos; 0.45 aclara pero conserva el matiz.
            return (
              <path
                key={s.key}
                d={donutSlicePath(cx, cy, rOuter, rInner, start, start + pct)}
                fill={s.color ?? colors[i % colors.length]}
                fillOpacity={dimmed ? 0.45 : 1}
                onClick={() => onSliceClick(s.key)}
                style={{ cursor: 'pointer' }}
              />
            )
          })}
        </svg>
        <div className="donut-ring-center">
          <span>{centerLabel.name}</span>
          <strong>{centerLabel.total.toFixed(2)} €</strong>
        </div>
      </div>
      <div className="donut-legend">
        {legendEntries.map((s) => (
          <span key={s.key} className="donut-legend-item">
            <span className="donut-legend-dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// Un solo nivel (etiquetas, Debo/Necesito/Quiero, Fijo/variable) — antes
// tocar una porción llevaba DIRECTO a "Ver registros" saltando de
// pestaña sin avisar. Petición real: "al tocar un área del dónut no
// debe llevarme directamente a los movimientos filtrados, debe haber
// un botón que me diga el número de movimientos... y si pulso ese
// botón entonces se abren los movimientos filtrados" — tocar solo
// resalta/selecciona la porción; navegar es un paso aparte y explícito.
function BreakdownDonut({
  slices,
  centerLabel,
  onViewRecords,
}: {
  slices: BreakdownSlice[]
  centerLabel: { name: string; total: number }
  onViewRecords: (key: string) => void
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = slices.find((s) => s.key === selectedKey)

  return (
    <div>
      <SvgDonut
        slices={slices}
        centerLabel={selected ? { name: selected.label, total: selected.total } : centerLabel}
        highlightedKey={selectedKey}
        onSliceClick={(key) => setSelectedKey((prev) => (prev === key ? null : key))}
      />
      {selected && (
        <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
          {selected.count} {selected.count === 1 ? 'movimiento' : 'movimientos'} en {selected.label}
          {' — '}
          <button type="button" className="link-button" onClick={() => onViewRecords(selected.key)}>
            Ver movimientos →
          </button>
        </p>
      )}
    </div>
  )
}

// Skill de Pepa, punto 10: "Donut principal por categorías. Al
// seleccionar una categoría, segundo donut con subcategorías" —
// petición real: "si tocas una de las categorías [EN EL DÓNUT] se
// resalta y ves el importe de esa categoría y a la vez se abre un
// segundo dónut con el reparto de las subcategorías, al lado". Pero
// TAMBIÉN: "no quiero que el segundo dónut esté en una segunda
// página, quiero poder seguir viendo el primer dónut" (antes era un
// carrusel horizontal que se llevaba el primero fuera de la vista) y
// "al tocar un área no debe llevarme directamente a los movimientos,
// debe haber un botón". Ahora los dos anillos van apilados en
// vertical (el de arriba nunca desaparece) y tocar una porción solo
// selecciona — ver movimientos es un botón aparte, explícito.
function CategoryDonutExplorer({
  categories,
  expenses,
  onViewRecords,
}: {
  categories: BudgetCategory[]
  expenses: Expense[]
  onViewRecords: (category: string | string[], label: string) => void
}) {
  const [selectedTopId, setSelectedTopId] = useState<string | null>(null)
  const [highlightTop, setHighlightTop] = useState<string | null>(null)
  const [highlightSub, setHighlightSub] = useState<string | null>(null)

  const topLevel = categories.filter((c) => !c.parentId)
  const topSlices: BreakdownSlice[] = topLevel
    .map((c) => {
      const childNames = categories.filter((x) => x.parentId === c.id).map((x) => x.name)
      const matched = expenses.filter((e) => e.category === c.name || childNames.includes(e.category))
      return {
        key: c.id,
        label: c.name,
        icon: c.icon,
        total: matched.reduce((s, e) => s + e.amount, 0),
        count: matched.length,
        hasChildren: childNames.length > 0,
      }
    })
    .filter((s) => s.total > 0)
  const topGrandTotal = topSlices.reduce((s, x) => s + x.total, 0)
  const highlightedTop = topSlices.find((s) => s.key === highlightTop)
  const topCenter = highlightedTop ? { name: highlightedTop.label, total: highlightedTop.total } : { name: 'Todo', total: topGrandTotal }

  const selectedTop = selectedTopId ? topLevel.find((c) => c.id === selectedTopId) : undefined
  const subSlices: BreakdownSlice[] = selectedTop
    ? categories
        .filter((c) => c.parentId === selectedTop.id)
        .map((c): BreakdownSlice => {
          const matched = expenses.filter((e) => e.category === c.name)
          return { key: c.id, label: c.name, icon: c.icon, total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
        })
        .concat(
          (() => {
            const direct = expenses.filter((e) => e.category === selectedTop.name)
            return direct.length > 0
              ? [{ key: `directo:${selectedTop.id}`, label: '(sin subcategoría)', total: direct.reduce((s, e) => s + e.amount, 0), count: direct.length } as BreakdownSlice]
              : []
          })(),
        )
        .filter((s) => s.total > 0)
    : []
  const subGrandTotal = subSlices.reduce((s, x) => s + x.total, 0)
  const highlightedSub = subSlices.find((s) => s.key === highlightSub)
  const subCenter = highlightedSub ? { name: highlightedSub.label, total: highlightedSub.total } : { name: 'Todo', total: subGrandTotal }

  function selectTop(key: string) {
    if (key === highlightTop) {
      // Segundo toque en la misma porción: la deselecciona y cierra el subdónut.
      setHighlightTop(null)
      setSelectedTopId(null)
      setHighlightSub(null)
      return
    }
    setHighlightTop(key)
    setHighlightSub(null)
    const slice = topSlices.find((s) => s.key === key)
    setSelectedTopId(slice?.hasChildren ? key : null)
  }

  function selectSub(key: string) {
    setHighlightSub((prev) => (prev === key ? null : key))
  }

  function closeSub() {
    setSelectedTopId(null)
    setHighlightSub(null)
  }

  if (topSlices.length === 0) {
    return <p className="muted">No hay movimientos en este periodo para esta vista.</p>
  }

  return (
    <div className="donut-explorer">
      <SvgDonut slices={topSlices} centerLabel={topCenter} highlightedKey={highlightTop} onSliceClick={selectTop} />
      {highlightedTop && (
        <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
          {highlightedTop.count} {highlightedTop.count === 1 ? 'movimiento' : 'movimientos'} en {highlightedTop.label}
          {' — '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              // Una categoría con hijas casi nunca tiene gastos con su
              // propio nombre exacto — hay que incluir toda la familia
              // (padre + subcategorías), si no "Ver movimientos" enseña
              // 0 registros aunque el dónut sí sume su importe.
              if (highlightedTop.hasChildren) {
                const childNames = categories.filter((c) => c.parentId === highlightedTop.key).map((c) => c.name)
                onViewRecords([highlightedTop.label, ...childNames], highlightedTop.label)
              } else {
                onViewRecords(highlightedTop.label, highlightedTop.label)
              }
            }}
          >
            Ver movimientos →
          </button>
        </p>
      )}
      {selectedTop && (
        <div className="donut-subsection">
          <div className="inline-fields" style={{ justifyContent: 'center' }}>
            <strong>Subcategorías de {selectedTop.name}</strong>
            <button type="button" className="link-button" onClick={closeSub}>
              ✕ Cerrar
            </button>
          </div>
          <SvgDonut slices={subSlices} centerLabel={subCenter} highlightedKey={highlightSub} onSliceClick={selectSub} />
          {highlightedSub && (
            <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
              {highlightedSub.count} {highlightedSub.count === 1 ? 'movimiento' : 'movimientos'} en {highlightedSub.label}
              {' — '}
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  onViewRecords(
                    highlightedSub.key.startsWith('directo:') ? selectedTop.name : highlightedSub.label,
                    highlightedSub.label,
                  )
                }
              >
                Ver movimientos →
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function EstadisticasTab({ onViewMovements }: { onViewMovements: (f: MovementsFilter) => void }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [purchases, setPurchases] = useState<RawPurchase[]>([])
  const [productNames, setProductNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  const [view, setView] = useState<'categorias' | 'etiquetas' | 'dnq' | 'fijo'>('categorias')
  const [monthStartDay, setMonthStartDay] = useState(1)

  useEffect(() => {
    Promise.all([
      listExpenses(),
      listBudgetCategories(),
      listTags(),
      listAllProductPrices(),
      listProducts(),
      listReceipts(),
      getFinanceMonthStartDay(),
    ])
      .then(([e, c, t, prices, products, receipts, monthStart]) => {
        setExpenses(e)
        setCategories(c)
        setTags(t)
        setMonthStartDay(monthStart)
        const foodReceiptIds = buildFoodReceiptIds(receipts, c)
        setPurchases(
          // Un pedido de Amazon que no sea de alimentación no debe
          // entrar en el análisis de "¿por qué ha cambiado mi gasto?"
          // de la cesta de tickets — uno que sí lo sea (café...) sí cuenta.
          prices
            .filter((p) => isFoodPurchase(p, foodReceiptIds))
            .map((p) => {
              const qty = Number(p.quantity)
              return { productId: p.productId, price: p.price, quantity: Number.isFinite(qty) && qty > 0 ? qty : 1, recordedDate: p.recordedDate }
            }),
        )
        setProductNames(new Map(products.map((pr) => [pr.id, pr.displayName])))
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="muted">Cargando estadísticas…</p>

  const [from, to] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  const periodLabel = `${PRESET_LABELS[preset]} (${from} a ${to})`
  const real = expenses.filter((e) => e.kind === 'real' && !e.isIncome && e.expenseDate >= from && e.expenseDate <= to)
  const totalReal = real.reduce((s, e) => s + e.amount, 0)

  function viewFor(extra: Partial<MovementsFilter>, label: string) {
    onViewMovements({ label, from, to, isIncome: false, ...extra })
  }

  let body: JSX.Element
  if (view === 'categorias') {
    body = (
      <CategoryDonutExplorer
        categories={categories}
        expenses={real}
        onViewRecords={(cat, label) =>
          viewFor(Array.isArray(cat) ? { categoryGroup: cat } : { category: cat }, `${label} — ${periodLabel}`)
        }
      />
    )
  } else if (view === 'etiquetas') {
    const slices: BreakdownSlice[] = tags
      .map((t) => {
        const matched = real.filter((e) => e.tagId === t.id)
        return { key: t.id, label: t.name, icon: '🏷️', color: t.color, total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body =
      tags.length === 0 ? (
        <p className="muted">Todavía no hay etiquetas — puedes crear la primera desde el botón flotante de Movimientos.</p>
      ) : (
        <BreakdownDonut
          slices={slices}
          centerLabel={{ name: 'Todo', total: slices.reduce((s, x) => s + x.total, 0) }}
          onViewRecords={(key) => viewFor({ tagId: key }, `Etiqueta — ${periodLabel}`)}
        />
      )
  } else if (view === 'dnq') {
    const groups: { key: 'debo' | 'necesito' | 'quiero' | 'sin_clasificar'; label: string }[] = [
      { key: 'debo', label: 'Debo' },
      { key: 'necesito', label: 'Necesito' },
      { key: 'quiero', label: 'Quiero' },
      { key: 'sin_clasificar', label: 'Sin clasificar' },
    ]
    const necessityByExpense = new Map(real.map((e) => [e.id, resolveCategoryClassification(e.category, categories).necessity]))
    const slices: BreakdownSlice[] = groups
      .map((g) => {
        const matched = real.filter((e) => (g.key === 'sin_clasificar' ? !necessityByExpense.get(e.id) : necessityByExpense.get(e.id) === g.key))
        return { key: g.key, label: g.label, total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body = (
      <BreakdownDonut
        slices={slices}
        centerLabel={{ name: 'Todo', total: totalReal }}
        onViewRecords={(key) =>
          key === 'sin_clasificar'
            ? viewFor({}, `Sin clasificar — ${periodLabel}`)
            : viewFor({ necessity: key as 'debo' | 'necesito' | 'quiero' }, `${NECESSITY_LABELS[key as 'debo' | 'necesito' | 'quiero']} — ${periodLabel}`)
        }
      />
    )
  } else {
    const groups: { key: 'fijo' | 'variable' | 'sin_clasificar'; label: string }[] = [
      { key: 'fijo', label: 'Fijo' },
      { key: 'variable', label: 'Variable' },
      { key: 'sin_clasificar', label: 'Sin clasificar' },
    ]
    const isFixedByExpense = new Map(real.map((e) => [e.id, resolveCategoryClassification(e.category, categories).isFixed]))
    const slices: BreakdownSlice[] = groups
      .map((g) => {
        const matched = real.filter((e) =>
          g.key === 'sin_clasificar' ? isFixedByExpense.get(e.id) == null : isFixedByExpense.get(e.id) === (g.key === 'fijo'),
        )
        return { key: g.key, label: g.label, total: matched.reduce((s, e) => s + e.amount, 0), count: matched.length }
      })
      .filter((s) => s.total > 0)
    body = (
      <BreakdownDonut
        slices={slices}
        centerLabel={{ name: 'Todo', total: totalReal }}
        onViewRecords={(key) => (key === 'sin_clasificar' ? viewFor({}, `Sin clasificar — ${periodLabel}`) : viewFor({ isFixed: key === 'fijo' }, `${key === 'fijo' ? 'Fijo' : 'Variable'} — ${periodLabel}`))}
      />
    )
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <DateFilterTab
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      {/* Skill de Pepa, punto 8: mismo selector, mismo periodo, mismo
          total general — solo cambia la dimensión de agrupación. */}
      <div className="filter-row" style={{ marginBottom: 8 }}>
        <button type="button" className={'chip' + (view === 'categorias' ? ' chip-active' : '')} onClick={() => setView('categorias')}>
          Categorías
        </button>
        <button type="button" className={'chip' + (view === 'etiquetas' ? ' chip-active' : '')} onClick={() => setView('etiquetas')}>
          Etiquetas
        </button>
        <button type="button" className={'chip' + (view === 'dnq' ? ' chip-active' : '')} onClick={() => setView('dnq')}>
          Debo/Necesito/Quiero
        </button>
        <button type="button" className={'chip' + (view === 'fijo' ? ' chip-active' : '')} onClick={() => setView('fijo')}>
          Fijo/variable
        </button>
      </div>

      <div className="card event-card">
        <strong>Gastos — {periodLabel}</strong>
        <p style={{ margin: '4px 0' }}>{totalReal.toFixed(2)} €</p>
        {body}
      </div>

      <EvolucionTemporal expenses={expenses} onViewMovements={onViewMovements} />
      <PorQueHaCambiadoMiGasto purchases={purchases} productNames={productNames} onViewMovements={onViewMovements} />
    </div>
  )
}

// Skill de Pepa, punto 13: ingresos/gastos/ahorro mes a mes, con acceso
// directo a los movimientos de cada mes.
function EvolucionTemporal({ expenses, onViewMovements }: { expenses: Expense[]; onViewMovements: (f: MovementsFilter) => void }) {
  const months = useMemo(() => {
    const now = new Date()
    const list: { key: string; label: string; from: string; to: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const from = `${key}-01`
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      const to = `${key}-${String(lastDay).padStart(2, '0')}`
      list.push({ key, label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`, from, to })
    }
    return list
  }, [])

  const rows = months.map((m) => {
    const inMonth = expenses.filter((e) => e.kind === 'real' && e.expenseDate >= m.from && e.expenseDate <= m.to)
    const income = inMonth.filter((e) => e.isIncome).reduce((s, e) => s + e.amount, 0)
    const spent = inMonth.filter((e) => !e.isIncome).reduce((s, e) => s + e.amount, 0)
    return { ...m, income, spent, ahorro: income - spent, count: inMonth.length }
  })
  const maxAmount = Math.max(1, ...rows.map((r) => Math.max(r.income, r.spent)))

  return (
    <div className="card event-card">
      <strong>Evolución temporal — últimos 6 meses</strong>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{r.label}</span>
              <span className={r.ahorro >= 0 ? 'muted' : 'error'}>Ahorro: {r.ahorro.toFixed(2)} €</span>
            </div>
            <div style={{ display: 'flex', height: 8, gap: 2, marginTop: 3 }}>
              <div style={{ width: `${(r.income / maxAmount) * 100}%`, background: '#2f9e44', borderRadius: 3 }} />
            </div>
            <div style={{ display: 'flex', height: 8, gap: 2, marginTop: 2 }}>
              <div style={{ width: `${(r.spent / maxAmount) * 100}%`, background: '#e64980', borderRadius: 3 }} />
            </div>
            <button
              type="button"
              className="link-button"
              style={{ fontSize: 12 }}
              onClick={() => onViewMovements({ label: `Movimientos — ${r.label}`, from: r.from, to: r.to })}
            >
              +{r.income.toFixed(2)} € / -{r.spent.toFixed(2)} € · {r.count} {r.count === 1 ? 'registro' : 'registros'} · Ver →
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Skill de Pepa, punto 14: solo se muestra si hay datos de tickets
// suficientes en los dos meses a comparar — si no, se explica qué
// falta en vez de enseñar un desglose vacío o inventado.
function PorQueHaCambiadoMiGasto({
  purchases,
  productNames,
  onViewMovements,
}: {
  purchases: RawPurchase[]
  productNames: Map<string, string>
  onViewMovements: (f: MovementsFilter) => void
}) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

  const hasCurrent = purchases.some((p) => p.recordedDate.startsWith(currentMonth))
  const hasPrevious = purchases.some((p) => p.recordedDate.startsWith(previousMonth))

  return (
    <div className="card event-card">
      <strong>¿Por qué ha cambiado mi gasto?</strong>
      {!hasCurrent || !hasPrevious ? (
        <p className="muted" style={{ marginTop: 6 }}>
          Todavía no hay tickets suficientes este mes y el anterior para desglosar el cambio de gasto — en cuanto haya
          tickets de ambos meses, Pepa podrá explicar cuánto se debe a precio, a cantidad o a productos nuevos.
        </p>
      ) : (
        (() => {
          const b = decomposeSpendChange(purchases, currentMonth, previousMonth)
          const delta = b.currentTotal - b.previousTotal
          const topMovers = compareMonths(averagePricesByMonth(purchases), currentMonth, previousMonth)
            .filter((c) => c.previousPrice != null && c.deltaPercent != null)
            .sort((a, b2) => Math.abs(b2.deltaPercent!) - Math.abs(a.deltaPercent!))
            .slice(0, 3)
          return (
            <>
              <p className="muted" style={{ margin: '4px 0 10px', fontSize: 12 }}>
                Análisis basado en los productos leídos de tus tickets — puede no coincidir exactamente con el banco.
              </p>
              <p style={{ margin: '2px 0' }}>
                Cesta de tickets: {b.previousTotal.toFixed(2)} € → {b.currentTotal.toFixed(2)} € ({delta >= 0 ? '+' : ''}
                {delta.toFixed(2)} €)
              </p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                <li>Por cambio de precio: {b.priceEffect >= 0 ? '+' : ''}{b.priceEffect.toFixed(2)} €</li>
                <li>Por comprar más o menos cantidad: {b.quantityEffect >= 0 ? '+' : ''}{b.quantityEffect.toFixed(2)} €</li>
                <li>Por productos nuevos: +{b.newProductsEffect.toFixed(2)} €</li>
                <li>Por productos que ya no se compran: {b.droppedProductsEffect.toFixed(2)} €</li>
              </ul>
              {topMovers.length > 0 && (
                <>
                  <p className="muted" style={{ margin: '10px 0 2px', fontSize: 12 }}>
                    Productos que más han cambiado de precio:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {topMovers.map((c) => (
                      <li key={c.productId}>
                        {productNames.get(c.productId) ?? '?'}: {c.previousPrice!.toFixed(2)} € → {c.currentPrice!.toFixed(2)} € (
                        {c.deltaPercent! >= 0 ? '+' : ''}
                        {c.deltaPercent!.toFixed(0)}%)
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button
                type="button"
                className="link-button"
                style={{ marginTop: 6 }}
                onClick={() => onViewMovements({ label: `Tickets — ${currentMonth}`, from: `${currentMonth}-01`, to: `${currentMonth}-31` })}
              >
                Ver movimientos de este mes →
              </button>
            </>
          )
        })()
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Gastos (Skill 17/18)
// ---------------------------------------------------------------------

// Gastos es ahora el ÚNICO sitio de la app para ver y categorizar
// cualquier movimiento, y el único con el botón flotante para crear
// categorías y apuntar gastos (petición real: "en Gastos solo debería
// haber una lista de los gastos, al estilo de los productos, cada uno
// en una línea estrecha, ordenados por fecha y donde se puedan
// categorizar... traslado el botón flotante de Presupuesto General a
// Gastos"). Presupuesto Generales y Registro Alimentación pasan a leer
// de esta misma lista, sin su propio sitio para crearlos.
function ExpensesTab({
  filter,
  onClearFilter,
  previousTabLabel,
  onBack,
}: {
  filter?: MovementsFilter | null
  onClearFilter?: () => void
  previousTabLabel?: SubTab | null
  onBack?: () => void
}) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // "YYYY-MM" del mes que se está viendo — no siempre el actual, para
  // poder consultar meses anteriores (o cualquier mes suelto, como
  // febrero) en vez de solo el que corre. Se ignora mientras haya un
  // `filter` activo (viene de "Ver X registros →" en Estadísticas).
  const [visibleMonth, setVisibleMonth] = useState(toDateStr(new Date()).slice(0, 7))
  const [editingId, setEditingId] = useState<string | null>(null)
  // Igual que las categorías sugeridas de Presupuesto Generales: se dan
  // de alta solas la primera vez, sin pedirlo — petición real: "los
  // ingresos también se deberían poder categorizar, como sueldo,
  // regalo, ingreso".
  const seededIncomeRef = useRef(false)

  function reload() {
    setLoading(true)
    Promise.all([listExpenses(), listBudgetCategories(), listTags()])
      .then(async ([e, c, t]) => {
        if (!seededIncomeRef.current && !c.some((cat) => cat.budgetGroup === 'ingresos')) {
          seededIncomeRef.current = true
          await createBudgetCategoriesBulk(INCOME_CATEGORY_SEED.map((s) => ({ ...s, budgetGroup: 'ingresos' })))
          c = await listBudgetCategories()
        }
        setExpenses(e)
        setCategories(c)
        setTags(t)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  function shiftMonth(delta: number) {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setVisibleMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // Skill de Pepa, punto 24: el filtro que llega de "Ver X registros →"
  // manda sobre la navegación por mes normal — mismos criterios que
  // produjeron la cifra, ni uno más ni uno menos.
  const filteredExpenses = useMemo(() => {
    if (!filter) return expenses.filter((e) => e.expenseDate.startsWith(visibleMonth))
    return expenses.filter((e) => {
      if (filter.from && e.expenseDate < filter.from) return false
      if (filter.to && e.expenseDate > filter.to) return false
      if (filter.category !== undefined && e.category !== filter.category) return false
      if (filter.categoryGroup !== undefined && !filter.categoryGroup.includes(e.category)) return false
      if (filter.store !== undefined && e.store !== filter.store) return false
      if (filter.tagId !== undefined && e.tagId !== filter.tagId) return false
      if (filter.necessity !== undefined || filter.isFixed !== undefined) {
        const classification = resolveCategoryClassification(e.category, categories)
        if (filter.necessity !== undefined && classification.necessity !== filter.necessity) return false
        if (filter.isFixed !== undefined && classification.isFixed !== filter.isFixed) return false
      }
      if (filter.isIncome !== undefined && e.isIncome !== filter.isIncome) return false
      return true
    })
  }, [expenses, filter, visibleMonth])

  const monthExpenses = filteredExpenses

  const monthTotal = useMemo(
    () => monthExpenses.filter((e) => e.kind === 'real' && !e.isIncome).reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses],
  )

  // Petición real: "gráficos de estadísticas, total ingresos" — un
  // ingreso (nómina, paga extra...) es el mismo movimiento, solo
  // marcado al revés. Se crean desde el "Resumen" de cada presupuesto
  // (Skill: ingresos separados por pestaña), pero se ven aquí también
  // para tener el listado completo por fecha.
  const monthIncome = useMemo(
    () => monthExpenses.filter((e) => e.isIncome).reduce((sum, e) => sum + e.amount, 0),
    [monthExpenses],
  )

  if (loading) return <p className="muted">Cargando gastos…</p>

  const [visibleYear, visibleMonthIndex] = visibleMonth.split('-').map(Number)

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {filter ? (
        <div className="card event-card">
          <strong>Filtro: {filter.label}</strong>
          <p className="muted" style={{ margin: '4px 0' }}>
            {monthExpenses.length} {monthExpenses.length === 1 ? 'registro' : 'registros'}
          </p>
          <div className="inline-fields">
            {onBack && (
              <button type="button" className="link-button" onClick={onBack}>
                ‹ Volver{previousTabLabel ? ` a ${previousTabLabel}` : ''}
              </button>
            )}
            <button type="button" className="link-button" onClick={onClearFilter}>
              ✕ Quitar filtro
            </button>
          </div>
        </div>
      ) : (
        <div className="month-nav">
          <button type="button" className="link-button" onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <strong>
            {MONTH_LABELS[visibleMonthIndex - 1]} {visibleYear}
          </strong>
          <button type="button" className="link-button" onClick={() => shiftMonth(1)}>
            ›
          </button>
          <input
            type="month"
            value={visibleMonth}
            onChange={(e) => e.target.value && setVisibleMonth(e.target.value)}
          />
          <button type="button" className="link-button" onClick={() => setVisibleMonth(toDateStr(new Date()).slice(0, 7))}>
            Hoy
          </button>
        </div>
      )}

      <p className="points-badge">
        {monthTotal.toFixed(2)} € gastados
        {monthIncome > 0 && ` · +${monthIncome.toFixed(2)} € ingresados`}
      </p>

      <div className="price-row-list">
        {monthExpenses.map((e) =>
          editingId === e.id ? (
            <EditExpenseInline
              key={e.id}
              expense={e}
              categories={categories}
              tags={tags}
              onDone={() => {
                setEditingId(null)
                reload()
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <MovementRow
              key={e.id}
              expense={e}
              category={categories.find((c) => c.name === e.category)}
              tag={tags.find((t) => t.id === e.tagId)}
              onClick={() => setEditingId(e.id)}
              extraAction={
                <ConfirmIconButton
                  icon="✕"
                  className="icon-button"
                  ariaLabel="Borrar movimiento"
                  onConfirm={() => deleteExpense(e.id).then(reload)}
                />
              }
            />
          ),
        )}
        {monthExpenses.length === 0 && <p className="muted">No hay gastos este mes.</p>}
      </div>
    </div>
  )
}

const SOURCE_META: Record<ExpenseSource, { icon: string; label: string }> = {
  manual: { icon: '✏️', label: 'Apuntado a mano' },
  ticket: { icon: '🧾', label: 'Importado de un ticket' },
  banco: { icon: '🏦', label: 'Importado del banco' },
  ticket_banco: { icon: '🏦', label: 'Importado del banco' },
}

// Fila compartida de un movimiento (Movimientos y Banco son la misma
// tabla `expenses`, ver EditExpenseInline) — antes era una sola línea
// con el nombre de la etiqueta escondido detrás de un puntito de 8px a
// mitad de línea, prácticamente invisible con muchas etiquetas ya
// puestas (petición real: "en 96 etiquetas que he puesto solo veo
// una... soy partidaria del punto al inicio de movimiento"). Ahora el
// punto de color va el primero de todo, y se reparte la información en
// 3 líneas para verlo todo de un vistazo sin abrir el movimiento:
// categoría+importe, fecha/establecimiento/etiqueta/origen, y el
// concepto (editable tocando la fila, como todo lo demás).
function MovementRow({
  expense: e,
  category,
  tag,
  onClick,
  extraAction,
}: {
  expense: Expense
  category: BudgetCategory | undefined
  tag: Tag | undefined
  onClick: () => void
  extraAction?: React.ReactNode
}) {
  const source = SOURCE_META[e.source]
  return (
    <div className="movement-row" onClick={onClick}>
      <span
        className="movement-row-dot"
        style={{ background: tag ? tag.color : 'transparent' }}
        title={tag ? `Etiqueta: ${tag.name}` : undefined}
        aria-hidden="true"
      />
      <div className="movement-row-body">
        <div className="movement-row-line">
          <span className="movement-row-category">
            {!e.isIncome && category?.icon} {e.isIncome ? 'Ingreso' : e.category}
          </span>
          <span className="price-row-price" style={{ color: e.isIncome ? '#1e8449' : undefined }}>
            {e.isIncome ? '+' : ''}
            {e.amount.toFixed(2)} €
          </span>
        </div>
        <div className="movement-row-line movement-row-meta muted">
          <span>
            {e.expenseDate}
            {e.store && ` · ${e.store}`}
            {e.kind !== 'real' && ` · ${e.kind}`}
            {tag && ` · ${tag.name}`}
          </span>
          <span title={source.label}>{source.icon}</span>
        </div>
        {e.notes && <div className="movement-row-line movement-row-notes muted">{e.notes}</div>}
      </div>
      {extraAction && (
        <span onClick={(ev) => ev.stopPropagation()} style={{ flex: 'none' }}>
          {extraAction}
        </span>
      )}
    </div>
  )
}

// Desplegable de etiqueta reutilizable — "Sin etiqueta" siempre
// disponible (Skill de Pepa: una etiqueta por movimiento, opcional).
function TagSelect({ value, onChange, tags }: { value: string; onChange: (v: string) => void; tags: Tag[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sin etiqueta</option>
      {tags.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}

// Editar cualquier movimiento de la lista de Gastos — categoría
// (desplegable real, ya no texto libre) para uno normal, o solo
// fecha/importe si es un ingreso (los ingresos no llevan categoría de
// presupuesto). Etiqueta, Debo/Necesito/Quiero y Fijo/variable se
// pueden asignar en los dos casos (Skill de Pepa, puntos 11/15/16).
function EditExpenseInline({
  expense,
  categories,
  tags,
  onDone,
  onCancel,
}: {
  expense: Expense
  categories: BudgetCategory[]
  tags: Tag[]
  onDone: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(expense.expenseDate)
  const [amount, setAmount] = useState(String(expense.amount))
  const [category, setCategory] = useState(expense.category)
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [store, setStore] = useState(expense.store ?? '')
  const [tagId, setTagId] = useState(expense.tagId ?? '')
  const [notes, setNotes] = useState(expense.notes ?? '')
  // Petición real: "quiero que yo pueda seleccionar cada gasto, si es
  // fijo o es variable" — por defecto sigue a la categoría (null),
  // pero este movimiento en concreto puede llevar su propia marca.
  const [isFixedOverride, setIsFixedOverride] = useState<boolean | null>(expense.isFixedOverride)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Skill de Pepa, puntos 15/16 — por defecto se hereda de la
  // categoría (automática, editable en "🗂️ Categorías" si la familia
  // no está de acuerdo con la de fábrica); Debo/Necesito/Quiero sigue
  // siendo solo por categoría, Fijo/Variable ya se puede pisar aquí.
  const classification = resolveCategoryClassification(category, categories)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateExpense(expense.id, {
        date,
        amount: Number(amount),
        category,
        tagId: tagId || null,
        isFixedOverride,
        notes,
        ...(expense.isIncome ? {} : { store }),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form" onClick={(e) => e.stopPropagation()}>
      {expense.isIncome ? (
        <label>
          Categoría
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
            {incomeCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Categoría
          <CategorySelect value={category} onChange={setCategory} categories={categories} />
        </label>
      )}
      <div className="inline-fields">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {!expense.isIncome && (
        <label>
          Establecimiento (opcional)
          <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
        </label>
      )}
      <label>
        Etiqueta (opcional)
        <TagSelect value={tagId} onChange={setTagId} tags={tags} />
      </label>
      <label>
        Concepto (opcional)
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anotación tuya sobre este movimiento"
        />
      </label>
      {!expense.isIncome && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {classification.necessity ? NECESSITY_LABELS[classification.necessity] : 'Sin clasificar'}
            {' — según la categoría, editable en el botón flotante "🗂️ Categorías".'}
          </p>
          {/* Petición real: "quiero que yo pueda seleccionar cada
              gasto, si es fijo o es variable" — a diferencia de
              Debo/Necesito/Quiero (solo por categoría), esto se puede
              pisar para este movimiento en concreto. */}
          <div className="filter-row" style={{ margin: '4px 0 0' }}>
            <button type="button" className={'chip' + (isFixedOverride === null ? ' chip-active' : '')} onClick={() => setIsFixedOverride(null)}>
              Según categoría{classification.isFixed != null ? ` (${classification.isFixed ? 'Fijo' : 'Variable'})` : ''}
            </button>
            <button type="button" className={'chip' + (isFixedOverride === true ? ' chip-active' : '')} onClick={() => setIsFixedOverride(true)}>
              Fijo
            </button>
            <button type="button" className={'chip' + (isFixedOverride === false ? ' chip-active' : '')} onClick={() => setIsFixedOverride(false)}>
              Variable
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// El único botón flotante de Gastos (petición real: "traslado el botón
// flotante de Presupuesto General a Gastos"): crear categorías de
// cualquiera de los dos grupos, reordenarlas con flechas, y apuntar un
// gasto eligiendo la categoría de una lista.
// Gestión de categorías — petición real: "Categorías contiene las
// Categorías (por orden alfabético) y Subcategorías y arriba lo
// primero debe tener un botón Crear nueva Categoría... quiero que aquí
// adaptes el mismo sistema que las subcategorías se desplieguen
// dándole a su categoría principal" (mismo patrón de disclosure que
// CategorySelect). El orden manual (↑/↓) se sustituye por alfabético
// aquí — más fácil de encontrar una categoría concreta que recordar en
// qué orden se fueron creando.
function CategoriesModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: BudgetCategory[]
  onClose: () => void
  onChanged: () => void
}) {
  // Petición real: "Alimentación y General que antes eran las
  // categorías principales se eliminan" — ya no se crean categorías
  // nuevas bajo 'alimentacion' (grupo retirado, la Alimentación real
  // vive dentro del árbol de 'generales', ver migración 0076).
  const [newCategoryGroup, setNewCategoryGroup] = useState<'generales' | 'ingresos'>('generales')
  const [addingCategory, setAddingCategory] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const generales = categories.filter((c) => c.budgetGroup === 'generales')
  const ingresos = categories.filter((c) => c.budgetGroup === 'ingresos')

  function renderClassification(c: BudgetCategory) {
    return (
      <div className="inline-fields" style={{ gap: 6, marginTop: 6 }}>
        <select
          value={c.necessity ?? ''}
          onChange={(e) => updateBudgetCategory(c.id, { necessity: (e.target.value || null) as 'debo' | 'necesito' | 'quiero' | null }).then(onChanged)}
          style={{ fontSize: 12, padding: '4px 6px' }}
        >
          <option value="">Sin clasificar</option>
          <option value="debo">Debo</option>
          <option value="necesito">Necesito</option>
          <option value="quiero">Quiero</option>
        </select>
        <select
          value={c.isFixed == null ? '' : c.isFixed ? 'fijo' : 'variable'}
          onChange={(e) => updateBudgetCategory(c.id, { isFixed: e.target.value === '' ? null : e.target.value === 'fijo' }).then(onChanged)}
          style={{ fontSize: 12, padding: '4px 6px' }}
        >
          <option value="">Sin clasificar</option>
          <option value="fijo">Fijo</option>
          <option value="variable">Variable</option>
        </select>
      </div>
    )
  }

  function renderGroup(label: string, list: BudgetCategory[], showClassification: boolean) {
    const topLevel = [...list.filter((c) => !c.parentId)].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return (
      <div style={{ marginBottom: 16 }}>
        <p className="muted" style={{ marginBottom: 4, fontWeight: 600 }}>
          {label}
        </p>
        <div className="category-picker-panel" style={{ maxHeight: 'none' }}>
          {topLevel.map((c) => {
            const children = [...list.filter((x) => x.parentId === c.id)].sort((a, b) => a.name.localeCompare(b.name, 'es'))
            const expanded = expandedId === c.id
            return (
              <div key={c.id}>
                <button type="button" className="category-picker-row" onClick={() => setExpandedId(expanded ? null : c.id)}>
                  <span style={{ flex: 1 }}>
                    {c.icon} {c.name}
                  </span>
                  <span className="muted">{expanded ? '▲' : '›'}</span>
                </button>
                {expanded && (
                  <div style={{ padding: '4px 12px 12px 28px', borderBottom: '1px solid #f1f1f1' }}>
                    {showClassification && renderClassification(c)}
                    <ConfirmIconButton
                      icon="✕ Eliminar esta categoría"
                      className="link-button"
                      ariaLabel={`Eliminar categoría ${c.name}`}
                      onConfirm={() => deleteBudgetCategory(c.id).then(onChanged)}
                    />
                    {children.map((child) => (
                      <div key={child.id} style={{ borderTop: '1px solid #f1f1f1', paddingTop: 8, marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <strong style={{ flex: 1, fontSize: 14 }}>
                            {child.icon} {child.name}
                          </strong>
                          <ConfirmIconButton
                            icon="✕"
                            className="link-button"
                            ariaLabel={`Eliminar categoría ${child.name}`}
                            onConfirm={() => deleteBudgetCategory(child.id).then(onChanged)}
                          />
                        </div>
                        {showClassification && renderClassification(child)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {topLevel.length === 0 && (
            <p className="muted" style={{ padding: 12 }}>
              Sin categorías todavía.
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Categorías
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <button type="button" className="link-button" onClick={() => setAddingCategory((v) => !v)}>
          {addingCategory ? 'Cerrar' : '+ Crear nueva categoría'}
        </button>
        {addingCategory && (
          <>
            <div className="filter-row" style={{ margin: '8px 0' }}>
              <button
                type="button"
                className={'chip' + (newCategoryGroup === 'generales' ? ' chip-active' : '')}
                onClick={() => setNewCategoryGroup('generales')}
              >
                Generales
              </button>
              <button
                type="button"
                className={'chip' + (newCategoryGroup === 'ingresos' ? ' chip-active' : '')}
                onClick={() => setNewCategoryGroup('ingresos')}
              >
                Ingresos
              </button>
            </div>
            <AddBudgetCategoryInline
              budgetGroup={newCategoryGroup}
              parentOptions={categories.filter((c) => c.budgetGroup === newCategoryGroup && !c.parentId)}
              onAdded={() => {
                setAddingCategory(false)
                onChanged()
              }}
            />
          </>
        )}

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        {renderGroup('Generales', generales, true)}
        {renderGroup('Ingresos', ingresos, false)}
      </div>
    </div>
  )
}

// Gestión de etiquetas — mismo patrón que CategoriesModal (crear
// arriba, lista alfabética debajo).
function TagsModal({ tags, onClose, onChanged }: { tags: Tag[]; onClose: () => void; onChanged: () => void }) {
  const [addingTag, setAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(DONUT_COLORS[0])
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  async function handleAddTag(e: FormEvent) {
    e.preventDefault()
    if (!newTagName.trim()) return
    await createTag({ name: newTagName.trim(), color: newTagColor })
    setNewTagName('')
    setNewTagColor(DONUT_COLORS[0])
    setAddingTag(false)
    onChanged()
  }

  async function handleSaveTag(id: string) {
    if (editName.trim()) await updateTag(id, { name: editName.trim(), color: editColor })
    setEditingTagId(null)
    onChanged()
  }

  const sorted = [...tags].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Etiquetas
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <button type="button" className="link-button" onClick={() => setAddingTag((v) => !v)}>
          {addingTag ? 'Cerrar' : '+ Crear nueva etiqueta'}
        </button>
        {addingTag && (
          <form onSubmit={handleAddTag} className="member-form" style={{ margin: '8px 0' }}>
            <div className="inline-fields">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Eric, Vacaciones…"
                autoFocus
                style={{ flex: 1 }}
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                style={{ flex: 'none', width: 44, padding: 4 }}
                aria-label="Color de la etiqueta"
              />
            </div>
            <button type="submit">Crear</button>
          </form>
        )}

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

        <div className="event-list">
          {sorted.map((t) =>
            editingTagId === t.id ? (
              <form
                key={t.id}
                className="inline-fields"
                style={{ marginBottom: 6 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSaveTag(t.id)
                }}
              >
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus style={{ flex: 1 }} />
                <input
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                  style={{ flex: 'none', width: 44, padding: 4 }}
                  aria-label="Color de la etiqueta"
                />
                <button type="submit">Guardar</button>
              </form>
            ) : (
              <div key={t.id} className="card task-card" style={{ padding: '6px 10px', gap: 6, fontSize: 13 }}>
                <button
                  type="button"
                  className="task-card-main"
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--text)', fontWeight: 400 }}
                  onClick={() => {
                    setEditingTagId(t.id)
                    setEditName(t.name)
                    setEditColor(t.color)
                  }}
                >
                  <strong style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
                    {t.name}
                  </strong>
                </button>
                <ConfirmIconButton icon="✕" className="link-button" ariaLabel={`Eliminar etiqueta ${t.name}`} onConfirm={() => deleteTag(t.id).then(onChanged)} />
              </div>
            ),
          )}
          {sorted.length === 0 && <p className="muted">Todavía no hay etiquetas.</p>}
        </div>
      </div>
    </div>
  )
}

// Formulario de nuevo movimiento en su propio modal, accesible desde
// cualquier pestaña de Economía con el botón flotante "➕ Movimiento".
function NewMovementModal({
  categories,
  onClose,
  onAdded,
}: {
  categories: BudgetCategory[]
  onClose: () => void
  onAdded: () => void
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Nuevo movimiento
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <AddExpenseToAnyCategoryInline categories={categories} onAdded={onAdded} />
      </div>
    </div>
  )
}

// Apuntar un gasto eligiendo la categoría de una lista (cualquiera de
// los dos grupos), sin tener que abrir antes su tarjeta.
function AddExpenseToAnyCategoryInline({
  categories,
  onAdded,
}: {
  categories: BudgetCategory[]
  onAdded: () => void
}) {
  // Petición real: "¿los ingresos dónde se apuntan? Debería ser en
  // gastos también... en el mismo formulario que se creen también
  // ingresos con un desplegable más" — mismo formulario, un chip
  // Gasto/Ingreso; un ingreso no lleva categoría de presupuesto ni
  // establecimiento, solo fecha e importe.
  const [isIncome, setIsIncome] = useState(false)
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [category, setCategory] = useState(categories[0]?.name ?? 'Alimentación')
  const [incomeCategory, setIncomeCategory] = useState(incomeCategories[0]?.name ?? 'Ingreso')
  const [store, setStore] = useState('')
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isIncome) {
        await addExpense({
          date,
          amount: Number(amount),
          category: incomeCategory,
          store: '',
          kind: 'real',
          isIncome: true,
          budgetGroup: 'generales',
        })
      } else {
        const matched = categories.find((c) => c.name === category)
        await addExpense({
          date,
          amount: Number(amount),
          category,
          store,
          kind: 'real',
          isIncome: false,
          budgetGroup: matched?.budgetGroup,
        })
      }
      setAmount('')
      setStore('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="member-form">
      <div className="filter-row">
        <button type="button" className={'chip' + (!isIncome ? ' chip-active' : '')} onClick={() => setIsIncome(false)}>
          Gasto
        </button>
        <button type="button" className={'chip' + (isIncome ? ' chip-active' : '')} onClick={() => setIsIncome(true)}>
          Ingreso
        </button>
      </div>
      {isIncome ? (
        <label>
          Categoría
          <select value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)}>
            {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
            {incomeCategories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Categoría
          <CategorySelect value={category} onChange={setCategory} categories={categories} />
        </label>
      )}
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      {!isIncome && (
        <label>
          Establecimiento (opcional)
          <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : isIncome ? 'Apuntar ingreso' : 'Apuntar gasto'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Tickets (Skill 10) — lectura automática con Gemini (nivel gratuito,
// la misma IA que reconoce alimentos en la foto de la nevera) en vez de
// OCR carácter-a-carácter: entiende el ticket como una foto completa,
// así que se le escapan muchos menos productos que a un OCR local en
// tickets arrugados o con letra pequeña. Alimenta el mismo historial de
// precios que ya usa la Memoria de la lista de la compra.
// ---------------------------------------------------------------------

// Nombre del ticket ya llevado al nombre de tienda DADO DE ALTA en
// Compras, si coincide con uno — así "MERCADONA, S.A." y "MERCADONA"
// se agrupan bajo el mismo "Mercadona" en vez de salir como grupos
// distintos por una simple diferencia de mayúsculas o de sufijo legal.
// Mismo truco ya probado que usa el reconocimiento de voz para tiendas
// (findKnownStore). Ojo: esto NO adivina que "H.Rafal II" es el mismo
// sitio que "Hiperber" — son palabras distintas de verdad, ninguna
// coincidencia de texto puede saber eso; para esos casos hay que
// corregir el ticket a mano una vez (el desplegable de abajo ya
// ofrece las tiendas dadas de alta para no tener que escribirlo).
const STORE_COLORS = ['#4C6EF5', '#e8590c', '#2f9e44', '#ae3ec9', '#f08c00', '#1098ad', '#e64980']

function canonicalStoreName(raw: string | null, knownStores: string[]): string {
  if (!raw || !raw.trim()) return 'Sin establecimiento'
  return findKnownStore(raw, knownStores)?.store ?? raw.trim()
}

// Petición real: "me creas también, aunque estén vacías, otras
// carpetas que sean de Aldi, Líder, Superdumbo... y con los
// supermercados que vayamos añadiendo, ya le vamos añadiendo más" —
// una carpeta por cada tienda YA DADA DE ALTA en Compras, aunque
// todavía no tenga ningún ticket guardado, no solo las que ya
// tuvieran alguno.
// Petición real: "que la estadística de compras por establecimientos
// se complete también con las compras hechas en supermercados
// importadas del banco, ya que no siempre se acordarán los usuarios de
// subir los tickets... que marque con un símbolo 'falta ticket' los
// que no se haya subido el ticket". hasTicket=false identifica un
// gasto de alimentación que llegó SOLO del banco (source='banco'),
// nunca conciliado con ningún ticket — ver ese cruce en ReceiptsTab.
// El genérico <T extends Receipt> conserva ese campo de principio a
// fin del reparto por tienda sin tocar la firma en cada sitio que ya
// llamaba a esta función solo con Receipt[] normales.
type DisplayReceipt = Receipt & { hasTicket: boolean }

function groupReceiptsByStore<T extends Receipt>(
  receipts: T[],
  knownStores: string[],
): { store: string; receipts: T[]; total: number }[] {
  const groups = new Map<string, T[]>()
  for (const s of knownStores) groups.set(s, [])
  for (const r of receipts) {
    const key = canonicalStoreName(r.store, knownStores)
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  return [...groups.entries()]
    .map(([store, list]) => ({
      store,
      receipts: list,
      total: list.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total)
}

// Petición real: "tienes que poner una pestaña para añadir
// supermercado, para añadir tienda" — directamente aquí, sin tener que
// ir a Compras para dar de alta una tienda nueva antes de poder
// guardarle un ticket.
function AddStoreInline({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createShoppingStore(name.trim())
      setName('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir la tienda')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="inline-fields" style={{ marginBottom: 12 }}>
      <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva tienda (p. ej. Aldi)" />
      <button type="submit" disabled={saving || !name.trim()}>
        + Añadir tienda
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

export function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [bankOnlyExpenses, setBankOnlyExpenses] = useState<Expense[]>([])
  const [knownStores, setKnownStores] = useState<string[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Petición real: "créame una carpeta dentro de ticket por cada
  // supermercado... que cuando yo le toque la carpeta de Mercadona, se
  // me abran todos los tickets que hay guardados" — plegado por
  // defecto, solo el nombre/total a la vista; tocar la carpeta la
  // abre. Empieza vacío (todas plegadas) hasta que se toque alguna.
  const [expandedStore, setExpandedStore] = useState<string | null>(null)
  const [rangePreset, setRangePreset] = useState<SpendRangePreset>('mes')
  const [rangeCustomFrom, setRangeCustomFrom] = useState(toDateStr(new Date()))
  const [rangeCustomTo, setRangeCustomTo] = useState(toDateStr(new Date()))

  function reload() {
    setLoading(true)
    Promise.all([listReceipts(), listExpenses(), listBudgetCategories()])
      .then(([r, allExpenses, cats]) => {
        setReceipts(r)
        setCategories(cats)
        // Un gasto de alimentación con source='banco' nunca ha pasado
        // por la conciliación con ningún ticket (la propia sincronización
        // del banco lo marcaría 'ticket_banco' en cuanto encontrara uno
        // — ver linkTransactionsToExpenses en enable-banking-sync-transactions).
        setBankOnlyExpenses(allExpenses.filter((e) => e.source === 'banco' && !e.isIncome && isFoodCategory(e.category, cats)))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    listShoppingStores()
      .then((rows) => setKnownStores(rows.map((s) => s.name)))
      .catch(() => {})
    listFamilyMembers().then(setMembers).catch(() => {})
  }, [])

  async function handleDelete(receipt: Receipt) {
    try {
      await deleteReceipt(receipt)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar')
    }
  }

  if (loading) return <p className="muted">Cargando tickets…</p>

  // Los tickets subidos a mano (o llegados por email de Amazon/Mercadona)
  // se completan con las compras de alimentación que solo se conocen por
  // el banco, para que el reparto por tienda no se quede corto solo
  // porque nadie subió el ticket ese día.
  const displayReceipts: DisplayReceipt[] = [
    ...receipts.map((r) => ({ ...r, hasTicket: true })),
    ...bankOnlyExpenses.map(
      (e): DisplayReceipt => ({
        id: `bank:${e.id}`,
        familyId: e.familyId,
        storagePath: null,
        store: e.store,
        receiptDate: e.expenseDate,
        totalAmount: e.amount,
        expenseId: e.id,
        notes: e.notes,
        category: e.category,
        purchasedByMemberId: null,
        hasTicket: false,
      }),
    ),
  ]

  const grouped = groupReceiptsByStore(displayReceipts, knownStores)
  const storeNames = grouped.map((g) => g.store)
  const [rangeFrom, rangeTo] = rangeForPreset(rangePreset, rangeCustomFrom, rangeCustomTo)
  const rangeFilteredReceipts = displayReceipts.filter((r) => r.receiptDate >= rangeFrom && r.receiptDate <= rangeTo)
  const rangeGrouped = groupReceiptsByStore(rangeFilteredReceipts, knownStores)

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <datalist id="receipt-known-stores">
        {knownStores.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {/* Petición real: "el aparato para subir tickets... arriba del
          todo" — antes iba al final de la lista. */}
      <ReceiptForm mode="add" onDone={reload} knownStores={knownStores} existingFolders={storeNames} categories={categories} members={members} />

      {/* Petición real: "reparto del gasto por tienda, eso me lo hace
          del total, y no quiero que me lo haga del total... que las
          estadísticas se ajusten al selector que tenemos arriba" — un
          único selector de fecha (arriba del todo) para el total, el
          reparto por tienda y el gasto mensual, en vez de uno nuevo en
          cada apartado. */}
      <ReceiptSpendSummary
        receipts={displayReceipts}
        knownStores={knownStores}
        storeNames={storeNames}
        preset={rangePreset}
        onPresetChange={setRangePreset}
        customFrom={rangeCustomFrom}
        onCustomFromChange={setRangeCustomFrom}
        customTo={rangeCustomTo}
        onCustomToChange={setRangeCustomTo}
      />

      {displayReceipts.length > 0 && (
        <>
          <StoreBreakdownChart groups={rangeGrouped} />
          <StoreMonthlyChart receipts={rangeFilteredReceipts} knownStores={knownStores} storeNames={storeNames} from={rangeFrom} to={rangeTo} />
        </>
      )}

      {/* Petición real: "créame una carpeta dentro de ticket por cada
          supermercado... que cuando yo le toque la carpeta de
          Mercadona, se me abran todos los tickets que hay guardados...
          que desaparezcan los tickets de ahí abajo y que ahí pongan
          las carpetas". Una carpeta por tienda, plegada por defecto
          (logo real, nombre, nº de tickets y total) — los tickets
          sueltos ya no se ven directamente, solo dentro de su carpeta.
          Una carpeta por cada tienda ya dada de alta, aunque no tenga
          tickets todavía (petición real: "aunque estén vacías, me
          creas las carpetas... y con los supermercados que vayamos
          añadiendo, ya le vamos añadiendo más" — de ahí el formulario
          de abajo para dar de alta una tienda nueva sin salir de aquí).
          Se filtran con el mismo selector de arriba (Hoy/Esta
          semana/Este mes/Este año/Rango) — petición real: "tickets
          guardados tengo de Mercadona 583, pero son los del mes pasado
          y los de este... quiero filtrarme solo por los de este mes o
          por esta semana". */}
      <h2 className="section-title">Tickets guardados</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Se filtran con el selector de arriba ({PRESET_LABELS[rangePreset]}).
      </p>
      <AddStoreInline onAdded={() => listShoppingStores().then((rows) => setKnownStores(rows.map((s) => s.name)))} />
      <div className="store-folder-grid">
        {rangeGrouped.map(({ store, receipts: storeReceipts, total }) => {
          const isOpen = expandedStore === store
          return (
            <div key={store} className="store-folder">
              <button
                type="button"
                className="store-folder-header"
                onClick={() => setExpandedStore(isOpen ? null : store)}
              >
                <span className="store-folder-icon">
                  <StoreIcon name={store} size={22} />
                </span>
                <span className="store-folder-info">
                  <strong>{store}</strong>
                  <span className="muted">
                    {storeReceipts.length} {storeReceipts.length === 1 ? 'compra' : 'compras'} · {total.toFixed(2)} €
                  </span>
                </span>
                <span className="store-folder-chevron">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="event-list store-folder-contents">
                  {storeReceipts.map((r) =>
                    editingId === r.id ? (
                      <ReceiptForm
                        key={r.id}
                        mode="edit"
                        receipt={r}
                        existingFolders={storeNames}
                        knownStores={knownStores}
                        categories={categories}
                        members={members}
                        onDone={() => {
                          setEditingId(null)
                          reload()
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <ReceiptRow
                        key={r.id}
                        receipt={r}
                        hasTicket={r.hasTicket}
                        members={members}
                        onEdit={() => setEditingId(r.id)}
                        onDelete={() => handleDelete(r)}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {receipts.length === 0 && <p className="muted">No hay tickets guardados.</p>}
    </div>
  )
}

// Petición real: "que se pueda ver por cada mes lo que he gastado...
// por meses, por años, por día, por semana o por rango de fecha que
// yo le ponga" — filtro de fecha con presets rápidos más un rango a
// medida, cruzado con la tienda (o todas), sobre el mismo dato ya
// cargado (sin ida y vuelta al servidor por cada cambio de filtro).
function ReceiptSpendSummary({
  receipts,
  knownStores,
  storeNames,
  preset,
  onPresetChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
}: {
  receipts: Receipt[]
  knownStores: string[]
  storeNames: string[]
  preset: SpendRangePreset
  onPresetChange: (p: SpendRangePreset) => void
  customFrom: string
  onCustomFromChange: (d: string) => void
  customTo: string
  onCustomToChange: (d: string) => void
}) {
  const [selectedStore, setSelectedStore] = useState('Todas')

  const [from, to] = rangeForPreset(preset, customFrom, customTo)

  const filtered = receipts.filter((r) => {
    if (r.receiptDate < from || r.receiptDate > to) return false
    if (selectedStore === 'Todas') return true
    return canonicalStoreName(r.store, knownStores) === selectedStore
  })
  const total = filtered.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0)

  return (
    <div className="card event-card">
      <strong>Cuánto he gastado</strong>
      <DateFilterTab
        preset={preset}
        onPresetChange={onPresetChange}
        customFrom={customFrom}
        onCustomFromChange={onCustomFromChange}
        customTo={customTo}
        onCustomToChange={onCustomToChange}
      />
      <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} style={{ marginBottom: 8 }}>
        <option value="Todas">Todas las tiendas</option>
        {storeNames.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <p>
        {total.toFixed(2)} € · {filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}
      </p>
    </div>
  )
}

// Petición real: "un gráfico general con lo que se gasta cada mes en
// todos los supermercados... Mercadona el setenta por ciento de las
// compras... Hiperber el treinta por ciento" — barras horizontales,
// una por tienda, con el importe y el % sobre el total de todas.
function StoreBreakdownChart({ groups }: { groups: { store: string; receipts: Receipt[]; total: number }[] }) {
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)
  const maxTotal = Math.max(...groups.map((g) => g.total), 1)
  return (
    <div className="card event-card">
      <strong>Reparto del gasto por tienda</strong>
      <div className="price-row-list" style={{ marginTop: 8 }}>
        {groups.map((g, i) => {
          const pct = grandTotal > 0 ? (g.total / grandTotal) * 100 : 0
          return (
            <div key={g.store} className="store-bar-row">
              <span className="price-row-name">{g.store}</span>
              <div className="store-bar-track">
                <div
                  className="store-bar-fill"
                  style={{ width: `${(g.total / maxTotal) * 100}%`, background: STORE_COLORS[i % STORE_COLORS.length] }}
                />
              </div>
              <span className="store-bar-value">
                {pct.toFixed(0)}% · {g.total.toFixed(2)} €
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Petición real: "un gráfico con lo que se va gastando cada mes en ese
// supermercado" — barras verticales, para la tienda elegida (o todas
// juntas), acotado al mismo selector de fecha de arriba (antes eran
// siempre los últimos 6 meses fijos, sin importar el filtro elegido).
function StoreMonthlyChart({
  receipts,
  knownStores,
  storeNames,
  from,
  to,
}: {
  receipts: Receipt[]
  knownStores: string[]
  storeNames: string[]
  from: string
  to: string
}) {
  const [selectedStore, setSelectedStore] = useState('Todas')

  const months = useMemo(() => {
    const start = new Date(from + 'T00:00')
    const end = new Date(to + 'T00:00')
    const list: string[] = []
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const last = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cursor <= last) {
      list.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return list
  }, [from, to])

  const totalsByMonth = useMemo(() => {
    const sums = new Map<string, number>()
    for (const r of receipts) {
      if (selectedStore !== 'Todas' && canonicalStoreName(r.store, knownStores) !== selectedStore) continue
      const month = r.receiptDate.slice(0, 7)
      sums.set(month, (sums.get(month) ?? 0) + (r.totalAmount ?? 0))
    }
    return sums
  }, [receipts, knownStores, selectedStore])

  const maxValue = Math.max(...months.map((m) => totalsByMonth.get(m) ?? 0), 1)

  return (
    <div className="card event-card">
      <strong>Gasto mensual</strong>
      <select value={selectedStore} onChange={(e) => setSelectedStore(e.target.value)} style={{ margin: '8px 0' }}>
        <option value="Todas">Todas las tiendas</option>
        {storeNames.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <div className="month-bar-chart">
        {months.map((m) => {
          const value = totalsByMonth.get(m) ?? 0
          const mo = Number(m.split('-')[1])
          return (
            <div key={m} className="month-bar-col">
              <div className="month-bar-track">
                <div className="month-bar-fill" style={{ height: `${(value / maxValue) * 100}%` }} title={`${value.toFixed(2)} €`} />
              </div>
              <span className="month-bar-label">
                {MONTH_LABELS[mo - 1].slice(0, 3)}
                <br />
                {value > 0 ? `${value.toFixed(0)}€` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Selector de categoría compartido entre el formulario de tickets y
// Movimientos — petición real: "ahora mismo es una lista eterna,
// quiero que se abra una lista de las categorías principales y
// tocándolas se desplieguen las subcategorías, así no se satura tanto
// el usuario". Dos pasos en vez de una lista plana con todo: primero
// las 11 categorías principales de la taxonomía del documento maestro,
// tocar una con subcategorías las despliega; las que no tienen
// subcategorías (u "Otros") se eligen directamente.
function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string
  onChange: (v: string) => void
  categories: BudgetCategory[]
}) {
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Petición real: "elijo una subcategoría y me devuelve a la lista de
  // categorías y no puedo cerrar la ventana" (iPhone) — sospecha de un
  // "click fantasma" de Safari/iOS que llega justo después de cerrarse
  // el modal y cae sobre el botón que queda al descubierto en esa misma
  // posición, reabriéndolo. Se ignora cualquier toque que reabra el
  // desplegable en los 400ms siguientes a haberlo cerrado.
  const closedAtRef = useRef(0)

  const generales = categories.filter((c) => c.budgetGroup === 'generales')
  const topLevel = generales.filter((c) => !c.parentId)
  const selected = generales.find((c) => c.name === value)
  const expandedParent = expandedId ? topLevel.find((c) => c.id === expandedId) : null
  const subcats = expandedParent ? generales.filter((c) => c.parentId === expandedParent.id) : []

  function pick(name: string) {
    onChange(name)
    closedAtRef.current = Date.now()
    setOpen(false)
    setExpandedId(null)
  }

  function close() {
    closedAtRef.current = Date.now()
    setOpen(false)
    setExpandedId(null)
  }

  function openPicker() {
    if (Date.now() - closedAtRef.current < 400) return
    setOpen(true)
  }

  return (
    <div>
      <button type="button" className="category-picker-toggle" onClick={openPicker}>
        <span>{selected ? `${selected.icon} ${selected.name}` : value || 'Elige una categoría'}</span>
        <span className="muted">▼</span>
      </button>
      {open && (
        // Petición real: "en el iPhone, al darle a una categoría padre se
        // cierra el desplegable y al reabrirlo se ven las subcategorías" —
        // el panel inline reflowaba la página bajo el dedo al expandir, y
        // Safari en iOS disparaba un click fantasma sobre el botón que
        // había quedado en esa posición, cerrando el desplegable justo
        // después de abrirlo. Al ser ahora una ventana emergente fija, el
        // resto de la página ya no se mueve al expandir una categoría.
        <div className="modal-overlay" onClick={close}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                {expandedParent ? `${expandedParent.icon} ${expandedParent.name}` : 'Elige una categoría'}
              </h2>
              <button type="button" className="modal-close" onClick={close}>
                ✕
              </button>
            </div>
            <div className="category-picker-panel" style={{ maxHeight: 'none', border: 'none' }}>
              {expandedParent ? (
                <>
                  <button type="button" className="link-button" style={{ padding: '6px 4px' }} onClick={() => setExpandedId(null)}>
                    ‹ Volver a categorías
                  </button>
                  <button type="button" className="category-picker-row" onClick={() => pick(expandedParent.name)}>
                    {expandedParent.icon} {expandedParent.name} <span className="muted">(sin subcategoría)</span>
                  </button>
                  {subcats.map((c) => (
                    <button key={c.id} type="button" className="category-picker-row" onClick={() => pick(c.name)}>
                      {c.icon} {c.name}
                    </button>
                  ))}
                </>
              ) : (
                topLevel.map((c) => {
                  const hasChildren = generales.some((x) => x.parentId === c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="category-picker-row"
                      onClick={() => (hasChildren ? setExpandedId(c.id) : pick(c.name))}
                    >
                      {c.icon} {c.name} {hasChildren && <span className="muted">›</span>}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReceiptRow({
  receipt,
  hasTicket,
  members,
  onEdit,
  onDelete,
}: {
  receipt: Receipt
  hasTicket: boolean
  members: FamilyMember[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [lines, setLines] = useState<ReceiptLineDetail[] | null>(null)
  const [loadingLines, setLoadingLines] = useState(false)
  const [viewing, setViewing] = useState(false)

  const purchaser = receipt.purchasedByMemberId ? members.find((m) => m.id === receipt.purchasedByMemberId) : null

  async function handleToggleExpand() {
    // Un gasto solo del banco (sin ticket subido) nunca tiene líneas de
    // producto que leer — no hay nada que desplegar.
    if (!hasTicket) return
    setExpanded((prev) => !prev)
    if (lines === null) {
      setLoadingLines(true)
      try {
        setLines(await listProductPricesByReceipt(receipt.id))
      } catch {
        setLines([])
      } finally {
        setLoadingLines(false)
      }
    }
  }

  async function handleViewTicket() {
    if (!receipt.storagePath || viewing) return
    setViewing(true)
    try {
      const url = await getReceiptUrl(receipt.storagePath)
      window.open(url, '_blank')
    } finally {
      setViewing(false)
    }
  }

  return (
    <div className="card receipt-row">
      <div className="receipt-row-main">
        <button type="button" className="receipt-row-summary" onClick={handleToggleExpand}>
          <span>{receipt.receiptDate}</span>
          {receipt.totalAmount != null && <span> · {receipt.totalAmount.toFixed(2)} €</span>}
          <span> · {receipt.category}</span>
          {purchaser && <span className="muted"> · {purchaser.name}</span>}
          {/* Petición real: "que marque con un símbolo 'falta ticket'
              los que no se haya subido el ticket" — este gasto se sabe
              solo por el banco, nadie ha subido la foto del ticket
              todavía; se edita/categoriza desde Movimientos o Banco, no
              aquí (no hay ningún ticket real que editar). */}
          {!hasTicket && (
            <span className="muted receipt-row-missing-ticket" title="Este gasto llegó del banco — nadie ha subido su ticket todavía">
              📎 falta ticket
            </span>
          )}
        </button>
        <div className="receipt-row-actions">
          {hasTicket ? (
            <>
              {receipt.storagePath && (
                <button type="button" className="icon-button" onClick={handleViewTicket} aria-label="Ver ticket" title="Ver ticket">
                  👁
                </button>
              )}
              <button type="button" className="icon-button" onClick={onEdit} aria-label="Editar ticket" title="Editar">
                ✏️
              </button>
              <ConfirmIconButton icon="✕" onConfirm={onDelete} ariaLabel="Borrar ticket" className="icon-button" />
            </>
          ) : (
            <span className="muted" style={{ fontSize: 12 }}>
              Ver en Banco →
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="receipt-row-detail">
          {loadingLines && <p className="muted">Cargando detalle…</p>}
          {!loadingLines && lines && lines.length === 0 && (
            <p className="muted">No se guardó el detalle de productos de este ticket.</p>
          )}
          {!loadingLines &&
            lines &&
            lines.map((l) => (
              <p key={l.id} className="muted receipt-row-detail-line">
                {l.name}
                {l.quantity && ` · ${l.quantity} ud`} · {l.price.toFixed(2)} €/ud
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

interface DraftLine {
  name: string
  quantity: string
  price: string // importe TOTAL de la línea (cantidad × precio unitario), no el precio por unidad
}

type OcrStatus = 'idle' | 'reading' | 'done' | 'error'

// Mismo formulario para subir un ticket nuevo y para editar uno ya
// guardado (petición real: "cuando se quiera editar el ticket debe
// abrirse el mismo formulario que para subirlo") — en modo edición se
// precarga con los datos del ticket y sus líneas ya leídas (reconstruidas
// desde el Historial, Skill 09), y no hay selector de foto/OCR porque el
// archivo ya está subido.
function ReceiptForm({
  mode,
  receipt,
  onDone,
  onCancel,
  knownStores,
  existingFolders,
  categories,
  members,
}: {
  mode: 'add' | 'edit'
  receipt?: Receipt
  onDone: () => void
  onCancel?: () => void
  knownStores: string[]
  existingFolders: string[]
  categories: BudgetCategory[]
  members: FamilyMember[]
}) {
  const [file, setFile] = useState<File | null>(null)
  const [store, setStore] = useState(receipt?.store ?? '')
  const [receiptDate, setReceiptDate] = useState(receipt?.receiptDate ?? toDateStr(new Date()))
  const [totalAmount, setTotalAmount] = useState(receipt?.totalAmount != null ? String(receipt.totalAmount) : '')
  const [category, setCategory] = useState(receipt?.category ?? 'Alimentación')
  const [purchasedByMemberId, setPurchasedByMemberId] = useState(receipt?.purchasedByMemberId ?? '')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle')
  const [loadingLines, setLoadingLines] = useState(mode === 'edit')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'edit' || !receipt) return
    listProductPricesByReceipt(receipt.id)
      .then((detail) =>
        setLines(
          detail.map((l) => {
            const qty = Number(l.quantity)
            const totalLinePrice = Number.isFinite(qty) && qty > 0 ? l.price * qty : l.price
            return { name: l.name, quantity: l.quantity ?? '1', price: totalLinePrice.toFixed(2) }
          }),
        ),
      )
      .catch(() => {})
      .finally(() => setLoadingLines(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, receipt?.id])

  async function handleReadTicket() {
    if (!file) return
    setOcrStatus('reading')
    setError(null)
    try {
      const parsed = await analyzeReceiptPhoto(file)
      // Lleva "MERCADONA, S.A." al nombre ya dado de alta en Compras
      // ("Mercadona") cuando coincide, para no crear un grupo de
      // tickets distinto por cada variante del mismo nombre.
      if (parsed.store) setStore(findKnownStore(parsed.store, knownStores)?.store ?? parsed.store)
      if (parsed.date) setReceiptDate(parsed.date)
      if (parsed.total != null) setTotalAmount(String(parsed.total))
      setLines(parsed.items.map((l) => ({ name: l.name, quantity: String(l.quantity), price: l.price.toFixed(2) })))
      setOcrStatus('done')
    } catch (err) {
      setOcrStatus('error')
      setError(err instanceof Error ? err.message : 'No se pudo leer el ticket')
    }
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  function addBlankLine() {
    setLines((prev) => [...prev, { name: '', quantity: '1', price: '' }])
  }

  async function saveLines(receiptId: string) {
    // En paralelo, no uno a uno: con muchos productos leídos, guardarlos
    // en serie tardaba tanto (una llamada de red por línea) que parecía
    // que se había quedado colgado en "Subiendo…" — bug real detectado
    // al probar con un ticket de varias líneas.
    await Promise.all(
      lines
        .filter((line) => line.name.trim() && !Number.isNaN(Number(line.price)))
        .map((line) => {
          // "Precio" es el importe TOTAL de la línea ("3 cervezas,
          // 3,30€"), no el precio de una — bug real reportado: se
          // guardaba tal cual y la Memoria de precios enseñaba 3,30€
          // como si fuera el precio de una unidad. Se divide entre
          // las unidades para guardar siempre precio por unidad.
          const units = Number(line.quantity)
          const unitPrice = Number.isFinite(units) && units > 0 ? Number(line.price) / units : Number(line.price)
          return recordProductPurchase({
            name: line.name.trim(),
            price: unitPrice,
            quantity: line.quantity || '1',
            unit: '',
            store,
            date: receiptDate,
            receiptId,
          })
        }),
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'add' && !file) {
      setError('Elige una foto o archivo del ticket')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'add') {
        const receiptId = await uploadReceipt({
          file: file!,
          store,
          receiptDate,
          totalAmount: totalAmount ? Number(totalAmount) : null,
          category,
          purchasedByMemberId: purchasedByMemberId || null,
        })
        await saveLines(receiptId)
        setFile(null)
        setStore('')
        setTotalAmount('')
        setCategory('Alimentación')
        setPurchasedByMemberId('')
        setLines([])
        setOcrStatus('idle')
      } else if (receipt) {
        await updateReceipt(receipt.id, {
          store,
          receiptDate,
          totalAmount: totalAmount ? Number(totalAmount) : null,
          category,
          purchasedByMemberId: purchasedByMemberId || null,
        })
        // Se sustituyen todas las líneas por las editadas, en vez de
        // intentar emparejar una a una con las que ya había.
        await deleteProductPricesByReceipt(receipt.id)
        await saveLines(receipt.id)
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      {mode === 'add' && (
        <>
          <h2>Subir ticket</h2>
          <p className="muted">
            La foto del ticket se guarda solo los últimos 3 meses; pasado ese tiempo se borra la foto
            (la tienda, la fecha y el importe se quedan igual).
          </p>
          <label>Foto o archivo</label>
          <FileOrPdfPicker
            file={file}
            onChange={(f) => {
              setFile(f)
              setLines([])
              setOcrStatus('idle')
            }}
          />

          {file && (
            <button type="button" className="voice-mic-button" onClick={handleReadTicket} disabled={ocrStatus === 'reading'}>
              {ocrStatus === 'reading' ? 'Leyendo ticket… puede tardar unos segundos' : '📷 Leer ticket'}
            </button>
          )}
        </>
      )}

      {/* Petición real: "el ticket, ¿dónde quiero guardarlo? en
          Mercadona, en Hiperber, en Aldi, donde yo quiera" / "¿puedo yo
          decir dónde se meten? porque H Rafal II e Hiperber es lo
          mismo" — tocar la carpeta de destino en vez de escribirla.
          Antes era una fila de chips (uno por tienda) que ocupaba toda
          la pantalla con muchas tiendas — petición real: "ahí me haces
          un desplegable y me pones todas las tiendas que hay arriba me
          las metes dentro del desplegable, así damos con la aplicación
          más ordenada". */}
      {existingFolders.length > 0 && (
        <label>
          {mode === 'add' ? '¿Dónde guardo este ticket?' : 'Mover a esta carpeta'}
          <select value={existingFolders.includes(store) ? store : ''} onChange={(e) => e.target.value && setStore(e.target.value)}>
            <option value="">— Elegir tienda —</option>
            {existingFolders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Establecimiento
        <input
          type="text"
          list="receipt-known-stores"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="Mercadona"
        />
      </label>
      <label>
        Fecha
        <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
      </label>
      <label>
        Importe total (€)
        <input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
      </label>
      <label>
        Categoría
        <CategorySelect value={category} onChange={setCategory} categories={categories} />
      </label>
      <label>
        ¿Quién hizo la compra? (opcional)
        <select value={purchasedByMemberId} onChange={(e) => setPurchasedByMemberId(e.target.value)}>
          <option value="">—</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      {loadingLines && <p className="muted">Cargando productos leídos…</p>}
      {!loadingLines && (ocrStatus === 'done' || mode === 'edit' || lines.length > 0) && (
        <div className="day-modal-group">
          <p className="muted">
            Productos leídos — revisa y corrige antes de guardar. "Cant." es cuántas unidades se compraron
            (p. ej. 2 bolsas) y "Precio" el importe total de esa línea, no el precio de una sola unidad.
          </p>
          {lines.map((line, i) => (
            <div key={i} className="receipt-line-row">
              <input
                type="text"
                value={line.name}
                onChange={(e) => updateLine(i, { name: e.target.value })}
                placeholder="Producto"
              />
              <input
                type="number"
                className="receipt-line-qty"
                min={1}
                step={1}
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                placeholder="Cant."
                title="Cantidad comprada"
              />
              <input
                type="number"
                step="0.01"
                value={line.price}
                onChange={(e) => updateLine(i, { price: e.target.value })}
                placeholder="Precio total"
              />
              <button type="button" className="link-button" onClick={() => removeLine(i)}>
                ✕
              </button>
              {/* Mismo cálculo que se guarda de verdad — para pillar un
                  fallo de lectura antes de guardar, no después. */}
              {Number(line.quantity) > 1 && !Number.isNaN(Number(line.price)) && (
                <span className="muted">= {(Number(line.price) / Number(line.quantity)).toFixed(2)} €/ud</span>
              )}
            </div>
          ))}
          {lines.length === 0 && <p className="muted">No se ha reconocido ningún producto.</p>}
          <button type="button" className="link-button" onClick={addBlankLine}>
            + Añadir línea
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : mode === 'add' ? 'Guardar ticket' : 'Guardar'}
        </button>
        {mode === 'edit' && (
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------
// Presupuestos (Skill 19)
// ---------------------------------------------------------------------

// Petición real: "un esquema de estadística, pero que sea redondo,
// como un quesito... la porción que se gasta de Mercadona, la porción
// de Hiperber... el tanto por ciento con el precio que corresponde" —
// mismo dato que el reparto por tienda de Tickets, pero como tarta en
// vez de barras. Mismo dónut tocable que el resto de la app (sin
// lista aparte): tocar una porción la resalta y muestra su importe en
// el centro.
function StorePieChart({ groups, monthLabel }: { groups: { store: string; total: number }[]; monthLabel: string }) {
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const grandTotal = groups.reduce((sum, g) => sum + g.total, 0)
  const slices = groups.map((g) => ({ key: g.store, total: g.total }))
  const highlightedSlice = groups.find((g) => g.store === highlighted)
  const centerLabel = highlightedSlice ? { name: highlightedSlice.store, total: highlightedSlice.total } : { name: 'Todo', total: grandTotal }

  return (
    <div className="card event-card">
      <strong>Reparto del gasto por tienda — {monthLabel}</strong>
      {grandTotal === 0 ? (
        <p className="muted">No hay tickets guardados ese mes.</p>
      ) : (
        <SvgDonut
          slices={slices}
          centerLabel={centerLabel}
          highlightedKey={highlighted}
          onSliceClick={(key) => setHighlighted((prev) => (prev === key ? null : key))}
          colors={STORE_COLORS}
        />
      )}
    </div>
  )
}

// Petición real: "cuando termina el mes, guardamos el presupuesto en
// el mes que corresponda... con lo que hemos gastado, como en un
// historial para poder consultarlo" — no hace falta "archivar" nada a
// mano: cada presupuesto ya lleva su propio mes (periodStart) y los
// gastos/tickets ya guardan su fecha para siempre, así que el
// historial YA EXISTE, solo hacía falta poder pasar de mes en mes
// para verlo, en vez de una lista larga con todos los meses
// mezclados. Mismo patrón de navegación que Gastos.
// Categorías con las que se siembra Presupuesto Generales la primera
// vez que se abre esa pestaña (petición real: "luz, agua, impuestos,
// taller, imprevistos, hipoteca, préstamos, gastos escolares... con
// emojis y nombres").
// Categorías de INGRESO sugeridas (petición real: "sueldo, regalo,
// ingreso") — mismo mecanismo que las de gasto, solo que agrupadas
// bajo 'ingresos' en vez de 'alimentacion'/'generales', así nunca
// entran por error en ningún cálculo de presupuesto (esos solo miran
// gastos, nunca ingresos, y solo esos dos grupos).
const INCOME_CATEGORY_SEED: { name: string; icon: string }[] = [
  { name: 'Sueldo', icon: '💼' },
  { name: 'Regalo', icon: '🎁' },
  { name: 'Ingreso', icon: '💰' },
]

interface CategorySeed {
  name: string
  icon: string
  necessity: 'debo' | 'necesito' | 'quiero' | null
  isFixed: boolean | null
  children?: CategorySeed[]
}

// Skill de Pepa, punto 9: taxonomía maestra del documento — 11
// categorías de gasto con sus subcategorías, clasificadas de fábrica
// en fijo/variable y debo/necesito/quiero según estándares contables
// habituales (debo: obligación contractual o legal; necesito: consumo
// básico; quiero: discrecional. fijo: importe recurrente pactado;
// variable: fluctúa con el consumo) — petición real: "la adjudicación
// no debería ser manual sino automática... clasificar cada categoría
// desde un principio, editable si se quiere después". Reemplaza la
// lista suelta anterior (Luz, Agua, Impuestos...); las familias que ya
// tenían esas categorías las conservan (0076_category_necessity_taxonomy.sql
// las integró en este mismo árbol).
const MASTER_CATEGORY_SEED: CategorySeed[] = [
  {
    name: 'Alimentación',
    icon: '🛒',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Supermercado, carnicería y tiendas de alimentación', icon: '🛒', necessity: 'necesito', isFixed: false },
      { name: 'Restaurantes, bares y cafeterías', icon: '🍽️', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Vivienda y hogar',
    icon: '🏠',
    necessity: 'necesito',
    isFixed: true,
    children: [
      { name: 'Alquiler / hipoteca', icon: '🏦', necessity: 'debo', isFixed: true },
      { name: 'Suministros', icon: '💡', necessity: 'necesito', isFixed: true },
      { name: 'Mantenimiento y hogar', icon: '🔨', necessity: 'necesito', isFixed: false },
      { name: 'Seguro de hogar', icon: '🛡️', necessity: 'debo', isFixed: true },
    ],
  },
  {
    name: 'Transporte y vehículo',
    icon: '🚗',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Combustible', icon: '⛽', necessity: 'necesito', isFixed: false },
      { name: 'Aparcamiento y peajes', icon: '🅿️', necessity: 'necesito', isFixed: false },
      { name: 'Transporte público / taxi', icon: '🚕', necessity: 'necesito', isFixed: false },
      { name: 'Mantenimiento y reparaciones', icon: '🔧', necessity: 'necesito', isFixed: false },
      { name: 'Seguro / financiación del vehículo', icon: '🚙', necessity: 'debo', isFixed: true },
    ],
  },
  {
    name: 'Compras y familia',
    icon: '🛍️',
    necessity: 'quiero',
    isFixed: false,
    children: [
      { name: 'Ropa y accesorios', icon: '👕', necessity: 'necesito', isFixed: false },
      { name: 'Niños', icon: '🧸', necessity: 'necesito', isFixed: false },
      { name: 'Casa y jardín', icon: '🏡', necessity: 'quiero', isFixed: false },
      { name: 'Tecnología y electrónica', icon: '📺', necessity: 'quiero', isFixed: false },
      { name: 'Mascotas', icon: '🐾', necessity: 'necesito', isFixed: false },
      { name: 'Regalos y compras varias', icon: '🎁', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Salud y bienestar',
    icon: '⚕️',
    necessity: 'necesito',
    isFixed: false,
    children: [
      { name: 'Salud y farmacia', icon: '💊', necessity: 'necesito', isFixed: false },
      { name: 'Belleza y cuidado personal', icon: '💅', necessity: 'quiero', isFixed: false },
      { name: 'Deporte y fitness', icon: '🏋️', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Ocio y viajes',
    icon: '🌴',
    necessity: 'quiero',
    isFixed: false,
    children: [
      { name: 'Ocio y cultura', icon: '🎭', necessity: 'quiero', isFixed: false },
      { name: 'Aficiones', icon: '🎨', necessity: 'quiero', isFixed: false },
      { name: 'Suscripciones y entretenimiento', icon: '🎬', necessity: 'quiero', isFixed: true },
      { name: 'Viajes y vacaciones', icon: '✈️', necessity: 'quiero', isFixed: false },
      { name: 'Eventos y celebraciones', icon: '🎉', necessity: 'quiero', isFixed: false },
    ],
  },
  {
    name: 'Comunicaciones y servicios',
    icon: '📱',
    necessity: 'necesito',
    isFixed: true,
    children: [
      { name: 'Teléfono e Internet', icon: '📶', necessity: 'necesito', isFixed: true },
      { name: 'Software y aplicaciones', icon: '💻', necessity: 'quiero', isFixed: true },
      { name: 'Otros servicios', icon: '🔌', necessity: 'necesito', isFixed: false },
    ],
  },
  {
    name: 'Finanzas y obligaciones',
    icon: '📑',
    necessity: 'debo',
    isFixed: true,
    children: [
      { name: 'Impuestos', icon: '🧾', necessity: 'debo', isFixed: true },
      { name: 'Préstamos e intereses', icon: '💳', necessity: 'debo', isFixed: true },
      { name: 'Seguros', icon: '🔒', necessity: 'debo', isFixed: true },
      { name: 'Comisiones y cargos', icon: '💸', necessity: 'debo', isFixed: false },
      { name: 'Multas / obligaciones', icon: '🚨', necessity: 'debo', isFixed: false },
      { name: 'Asesoría', icon: '🧑‍💼', necessity: 'debo', isFixed: false },
    ],
  },
  {
    name: 'Ahorro e inversión',
    icon: '💰',
    necessity: null,
    isFixed: null,
    children: [
      { name: 'Ahorro', icon: '🐷', necessity: null, isFixed: true },
      { name: 'Inversiones', icon: '📈', necessity: null, isFixed: false },
    ],
  },
  {
    name: 'Movimientos internos',
    icon: '🔄',
    necessity: null,
    isFixed: null,
    children: [{ name: 'Transferencias entre cuentas propias', icon: '🔁', necessity: null, isFixed: null }],
  },
  { name: 'Otros', icon: '📦', necessity: null, isFixed: null },
]

// Crea un árbol de dos niveles de golpe: primero las principales, y
// con sus ids ya reales las subcategorías apuntando a ellas (mismo
// mecanismo que ya usaba el sembrado plano, ahora con clasificación
// incluida).
async function seedCategoryTree(seed: CategorySeed[], budgetGroup: string): Promise<void> {
  const topInserted = await createBudgetCategoriesBulk(
    seed.map((s) => ({ name: s.name, icon: s.icon, budgetGroup, necessity: s.necessity, isFixed: s.isFixed })),
  )
  const idByName = new Map(topInserted.map((r) => [r.name, r.id]))
  const childInputs = seed.flatMap((s) =>
    (s.children ?? []).map((child) => ({
      name: child.name,
      icon: child.icon,
      budgetGroup,
      parentId: idByName.get(s.name) ?? null,
      necessity: child.necessity,
      isFixed: child.isFixed,
    })),
  )
  if (childInputs.length > 0) await createBudgetCategoriesBulk(childInputs)
}

// Presupuesto Alimentación y Presupuesto Generales son la MISMA
// pantalla, solo cambia el "grupo" de categorías/presupuestos que
// muestra cada una — petición real: "que todos los presupuestos estén
// conectados". Por eso BudgetsOverview (abajo) lee de TODOS los
// grupos a la vez: las estadísticas y el informe salen iguales se
// entre desde una pestaña o desde la otra.
export function BudgetsTab({
  group,
  seedCategories,
}: {
  group: string
  seedCategories: CategorySeed[]
}) {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [knownStores, setKnownStores] = useState<string[]>([])
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(toDateStr(new Date()).slice(0, 7))
  const [monthStartDay, setMonthStartDay] = useState(1)
  // Evita sembrar las categorías sugeridas más de una vez por sesión
  // mientras se espera la respuesta del primer alta.
  const seededRef = useRef(false)

  function reload() {
    setLoading(true)
    Promise.all([listBudgets(), listExpenses(), listReceipts(), listShoppingStores(), listBudgetCategories(), getFinanceMonthStartDay()])
      .then(async ([b, e, r, stores, cats, monthStart]) => {
        // Primera vez que se abre esta pestaña y no tiene categorías
        // propias todavía — se dan de alta las sugeridas solas, sin
        // pedirlo (petición real: "me pones todas esas categorías").
        if (!seededRef.current && seedCategories.length > 0 && !cats.some((c) => c.budgetGroup === group)) {
          seededRef.current = true
          await seedCategoryTree(seedCategories, group)
          cats = await listBudgetCategories()
        }
        setBudgets(b)
        setExpenses(e)
        setReceipts(r)
        setKnownStores(stores.map((s) => s.name))
        setCategories(cats)
        setMonthStartDay(monthStart)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, []) // eslint-disable-line react-hooks/exhaustive-deps

  function shiftMonth(delta: number) {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setVisibleMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  if (loading) return <p className="muted">Cargando presupuestos…</p>

  const [visibleYear, visibleMonthIndex] = visibleMonth.split('-').map(Number)
  const groupCategories = categories.filter((c) => c.budgetGroup === group)
  const groupBudgets = budgets.filter((b) => b.budgetGroup === group)
  // Solo los tickets clasificados como Alimentación cuentan aquí —
  // petición real: "ahora también hay tickets que no son de
  // Alimentación (Amazon...), esos no se deberían detallar en el
  // registro de Alimentación". El resto (Casa y Jardín, Amazon sin
  // clasificar...) no aparece ni en este desglose por tienda ni en el
  // total.
  const foodReceipts = receipts.filter(
    (r) => r.receiptDate.startsWith(visibleMonth) && isFoodCategory(r.category, categories),
  )
  const pieGroups = groupReceiptsByStore(foodReceipts, knownStores)

  // El total de Alimentación (y el de cada categoría) sale SIEMPRE de
  // `expenses`, nunca sumando receipts.total_amount aparte — cada
  // ticket con importe ya crea su propio gasto real con la misma
  // categoría (uploadReceipt), así que sumar las dos cosas contaría el
  // mismo euro dos veces. Ver domain/finance.ts (isFoodCategory /
  // budgetSpent) para la misma regla aplicada a los presupuestos
  // guardados.
  const monthRealExpenses = expenses.filter(
    (e) => e.expenseDate.startsWith(visibleMonth) && !e.isIncome && e.kind === 'real',
  )
  const alimentacionTotal = monthRealExpenses
    .filter((e) => isFoodCategory(e.category, categories))
    .reduce((sum, e) => sum + e.amount, 0)
  const generalesCategoriesTotal = groupCategories
    .map((c) => monthRealExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0))
    .reduce((sum, t) => sum + t, 0)
  const categoryPieSlices =
    group === 'generales'
      ? [
          ...groupCategories
            .map((c) => ({
              store: `${c.icon} ${c.name}`,
              total: monthRealExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0),
            }))
            .filter((s) => s.total > 0),
          // 🛒 y no 🍽️ a propósito — petición real: "se ha colado el
          // emoticono de restaurantes aunque no hay gastos de
          // restaurantes". Esta porción es TODO el gasto de Alimentación
          // (tickets de compra, no comer fuera), así que el icono de
          // carrito es el que no confunde.
          { store: '🛒 Alimentación (total)', total: alimentacionTotal },
        ].filter((s) => s.total > 0)
      : []

  // Presupuesto total del mes con su barra de % gastado — solo existe
  // en Generales ahora. Alimentación ya no tiene presupuesto/límite
  // propio, se queda como puro registro (petición real: "el
  // presupuesto general deduce todos los gastos como un único
  // presupuesto") — el gastado de Generales suma sus categorías MÁS
  // el total de Alimentación completo.
  const groupSpentTotal = generalesCategoriesTotal + alimentacionTotal
  const overallBudget =
    groupBudgets.find((b) => !b.category && budgetPeriodRange(b).start.slice(0, 7) === visibleMonth) ?? null

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <BudgetsOverview allExpenses={expenses} allCategories={categories} group={group} onChanged={reload} monthStartDay={monthStartDay} />

      <div className="month-nav">
        <button type="button" className="link-button" onClick={() => shiftMonth(-1)}>
          ‹
        </button>
        <strong>
          {MONTH_LABELS[visibleMonthIndex - 1]} {visibleYear}
        </strong>
        <button type="button" className="link-button" onClick={() => shiftMonth(1)}>
          ›
        </button>
        <input
          type="month"
          value={visibleMonth}
          onChange={(e) => e.target.value && setVisibleMonth(e.target.value)}
        />
        <button type="button" className="link-button" onClick={() => setVisibleMonth(toDateStr(new Date()).slice(0, 7))}>
          Hoy
        </button>
      </div>

      {group === 'alimentacion' ? (
        <div className="card event-card">
          <strong>Total registrado en Alimentación</strong>
          <p style={{ margin: '4px 0' }}>{alimentacionTotal.toFixed(2)} €</p>
          <p className="muted" style={{ margin: 0 }}>
            Solo registro — no resta de ningún presupuesto. Cuenta para el Presupuesto General.
          </p>
        </div>
      ) : (
        <OverallBudgetCard
          group={group}
          visibleMonth={visibleMonth}
          budget={overallBudget}
          spent={groupSpentTotal}
          onChanged={reload}
        />
      )}

      {group === 'alimentacion' && (
        <StorePieChart groups={pieGroups} monthLabel={`${MONTH_LABELS[visibleMonthIndex - 1]} ${visibleYear}`} />
      )}
      {group === 'generales' && categoryPieSlices.length > 0 && (
        <StorePieChart groups={categoryPieSlices} monthLabel={`${MONTH_LABELS[visibleMonthIndex - 1]} ${visibleYear}`} />
      )}

      {group === 'alimentacion' ? (
        <BudgetCategoriesSection
          categories={groupCategories}
          budgetGroup={group}
          monthExpenses={monthRealExpenses}
          onChanged={reload}
        />
      ) : (
        <GeneralesCategoriesSection categories={groupCategories} monthExpenses={monthRealExpenses} />
      )}

      {group === 'generales' && (
        <BudgetMonthFolders
          budgets={groupBudgets}
          expenses={expenses}
          categories={categories}
          group={group}
          onChanged={reload}
        />
      )}
    </div>
  )
}

// Presupuesto total del mes con su barra de % gastado — petición real:
// "si tengo 800€ de presupuesto para comida... voy gastando 200,
// 250... qué tanto por ciento voy gastando, cada vez que añado una
// compra" (y lo mismo en Generales, con 4000€ sumando todas sus
// categorías más el total de Alimentación). Sin presupuesto puesto
// todavía para este mes, pide el importe; una vez puesto, se puede
// cambiar en cualquier momento.
function OverallBudgetCard({
  group,
  visibleMonth,
  budget,
  spent,
  onChanged,
}: {
  group: string
  visibleMonth: string
  budget: Budget | null
  spent: number
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (budget) await deleteBudget(budget.id)
      await createBudget({
        periodType: 'mensual',
        periodStart: `${visibleMonth}-01`,
        category: '',
        amount: Number(amount),
        budgetGroup: group,
      })
      setEditing(false)
      setAmount('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!budget || editing) {
    return (
      <form onSubmit={handleSave} className="card member-form">
        <label>
          Presupuesto total del mes (€)
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {budget && (
            <button type="button" className="link-button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          )}
        </div>
      </form>
    )
  }

  const pct = Math.min(100, Math.round((spent / budget.amount) * 100))
  const over = spent > budget.amount

  return (
    <div className="card event-card">
      <strong>Presupuesto total del mes</strong>
      <p>
        {spent.toFixed(2)} € de {budget.amount.toFixed(2)} € ({pct}%)
      </p>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${pct}%`, background: over ? '#c0392b' : undefined }}
        />
      </div>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setAmount(String(budget.amount))
          setEditing(true)
        }}
      >
        Cambiar importe
      </button>
    </div>
  )
}

// Los presupuestos se guardan por mes, en carpetas — petición real:
// "la parte del nuevo presupuesto la eliminaría, y ahí pondría una
// carpeta para guardar todos los presupuestos... créame una carpeta
// por cada mes... para poderlos consultar". Reemplaza el formulario
// siempre visible de antes: ahora "Nuevo presupuesto" es una carpeta
// más, al final de la lista, que se despliega para dar de alta uno.
function BudgetMonthFolders({
  budgets,
  expenses,
  categories,
  group,
  onChanged,
}: {
  budgets: Budget[]
  expenses: Expense[]
  categories: BudgetCategory[]
  group: string
  onChanged: () => void
}) {
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [addingMonth, setAddingMonth] = useState(false)

  const byMonth = new Map<string, Budget[]>()
  for (const b of budgets) {
    const month = budgetPeriodRange(b).start.slice(0, 7)
    const list = byMonth.get(month) ?? []
    list.push(b)
    byMonth.set(month, list)
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <>
      <h2 className="section-title">Presupuestos</h2>
      <p className="muted" style={{ marginTop: -8 }}>Guardados por mes — toca uno para consultarlo.</p>
      <div className="store-folder-grid">
        {months.map(([month, monthBudgets]) => {
          const [y, m] = month.split('-').map(Number)
          const isOpen = openMonth === month
          const totalBudgeted = monthBudgets.reduce((sum, b) => sum + b.amount, 0)
          return (
            <div key={month} className="store-folder">
              <button
                type="button"
                className="store-folder-header"
                onClick={() => setOpenMonth(isOpen ? null : month)}
              >
                <span className="store-folder-icon">📅</span>
                <span className="store-folder-info">
                  <strong>
                    {MONTH_LABELS[m - 1]} {y}
                  </strong>
                  <span className="muted">
                    {monthBudgets.length} {monthBudgets.length === 1 ? 'presupuesto' : 'presupuestos'} ·{' '}
                    {totalBudgeted.toFixed(2)} €
                  </span>
                </span>
                <span className="store-folder-chevron">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="event-list store-folder-contents">
                  {monthBudgets.map((b) => {
                    const spent = budgetSpent(b, expenses, { categories })
                    const pct = Math.min(100, Math.round((spent / b.amount) * 100))
                    const icon = categories.find((c) => c.name === b.category)?.icon
                    return (
                      <div key={b.id} className="card task-card">
                        <div className="task-card-main">
                          <strong>
                            {icon && `${icon} `}
                            {b.category ?? 'General'}
                          </strong>
                          <p className="muted">
                            {b.periodType} desde {b.periodStart} · gastado {spent.toFixed(2)} € de{' '}
                            {b.amount.toFixed(2)} € ({pct}%)
                          </p>
                          <div className="progress-bar">
                            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <ConfirmButton label="Eliminar" onConfirm={() => deleteBudget(b.id).then(onChanged)} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <div className="store-folder">
          <button
            type="button"
            className="store-folder-header"
            onClick={() => setAddingMonth((v) => !v)}
          >
            <span className="store-folder-icon">➕</span>
            <span className="store-folder-info">
              <strong>Nuevo presupuesto</strong>
            </span>
            <span className="store-folder-chevron">{addingMonth ? '▾' : '▸'}</span>
          </button>
          {addingMonth && (
            <div className="store-folder-contents">
              <AddBudgetForm
                onAdded={() => {
                  setAddingMonth(false)
                  onChanged()
                }}
                defaultPeriodStart={`${toDateStr(new Date()).slice(0, 7)}-01`}
                categories={categories}
                group={group}
              />
            </div>
          )}
        </div>
      </div>
      {months.length === 0 && <p className="muted">No hay presupuestos guardados todavía.</p>}
    </>
  )
}

// Apuntar un ingreso (nómina, paga extra...) según va llegando —
// petición real: "quiero poder ir poniendo los ingresos que tengo ese
// mes y cuando los tengo... que se cree el ingreso el día que lo
// apunte pero que se pueda cambiar con un calendario". La fecha
// arranca en hoy pero es un <input type="date"> normal — se puede
// cambiar a cualquier otro día antes de guardar.
function AddIncomeInline({
  group,
  categories,
  onAdded,
}: {
  group: string
  categories: BudgetCategory[]
  onAdded: () => void
}) {
  const incomeCategories = categories.filter((c) => c.budgetGroup === 'ingresos')
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  // Petición real: "los ingresos también se deberían poder
  // categorizar, como sueldo, regalo, ingreso" — antes era un texto
  // libre de "descripción", ahora la misma categoría estructurada
  // (con icono) que ya usa el resto de la app.
  const [category, setCategory] = useState(incomeCategories[0]?.name ?? 'Ingreso')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addExpense({
        date,
        amount: Number(amount),
        category,
        store: '',
        kind: 'real',
        isIncome: true,
        budgetGroup: group,
      })
      setAmount('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form" style={{ marginBottom: 8 }}>
      <label>
        Categoría
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {incomeCategories.length === 0 && <option value="Ingreso">Ingreso</option>}
          {incomeCategories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Fecha
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Guardar ingreso'}
      </button>
    </form>
  )
}

// Estadísticas de Dinero — el gasto suma Alimentación + Generales
// juntos (petición real: "que todos los presupuestos estén
// conectados"), pero los INGRESOS no: cada pestaña tiene los suyos,
// sin sumarse con la otra (petición real: "los ingresos tienen que
// ser diferentes... no quiero que me sumen [los de Generales] en
// Alimentación"). Mismo selector Hoy/Esta semana/Este
// mes/Este año/Rango que ya usan los Tickets de esta misma pantalla.
function BudgetsOverview({
  allExpenses,
  allCategories,
  group,
  onChanged,
  monthStartDay,
}: {
  allExpenses: Expense[]
  allCategories: BudgetCategory[]
  group: string
  onChanged: () => void
  monthStartDay: number
}) {
  const [preset, setPreset] = useState<SpendRangePreset>('mes')
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()))
  const [customTo, setCustomTo] = useState(toDateStr(new Date()))
  // Petición real: "quiero poder ir poniendo los ingresos que tengo
  // ese mes y cuando los tengo... que se cree el día que lo apunte
  // pero que se pueda cambiar con un calendario y que se pueda
  // eliminar".
  const [addingIncome, setAddingIncome] = useState(false)
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null)

  const [from, to] = rangeForPreset(preset, customFrom, customTo, monthStartDay)
  const inRange = allExpenses.filter((e) => e.expenseDate >= from && e.expenseDate <= to)
  // Los ingresos NO se conectan entre pestañas — petición real: "los
  // ingresos tienen que ser diferentes... presupuesto generales tiene
  // 4000€... presupuesto de alimentación 800€... no quiero que me
  // sumen [los de Generales] en Alimentación". El gasto sí se sigue
  // sumando entre las dos (eso no ha cambiado).
  const incomeEntries = inRange
    .filter((e) => e.isIncome && e.budgetGroup === group)
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
  const totalIncome = incomeEntries.reduce((sum, e) => sum + e.amount, 0)
  const totalSpent = inRange.filter((e) => !e.isIncome && e.kind === 'real').reduce((sum, e) => sum + e.amount, 0)

  async function handleDeleteIncome(id: string) {
    await deleteExpense(id)
    onChanged()
  }

  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of inRange.filter((e) => !e.isIncome && e.kind === 'real')) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [inRange])

  const rangeLabel = `${PRESET_LABELS[preset]} (${from} a ${to})`

  return (
    <div className="card event-card">
      <strong>Resumen</strong>
      <p className="muted" style={{ marginTop: 0 }}>
        {group === 'alimentacion'
          ? 'Solo registro — no tiene presupuesto ni ingresos propios.'
          : 'Gastado suma Alimentación + Generales · Ingresos es solo de esta pestaña.'}
      </p>
      <DateFilterTab
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />
      {/* Alimentación ya no tiene presupuesto ni ingresos propios
          (petición real: "hay que quitar en Registro alimentación lo
          de ingreso") — solo se queda con el total gastado. */}
      {group !== 'alimentacion' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ color: '#1e8449', fontWeight: 600, margin: '4px 0' }}>Ingresos: +{totalIncome.toFixed(2)} €</p>
            <button type="button" className="link-button" onClick={() => setAddingIncome((v) => !v)}>
              {addingIncome ? 'Cerrar' : '+ Añadir ingreso'}
            </button>
          </div>

          {addingIncome && <AddIncomeInline group={group} categories={allCategories} onAdded={onChanged} />}
        </>
      )}

      {group !== 'alimentacion' && incomeEntries.length > 0 && (
        <div className="event-list" style={{ marginBottom: 8 }}>
          {incomeEntries.map((inc) =>
            editingIncomeId === inc.id ? (
              <EditCategoryExpenseRow
                key={inc.id}
                expense={inc}
                onDone={() => {
                  setEditingIncomeId(null)
                  onChanged()
                }}
                onCancel={() => setEditingIncomeId(null)}
              />
            ) : (
              <div key={inc.id} className="card task-card">
                <div className="task-card-main">
                  <strong style={{ color: '#1e8449' }}>+{inc.amount.toFixed(2)} €</strong>
                  <p className="muted">
                    {inc.expenseDate}
                    {inc.category && inc.category !== 'Ingreso' && ` · ${inc.category}`}
                  </p>
                </div>
                <button type="button" className="link-button" onClick={() => setEditingIncomeId(inc.id)}>
                  Editar
                </button>
                <ConfirmButton label="Eliminar" onConfirm={() => handleDeleteIncome(inc.id)} />
              </div>
            ),
          )}
        </div>
      )}

      <p style={{ color: '#c0392b', fontWeight: 600, margin: '4px 0' }}>Gastado: -{totalSpent.toFixed(2)} €</p>
      {group !== 'alimentacion' && (
        <p style={{ margin: '4px 0' }}>
          <strong>Balance: {(totalIncome - totalSpent).toFixed(2)} €</strong>
        </p>
      )}

      {byCategory.length > 0 && (
        <div className="price-row-list" style={{ marginTop: 8 }}>
          {byCategory.map(([cat, amount]) => {
            const icon = allCategories.find((c) => c.name === cat)?.icon
            return (
              <div key={cat} className="price-row">
                <span className="price-row-name">
                  {icon && `${icon} `}
                  {cat}
                </span>
                <span className="price-row-price">{amount.toFixed(2)} €</span>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        className="link-button"
        style={{ marginTop: 8 }}
        onClick={() =>
          openBudgetReport({
            rangeLabel,
            totalIncome,
            totalSpent,
            byCategory: byCategory.map(([name, amount]) => ({
              name,
              icon: allCategories.find((c) => c.name === name)?.icon,
              amount,
            })),
          })
        }
      >
        📄 Generar informe
      </button>
    </div>
  )
}

// Abre una pestaña aparte con un informe limpio y lanza el diálogo de
// imprimir del propio navegador (gratis, sin librería — "Guardar como
// PDF" ya está en ese diálogo en cualquier móvil u ordenador).
function openBudgetReport(report: {
  rangeLabel: string
  totalIncome: number
  totalSpent: number
  byCategory: { name: string; icon?: string; amount: number }[]
}) {
  const win = window.open('', '_blank')
  if (!win) return
  const rows =
    report.byCategory
      .map(
        (c) =>
          `<tr><td>${c.icon ?? ''} ${c.name}</td><td style="text-align:right">${c.amount.toFixed(2)} €</td></tr>`,
      )
      .join('') || '<tr><td colspan="2">Sin movimientos en este periodo</td></tr>'
  win.document.write(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de Economía</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; padding-top: 64px; color: #1c1f26; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .muted { color: #6b7280; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td { padding: 6px 4px; border-bottom: 1px solid #eee; }
  .totals p { margin: 4px 0; font-size: 15px; }
  .income { color: #1e8449; font-weight: 600; }
  .expense { color: #c0392b; font-weight: 600; }
  /* Petición real: "no tiene botón de cierre, tuve que salir de la
     aplicación" — window.open() en una PWA instalada no siempre abre
     una pestaña de verdad con su propia flecha de volver, así que el
     informe necesita su propio botón. */
  .close-btn {
    position: fixed;
    top: 12px;
    right: 12px;
    background: #4c6ef5;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  @media print {
    .close-btn { display: none; }
  }
</style>
</head>
<body>
  <button type="button" class="close-btn" onclick="window.close(); setTimeout(function(){ history.back() }, 150)">✕ Cerrar</button>
  <h1>Informe de Economía</h1>
  <p class="muted">${report.rangeLabel}</p>
  <div class="totals">
    <p class="income">Ingresos: +${report.totalIncome.toFixed(2)} €</p>
    <p class="expense">Gastado: -${report.totalSpent.toFixed(2)} €</p>
    <p><strong>Balance: ${(report.totalIncome - report.totalSpent).toFixed(2)} €</strong></p>
  </div>
  <h2>Por categoría</h2>
  <table>${rows}</table>
</body>
</html>`)
  win.document.close()
  win.focus()
  win.print()
}

// Categorías de presupuesto con icono — petición real: "en la pestaña
// de presupuestos que se puedan crear categorías, algo como lo de la
// foto" (captura de referencia: Salario 👔, Comestibles 🛒,
// Entretenimiento 🍿, Vivienda 🏠, cada una con su icono). Mismas
// carpetas de colores que en Documentos. Tocar una categoría abre un
// formulario rápido para apuntarle un gasto — petición real: "quiero
// poder apuntar en cada categoría los gastos de cada cosa, en agua,
// en gastos escolares, hipoteca...".
// Debe coincidir con las columnas de .doc-folder-grid (repeat(3, 1fr)).
const CATEGORY_GRID_COLS = 3
const CATEGORY_DRAG_TAP_THRESHOLD_PX = 8

function BudgetCategoriesSection({
  categories,
  budgetGroup,
  monthExpenses,
  onChanged,
}: {
  categories: BudgetCategory[]
  budgetGroup: string
  monthExpenses: Expense[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [loggingCategory, setLoggingCategory] = useState<BudgetCategory | null>(null)

  // Arrastrar con el dedo para reordenar los iconos — petición real:
  // "que se puedan mover y organizar como queramos, arrastrándolos con
  // el dedo". Mismo mecanismo que ya usan la lista de la compra y los
  // botones de Pepa: la lista local sigue a las props salvo mientras se
  // arrastra, y solo se guarda de verdad (reorderBudgetCategories) si
  // el gesto fue un arrastre real, no un toque corto.
  const [order, setOrder] = useState(categories)
  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    startIndex: number
    cellW: number
    cellH: number
    moved: number
  } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const wasDraggedRef = useRef(false)

  useEffect(() => {
    if (!dragRef.current) setOrder(categories)
  }, [categories])

  function handleDragStart(e: ReactPointerEvent, id: string, el: HTMLElement) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    el.setPointerCapture(e.pointerId)
    wasDraggedRef.current = false
    const index = order.findIndex((c) => c.id === id)
    const style = getComputedStyle(el.parentElement as HTMLElement)
    const gap = parseFloat(style.columnGap || style.gap || '0') || 0
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, startIndex: index, cellW: el.offsetWidth + gap, cellH: el.offsetHeight + gap, moved: 0 }
    setDraggingId(id)
  }

  function handleDragMove(e: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    drag.moved = Math.max(drag.moved, Math.abs(dx), Math.abs(dy))
    if (drag.moved >= CATEGORY_DRAG_TAP_THRESHOLD_PX) wasDraggedRef.current = true
    setDragOffset({ x: dx, y: dy })
    const startRow = Math.floor(drag.startIndex / CATEGORY_GRID_COLS)
    const startCol = drag.startIndex % CATEGORY_GRID_COLS
    const newCol = Math.min(CATEGORY_GRID_COLS - 1, Math.max(0, startCol + Math.round(dx / drag.cellW)))
    const newRow = Math.max(0, startRow + Math.round(dy / drag.cellH))
    const newIndex = Math.min(order.length - 1, newRow * CATEGORY_GRID_COLS + newCol)
    setOrder((prev) => {
      const currentIndex = prev.findIndex((c) => c.id === drag.id)
      if (currentIndex === -1 || currentIndex === newIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
  }

  function handleDragEnd() {
    const drag = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setDragOffset({ x: 0, y: 0 })
    if (drag && drag.moved >= CATEGORY_DRAG_TAP_THRESHOLD_PX) {
      reorderBudgetCategories(order.map((c) => c.id)).then(onChanged)
    }
  }

  function handleCardClick(c: BudgetCategory) {
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false
      return
    }
    setLoggingCategory(c)
  }

  return (
    <>
      <h2 className="section-title">Categorías</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Toca una categoría para apuntarle un gasto, o arrástrala para moverla.
      </p>
      <div className="doc-folder-grid">
        {order.map((c) => {
          const spent = monthExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0)
          const isDragging = draggingId === c.id
          return (
            <div
              key={c.id}
              className={
                'doc-folder-card doc-folder-card-draggable' + (isDragging ? ' doc-folder-card-dragging' : '')
              }
              style={{
                position: 'relative',
                cursor: 'pointer',
                ...(isDragging ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` } : {}),
              }}
              role="button"
              tabIndex={0}
              onClick={() => handleCardClick(c)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCardClick(c)
              }}
              onPointerDown={(e) => handleDragStart(e, c.id, e.currentTarget)}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              <span className="doc-folder-icon" style={{ background: 'var(--primary)' }}>
                {c.icon}
              </span>
              <strong className="doc-folder-name">{c.name}</strong>
              <span className="muted doc-folder-count">{spent > 0 ? `${spent.toFixed(2)} €` : 'Sin gastos'}</span>
              <span style={{ position: 'absolute', top: -4, right: 4 }} onClick={(e) => e.stopPropagation()}>
                <ConfirmIconButton
                  icon="✕"
                  className="link-button"
                  ariaLabel={`Eliminar categoría ${c.name}`}
                  onConfirm={() => deleteBudgetCategory(c.id).then(onChanged)}
                />
              </span>
            </div>
          )
        })}
        <button
          type="button"
          className={'doc-folder-card doc-folder-card-add' + (adding ? ' doc-folder-card-active' : '')}
          onClick={() => setAdding((v) => !v)}
        >
          <span className="doc-folder-icon doc-folder-icon-add">➕</span>
          <strong className="doc-folder-name">Nueva categoría</strong>
        </button>
      </div>
      {categories.length === 0 && !adding && (
        <p className="muted">Todavía no hay categorías — crea alguna para elegirla al hacer un presupuesto.</p>
      )}
      {adding && (
        <AddBudgetCategoryInline
          budgetGroup={budgetGroup}
          onAdded={() => {
            setAdding(false)
            onChanged()
          }}
        />
      )}
      {loggingCategory && (
        <LogCategoryExpenseModal
          category={loggingCategory}
          expenses={monthExpenses.filter((e) => e.category === loggingCategory.name)}
          onClose={() => setLoggingCategory(null)}
          onChanged={onChanged}
        />
      )}
    </>
  )
}

// Versión de la sección de categorías para Presupuesto Generales: un
// único botón flotante reúne crear categoría, reordenarlas y añadir un
// gasto suelto (petición real: "las categorías que se organicen en el
// mismo menú flotante donde se crean, y haz otro para crear gastos, o
// si lo ves mejor combina todo en el mismo botón" — un solo botón es
// más limpio que dos flotando a la vez). La lista de la pantalla queda
// solo para consultar y apuntar un gasto a una categoría concreta
// tocándola; crear, reordenar (con flechas, mismo mecanismo que
// "Organizar menú") y borrar categorías, o apuntar un gasto sin elegir
// antes una tarjeta, vive dentro de ese botón.
// Presupuesto Generales ya no crea ni edita nada por su cuenta — solo
// consulta cuánto lleva cada categoría. Crear, reordenar y apuntar
// gastos vive todo en el botón flotante de Gastos (petición real: "las
// categorías... en el mismo menú flotante donde se crean").
function GeneralesCategoriesSection({
  categories,
  monthExpenses,
}: {
  categories: BudgetCategory[]
  monthExpenses: Expense[]
}) {
  return (
    <>
      <h2 className="section-title">Categorías</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Se crean y se apuntan desde el botón flotante de la pestaña Gastos.
      </p>
      <div className="event-list">
        {categories.map((c) => {
          const spent = monthExpenses.filter((e) => e.category === c.name).reduce((sum, e) => sum + e.amount, 0)
          return (
            <div key={c.id} className="card task-card">
              <div className="task-card-main">
                <strong>
                  {c.icon} {c.name}
                </strong>
                <p className="muted">{spent > 0 ? `${spent.toFixed(2)} €` : 'Sin gastos'}</p>
              </div>
            </div>
          )
        })}
        {categories.length === 0 && <p className="muted">Todavía no hay categorías.</p>}
      </div>
    </>
  )
}

// Además de apuntar, se ven los gastos ya guardados de ESTE mes en la
// categoría, con editar/eliminar — petición real: "también quiero
// poder eliminarlo o editarlo por si me he equivocado".
function LogCategoryExpenseModal({
  category,
  expenses,
  onClose,
  onChanged,
}: {
  category: BudgetCategory
  expenses: Expense[]
  onClose: () => void
  onChanged: () => void
}) {
  const [date, setDate] = useState(toDateStr(new Date()))
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addExpense({
        date,
        amount: Number(amount),
        category: category.name,
        store: '',
        kind: 'real',
        isIncome: false,
        budgetGroup: category.budgetGroup,
      })
      setAmount('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteExpense(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {category.icon} {category.name}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {expenses.length > 0 && (
          <div className="event-list" style={{ marginBottom: 12 }}>
            {expenses.map((exp) =>
              editingId === exp.id ? (
                <EditCategoryExpenseRow
                  key={exp.id}
                  expense={exp}
                  onDone={() => {
                    setEditingId(null)
                    onChanged()
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div key={exp.id} className="card task-card">
                  <div className="task-card-main">
                    <strong>{exp.amount.toFixed(2)} €</strong>
                    <p className="muted">{exp.expenseDate}</p>
                  </div>
                  <button type="button" className="link-button" onClick={() => setEditingId(exp.id)}>
                    Editar
                  </button>
                  <ConfirmButton label="Eliminar" onConfirm={() => handleDelete(exp.id)} />
                </div>
              ),
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="member-form">
          <label>
            Fecha
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Importe (€)
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Apuntar gasto'}
          </button>
        </form>
      </div>
    </div>
  )
}

function EditCategoryExpenseRow({
  expense,
  onDone,
  onCancel,
}: {
  expense: Expense
  onDone: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(expense.expenseDate)
  const [amount, setAmount] = useState(String(expense.amount))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await updateExpense(expense.id, { date, amount: Number(amount) })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form">
      <div className="inline-fields">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

// Nombre → emoji, para que al escribir "Farmacia" se ponga sola 💊 y
// así con las demás — petición real: "que cuando se ponga por ejemplo
// farmacia se ponga automáticamente el emoji de farmacia y así con
// todos". Búsqueda por palabra suelta dentro del nombre (normalizada,
// sin acentos), así "Gastos escolares" encuentra "escolar" aunque no
// sea la palabra exacta.
const CATEGORY_ICON_SUGGESTIONS: Record<string, string> = {
  farmacia: '💊',
  medicina: '💊',
  salud: '🏥',
  medico: '🏥',
  hospital: '🏥',
  luz: '💡',
  electricidad: '💡',
  agua: '💧',
  gas: '🔥',
  internet: '📶',
  telefono: '📱',
  movil: '📱',
  impuesto: '🧾',
  hacienda: '🧾',
  factura: '🧾',
  hipoteca: '🏦',
  banco: '🏦',
  alquiler: '🏠',
  vivienda: '🏠',
  casa: '🏠',
  taller: '🔧',
  coche: '🚗',
  gasolina: '⛽',
  combustible: '⛽',
  transporte: '🚌',
  seguro: '🛡️',
  imprevisto: '⚠️',
  prestamo: '💳',
  credito: '💳',
  ahorro: '💰',
  salario: '👔',
  sueldo: '👔',
  nomina: '👔',
  comestible: '🛒',
  alimentacion: '🛒',
  compra: '🛒',
  supermercado: '🛒',
  entretenimiento: '🍿',
  ocio: '🍿',
  cine: '🎬',
  restaurante: '🍽️',
  comida: '🍽️',
  ropa: '👕',
  moda: '👕',
  regalo: '🎁',
  mascota: '🐾',
  gimnasio: '🏋️',
  deporte: '⚽',
  vacacion: '✈️',
  viaje: '✈️',
  escolar: '🎒',
  colegio: '🎒',
  escuela: '🎒',
  educacion: '🎓',
  universidad: '🎓',
  belleza: '💇',
  peluqueria: '💇',
  suscripcion: '📺',
  streaming: '📺',
}

function suggestCategoryIcon(name: string): string | null {
  const norm = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (!norm) return null
  if (CATEGORY_ICON_SUGGESTIONS[norm]) return CATEGORY_ICON_SUGGESTIONS[norm]
  for (const [keyword, icon] of Object.entries(CATEGORY_ICON_SUGGESTIONS)) {
    if (norm.includes(keyword)) return icon
  }
  return null
}

// Paleta para elegir el icono a mano — petición real: "ponme que se
// despliegue una lista de emojis".
const CATEGORY_ICON_PALETTE = [
  '💰', '🧾', '💡', '💧', '🔥', '📶', '📱', '🏦', '🏠', '🔧',
  '🚗', '⛽', '🚌', '🛡️', '⚠️', '💳', '🛒', '🍿', '🍽️', '👕',
  '🎁', '🐾', '🏋️', '⚽', '✈️', '🎒', '🎓', '💇', '📺', '👔',
  '💊', '🏥', '🎬', '📚', '🎮', '🧸', '🔄',
]

function AddBudgetCategoryInline({
  budgetGroup,
  parentOptions,
  onAdded,
}: {
  budgetGroup: string
  parentOptions?: BudgetCategory[]
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('💰')
  const [parentId, setParentId] = useState<string>('')
  const [necessity, setNecessity] = useState<'' | 'debo' | 'necesito' | 'quiero'>('')
  const [isFixed, setIsFixed] = useState<'' | 'fijo' | 'variable'>('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Mientras sea true, escribir el nombre puede seguir cambiando el
  // icono solo — en cuanto la persona elige uno a mano (picker o
  // escrito), se deja de tocar aunque seguya escribiendo el nombre.
  const iconTouchedRef = useRef(false)

  function handleNameChange(value: string) {
    setName(value)
    if (iconTouchedRef.current) return
    const suggested = suggestCategoryIcon(value)
    if (suggested) setIcon(suggested)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createBudgetCategory({
        name,
        icon,
        budgetGroup,
        parentId: parentId || null,
        necessity: necessity || null,
        isFixed: isFixed === '' ? null : isFixed === 'fijo',
      })
      setName('')
      setIcon('💰')
      setParentId('')
      setNecessity('')
      setIsFixed('')
      iconTouchedRef.current = false
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir la categoría')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <div className="inline-fields" style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          style={{ width: 56, textAlign: 'center', fontSize: 20, padding: '10px 0' }}
          aria-label="Elegir icono"
        >
          {icon}
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Farmacia"
          style={{ flex: 1 }}
          autoFocus
        />
        {pickerOpen && (
          <div className="emoji-picker-grid">
            {CATEGORY_ICON_PALETTE.map((e) => (
              <button
                key={e}
                type="button"
                className="emoji-picker-option"
                onClick={() => {
                  setIcon(e)
                  iconTouchedRef.current = true
                  setPickerOpen(false)
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Skill de Pepa, punto 10: subcategoría opcional de dos niveles
          — sin elegir principal, queda como categoría de primer nivel. */}
      {parentOptions && parentOptions.length > 0 && (
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Categoría principal (ninguna)</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.icon} {p.name}
            </option>
          ))}
        </select>
      )}
      {/* Skill de Pepa, puntos 15/16 — petición real: "clasificar cada
          categoría desde un principio". Aquí es la única clasificación
          que no puede ser automática (categoría nueva, sin
          equivalente en la taxonomía de fábrica): la elige la familia,
          opcional y editable después. No aplica a Ingresos. */}
      {budgetGroup !== 'ingresos' && (
        <div className="inline-fields">
          <select value={necessity} onChange={(e) => setNecessity(e.target.value as typeof necessity)}>
            <option value="">¿Debo, necesito o quiero? (opcional)</option>
            <option value="debo">Debo</option>
            <option value="necesito">Necesito</option>
            <option value="quiero">Quiero</option>
          </select>
          <select value={isFixed} onChange={(e) => setIsFixed(e.target.value as typeof isFixed)}>
            <option value="">¿Fijo o variable? (opcional)</option>
            <option value="fijo">Fijo</option>
            <option value="variable">Variable</option>
          </select>
        </div>
      )}
      {!iconTouchedRef.current && suggestCategoryIcon(name) && (
        <p className="muted" style={{ marginTop: -8, fontSize: 12 }}>
          Icono sugerido para "{name}" — toca el icono para cambiarlo.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving || !name.trim()}>
        {saving ? 'Añadiendo…' : '+ Añadir categoría'}
      </button>
    </form>
  )
}

function AddBudgetForm({
  onAdded,
  defaultPeriodStart,
  categories,
  group,
}: {
  onAdded: () => void
  defaultPeriodStart: string
  categories: BudgetCategory[]
  group: string
}) {
  const [periodType, setPeriodType] = useState<BudgetPeriod>('mensual')
  const [periodStart, setPeriodStart] = useState(defaultPeriodStart)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createBudget({ periodType, periodStart, category, amount: Number(amount), budgetGroup: group })
      setCategory('')
      setAmount('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo presupuesto</h2>
      <label>
        Periodo
        <select value={periodType} onChange={(e) => setPeriodType(e.target.value as BudgetPeriod)}>
          <option value="mensual">Mensual</option>
          <option value="semanal">Semanal</option>
        </select>
      </label>
      <label>
        Empieza el
        <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
      </label>
      <label>
        Categoría (vacío = general)
        <input
          type="text"
          list="budget-category-options"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Alimentación"
        />
        <datalist id="budget-category-options">
          {categories.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </label>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear presupuesto'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Educación financiera infantil (Skill 20)
// ---------------------------------------------------------------------

// Antes había un único saldo mezclando ingresos y gastos en una sola
// lista de "Movimientos" — a petición real de la usuaria, para
// educación financiera se separa en cuatro categorías con su propia
// pestaña cada una, para poder ver en cualquier momento cuánto tiene
// disponible, cuánto ha ahorrado, cuánto ha ingresado en total y
// cuánto ha gastado, todo por separado.
const WALLET_TABS: { key: WalletTransactionType; label: string; formLabel: string }[] = [
  { key: 'ingreso', label: 'Ingresos', formLabel: 'ingreso' },
  { key: 'ahorro', label: 'Ahorro', formLabel: 'ahorro' },
  { key: 'gasto', label: 'Gastos', formLabel: 'gasto' },
  { key: 'impuesto', label: 'Impuestos', formLabel: 'impuesto' },
]

function KidsFinanceTab() {
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [activeMemberId, setActiveMemberId] = useState<string>('')
  const [walletTab, setWalletTab] = useState<WalletTransactionType>('ingreso')
  const [transactions, setTransactions] = useState<KidWalletTransaction[]>([])
  const [goals, setGoals] = useState<KidGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listFamilyMembers(), listWalletTransactions(), listGoals()])
      .then(([m, t, g]) => {
        const kids = m.filter((x) => x.memberType === 'child' || x.memberType === 'baby')
        setMembers(kids)
        if (kids.length > 0 && !activeMemberId) setActiveMemberId(kids[0].id)
        setTransactions(t)
        setGoals(g)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, []) // eslint-disable-line react-hooks/exhaustive-deps

  const balance = activeMemberId ? walletBalance(activeMemberId, transactions) : 0
  const memberGoals = goals.filter((g) => g.memberId === activeMemberId)
  const activeTabInfo = WALLET_TABS.find((t) => t.key === walletTab)!
  const categoryTotal = activeMemberId ? walletCategoryTotal(activeMemberId, walletTab, transactions) : 0
  const categoryTransactions = transactions.filter((t) => t.memberId === activeMemberId && t.type === walletTab)

  if (loading) return <p className="muted">Cargando…</p>
  if (members.length === 0) return <p className="muted">No hay niños/bebés en la familia todavía.</p>

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

      <p className="points-badge">Disponible: {balance.toFixed(2)} €</p>
      <p className="muted">
        {WALLET_TABS.map((t) => `${t.label} ${walletCategoryTotal(activeMemberId, t.key, transactions).toFixed(2)} €`).join(' · ')}
      </p>

      <div className="filter-row">
        {WALLET_TABS.map((t) => (
          <button
            key={t.key}
            className={'chip' + (walletTab === t.key ? ' chip-active' : '')}
            onClick={() => setWalletTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <h2 className="section-title">
        {activeTabInfo.label}: {categoryTotal.toFixed(2)} €
      </h2>

      {walletTab === 'ahorro' && (
        <>
          <h3>Objetivos de ahorro</h3>
          <div className="event-list">
            {memberGoals.map((goal) => {
              const pct = Math.min(100, Math.round((categoryTotal / goal.targetAmount) * 100))
              return (
                <div key={goal.id} className="card task-card">
                  <div className="task-card-main">
                    <strong>{goal.title}</strong>
                    <p className="muted">
                      {categoryTotal.toFixed(2)} € de {goal.targetAmount.toFixed(2)} € ({pct}%)
                    </p>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <ConfirmButton label="Eliminar" onConfirm={() => deleteGoal(goal.id).then(reload)} />
                </div>
              )
            })}
            {memberGoals.length === 0 && <p className="muted">Sin objetivos todavía.</p>}
          </div>
          <AddGoalForm memberId={activeMemberId} onAdded={reload} />
        </>
      )}

      <div className="event-list">
        {categoryTransactions.map((t) => (
          <div key={t.id} className="card task-card">
            <div className="task-card-main">
              <strong>
                {t.amount.toFixed(2)} € — {t.description}
              </strong>
            </div>
            <ConfirmButton label="Eliminar" onConfirm={() => deleteWalletTransaction(t.id).then(reload)} />
          </div>
        ))}
        {categoryTransactions.length === 0 && <p className="muted">Sin movimientos todavía.</p>}
      </div>
      <AddTransactionForm memberId={activeMemberId} type={walletTab} formLabel={activeTabInfo.formLabel} onAdded={reload} />
    </div>
  )
}

function AddGoalForm({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [title, setTitle] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createGoal({ memberId, title, targetAmount: Number(targetAmount) })
      setTitle('')
      setTargetAmount('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo objetivo</h2>
      <label>
        Título
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Un juguete" required />
      </label>
      <label>
        Coste (€)
        <input type="number" step="0.01" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Crear objetivo'}
      </button>
    </form>
  )
}

// El tipo ya no se elige en un desplegable — lo decide la pestaña en la
// que estés (Ingresos/Ahorro/Gastos/Impuestos), así no hay que elegirlo
// dos veces ni se puede registrar un ingreso sin querer en la pestaña
// de gastos.
function AddTransactionForm({
  memberId,
  type,
  formLabel,
  onAdded,
}: {
  memberId: string
  type: WalletTransactionType
  formLabel: string
  onAdded: () => void
}) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addWalletTransaction({ memberId, type, amount: Number(amount), description })
      setAmount('')
      setDescription('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Nuevo {formLabel}</h2>
      <label>
        Importe (€)
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label>
        Descripción
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  )
}
