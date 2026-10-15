import { useCallback, useState } from 'react'
import { adminListProposals, getPoll } from '@/data/community'
import {
  ADMIN_TEXT,
  buildPollRows,
  formatMadrid,
  pollPhaseText,
  pollResultLines,
  toProposals,
  type AdminTabId,
  type PollRow,
} from '@/domain/communityAdmin'
import type { PollView } from '@/domain/community'
import { paths } from '@/ui/community/communityNav'
import { Link } from 'react-router-dom'
import { AdminEmpty, AdminError, AdminLoading, InfoBox } from '@/ui/community/admin/AdminShared'
import { useAdminAction, useAdminData } from '@/ui/community/admin/useAdminData'

const VISIBLE_STEP = 10

// Encuestas aprobadas, abiertas y cerradas. Las horas se calculan siempre en hora peninsular española (Europe/Madrid, con el cambio de hora).
// Dos consultas al abrir (aprobadas y publicadas); los resultados de cada encuesta cerrada se piden SOLO si se pulsa «Ver resultados».
export function PollsTab({ onGo }: { onGo: (tab: AdminTabId) => void }) {
  const loader = useCallback(async () => {
    const [approved, published] = await Promise.all([adminListProposals('approved'), adminListProposals('published')])
    return buildPollRows([...toProposals(approved), ...toProposals(published)], new Date())
  }, [])
  const { data, loading, error, reload } = useAdminData(loader)
  const [visible, setVisible] = useState(VISIBLE_STEP)

  return (
    <div className="cadm-stack">
      <InfoBox>{ADMIN_TEXT.pollSchedule}</InfoBox>
      <p className="muted cadm-small">
        Las encuestas que Pepa propone y aún no están aprobadas se revisan en{' '}
        <button type="button" className="link-button cadm-linkbtn cadm-inline" onClick={() => onGo('oficial')}>
          Contenido oficial
        </button>
        . Sin aprobación no se publica ninguna.
      </p>
      {loading && <AdminLoading label="Cargando encuestas…" />}
      {error && <AdminError message={error} onRetry={reload} />}
      {!loading && !error && data && data.length === 0 && <AdminEmpty>Todavía no hay encuestas aprobadas ni publicadas.</AdminEmpty>}
      {!loading && data && (
        <>
          <ul className="cadm-list">
            {data.slice(0, visible).map((p) => (
              <li key={p.id}>
                <PollCard poll={p} />
              </li>
            ))}
          </ul>
          {data.length > visible && (
            <button type="button" className="cadm-btn cadm-btn-secondary" onClick={() => setVisible((v) => v + VISIBLE_STEP)}>
              Ver encuestas anteriores
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function PollCard({ poll }: { poll: PollRow }) {
  const [view, setView] = useState<PollView | null | undefined>(undefined)
  const action = useAdminAction()
  const canSeeResults = poll.phase === 'closed' && poll.publishedPostId !== null
  const postId = poll.publishedPostId

  return (
    <article className="cadm-card" aria-label={`Encuesta: ${poll.title}`}>
      <header className="cadm-card-head">
        <h4>{poll.title}</h4>
        <span className={`cadm-chip ${poll.phase === 'open' ? 'cadm-chip-ok' : ''}`}>{pollPhaseText(poll.phase)}</span>
      </header>
      <dl className="cadm-dates">
        <div>
          <dt>Abre</dt>
          <dd>{poll.opensAt ? formatMadrid(poll.opensAt, 'full') : 'sin fecha'}</dd>
        </div>
        <div>
          <dt>Cierra</dt>
          <dd>{poll.closesAt ? formatMadrid(poll.closesAt, 'full') : 'sin fecha'}</dd>
        </div>
      </dl>
      <p className="muted cadm-small">Hora peninsular española.</p>
      {poll.options.length > 0 && (
        <ol className="cadm-options" aria-label="Opciones">
          {poll.options.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ol>
      )}
      {poll.phase === 'open' && <p className="muted cadm-small">Los resultados finales se verán cuando cierre.</p>}
      {postId && (
        <Link className="link-button cadm-linkbtn" to={paths.post(postId)}>
          Ver la publicación
        </Link>
      )}

      {canSeeResults && view === undefined && (
        <>
          {action.error && (
            <p className="error cadm-small" role="alert">
              {action.error}
            </p>
          )}
          <button
            type="button"
            className="cadm-btn cadm-btn-secondary"
            disabled={action.busy}
            onClick={() => {
              void (async () => {
                if (!postId) return
                const r = await action.run(() => getPoll(postId))
                if (r.ok) setView(r.result)
              })()
            }}
          >
            {action.busy ? 'Cargando…' : 'Ver resultados finales'}
          </button>
        </>
      )}
      {view === null && <p className="muted cadm-small">No se pueden mostrar los resultados (la publicación ya no está disponible).</p>}
      {view && <PollResults view={view} />}
    </article>
  )
}

function PollResults({ view }: { view: PollView }) {
  const lines = pollResultLines(view.options, view.counts, view.totalVotes)
  return (
    <div className="cadm-results">
      <h5>Resultados finales · {view.totalVotes ?? 0} votos</h5>
      <ul className="cadm-bars">
        {lines.map((l, i) => (
          <li key={i}>
            <span className="cadm-bar-label">
              {l.option} · {l.votes} ({l.percent} %)
            </span>
            <span className="cadm-bar" aria-hidden="true">
              <span style={{ width: `${l.percent}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="muted cadm-small">Las encuestas de PEPA no son una muestra representativa de la población: solo reflejan a quienes votan aquí.</p>
    </div>
  )
}
