import { useState } from 'react'
import { AVATAR_CATEGORIES, categoryOfAvatar, type AvatarCategoryId } from '@/domain/communityAvatars'

// Selector de icono de Comunidad: pestañas compactas por categoría y una cuadrícula que se adapta al ancho (móvil u ordenador). El icono elegido queda marcado
// (contorno, ✓ y aria-pressed) y se abre en su categoría. Pulsar el elegido lo quita (el icono es opcional).
export function AvatarPicker({ value, onChange, legend = 'Tu icono (opcional)' }: { value: string | null; onChange: (emoji: string | null) => void; legend?: string }) {
  const [cat, setCat] = useState<AvatarCategoryId>(() => categoryOfAvatar(value))
  const current = AVATAR_CATEGORIES.find((c) => c.id === cat) ?? AVATAR_CATEGORIES[0]
  return (
    <fieldset className="community-avatar-picker" data-help-id="comunidad.alias-emoji">
      <legend>{legend}</legend>
      <div className="community-avatar-tabs" role="tablist" aria-label="Categorías de iconos">
        {AVATAR_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            id={`avatar-tab-${c.id}`}
            aria-selected={cat === c.id}
            aria-controls="avatar-grid"
            className={'community-avatar-tab' + (cat === c.id ? ' active' : '')}
            onClick={() => setCat(c.id)}
          >
            <span aria-hidden="true">{c.tab}</span> {c.label}
          </button>
        ))}
      </div>
      <div id="avatar-grid" role="tabpanel" aria-labelledby={`avatar-tab-${cat}`} className="community-avatar-grid">
        {current.icons.map((a) => (
          <button
            key={a}
            type="button"
            className={'community-avatar-option' + (value === a ? ' selected' : '')}
            aria-pressed={value === a}
            aria-label={`Icono ${a}`}
            onClick={() => onChange(value === a ? null : a)}
          >
            {a}
          </button>
        ))}
      </div>
      <p className="muted community-avatar-current">
        {value ? (
          <>
            Icono elegido: <span aria-hidden="true">{value}</span>
          </>
        ) : (
          'Sin icono: se verán tus iniciales.'
        )}
      </p>
    </fieldset>
  )
}
