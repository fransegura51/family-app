import { useCallback, useMemo, useState } from 'react'
import { getAiOverview } from '@/data/aiControl'
import {
  PERIOD_LABEL,
  changeOf,
  costKindNote,
  formatCount,
  formatMoney,
  formatTokens,
  moduleIcon,
  moduleLabel,
  originLabel,
  periodRange,
  shareOf,
  type AiFunctionUsage,
  type PeriodPreset,
  type PeriodRange,
} from '@/domain/aiControl'
import { AdminEmpty, AdminError, AdminLoading } from '@/ui/community/admin/AdminShared'
import { useAdminData } from '@/ui/community/admin/useAdminData'
import { BarList, DailyChart } from '@/ui/admin/ia/AiCharts'
import '@/ui/admin/ia/aiControl.css'

export interface PeriodState {
  preset: PeriodPreset
  setPreset: (p: PeriodPreset) => void
  custom: { from: string; to: string }
  setCustom: (c: { from: string; to: string }) => void
  range: PeriodRange | null
}

// Un único periodo para todo el Centro de Control: lo comparten «Consumo» y «Familias». El rango se calcula al cambiar de periodo (no se mueve solo mientras se mira).
export function usePeriod(): PeriodState {
  const [preset, setPreset] = useState<PeriodPreset>('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const range = useMemo(() => periodRange(preset, new Date(), custom), [preset, custom])
  return { preset, setPreset, custom, setCustom, range }
}

export function PeriodPicker({ period }: { period: PeriodState }) {
  const presets: PeriodPreset[] = ['today', '7d', '30d', 'month', 'custom']
  return (
    <div className="ai-stack">
      <div className="ai-periods" role="group" aria-label="Periodo">
        {presets.map((p) => (
          <button key={p} type="button" aria-pressed={period.preset === p} className={`cadm-btn ${period.preset === p ? 'cadm-btn-primary' : 'cadm-btn-secondary'}`} onClick={() => period.setPreset(p)}>
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      {period.preset === 'custom' && (
        <div className="ai-dates">
          <label className="ai-field">
            Desde
            <input type="date" value={period.custom.from} onChange={(e) => period.setCustom({ ...period.custom, from: e.target.value })} />
          </label>
          <label className="ai-field">
            Hasta
            <input type="date" value={period.custom.to} onChange={(e) => period.setCustom({ ...period.custom, to: e.target.value })} />
          </label>
        </div>
      )}
      {period.preset === 'custom' && !period.range && <p className="ai-note">Elige las dos fechas (máximo 400 días).</p>}
    </div>
  )
}

type SortKey = 'cost' | 'calls' | 'change'
const SORT_LABEL: Record<SortKey, string> = { cost: 'Coste', calls: 'Llamadas', change: 'Variación' }

export function AiUsage({ period }: { period: PeriodState }) {
  const range = period.range
  const loader = useCallback(() => (range ? getAiOverview(range.from, range.to) : Promise.reject(new Error('BAD_RANGE'))), [range])
  const { data, loading, error, reload } = useAdminData(loader)
  const [sort, setSort] = useState<SortKey>('cost')
  const [open, setOpen] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const list = [...(data?.byFunction ?? [])]
    const varOf = (f: AiFunctionUsage) => (f.prevCost > 0 ? (f.cost - f.prevCost) / f.prevCost : f.cost > 0 ? Infinity : 0)
    list.sort((a, b) => (sort === 'cost' ? b.cost - a.cost || b.calls - a.calls : sort === 'calls' ? b.calls - a.calls : varOf(b) - varOf(a)))
    return list
  }, [data, sort])

  if (!range) return <AdminEmpty>Elige un intervalo de fechas válido.</AdminEmpty>
  if (loading && !data) return <AdminLoading />
  if (error) return <AdminError message={error} onRetry={reload} />
  if (!data) return null

  const t = data.totals
  const costChange = changeOf(t.cost, data.previous.cost)
  const callsChange = changeOf(t.calls, data.previous.calls)
  const topFn = [...data.byFunction].sort((a, b) => b.cost - a.cost || b.calls - a.calls)[0]
  const topFam = data.topFamilies[0]
  const perFamily = t.families > 0 ? t.cost / t.families : 0
  const perCall = t.calls > 0 ? t.cost / t.calls : 0
  const trendClass = (d: string) => (d === 'up' ? 'ai-up' : d === 'down' ? 'ai-down' : '')

  return (
    <div className="ai-stack" data-help-id="ia.resumen-consumo">
      <dl className="ai-metrics">
        <div className="ai-metric">
          <dt>Coste estimado</dt>
          <dd>
            {formatMoney(t.cost)}
            <small className={trendClass(costChange.dir)}>{costChange.text} frente al periodo anterior ({formatMoney(data.previous.cost)})</small>
          </dd>
        </div>
        <div className="ai-metric">
          <dt>Llamadas</dt>
          <dd>
            {formatCount(t.calls)}
            <small className={trendClass(callsChange.dir)}>
              {callsChange.text} frente al anterior ({formatCount(data.previous.calls)}){t.failed > 0 ? ` · ${t.failed} con fallo` : ''}
            </small>
          </dd>
        </div>
        <div className="ai-metric">
          <dt>Familias con IA</dt>
          <dd>{t.families}</dd>
        </div>
        <div className="ai-metric">
          <dt>Personas activas</dt>
          <dd>
            {t.users}
            <small>Solo las llamadas con persona identificada</small>
          </dd>
        </div>
        <div className="ai-metric">
          <dt>Coste medio por familia activa</dt>
          <dd>{formatMoney(perFamily)}</dd>
        </div>
        <div className="ai-metric">
          <dt>Coste medio por llamada</dt>
          <dd>{formatMoney(perCall)}</dd>
        </div>
        <div className="ai-metric">
          <dt>Función que más consume</dt>
          <dd>{topFn && topFn.calls > 0 ? topFn.label : '—'}</dd>
        </div>
        <div className="ai-metric">
          <dt>Familia con mayor consumo</dt>
          <dd>{topFam ? topFam.name : '—'}</dd>
        </div>
      </dl>
      <p className="ai-note">
        {costKindNote(t)} Tokens: {formatTokens(t.tokensIn)} de entrada y {formatTokens(t.tokensOut)} de salida.
      </p>
      <p className="ai-note">
        Reparto por origen:{' '}
        {data.byOrigin.length === 0 ? 'sin datos' : data.byOrigin.map((o) => `${originLabel(o.origin)} ${formatMoney(o.cost)} (${formatCount(o.calls)} llamadas)`).join(' · ')}.
      </p>

      <h4 className="section-title">Evolución diaria del gasto</h4>
      <DailyChart data={data.byDay} label="Evolución diaria del gasto estimado" />

      <h4 className="section-title">Consumo por funciones</h4>
      <div className="ai-periods" role="group" aria-label="Ordenar por">
        {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
          <button key={k} type="button" aria-pressed={sort === k} className={`cadm-btn ${sort === k ? 'cadm-btn-primary' : 'cadm-btn-secondary'}`} onClick={() => setSort(k)}>
            Ordenar por {SORT_LABEL[k].toLowerCase()}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? (
        <AdminEmpty>Todavía no hay llamadas en este periodo.</AdminEmpty>
      ) : (
        <ul className="ai-rows">
          {sorted.map((f) => {
            const ch = changeOf(f.cost, f.prevCost)
            const isOpen = open === f.purpose
            return (
              <li key={f.purpose} className="ai-row">
                <button type="button" className="ai-row-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : f.purpose)}>
                  <span className="ai-row-top">
                    <strong>
                      {isOpen ? '▾' : '▸'} {f.label}
                    </strong>
                    <span>
                      {formatMoney(f.cost)} · {shareOf(f.cost, t.cost)}
                    </span>
                  </span>
                  <span className="ai-bar" aria-hidden="true">
                    <span style={{ width: `${t.cost > 0 ? Math.max((f.cost / t.cost) * 100, f.cost > 0 ? 2 : 0) : 0}%` }} />
                  </span>
                  <span className="ai-row-sub">
                    <span>{formatCount(f.calls)} llamadas</span>
                    <span>{formatTokens(f.tokensIn + f.tokensOut)} tokens</span>
                    <span className={trendClass(ch.dir)}>{ch.text}</span>
                  </span>
                </button>
                {isOpen && (
                  <div className="ai-detail">
                    <dl>
                      <div>
                        <dt>Módulo</dt>
                        <dd>
                          {moduleIcon(f.module)} {moduleLabel(f.module)}
                        </dd>
                      </div>
                      <div>
                        <dt>Tokens de entrada / salida</dt>
                        <dd>
                          {formatTokens(f.tokensIn)} / {formatTokens(f.tokensOut)}
                        </dd>
                      </div>
                      <div>
                        <dt>Coste medio por llamada</dt>
                        <dd>{formatMoney(f.calls > 0 ? f.cost / f.calls : 0)}</dd>
                      </div>
                      <div>
                        <dt>Llamadas con fallo</dt>
                        <dd>{f.failed}</dd>
                      </div>
                      <div>
                        <dt>Periodo anterior</dt>
                        <dd>
                          {formatMoney(f.prevCost)} · {formatCount(f.prevCalls)} llamadas
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <h4 className="section-title">Distribución por módulos</h4>
      <BarList items={data.byModule.map((m) => ({ key: m.module, label: `${moduleIcon(m.module)} ${moduleLabel(m.module)}`, value: m.cost, sub: `${formatCount(m.calls)} llamadas` }))} total={t.cost} />

      <h4 className="section-title">Distribución por modelos de IA</h4>
      <BarList items={data.byModel.map((m) => ({ key: m.model, label: m.model, value: m.cost, sub: `${formatCount(m.calls)} llamadas` }))} total={t.cost} />

      <h4 className="section-title">Familias con mayor consumo</h4>
      <BarList items={data.topFamilies.slice(0, 8).map((f) => ({ key: f.familyId, label: f.name, value: f.cost, sub: `${formatCount(f.calls)} llamadas · ${f.functions} funciones` }))} total={t.cost} />

      <h4 className="section-title">Comparación con el periodo anterior</h4>
      <BarList
        items={[
          { key: 'cur', label: 'Este periodo', value: t.cost, sub: `${formatCount(t.calls)} llamadas` },
          { key: 'prev', label: 'Periodo anterior', value: data.previous.cost, sub: `${formatCount(data.previous.calls)} llamadas` },
        ]}
        total={t.cost + data.previous.cost}
      />
    </div>
  )
}
