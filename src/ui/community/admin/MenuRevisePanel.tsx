import { useId, useState } from 'react'
import { MEAL_TEXT, REVISE_SCOPES, reviseTargetText, type ReviseTarget } from '@/domain/communityEditorial'
import { mealsOfDay, recipeTitlesOf, scopeTargetFor, type ScopeMenu } from '@/domain/communityMenuDiff'
import { RevisePanel } from '@/ui/community/admin/RevisePanel'
import '@/ui/community/admin/menuChanges.css'

// «Rectificar con Pepa» en un menú, eligiendo el ALCANCE: una receta, una comida, un día o todo el menú. Pepa solo puede cambiar lo elegido; el resto queda idéntico (el
// servidor lo comprueba). NADA de esto publica ni aprueba: aceptar crea una versión nueva y el menú vuelve a «Pendiente de revisar».
export function MenuReviseScopePicker({ menu, value, onChange, disabled }: { menu: ScopeMenu; value: ReviseTarget; onChange: (next: ReviseTarget) => void; disabled?: boolean }) {
  const id = useId()
  const hint = REVISE_SCOPES.find((s) => s.id === value.scope)?.hint ?? ''
  const day = 'day' in value ? value.day : null
  const meal = 'meal' in value ? value.meal : null
  const meals = day !== null ? mealsOfDay(menu, day) : []
  const recipes = day !== null && meal !== null ? recipeTitlesOf(menu, day, meal) : []
  return (
    <fieldset className="cadm-fieldset cadm-scope" data-help-id="comunidad.revise-scope" disabled={disabled}>
      <legend>¿Qué quieres que cambie Pepa?</legend>
      <div className="cadm-scope-chips" role="group" aria-label="Alcance de la rectificación">
        {REVISE_SCOPES.map((s) => (
          <button key={s.id} type="button" className={`cadm-chip-button${value.scope === s.id ? ' active' : ''}`} aria-pressed={value.scope === s.id} onClick={() => onChange(scopeTargetFor(menu, s.id, value))}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="muted cadm-small cadm-scope-now">{hint}</p>
      {day !== null && (
        <div className="cadm-scope-fields">
          <div>
            <label htmlFor={`${id}-day`}>Día</label>
            <select id={`${id}-day`} value={day} onChange={(e) => onChange(scopeTargetFor(menu, value.scope, { ...value, day: Number(e.target.value) } as ReviseTarget))}>
              {menu.days.map((d, i) => (
                <option key={d.day} value={i}>
                  {d.day.charAt(0).toUpperCase() + d.day.slice(1)}
                </option>
              ))}
            </select>
          </div>
          {meal !== null && (
            <div>
              <label htmlFor={`${id}-meal`}>Comida</label>
              <select id={`${id}-meal`} value={meal} onChange={(e) => onChange(scopeTargetFor(menu, value.scope, { ...value, meal: e.target.value } as ReviseTarget))}>
                {meals.map((m) => (
                  <option key={m} value={m}>
                    {MEAL_TEXT[m]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {value.scope === 'recipe' && (
            <div>
              <label htmlFor={`${id}-recipe`}>Receta</label>
              <select id={`${id}-recipe`} value={value.recipe} onChange={(e) => onChange({ ...value, recipe: Number(e.target.value) })}>
                {recipes.map((t, i) => (
                  <option key={`${t}-${i}`} value={i}>
                    {i + 1}. {t}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      <p className="cadm-small cadm-scope-now">
        Se cambiará: <strong>{reviseTargetText(value)}</strong>
      </p>
    </fieldset>
  )
}

export function MenuRevisePanel({
  itemId,
  menu,
  initial,
  onClose,
  onChanged,
}: {
  itemId: string
  menu: ScopeMenu
  /** Alcance con el que se abre (p. ej. «Cambiar este plato con Pepa» junto a un plato). Por defecto, todo el menú. */
  initial?: ReviseTarget | null
  onClose: () => void
  onChanged: (message: string) => void
}) {
  const [target, setTarget] = useState<ReviseTarget>(initial ?? { scope: 'week' })
  return (
    <div className="cadm-stack" data-help-id="comunidad.revise-menu-scope">
      <MenuReviseScopePicker menu={menu} value={target} onChange={setTarget} />
      <RevisePanel itemId={itemId} kind="menu" scopeTarget={target} onClose={onClose} onChanged={onChanged} />
    </div>
  )
}
