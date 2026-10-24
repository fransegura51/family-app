import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  adminAssign,
  adminListTickets,
  adminMarkRead,
  adminOwners,
  adminReply,
  adminSetPriority,
  adminSetStatus,
  adminSimilar,
  adminStats,
  getTicket,
  listAttachments,
  listMessages,
  listTicketEvents,
} from '@/support/data'
import { describeContext } from '@/support/context'
import { KIND_LABEL, PRIORITY_LABEL, STATUS_LABEL_ADMIN, STATUS_ORDER } from '@/support/labels'
import type { SupportAdminRow, SupportAttachment, SupportEvent, SupportMessage, SupportPriority, SupportStats, SupportStatus, SupportTicket } from '@/support/types'
import { supportErrorText, validateMessage } from '@/support/validate'
import { AttachmentLinks } from '@/support/ui/SupportArea'
import { formatDateTime } from '@/domain/dateFormat'
import '@/support/ui/support.css'

// Soporte técnico dentro del Centro de Administración (área «Sistema»): bandeja con filtros, conversación por incidencia, respuesta a la persona, notas internas (que la persona NO
// ve), asignación, estado, prioridad, incidencias parecidas y estadísticas básicas. Es un flujo propio, separado del Buzón de sugerencias. El permiso lo comprueba el servidor
// (profiles.is_app_owner en cada función); aquí no se oculta nada por seguridad, solo por comodidad. Solo se pinta con SUPPORT_ENABLED.
const fmt = (iso: string) => formatDateTime(iso)

