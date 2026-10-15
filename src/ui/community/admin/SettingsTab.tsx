import { useCallback, useId, useState, type FormEvent } from 'react'
import { adminBlockDomain, adminGetSettings, adminSetSetting } from '@/data/community'
import { ADMIN_TEXT, LAUNCH_KEY, normalizeDomain, toAdminSettings, validateSettingValue, type AdminSetting } from '@/domain/communityAdmin'
import { ActionNotice, AdminError, AdminLoading, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { LaunchSwitch } from '@/ui/community/admin/LaunchSwitch'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

// Configuración: solo los parámetros autorizados (números) y los dominios bloqueados. Cada cambio queda en el historial.
export function SettingsTab({ onChanged }: { onChanged: () => void }) {
  const loader = useCallback(async () => toAdminSettings(await adminGetSettings()), [])
  const { data, loading, error, reload, setData } = useAdminData(loader)
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div className="cadm-stack">
      <InfoBox>{ADMIN_TEXT.settingsAuthorized}</InfoBox>
      <ActionNotice message={notice} />
      {loading && <AdminLoading label="Cargando la configuración…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {data && (
        <>
          <section aria-labelledby="cadm-set-switches">
            <h3 id="cadm-set-switches">Interruptores</h3>
            {data.settings.some((s) => s.key === LAUNCH_KEY) ? (
              <LaunchSwitch onChanged={onChanged} />
            ) : (
              <p className="muted">No hay interruptores disponibles.</p>
            )}
          </section>

          <section aria-labelledby="cadm-set-numbers">
            <h3 id="cadm-set-numbers">Parámetros</h3>
            <ul className="cadm-list">
              {data.settings
                .filter((s) => s.kind !== 'switch')
                .map((s) => (
                  <li key={s.key}>
                    <SettingRow
                      setting={s}
                      onSaved={(v) => {
                        setNotice(`«${s.label}» ahora vale ${v}.`)
                        setData((prev) => (prev ? { ...prev, settings: prev.settings.map((x) => (x.key === s.key ? { ...x, value: v } : x)) } : prev))
                      }}
                    />
                  </li>
                ))}
            </ul>
          </section>

          <section aria-labelledby="cadm-set-domains">
            <h3 id="cadm-set-domains">Dominios bloqueados</h3>
            <p className="muted cadm-small">Los enlaces a estos sitios no se pueden publicar en Comunidad.</p>
            <DomainForm
              onDone={(text, domain, reason, removed) => {
                setNotice(text)
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        blockedDomains: removed
                          ? prev.blockedDomains.filter((d) => d.domain !== domain)
                          : [...prev.blockedDomains.filter((d) => d.domain !== domain), { domain, reason }].sort((a, b) => a.domain.localeCompare(b.domain)),
                      }
                    : prev,
                )
              }}
            />
            {data.blockedDomains.length === 0 && <p className="muted">No hay dominios bloqueados.</p>}
            <ul className="cadm-list">
              {data.blockedDomains.map((d) => (
                <li key={d.domain}>
                  <DomainRow
                    domain={d.domain}
                    reason={d.reason}
                    onRemoved={() => {
                      setNotice(`${d.domain} desbloqueado.`)
                      setData((prev) => (prev ? { ...prev, blockedDomains: prev.blockedDomains.filter((x) => x.domain !== d.domain) } : prev))
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

// Un parámetro numérico: nombre claro, descripción del servidor y campo para cambiarlo.
export function SettingRow({ setting: s, onSaved }: { setting: AdminSetting; onSaved: (value: number) => void }) {
  const id = useId()
  const [raw, setRaw] = useState(s.value === null ? '' : String(s.value))
  const [problem, setProblem] = useState<string | null>(null)
  const action = useAdminAction()
  const changed = s.value !== null && raw.trim() !== String(s.value)

  const save = (e: FormEvent) => {
    e.preventDefault()
    const v = validateSettingValue(raw)
    setProblem(v.error)
    if (v.value === null) return
    const value = v.value
    void (async () => {
      const r = await action.run(() => adminSetSetting(s.key, value))
      if (r.ok) onSaved(value)
    })()
  }

  return (
    <form className="cadm-card cadm-setting" onSubmit={save} aria-label={s.label}>
      <label htmlFor={`${id}-v`} className="cadm-setting-label">
        {s.label}
      </label>
      {s.description && <p className="muted cadm-small">{s.description}</p>}
      {s.value === null ? (
        <p className="muted cadm-small">Este parámetro no se puede cambiar desde aquí.</p>
      ) : (
        <div className="cadm-search-row">
          <input
            id={`${id}-v`}
            inputMode="numeric"
            pattern="[0-9]*"
            value={raw}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => {
              setRaw(e.target.value)
              setProblem(null)
            }}
          />
          {s.unit && <span className="muted cadm-small">{s.unit}</span>}
          <button type="submit" className="cadm-btn cadm-btn-primary" disabled={!changed || action.busy}>
            {action.busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
      {problem && (
        <p className="error cadm-small" role="alert">
          {problem}
        </p>
      )}
      <ActionNotice error={action.error} />
    </form>
  )
}

function DomainForm({ onDone }: { onDone: (message: string, domain: string, reason: string | null, removed: boolean) => void }) {
  const id = useId()
  const [domain, setDomain] = useState('')
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const action = useAdminAction()
  return (
    <form
      className="cadm-noteform"
      onSubmit={(e) => {
        e.preventDefault()
        const n = normalizeDomain(domain)
        setProblem(n.error)
        const d = n.domain
        if (!d) return
        void (async () => {
          const r = await action.run(() => adminBlockDomain(d, reason.trim() || null, false))
          if (r.ok) {
            setDomain('')
            setReason('')
            onDone(`${d} bloqueado.`, d, reason.trim() || null, false)
          }
        })()
      }}
    >
      <label htmlFor={`${id}-d`}>Bloquear un sitio</label>
      <input id={`${id}-d`} value={domain} placeholder="ejemplo.com" autoCapitalize="none" autoCorrect="off" onChange={(e) => setDomain(e.target.value)} />
      <label htmlFor={`${id}-r`}>Motivo (opcional)</label>
      <input id={`${id}-r`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
      {problem && (
        <p className="error cadm-small" role="alert">
          {problem}
        </p>
      )}
      <ActionNotice error={action.error} />
      <div className="cadm-actions">
        <button type="submit" className="cadm-btn cadm-btn-primary" disabled={action.busy || domain.trim() === ''}>
          {action.busy ? 'Un momento…' : 'Bloquear'}
        </button>
      </div>
    </form>
  )
}

function DomainRow({ domain, reason, onRemoved }: { domain: string; reason: string | null; onRemoved: () => void }) {
  const action = useAdminAction()
  return (
    <div className="cadm-card cadm-domain">
      <div>
        <p className="cadm-title">{domain}</p>
        {reason && <p className="muted cadm-small">{reason}</p>}
        <ActionNotice error={action.error} />
      </div>
      <TwoTapButton
        label="Quitar"
        armedLabel="Toca otra vez para desbloquear"
        variant="secondary"
        disabled={action.busy}
        onConfirm={() => {
          void (async () => {
            const r = await action.run(() => adminBlockDomain(domain, null, true))
            if (r.ok) onRemoved()
          })()
        }}
      />
    </div>
  )
}
