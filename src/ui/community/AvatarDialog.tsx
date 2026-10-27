import { useState } from 'react'
import { setCommunityAlias } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import type { MyCommunityProfile } from '@/domain/community'
import { AvatarPicker } from '@/ui/community/AvatarPicker'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import { CommunityAvatar } from '@/ui/community/ProfileParts'

// Cambiar SOLO el icono: se vuelve a guardar el alias que ya tiene (el servidor no lo cuenta como cambio de alias: no toca alias_changed_at ni la identidad).
export function AvatarDialog({ current, onDone, onCancel }: { current: MyCommunityProfile; onDone: () => void | Promise<void>; onCancel: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>()
  const [emoji, setEmoji] = useState<string | null>(current.avatarEmoji ?? null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const changed = emoji !== (current.avatarEmoji ?? null)

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await setCommunityAlias(current.alias ?? '', emoji, current.rulesAccepted === true)
      await onDone()
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div ref={dialogRef} className="modal-sheet community-touch-scope" role="dialog" aria-modal="true" aria-label="Elige tu icono" onClick={(e) => e.stopPropagation()}>
        <h2>Elige tu icono</h2>
        <div className="community-profile-head">
          <CommunityAvatar alias={current.alias ?? ''} emoji={emoji} size="lg" />
          <p className="community-profile-name">{current.alias}</p>
        </div>
        <AvatarPicker value={emoji} onChange={setEmoji} legend="Iconos" />
        <p className="muted">Tu alias no cambia.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="primary" data-help-id="comunidad.avatar-save" disabled={saving || !changed} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar icono'}
          </button>
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
