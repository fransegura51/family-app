import { useState } from 'react'
import { setCommunityAlias } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { COMMUNITY_RULES, type MyCommunityProfile } from '@/domain/community'

// Se abre al PRIMER intento de publicar, comentar, valorar o seguir (leer no pide nada). El alias es público, distinto del nombre privado de la familia y se
// puede cambiar después (la identidad interna no cambia). La primera vez se enseñan las normas y hay que aceptarlas.
const AVATARS = ['🙂', '😀', '😄', '😎', '🤗', '🧑‍🍳', '👩‍🍳', '👨‍🍳', '🍳', '🥘', '🍰', '🌿', '🏡', '🧺', '🧸', '🎨', '🌻', '🐶', '🐱', '⭐']

export function AliasDialog({ current, onDone, onCancel }: { current: MyCommunityProfile | null; onDone: () => void | Promise<void>; onCancel: () => void }) {
  const [alias, setAlias] = useState(current?.alias ?? '')
  const [emoji, setEmoji] = useState<string | null>(current?.avatarEmoji ?? null)
  const [accepted, setAccepted] = useState(current?.rulesAccepted === true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const needsRules = !(current?.hasProfile && current.rulesAccepted)

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await setCommunityAlias(alias.trim(), emoji, accepted)
      await onDone()
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="Elige tu alias público" onClick={(e) => e.stopPropagation()}>
        <h2>Elige tu alias</h2>
        <p className="muted">
          Es el nombre que verán las demás familias. No es tu nombre real ni el de tu familia, y puedes cambiarlo cuando quieras. Para leer no necesitas alias.
        </p>
        <label>
          Alias público
          <input
            type="text"
            value={alias}
            maxLength={24}
            autoFocus
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Por ejemplo: Cocinillas_Rosa"
            aria-describedby="alias-help"
          />
        </label>
        <p id="alias-help" className="muted">
          Entre 3 y 24 caracteres: letras, números, espacios, puntos, guiones o guiones bajos.
        </p>
        <fieldset className="community-avatar-picker">
          <legend>Tu icono (opcional)</legend>
          <div className="community-avatar-grid">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                className={'community-avatar-option' + (emoji === a ? ' selected' : '')}
                aria-pressed={emoji === a}
                aria-label={`Icono ${a}`}
                onClick={() => setEmoji(emoji === a ? null : a)}
              >
                {a}
              </button>
            ))}
          </div>
        </fieldset>
        {needsRules && (
          <>
            <h3>Normas de Comunidad</h3>
            <ul className="community-rules">
              {COMMUNITY_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <label className="checkbox-label">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
              He leído y acepto las normas
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="primary" disabled={saving || alias.trim().length < 3 || (needsRules && !accepted)} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar y continuar'}
          </button>
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
