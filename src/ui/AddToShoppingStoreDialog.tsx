import { useEffect, useRef, useState } from 'react'
import { canonicalStore } from '@/domain/storeAssignment'
import { useShoppingStores } from '@/ui/ShoppingStoreChoice'

// «→ Compras» de UN producto suelto de Eventos (decoración, material de una actividad): elegir en qué tienda habitual se apunta antes de confirmar. Misma lista de tiendas que el
// resto de envíos a Compras (las de la familia). Si la familia no tiene tiendas, no pregunta nada: se apunta «Sin tienda» como siempre.
export function AddToShoppingStoreDialog({
  title,
  productName,
  onConfirm,
  onCancel,
}: {
  title: string
  productName: string
  onConfirm: (store: string | null) => Promise<void>
  onCancel: () => void
}) {
  const { stores, loaded } = useShoppingStores()
  const [store, setStore] = useState('')
  const [saving, setSaving] = useState(false)
  const auto = useRef(false)

  async function confirm(value: string | null) {
    setSaving(true)
    try {
      await onConfirm(value)
    } finally {
      setSaving(false)
    }
  }

  // Sin tiendas habituales no hay nada que elegir.
  useEffect(() => {
    if (loaded && stores.length === 0 && !auto.current) {
      auto.current = true
      void confirm(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, stores.length])

  if (!loaded || stores.length === 0) return null
  return (
    <div className="modal-overlay" role="presentation" onClick={() => !saving && onCancel()}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="section-title" style={{ margin: 0 }}>
            {title}
          </h2>
          <button type="button" className="modal-close" onClick={onCancel} disabled={saving} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p style={{ margin: '0 0 8px' }}>«{productName}»</p>
        <label className="store-choice-general" style={{ display: 'flex', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <span>Tienda</span>
          <select value={store} onChange={(e) => setStore(e.target.value)} style={{ flex: 1, minHeight: 44 }}>
            <option value="">Sin tienda</option>
            {stores.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" style={{ width: '100%', minHeight: 44, marginTop: 12 }} disabled={saving} onClick={() => void confirm(canonicalStore(stores, store))}>
          {saving ? 'Añadiendo…' : 'Añadir a Compras'}
        </button>
      </div>
    </div>
  )
}
