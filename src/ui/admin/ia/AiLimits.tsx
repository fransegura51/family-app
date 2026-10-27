import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAreaPath } from '@/admin/adminAreas'
import { deleteAiException, deleteAiLimit, getAiFamilies, getAiLimits, setAiException, setAiLimit } from '@/data/aiControl'
import {
  AI_MODULES,
  LIMIT_METRIC_LABEL,
  LIMIT_MODE_HELP,
  LIMIT_MODE_LABEL,
  LIMIT_PERIOD_LABEL,
  LIMIT_SCOPE_LABEL,
  aiErrorText,
  formatCount,
  formatLimitValue,
  limitPct,
  limitState,
  limitStateText,
  moduleLabel,
  periodRange,
  type AiException,
  type AiFunctionRow,
  type AiLimit,
  type LimitMetric,
  type LimitMode,
  type LimitPeriod,
  type LimitScope,
} from '@/domain/aiControl'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { useAdminData } from '@/ui/community/admin/useAdminData'
import '@/ui/admin/ia/aiControl.css'

interface FamilyOption {
  id: string
  name: string
}

// Formulario de un límite. Todos los límites nuevos nacen en OBSERVACIÓN: pasar a Aviso o Bloqueo es una decisión explícita (el Bloqueo exige confirmarla).
export function LimitForm({
  scopes,
  fixed,
  functions,
  families,
  onSaved,
  onCancel,
}: {
  scopes: LimitScope[]
  fixed?: { scope: LimitScope; key: string; label: string }
  functions: AiFunctionRow[]
  families: FamilyOption[]
  onSaved: () => void
  onCancel?: () => void
}) {
  const [scope, setScope] = useState<LimitScope>(fixed?.scope ?? scopes[0])
  const [key, setKey] = useState(fixed?.key ?? '')
  const [metric, setMetric] = useState<LimitMetric>('cost')
  const [period, setPeriod] = useState<LimitPeriod>('month')
  const [max, setMax] = useState('')
  const [warn, setWarn] = useState('80')
  const [mode, setMode] = useState<LimitMode>('observe')
  const [okBlock, setOkBlock] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keyOptions = scope === 'module' ? AI_MODULES.map((m) => ({ id: m.id, name: m.label })) : scope === 'function' ? functions.map((f) => ({ id: f.purpose, name: f.label })) : scope === 'family' ? families : []
  const needsKey = scope !== 'global' && !fixed

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const value = Number(max.replace(',', '.'))
    const effectiveKey = fixed?.key ?? key
    if (!Number.isFinite(value) || value <= 0) return setError('Escribe un máximo mayor que 0.')
    if (needsKey && !effectiveKey) return setError('Elige a qué se aplica el límite.')
    const warnPct = Math.round(Number(warn))
    if (!Number.isFinite(warnPct) || warnPct < 1 || warnPct > 100) return setError('El umbral de aviso va de 1 a 100 %.')
    if (mode === 'block' && !okBlock) return setError('Marca la casilla para confirmar que el límite bloqueará nuevas operaciones.')
    setBusy(true)
    setError(null)
    try {
      await setAiLimit({ scope, key: scope === 'global' ? '' : effectiveKey, period, metric, max: value, warnPct, mode, note: note.trim() || null })
      onSaved()
    } catch (err) {
      setError(aiErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="ai-form" onSubmit={(e) => void submit(e)} aria-label="Nuevo límite" data-help-id="ia.limite-formulario">
      {fixed ? (
        <p className="ai-form-wide">
          Se aplica a: <strong>{fixed.label}</strong>
        </p>
      ) : (
        <>
          <label className="ai-field">
            Se aplica a
            <select value={scope} onChange={(e) => { setScope(e.target.value as LimitScope); setKey('') }}>
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {LIMIT_SCOPE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          {needsKey && (
            <label className="ai-field">
              {scope === 'module' ? 'Módulo' : scope === 'function' ? 'Función' : 'Familia'}
              <select value={key} onChange={(e) => setKey(e.target.value)}>
                <option value="">Elige…</option>
                {keyOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      <label className="ai-field">
        Qué se mide
        <select value={metric} onChange={(e) => setMetric(e.target.value as LimitMetric)}>
          {(Object.keys(LIMIT_METRIC_LABEL) as LimitMetric[]).map((m) => (
            <option key={m} value={m}>
              {LIMIT_METRIC_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="ai-field">
        Periodo
        <select value={period} onChange={(e) => setPeriod(e.target.value as LimitPeriod)}>
          <option value="day">Diario</option>
          <option value="month">Mensual</option>
        </select>
      </label>
      <label className="ai-field">
        Máximo {metric === 'cost' ? '(US$ estimados)' : '(llamadas)'}
        <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder={metric === 'cost' ? 'p. ej. 5' : 'p. ej. 200'} />
      </label>
      <label className="ai-field">
        Avisar al llegar al (%)
        <input inputMode="numeric" value={warn} onChange={(e) => setWarn(e.target.value)} />
      </label>
      <label className="ai-field ai-form-wide">
        Modo
        <select value={mode} onChange={(e) => { setMode(e.target.value as LimitMode); setOkBlock(false) }}>
          {(Object.keys(LIMIT_MODE_LABEL) as LimitMode[]).map((m) => (
            <option key={m} value={m}>
              {LIMIT_MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <span className="ai-note">{LIMIT_MODE_HELP[mode]}</span>
      </label>
      {mode === 'block' && (
        <label className="cadm-check ai-form-wide">
          <input type="checkbox" checked={okBlock} onChange={(e) => setOkBlock(e.target.checked)} /> Entiendo que, al alcanzarlo, se impedirán nuevas operaciones de IA.
        </label>
      )}
      <label className="ai-field ai-form-wide">
        Nota (opcional)
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && (
        <p className="cadm-notice cadm-notice-error ai-form-wide" role="alert">
          {error}
        </p>
      )}
      <div className="cadm-actions ai-form-wide">
        <button type="submit" className="cadm-btn cadm-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar límite'}
        </button>
        {onCancel && (
          <button type="button" className="cadm-btn cadm-btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

export function LimitRow({ limit, onDeleted, onError }: { limit: AiLimit; onDeleted: () => void; onError: (m: string) => void }) {
  const st = limitState(limit)
  const pct = Math.min(limitPct(limit), 100)
  return (
    <li className="ai-row">
      <div className="ai-row-top">
        <strong>{limit.label}</strong>
        <span>
          {LIMIT_MODE_LABEL[limit.mode]} · {limit.metric === 'cost' ? 'presupuesto' : 'llamadas'} {LIMIT_PERIOD_LABEL[limit.period]}
        </span>
      </div>
      <span className={`ai-bar ${st === 'near' ? 'ai-bar-near' : st === 'over' ? 'ai-bar-over' : ''}`} role="img" aria-label={`${Math.round(limitPct(limit))} % usado`}>
        <span style={{ width: `${pct}%` }} />
      </span>
      <div className="ai-row-sub">
        <span>
          {formatLimitValue(limit.metric, limit.used)} de {formatLimitValue(limit.metric, limit.maxValue)} ({Math.round(limitPct(limit))} %)
        </span>
        <span>{limitStateText(limit)}</span>
        <span>Aviso al {limit.warnPct} %</span>
      </div>
      {limit.note && <p className="ai-note">{limit.note}</p>}
      <div className="cadm-actions">
        <TwoTapButton
          label="Eliminar límite"
          variant="secondary"
          onConfirm={() =>
            void deleteAiLimit(limit.id).then(onDeleted, (e: unknown) => onError(aiErrorText(e)))
          }
        />
      </div>
    </li>
  )
}

export function AiLimits({ functions }: { functions: AiFunctionRow[] }) {
  const loader = useCallback(async () => {
    const range = periodRange('30d', new Date())
    const [limits, fams] = await Promise.all([getAiLimits(), range ? getAiFamilies(range.from, range.to) : Promise.resolve([])])
    return { ...limits, families: fams.map((f) => ({ id: f.familyId, name: f.name })) }
  }, [])
  const { data, loading, error, reload } = useAdminData(loader)
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (loading && !data) return <AdminLoading />
  if (error) return <AdminError message={error} onRetry={reload} />
  if (!data) return null

  return (
    <div className="ai-stack">
      <InfoBox>
        <strong>Todos los límites nuevos empiezan en «Observación»</strong>: registran el consumo sin bloquear nada. Los costes son estimados, así que un límite de presupuesto en modo Bloqueo no puede garantizar el importe
        exacto: una llamada que ya está en curso puede acabar pasándose un poco. Las reglas de edad, privacidad y seguridad no dependen de estos límites ni se pueden saltar con excepciones.
      </InfoBox>
      <p className="muted cadm-small">
        Límite de seguridad que ya existía: Comunidad tiene un tope de <strong>{data.communityCap.cap === 0 ? 'sin tope' : `${formatCount(data.communityCap.cap)} llamadas al día`}</strong> (hoy se han usado{' '}
        {formatCount(data.communityCap.usedToday)}). Se cambia en <Link to={adminAreaPath('comunidad', { tab: 'configuracion' })}>Comunidad → Configuración</Link>.
      </p>
      <ActionNotice message={msg} error={err} />

      {data.limits.length === 0 ? (
        <AdminEmpty>Todavía no has definido ningún límite.</AdminEmpty>
      ) : (
        <ul className="ai-rows">
          {data.limits.map((l) => (
            <LimitRow
              key={l.id}
              limit={l}
              onDeleted={() => {
                setMsg('Límite eliminado.')
                setErr(null)
                reload()
              }}
              onError={(m) => setErr(m)}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <LimitForm
          scopes={['global', 'module', 'function', 'family']}
          functions={functions}
          families={data.families}
          onSaved={() => {
            setAdding(false)
            setMsg('Límite guardado. Si lo dejaste en Observación, solo registra el consumo.')
            setErr(null)
            reload()
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="cadm-actions">
          <button type="button" className="cadm-btn cadm-btn-primary" onClick={() => setAdding(true)}>
            Añadir un límite
          </button>
        </div>
      )}

      <h4 className="section-title">Excepciones por familia</h4>
      <p className="muted cadm-small">Una excepción deja a una familia fuera de los límites globales, de módulo y de función (no de los suyos propios). Puede caducar en una fecha.</p>
      <ExceptionList exceptions={data.exceptions} functions={functions} families={data.families} onChanged={reload} />
    </div>
  )
}

function ExceptionList({ exceptions, functions, families, onChanged }: { exceptions: AiException[]; functions: AiFunctionRow[]; families: FamilyOption[]; onChanged: () => void }) {
  const [family, setFamily] = useState('')
  const [purpose, setPurpose] = useState('')
  const [until, setUntil] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!family) return setError('Elige una familia.')
    setBusy(true)
    setError(null)
    try {
      await setAiException(family, purpose || null, until || null, note.trim() || null)
      setFamily('')
      setPurpose('')
      setUntil('')
      setNote('')
      onChanged()
    } catch (err) {
      setError(aiErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ai-stack">
      {exceptions.length === 0 ? (
        <AdminEmpty>No hay excepciones.</AdminEmpty>
      ) : (
        <ul className="ai-rows">
          {exceptions.map((x) => (
            <li key={x.id} className="ai-row">
              <div className="ai-row-top">
                <strong>{x.family}</strong>
                <span>{x.purpose ? (functions.find((f) => f.purpose === x.purpose)?.label ?? x.purpose) : 'Todas las funciones'}</span>
              </div>
              <div className="ai-row-sub">
                <span>{x.until ? `Hasta el ${x.until}` : 'Sin caducidad'}</span>
                {x.note && <span>{x.note}</span>}
              </div>
              <div className="cadm-actions">
                <TwoTapButton label="Quitar excepción" variant="secondary" onConfirm={() => void deleteAiException(x.id).then(onChanged, (e: unknown) => setError(aiErrorText(e)))} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="ai-form" onSubmit={(e) => void add(e)} aria-label="Nueva excepción">
        <label className="ai-field">
          Familia
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="">Elige…</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ai-field">
          Función
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="">Todas</option>
            {functions.map((f) => (
              <option key={f.purpose} value={f.purpose}>
                {moduleLabel(f.module)} · {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ai-field">
          Hasta (opcional)
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <label className="ai-field">
          Nota (opcional)
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p className="cadm-notice cadm-notice-error ai-form-wide" role="alert">
            {error}
          </p>
        )}
        <div className="cadm-actions ai-form-wide">
          <button type="submit" className="cadm-btn cadm-btn-secondary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar excepción'}
          </button>
        </div>
      </form>
    </div>
  )
}
