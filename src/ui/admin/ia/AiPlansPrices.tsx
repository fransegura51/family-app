import { useCallback, useState } from 'react'
import { addAiPrice, deleteAiQuota, getAiAudit, getAiPlans, getAiPrices, setAiQuota, upsertAiPlan } from '@/data/aiControl'
import { LIMIT_PERIOD_LABEL, aiErrorText, auditActionText, formatEur, type AiFunctionRow, type AiPlan, type LimitMetric, type LimitPeriod } from '@/domain/aiControl'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { useAdminData } from '@/ui/community/admin/useAdminData'
import '@/ui/admin/ia/aiControl.css'

const toNum = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

// Planes: estructura PREPARADA para el futuro modelo gratuito / de pago. No tiene ningún efecto: ninguna familia tiene plan asignado y las puertas de IA no leen estos datos.
export function AiPlans({ functions }: { functions: AiFunctionRow[] }) {
  const loader = useCallback(() => getAiPlans(), [])
  const { data, loading, error, reload } = useAdminData(loader)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  if (loading && !data) return <AdminLoading />
  if (error) return <AdminError message={error} onRetry={reload} />
  if (!data) return null

  return (
    <div className="ai-stack">
      <InfoBox>
        <strong>Preparación, sin efecto.</strong> Aquí se definen los planes y las cuotas de IA por función para cuando existan los niveles gratuito y de pago, las excepciones y las promociones. Hoy ninguna familia tiene un plan
        asignado y no se aplica ninguna restricción comercial: los permisos actuales no cambian. No hay precios inventados: el precio se deja en blanco hasta que exista.
      </InfoBox>
      <ActionNotice message={msg} error={err} />
      {data.plans.length === 0 ? (
        <AdminEmpty>Todavía no hay planes definidos.</AdminEmpty>
      ) : (
        <ul className="ai-rows">
          {data.plans.map((p) => (
            <PlanRow
              key={p.id}
              plan={p}
              functions={functions}
              onChanged={(m) => {
                setMsg(m)
                setErr(null)
                reload()
              }}
              onError={setErr}
            />
          ))}
        </ul>
      )}
      <PlanForm
        onSaved={() => {
          setMsg('Plan guardado.')
          setErr(null)
          reload()
        }}
      />
    </div>
  )
}

