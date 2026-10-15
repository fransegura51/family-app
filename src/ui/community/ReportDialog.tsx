import { useEffect, useState } from 'react'
import { reportContent } from '@/data/community'
import { visitorReport } from '@/data/communityReports'
import { communityErrorText } from '@/domain/communityErrors'
import { REPORT_REASONS } from '@/domain/community'
import {
  REPORT_ALREADY_TEXT,
  REPORT_DETAIL_MAX,
  REPORT_DONE_TEXT,
  REPORT_INTRO_TEXT,
  REPORT_TARGET_TEXT,
  type ReportChannel,
  type ReportableType,
} from '@/domain/communityReports'
import '@/ui/community/communityPost.css'

export interface ReportResult {
  alreadyReported: boolean
  // true = el servidor ocultó el contenido a la vez (solo ocurre con el camino de miembro y varias denuncias graves): hay que quitarlo de la pantalla.
  hidden: boolean
}

// Denunciar una publicación, un comentario o una reseña: motivo (obligatorio) y detalle (opcional). Una denuncia por sí sola NO elimina nada: la revisa la
// administración. No se cuenta nunca si el contenido se ha ocultado ni a quién ha denunciado (privacidad de todas las partes).
// `channel` elige a qué función del servidor se llama (ver domain/communityReports.ts); casi siempre se usa a través de `ReportContentDialog`, que lo decide.
export function ReportDialog({
  type,
  id,
  onClose,
  channel = 'member',
  onReported,
}: {
  type: ReportableType
  id: string
  onClose: () => void
  channel?: ReportChannel
  onReported?: (result: ReportResult) => void
}) {
  const [reason, setReason] = useState<string>('')
  const [detail, setDetail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send() {
    if (!reason || sending) return
    setSending(true)
    setError(null)
    try {
      const text = detail.trim() || null
      let result: ReportResult
      if (channel === 'visitor') {
        const r = await visitorReport(type, id, reason, text)
        result = { alreadyReported: r.alreadyReported === true, hidden: false }
      } else {
        const r = await reportContent(type, id, reason, text)
        result = { alreadyReported: r.alreadyReported === true, hidden: r.hidden === true }
      }
      setDone(result.alreadyReported ? REPORT_ALREADY_TEXT : REPORT_DONE_TEXT)
      onReported?.(result)
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setSending(false)
    }
  }

  const what = REPORT_TARGET_TEXT[type]

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-sheet community-report" role="dialog" aria-modal="true" aria-label={`Denunciar ${what}`} onClick={(e) => e.stopPropagation()}>
        <h2>Denunciar {what}</h2>
        {done ? (
          <>
            <p role="status">{done}</p>
            <div className="modal-actions">
              <button type="button" className="primary" autoFocus onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">{REPORT_INTRO_TEXT}</p>
            <fieldset className="community-report-reasons">
              <legend>Motivo</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.id} className="checkbox-label community-report-reason">
                  <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                  <span>{r.label}</span>
                </label>
              ))}
            </fieldset>
            <label>
              Detalle (opcional)
              <textarea value={detail} maxLength={REPORT_DETAIL_MAX} rows={3} onChange={(e) => setDetail(e.target.value)} placeholder="Si quieres, explícalo con tus palabras" />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions community-report-actions">
              <button type="button" className="primary" disabled={!reason || sending} onClick={() => void send()}>
                {sending ? 'Enviando…' : 'Enviar denuncia'}
              </button>
              <button type="button" className="link-button" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
