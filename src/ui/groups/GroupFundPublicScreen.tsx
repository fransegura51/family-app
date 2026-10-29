import { useEffect, useState } from 'react'
import { fmtEuro } from '@/domain/groupFunds'
import '@/ui/groups/groups.css'

// Página pública de consulta de un bote (enlace «/?bote=TOKEN»). Sin cuenta PEPA ni sesión. Solo enseña lo que la función de servidor decide que es público.
interface GeneralView {
  kind: 'general'
  fundName: string
  groupName: string
  closed: boolean
  expected: number
  collected: number
  pending: number
  paidCount: number
  totalCount: number
}
interface PersonView {
  kind: 'participante'
  fundName: string
  groupName: string
  participantName: string
  contributionType: 'igual' | 'variable' | 'voluntaria'
  closed: boolean
  state: 'participa' | 'no_participa' | 'exento'
  status: string
  required: number
  paid: number
  pending: number
  canNotify: boolean
}

function functionsUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/group-fund-public`
}

export function GroupFundPublicScreen({ token }: { token: string }) {
  const [view, setView] = useState<GeneralView | PersonView | 'not_found' | 'error' | null>(null)
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${functionsUrl()}?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 404) return setView('not_found')
        if (!res.ok) return setView('error')
        setView((await res.json()) as GeneralView | PersonView)
      })
      .catch(() => setView('error'))
  }, [token])

  const notify = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`${functionsUrl()}?token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'paid', note }) })
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean }
      if (body.ok) setSent(true)
      else setProblem('No se ha podido enviar el aviso. Inténtalo de nuevo en un rato.')
    } catch {
      setProblem('No se ha podido enviar el aviso. Comprueba tu conexión.')
    } finally {
      setBusy(false)
    }
  }

  if (view === null) return <div className="screen screen-centered">Cargando…</div>
  if (view === 'not_found')
    return (
      <div className="screen screen-centered">
        <p>Este enlace ya no es válido. Pide uno nuevo a quien lleva el bote.</p>
      </div>
    )
  if (view === 'error')
    return (
      <div className="screen screen-centered">
        <p>No se ha podido cargar ahora mismo. Inténtalo de nuevo en un rato.</p>
      </div>
    )

  if (view.kind === 'general') {
    const pct = view.expected > 0 ? Math.min(100, Math.round((view.collected / view.expected) * 100)) : 0
    return (
      <div className="screen grp-screen">
        <h2 className="grp-title">{view.fundName}</h2>
        <p className="muted grp-sub">
          {view.groupName}
          {view.closed ? ' · bote cerrado' : ''}
        </p>
        <div className="grp-stats">
          <div className="grp-stat">
            <strong>{fmtEuro(view.expected)}</strong>
            <span>Previsto</span>
          </div>
          <div className="grp-stat">
            <strong>{fmtEuro(view.collected)}</strong>
            <span>Recaudado</span>
          </div>
          <div className="grp-stat">
            <strong>{fmtEuro(view.pending)}</strong>
            <span>Pendiente</span>
          </div>
          <div className="grp-stat">
            <strong>
              {view.paidCount} de {view.totalCount}
            </strong>
            <span>Han pagado</span>
          </div>
        </div>
        <div className="grp-bar" aria-label={`Recaudado ${pct} %`}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <p className="muted">Información general de la recaudación. No incluye datos personales.</p>
      </div>
    )
  }

  return (
    <div className="screen grp-screen">
      <h2 className="grp-title">{view.fundName}</h2>
      <p className="muted grp-sub">
        {view.groupName}
        {view.closed ? ' · bote cerrado' : ''}
      </p>
      <div className="grp-card">
        <p style={{ marginTop: 0 }}>
          <strong>{view.participantName}</strong>
        </p>
        {view.state === 'no_participa' && <p>No participa en este bote.</p>}
        {view.state === 'exento' && <p>Exento: no tiene que aportar nada a este bote.</p>}
        {view.state === 'participa' && view.contributionType !== 'voluntaria' && (
          <>
            <p>
              Se pide: <strong>{fmtEuro(view.required)}</strong> · Pagado: <strong>{fmtEuro(view.paid)}</strong>
            </p>
            <p>
              {view.pending > 0 ? (
                <>
                  Falta por pagar: <strong>{fmtEuro(view.pending)}</strong>
                </>
              ) : (
                '✅ Está todo pagado. ¡Gracias!'
              )}
            </p>
          </>
        )}
        {view.state === 'participa' && view.contributionType === 'voluntaria' && (
          <p>
            Aportado hasta ahora: <strong>{fmtEuro(view.paid)}</strong>
          </p>
        )}
      </div>
      {view.canNotify && !sent && (
        <div className="grp-card">
          <p style={{ marginTop: 0 }}>¿Ya has pagado? Avisa a quien lleva el bote. Él lo comprobará: el aviso no marca el pago como recibido.</p>
          <input className="grp-input" placeholder="Nota (opcional): por ejemplo, «Bizum de ayer»" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          {problem && <p className="error">{problem}</p>}
          <div className="form-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void notify()}>
              Ya he pagado
            </button>
          </div>
        </div>
      )}
      {sent && <div className="grp-banner grp-banner-info">¡Gracias! Se lo hemos avisado a quien lleva el bote. Lo comprobará y lo marcará como pagado.</div>}
    </div>
  )
}
