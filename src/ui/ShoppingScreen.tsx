import { FormEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ReorderableTabBar } from '@/ui/ReorderableTabBar'
import {
  addShoppingItem,
  completeShoppingTrip,
  createShoppingTrip,
  deleteShoppingItem,
  deleteShoppingTrip,
  listShoppingItems,
  listShoppingTrips,
  reorderShoppingItems,
  updateShoppingItemStatus,
} from '@/data/shopping'
import { listAllProductPrices, listProducts, recordProductPurchase } from '@/data/products'
import { createShoppingStore, deleteShoppingStore, listShoppingStores, renameShoppingStore } from '@/data/shoppingStores'
import { listFamilyMembers } from '@/data/family'
import { MemberAvatar } from '@/ui/MemberAvatar'
import { ConfirmButton, ConfirmIconButton } from '@/ui/ConfirmButton'
import { uploadReceipt } from '@/data/receipts'
import { computeProductStats } from '@/domain/products'
import { analyzeReceiptPhoto } from '@/services/receiptPhoto'
import { FileOrPdfPicker } from '@/ui/FileOrPdfPicker'
import { normalize } from '@/domain/voiceQuery'
import { getStoreIcon } from '@/domain/storeIcons'
import { averagePricesByMonth, basketTotal, compareMonths } from '@/domain/priceTrends'
import { MONTH_LABELS } from '@/domain/calendar'
import type {
  FamilyMember,
  Product,
  ProductPrice,
  ShoppingItem,
  ShoppingItemPriority,
  ShoppingItemStatus,
  ShoppingStoreEntry,
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

const MATCH_STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'un', 'una', 'para', 'con', 'en'])

// Palabras sueltas y "de peso" (sin tildes, sin plural simple, sin
// símbolos) — el ticket real abrevia mucho ("GEL LIMPIADOR BAÑO" en vez
// de "Gel de baño"), así que comparar la frase entera como subcadena se
// queda corto en cuanto el ticket reordena o recorta alguna palabra.
function significantTokens(s: string): string[] {
  return normalizeProductName(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)) // plural simple: "proteinas" ~ "proteina"
    .filter((w) => w.length > 1 && !MATCH_STOPWORDS.has(w))
}

