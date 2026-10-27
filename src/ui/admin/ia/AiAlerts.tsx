import { useCallback, useState } from 'react'
import { getAiAlerts, runAiDetection, setAiAlertStatus, setAiThresholds } from '@/data/aiControl'
import { ALERT_SEVERITY_LABEL, THRESHOLD_FIELDS, aiErrorText, alertText, type AiAlert, type AiState } from '@/domain/aiControl'
import { ActionNotice, AdminEmpty, AdminError, AdminLoading, InfoBox } from '@/ui/community/admin/AdminShared'
import { useAdminData } from '@/ui/community/admin/useAdminData'
import '@/ui/admin/ia/aiControl.css'

type Filter = 'open' | 'reviewed' | 'dismissed' | 'all'
const FILTER_LABEL: Record<Filter, string> = { open: 'Abiertas', reviewed: 'Revisadas', dismissed: 'Descartadas', all: 'Todas' }

const fmt = (iso: string) =>
  iso ? new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : ''

export function AiAlerts({ state, reloadState }: { state: AiState; reloadState: () => void }) {
  const [filter, setFilter] = useState<Filter>('open')
  const loader = useCallback(() => getAiAlerts(filter), [filter])
  const { data, loading, error, reload } = useAdminData(loader)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const act = async (fn: () => Promise<unknown>, ok: string | ((r: unknown) => string)) => {
    if (busy) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const r = await fn()
      setMsg(typeof ok === 'function' ? ok(r) : ok)
      reload()
      reloadState()
    } catch (e) {
      setErr(aiErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ai-stack">
      <InfoBox>
        Una alerta <strong>no implica abuso</strong>: es una señal para mirar con calma. Revísala antes de aplicar ninguna restricción. La misma incidencia no se repite: mientras siga abierta (o durante 24 horas después de
        revisarla o descartarla) solo se actualiza. La revisión automática se hace cada hora y solo lee el registro de consumo.
      </InfoBox>
      <div className="ai-periods" role="group" aria-label="Filtrar alertas">
        {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} className={`cadm-btn ${filter === f ? 'cadm-btn-primary' : 'cadm-btn-secondary'}`} onClick={() => setFilter(f)}>
            {FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="cadm-actions">
        <button type="button" className="cadm-btn cadm-btn-secondary" disabled={busy} onClick={() => void act(runAiDetection, (n) => (Number(n) > 0 ? `Revisión hecha: ${n} señal(es) detectada(s).` : 'Revisión hecha: no se ha detectado nada fuera de lo normal.'))}>
          {busy ? 'Revisando…' : 'Revisar ahora'}
        </button>
      </div>
      <ActionNotice message={msg} error={err} />

      {loading && !data ? (
        <AdminLoading />
      ) : error ? (
        <AdminError message={error} onRetry={reload} />
      ) : !data || data.length === 0 ? (
        <AdminEmpty>{filter === 'open' ? 'No hay alertas abiertas. Todo dentro de lo normal.' : 'No hay alertas en esta lista.'}</AdminEmpty>
      ) : (
        <ul className="ai-rows" data-help-id="ia.alertas-lista">
          {data.map((a) => (
            <AlertRow key={a.id} alert={a} busy={busy} onSet={(s) => void act(() => setAiAlertStatus(a.id, s), s === 'reviewed' ? 'Alerta marcada como revisada.' : s === 'dismissed' ? 'Alerta descartada.' : 'Alerta reabierta.')} />
          ))}
        </ul>
      )}

      <Thresholds state={state} reloadState={reloadState} />
    </div>
  )
}

function AlertRow({ alert, busy, onSet }: { alert: AiAlert; busy: boolean; onSet: (s: 'open' | 'reviewed' | 'dismissed') => void }) {
  const t = alertText(alert)
  return (
    <li className={`ai-row ai-alert ${alert.severity === 'critical' ? 'ai-alert-critical' : alert.severity === 'info' ? 'ai-alert-info' : ''}`}>
      <div className="ai-row-top">
        <strong>{t.title}</strong>
        <span className="ai-pill">{ALERT_SEVERITY_LABEL[alert.severity]}</span>
      </div>
      <p className="ai-note">{t.body}</p>
      <div className="ai-row-sub">
        <span>Detectada: {fmt(alert.firstSeen)}</span>
        <span>Última vez: {fmt(alert.lastSeen)}</span>
        {alert.occurrences > 1 && <span>{alert.occurrences} comprobaciones</span>}
      </div>
      <div className="cadm-actions">
        {alert.status === 'open' ? (
          <>
            <button type="button" className="cadm-btn cadm-btn-secondary" disabled={busy} onClick={() => onSet('reviewed')}>
              Marcar como revisada
            </button>
            <button type="button" className="cadm-btn cadm-btn-ghost" disabled={busy} onClick={() => onSet('dismissed')}>
              Descartar
            </button>
          </>
        ) : (
          <button type="button" className="cadm-btn cadm-btn-secondary" disabled={busy} onClick={() => onSet('open')}>
            Reabrir
          </button>
        )}
      </div>
    </li>
  )
}

function Thresholds({ state, reloadState }: { state: AiState; reloadState: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f.key, String(state.thresholds[f.key] ?? '')])))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const out: Record<string, number> = {}
    for (const f of THRESHOLD_FIELDS) {
      const n = Number(String(vals[f.key]).replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) return setErr(`«${f.label}»: escribe un número válido.`)
      out[f.key] = n
    }
    setBusy(true)
    setErr(null)
    try {
      await setAiThresholds(out)
      setMsg('Umbrales guardados.')
      reloadState()
    } catch (e2) {
      setErr(aiErrorText(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details>
      <summary>Umbrales de las alertas</summary>
      <form className="ai-form" onSubmit={(e) => void save(e)} aria-label="Umbrales de las alertas">
        {THRESHOLD_FIELDS.map((f) => (
          <label key={f.key} className="ai-field">
            {f.label} ({f.unit})
            <input inputMode="decimal" value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            <span className="ai-note">{f.help}</span>
          </label>
        ))}
        <div className="ai-form-wide">
          <ActionNotice message={msg} error={err} />
          <div className="cadm-actions">
            <button type="submit" className="cadm-btn cadm-btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar umbrales'}
            </button>
          </div>
        </div>
      </form>
    </details>
  )
}