function PlanRow({ plan, functions, onChanged, onError }: { plan: AiPlan; functions: AiFunctionRow[]; onChanged: (m: string) => void; onError: (m: string) => void }) {
  const [purpose, setPurpose] = useState('*')
  const [metric, setMetric] = useState<LimitMetric>('calls')
  const [period, setPeriod] = useState<LimitPeriod>('month')
  const [max, setMax] = useState('')
  const label = (p: string) => (p === '*' ? 'Todas las funciones' : (functions.find((f) => f.purpose === p)?.label ?? p))
  return (
    <li className="ai-row">
      <div className="ai-row-top">
        <strong>{plan.name}</strong>
        <span>{plan.monthlyPriceEur === null ? 'Sin precio definido' : `${formatEur(plan.monthlyPriceEur)} al mes`}</span>
      </div>
      <div className="ai-row-sub">
        <span>{plan.active ? 'Activo' : 'Inactivo'}</span>
        <span>{plan.families} familias asignadas</span>
      </div>
      {plan.note && <p className="ai-note">{plan.note}</p>}
      {plan.quotas.length === 0 ? (
        <p className="muted cadm-small">Sin cuotas.</p>
      ) : (
        <ul className="ai-rows">
          {plan.quotas.map((q) => (
            <li key={`${q.purpose}|${q.period}|${q.metric}`} className="ai-row ai-row-top">
              <span>
                {label(q.purpose)}: {q.metric === 'cost' ? `${q.maxValue} US$` : `${q.maxValue} llamadas`} {LIMIT_PERIOD_LABEL[q.period]}
              </span>
              <TwoTapButton label="Quitar" variant="secondary" onConfirm={() => void deleteAiQuota(plan.id, q.purpose, q.period, q.metric).then(() => onChanged('Cuota eliminada.'), (e: unknown) => onError(aiErrorText(e)))} />
            </li>
          ))}
        </ul>
      )}
      <form
        className="ai-form"
        aria-label={`Nueva cuota de ${plan.name}`}
        onSubmit={(e) => {
          e.preventDefault()
          const v = toNum(max)
          if (v === null) return onError('Escribe un máximo válido.')
          void setAiQuota(plan.id, purpose, period, metric, v).then(() => {
            setMax('')
            onChanged('Cuota guardada.')
          }, (er: unknown) => onError(aiErrorText(er)))
        }}
      >
        <label className="ai-field">
          Función
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option value="*">Todas</option>
            {functions.map((f) => (
              <option key={f.purpose} value={f.purpose}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ai-field">
          Qué se mide
          <select value={metric} onChange={(e) => setMetric(e.target.value as LimitMetric)}>
            <option value="calls">Llamadas</option>
            <option value="cost">Presupuesto (US$)</option>
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
          Máximo
          <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
        </label>
        <div className="cadm-actions ai-form-wide">
          <button type="submit" className="cadm-btn cadm-btn-secondary">
            Guardar cuota
          </button>
        </div>
      </form>
    </li>
  )
}

function PlanForm({ onSaved }: { onSaved: () => void }) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="ai-form"
      aria-label="Nuevo plan"
      onSubmit={(e) => {
        e.preventDefault()
        if (!/^[a-z0-9_-]{2,40}$/.test(id)) return setError('El identificador usa 2 a 40 letras minúsculas, números, guion o guion bajo.')
        if (name.trim().length < 2) return setError('Escribe un nombre.')
        const p = price.trim() === '' ? null : toNum(price)
        if (price.trim() !== '' && p === null) return setError('El precio no es válido.')
        setBusy(true)
        setError(null)
        void upsertAiPlan(id, name.trim(), p, true, null).then(
          () => {
            setId('')
            setName('')
            setPrice('')
            onSaved()
          },
          (er: unknown) => setError(aiErrorText(er)),
        ).finally(() => setBusy(false))
      }}
    >
      <label className="ai-field">
        Identificador
        <input value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="p. ej. gratuito" />
      </label>
      <label className="ai-field">
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Plan gratuito" />
      </label>
      <label className="ai-field">
        Precio mensual en € (opcional)
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      {error && (
        <p className="cadm-notice cadm-notice-error ai-form-wide" role="alert">
          {error}
        </p>
      )}
      <div className="cadm-actions ai-form-wide">
        <button type="submit" className="cadm-btn cadm-btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar plan'}
        </button>
      </div>
    </form>
  )
}

const fmtDate = (iso: string) => (iso ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '')

// Tarifas versionadas y registro de cambios.
export function AiPrices() {
  const loader = useCallback(async () => ({ prices: await getAiPrices(), audit: await getAiAudit(30) }), [])
  const { data, loading, error, reload } = useAdminData(loader)
  const [form, setForm] = useState({ provider: 'gemini', model: '', modality: 'text', input: '', output: '', from: '', kind: 'estimated' as 'estimated' | 'confirmed', source: '' })
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading && !data) return <AdminLoading />
  if (error) return <AdminError message={error} onRetry={reload} />
  if (!data) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const i = toNum(form.input)
    const o = toNum(form.output)
    if (!form.model.trim() || i === null || o === null || !/^\d{4}-\d{2}-\d{2}$/.test(form.from) || form.source.trim().length < 3) return setFormError('Rellena modelo, precios, fecha de inicio y origen del dato.')
    setBusy(true)
    setFormError(null)
    void addAiPrice({ provider: form.provider.trim(), model: form.model.trim(), modality: form.modality, input: i, output: o, validFrom: form.from, kind: form.kind, source: form.source.trim() })
      .then(
        () => {
          setForm({ ...form, model: '', input: '', output: '', from: '', source: '' })
          reload()
        },
        (er: unknown) => setFormError(aiErrorText(er)),
      )
      .finally(() => setBusy(false))
  }

  return (
    <div className="ai-stack">
      <InfoBox>
        El coste de cada llamada se calcula con la tarifa vigente de su modelo en ese momento. «Estimada» = tarifa pública sin contrastar con la factura; «Confirmada» = contrastada. Si cambia una tarifa, añade una nueva con su
        fecha: las llamadas ya anotadas conservan el coste con el que se calcularon. PEPA usa hoy el plan gratuito de Gemini, así que la factura real puede ser 0 €: las cifras son el coste a tarifa de pago.
      </InfoBox>
      <ul className="ai-rows">
        {data.prices.map((p) => (
          <li key={p.id} className="ai-row">
            <div className="ai-row-top">
              <strong>
                {p.provider} / {p.model}
              </strong>
              <span className="ai-pill">{p.kind === 'confirmed' ? 'Confirmada' : 'Estimada'}</span>
            </div>
            <div className="ai-row-sub">
              <span>
                {p.inputPerMtok} / {p.outputPerMtok} {p.currency} por millón de tokens (entrada / salida)
              </span>
              <span>Modalidad: {p.modality}</span>
              <span>
                Desde {p.validFrom}
                {p.validTo ? ` hasta ${p.validTo}` : ' (vigente)'}
              </span>
            </div>
            <p className="ai-note">{p.source}</p>
          </li>
        ))}
      </ul>
      <form className="ai-form" onSubmit={submit} aria-label="Nueva tarifa">
        <label className="ai-field">
          Proveedor
          <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
        </label>
        <label className="ai-field">
          Modelo
          <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </label>
        <label className="ai-field">
          Modalidad
          <select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            <option value="text">Texto</option>
            <option value="image">Imagen</option>
            <option value="audio">Audio</option>
            <option value="video">Vídeo</option>
          </select>
        </label>
        <label className="ai-field">
          Entrada (US$ por millón)
          <input inputMode="decimal" value={form.input} onChange={(e) => setForm({ ...form, input: e.target.value })} />
        </label>
        <label className="ai-field">
          Salida (US$ por millón)
          <input inputMode="decimal" value={form.output} onChange={(e) => setForm({ ...form, output: e.target.value })} />
        </label>
        <label className="ai-field">
          Vigente desde
          <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </label>
        <label className="ai-field">
          Tipo de dato
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'estimated' | 'confirmed' })}>
            <option value="estimated">Estimada (tarifa pública)</option>
            <option value="confirmed">Confirmada con la factura</option>
          </select>
        </label>
        <label className="ai-field ai-form-wide">
          De dónde sale el dato
          <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        </label>
        {formError && (
          <p className="cadm-notice cadm-notice-error ai-form-wide" role="alert">
            {formError}
          </p>
        )}
        <div className="cadm-actions ai-form-wide">
          <button type="submit" className="cadm-btn cadm-btn-primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Añadir tarifa'}
          </button>
        </div>
      </form>

      <h4 className="section-title">Quién cambió qué</h4>
      {data.audit.length === 0 ? (
        <AdminEmpty>Todavía no hay cambios registrados.</AdminEmpty>
      ) : (
        <ul className="ai-rows">
          {data.audit.map((a, i) => (
            <li key={`${a.at}-${i}`} className="ai-row">
              <div className="ai-row-top">
                <strong>{auditActionText(a.action)}</strong>
                <span>{fmtDate(a.at)}</span>
              </div>
              <div className="ai-row-sub">
                <span>{a.admin}</span>
                {a.subject && <span>{a.subject}</span>}
              </div>
              {(a.before !== null || a.after !== null) && (
                <p className="ai-note">
                  {a.before !== null ? `Antes: ${JSON.stringify(a.before)} ` : ''}
                  {a.after !== null ? `Después: ${JSON.stringify(a.after)}` : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
