import { useEffect, useRef, useState } from 'react'
import { registerDialog } from '@/pepa/dialog'
import { DialogReplyBar } from '@/ui/DialogReplyBar'

// "¿En qué tienda quieres añadirlos?" — se ofrecen SOLO las tiendas reales de la
// familia y "Sin tienda"; nunca se inventa una. Se responde tocando o hablando. Elegir
// no modifica Compras: solo prepara la tarjeta final de ingredientes, que sigue
// necesitando confirmación.
export function StoreQuestionSheet({
  recipeTitle,
  stores,
  onChoose,
  onCancel,
  onReply,
}: {
  recipeTitle: string
  stores: string[]
  // Devuelve el mensaje a decir al elegir (o null si no se ha podido).
  onChoose: (store: string | null) => Promise<string | null>
  onCancel: () => void
  onReply: (text: string) => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const lockRef = useRef(false)
  const latest = useRef({ onChoose, onCancel })
  latest.current = { onChoose, onCancel }

  async function choose(store: string | null): Promise<string | null> {
    if (lockRef.current) return null
    lockRef.current = true
    setBusy(true)
    try {
      return await latest.current.onChoose(store)
    } finally {
      lockRef.current = false
      setBusy(false)
    }
  }

  useEffect(
    () =>
      registerDialog(() => ({
        kind: 'store-question',
        stores,
        chooseStore: choose,
        cancel: () => {
          latest.current.onCancel()
          return 'Vale, no añado nada.'
        },
      })),
    [stores],
  )

  return (
    <div className="modal-overlay action-confirm-overlay" onClick={busy ? undefined : onCancel}>
      <div className="modal-sheet" role="dialog" aria-label="Elegir tienda" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px' }}>🛒 ¿En qué tienda quieres añadirlos?</h3>
        <p className="muted" style={{ margin: '0 0 8px' }}>
          Ingredientes de «{recipeTitle}». Después verás la lista antes de que se añada nada.
        </p>
        <div className="filter-row" role="group" aria-label="Tiendas">
          {stores.map((store) => (
            <button key={store} type="button" className="chip" disabled={busy} onClick={() => void choose(store)}>
              {store}
            </button>
          ))}
          <button type="button" className="chip" disabled={busy} onClick={() => void choose(null)}>
            Sin tienda
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="link-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
        <DialogReplyBar onReply={onReply} />
      </div>
    </div>
  )
}
