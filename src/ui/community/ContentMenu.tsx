import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { placeMenu } from '@/domain/menuPlacement'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import '@/ui/community/communityPost.css'

// Menú «Más» de una publicación o de un comentario (denunciar, bloquear, editar, eliminar). Se cierra con Escape, tocando fuera o al elegir algo.
// Se coloca en pantalla (position: fixed) midiendo el botón y el menú: si abajo no cabe se abre hacia arriba, no se sale por los lados y, si es muy alto, se desplaza
// por dentro. Así «Denunciar publicación» nunca queda cortado al final de la página ni bajo la barra del móvil.
export function ContentMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined)

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

  // Medida y colocación: al abrir (antes de pintar, sin parpadeo) y al girar, cambiar el tamaño o mover la pantalla mientras está abierto.
  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined)
      return
    }
    function place() {
      const root = rootRef.current
      const list = listRef.current
      if (!root || !list) return
      const t = root.getBoundingClientRect()
      const vv = window.visualViewport
      const p = placeMenu(t, { width: list.offsetWidth, height: list.scrollHeight }, { width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight })
      setStyle({ position: 'fixed', top: p.top, left: p.left, right: 'auto', maxHeight: p.maxHeight, overflowY: 'auto' })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    window.visualViewport?.addEventListener('resize', place)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      window.visualViewport?.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <div className="community-menu" ref={rootRef}>
      <button type="button" className="community-action" aria-haspopup="true" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">⋯</span> Más
      </button>
      {open && (
        <div className="community-menu-list" role="group" aria-label={label} ref={listRef} style={style}>
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
  const dialogRef = useDialogFocus<HTMLDivElement>()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div ref={dialogRef} className="modal-sheet" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
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
