import { useEffect, useId, useState } from 'react'
import { listShoppingStores } from '@/data/shoppingStores'
import { FOLLOW_GENERAL, rowSelectValue, setGeneralStore, setRowStore, setSplit, storeSummary, storeSummaryText, type StoreChoice } from '@/domain/storeAssignment'
import type { ShoppingStoreEntry } from '@/domain/types'
import '@/ui/shoppingStoreChoice.css'

// Selector de tienda COMPARTIDO por todos los envíos a Compras (menús de Comunidad y de la Cocina, recetas, eventos). Solo ofrece las tiendas habituales que la familia ya
// tiene en Compras (nunca un catálogo aparte). Una lectura de las tiendas al abrir la hoja; si la familia no tiene ninguna, no se enseña nada y todo va «Sin tienda».

export function useShoppingStores(): { stores: ShoppingStoreEntry[]; loaded: boolean } {
  const [stores, setStores] = useState<ShoppingStoreEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    listShoppingStores()
      .then((s) => {
        if (!cancelled) setStores(s)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { stores, loaded }
}

// Barra superior: «Tienda para todo» y la opción «Repartir entre varias tiendas».
export function StoreChoiceBar({
  stores,
  choice,
  onChange,
  keys,
  hideSplit = false,
}: {
  stores: ShoppingStoreEntry[]
  choice: StoreChoice
  onChange: (next: StoreChoice) => void
  // Claves de los productos marcados (para el resumen de cuántos van a cada tienda).
  keys: string[]
  // Pantallas que ya enseñan siempre un selector de tienda en cada producto (revisión del menú de un evento): solo se ofrece la tienda general.
  hideSplit?: boolean
}) {
  const uid = useId()
  if (stores.length === 0) return null
  const summary = choice.split ? storeSummaryText(storeSummary(choice, keys, stores)) : ''
  return (
    <div className="store-choice-bar">
      <label htmlFor={`${uid}-general`} className="store-choice-general">
        <span>{hideSplit ? 'Tienda por defecto' : choice.split ? 'Tienda para el resto' : 'Tienda para todo'}</span>
        <select id={`${uid}-general`} value={choice.general} onChange={(e) => onChange(setGeneralStore(choice, e.target.value))}>
          <option value="">Sin tienda</option>
          {stores.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {!hideSplit && (
        <label className="store-choice-split">
          <input type="checkbox" checked={choice.split} onChange={(e) => onChange(setSplit(choice, e.target.checked))} />
          <span>Repartir entre varias tiendas</span>
        </label>
      )}
      {choice.split && !hideSplit && (
        <p className="store-choice-hint muted">
          Elige la tienda general y cambia solo los productos que compras en otra.{summary && <strong> {summary}</strong>}
        </p>
      )}
    </div>
  )
}

// Selector compacto de UN producto (solo en modo reparto). «Como el resto» = sigue a la tienda general.
export function RowStoreSelect({
  stores,
  choice,
  onChange,
  rowKey,
  name,
  className = 'store-choice-row',
}: {
  stores: ShoppingStoreEntry[]
  choice: StoreChoice
  onChange: (next: StoreChoice) => void
  rowKey: string
  name: string
  className?: string
}) {
  if (!choice.split || stores.length === 0) return null
  return (
    <select
      className={className}
      value={rowSelectValue(choice, rowKey)}
      aria-label={`Tienda de ${name}`}
      onChange={(e) => onChange(setRowStore(choice, rowKey, e.target.value === FOLLOW_GENERAL ? null : e.target.value))}
    >
      <option value={FOLLOW_GENERAL}>Como el resto ({choice.general || 'sin tienda'})</option>
      <option value="">Sin tienda</option>
      {stores.map((s) => (
        <option key={s.id} value={s.name}>
          {s.name}
        </option>
      ))}
    </select>
  )
}
