import { FormEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  addInventoryItem,
  addShoppingItem,
  completeShoppingTrip,
  createShoppingTrip,
  deleteInventoryItem,
  deleteShoppingItem,
  deleteShoppingTrip,
  listInventoryItems,
  listShoppingItems,
  listShoppingTrips,
  reorderShoppingItems,
  updateInventoryQuantity,
  updateShoppingItemStatus,
} from '@/data/shopping'
import { listAllProductPrices, listProducts, recordProductPurchase } from '@/data/products'
import { listFamilyMembers } from '@/data/family'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { uploadReceipt } from '@/data/receipts'
import { computeProductStats } from '@/domain/products'
import { analyzeFridgePhoto } from '@/services/fridgePhoto'
import { analyzeReceiptPhoto } from '@/services/receiptPhoto'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import type {
  FamilyMember,
  InventoryCategory,
  InventoryItem,
  Product,
  ProductPrice,
  ShoppingItem,
  ShoppingItemPriority,
  ShoppingItemStatus,
  ShoppingTrip,
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

// Empareja lo leído del ticket ("hamburguesas") con un producto YA
// pendiente en la lista ("Hamburguesas mixtas") — por subcadena, en
// cualquier dirección, igual de tolerante que el resto de coincidencias
// de la app (nombres de miembro, etc.). Ante duda, no empareja: mejor
// dejarlo como línea suelta que enlazarlo con el producto equivocado.
function matchShoppingItem(lineName: string, items: ShoppingItem[]): ShoppingItem | null {
  const n = normalizeProductName(lineName)
  if (!n) return null
  return items.find((i) => {
    const din = normalizeProductName(i.name)
    return din.includes(n) || n.includes(din)
  }) ?? null
}

const REMINDER_OPTIONS = [
  { value: '', label: 'Sin recordatorio' },
  { value: '10', label: '10 min antes' },
  { value: '30', label: '30 min antes' },
  { value: '60', label: '1 hora antes' },
  { value: '1440', label: '1 día antes' },
]

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

function buildSuggestions(products: Product[], prices: ProductPrice[]): ProductSuggestion[] {
  return products.map((p) => {
    const ownPrices = prices.filter((pr) => pr.productId === p.id)
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

const SUB_TABS = ['Lista', 'Programadas', 'Inventario', 'Memoria'] as const
type SubTab = (typeof SUB_TABS)[number]

export function ShoppingScreen() {
  const [tab, setTab] = useState<SubTab>('Lista')

  return (
    <div className="screen">
      <h1>Compras</h1>
      <div className="filter-row">
        {SUB_TABS.map((t) => (
          <button
            key={t}
            className={'chip' + (tab === t ? ' chip-active' : '')}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Lista' && <ShoppingListTab />}
      {tab === 'Programadas' && <TripsTab />}
      {tab === 'Inventario' && <InventoryTab />}
      {tab === 'Memoria' && <MemoryTab />}
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
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shoppingMode, setShoppingMode] = useState(false)
  const [showOthers, setShowOthers] = useState(false)

  // Solo se enseña "Cargando…" (que desmonta el formulario de abajo) la
  // primera vez — si no, cada "reload" tras añadir un producto borraba
  // lo que llevaras escrito en el formulario, incluida la tienda que se
  // deja puesta a propósito entre productos seguidos.
  function reload() {
    setLoading(true)
    Promise.all([listShoppingItems(), listProducts(), listAllProductPrices()])
      .then(([shoppingItems, products, prices]) => {
        setItems(shoppingItems)
        setSuggestions(buildSuggestions(products, prices))
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

  const pending = items.filter((i) => i.status === 'pendiente')
  const bought = items.filter((i) => i.status === 'comprado')
  const others = items.filter((i) => i.status === 'omitido' || i.status === 'trasladado')
  const total = pending.length + bought.length

  // Agrupa "detallado por tienda" — en Mercadona esto, en la pescadería
  // lo otro — para verlo separado al programar/hacer la compra. Los
  // productos sin tienda asignada caen en un grupo aparte, al final.
  const pendingByStore = new Map<string, ShoppingItem[]>()
  for (const item of pending) {
    const key = item.store || 'Sin tienda'
    const list = pendingByStore.get(key) ?? []
    list.push(item)
    pendingByStore.set(key, list)
  }
  const storeGroups = [...pendingByStore.entries()].sort((a, b) => {
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
      {storeGroups.map(([store, storeItems]) => (
        <div key={store}>
          {storeGroups.length > 1 && <h3 className="shopping-store-heading">🏬 {store}</h3>}
          <DraggableStoreGroup
            items={storeItems}
            shoppingMode={shoppingMode}
            onSetStatus={setStatus}
            onDeleted={reload}
            onReordered={reload}
          />
        </div>
      ))}
      {pending.length === 0 && <p className="muted">Nada pendiente.</p>}

      <h2 className="section-title">Comprados</h2>
      <div className="event-list">
        {bought.map((item) => (
          <BoughtItemRow
            key={item.id}
            item={item}
            suggestions={suggestions}
            onUndo={() => setStatus(item.id, 'pendiente')}
          />
        ))}
        {bought.length === 0 && <p className="muted">Todavía ninguno.</p>}
      </div>

      {!shoppingMode && (
        <AddShoppingItemForm
          suggestions={suggestions}
          knownStores={[...new Set(items.map((i) => i.store).filter((s): s is string => !!s))]}
          onAdded={reload}
        />
      )}

      {others.length > 0 && (
        <>
          <button type="button" className="link-button section-title" onClick={() => setShowOthers(!showOthers)}>
            {showOthers ? 'Ocultar' : `Ver trasladados / ya tengo (${others.length})`}
          </button>
          {showOthers &&
            others.map((item) => (
              <div key={item.id} className="card task-card">
                <div className="task-card-main">
                  <strong>{item.name}</strong>
                  <p className="muted">{item.status}</p>
                </div>
                <button type="button" className="link-button" onClick={() => setStatus(item.id, 'pendiente')}>
                  Volver a pendiente
                </button>
                <button type="button" className="link-button" onClick={() => deleteShoppingItem(item.id).then(reload)}>
                  Eliminar
                </button>
              </div>
            ))}
        </>
      )}
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
  shoppingMode,
  onSetStatus,
  onDeleted,
  onReordered,
}: {
  items: ShoppingItem[]
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

  function handleTouchStart(e: ReactTouchEvent, id: string, el: HTMLElement) {
    const index = order.findIndex((i) => i.id === id)
    dragRef.current = { id, startY: e.touches[0].clientY, startIndex: index, itemHeight: el.offsetHeight + 10 }
    setDraggingId(id)
  }

  function handleTouchMove(e: ReactTouchEvent) {
    const drag = dragRef.current
    if (!drag) return
    const dy = e.touches[0].clientY - drag.startY
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
    <div className="event-list">
      {order.map((item) => (
        <div
          key={item.id}
          className={'card task-card' + (draggingId === item.id ? ' shopping-item-dragging' : '')}
          style={draggingId === item.id ? { transform: `translateY(${dragOffset}px)` } : undefined}
        >
          {!shoppingMode && (
            <span
              className="shopping-drag-handle"
              onTouchStart={(e) => handleTouchStart(e, item.id, e.currentTarget.parentElement as HTMLElement)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              aria-label="Arrastrar para reordenar"
            >
              ⠿
            </span>
          )}
          <div className="task-card-main">
            <strong>{item.name}</strong>
            <p className="muted">
              {[item.quantity, item.unit].filter(Boolean).join(' ')}
              {!shoppingMode && item.priority !== 'normal' && ` · prioridad ${item.priority}`}
            </p>
          </div>
          <button type="button" className="task-toggle" onClick={() => onSetStatus(item.id, 'comprado')}>
            ✓ Comprado
          </button>
          {!shoppingMode && (
            <>
              <button type="button" className="link-button" onClick={() => onSetStatus(item.id, 'trasladado')}>
                Próxima compra
              </button>
              <button type="button" className="link-button" onClick={() => onSetStatus(item.id, 'omitido')}>
                Ya tengo
              </button>
              <button type="button" className="link-button" onClick={() => deleteShoppingItem(item.id).then(onDeleted)}>
                Eliminar
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// Registrar el precio pagado es opcional (Skill 06 no lo exige), pero
// alimenta la memoria de compras (Skill 09/11) — sin esto no hay
// historial de precios que ofrecer.
function BoughtItemRow({
  item,
  suggestions,
  onUndo,
}: {
  item: ShoppingItem
  suggestions: ProductSuggestion[]
  onUndo: () => void
}) {
  const known = suggestions.find((s) => s.normalizedName === item.name.trim().toLowerCase())
  // Precarga el último precio pagado — el usuario solo confirma o ajusta,
  // no escribe desde cero (Skill 09).
  const [price, setPrice] = useState(known?.lastPrice != null ? String(known.lastPrice) : '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sin precio también se puede "cerrar" el producto — antes, sin
  // escribir un precio, el botón "Guardar" no hacía nada (bug real: "no
  // me deja guardarlo"). El precio sigue siendo opcional de verdad: si
  // no se pone, simplemente no se guarda nada en la Memoria de precios,
  // pero el producto se da por resuelto igual.
  async function handleSavePrice() {
    setError(null)
    if (!price) {
      setSaved(true)
      return
    }
    try {
      await recordProductPurchase({
        name: item.name,
        price: Number(price),
        quantity: item.quantity ?? '',
        unit: item.unit ?? '',
        store: '',
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el precio')
    }
  }

  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{item.name}</strong>
        {error && <p className="error">{error}</p>}
      </div>
      {saved ? (
        <span className="muted">{price ? '✓ Precio guardado' : '✓ Sin precio'}</span>
      ) : (
        <>
          <input
            type="number"
            step="0.01"
            placeholder="Precio € (opcional)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={{ width: 90 }}
          />
          <button type="button" className="link-button" onClick={handleSavePrice}>
            {price ? 'Guardar' : 'Sin precio'}
          </button>
        </>
      )}
      <button type="button" className="link-button" onClick={onUndo}>
        ↺ Deshacer
      </button>
    </div>
  )
}

function AddShoppingItemForm({
  suggestions,
  knownStores,
  onAdded,
}: {
  suggestions: ProductSuggestion[]
  knownStores: string[]
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
      <h2>Añadir producto</h2>
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
// Compras programadas (Skill 08)
// ---------------------------------------------------------------------

function TripsTab() {
  const [trips, setTrips] = useState<ShoppingTrip[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    Promise.all([listShoppingTrips(), listFamilyMembers(), listShoppingItems()])
      .then(([t, m, i]) => {
        setTrips(t)
        setMembers(m)
        setItems(i)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const pendingItems = useMemo(() => items.filter((i) => i.status === 'pendiente'), [items])

  if (loading) return <p className="muted">Cargando…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} members={members} pendingItems={pendingItems} onChanged={reload} />
        ))}
        {trips.length === 0 && <p className="muted">No hay compras programadas.</p>}
      </div>
      <AddTripForm members={members} onAdded={reload} />
    </div>
  )
}

function TripCard({
  trip,
  members,
  pendingItems,
  onChanged,
}: {
  trip: ShoppingTrip
  members: FamilyMember[]
  pendingItems: ShoppingItem[]
  onChanged: () => void
}) {
  const [amount, setAmount] = useState('')
  const [completing, setCompleting] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const assignedMember = members.find((m) => m.id === trip.memberId)

  async function handleComplete() {
    if (!amount) return
    await completeShoppingTrip(trip.id, Number(amount))
    onChanged()
  }

  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{trip.store || 'Compra sin tienda asignada'}</strong>
        <p className="muted">
          {trip.scheduledDate ?? 'sin fecha'}
          {trip.budget != null && ` · presupuesto ${trip.budget} €`}
          {trip.status === 'completada' && ` · gastado ${trip.actualAmount} €`}
        </p>
        {assignedMember && (
          <p className="muted">
            <MemberAvatar member={assignedMember} size={24} /> {assignedMember.name}
            {trip.calendarEventId && ' · 🔔 en su calendario'}
          </p>
        )}
        {showReceipt && (
          <TripReceiptForm
            trip={trip}
            pendingItems={pendingItems}
            onDone={() => {
              setShowReceipt(false)
              onChanged()
            }}
            onCancel={() => setShowReceipt(false)}
          />
        )}
      </div>
      {trip.status === 'planificada' && !completing && !showReceipt && (
        <>
          <button type="button" className="task-toggle" onClick={() => setShowReceipt(true)}>
            📷 Subir ticket
          </button>
          <button type="button" className="link-button" onClick={() => setCompleting(true)}>
            Completar a mano
          </button>
        </>
      )}
      {trip.status === 'planificada' && completing && (
        <>
          <input
            type="number"
            step="0.01"
            placeholder="Importe real €"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: 110 }}
          />
          <button type="button" className="task-toggle" onClick={handleComplete}>
            Guardar
          </button>
        </>
      )}
      <button type="button" className="link-button" onClick={() => deleteShoppingTrip(trip).then(onChanged)}>
        Eliminar
      </button>
    </div>
  )
}

type TripOcrStatus = 'idle' | 'reading' | 'done' | 'error'

interface TripReceiptLine {
  name: string
  quantity: string
  price: string
  matchedItemId: string | null
}

// Subir el ticket de una compra programada: lo lee con Gemini, empareja
// cada línea con lo que ya estaba pendiente en la lista de ese
// supermercado (si lo hay), y al guardar marca esos productos como
// comprados con su precio real, sube la foto del ticket y cierra la
// compra con el importe total — todo de una vez, en vez de tener que
// tocar cada producto suelto a mano.
function TripReceiptForm({
  trip,
  pendingItems,
  onDone,
  onCancel,
}: {
  trip: ShoppingTrip
  pendingItems: ShoppingItem[]
  onDone: () => void
  onCancel: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [ocrStatus, setOcrStatus] = useState<TripOcrStatus>('idle')
  const [lines, setLines] = useState<TripReceiptLine[]>([])
  const [totalAmount, setTotalAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Solo se compara contra lo pendiente de ESTA tienda (o sin tienda
  // asignada) — un ticket del Mercadona no debería emparejar con algo
  // que se apuntó para el Carrefour.
  const candidatePool = pendingItems.filter((i) => !i.store || i.store === trip.store)

  async function handleRead() {
    if (!file) return
    setOcrStatus('reading')
    setError(null)
    try {
      const parsed = await analyzeReceiptPhoto(file)
      if (parsed.total != null) setTotalAmount(String(parsed.total))
      setLines(
        parsed.items.map((l) => {
          const match = matchShoppingItem(l.name, candidatePool)
          return {
            name: match ? match.name : l.name,
            quantity: String(l.quantity),
            price: l.price.toFixed(2),
            matchedItemId: match?.id ?? null,
          }
        }),
      )
      setOcrStatus('done')
    } catch (err) {
      setOcrStatus('error')
      setError(err instanceof Error ? err.message : 'No se pudo leer el ticket')
    }
  }

  function updateLine(index: number, patch: Partial<TripReceiptLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSaveTrip() {
    if (!file) {
      setError('Sube la foto o el PDF del ticket')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const receiptDate = trip.scheduledDate ?? todayStr()
      await uploadReceipt({
        file,
        store: trip.store ?? '',
        receiptDate,
        totalAmount: totalAmount ? Number(totalAmount) : null,
      })

      await Promise.all(
        lines
          .filter((l) => l.name.trim() && !Number.isNaN(Number(l.price)))
          .map(async (l) => {
            if (l.matchedItemId) await updateShoppingItemStatus(l.matchedItemId, 'comprado')
            await recordProductPurchase({
              name: l.name.trim(),
              price: Number(l.price),
              quantity: l.quantity || '1',
              unit: '',
              store: trip.store ?? '',
              date: receiptDate,
            })
          }),
      )

      if (totalAmount) {
        await completeShoppingTrip(trip.id, Number(totalAmount))
      }
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la compra')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card member-form" onClick={(e) => e.stopPropagation()}>
      <FileOrPdfPicker file={file} onChange={setFile} />
      {file && (
        <button type="button" className="voice-mic-button" onClick={handleRead} disabled={ocrStatus === 'reading'}>
          {ocrStatus === 'reading' ? 'Leyendo ticket…' : '📷 Leer ticket'}
        </button>
      )}
      <label>
        Importe total (€)
        <input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
      </label>

      {(ocrStatus === 'done' || lines.length > 0) && (
        <div className="day-modal-group">
          <p className="muted">
            Productos leídos — los que coinciden con la lista se marcarán como comprados automáticamente:
          </p>
          {lines.map((line, i) => (
            <div key={i} className="receipt-line-row">
              <input type="text" value={line.name} onChange={(e) => updateLine(i, { name: e.target.value })} />
              <input
                type="number"
                className="receipt-line-qty"
                min={1}
                step={1}
                value={line.quantity}
                onChange={(e) => updateLine(i, { quantity: e.target.value })}
                placeholder="Cant."
              />
              <input
                type="number"
                step="0.01"
                value={line.price}
                onChange={(e) => updateLine(i, { price: e.target.value })}
                placeholder="Precio"
              />
              <button type="button" className="link-button" onClick={() => removeLine(i)}>
                ✕
              </button>
              {line.matchedItemId && <span className="muted">✓ en la lista</span>}
            </div>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button type="button" onClick={handleSaveTrip} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar compra'}
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function AddTripForm({ members, onAdded }: { members: FamilyMember[]; onAdded: () => void }) {
  const [scheduledDate, setScheduledDate] = useState('')
  const [store, setStore] = useState('')
  const [budget, setBudget] = useState('')
  const [memberId, setMemberId] = useState('')
  const [reminderMinutes, setReminderMinutes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createShoppingTrip({
        scheduledDate: scheduledDate || null,
        store,
        budget: budget ? Number(budget) : null,
        memberId: memberId || null,
        reminderMinutes: reminderMinutes ? Number(reminderMinutes) : null,
      })
      setStore('')
      setBudget('')
      setMemberId('')
      setReminderMinutes('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Programar compra</h2>
      <label>
        Fecha
        <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
      </label>
      <label>
        Tienda
        <input type="text" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Mercadona" />
      </label>
      <label>
        Presupuesto (€)
        <input type="number" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
      </label>
      <label>
        Asignar a
        <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Nadie en particular</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {memberId && (
        <label>
          Recordatorio en su calendario
          <select value={reminderMinutes} onChange={(e) => setReminderMinutes(e.target.value)}>
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Guardando…' : 'Programar'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Inventario (Skill 12)
// ---------------------------------------------------------------------

const CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: 'frigorifico', label: 'Frigorífico' },
  { value: 'congelador', label: 'Congelador' },
  { value: 'despensa', label: 'Despensa' },
  { value: 'limpieza', label: 'Limpieza' },
  { value: 'higiene', label: 'Higiene' },
  { value: 'bebe', label: 'Bebé' },
  { value: 'otros', label: 'Otros' },
]

function InventoryTab() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFridgePhoto, setShowFridgePhoto] = useState(false)

  function reload() {
    setLoading(true)
    listInventoryItems()
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const grouped = useMemo(() => {
    const map = new Map<InventoryCategory, InventoryItem[]>()
    for (const item of items) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return map
  }, [items])

  if (loading) return <p className="muted">Cargando inventario…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {CATEGORIES.filter((c) => grouped.has(c.value)).map((c) => (
        <div key={c.value}>
          <h2 className="section-title">{c.label}</h2>
          <div className="event-list">
            {grouped.get(c.value)!.map((item) => (
              <InventoryRow key={item.id} item={item} onChanged={reload} />
            ))}
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="muted">El inventario está vacío.</p>}

      <button type="button" className="voice-mic-button" onClick={() => setShowFridgePhoto(true)}>
        📷 Reconocer con foto del frigorífico
      </button>

      <AddInventoryForm onAdded={reload} />

      {showFridgePhoto && (
        <FridgePhotoModal
          onClose={() => setShowFridgePhoto(false)}
          onAdded={() => {
            setShowFridgePhoto(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

interface DraftFridgeItem {
  name: string
  checked: boolean
}

// Analiza la foto con Gemini (nivel gratuito, vía función de servidor —
// la clave nunca toca el cliente) y enseña lo detectado como checklist
// editable: el reconocimiento por foto puede fallar o confundirse, así
// que nada se guarda sin que la familia lo confirme antes.
function FridgePhotoModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle')
  const [draftItems, setDraftItems] = useState<DraftFridgeItem[]>([])
  const [category, setCategory] = useState<InventoryCategory>('frigorifico')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleAnalyze() {
    if (!file) return
    setStatus('analyzing')
    setError(null)
    try {
      const items = await analyzeFridgePhoto(file)
      setDraftItems(items.map((name) => ({ name, checked: true })))
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'No se pudo analizar la foto')
    }
  }

  function toggleItem(i: number) {
    setDraftItems((prev) => prev.map((d, idx) => (idx === i ? { ...d, checked: !d.checked } : d)))
  }

  function renameItem(i: number, name: string) {
    setDraftItems((prev) => prev.map((d, idx) => (idx === i ? { ...d, name } : d)))
  }

  async function handleAddSelected() {
    setSaving(true)
    setError(null)
    try {
      for (const item of draftItems) {
        if (!item.checked || !item.name.trim()) continue
        await addInventoryItem({ name: item.name.trim(), category, quantity: '' })
      }
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            Foto del frigorífico
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <label>
          Foto
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        {file && status !== 'done' && (
          <button type="button" className="voice-mic-button" onClick={handleAnalyze} disabled={status === 'analyzing'}>
            {status === 'analyzing' ? 'Analizando la foto…' : '🔍 Reconocer alimentos'}
          </button>
        )}

        {error && <p className="error">{error}</p>}

        {status === 'done' && (
          <div className="day-modal-group">
            <p className="muted">
              {draftItems.length === 0
                ? 'No he reconocido ningún alimento — prueba con otra foto o añádelos a mano.'
                : 'Marca los que quieras guardar (puedes corregir el nombre):'}
            </p>
            {draftItems.map((item, i) => (
              <div key={i} className="receipt-line-row">
                <input type="checkbox" checked={item.checked} onChange={() => toggleItem(i)} />
                <input type="text" value={item.name} onChange={(e) => renameItem(i, e.target.value)} />
              </div>
            ))}
            {draftItems.length > 0 && (
              <>
                <label>
                  Categoría
                  <select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={handleAddSelected} disabled={saving}>
                  {saving ? 'Guardando…' : 'Añadir seleccionados al inventario'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InventoryRow({ item, onChanged }: { item: InventoryItem; onChanged: () => void }) {
  const [quantity, setQuantity] = useState(item.quantity ?? '')

  return (
    <div className="card task-card">
      <div className="task-card-main">
        <strong>{item.name}</strong>
      </div>
      <input
        type="text"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        onBlur={() => updateInventoryQuantity(item.id, quantity).then(onChanged)}
        placeholder="cantidad"
        style={{ width: 90 }}
      />
      <button type="button" className="link-button" onClick={() => deleteInventoryItem(item.id).then(onChanged)}>
        Eliminar
      </button>
    </div>
  )
}

function AddInventoryForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<InventoryCategory>('frigorifico')
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addInventoryItem({ name, category, quantity })
      setName('')
      setQuantity('')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card member-form">
      <h2>Añadir al inventario</h2>
      <label>
        Nombre
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Categoría
        <select value={category} onChange={(e) => setCategory(e.target.value as InventoryCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cantidad
        <input type="text" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="2 unidades" />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Añadiendo…' : 'Añadir'}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------
// Memoria de compras (Skill 09/11)
// ---------------------------------------------------------------------

function MemoryTab() {
  const [products, setProducts] = useState<Product[]>([])
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([listProducts(), listAllProductPrices()])
      .then(([p, pr]) => {
        setProducts(p)
        setPrices(pr)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const withStats = useMemo(
    () =>
      products
        .map((product) => ({
          product,
          stats: computeProductStats(prices.filter((p) => p.productId === product.id)),
        }))
        .filter((x) => x.stats !== null),
    [products, prices],
  )

  const suggestions = withStats.filter((x) => x.stats!.isDue)

  async function handleAddSuggestion(product: Product) {
    try {
      await addShoppingItem({ name: product.displayName, quantity: '', unit: '', priority: 'normal', tripId: null })
      setAdded((prev) => new Set(prev).add(product.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir')
    }
  }

  if (loading) return <p className="muted">Cargando memoria de compras…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        Se construye sola: cada vez que guardas el precio de un producto comprado, queda aquí.
      </p>

      <h2 className="section-title">Sugerencias para la próxima compra</h2>
      <div className="event-list">
        {suggestions.map(({ product, stats }) => (
          <div key={product.id} className="card task-card">
            <div className="task-card-main">
              <strong>{product.displayName}</strong>
              <p className="muted">
                Sueles comprarlo cada {Math.round(stats!.avgDaysBetween!)} días · última vez {stats!.lastDate}
              </p>
            </div>
            <button
              type="button"
              className="task-toggle"
              disabled={added.has(product.id)}
              onClick={() => handleAddSuggestion(product)}
            >
              {added.has(product.id) ? '✓ En la lista' : 'Añadir a la lista'}
            </button>
          </div>
        ))}
        {suggestions.length === 0 && <p className="muted">Sin sugerencias todavía.</p>}
      </div>

      <h2 className="section-title">Historial por producto</h2>
      <div className="event-list">
        {withStats.map(({ product, stats }) => (
          <div key={product.id} className="card">
            <strong>{product.displayName}</strong>
            <p className="muted">
              {stats!.count} {stats!.count === 1 ? 'compra' : 'compras'} · último {stats!.lastPrice.toFixed(2)} € ·
              media {stats!.avgPrice.toFixed(2)} € · mín {stats!.minPrice.toFixed(2)} € · máx{' '}
              {stats!.maxPrice.toFixed(2)} €
            </p>
          </div>
        ))}
        {withStats.length === 0 && (
          <p className="muted">
            Todavía no hay historial — guarda el precio de algún producto en "Comprados" dentro de la Lista.
          </p>
        )}
      </div>
    </div>
  )
}
