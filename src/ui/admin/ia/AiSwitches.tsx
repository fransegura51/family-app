import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adminAreaPath } from '@/admin/adminAreas'
import { setAiFunction, setAiGlobal } from '@/data/aiControl'
import {
  AI_MODULES,
  NEED_TEXT,
  STATUS_TEXT,
  aiErrorText,
  functionStatus,
  moduleIcon,
  scheduleOf,
  type AiFunctionRow,
  type AiState,
} from '@/domain/aiControl'
import { ActionNotice, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'
import '@/ui/admin/ia/aiControl.css'

// Interruptor general + un interruptor por función, agrupadas por módulo. La lista sale del registro del servidor (ai_function): una función nueva aparece sola.
// Apagar NO borra nada: la selección individual se conserva y vuelve igual al reactivar. Las restricciones las aplica el servidor, no esta pantalla.
export function AiSwitches({ state, reload }: { state: AiState; reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (key: string, action: () => Promise<unknown>, ok: string) => {
    if (busy) return
    setBusy(key)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(ok)
      reload()
    } catch (e) {
      setError(aiErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  const modules = AI_MODULES.map((m) => ({ ...m, fns: state.functions.filter((f) => f.module === m.id) })).filter((m) => m.fns.length > 0)

  return (
    <div className="ai-stack">
      <div className={`ai-global ${state.enabled ? 'ai-global-on' : 'ai-global-off'}`} data-help-id="ia.interruptor-general">
        <div className="ai-global-text">
          <strong>Inteligencia artificial de PEPA — {state.enabled ? 'Activada' : 'Desactivada'}</strong>
          <span className="muted cadm-small">
            {state.enabled
              ? 'Las funciones que tengan su interruptor activado pueden usar IA.'
              : 'Ninguna función hace llamadas nuevas a la IA. Los módulos siguen funcionando de forma convencional y no se borra nada.'}
          </span>
        </div>
        {state.enabled ? (
          <TwoTapButton label="Desactivar toda la IA" armedLabel="Toca otra vez para desactivar" variant="danger" disabled={busy !== null} onConfirm={() => void run('global', () => setAiGlobal(false), 'IA desactivada en toda PEPA.')} />
        ) : (
          <button type="button" className="cadm-btn cadm-btn-primary" disabled={busy !== null} onClick={() => void run('global', () => setAiGlobal(true), 'IA activada: vuelve exactamente la selección anterior.')}>
            {busy === 'global' ? 'Guardando…' : 'Activar la IA'}
          </button>
        )}
      </div>
      <ActionNotice message={message} error={error} />

      <p className="muted cadm-small">
        Proveedor: <strong>{state.provider}</strong>
        {state.model ? ` · modelo ${state.model}` : ''} · {state.keyConfigured ? 'clave configurada ✓' : 'falta la clave del proveedor ✗'}. Cambiar de proveedor o de modelo no se hace desde aquí.
      </p>

      <InfoBox>
        <strong>Qué ocurre al desactivar.</strong> Una llamada que ya esté en marcha termina (no se puede cortar una llamada al proveedor) y se anota; desde ese momento el servidor no inicia ninguna nueva, tampoco desde
        tareas programadas ni por rutas alternativas. Los trabajos con varios pasos (por ejemplo la generación semanal) se detienen en el siguiente paso y conservan lo ya creado. Reactivar devuelve la selección anterior.
      </InfoBox>

      {modules.map((m) => (
        <section key={m.id} className="ai-module" aria-label={m.label}>
          <h4>
            <span aria-hidden="true">{moduleIcon(m.id)} </span>
            {m.label}
          </h4>
          {m.fns.map((f) => (
            <FunctionRow key={f.purpose} fn={f} state={state} busy={busy === f.purpose} disabled={busy !== null} onToggle={() => void run(f.purpose, () => setAiFunction(f.purpose, !f.enabled), f.enabled ? `«${f.label}» desactivada.` : `«${f.label}» activada.`)} />
          ))}
        </section>
      ))}

      {state.unregistered.length > 0 && (
        <p className="ai-note" role="status">
          Se han detectado llamadas de funciones que aún no están en el registro ({state.unregistered.join(', ')}). Se contabilizan en «Otros módulos con IA»; hay que registrarlas para poder apagarlas una a una.
        </p>
      )}
    </div>
  )
}

function FunctionRow({ fn, state, busy, disabled, onToggle }: { fn: AiFunctionRow; state: AiState; busy: boolean; disabled: boolean; onToggle: () => void }) {
  const st = functionStatus(fn, state)
  const tone = st.kind === 'on' ? 'ai-pill-on' : st.kind === 'waiting' ? 'ai-pill-wait' : st.kind === 'technical' ? 'ai-pill-bad' : ''
  const schedule = scheduleOf(fn.purpose, state.community)
  const deps = fn.needs.filter((n) => n !== 'global')
  return (
    <div className="ai-fn" {...(fn.purpose === 'editorial_article' ? { 'data-help-id': 'ia.funcion-articulos' } : {})}>
      <div className="ai-fn-head">
        <span className="ai-fn-name">{fn.label}</span>
        <span className={`ai-pill ${tone}`}>{STATUS_TEXT[st.kind]}</span>
        <button
          type="button"
          role="switch"
          aria-checked={fn.enabled}
          aria-label={`Interruptor de ${fn.label}`}
          className={`cadm-btn ${fn.enabled ? 'cadm-btn-secondary' : 'cadm-btn-primary'}`}
          disabled={disabled}
          onClick={onToggle}
        >
          {busy ? 'Guardando…' : fn.enabled ? 'Desactivar' : 'Activar'}
        </button>
      </div>
      <p className="muted">{fn.description}</p>
      {(st.kind === 'waiting' || st.kind === 'technical') && <p>{st.reason}</p>}
      {st.kind === 'global_off' && fn.enabled && <p className="muted">Su interruptor está activado, pero no funcionará hasta reactivar la IA general.</p>}
      {schedule !== null && (
        <p className="muted">
          Programación semanal automática: <strong>{schedule ? 'activada' : 'en pausa'}</strong>. Se gestiona en{' '}
          <Link to={adminAreaPath('comunidad', { tab: 'oficial' })}>Comunidad → Contenido oficial</Link>. Si esta función está desactivada, ni la programación ni «Generar ahora» llaman a la IA.
        </p>
      )}
      {deps.length > 0 && <p className="ai-note">{deps.map((d) => NEED_TEXT[d]).join(' ')}</p>}
      <div className="ai-fn-meta">
        <span>{fn.origin === 'automatic' ? 'La lanza PEPA por su cuenta' : fn.origin === 'admin' ? 'La lanza una persona administradora' : 'La lanzan las familias'}</span>
        <span>Últimas 24 h: {fn.calls24h} {fn.calls24h === 1 ? 'llamada' : 'llamadas'}{fn.failed24h > 0 ? ` (${fn.failed24h} con fallo)` : ''}</span>
      </div>
    </div>
  )
}
