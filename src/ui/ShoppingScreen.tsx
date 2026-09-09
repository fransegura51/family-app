import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ReorderableTabBar } from '@/ui/ReorderableTabBar'
import {
  addShoppingItem,
  deleteShoppingItem,
  deleteShoppingItems,
  listShoppingItems,
  reorderShoppingItems,
  updateShoppingItemStatus,
} from '@/data/shopping'
import { listAllProductPrices, listProducts } from '@/data/products'
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
import { MONTH_LABELS } from '@/domain/calendar'
import { BudgetsTab, ReceiptsTab } from '@/ui/FinanceScreen'
import type {
  Product,
  ProductPrice,
  ShoppingItem,
  ShoppingItemPriority,
  ShoppingItemStatus,
  ShoppingStoreEntry,
} from '@/domain/types'

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
  return products.map((p) => {
    // Un pedido de Amazon que no sea de alimentación no cuenta como "lo
    // sueles comprar" de la lista de la compra — mismo criterio que
    // Historial (uno que sí sea de alimentación, como un café, sí cuenta).
    const ownPrices = prices.filter((pr) => pr.productId === p.id && isFoodPurchase(pr, foodReceiptIds))
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
const SUB_TABS = ['Lista', 'Historial', 'No alimentos', 'Tickets', 'Registro Alimentación'] as const
type SubTab = (typeof SUB_TABS)[number]

export function ShoppingScreen() {
  const [tab, setTab] = useState<SubTab>('Lista')

  return (
    <div className="screen">
      <h1>Compras</h1>
      <ReorderableTabBar storageKey="compras" tabs={SUB_TABS} active={tab} onSelect={setTab} />

      {tab === 'Lista' && <ShoppingListTab />}
      {tab === 'Historial' && <HistoryTab mode="alimentacion" />}
      {tab === 'No alimentos' && <HistoryTab mode="no_alimentos" />}
      {tab === 'Tickets' && <ReceiptsTab />}
      {tab === 'Registro Alimentación' && <BudgetsTab group="alimentacion" seedCategories={[]} />}
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
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shoppingMode, setShoppingMode] = useState(false)
  // Botón flotante "Añadir producto", tocable desde cualquier parte de
  // la pestaña — misma idea ya aplicada a Contactos y Calendario,
  // petición real: "en compras lo mismo, botón flotante Añadir
  // producto y formulario emergente".
  const [addingItem, setAddingItem] = useState(false)
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

  // Solo se enseña "Cargando…" (que desmonta el formulario de abajo) la
  // primera vez — si no, cada "reload" tras añadir un producto borraba
  // lo que llevaras escrito en el formulario, incluida la tienda que se
  // deja puesta a propósito entre productos seguidos.
  function reload() {
    setLoading(true)
    Promise.all([listShoppingItems(), listProducts(), listAllProductPrices(), listShoppingStores(), listReceipts(), listBudgetCategories()])
      .then(([shoppingItems, products, prices, shoppingStores, receipts, categories]) => {
        setItems(shoppingItems)
        setSuggestions(buildSuggestions(products, prices, buildFoodReceiptIds(receipts, categories)))
        setStores(shoppingStores)
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

  async function setStatus(id: string, status: ShoppingItemStatus) {
    try {
      await updateShoppingItemStatus(id, status)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
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
      setError(err instanceof Error ? err.message : 'No se pudo finalizar la compra')
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
        <button type="button" className="link-button" onClick={() => setShoppingMode(!shoppingMode)}>
          {shoppingMode ? 'Salir de modo compra' : '🛒 Modo compra'}
        </button>
      </div>

      <h2 className="section-title">Pendientes</h2>
      {storeGroups.map(([store, storeItems]) => {
        const collapsed = storeGroups.length > 1 && collapsedStores.has(store)
        return (
        <div key={store} id={`shopping-store-${normalize(store)}`}>
          {storeGroups.length > 1 && (
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
            </h3>
          )}
          {!collapsed && (
            <>
              <DraggableStoreGroup
                items={storeItems}
                suggestions={suggestions}
                shoppingMode={shoppingMode}
                onSetStatus={setStatus}
                onDeleted={reload}
                onReordered={reload}
              />
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

      {/* Petición real: "pondría las tiendas que Pepa reconoce por voz
          debajo de la lista de pendientes" — antes iba justo encima,
          delante de lo que de verdad se mira primero al entrar. */}
      <StoreManager stores={stores} onChanged={reload} />

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
function StoreManager({ stores, onChanged }: { stores: ShoppingStoreEntry[]; onChanged: () => void }) {
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
    setDragOffset(dy)
    const shift = Math.round(dy / drag.itemHeight)
    const newIndex = Math.min(order.length - 1, Math.max(0, drag.startIndex + shift))
    setOrder((prev) => {
      const currentIndex = prev.findIndex((s) => s.id === drag.id)
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
      setError(err instanceof Error ? err.message : 'No se pudo añadir la tienda')
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
      setError(err instanceof Error ? err.message : 'No se pudo renombrar')
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteShoppingStore(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar')
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
            <div key={s.id} className="card task-card">
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
              style={draggingId === s.id ? { transform: `translateY(${dragOffset}px)` } : undefined}
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
  onSetStatus,
  onDeleted,
  onReordered,
}: {
  items: ShoppingItem[]
  suggestions: ProductSuggestion[]
  shoppingMode: boolean
  onSetStatus: (id: string, status: ShoppingItemStatus) => void
  onDeleted: () => void
  onReordered: () => void
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
    setDragOffset(dy)
    const shift = Math.round(dy / drag.itemHeight)
    const newIndex = Math.min(order.length - 1, Math.max(0, drag.startIndex + shift))
    setOrder((prev) => {
      const currentIndex = prev.findIndex((i) => i.id === drag.id)
      if (currentIndex === -1 || currentIndex === newIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(currentIndex, 1)
      next.splice(newIndex, 0, moved)
      return next
    })
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
          <div
            key={item.id}
            className={
              'price-row' +
              (draggingId === item.id ? ' shopping-item-dragging' : '') +
              (done ? ' shopping-item-done' : '')
            }
            style={draggingId === item.id ? { transform: `translateY(${dragOffset}px)` } : undefined}
          >
            {!shoppingMode && (
              <span
                className="shopping-drag-handle"
                onPointerDown={(e) => handleTouchStart(e, item.id, e.currentTarget.parentElement as HTMLElement)}
                onPointerMove={handleTouchMove}
                onPointerUp={handleTouchEnd}
                onPointerCancel={handleTouchEnd}
                aria-label="Arrastrar para reordenar"
              >
                ⠿
              </span>
            )}
            <span className="price-row-name">{label}</span>
            {/* Marcar/desmarcar comprado — ya NO borra el producto de la
                lista, solo lo tacha (petición real: seguir viéndolo
                mientras se sigue comprando el resto). */}
            <button
              type="button"
              className={'task-toggle-compact' + (done ? ' task-toggle-done' : '')}
              onClick={() => onSetStatus(item.id, done ? 'pendiente' : 'comprado')}
              aria-label={done ? 'Marcar como pendiente' : 'Comprado'}
            >
              ✓
            </button>
            {!shoppingMode && (
              <ConfirmIconButton
                icon="✕"
                className="link-button"
                ariaLabel="Eliminar"
                onConfirm={() => deleteShoppingItem(item.id).then(onDeleted)}
              />
            )}
          </div>
        )
      })}
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
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
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
  name: string
  lines: string[]
}

function HistoryTab({ mode }: { mode: 'alimentacion' | 'no_alimentos' }) {
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [stores, setStores] = useState<ShoppingStoreEntry[]>([])
  const [foodReceiptIds, setFoodReceiptIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(todayStr().slice(0, 7))
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

  useEffect(() => {
    setLoading(true)
    Promise.all([listAllProductPrices(), listProducts(), listShoppingStores(), listReceipts(), listBudgetCategories()])
      .then(([p, prod, st, receipts, categories]) => {
        setPrices(p)
        setProducts(prod)
        setStores(st)
        setFoodReceiptIds(buildFoodReceiptIds(receipts, categories))
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function shiftMonth(delta: number) {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setVisibleMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const previousMonth = useMemo(() => {
    const [y, m] = visibleMonth.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [visibleMonth])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p.displayName])), [products])

  // Cada pestaña ve solo lo suyo — Historial nunca mezcla ropa/electrónica
  // de Amazon, y "No alimentos" no arrastra nada de comida. Un pedido
  // de Amazon marcado como "Alimentación" (p. ej. café) sí cuenta como
  // comida — no todo lo de Amazon es "no alimentos" por defecto.
  const scopedPrices = useMemo(
    () => prices.filter((p) => isFoodPurchase(p, foodReceiptIds) === (mode === 'alimentacion')),
    [prices, mode, foodReceiptIds],
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
    return compareMonths(monthly, visibleMonth, previousMonth)
      .map((c) => ({ ...c, name: productById.get(c.productId) ?? '?' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [purchases, visibleMonth, previousMonth, productById])

  const currentBasket = useMemo(() => basketTotal(purchases, visibleMonth), [purchases, visibleMonth])
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

    setDetail({ name, lines })
  }

  async function confirmAddToList(store: string | null) {
    if (!addingToList) return
    const { productId, name, price } = addingToList
    try {
      await addShoppingItem({ name, quantity: '', unit: '', priority: 'normal', tripId: null, price, store })
      setAdded((prev) => new Set(prev).add(productId))
      setAddingToList(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir a la lista')
    }
  }

  if (loading) return <p className="muted">Cargando historial…</p>

  const [visibleYear, visibleMonthIndex] = visibleMonth.split('-').map(Number)

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <p className="muted">Se construye solo: cada vez que guardas el precio de un producto comprado, queda aquí.</p>

      <h2 className="section-title">Sugerencias para la próxima compra</h2>
      <div className="price-row-list">
        {suggestions.map(({ product, stats }) => (
          <div key={product.id} className="price-row">
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
        <input type="month" value={visibleMonth} onChange={(e) => e.target.value && setVisibleMonth(e.target.value)} />
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
        Precio medio por unidad este mes frente al mes anterior — 🔺 rojo si ha subido, 🔻 verde si ha bajado. Toca
        el nombre de un producto para ver cada cuánto lo compras y comparar precio entre tiendas.
      </p>

      <div className="price-row-list">
        {comparisons.map((c) => (
          <div key={c.productId} className="price-row">
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
        {comparisons.length === 0 && (
          <p className="muted">No hay productos con precio registrado este mes (tickets o lista de la compra).</p>
        )}
      </div>

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
          </div>
        </div>
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
