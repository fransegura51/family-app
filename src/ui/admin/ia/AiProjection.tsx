import { useCallback, useMemo, useState } from 'react'
import { getAiPrices, getAiProjectionBase } from '@/data/aiControl'
import {
  FAMILY_PRESETS,
  SCENARIOS,
  formatCount,
  formatEur,
  formatMoney,
  marginOf,
  moduleLabel,
  perActiveFamilyMonthly,
  priceFactorFor,
  projectCosts,
  type AiPrice,
  type ProjectionBase,
} from '@/domain/aiControl'
import { AdminError, AdminLoading, InfoBox } from '@/ui/community/admin/AdminShared'
import { useAdminData } from '@/ui/community/admin/useAdminData'
import '@/ui/admin/ia/aiControl.css'

const toNum = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// Proyección de costes: NO es gasto real. Usa el consumo observado cuando hay base suficiente y, si no, hipótesis escritas a mano. No inventa tarifas comerciales ni ingresos.
export function AiProjection() {
  const loader = useCallback(async () => {
    const [base, prices] = await Promise.all([getAiProjectionBase(30), getAiPrices()])
    return { base, prices }
  }, [])
  const { data, loading, error, reload } = useAdminData(loader)
  if (loading && !data) return <AdminLoading />
  if (error) return <AdminError message={error} onRetry={reload} />
  if (!data) return null
  return <Simulator base={data.base} prices={data.prices} />
}

function currentPrice(prices: AiPrice[]): AiPrice | null {
  const today = new Date().toISOString().slice(0, 10)
  return prices.find((p) => p.modality === 'text' && p.validFrom <= today && (!p.validTo || p.validTo >= today)) ?? null
}

