// «Qué ha entendido PEPA» bajo cada línea de «Productos leídos»: producto, categoría, formato y lo que falta, con el texto original del ticket intacto.
// Usa el normalizador del catálogo maestro (domain/catalog/lineReading.ts); aquí solo se muestra y se deja confirmar o corregir el producto.
import { useState } from 'react'
import { searchCatalogEntries, type LineReading } from '@/domain/catalog/lineReading'

const STATE_TEXT: Record<LineReading['state'], { icon: string; label: string; cls: string }> = {
  vacio: { icon: '', label: '', cls: '' },
  seguro: { icon: '✓', label: 'Lo entiendo', cls: 'ok' },
  confirmado: { icon: '✓', label: 'Confirmado', cls: 'ok' },
  probable: { icon: '❓', label: 'Confirma', cls: 'warn' },
  dudoso: { icon: '❓', label: 'No lo reconozco', cls: 'warn' },
}

export function ReceiptLineReading({
  reading,
  classLabel,
  formatOverride,
  onChoose,
}: {
  reading: LineReading
  /** Nombre de la clase de la familia que se está usando (la que enseña el símbolo de la izquierda). */
  classLabel: string
  /** Formato ya decidido en esta línea (lo indicado a mano o recordado), que manda sobre el leído del nombre. */
  formatOverride?: string | null
  /** Confirma (o corrige) el producto del catálogo; se guarda con la compra. */
  onChoose: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  if (reading.state === 'vacio') return null
  const st = STATE_TEXT[reading.state]
  const hits = open ? searchCatalogEntries(query, 5) : []
  const needsAction = reading.state === 'probable' || reading.state === 'dudoso'
  const formatText = formatOverride ?? reading.format
  return (
    <div className="receipt-line-reading" data-help-id="shopping.receipt-reading" data-reading-state={reading.state}>
      <div className="receipt-line-reading-main">
        <span className={'receipt-line-reading-state ' + st.cls}>
          {st.icon} {st.label}
        </span>{' '}
        {reading.productName ? (
          <strong>
            {reading.productName}
            {reading.variant ? ` · ${reading.variant}` : ''}
            {reading.brand ? ` · ${reading.brand}` : ''}
          </strong>
        ) : (
          <span className="muted">Elige qué producto es para completar la categoría y el formato.</span>
        )}
      </div>
      {reading.productName && (
        <div className="receipt-line-reading-sub muted">
          {classLabel || reading.className || 'Sin categoría'} · {formatText}
        </div>
      )}
      {reading.productName && (
        <div className="receipt-line-reading-sub" data-testid="reading-compare">
          {reading.readyToCompare ? (
            <span className="receipt-line-reading-state ok">Listo para comparar</span>
          ) : (
            <span className="muted">Falta para comparar: {reading.missing.join(', ')}</span>
          )}
        </div>
      )}
      <div className="receipt-line-reading-actions">
        {reading.state === 'probable' && reading.entryKey && (
          <button type="button" className="link-button" onClick={() => onChoose(reading.entryKey!)}>
            Es correcto
          </button>
        )}
        <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {needsAction && !reading.productName ? 'Elegir producto' : 'Cambiar producto'}
        </button>
      </div>
      {open && (
        <div className="receipt-line-reading-picker">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca el producto (merluza, pañales, leche…)"
            aria-label="Buscar el producto"
            autoComplete="off"
          />
          {query.trim() && hits.length === 0 && <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>No hay un producto así en el catálogo. Puedes dejarlo como está.</p>}
          {hits.map((h) => (
            <button
              key={h.key}
              type="button"
              className="receipt-line-reading-hit"
              onClick={() => {
                onChoose(h.key)
                setOpen(false)
                setQuery('')
              }}
            >
              <strong>{h.name}</strong> <span className="muted">· {h.className}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
