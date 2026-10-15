import { useEffect, useRef } from 'react'
import '@/ui/community/communityEditor.css'

// Confirmación de seguridad antes de tirar algo a la basura (descartar el formulario, descartar un borrador, descartar cambios). Sin red: solo pregunta.
export function ConfirmDiscardDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    // Se enfoca el botón SEGURO («no descartar») para que un Intro sin querer no borre nada.
    cancelRef.current?.focus()
  }, [])
  return (
    <div className="modal-overlay" role="presentation" onClick={busy ? undefined : onCancel}>
      <div
        className="modal-sheet ce-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ce-confirm-title"
        aria-describedby="ce-confirm-text"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onCancel()
        }}
      >
        <h2 id="ce-confirm-title">{title}</h2>
        <p id="ce-confirm-text">{message}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="ce-dialog-actions">
          <button ref={cancelRef} type="button" className="ce-btn ce-btn-safe" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="ce-btn ce-btn-danger" disabled={busy} onClick={onConfirm}>
            {busy ? 'Descartando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
