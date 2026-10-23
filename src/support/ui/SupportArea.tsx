import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SUPPORT_ENABLED } from '@/support/flags'
import { HELP_MODULE_BY_ID } from '@/help/catalog'
import type { HelpModuleId } from '@/help/types'
import { collectSupportContext, describeContext } from '@/support/context'
import { attachFiles, attachmentUrl, confirmResolution, createTicket, firstMessageId, getTicket, listAttachments, listMessages, listMyTickets, listTicketEvents, markTicketRead, postMessage } from '@/support/data'
import { isOpenStatus, KIND_LABEL, STATUS_HINT, STATUS_LABEL } from '@/support/labels'
import type { SupportAttachment, SupportEvent, SupportKind, SupportMessage, SupportTicket } from '@/support/types'
import { ATTACH_MAX_PER_MESSAGE, KINDS, supportErrorText, validateAttachment, validateMessage, validateTicketDraft } from '@/support/validate'
import { formatDateTime } from '@/domain/dateFormat'
import '@/support/ui/support.css'

// Soporte técnico de «Pepa te acompaña» — lado de la persona usuaria. Una incidencia = una conversación propia (no es el Buzón de sugerencias): solo la ve la persona que la creó y la
// administración de PEPA. Nada se envía hasta pulsar «Enviar incidencia»; el contexto técnico que viaja se enseña antes, y los adjuntos se revisan antes de enviar.
// Mientras SUPPORT_ENABLED sea false este componente no se pinta (la pestaña ni se ofrece).
const fmt = (iso: string) => formatDateTime(iso)

type View = { name: 'list' } | { name: 'new' } | { name: 'thread'; id: string }

export function SupportArea(props: { openTicketId?: string | null; moduleId?: HelpModuleId | null }) {
  if (!SUPPORT_ENABLED) return null
  return <SupportAreaInner {...props} />
}

function SupportAreaInner({ openTicketId, moduleId }: { openTicketId?: string | null; moduleId?: HelpModuleId | null }) {
  // Los avisos de Soporte llevan a /ayuda?soporte=<incidencia>: se abre directamente esa conversación.
  const [params] = useSearchParams()
  const wanted = openTicketId ?? params.get('soporte')
  const [view, setView] = useState<View>(wanted ? { name: 'thread', id: wanted } : { name: 'list' })
  useEffect(() => {
    if (wanted) setView({ name: 'thread', id: wanted })
  }, [wanted])
  return (
    <section className="support-area" aria-label="Soporte técnico">
      {view.name === 'list' && <TicketList onNew={() => setView({ name: 'new' })} onOpen={(id) => setView({ name: 'thread', id })} />}
      {view.name === 'new' && <NewTicket moduleId={moduleId ?? null} onCancel={() => setView({ name: 'list' })} onCreated={(id) => setView({ name: 'thread', id })} />}
      {view.name === 'thread' && <Thread id={view.id} onBack={() => setView({ name: 'list' })} />}
    </section>
  )
}

function StatusBadge({ status }: { status: SupportTicket['status'] }) {
  return <span className={`support-badge support-badge-${status}`}>{STATUS_LABEL[status]}</span>
}