export function SupportAdminPanel({ initialTicketId }: { initialTicketId?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialTicketId ?? null)
  const [stats, setStats] = useState<SupportStats | null>(null)
  const [rows, setRows] = useState<SupportAdminRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<SupportStatus | ''>('')
  const [priority, setPriority] = useState<SupportPriority | ''>('')
  const [section, setSection] = useState('')

  const reload = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([adminStats(), adminListTickets({ status: status || null, priority: priority || null, section: section || null })])
      setStats(s)
      setRows(r)
      setError(null)
    } catch (e) {
      setError(supportErrorText(e))
    }
  }, [status, priority, section])
  useEffect(() => {
    void reload()
  }, [reload])

  if (openId) {
    return (
      <TicketDetail
        id={openId}
        onBack={() => {
          setOpenId(null)
          void reload()
        }}
        onOpenOther={setOpenId}
      />
    )
  }

  const sections = stats ? Object.keys(stats.porSeccion) : []
  return (
    <div className="support-area">
      {stats && (
        <div className="support-stats" aria-label="Resumen de Soporte">
          <span className="support-stat">Total: <strong>{stats.total}</strong></span>
          <span className="support-stat">Abiertas: <strong>{stats.abiertas}</strong></span>
          <span className="support-stat">Sin leer: <strong>{stats.sinLeer}</strong></span>
          <span className="support-stat">Últimos 30 días: <strong>{stats.creadas30Dias}</strong></span>
          <span className="support-stat">Primera respuesta: <strong>{stats.horasPrimeraRespuesta == null ? '—' : `${stats.horasPrimeraRespuesta} h`}</strong></span>
        </div>
      )}
      <div className="support-admin-filters">
        <label>
          Estado{' '}
          <select value={status} onChange={(e) => setStatus(e.target.value as SupportStatus | '')}>
            <option value="">Todos</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL_ADMIN[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridad{' '}
          <select value={priority} onChange={(e) => setPriority(e.target.value as SupportPriority | '')}>
            <option value="">Todas</option>
            {(Object.keys(PRIORITY_LABEL) as SupportPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sección{' '}
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Todas</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="help-btn" onClick={() => void reload()}>
          Actualizar
        </button>
      </div>
      {error && (
        <p className="support-error" role="alert">
          {error}
        </p>
      )}
      {rows === null && !error && <p className="muted">Cargando…</p>}
      {rows && rows.length === 0 && <p className="muted">No hay incidencias con estos filtros.</p>}
      {rows && rows.length > 0 && (
        <ul className="support-list">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="support-item" onClick={() => setOpenId(r.id)}>
                <span className="support-item-main">
                  <strong>
                    {r.adminUnread && <span className="support-dot" role="img" aria-label="Sin leer" />} {r.subject}
                  </strong>
                  <span className="muted">
                    {r.requesterName ?? 'Sin nombre'} · {r.familyName ?? 'sin familia'} · {r.section} · {KIND_LABEL[r.kind]} · {fmt(r.lastMessageAt)}
                    {r.assigneeName ? ` · asignada a ${r.assigneeName}` : ''}
                    {r.priority !== 'normal' ? ` · prioridad ${PRIORITY_LABEL[r.priority].toLowerCase()}` : ''}
                  </span>
                </span>
                <span className="support-item-side">
                  <span className={`support-badge support-badge-${r.status}`}>{STATUS_LABEL_ADMIN[r.status]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TicketDetail({ id, onBack, onOpenOther }: { id: string; onBack: () => void; onOpenOther: (id: string) => void }) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportMessage[]>([])
  const [events, setEvents] = useState<SupportEvent[]>([])
  const [attachments, setAttachments] = useState<SupportAttachment[]>([])
  const [owners, setOwners] = useState<Array<{ id: string; name: string }>>([])
  const [similar, setSimilar] = useState<Awaited<ReturnType<typeof adminSimilar>>>([])
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [after, setAfter] = useState<SupportStatus | ''>('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [t, m, ev, at] = await Promise.all([getTicket(id), listMessages(id), listTicketEvents(id), listAttachments(id)])
      if (!t) {
        setError('No he encontrado la incidencia.')
        return
      }
      setTicket(t)
      setMessages(m)
      setEvents(ev)
      setAttachments(at)
      if (t.adminUnread) void adminMarkRead(id).catch(() => undefined)
    } catch (e) {
      setError(supportErrorText(e))
    }
  }, [id])
  useEffect(() => {
    void load()
    adminOwners().then(setOwners).catch(() => setOwners([]))
    adminSimilar(id).then(setSimilar).catch(() => setSimilar([]))
  }, [id, load])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(supportErrorText(e))
    }
    setBusy(false)
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validateMessage(body)
    if (problem) {
      setError(problem)
      return
    }
    await act(async () => {
      await adminReply(id, body, internal, internal ? null : after || null)
      setBody('')
      setInternal(false)
      setAfter('')
    })
  }

  if (!ticket) {
    return (
      <>
        <button type="button" className="help-btn" onClick={onBack}>
          ← Bandeja
        </button>
        {error ? (
          <p className="support-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="muted">Cargando…</p>
        )}
      </>
    )
  }

  const timeline = [
    ...messages.map((m) => ({ at: m.createdAt, kind: 'message' as const, m })),
    ...events.filter((e) => e.event !== 'message').map((ev) => ({ at: ev.createdAt, kind: 'event' as const, ev })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="support-area">
      <button type="button" className="help-btn" onClick={onBack}>
        ← Bandeja
      </button>
      <h3 className="support-title">{ticket.subject}</h3>
      <p className="muted support-small">
        {KIND_LABEL[ticket.kind]} · sección {ticket.section} · enviada el {fmt(ticket.createdAt)}
      </p>
      <div className="support-admin-controls">
        <label>
          Estado{' '}
          <select value={ticket.status} disabled={busy} onChange={(e) => void act(() => adminSetStatus(id, e.target.value as SupportStatus))}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL_ADMIN[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridad{' '}
          <select value={ticket.priority} disabled={busy} onChange={(e) => void act(() => adminSetPriority(id, e.target.value as SupportPriority))}>
            {(Object.keys(PRIORITY_LABEL) as SupportPriority[]).map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsable{' '}
          <select value={ticket.assigneeId ?? ''} disabled={busy} onChange={(e) => void act(() => adminAssign(id, e.target.value || null))}>
            <option value="">Sin asignar</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="support-context">
        <summary>Contexto técnico que envió la persona</summary>
        <ul>
          {describeContext(ticket.context).map((c) => (
            <li key={c.key}>
              {c.label}: <strong>{c.value}</strong>
            </li>
          ))}
        </ul>
      </details>
      {similar.length > 0 && (
        <details className="support-context">
          <summary>Incidencias parecidas ({similar.length})</summary>
          <ul>
            {similar.map((s) => (
              <li key={s.id}>
                <button type="button" className="link-button" onClick={() => onOpenOther(s.id)}>
                  {s.subject}
                </button>{' '}
                <span className="muted">
                  ({STATUS_LABEL_ADMIN[s.status]}, {s.section}, {fmt(s.createdAt)})
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p className="support-error" role="alert">
          {error}
        </p>
      )}
      <ol className="support-thread" aria-label="Conversación">
        {timeline.map((row) =>
          row.kind === 'event' ? (
            <li key={`e-${row.ev.id}`} className="support-event">
              {row.ev.event}
              {row.ev.fromValue || row.ev.toValue ? `: ${row.ev.fromValue ?? ''} → ${row.ev.toValue ?? ''}` : ''}
              {row.ev.visibleToUser ? '' : ' (interno)'} · {fmt(row.at)}
            </li>
          ) : (
            <li key={`m-${row.m.id}`} className={`support-msg support-msg-${row.m.visibility === 'internal' ? 'internal' : row.m.authorKind}`}>
              <p className="support-msg-head">
                {row.m.visibility === 'internal' ? '🔒 Nota interna (la persona no la ve)' : row.m.authorKind === 'user' ? 'La persona' : row.m.authorKind === 'ai' ? 'Agente IA' : 'Equipo de PEPA'} · {fmt(row.at)}
              </p>
              <p className="support-msg-body">{row.m.body}</p>
              <AttachmentLinks items={attachments.filter((a) => a.messageId === row.m.id)} />
            </li>
          ),
        )}
      </ol>
      <form className="support-form" onSubmit={send}>
        <label htmlFor="sup-admin-reply">{internal ? 'Nota interna' : 'Respuesta a la persona'}</label>
        <textarea id="sup-admin-reply" rows={4} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
        <label className="support-check">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} disabled={busy} /> Es una nota interna (la persona no la verá ni recibirá aviso)
        </label>
        {!internal && (
          <label>
            Después de enviar{' '}
            <select value={after} onChange={(e) => setAfter(e.target.value as SupportStatus | '')} disabled={busy}>
              <option value="">Dejar el estado como está</option>
              <option value="esperando_usuario">Esperando a la persona</option>
              <option value="resuelta">Marcar como resuelta</option>
              <option value="en_revision">En revisión</option>
            </select>
          </label>
        )}
        <div className="help-actions">
          <button type="submit" className="help-btn help-btn-primary" disabled={busy || !body.trim()}>
            {internal ? 'Guardar nota' : 'Enviar respuesta'}
          </button>
        </div>
      </form>
    </div>
  )
}
