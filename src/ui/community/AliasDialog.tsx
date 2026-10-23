import { useEffect, useRef, useState } from 'react'
import { setCommunityAlias } from '@/data/community'
import { communityErrorText, toCommunityError } from '@/domain/communityErrors'
import { suggestAlias } from '@/domain/communityAlias'
import { COMMUNITY_RULES, type MyCommunityProfile } from '@/domain/community'
import { useDialogFocus } from '@/ui/community/useDialogFocus'
import { emitHelpEvent } from '@/help/tours/helpBus'

// Se abre al PRIMER intento de publicar, comentar, valorar o seguir (leer no pide nada). El alias es público, distinto del nombre privado de la familia y se
// puede cambiar después (la identidad interna no cambia). La primera vez se enseñan las normas y hay que aceptarlas.
// Si la ficha de familia no tiene fecha de nacimiento (age_known = false), al CREAR el alias también hay que marcar «Confirmo que tengo 18 años o más»
// (declaración, no verificación). Con la edad conocida no se enseña ni se pide nada.
const AVATARS = ['🙂', '😀', '😄', '😎', '🤗', '🧑‍🍳', '👩‍🍳', '👨‍🍳', '🍳', '🥘', '🍰', '🌿', '🏡', '🧺', '🧸', '🎨', '🌻', '🐶', '🐱', '⭐']

export function AliasDialog({ current, onDone, onCancel }: { current: MyCommunityProfile | null; onDone: () => void | Promise<void>; onCancel: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>()
  // Al CREAR el alias se propone uno divertido ya escrito (se puede cambiar, pedir otro con «🎲 Sugerir otro» o escribir el propio). No se guarda nada hasta
  // pulsar «Guardar y continuar». Al CAMBIAR un alias que ya existe se deja el actual y el botón sirve para probar otros.
  const creating = !current?.hasProfile
  const recentSuggestions = useRef<string[]>([])
  const [alias, setAlias] = useState(() => {
    const first = current?.alias ?? (creating ? suggestAlias() : '')
    return first
  })
  // Última propuesta del generador que sigue puesta tal cual (null si la persona la ha editado o el alias es el suyo de siempre).
  const [generated, setGenerated] = useState<string | null>(() => (current?.alias ? null : alias || null))
  const [emoji, setEmoji] = useState<string | null>(current?.avatarEmoji ?? null)
  const [accepted, setAccepted] = useState(current?.rulesAccepted === true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const needsRules = !(current?.hasProfile && current.rulesAccepted)

  useEffect(() => {
    if (generated) recentSuggestions.current = [generated]
    // Solo al abrir el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function suggestAnother() {
    const next = suggestAlias([...recentSuggestions.current, alias.trim()])
    recentSuggestions.current = [...recentSuggestions.current, next].slice(-12)
    setAlias(next)
    setGenerated(next)
    setError(null)
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await setCommunityAlias(alias.trim(), emoji, accepted)
      emitHelpEvent('comunidad.alias-saved') // para los tutoriales «Enséñame»: el alias YA está guardado
      await onDone()
    } catch (e) {
      if (toCommunityError(e).code === 'ALIAS_TAKEN' && generated !== null && alias.trim() === generated) {
        // La propuesta automática ya la usa otra persona: se cambia por otra distinta sin que haya que escribir nada.
        const next = suggestAlias([...recentSuggestions.current, generated])
        recentSuggestions.current = [...recentSuggestions.current, next].slice(-12)
        setAlias(next)
        setGenerated(next)
        setError('Ese alias ya lo usaba otra familia, así que te proponemos otro. Puedes cambiarlo o pedir más con «Sugerir otro».')
      } else {
        setError(communityErrorText(e))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div ref={dialogRef} className="modal-sheet community-touch-scope" role="dialog" aria-modal="true" aria-label="Elige tu alias público" onClick={(e) => e.stopPropagation()}>
        <h2>Elige tu alias</h2>
        <p className="muted">
          Es el nombre que verán las demás familias. No es tu nombre real ni el de tu familia, y puedes cambiarlo cuando quieras. Para leer no necesitas alias.
        </p>
        <label htmlFor="community-alias-input">Alias público</label>
        <div className="community-alias-row">
          <input
            id="community-alias-input"
            type="text"
            value={alias}
            maxLength={24}
            autoFocus
            data-help-id="comunidad.alias-input"
            onChange={(e) => {
              setAlias(e.target.value)
              if (generated !== null && e.target.value.trim() !== generated) setGenerated(null)
            }}
            placeholder="Por ejemplo: CroquetaViajera"
            aria-describedby="alias-help"
          />
          <button type="button" className="community-alias-suggest" data-help-id="comunidad.alias-suggest" onClick={suggestAnother}>
            🎲 Sugerir otro
          </button>
        </div>
        <p id="alias-help" className="muted">
          Entre 3 y 24 caracteres: letras, números, espacios, puntos, guiones o guiones bajos. Puedes quedarte con la propuesta, pedir otra las veces que quieras o escribir la tuya.
        </p>
        <fieldset className="community-avatar-picker" data-help-id="comunidad.alias-emoji">
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
            <ul className="community-rules" data-help-id="comunidad.alias-rules">
              {COMMUNITY_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <label className="checkbox-label community-touch-label" data-help-id="comunidad.alias-accept">
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
          <button type="button" className="primary" data-help-id="comunidad.alias-save" disabled={saving || alias.trim().length < 3 || (needsRules && !accepted)} onClick={() => void save()}>
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
