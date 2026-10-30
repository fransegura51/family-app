import { useEffect, useMemo, useState } from 'react'
import pepaLogoSlogan from '@/assets/brand/variants/pepa-family-app-logo-slogan.png'
import { PEPA_PUBLIC_WEBSITE_URL } from '@/domain/brand'
import { formatDate } from '@/domain/dateFormat'
import { retentionExpiry, todayIn, type AnswerValue, type FieldType } from '@/domain/groupForms'
import { DateField } from '@/ui/DateField'
import '@/ui/groups/groups.css'

// Formulario PÚBLICO de «Solicitar datos» (enlace «/?formulario=TOKEN»). Sin cuenta PEPA ni sesión. Quien solicita los datos es la identidad del formulario; PEPA solo aparece, discreta, en
// el pie (también en la pantalla de confirmación). Solo enseña lo que la función de servidor decide que es público.

export interface PublicField {
  id: string
  type: FieldType
  label: string
  help: string | null
  required: boolean
  options: string[]
  sensitive: boolean
}
export interface PublicFormView {
  kind: 'participante' | 'general'
  title: string
  requesterName: string
  requesterContact: string | null
  groupName: string
  purpose: string
  intro: string | null
  deadline: string | null
  closed: boolean
  personName: string | null
  fields: PublicField[]
  retention: { max: string; today: string } | null
  answered: boolean
  previous: Record<string, AnswerValue> | null
  agreedExpires: string | null
  retentionChangedSinceAnswer: boolean
  retentionMax: string | null
  deletion: { status: string; legalReason: string | null } | null
}

export interface SubmitPayload {
  answers: Record<string, AnswerValue>
  studentName?: string
  retentionDate?: string | null
  consent?: boolean
}
export type SubmitResult = { ok: true; expires: string | null } | { ok: false; errors?: Record<string, string>; message?: string }

/** El pie discreto de PEPA: logotipo oficial pequeño, texto exacto y enlace. Se muestra siempre (formulario y confirmación). */
export function PepaFormFooter() {
  return (
    <div className="grp-form-footer" data-help-id="grupos.formulario-pie">
      <img src={pepaLogoSlogan} alt="Pepa Family App" style={{ width: '100%', maxWidth: 120, height: 'auto', display: 'block', margin: '0 auto 4px' }} />
      <span>Formulario creado vía Pepa Family App</span>
      <a href={PEPA_PUBLIC_WEBSITE_URL} target="_blank" rel="noreferrer">
        {PEPA_PUBLIC_WEBSITE_URL}
      </a>
    </div>
  )
}

function functionsUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/group-form-public`
}

export function GroupFormPublicScreen({ token }: { token: string }) {
  const [view, setView] = useState<PublicFormView | 'not_found' | 'error' | null>(null)
  const url = `${functionsUrl()}?token=${encodeURIComponent(token)}`
  const load = () =>
    fetch(url)
      .then(async (res) => {
        if (res.status === 404) return setView('not_found')
        if (!res.ok) return setView('error')
        setView((await res.json()) as PublicFormView)
      })
      .catch(() => setView('error'))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const submit = async (payload: SubmitPayload): Promise<SubmitResult> => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', ...payload }) })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; expires?: string | null; errors?: Record<string, string>; error?: string }
      if (body.ok) {
        void load()
        return { ok: true, expires: body.expires ?? null }
      }
      if (res.status === 422 && body.errors) return { ok: false, errors: body.errors }
      if (res.status === 409) return { ok: false, message: 'Este formulario ya está cerrado.' }
      if (res.status === 429) return { ok: false, message: 'Demasiados intentos. Espera un rato y vuelve a probar.' }
      if (body.error === 'consent_required') return { ok: false, message: 'Marca la casilla para confirmar que aceptas cómo se guardan estos datos.' }
      return { ok: false, message: 'No se ha podido enviar. Inténtalo de nuevo en un rato.' }
    } catch {
      return { ok: false, message: 'No se ha podido enviar. Comprueba tu conexión.' }
    }
  }
  const upload = async (fieldId: string, file: File): Promise<string> => {
    const fd = new FormData()
    fd.append('fieldId', fieldId)
    fd.append('file', file)
    const res = await fetch(url, { method: 'POST', body: fd })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; error?: string }
    if (body.ok && body.path) return body.path
    if (body.error === 'file_type') throw new Error('Ese tipo de archivo no se admite. Usa PDF, JPG o PNG.')
    if (body.error === 'file_size') throw new Error('El archivo pesa demasiado (máximo 8 MB).')
    throw new Error('No se ha podido subir el archivo. Inténtalo de nuevo.')
  }
  const requestDeletion = async (reason: string): Promise<boolean> => {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_deletion', reason }) })
      const ok = ((await res.json().catch(() => ({}))) as { ok?: boolean }).ok === true
      if (ok) void load()
      return ok
    } catch {
      return false
    }
  }

  if (view === null) return <div className="screen screen-centered">Cargando…</div>
  if (view === 'not_found')
    return (
      <div className="screen grp-screen grp-form-public">
        <p>Este enlace ya no es válido. Pide uno nuevo a quien te lo envió.</p>
        <PepaFormFooter />
      </div>
    )
  if (view === 'error')
    return (
      <div className="screen grp-screen grp-form-public">
        <p>No se ha podido cargar ahora mismo. Inténtalo de nuevo en un rato.</p>
        <PepaFormFooter />
      </div>
    )
  return <FormFiller view={view} onSubmit={submit} onUpload={upload} onRequestDeletion={requestDeletion} />
}

const isEmpty = (v: AnswerValue | undefined) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

/**
 * El formulario en sí (lo usa la página pública y la vista previa de quien lo organiza, con `preview`: no envía nada).
 * La cabecera destaca a quien SOLICITA los datos, el grupo, la finalidad y el contacto para consultas.
 */
export function FormFiller({
  view,
  preview,
  onSubmit,
  onUpload,
  onRequestDeletion,
}: {
  view: PublicFormView
  preview?: boolean
  onSubmit?: (p: SubmitPayload) => Promise<SubmitResult>
  onUpload?: (fieldId: string, file: File) => Promise<string>
  onRequestDeletion?: (reason: string) => Promise<boolean>
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(view.previous ?? {})
  const [studentName, setStudentName] = useState('')
  const [chosenDate, setChosenDate] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [done, setDone] = useState<{ expires: string | null } | null>(null)
  const [editing, setEditing] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [reason, setReason] = useState('')
  const [deleteSent, setDeleteSent] = useState(false)

  const hasSensitive = view.fields.some((f) => f.sensitive)
  const today = view.retention?.today ?? todayIn(new Date())
  const sensitiveAnswered = view.fields.some((f) => f.sensitive && !isEmpty(answers[f.id]))
  const expires = useMemo(() => (view.retention ? retentionExpiry(view.retention.max, chosenDate || null, today) : null), [view.retention, chosenDate, today])

  const set = (id: string, v: AnswerValue | undefined) =>
    setAnswers((a) => {
      const next = { ...a }
      if (v === undefined) delete next[id]
      else next[id] = v
      return next
    })

  const submit = async () => {
    if (busy || !onSubmit) return
    setMessage(null)
    const local: Record<string, string> = {}
    for (const f of view.fields) if (f.required && isEmpty(answers[f.id]) && !(f.sensitive && view.answered && !editing)) local[f.id] = 'Esta pregunta es obligatoria.'
    if (view.kind === 'general' && studentName.trim().length < 2) local.studentName = 'Escribe el nombre de la persona a la que se refiere.'
    if (sensitiveAnswered && !consent) setMessage('Marca la casilla para confirmar que aceptas cómo se guardan los datos protegidos.')
    if (Object.keys(local).length > 0 || (sensitiveAnswered && !consent)) {
      setErrors(local)
      return
    }
    setBusy(true)
    const r = await onSubmit({ answers, studentName: view.kind === 'general' ? studentName : undefined, retentionDate: chosenDate || null, consent })
    setBusy(false)
    if (r.ok) {
      setErrors({})
      setDone({ expires: r.expires })
      setEditing(false)
    } else {
      setErrors(r.errors ?? {})
      setMessage(r.message ?? (r.errors ? 'Revisa las preguntas marcadas.' : null))
    }
  }

  const upload = async (fieldId: string, files: FileList | null) => {
    if (!files || files.length === 0 || !onUpload) return
    setUploading(fieldId)
    setMessage(null)
    try {
      const paths: string[] = Array.isArray(answers[fieldId]) ? [...(answers[fieldId] as string[])] : []
      for (const file of Array.from(files).slice(0, 5 - paths.length)) paths.push(await onUpload(fieldId, file))
      set(fieldId, paths)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se ha podido subir el archivo.')
    } finally {
      setUploading(null)
    }
  }

  const header = (
    <div className="grp-form-head" data-help-id="grupos.formulario-cabecera">
      <p className="grp-form-requester">
        Solicita los datos: <strong>{view.requesterName}</strong>
      </p>
      <p className="muted grp-sub" style={{ margin: 0 }}>{view.groupName}</p>
      <h2 className="grp-title" style={{ margin: '8px 0 4px' }}>{view.title}</h2>
      {view.personName && <p style={{ margin: '0 0 4px' }}><strong>Para: {view.personName}</strong></p>}
      <p style={{ margin: '4px 0' }}>
        <strong>Para qué se piden:</strong> {view.purpose}
      </p>
      {view.requesterContact && (
        <p className="muted" style={{ margin: '4px 0' }}>
          Para cualquier duda: {view.requesterContact}
        </p>
      )}
      {view.deadline && !view.closed && <p className="muted" style={{ margin: '4px 0' }}>Fecha límite: {formatDate(view.deadline)}</p>}
    </div>
  )

  // ---------------------------------------------------------------------------------------------- confirmación
  if (done || (view.answered && !editing && !preview)) {
    const exp = done ? done.expires : view.agreedExpires
    return (
      <div className="screen grp-screen grp-form-public">
        {header}
        <div className="grp-banner grp-banner-info" role="status" data-help-id="grupos.formulario-confirmacion">
          <strong>¡Gracias! Hemos recibido la respuesta.</strong>
          {view.deadline && !view.closed ? ' Puedes cambiarla hasta la fecha límite.' : ''}
        </div>
        {exp && (
          <div className="grp-card">
            <p style={{ marginTop: 0 }}>
              🔒 Tus datos protegidos se eliminarán de PEPA el <strong>{formatDate(exp)}</strong>.
            </p>
            {view.retentionChangedSinceAnswer && view.retentionMax && (
              <p className="muted">
                Ha cambiado la fecha máxima que fijó {view.requesterName} (ahora {formatDate(view.retentionMax)}). Tu fecha de eliminación no se alarga sin tu permiso: sigue siendo {formatDate(exp)}. Si hiciera falta conservarlos más tiempo, tendría que pedírtelo y tú aceptarlo al volver a enviar la respuesta.
              </p>
            )}
            <p className="muted">
              Se elimina lo que PEPA tiene guardado. Si alguien ya descargó o envió una copia fuera de PEPA, o si el servicio la conserva en una copia de seguridad, no depende de PEPA hasta que esa copia se renueve.
            </p>
            {view.deletion?.status === 'pendiente' || deleteSent ? (
              <p>Has pedido que se eliminen antes. {view.requesterName} lo atenderá y te lo dirá aquí.</p>
            ) : view.deletion?.status === 'conservado' ? (
              <p>
                {view.requesterName} debe conservarlos hasta la fecha indicada por esta razón: «{view.deletion.legalReason}».
              </p>
            ) : view.deletion?.status === 'eliminado' ? (
              <p>Tus datos protegidos ya se han eliminado.</p>
            ) : askDelete ? (
              <>
                <p className="muted">Pedir la eliminación anticipada avisa a {view.requesterName}. Puede haber excepciones legales que obliguen a conservarlos; si es así, te lo explicará.</p>
                <input className="grp-input" placeholder="Motivo (opcional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                <div className="form-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={async () => {
                      if (onRequestDeletion && (await onRequestDeletion(reason))) setDeleteSent(true)
                      else setMessage('No se ha podido enviar la petición. Inténtalo de nuevo.')
                    }}
                  >
                    Pedir que se eliminen ya
                  </button>
                  <button type="button" className="link-button" onClick={() => setAskDelete(false)}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="link-button" data-help-id="grupos.formulario-eliminar" onClick={() => setAskDelete(true)}>
                Pedir que se eliminen antes de esa fecha
              </button>
            )}
          </div>
        )}
        {message && <p className="error">{message}</p>}
        {!view.closed && !preview && (
          <div className="form-actions">
            <button
              type="button"
              className="grp-secondary"
              onClick={() => {
                setDone(null)
                setEditing(true)
              }}
            >
              Cambiar mi respuesta
            </button>
          </div>
        )}
        {view.closed && <p className="muted">Este formulario ya está cerrado.</p>}
        <PepaFormFooter />
      </div>
    )
  }

  if (view.closed && !preview)
    return (
      <div className="screen grp-screen grp-form-public">
        {header}
        <div className="grp-banner">Este formulario ya está cerrado y no admite más respuestas.</div>
        <PepaFormFooter />
      </div>
    )

  // ---------------------------------------------------------------------------------------------- formulario
  return (
    <div className="screen grp-screen grp-form-public">
      {preview && <div className="grp-banner grp-banner-info">Así lo verá quien responda. No se envía nada desde aquí.</div>}
      {header}
      {view.intro && <p style={{ whiteSpace: 'pre-wrap' }}>{view.intro}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        noValidate
      >
        {view.kind === 'general' && (
          <label className="grp-field">
            <span>Nombre de la persona a la que se refiere (obligatorio)</span>
            <input className="grp-input" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="Nombre y apellidos" />
            {errors.studentName && <small className="error">{errors.studentName}</small>}
          </label>
        )}
        {view.fields.map((f) => {
          const v = answers[f.id]
          const err = errors[f.id]
          return (
            <div key={f.id} className="grp-field grp-form-question" data-help-id={f === view.fields[0] ? 'grupos.formulario-pregunta' : undefined}>
              <span>
                {f.label}
                {f.required ? ' *' : ''}
                {f.sensitive ? ' 🔒' : ''}
              </span>
              {f.help && <small className="muted">{f.help}</small>}
              {f.sensitive && <small className="muted">Dato protegido: solo lo ve quien organiza y se elimina en la fecha indicada abajo.</small>}
              {(f.type === 'texto' || f.type === 'email' || f.type === 'telefono' || f.type === 'numero') &&
                (f.type === 'texto' ? (
                  <textarea className="grp-input" aria-label={f.label} rows={2} maxLength={2000} value={(v as string) ?? ''} onChange={(e) => set(f.id, e.target.value || undefined)} />
                ) : (
                  <input
                    className="grp-input"
                    aria-label={f.label}
                    inputMode={f.type === 'telefono' ? 'tel' : f.type === 'email' ? 'email' : 'decimal'}
                    value={v === undefined ? '' : String(v)}
                    onChange={(e) => set(f.id, e.target.value || undefined)}
                  />
                ))}
              {f.type === 'fecha' && <DateField value={(v as string) ?? ''} onChange={(d) => set(f.id, d || undefined)} placeholder="Elige una fecha" />}
              {f.type === 'si_no' && (
                <div className="grp-chips" role="radiogroup" aria-label={f.label}>
                  {[true, false].map((b) => (
                    <button key={String(b)} type="button" role="radio" aria-checked={v === b} className={'chip' + (v === b ? ' chip-active' : '')} onClick={() => set(f.id, b)}>
                      {b ? 'Sí' : 'No'}
                    </button>
                  ))}
                </div>
              )}
              {f.type === 'seleccion' && (
                <div role="radiogroup" aria-label={f.label} style={{ display: 'grid', gap: 4 }}>
                  {f.options.map((o) => (
                    <label key={o} className="grp-check-row">
                      <input type="radio" name={f.id} checked={v === o} onChange={() => set(f.id, o)} />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              )}
              {f.type === 'multiple' && (
                <div style={{ display: 'grid', gap: 4 }}>
                  {f.options.map((o) => {
                    const list = Array.isArray(v) ? v : []
                    return (
                      <label key={o} className="grp-check-row">
                        <input type="checkbox" checked={list.includes(o)} onChange={(e) => set(f.id, e.target.checked ? [...list, o] : list.filter((x) => x !== o))} />
                        <span>{o}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {f.type === 'archivo' && (
                <>
                  <input type="file" accept="application/pdf,image/*" multiple disabled={!!uploading || preview} onChange={(e) => void upload(f.id, e.target.files)} />
                  {uploading === f.id && <small className="muted">Subiendo…</small>}
                  {Array.isArray(v) && v.length > 0 && (
                    <small className="muted">
                      ✓ {v.length} {v.length === 1 ? 'archivo adjunto' : 'archivos adjuntos'}{' '}
                      <button type="button" className="link-button" onClick={() => set(f.id, undefined)}>
                        Quitar
                      </button>
                    </small>
                  )}
                  {view.answered && f.sensitive && isEmpty(v) && <small className="muted">Ya hay un archivo guardado. Si no subes otro, se mantiene.</small>}
                </>
              )}
              {err && <small className="error">{err}</small>}
            </div>
          )
        })}

        {hasSensitive && view.retention && (
          <div className="grp-card" data-help-id="grupos.formulario-conservacion">
            <p style={{ marginTop: 0 }}>
              <strong>🔒 Cuánto tiempo se guardan los datos protegidos</strong>
            </p>
            <p>
              {view.requesterName} puede conservarlos como máximo hasta el <strong>{formatDate(view.retention.max)}</strong>. Si prefieres que se eliminen antes, elige una fecha anterior.
            </p>
            <label className="grp-field">
              <span>Eliminar antes del (opcional)</span>
              <DateField value={chosenDate} onChange={setChosenDate} placeholder="Usar la fecha máxima" min={today} max={view.retention.max} />
            </label>
            {expires && (
              <p>
                Se eliminarán de PEPA el <strong>{formatDate(expires)}</strong>.
              </p>
            )}
            <p className="muted">
              Se eliminan los datos y los archivos guardados en PEPA. Lo que alguien haya descargado o enviado fuera de PEPA no se borra solo, y las copias de seguridad del servicio se renuevan con el tiempo.
            </p>
            <label className="grp-check-row">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>He leído para qué se piden estos datos y acepto que se guarden hasta esa fecha.</span>
            </label>
          </div>
        )}

        {message && <p className="error" role="alert">{message}</p>}
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={busy || preview} data-help-id="grupos.formulario-enviar">
            {busy ? 'Enviando…' : view.answered ? 'Guardar los cambios' : 'Enviar'}
          </button>
        </div>
      </form>
      <PepaFormFooter />
    </div>
  )
}