// Empareja lo leído del ticket ("hamburguesas") con un producto YA
// pendiente en la lista ("Hamburguesas mixtas"). Primero por subcadena
// (lo más fiable); si no hay, por palabras compartidas — exige que la
// MAYORÍA de las palabras del producto de la lista aparezcan en la
// línea del ticket, para no colar un match dudoso entre dos productos
// solo parecidos. Ante duda de verdad, no empareja: mejor dejarlo
// como línea suelta (se puede emparejar a mano) que asignarle el precio
// al producto equivocado — un ticket real trae líneas tan crípticas
// ("+PROT NATILLA VAINI") que a veces ni una persona sabría decir con
// seguridad a qué producto de la lista corresponden.
function matchShoppingItem(lineName: string, items: ShoppingItem[]): ShoppingItem | null {
  const n = normalizeProductName(lineName)
  if (!n) return null

  const substringMatch = items.find((i) => {
    const din = normalizeProductName(i.name)
    return din.includes(n) || n.includes(din)
  })
  if (substringMatch) return substringMatch

  const lineTokens = new Set(significantTokens(lineName))
  if (lineTokens.size === 0) return null

  let best: { item: ShoppingItem; score: number } | null = null
  for (const item of items) {
    const itemTokens = significantTokens(item.name)
    if (itemTokens.length === 0) continue
    const shared = itemTokens.filter((t) => lineTokens.has(t)).length
    const score = shared / itemTokens.length
    if (score >= 0.6 && (!best || score > best.score)) best = { item, score }
  }
  return best?.item ?? null
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

const SUB_TABS = ['Lista', 'Programadas', 'Memoria', 'Historial'] as const
type SubTab = (typeof SUB_TABS)[number]

export function ShoppingScreen() {
  const [tab, setTab] = useState<SubTab>('Lista')

  return (
    <div className="screen">
      <h1>Compras</h1>
      <ReorderableTabBar storageKey="compras" tabs={SUB_TABS} active={tab} onSelect={setTab} />

      {tab === 'Lista' && <ShoppingListTab />}
      {tab === 'Programadas' && <TripsTab />}
      {tab === 'Memoria' && <MemoryTab />}
      {tab === 'Historial' && <HistoryTab />}
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
  const [showOthers, setShowOthers] = useState(false)

  // Solo se enseña "Cargando…" (que desmonta el formulario de abajo) la
  // primera vez — si no, cada "reload" tras añadir un producto borraba
  // lo que llevaras escrito en el formulario, incluida la tienda que se
  // deja puesta a propósito entre productos seguidos.
  function reload() {
    setLoading(true)
    Promise.all([listShoppingItems(), listProducts(), listAllProductPrices(), listShoppingStores()])
      .then(([shoppingItems, products, prices, shoppingStores]) => {
        setItems(shoppingItems)
        setSuggestions(buildSuggestions(products, prices))
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

      <StoreManager stores={stores} onChanged={reload} />

      <h2 className="section-title">Pendientes</h2>
      {storeGroups.map(([store, storeItems]) => (
        <div key={store} id={`shopping-store-${normalize(store)}`}>
          {storeGroups.length > 1 && (
            <h3 className="shopping-store-heading">
              {store === 'Sin tienda' ? '🏬' : <StoreIconBadge name={store} size={20} />} {store}
            </h3>
          )}
          <DraggableStoreGroup
            items={storeItems}
            suggestions={suggestions}
            shoppingMode={shoppingMode}
            onSetStatus={setStatus}
            onDeleted={reload}
            onReordered={reload}
          />
        </div>
      ))}
      {pending.length === 0 && <p className="muted">Nada pendiente.</p>}

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
                <ConfirmButton label="Eliminar" onConfirm={() => deleteShoppingItem(item.id).then(reload)} />
              </div>
            ))}
        </>
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
  const icon = getStoreIcon(name)
  const [broken, setBroken] = useState(false)

  function handleClick(e: { stopPropagation: () => void }) {
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('family-app:focus-store', { detail: { store: name } }))
  }

  if (icon.kind === 'logo' && !broken) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${icon.domain}&sz=${size * 2}`}
        alt={`Ir a la lista de ${name}`}
        width={size}
        height={size}
        style={{ borderRadius: 4, verticalAlign: 'middle', cursor: 'pointer' }}
        onClick={handleClick}
        // Si el dominio no tiene favicon de verdad (dominio adivinado
        // que resulta no existir o no responder), se cae al icono
        // genérico en vez de dejar un hueco de imagen rota.
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span
      role="button"
      aria-label={`Ir a la lista de ${name}`}
      onClick={handleClick}
      style={{ fontSize: size, cursor: 'pointer' }}
    >
      {icon.kind === 'emoji' ? icon.icon : '🏬'}
    </span>
  )
}

// Tiendas que Pepa reconoce por voz al apuntar en la compra — editable
// desde aquí, no fija en el código, para que cada familia tenga las
// suyas (petición real: "que puedas añadir los supermercados que
// quieras o quitar los que quieras... si vendo la aplicación y otra
// persona tiene Carbo Bravo, que pueda cambiarlo").
function StoreManager({ stores, onChanged }: { stores: ShoppingStoreEntry[]; onChanged: () => void }) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

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
      <div className="filter-row">
        {stores.map((s) =>
          editingId === s.id ? (
            <span key={s.id} className="chip">
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                style={{ width: 100, border: 'none', padding: 0 }}
                autoFocus
              />
              <button type="button" className="link-button" onClick={() => handleRename(s.id)} aria-label="Guardar">
                ✓
              </button>
              <button type="button" className="link-button" onClick={() => setEditingId(null)} aria-label="Cancelar">
                ✕
              </button>
            </span>
          ) : (
            <span key={s.id} className="chip">
              <span
                onClick={() => {
                  setEditingId(s.id)
                  setEditingName(s.name)
                }}
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <StoreIconBadge name={s.name} />
                {s.name}
              </span>
              <ConfirmIconButton className="link-button" ariaLabel={`Quitar ${s.name}`} onConfirm={() => handleDelete(s.id)} />
            </span>
          ),
        )}
        {stores.length === 0 && <p className="muted">Ninguna todavía.</p>}
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
              {/* Precio por unidad de la última vez que se compró, si se
                  conoce — petición real: verlo ya al añadir/ver la lista,
                  no solo yendo a mirar la Memoria aparte. */}
              {(() => {
                const known = suggestions.find((s) => s.normalizedName === normalizeProductName(item.name))
                return known?.lastPrice != null ? ` · ${known.lastPrice.toFixed(2)} €/ud` : null
              })()}
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
              <ConfirmButton label="Eliminar" onConfirm={() => deleteShoppingItem(item.id).then(onDeleted)} />
            </>
          )}
        </div>
      ))}
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
      <ConfirmButton label="Eliminar" onConfirm={() => deleteShoppingTrip(trip).then(onChanged)} />
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
            // El ticket trae el importe TOTAL de la línea ("2 botellas de
            // leche, 2,00€"), no el precio de una — antes se guardaba tal
            // cual y la Memoria de precios enseñaba 2€ como si fuera el
            // precio de una botella (bug real reportado). Se divide entre
            // las unidades para guardar siempre precio por unidad.
            const units = Number(l.quantity)
            const unitPrice = Number.isFinite(units) && units > 0 ? Number(l.price) / units : Number(l.price)
            // El precio se guarda EN el propio producto al marcarlo
            // comprado (no solo en la Memoria de precios) — si no, al
            // recargar la app "Comprados" no sabía que este ya tenía
            // precio y lo volvía a pedir (bug real reportado).
            if (l.matchedItemId) await updateShoppingItemStatus(l.matchedItemId, 'comprado', unitPrice)
            await recordProductPurchase({
              name: l.name.trim(),
              price: unitPrice,
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
                placeholder="Precio total"
              />
              <button type="button" className="link-button" onClick={() => removeLine(i)}>
                ✕
              </button>
              {line.matchedItemId && <span className="muted">✓ en la lista</span>}
              {/* El ticket da el importe total de la línea — se enseña a
                  cuánto sale la unidad para que se vea el cálculo antes
                  de guardar (petición real: precio por unidad, no total). */}
              {Number(line.quantity) > 1 && !Number.isNaN(Number(line.price)) && (
                <span className="muted">= {(Number(line.price) / Number(line.quantity)).toFixed(2)} €/ud</span>
              )}
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
                Sueles comprarlo cada {Math.round(stats!.avgDaysBetween!)} días · última vez {stats!.lastDate} ·{' '}
                {stats!.lastPrice.toFixed(2)} €/ud
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
          <div key={product.id} className="card task-card">
            <div className="task-card-main">
              <strong>{product.displayName}</strong>
              <p className="muted">
                {stats!.count} {stats!.count === 1 ? 'compra' : 'compras'} · último {stats!.lastPrice.toFixed(2)}{' '}
                €/ud · media {stats!.avgPrice.toFixed(2)} €/ud · mín {stats!.minPrice.toFixed(2)} €/ud · máx{' '}
                {stats!.maxPrice.toFixed(2)} €/ud
              </p>
            </div>
            {/* Petición real: poder añadirlo a la lista directamente desde
                el historial, no solo desde las sugerencias de arriba. */}
            <button
              type="button"
              className="link-button"
              disabled={added.has(product.id)}
              onClick={() => handleAddSuggestion(product)}
            >
              {added.has(product.id) ? '✓ En la lista' : 'Añadir a la lista'}
            </button>
          </div>
        ))}
        {withStats.length === 0 && (
          <p className="muted">
            Todavía no hay historial — se rellena solo al cerrar una compra programada con el ticket, en
            "Programadas".
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
// Historial (antes "Precios" en Dinero) — compara lo pagado por cada
// producto este mes frente al anterior, a partir del mismo historial
// que alimentan los tickets y la Memoria de la lista de la compra. No
// normaliza por cantidad (1L vs 1,5L cuentan igual): compara lo que se
// pagó cada vez, que es el dato que hay sin pedir cantidades exactas
// en cada compra. Petición real: "la sección de precios la vamos a
// quitar de Dinero y la vamos a poner en Compras, al lado de Memoria...
// le vamos a poner Historial".
// ---------------------------------------------------------------------

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

function HistoryTab() {
  const [prices, setPrices] = useState<ProductPrice[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleMonth, setVisibleMonth] = useState(todayStr().slice(0, 7))
  // Petición real: "vamos a añadir un botón... añadir a la lista de la
  // compra... con el precio que hay marcado" — un solo toque para
  // apuntarlo, con el último precio ya puesto. "added" evita mandarlo
  // dos veces si se toca otra vez.
  const [added, setAdded] = useState<Set<string>>(new Set())

  async function handleAddToList(productId: string, name: string, price: number | null) {
    try {
      await addShoppingItem({ name, quantity: '', unit: '', priority: 'normal', tripId: null, price })
      setAdded((prev) => new Set(prev).add(productId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir a la lista')
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([listAllProductPrices(), listProducts()])
      .then(([p, prod]) => {
        setPrices(p)
        setProducts(prod)
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

  const purchases = useMemo(
    () =>
      prices.map((p) => {
        const qty = Number(p.quantity)
        return {
          productId: p.productId,
          price: p.price,
          quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
          recordedDate: p.recordedDate,
        }
      }),
    [prices],
  )

  const comparisons = useMemo(() => {
    const monthly = averagePricesByMonth(purchases)
    return compareMonths(monthly, visibleMonth, previousMonth)
      .map((c) => ({ ...c, name: productById.get(c.productId) ?? '?' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [purchases, visibleMonth, previousMonth, productById])

  const currentBasket = useMemo(() => basketTotal(purchases, visibleMonth), [purchases, visibleMonth])
  const previousBasket = useMemo(() => basketTotal(purchases, previousMonth), [purchases, previousMonth])
  const basketDeltaPercent = previousBasket > 0 ? ((currentBasket - previousBasket) / previousBasket) * 100 : null

  if (loading) return <p className="muted">Cargando historial…</p>

  const [visibleYear, visibleMonthIndex] = visibleMonth.split('-').map(Number)

  return (
    <div>
      {error && <p className="error">{error}</p>}

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
        Precio medio por unidad este mes frente al mes anterior — 🔺 rojo si ha subido, 🔻 verde si ha bajado.
        Si compraste varias unidades de golpe (p. ej. 2 bolsas de patatas), se tiene en cuenta para no confundir
        "comprar más" con "subir de precio".
      </p>

      <div className="price-row-list">
        {comparisons.map((c) => (
          <div key={c.productId} className="price-row">
            <span className="price-row-name">{c.name}</span>
            <span className="price-row-price">
              {c.currentPrice!.toFixed(2)} €<PriceDelta percent={c.deltaPercent} />
            </span>
            <button
              type="button"
              className="link-button"
              disabled={added.has(c.productId)}
              onClick={() => handleAddToList(c.productId, c.name, c.currentPrice)}
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
    </div>
  )
}
