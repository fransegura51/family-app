import { useMemo, useState } from 'react'
import { fmtEuro, isClearMatch, splitEvenly, suggestPayerMatches } from '@/domain/groupFunds'
import { foldText, type Participant } from '@/domain/groups'
import { useNamePrefs } from '@/ui/groups/NamePrefsContext'

export interface AllocationOption {
  participant: Participant
  /** En este bote: 'participa' | 'exento' | 'no_participa'. */
  state: string
  /** Lo que aún debe en este bote (para ayudar a elegir). */
  pending: number
}

/**
 * «¿A quién corresponde?»: elegir uno o varios participantes y repartir el importe (hermanos). Sin nadie elegido, el ingreso queda SIN IDENTIFICAR (suma al saldo pero no
 * marca a nadie como pagado). Las sugerencias por el nombre del pagador nunca se aplican solas: hay que tocarlas.
 */
export function AllocationEditor({
  options,
  amount,
  payerLabel,
  value,
  onChange,
}: {
  options: AllocationOption[]
  amount: number
  payerLabel: string
  value: Record<string, number>
  onChange: (v: Record<string, number>) => void
}) {
  const { namer, sort } = useNamePrefs()
  const [query, setQuery] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const chosen = Object.keys(value)
  const sum = chosen.reduce((s, id) => s + (value[id] ?? 0), 0)
  const rest = Math.round((amount - sum) * 100) / 100

  const suggestions = useMemo(() => {
    const candidates = suggestPayerMatches(
      payerLabel,
      options.map((o) => o.participant),
    ).filter((c) => !value[c.participantId])
    return { list: candidates.slice(0, 3), clear: isClearMatch(candidates) }
  }, [payerLabel, options, value])

  const redistribute = (ids: string[]) => {
    const parts = splitEvenly(amount, ids.length)
    const next: Record<string, number> = {}
    ids.forEach((id, i) => (next[id] = parts[i]))
    onChange(next)
  }
  const toggle = (id: string) => {
    const ids = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]
    if (ids.length === 0) onChange({})
    else redistribute(ids)
  }
  // La búsqueda mira el nombre completo aunque la lista muestre solo el nombre.
  const order = new Map(sort(options.map((o) => o.participant)).map((p, i) => [p.id, i]))
  const shown = options
    .filter((o) => (!onlyPending || o.pending > 0 || value[o.participant.id] !== undefined) && foldText([o.participant.name, o.participant.surname].filter(Boolean).join(' ')).includes(foldText(query)))
    .sort((a, b) => (order.get(a.participant.id) ?? 0) - (order.get(b.participant.id) ?? 0))

  return (
    <div data-help-id="grupos.asignar-pago">
      <p className="muted" style={{ margin: '8px 0 4px' }}>
        ¿A quién corresponde? <small>(si no lo sabes, déjalo sin marcar: queda como ingreso por identificar)</small>
      </p>
      {suggestions.list.length > 0 && (
        <div className="grp-banner grp-banner-info">
          {suggestions.clear ? 'Parece de ' : 'Podría ser de '}
          {suggestions.list.map((c, i) => {
            const o = options.find((x) => x.participant.id === c.participantId)
            return o ? (
              <span key={c.participantId}>
                {i > 0 ? ' · ' : ''}
                <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => toggle(c.participantId)}>
                  {namer(o.participant)}
                </button>
              </span>
            ) : null
          })}
          . Toca el nombre para asignarlo.
        </div>
      )}
      <input className="grp-input" type="search" placeholder="Buscar una persona" aria-label="Buscar una persona" value={query} onChange={(e) => setQuery(e.target.value)} />
      <label className="grp-check-row">
        <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
        <span>Solo los que deben algo</span>
      </label>
      <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #e3e6ee', borderRadius: 10, padding: '2px 8px' }}>
        {shown.map((o) => (
          <div key={o.participant.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label className="grp-check-row" style={{ flex: '1 1 auto', minWidth: 0, opacity: o.state === 'no_participa' ? 0.6 : 1 }}>
              <input type="checkbox" checked={value[o.participant.id] !== undefined} onChange={() => toggle(o.participant.id)} />
              <span style={{ overflowWrap: 'anywhere' }}>
                {namer(o.participant)}
                {o.pending > 0 && <small className="muted"> · debe {fmtEuro(o.pending)}</small>}
                {o.state === 'exento' && <small className="muted"> · exento</small>}
                {o.state === 'no_participa' && <small className="muted"> · no participa</small>}
              </span>
            </label>
            {value[o.participant.id] !== undefined && chosen.length > 1 && (
              <input
                className="grp-input"
                style={{ width: 90, flex: '0 0 auto' }}
                inputMode="decimal"
                aria-label={`Importe de ${namer(o.participant)}`}
                value={String(value[o.participant.id]).replace('.', ',')}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(',', '.'))
                  onChange({ ...value, [o.participant.id]: Number.isFinite(n) && n >= 0 ? n : 0 })
                }}
              />
            )}
          </div>
        ))}
        {shown.length === 0 && <p className="muted">Nadie coincide.</p>}
      </div>
      {chosen.length > 0 && (
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {chosen.length > 1 ? (
            <>
              Repartido {fmtEuro(sum)} de {fmtEuro(amount)}
              {rest > 0 && ` · sobran ${fmtEuro(rest)} sin asignar`}
              {rest < 0 && ' · ¡te pasas del importe!'}{' '}
              <button type="button" className="link-button" style={{ padding: 0 }} onClick={() => redistribute(chosen)}>
                Repartir a partes iguales
              </button>
            </>
          ) : (
            <>Se asigna {fmtEuro(value[chosen[0]] ?? 0)} a esta persona.</>
          )}
        </p>
      )}
    </div>
  )
}
