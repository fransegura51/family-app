import { useEffect } from 'react'

// Aviso inferior con «Deshacer» (la Lista de la compra no lo tiene: aquí borrar siempre se puede deshacer unos segundos).
export interface UndoState {
  message: string
  undo: () => void
}
export function UndoBar({ state, onClose }: { state: UndoState | null; onClose: () => void }) {
  useEffect(() => {
    if (!state) return
    const t = window.setTimeout(onClose, 6000)
    return () => window.clearTimeout(t)
  }, [state, onClose])
  if (!state) return null
  return (
    <div className="lists-undo" role="status" aria-live="polite">
      <span>{state.message}</span>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          state.undo()
          onClose()
        }}
      >
        Deshacer
      </button>
    </div>
  )
}