function Simulator({ base, prices }: { base: ProjectionBase; prices: AiPrice[] }) {
  const [families, setFamilies] = useState('1000')
  const observedShare = base.totalFamilies > 0 ? Math.min(base.activeFamilies / base.totalFamilies, 1) : 1
  const [share, setShare] = useState(String(Math.round(observedShare * 100)))
  const [manual, setManual] = useState(!base.enough)
  const [callsPerFam, setCallsPerFam] = useState('')
  const [costPerCall, setCostPerCall] = useState('')
  const [newIn, setNewIn] = useState('')
  const [newOut, setNewOut] = useState('')
  const [cap, setCap] = useState('')
  const [price, setPrice] = useState('')
  const [paying, setPaying] = useState('')
  const [fx, setFx] = useState('')

  const cur = currentPrice(prices)
  const tokensIn = base.byModule.reduce((s, m) => s + m.tokensIn, 0)
  const tokensOut = base.byModule.reduce((s, m) => s + m.tokensOut, 0)
  const observed = useMemo(() => perActiveFamilyMonthly(base), [base])

  const manualBase: Record<string, number> = useMemo(() => {
    const c = toNum(callsPerFam)
    const p = toNum(costPerCall)
    const out: Record<string, number> = {}
    if (c !== null && p !== null) out.manual = c * p
    return out
  }, [callsPerFam, costPerCall])
  const perActive = manual ? manualBase : observed
  const n = toNum(families) ?? 0
  const shareN = Math.min((toNum(share) ?? 100) / 100, 1)
  const ni = toNum(newIn)
  const no = toNum(newOut)
  const factor = cur && ni !== null && no !== null ? priceFactorFor({ in: cur.inputPerMtok, out: cur.outputPerMtok }, { in: ni, out: no }, tokensIn, tokensOut) : 1
  const capN = toNum(cap)
  const hasBase = Object.keys(perActive).length > 0

  const results = SCENARIOS.map((s) => ({ s, r: projectCosts({ families: n, activeShare: shareN, perActiveFamily: perActive, multiplier: s.multiplier, priceFactor: factor, capPerFamily: capN }) }))
  const mid = results.find((x) => x.s.id === 'mid')!.r
  const margin = marginOf({ priceEur: toNum(price), payingShare: toNum(paying) === null ? null : (toNum(paying) as number) / 100, eurPerUsd: toNum(fx), families: n, monthlyCostUsd: mid.monthly })

  return (
    <div className="ai-stack" data-help-id="ia.proyeccion">
      <div className="ai-banner ai-banner-warn" role="note">
        <strong>Esto es una proyección, no gasto real.</strong>{' '}
        {base.enough
          ? `Se apoya en el consumo observado en los últimos ${base.days} días (${formatCount(base.calls)} llamadas de ${base.activeFamilies} ${base.activeFamilies === 1 ? 'familia' : 'familias'}).`
          : `Estimación PROVISIONAL: todavía no hay datos suficientes (${base.dataDays} ${base.dataDays === 1 ? 'día' : 'días'} con consumo y ${formatCount(base.calls)} llamadas; hacen falta al menos 7 días y 50 llamadas). Puedes escribir tus propias hipótesis.`}
      </div>

      <div className="ai-form">
        <div className="ai-form-wide ai-periods" role="group" aria-label="Número de familias">
          {FAMILY_PRESETS.map((f) => (
            <button key={f} type="button" aria-pressed={n === f} className={`cadm-btn ${n === f ? 'cadm-btn-primary' : 'cadm-btn-secondary'}`} onClick={() => setFamilies(String(f))}>
              {formatCount(f)} familias
            </button>
          ))}
        </div>
        <label className="ai-field">
          Número de familias
          <input inputMode="numeric" value={families} onChange={(e) => setFamilies(e.target.value)} />
        </label>
        <label className="ai-field">
          Familias que usan IA (%)
          <input inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} />
          <span className="ai-note">{base.totalFamilies > 0 ? `Hoy: ${base.activeFamilies} de ${base.totalFamilies} (${Math.round(observedShare * 100)} %).` : 'Sin familias registradas.'}</span>
        </label>
        {base.enough && (
          <label className="cadm-check ai-form-wide">
            <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /> Usar mis propias hipótesis en vez del consumo observado
          </label>
        )}
        {manual && (
          <>
            <label className="ai-field">
              Llamadas al mes por familia activa
              <input inputMode="decimal" value={callsPerFam} onChange={(e) => setCallsPerFam(e.target.value)} placeholder="p. ej. 40" />
            </label>
            <label className="ai-field">
              Coste medio por llamada (US$)
              <input inputMode="decimal" value={costPerCall} onChange={(e) => setCostPerCall(e.target.value)} placeholder="p. ej. 0,0004" />
            </label>
          </>
        )}
        <label className="ai-field">
          Tope mensual por familia (US$, opcional)
          <input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Sin tope" />
          <span className="ai-note">Impacto aproximado: aplica el tope a la media, no a cada familia.</span>
        </label>
        <fieldset className="ai-form-wide" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="ai-note">Cambiar de modelo de IA (precio por millón de tokens, US$)</legend>
          <div className="ai-dates">
            <label className="ai-field">
              Entrada
              <input inputMode="decimal" value={newIn} onChange={(e) => setNewIn(e.target.value)} placeholder={cur ? `Ahora ${cur.inputPerMtok}` : ''} />
            </label>
            <label className="ai-field">
              Salida
              <input inputMode="decimal" value={newOut} onChange={(e) => setNewOut(e.target.value)} placeholder={cur ? `Ahora ${cur.outputPerMtok}` : ''} />
            </label>
          </div>
          <span className="ai-note">{cur ? `Tarifa actual (${cur.model}): ${cur.inputPerMtok} / ${cur.outputPerMtok} US$ por millón. ` : 'No hay tarifa vigente. '}{factor !== 1 ? `Con el nuevo precio el coste se multiplica por ${factor.toFixed(2)}.` : ''}</span>
        </fieldset>
      </div>

      {!hasBase ? (
        <InfoBox>{manual ? 'Escribe las llamadas al mes por familia y el coste medio por llamada para ver la proyección.' : 'Todavía no hay consumo observado: activa tus propias hipótesis para proyectar.'}</InfoBox>
      ) : (
        <div className="ai-scen">
          {results.map(({ s, r }) => (
            <section key={s.id} className="ai-module" aria-label={s.label}>
              <h4>{s.label}</h4>
              <p className="ai-note">{s.help}</p>
              <div className="ai-detail" style={{ border: 0, margin: 0, padding: 0 }}>
                <dl>
                  <div>
                    <dt>Coste mensual estimado</dt>
                    <dd>{formatMoney(r.monthly)}</dd>
                  </div>
                  <div>
                    <dt>Coste anual estimado</dt>
                    <dd>{formatMoney(r.yearly)}</dd>
                  </div>
                  <div>
                    <dt>Por familia (todas)</dt>
                    <dd>{formatMoney(r.perFamily)}</dd>
                  </div>
                  <div>
                    <dt>Por familia activa</dt>
                    <dd>{formatMoney(r.perActiveFamily)}</dd>
                  </div>
                  <div>
                    <dt>Familias activas</dt>
                    <dd>{formatCount(r.activeFamilies)}</dd>
                  </div>
                </dl>
              </div>
              {r.capped && <p className="ai-note">El tope por familia ahorraría unos {formatMoney(r.savedByCap)} al mes.</p>}
              <ul className="ai-rows">
                {r.byModule.map((m) => (
                  <li key={m.module} className="ai-row ai-row-top">
                    <span>{m.module === 'manual' ? 'Hipótesis manual' : moduleLabel(m.module)}</span>
                    <strong>{formatMoney(m.monthly)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="ai-module" aria-label="Rentabilidad">
        <h4>Rentabilidad (preparada)</h4>
        <p className="ai-note">PEPA aún no tiene precios de suscripción: no se inventa ninguno. Cuando existan, escríbelos aquí para ver el margen de la IA en el escenario medio.</p>
        <div className="ai-form">
          <label className="ai-field">
            Precio de la suscripción (€/mes)
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="ai-field">
            Familias que pagan (%)
            <input inputMode="decimal" value={paying} onChange={(e) => setPaying(e.target.value)} />
          </label>
          <label className="ai-field">
            Euros por 1 US$ (tipo de cambio)
            <input inputMode="decimal" value={fx} onChange={(e) => setFx(e.target.value)} />
          </label>
        </div>
        {margin ? (
          <p>
            Ingresos {formatEur(margin.revenueEur)} · coste de IA {formatEur(margin.costEur)} · margen{' '}
            <strong>{formatEur(margin.marginEur)}</strong> ({Math.round(margin.marginPct)} %). Es una estimación sobre el escenario medio.
          </p>
        ) : (
          <p className="muted">Falta algún dato para calcular el margen.</p>
        )}
      </section>
    </div>
  )
}
