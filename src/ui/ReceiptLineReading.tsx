// «Qué ha entendido PEPA» bajo cada línea de «Productos leídos»: producto, categoría, formato y lo que falta, con el texto original del ticket intacto.
// Usa el normalizador del catálogo maestro (domain/catalog/lineReading.ts); aquí solo se muestra y se deja confirmar o corregir el producto (con el selector de catálogo
// reutilizable, que también ofrece las variantes del producto sin repetir la búsqueda).
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { LineReading } from '@/domain/catalog/lineReading'
import { variantsOf } from '@/domain/catalog/variants'
import { CatalogPicker } from '@/ui/CatalogPicker'

const STATE_TEXT: Record<LineReading['state'], { icon: string; label: string; cls: string }> = {
  vacio: { icon: '', label: '', cls: '' },
  seguro: { icon: '✓', label: 'Lo entiendo', cls: 'ok' },
  confirmado: { icon: '✓', label: 'Confirmado', cls: 'ok' },
  probable: { icon: '❓', label: 'Confirma', cls: 'warn' },
  dudoso: { icon: '❓', label: 'No lo reconozco', cls: 'warn' },
}

function productText(reading: LineReading): string {
  return `${reading.productName ?? ''}${reading.variant ? ` · ${reading.variant}` : ''}${reading.brand ? ` · ${reading.brand}` : ''}`
}

/** Resumen de UN renglón para la línea plegada: estado, producto, categoría y aviso de formato. Toda la tarjeta es tocable para abrirla. */
export function ReceiptLineBrief({ reading, classLabel, onOpen }: { reading: LineReading; classLabel: string; onOpen: () => void }) {
  if (reading.state === 'vacio') return null
  const st = STATE_TEXT[reading.state]
  const warn = reading.state === 'probable' || reading.state === 'dudoso'
  return (
    <button type="button" className="receipt-line-brief" data-reading-state={reading.state} onClick={onOpen} aria-label={`Ver y editar: ${productText(reading) || 'producto sin reconocer'}`}>
      <span className={'receipt-line-reading-state ' + st.cls}>
        {st.icon} {st.label}
      </span>
      {reading.productName ? (
        <span className="receipt-line-brief-text">
          <strong>{productText(reading)}</strong>
          <span className="muted"> · {classLabel || reading.className || 'Sin categoría'}</span>
          {!reading.formatKnown && <span className="receipt-line-brief-warn"> · falta formato</span>}
        </span>
      ) : (
        <span className="receipt-line-brief-text muted">Toca para elegir qué producto es</span>
      )}
      {warn && <span className="receipt-line-brief-flag">Revisar</span>}
    </button>
  )
}

/** Encima de un ticket largo: cuántas líneas piden revisión, para ir a la primera y para desplegarlas o plegarlas todas. */
export function ReceiptLinesToolbar({ total, toCheck, expandAll, onExpandAll, onOpen }: { total: number; toCheck: number[]; expandAll: boolean; onExpandAll: (v: boolean) => void; onOpen: (index: number) => void }) {
  return (
    <div className="receipt-lines-toolbar" data-help-id="shopping.receipt-lines-toolbar">
      <span>
        <strong>{total}</strong> líneas{toCheck.length > 0 ? <> · <span className="receipt-line-reading-state warn">{toCheck.length} por revisar</span></> : ' · todas entendidas'}
      </span>
      <span className="receipt-lines-toolbar-actions">
        {toCheck.length > 0 && (
          <button
            type="button"
            className="receipt-lines-toolbar-btn"
            onClick={() => {
              const first = toCheck[0]
              onOpen(first)
              if (typeof document !== 'undefined') setTimeout(() => document.querySelector(`[data-line-index="${first}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 0)
            }}
          >
            Ir a la primera
          </button>
        )}
        <button type="button" className="receipt-lines-toolbar-btn" aria-pressed={expandAll} onClick={() => onExpandAll(!expandAll)}>
          {expandAll ? 'Plegar todas' : 'Desplegar todas'}
        </button>
      </span>
    </div>
  )
}

export function ReceiptLineReading({
  reading,
  classLabel,
  formatOverride,
  onChoose,
  onRequestProduct,
}: {
  reading: LineReading
  /** Nombre de la clase de la familia que se está usando (la que enseña el símbolo de la izquierda). */
  classLabel: string
  /** Formato ya decidido en esta línea (lo indicado a mano o recordado), que manda sobre el leído del nombre. */
  formatOverride?: string | null
  /** Confirma (o corrige) el producto del catálogo o su variante; se guarda con la compra. */
  onChoose: (key: string) => void
  /** «Solicitar nuevo producto» (solo si el Soporte técnico está activo). */
  onRequestProduct?: (searched: string) => void
}) {
  const [picker, setPicker] = useState<'closed' | 'search' | 'variants'>('closed')
  if (reading.state === 'vacio') return null
  const st = STATE_TEXT[reading.state]
  const needsAction = reading.state === 'probable' || reading.state === 'dudoso'
  const formatText = formatOverride ?? reading.format
  const hasVariants = !!reading.entryKey && variantsOf(reading.entryKey).length > 0
  return (
    <div className="receipt-line-reading" data-help-id="shopping.receipt-reading" data-reading-state={reading.state}>
      <div className="receipt-line-reading-main">
        <span className={'receipt-line-reading-state ' + st.cls}>
          {st.icon} {st.label}
        </span>{' '}
        {reading.productName ? <strong>{productText(reading)}</strong> : <span className="muted">Elige qué producto es para completar la categoría y el formato.</span>}
      </div>
      {reading.productName && (
        <div className="receipt-line-reading-sub muted">
          {classLabel || reading.className || 'Sin categoría'} · {formatText}
        </div>
      )}
      {reading.productName && (
        <div className="receipt-line-reading-sub" data-testid="reading-compare">
          {reading.readyToCompare ? <span className="receipt-line-reading-state ok">Listo para comparar</span> : <span className="muted">Falta para comparar: {reading.missing.join(', ')}</span>}
        </div>
      )}
      <div className="receipt-line-reading-actions">
        {reading.state === 'probable' && reading.entryKey && (
          <button type="button" className="receipt-line-reading-btn primary" onClick={() => onChoose(reading.entryKey!)}>
            Es correcto
          </button>
        )}
        {hasVariants && reading.productName && (
          <button type="button" className="receipt-line-reading-btn" onClick={() => setPicker('variants')}>
            Elegir variante
          </button>
        )}
        <button type="button" className="receipt-line-reading-btn" aria-expanded={picker === 'search'} onClick={() => setPicker('search')}>
          {needsAction && !reading.productName ? 'Elegir producto' : 'Cambiar producto'}
        </button>
      </div>
      {/* En el <body>, no dentro del formulario del ticket: Intro en el buscador no debe guardar el ticket. */}
      {picker !== 'closed' &&
        createPortal(
        <CatalogPicker
          raw={reading.raw}
          initialQuery=""
          initialEntryKey={picker === 'variants' ? (reading.entryKey ?? undefined) : undefined}
          onClose={() => setPicker('closed')}
          onPick={(key) => {
            onChoose(key)
            setPicker('closed')
          }}
          onRequestProduct={onRequestProduct}
        />,
          document.body,
        )}
    </div>
  )
}
