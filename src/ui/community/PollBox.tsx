import { useEffect, useState } from 'react'
import { getPoll, votePoll } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import type { PollView } from '@/domain/community'
import { pollPercents, pollPhase, pollTimeMessage, POLL_NOT_REPRESENTATIVE_NOTE } from '@/domain/communityPost'
import { useCommunity } from '@/ui/community/CommunityProvider'
import '@/ui/community/communityPost.css'

// Encuesta oficial semanal (publicación de tipo «encuesta»). Reglas aprobadas: un voto por persona y anónimo; ANTES de votar los resultados están ocultos; tras
// votar se ven resultados provisionales; al cerrar (domingo 17:00, hora de Madrid) los finales son para todo el mundo. Las horas se enseñan en hora de Madrid.

// Parte visual (sin red): se puede pintar y probar sin servidor.
export function PollBoxView({
  poll,
  canVote,
  selected,
  voting,
  error,
  nowMs,
  onSelect,
  onVote,
}: {
  poll: PollView
  canVote: boolean
  selected: number | null
  voting: boolean
  error: string | null
  nowMs?: number
  onSelect: (i: number) => void
  onVote: () => void
}) {
  const phase = pollPhase(poll, nowMs)
  const voted = poll.myVote !== null && poll.myVote !== undefined
  const showResults = poll.resultsVisible && poll.counts !== null
  const percents = showResults ? pollPercents(poll.counts, poll.totalVotes) : []

  return (
    <section className="community-poll card" aria-label="Encuesta oficial">
      <p className="community-poll-when" role="status">
        {pollTimeMessage(poll, nowMs)}
      </p>
      <h2 className="community-poll-question">{poll.question}</h2>

      {showResults ? (
        <>
          <p className="muted">
            {phase === 'closed' ? 'Resultados finales.' : 'Resultados provisionales: pueden cambiar hasta que se cierre la encuesta.'}
            {poll.totalVotes !== null ? ` ${poll.totalVotes} ${poll.totalVotes === 1 ? 'voto' : 'votos'}.` : ''}
          </p>
          <ul className="community-poll-results">
            {poll.options.map((o, i) => (
              <li key={i} className={poll.myVote === i ? 'mine' : undefined}>
                <div className="community-poll-row">
                  <span>
                    {o}
                    {poll.myVote === i ? ' (tu voto)' : ''}
                  </span>
                  <strong>{percents[i] ?? 0} %</strong>
                </div>
                <div className="community-poll-bar" role="img" aria-label={`${o}: ${percents[i] ?? 0} %`}>
                  <span style={{ width: `${percents[i] ?? 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : phase === 'open' && canVote && !voted ? (
        <>
          <fieldset className="community-poll-options">
            <legend>Elige una opción</legend>
            {poll.options.map((o, i) => (
              <label key={i} className="checkbox-label community-poll-option">
                <input type="radio" name="poll-option" checked={selected === i} onChange={() => onSelect(i)} />
                <span>{o}</span>
              </label>
            ))}
          </fieldset>
          <p className="muted">Los resultados se verán cuando votes. Tu voto es anónimo y solo puedes votar una vez.</p>
          <button type="button" className="primary" disabled={selected === null || voting} onClick={onVote}>
            {voting ? 'Votando…' : 'Votar'}
          </button>
        </>
      ) : (
        <ul className="community-poll-plain">
          {poll.options.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="muted community-poll-note">{POLL_NOT_REPRESENTATIVE_NOTE}</p>
    </section>
  )
}

export function PollBox({ postId, canInteract }: { postId: string; canInteract: boolean }) {
  const { requireParticipation } = useCommunity()
  const [poll, setPoll] = useState<PollView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [voting, setVoting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getPoll(postId)
      .then((p) => {
        if (!cancelled) setPoll(p)
      })
      .catch((e) => {
        if (!cancelled) setError(communityErrorText(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [postId])

  async function vote() {
    if (selected === null || voting) return
    if (!(await requireParticipation())) return
    setVoting(true)
    setError(null)
    try {
      setPoll(await votePoll(postId, selected))
    } catch (e) {
      setError(communityErrorText(e))
      // Si ya había votado (otro dispositivo), se vuelve a leer para enseñar los resultados que le tocan.
      try {
        setPoll(await getPoll(postId))
      } catch {
        // Sin red: se queda el aviso de error.
      }
    } finally {
      setVoting(false)
    }
  }

  if (loading) return <p className="muted">Cargando la encuesta…</p>
  if (!poll) {
    return error ? (
      <p className="error" role="alert">
        {error}
      </p>
    ) : null
  }
  return <PollBoxView poll={poll} canVote={canInteract} selected={selected} voting={voting} error={error} onSelect={setSelected} onVote={() => void vote()} />
}
