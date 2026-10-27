import { useCallback, useMemo, useState } from 'react'
import { getAiFamilies, getAiFamilyDetail } from '@/data/aiControl'
import { changeOf, formatCount, formatMoney, type AiFamilyRow, type AiFunctionRow } from '@/domain/aiControl'
import { AdminEmpty, AdminError, AdminLoading } from '@/ui/community/admin/AdminShared'
import { useAdminData } from '@/ui/community/admin/useAdminData'
import { BarList, DailyChart } from '@/ui/admin/ia/AiCharts'
import { LimitForm, LimitRow } from '@/ui/admin/ia/AiLimits'
import type { PeriodState } from '@/ui/admin/ia/AiUsage'
import '@/ui/admin/ia/aiControl.css'

// Clasificación administrativa de familias por consumo. Solo cifras y nombres: nunca el contenido de lo que se pidió a la IA.
export function AiFamilies({ period, functions }: { period: PeriodState; functions: AiFunctionRow[] }) {
  const range = period.range
  const loader = useCallback(() => (range ? getAiFamilies(range.from, range.to) : Promise.reject(new Error('BAD_RANGE'))), [range])
  const { data, loading, error, reload } = useAdminData(loader)
  const [selected, setSelected] = useState<string | null>(null)

  if (!range) return <AdminEmpty>Elige un intervalo de fechas válido.</AdminEmpty>
  if (loading && !data) return <AdminLoading />
  if (error) return <AdminError message={error} onRetry={reload} />
  if (!data) return null
  if (data.length === 0) return <AdminEmpty>Ninguna familia ha usado IA en este periodo.</AdminEmpty>

  return (
    <div className="ai-stack">
      <ul className="ai-rows">
        {data.map((f, i) => (
          <FamilyRow key={f.familyId} fam={f} rank={i + 1} open={selected === f.familyId} onToggle={() => setSelected(selected === f.familyId ? null : f.familyId)} period={period} functions={functions} families={data} onChanged={reload} />
        ))}
      </ul>
    </div>
  )
}

function FamilyRow({ fam, rank, open, onToggle, period, functions, families, onChanged }: { fam: AiFamilyRow; rank: number; open: boolean; onToggle: () => void; period: PeriodState; functions: AiFunctionRow[]; families: AiFamilyRow[]; onChanged: () => void }) {
  const ch = changeOf(fam.cost, fam.prevCost)
  return (
    <li className="ai-row">
      <button type="button" className="ai-row-btn" aria-expanded={open} onClick={onToggle}>
        <span className="ai-row-top">
          <strong>
            {open ? '▾' : '▸'} {rank}. {fam.name}
          </strong>
          <span>{formatMoney(fam.cost)}</span>
        </span>
        <span className="ai-row-sub">
          <span>{formatCount(fam.calls)} llamadas</span>
          <span>{fam.users} {fam.users === 1 ? 'persona' : 'personas'}</span>
          <span>{fam.functions} {fam.functions === 1 ? 'función' : 'funciones'}</span>
          <span className={ch.dir === 'up' ? 'ai-up' : ch.dir === 'down' ? 'ai-down' : ''}>{ch.text}</span>
          {fam.hasLimit && <span>Con límite propio</span>}
          {fam.disabled && <span>IA apagada para esta familia</span>}
        </span>
      </button>
      {open && <FamilyDetail familyId={fam.familyId} period={period} functions={functions} families={families} onChanged={onChanged} />}
    </li>
  )
}

function FamilyDetail({ familyId, period, functions, families, onChanged }: { familyId: string; period: PeriodState; functions: AiFunctionRow[]; families: AiFamilyRow[]; onChanged: () => void }) {
  const range = period.range
  const loader = useCallback(() => (range ? getAiFamilyDetail(familyId, range.from, range.to) : Promise.reject(new Error('BAD_RANGE'))), [familyId, range])
  const { data, loading, error, reload } = useAdminData(loader)
  const [adding, setAdding] = useState<{ scope: 'family' | 'user'; key: string; label: string } | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const famOptions = useMemo(() => families.map((f) => ({ id: f.familyId, name: f.name })), [families])

  if (loading && !data) return <AdminLoading />
  if (error) return <AdminError message={error} onRetry={reload} />
  if (!data) return null
  const t = data.totals

  return (
    <div className="ai-detail">
      <dl>
        <div>
          <dt>Coste total</dt>
          <dd>{formatMoney(t.cost)}</dd>
        </div>
        <div>
          <dt>Consumo individual (personas)</dt>
          <dd>{formatMoney(t.individualCost)}</dd>
        </div>
        <div>
          <dt>Familiar sin persona identificada</dt>
          <dd>{formatMoney(t.unattributedCost)}</dd>
        </div>
        <div>
          <dt>Procesos automáticos</dt>
          <dd>{formatMoney(t.automaticCost)}</dd>
        </div>
      </dl>

      <h5>Evolución</h5>
      <DailyChart data={data.byDay} label={`Gasto diario de ${data.name}`} />

      <h5>Coste por función</h5>
      <BarList items={data.byFunction.map((f) => ({ key: f.purpose, label: f.label, value: f.cost, sub: `${formatCount(f.calls)} llamadas` }))} total={t.cost} />

      <h5>Consumo por persona</h5>
      {data.byUser.length === 0 ? (
        <p className="muted">Ninguna llamada de este periodo tiene una persona identificada.</p>
      ) : (
        <ul className="ai-rows">
          {data.byUser.map((u) => (
            <li key={u.userId} className="ai-row">
              <div className="ai-row-top">
                <strong>{u.name}</strong>
                <span>{formatMoney(u.cost)}</span>
              </div>
              <div className="ai-row-sub">
                <span>{formatCount(u.calls)} llamadas</span>
              </div>
              <div className="cadm-actions">
                <button type="button" className="cadm-btn cadm-btn-secondary cadm-btn-small" onClick={() => setAdding({ scope: 'user', key: u.userId, label: `Persona ${u.name}` })}>
                  Poner límite a esta persona
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h5>Límites de esta familia</h5>
      {data.limits.length === 0 ? (
        <p className="muted">Sin límites propios. {data.exceptions.length > 0 ? `Tiene ${data.exceptions.length} excepción(es) (ver «Límites y presupuestos»).` : ''}</p>
      ) : (
        <ul className="ai-rows">
          {data.limits.map((l) => (
            <LimitRow
              key={l.id}
              limit={l}
              onDeleted={() => {
                reload()
                onChanged()
              }}
              onError={setLocalError}
            />
          ))}
        </ul>
      )}
      {localError && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          {localError}
        </p>
      )}
      {adding ? (
        <LimitForm
          scopes={[adding.scope]}
          fixed={adding}
          functions={functions}
          families={famOptions}
          onSaved={() => {
            setAdding(null)
            reload()
            onChanged()
          }}
          onCancel={() => setAdding(null)}
        />
      ) : (
        <div className="cadm-actions">
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setAdding({ scope: 'family', key: familyId, label: `Familia ${data.name}` })}>
            Poner límite a esta familia
          </button>
        </div>
      )}
    </div>
  )
}
