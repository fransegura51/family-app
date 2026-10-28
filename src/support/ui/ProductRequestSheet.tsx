// Hoja «Solicitar nuevo producto»: muestra exactamente lo que se enviará y crea la incidencia en Soporte. Solo se pinta con SUPPORT_ENABLED.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { errorMessage } from '@/domain/errorMessage'
import { createTicket } from '@/support/data'
import { buildProductRequest } from '@/support/productRequest'
import { SUPPORT_ENABLED } from '@/support/flags'

export interface ProductRequestContext {
  raw: string
  searched: string
  classLabel: string
}

export function ProductRequestSheet({ context, onClose, onSent }: { context: ProductRequestContext; onClose: () => void; onSent?: (ticketId: string) => void }) {
  const [searched, setSearched] = useState(context.searched)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!SUPPORT_ENABLED) return null
  const ticket = buildProductRequest({ raw: context.raw, searched, suggestedCategory: context.classLabel, notes })

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const id = await createTicket({ kind: ticket.kind, section: ticket.section, subject: ticket.subject, body: ticket.body, context: { section: ticket.section } })
      setDone(true)
      onSent?.(id)
    } catch (err) {
      setError(errorMessage(err, 'No se pudo enviar la solicitud'))
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-overlay catalog-picker-overlay" onClick={onClose}>
      <div className="modal-sheet catalog-picker-sheet" role="dialog" aria-label="Solicitar nuevo producto" data-help-id="catalog.request" onClick={(e) => e.stopPropagation()}>
        <div className="catalog-picker-head">
          <h2 className="section-title" style={{ margin: 0 }}>
            Solicitar nuevo producto
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {done ? (
          <div className="catalog-picker-body">
            <p>Solicitud enviada. Revisamos cada una y te contestamos por Soporte: si el producto ya existe te diremos cuál usar; si no, lo añadiremos.</p>
            <button type="button" className="receipt-line-reading-btn primary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <div className="catalog-picker-body">
            <label>
              ¿Qué producto falta?
              <input type="text" value={searched} maxLength={80} onChange={(e) => setSearched(e.target.value)} style={{ fontSize: 16 }} />
            </label>
            <label>
              Observaciones (opcional)
              <textarea value={notes} maxLength={600} rows={3} onChange={(e) => setNotes(e.target.value)} style={{ fontSize: 16, width: '100%' }} />
            </label>
            <p className="muted" style={{ fontSize: 12 }}>
              Se enviará solo esto, sin datos personales ni importes:
            </p>
            <pre className="muted" style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: '0 0 8px' }}>
              {ticket.body}
            </pre>
            {error && <p className="error">{error}</p>}
            <button type="button" className="receipt-line-reading-btn primary" disabled={busy || !searched.trim()} onClick={() => void send()}>
              {busy ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
