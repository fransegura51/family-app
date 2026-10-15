import { useState } from 'react'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import { UNSAVED_ACTIONS, UNSAVED_MESSAGE } from '@/domain/unsavedChangesGuard'
import { ConfirmDiscardDialog } from '@/ui/community/ConfirmDiscardDialog'
import '@/ui/community/communityEditor.css'

// Diálogo de «cambios sin guardar» (especificación sección 4): mensaje corto EXACTO y tres acciones, en este orden: Seguir editando, Guardar borrador,
// Descartar cambios (esta última pide confirmación). Sea cual sea la elección, el texto y las fotos se mantienen hasta que se descarte de verdad.
export function UnsavedChangesDialog({
  saveLabel = UNSAVED_ACTIONS.save,
  busy,
  error,
  onKeep,
  onSave,
  onDiscard,
}: {
  // En una publicación ya publicada no hay «borrador»: se guardan los cambios.
  saveLabel?: string
  busy?: boolean
  error?: string | null
  onKeep: () => void
  onSave: () => void
  onDiscard: () => void | Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <ConfirmDiscardDialog
        title="¿Descartar los cambios?"
        message="Se perderá lo que has escrito y las fotos que no estén guardadas. Esto no se puede deshacer."
        confirmLabel="Sí, descartar"
        cancelLabel="No, seguir editando"
        busy={busy}
        error={error}
        onCancel={() => {
          setConfirming(false)
          onKeep()
        }}
        onConfirm={() => void onDiscard()}
      />
    )
  }

  return <UnsavedMain saveLabel={saveLabel} busy={busy} error={error} onKeep={onKeep} onSave={onSave} onAskDiscard={() => setConfirming(true)} />
}

// Diálogo principal (componente aparte: al volver de «¿Descartar?» se monta de nuevo y el foco entra otra vez, y el tabulador no se escapa).
function UnsavedMain({
  saveLabel,
  busy,
  error,
  onKeep,
  onSave,
  onAskDiscard,
}: {
  saveLabel: string
  busy?: boolean
  error?: string | null
  onKeep: () => void
  onSave: () => void
  onAskDiscard: () => void
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>()
  return (
    <div className="modal-overlay" role="presentation">
      <div
        ref={dialogRef}
        className="modal-sheet ce-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ce-unsaved-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onKeep()
        }}
      >
        <h2 id="ce-unsaved-title">{UNSAVED_MESSAGE}</h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="ce-dialog-actions">
          <button type="button" className="ce-btn ce-btn-primary" autoFocus disabled={busy} onClick={onKeep}>
            {UNSAVED_ACTIONS.keep}
          </button>
          <button type="button" className="ce-btn ce-btn-secondary" disabled={busy} onClick={onSave}>
            {busy ? 'Guardando…' : saveLabel}
          </button>
          <button type="button" className="ce-btn ce-btn-danger-outline" disabled={busy} onClick={onAskDiscard}>
            {UNSAVED_ACTIONS.discard}
          </button>
        </div>
      </div>
    </div>
  )
}
