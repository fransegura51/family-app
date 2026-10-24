import '@/ui/community/communityEditor.css'

// Botones del formulario, APILADOS y en este ORDEN EXACTO (especificación sección 4): 1) Descartar, 2) Guardar borrador, 3) Publicar. «Publicar» va el último,
// debajo de «Guardar borrador», para no pulsarlo por error. Al editar una publicación ya publicada no hay borrador: quedan «Descartar cambios» y «Guardar cambios».
export const CREATE_ACTION_LABELS = ['Descartar', 'Guardar borrador', 'Publicar'] as const
export const EDIT_ACTION_LABELS = ['Descartar cambios', 'Guardar cambios'] as const

export function PostEditorActions({
  mode,
  busy,
  publishDisabled,
  onDiscard,
  onSaveDraft,
  onPublish,
}: {
  mode: 'create' | 'edit'
  // Algo se está guardando o subiendo: no se puede pulsar nada más.
  busy: boolean
  publishDisabled?: boolean
  onDiscard: () => void
  onSaveDraft: () => void
  onPublish: () => void
}) {
  return (
    <div className="ce-actions" role="group" aria-label="Acciones de la publicación">
      <button type="button" className="ce-btn ce-btn-danger-outline" disabled={busy} onClick={onDiscard}>
        {mode === 'create' ? CREATE_ACTION_LABELS[0] : EDIT_ACTION_LABELS[0]}
      </button>
      {mode === 'create' && (
        <button type="button" className="ce-btn ce-btn-secondary" disabled={busy} data-help-id="comunidad.editor-save-draft" onClick={onSaveDraft}>
          {CREATE_ACTION_LABELS[1]}
        </button>
      )}
      <button type="button" className="ce-btn ce-btn-primary" disabled={busy || publishDisabled} onClick={onPublish}>
        {mode === 'create' ? CREATE_ACTION_LABELS[2] : EDIT_ACTION_LABELS[1]}
      </button>
    </div>
  )
}
