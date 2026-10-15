import { useEffect, useRef, useState, type ReactNode } from 'react'
import '@/ui/community/communityPost.css'

// Menú «Más» de una publicación o de un comentario (denunciar, bloquear, editar, eliminar). Se cierra con Escape, tocando fuera o al elegir algo.
export function ContentMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="community-menu" ref={rootRef}>
      <button type="button" className="community-action" aria-haspopup="true" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">⋯</span> Más
      </button>
      {open && (
        <div className="community-menu-list" role="group" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

// Confirmación sencilla (por ejemplo antes de bloquear a alguien). Cancelar es lo primero que se alcanza.
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string
  text: string
  confirmLabel: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className="modal-sheet" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p>{text}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions community-report-actions">
          <button type="button" className="link-button" autoFocus onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
