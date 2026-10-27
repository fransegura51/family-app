import { useMemo, useState } from 'react'
import { formatForecastAmount, type ForecastOccurrence } from '@/domain/forecast'
import { formatSpanishDate } from '@/domain/forecastInstallmentPlanForm'
import { assessManualPairing, type BankMovementForMatching, type ForecastPaymentContextForMatching } from '@/domain/forecastReconciliation'
import { normalizeText } from '@/help/search/normalize'

// ECO-02 — asociación MANUAL de un pago previsto con un cargo del banco. Es una acción explícita y distinta de una sugerencia automática: la persona elige el
// cargo y, si no encaja (nombre, importe, cuenta o fecha), se le avisa antes de confirmar, sin impedirlo. Aquí no se concilia nada por sí solo: «Vincular» llama
// a la MISMA conciliación de siempre (match_forecast_occurrence) desde FinanceScreen.
const MAX_ROWS = 25
const WINDOW_DAYS = 45

function dayDistance(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.abs(Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000))
}

export function ForecastManualMatchSheet({
  occurrence,
  payment,
  movements,
  accountNames,
  hasSuggestion,
  busy,
  error,
  onLink,
  onClose,
}: {
  occurrence: ForecastOccurrence
  payment: ForecastPaymentContextForMatching
  /** Cargos del banco que siguen libres (con gasto vinculado y no conciliados con otro pago). */
  movements: BankMovementForMatching[]
  accountNames: ReadonlyMap<string, string>
  /** ¿PEPA tiene ya una sugerencia automática fiable para este pago? */
  hasSuggestion: boolean
  busy: boolean
  error: string | null
  onLink: (movement: BankMovementForMatching) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = normalizeText(query)
    return movements
      .filter((m) => !m.isIncome && m.currency === occurrence.currency)
      .filter((m) => dayDistance(m.date, occurrence.expectedPaymentDate) <= WINDOW_DAYS)
      .filter((m) => {
        if (!q) return true
        const hay = normalizeText(`${m.description ?? ''} ${m.amount.toFixed(2).replace('.', ',')} ${m.amount.toFixed(2)}`)
        return q.split(' ').every((w) => hay.includes(w))
      })
      .sort((a, b) => dayDistance(a.date, occurrence.expectedPaymentDate) - dayDistance(b.date, occurrence.expectedPaymentDate))
      .slice(0, MAX_ROWS)
  }, [movements, occurrence.currency, occurrence.expectedPaymentDate, query])

  const selected = movements.find((m) => m.bankTransactionId === selectedId) ?? null
  const warnings = selected ? assessManualPairing(occurrence, payment, selected) : []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" data-help-id="finance.reconcile-manual" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <h3 style={{ marginTop: 0 }}>Vincular con un movimiento del banco</h3>
        <p style={{ margin: '0 0 4px' }}>
          <strong>{occurrence.title}</strong>
        </p>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
          {formatSpanishDate(occurrence.expectedPaymentDate)} · {occurrence.amountStatus === 'unknown' ? 'Importe pendiente' : formatForecastAmount(occurrence.amount ?? 0, occurrence.currency)}
        </p>
        {!hasSuggestion && (
          <p className="help-note" role="note">
            No hemos encontrado ningún movimiento bancario que coincida con este pago previsto. Si sabes cuál es, elígelo tú aquí.
          </p>
        )}
        <label htmlFor="manual-match-q" className="help-visually-hidden">
          Buscar un movimiento
        </label>
        <input id="manual-match-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por comercio o importe" autoComplete="off" />
        <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0, maxHeight: 260, overflowY: 'auto' }}>
          {rows.map((m) => {
            const active = m.bankTransactionId === selectedId
            return (
              <li key={m.bankTransactionId}>
                <button
                  type="button"
                  className="link-button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(active ? null : m.bankTransactionId)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 4px', fontWeight: active ? 700 : 400 }}
                >
                  {m.description ?? 'Movimiento bancario'}
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    {formatSpanishDate(m.date)} · {formatForecastAmount(m.amount, m.currency)}
                    {accountNames.get(m.accountId) ? ` · ${accountNames.get(m.accountId)}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
          {rows.length === 0 && <li className="muted">No hay movimientos del banco libres cerca de esa fecha.</li>}
        </ul>
        {selected && warnings.length > 0 && (
          <div className="help-note" role="alert">
            <strong>Antes de vincular, ten en cuenta:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="form-actions">
          <button type="button" disabled={!selected || busy} onClick={() => selected && onLink(selected)}>
            {busy ? 'Guardando…' : warnings.length > 0 ? 'Vincular de todos modos' : 'Vincular'}
          </button>
          <button type="button" className="link-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
