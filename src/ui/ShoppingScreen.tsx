import { FormEvent, useEffect, useMemo, useState } from 'react'
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
  updateInventoryQuantity,
  updateShoppingItemStatus,
} from '@/data/shopping'
import { listAllProductPrices, listProducts, recordProductPurchase } from '@/data/products'
import { computeProductStats } from '@/domain/products'
import type {
  InventoryCategory,
  InventoryItem,
  Product,
  ProductPrice,
  ShoppingItem,
  ShoppingItemPriority,
  ShoppingItemStatus,
  ShoppingTrip,
} from '@/domain/types'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shoppingMode, setShoppingMode] = useState(false)
  const [showOthers, setShowOthers] = useState(false)

  function reload() {
    setLoading(true)
    listShoppingItems()
      .then(setItems)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const pending = items.filter((i) => i.status === 'pendiente')
  const bought = items.filter((i) => i.status === 'comprado')
  const others = items.filter((i) => i.status === 'omitido' || i.status === 'trasladado')
  const total = pending.length + bought.length

  async function setStatus(id: string, status: ShoppingItemStatus) {
    try {
      await updateShoppingItemStatus(id, status)
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  if (loading) return <p className="muted">Cargando lista…</p>

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
      <div className="event-list">
        {pending.map((item) => (
          <div key={item.id} className="card task-card">
            <div className="task-card-main">
              <strong>{item.name}</strong>
              <p className="muted">
                {[item.quantity, item.unit].filter(Boolean).join(' ')}
                {!shoppingMode && item.priority !== 'normal' && ` · prioridad ${item.priority}`}
              </p>
            </div>
            <button
              type="button"
              className="task-toggle"
              onClick={() => setStatus(item.id, 'comprado')}
            >
              ✓ Comprado
            </button>
            {!shoppingMode && (
              <>
                <button type="button" className="link-button" onClick={() => setStatus(item.id, 'trasladado')}>
                  Próxima compra
                </button>
                <button type="button" className="link-button" onClick={() => setStatus(item.id, 'omitido')}>
                  Ya tengo
                </button>
                <button type="button" className="link-button" onClick={() => deleteShoppingItem(item.id).then(reload)}>
                  Eliminar
                </button>
              </>
            )}
          </div>
        ))}
        {pending.length === 0 && <p className="muted">Nada pendiente.</p>}
      </div>

      <h2 className="section-title">Comprados</h2>
      <div className="event-list">
        {bought.map((item) => (
          <BoughtItemRow key={item.id} item={item} onUndo={() => setStatus(item.id, 'pendiente')} />
        ))}
        {bought.length === 0 && <p className="muted">Todavía ninguno.</p>}
      </div>

      {!shoppingMode && <AddShoppingItemForm onAdded={reload} />}

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

// Registrar el precio pagado es opcional (Skill 06 no lo exige), pero
// alimenta la memoria de compras (Skill 09/11) — sin esto no hay
// historial de precios que ofrecer.
function BoughtItemRow({ item, onUndo }: { item: ShoppingItem; onUndo: () => void }) {
  const [price, setPrice] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSavePrice() {
    if (!price) return
    setError(null)
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
        <span className="muted">✓ Precio guardado</span>
      ) : (
        <>
          <input
            type="number"
            step="0.01"
            placeholder="Precio €"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={{ width: 90 }}
          />
          <button type="button" className="link-button" onClick={handleSavePrice}>
            Guardar
          </button>
        </>
      )}
      <button type="button" className="link-button" onClick={onUndo}>
        ↺ Deshacer
      </button>
    </div>
  )
}

function AddShoppingItemForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [priority, setPriority] = useState<ShoppingItemPriority>('normal')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addShoppingItem({ name, quantity, unit, priority, tripId: null })
      setName('')
      setQuantity('')
      setUnit('')
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
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    listShoppingTrips()
      .then(setTrips)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  if (loading) return <p className="muted">Cargando…</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}
      <div className="event-list">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} onChanged={reload} />
        ))}
        {trips.length === 0 && <p className="muted">No hay compras programadas.</p>}
      </div>
      <AddTripForm onAdded={reload} />
    </div>
  )
}

function TripCard({ trip, onChanged }: { trip: ShoppingTrip; onChanged: () => void }) {
  const [amount, setAmount] = useState('')
  const [completing, setCompleting] = useState(false)

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
      </div>
      {trip.status === 'planificada' && !completing && (
        <button type="button" className="task-toggle" onClick={() => setCompleting(true)}>
          Completar
        </button>
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
      <button type="button" className="link-button" onClick={() => deleteShoppingTrip(trip.id).then(onChanged)}>
        Eliminar
      </button>
    </div>
  )
}

function AddTripForm({ onAdded }: { onAdded: () => void }) {
  const [scheduledDate, setScheduledDate] = useState('')
  const [store, setStore] = useState('')
  const [budget, setBudget] = useState('')
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
      })
      setStore('')
      setBudget('')
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
      <AddInventoryForm onAdded={reload} />
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
