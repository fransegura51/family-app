import { useEffect, useState } from 'react'
import { reportContent } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { REPORT_REASONS } from '@/domain/community'
import '@/ui/community/communityPost.css'

// Denunciar una publicación o un comentario: motivo (obligatorio) y detalle (opcional). Una denuncia por sí sola NO elimina nada: la revisa la administración.
// No se cuenta nunca si el contenido se ha ocultado ni a quién ha denunciado (privacidad de todas las partes).
export function ReportDialog({ type, id, onClose }: { type: 'post' | 'comment'; id: string; onClose: () => void }) {
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
      const r = await reportContent(type, id, reason, detail.trim() || null)
      setDone(r.alreadyReported ? 'Ya habías denunciado esto. La administración lo revisará.' : 'Gracias. La administración lo revisará.')
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setSending(false)
    }
  }

  const what = type === 'post' ? 'esta publicación' : 'este comentario'

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
            <p className="muted">Cuéntanos qué pasa. No se borra nada por una denuncia: la revisa la administración. Nadie sabrá que has sido tú.</p>
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
              <textarea value={detail} maxLength={500} rows={3} onChange={(e) => setDetail(e.target.value)} placeholder="Si quieres, explícalo con tus palabras" />
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