function TicketList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    listMyTickets()
      .then((t) => alive && setTickets(t))
      .catch((e) => alive && setError(supportErrorText(e)))
    return () => {
      alive = false
    }
  }, [])
  return (
    <>
      <p className="support-intro">
        <strong>Soporte técnico.</strong> Si algo no funciona o PEPA ha dado un resultado incorrecto, cuéntanoslo aquí. Una persona del equipo de PEPA lo revisa y te contesta en esta misma conversación. Tus incidencias solo las veis tú y
        el equipo de PEPA.
      </p>
      <div className="help-actions">
        <button type="button" className="help-btn help-btn-primary" onClick={onNew}>
          Nueva incidencia
        </button>
      </div>
      {error && (
        <p className="support-error" role="alert">
          {error}
        </p>
      )}
      {tickets === null && !error && <p className="muted">Cargando tus incidencias…</p>}
      {tickets && tickets.length === 0 && <p className="muted">Todavía no has enviado ninguna incidencia.</p>}
      {tickets && tickets.length > 0 && (
        <ul className="support-list">
          {tickets.map((t) => (
            <li key={t.id}>
              <button type="button" className="support-item" onClick={() => onOpen(t.id)}>
                <span className="support-item-main">
                  <strong>{t.subject}</strong>
                  <span className="muted">
                    {KIND_LABEL[t.kind]} · {fmt(t.lastMessageAt)}
                  </span>
                </span>
                <span className="support-item-side">
                  {t.userUnread && <span className="support-dot" role="img" aria-label="Respuesta nueva" />}
                  <StatusBadge status={t.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function FilePicker({ files, onChange, disabled }: { files: File[]; onChange: (f: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const add = (list: FileList | null) => {
    if (!list) return
    const next = [...files]
    let msg: string | null = null
    for (const f of Array.from(list)) {
      if (next.length >= ATTACH_MAX_PER_MESSAGE) {
        msg = `Puedes adjuntar hasta ${ATTACH_MAX_PER_MESSAGE} archivos por mensaje.`
        break
      }
      const bad = validateAttachment(f)
      if (bad) {
        msg = bad
        continue
      }
      next.push(f)
    }
    setProblem(msg)
    onChange(next)
    if (inputRef.current) inputRef.current.value = ''
  }
  return (
    <div className="support-files">
      <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,text/plain" onChange={(e) => add(e.target.files)} hidden aria-label="Elegir archivos para adjuntar" />
      <button type="button" className="help-btn" onClick={() => inputRef.current?.click()} disabled={disabled || files.length >= ATTACH_MAX_PER_MESSAGE}>
        📎 Adjuntar una captura o un PDF
      </button>
      <p className="muted support-small">Hasta {ATTACH_MAX_PER_MESSAGE} archivos de 5 MB (fotos, PDF o texto). Revisa que no salgan datos que no quieras compartir: solo los verá el equipo de PEPA.</p>
      {problem && (
        <p className="support-error" role="alert">
          {problem}
        </p>
      )}
      {files.length > 0 && (
        <ul className="support-file-list" aria-label="Archivos que se van a adjuntar">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span>
                {f.name} <span className="muted">({Math.max(1, Math.round(f.size / 1024))} KB)</span>
              </span>
              <button type="button" className="help-icon-btn" aria-label={`Quitar ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} disabled={disabled}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewTicket({ moduleId, onCancel, onCreated }: { moduleId: HelpModuleId | null; onCancel: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<SupportKind>('tecnico')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const section = moduleId && HELP_MODULE_BY_ID.has(moduleId) ? moduleId : 'otra'
  const context = collectSupportContext(section)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validateTicketDraft({ subject, body })
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const id = await createTicket({ kind, section, subject, body, context })
      if (files.length > 0) {
        const [ticket, messageId] = await Promise.all([getTicket(id), firstMessageId(id)])
        if (ticket && messageId) await attachFiles(ticket, messageId, files) // si algún adjunto falla, la incidencia ya está enviada: se podrá volver a adjuntar en la conversación
      }
      onCreated(id)
    } catch (err) {
      setError(supportErrorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="support-form" onSubmit={submit}>
      <h3>Nueva incidencia</h3>
      <label htmlFor="sup-kind">¿Qué te pasa?</label>
      <select id="sup-kind" value={kind} onChange={(e) => setKind(e.target.value as SupportKind)} disabled={busy}>
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <label htmlFor="sup-subject">Título corto</label>
      <input id="sup-subject" value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} placeholder="Por ejemplo: el ticket no lee bien los precios" disabled={busy} />
      <label htmlFor="sup-body">Cuéntanos qué ha pasado</label>
      <textarea id="sup-body" value={body} maxLength={4000} rows={5} onChange={(e) => setBody(e.target.value)} placeholder="Qué estabas haciendo, qué esperabas y qué ha pasado en su lugar." disabled={busy} />
      <FilePicker files={files} onChange={setFiles} disabled={busy} />
      <details className="support-context">
        <summary>Qué datos técnicos se envían</summary>
        <p className="muted support-small">
          Solo esto, para que podamos reproducir el problema. No enviamos tu correo, tu nombre, contenido de tus pantallas ni tu ubicación; tampoco lo que escribas fuera de este formulario.
        </p>
        <ul>
          {describeContext(context).map((c) => (
            <li key={c.key}>
              {c.label}: <strong>{c.value}</strong>
            </li>
          ))}
        </ul>
      </details>
      {error && (
        <p className="support-error" role="alert">
          {error}
        </p>
      )}
      <div className="help-actions">
        <button type="submit" className="help-btn help-btn-primary" disabled={busy}>
          {busy ? 'Enviando…' : 'Enviar incidencia'}
        </button>
        <button type="button" className="help-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

const EVENT_TEXT: Record<string, (e: SupportEvent) => string | null> = {
  created: () => 'Incidencia recibida',
  status_changed: (e) => `Estado: ${e.toValue ? (STATUS_LABEL as Record<string, string>)[e.toValue] ?? e.toValue : ''}`,
  reopened: () => 'Incidencia reabierta',
  resolution_confirmed: () => 'Confirmaste que estaba resuelta',
  resolution_denied: () => 'Dijiste que seguía el problema',
  attachment_added: () => 'Adjunto añadido',
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [events, setEvents] = useState<SupportEvent[]>([])
  const [attachments, setAttachments] = useState<SupportAttachment[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [t, m, ev, at] = await Promise.all([getTicket(id), listMessages(id), listTicketEvents(id), listAttachments(id)])
      if (!t) {
        setLoadError('No he encontrado esa incidencia.')
        return
      }
      setTicket(t)
      setMessages(m)
      setEvents(ev)
      setAttachments(at)
      if (t.userUnread) void markTicketRead(id).catch(() => undefined)
    } catch (e) {
      setLoadError(supportErrorText(e))
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validateMessage(reply)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const messageId = await postMessage(id, reply)
      if (files.length > 0 && ticket) {
        const { failed } = await attachFiles(ticket, messageId, files)
        if (failed.length > 0) setNotice(`El mensaje se ha enviado, pero no se han podido adjuntar: ${failed.map((f) => f.name).join(', ')}.`)
      }
      setReply('')
      setFiles([])
      await load()
    } catch (err) {
      setError(supportErrorText(err))
    }
    setBusy(false)
  }

  const confirm = async (resolved: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await confirmResolution(id, resolved)
      await load()
    } catch (err) {
      setError(supportErrorText(err))
    }
    setBusy(false)
  }

  if (loadError) {
    return (
      <>
        <button type="button" className="help-btn" onClick={onBack}>
          ← Mis incidencias
        </button>
        <p className="support-error" role="alert">
          {loadError}
        </p>
      </>
    )
  }
  if (!ticket) return <p className="muted">Cargando la incidencia…</p>

  const visibleEvents = events.filter((e) => e.visibleToUser && e.event !== 'message' && EVENT_TEXT[e.event])
  const timeline = [
    ...messages.map((m) => ({ at: m.createdAt, kind: 'message' as const, m })),
    ...visibleEvents.map((ev) => ({ at: ev.createdAt, kind: 'event' as const, ev })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <>
      <button type="button" className="help-btn" onClick={onBack}>
        ← Mis incidencias
      </button>
      <h3 className="support-title">{ticket.subject}</h3>
      <p className="support-meta">
        <StatusBadge status={ticket.status} /> <span className="muted">{KIND_LABEL[ticket.kind]} · enviada el {fmt(ticket.createdAt)}</span>
      </p>
      <p className="muted support-small">{STATUS_HINT[ticket.status]}</p>

      <ol className="support-thread" aria-label="Conversación de la incidencia">
        {timeline.map((row) =>
          row.kind === 'event' ? (
            <li key={`e-${row.ev.id}`} className="support-event">
              {EVENT_TEXT[row.ev.event](row.ev)} · {fmt(row.at)}
            </li>
          ) : (
            <li key={`m-${row.m.id}`} className={`support-msg support-msg-${row.m.authorKind}`}>
              <p className="support-msg-head">
                {row.m.authorKind === 'user' ? 'Tú' : row.m.authorKind === 'admin' ? 'Equipo de PEPA' : row.m.authorKind === 'ai' ? 'Asistente de PEPA (IA)' : 'PEPA'} · {fmt(row.at)}
              </p>
              <p className="support-msg-body">{row.m.body}</p>
              <AttachmentLinks items={attachments.filter((a) => a.messageId === row.m.id)} />
            </li>
          ),
        )}
      </ol>

      {ticket.status === 'resuelta' && (
        <div className="support-confirm" role="group" aria-label="¿Está resuelto?">
          <p>
            <strong>¿Se ha resuelto tu problema?</strong>
          </p>
          <div className="help-actions">
            <button type="button" className="help-btn help-btn-primary" onClick={() => confirm(true)} disabled={busy}>
              Sí, está resuelto
            </button>
            <button type="button" className="help-btn" onClick={() => confirm(false)} disabled={busy}>
              No, sigue el problema
            </button>
          </div>
        </div>
      )}

      {notice && <p className="help-note">{notice}</p>}
      {error && (
        <p className="support-error" role="alert">
          {error}
        </p>
      )}
      <form className="support-form" onSubmit={send}>
        <label htmlFor="sup-reply">{isOpenStatus(ticket.status) ? 'Tu respuesta' : 'Escribir de nuevo en esta incidencia'}</label>
        <textarea id="sup-reply" rows={3} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} disabled={busy} />
        <FilePicker files={files} onChange={setFiles} disabled={busy} />
        <div className="help-actions">
          <button type="submit" className="help-btn help-btn-primary" disabled={busy || !reply.trim()}>
            {busy ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </>
  )
}

export function AttachmentLinks({ items }: { items: SupportAttachment[] }) {
  const [error, setError] = useState<string | null>(null)
  if (items.length === 0) return null
  const open = async (a: SupportAttachment) => {
    setError(null)
    try {
      window.open(await attachmentUrl(a.storagePath), '_blank', 'noopener')
    } catch {
      setError('No se ha podido abrir el adjunto.')
    }
  }
  return (
    <div className="support-attachments">
      {items.map((a) => (
        <button key={a.id} type="button" className="help-chip" onClick={() => open(a)}>
          📎 {a.fileName}
        </button>
      ))}
      {error && <span className="support-error">{error}</span>}
    </div>
  )
}
