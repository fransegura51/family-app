import { useEffect, useState, type ReactNode } from 'react'
import { reportContent } from '@/data/community'
import { REPORT_REASONS } from '@/domain/community'
import { avatarText } from '@/domain/communityProfile'
import { communityErrorText } from '@/domain/communityErrors'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import '@/ui/community/communityProfile.css'

// Piezas compartidas por el perfil público y «Mi perfil»: avatar, diálogo de confirmación y diálogo de denuncia.

// Icono/emoji si lo hay; si no, iniciales del alias. Es decorativo: el alias siempre va escrito al lado.
export function CommunityAvatar({ alias, emoji, size = 'md' }: { alias: string | null | undefined; emoji: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`community-avatar community-avatar-${size}`} aria-hidden="true">
      {avatarText(alias, emoji)}
    </span>
  )
}

// Cierra con la tecla Escape (accesibilidad de teclado).
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  useEscape(onCancel)
  const dialogRef = useDialogFocus<HTMLDivElement>()
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div ref={dialogRef} className="modal-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Un momento…' : confirmLabel}
          </button>
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// Denunciar a una persona: motivo obligatorio y detalle opcional. La denuncia por sí sola no elimina nada: la revisa la administración.
export function ReportUserDialog({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  useEscape(onClose)
  const dialogRef = useDialogFocus<HTMLDivElement>()

  async function send() {
    setBusy(true)
    setError(null)
    try {
      const result = await reportContent('user', profileId, reason, detail.trim() ? detail.trim() : null)
      setDone(result.alreadyReported ? 'Ya habías denunciado a esta persona. La administración lo está revisando.' : 'Gracias. Hemos recibido tu denuncia y la revisará la administración.')
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div ref={dialogRef} className="modal-sheet" role="dialog" aria-modal="true" aria-label="Denunciar a esta persona" onClick={(e) => e.stopPropagation()}>
        <h2>Denunciar a esta persona</h2>
        {done ? (
          <>
            <p role="status">{done}</p>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Cuéntanos qué ha pasado. La otra persona no sabrá que has denunciado, y una denuncia por sí sola no elimina nada: la revisa la administración.</p>
            <fieldset className="community-report-reasons">
              <legend>Motivo</legend>
              {REPORT_REASONS.map((r) => (
                <label key={r.id} className="checkbox-label">
                  <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <label>
              Detalle (opcional)
              <textarea value={detail} maxLength={1000} rows={3} onChange={(e) => setDetail(e.target.value)} placeholder="Si quieres, añade algo que ayude a entenderlo." />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="primary" disabled={busy || !reason} onClick={() => void send()}>
                {busy ? 'Enviando…' : 'Enviar denuncia'}
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
