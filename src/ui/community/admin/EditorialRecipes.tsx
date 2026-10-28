import type { RecipeDraftInput } from '@/domain/community'
import {
  changeSummary,
  freezeLabel,
  ingredientText,
  servingsLabel,
  timeLabel,
  type RecipeCard,
  type RecipeCardEdit,
  type RecipeChange,
  type ReviseWarning,
} from '@/domain/communityEditorialRecipes'
import { stepsFromNotes, stepsToText } from '@/domain/communityRecipeBridge'
import { RecipeVersionCompare } from '@/ui/community/recipes/RecipeVersionCompare'
import { RecipeFields } from '@/ui/community/recipes/RecipeFields'
import '@/ui/community/recipes/communityRecipes.css'
import '@/ui/community/admin/editorialRecipes.css'

// Fichas de recetas de un artículo oficial dentro del Centro de Mando de Comunidad: verlas completas, compararlas con las anteriores y editarlas. Pintan el mismo
// aspecto que la publicación (clases de `communityRecipes.css`), la misma comparación que usan las familias al actualizar una receta importada (`RecipeVersionCompare`)
// y el mismo editor compartido con la Cocina (`RecipeFields`). Todo el texto se pinta como texto de React, nunca como HTML. NADA de esto importa ni publica nada.

// ---- Una ficha completa (solo lectura) --------------------------------------------------------------------------------------------------------
export function RecipeCardView({ recipe, open = false, tag }: { recipe: RecipeCard; open?: boolean; tag?: string }) {
  const time = timeLabel(recipe.time)
  const freeze = freezeLabel(recipe.freeze)
  return (
    <li className="community-post-recipe cadm-recipe-card">
      <p className="cadm-recipe-name">
        <strong>{recipe.title}</strong>
        {tag && <span className="cadm-recipe-tag">{tag}</span>}
      </p>
      <p className="muted cadm-small">
        {servingsLabel(recipe.servings)}
        {time ? ` · ${time}` : ''} · {recipe.ingredients.length} {recipe.ingredients.length === 1 ? 'ingrediente' : 'ingredientes'} · {recipe.steps.length} {recipe.steps.length === 1 ? 'paso' : 'pasos'}
      </p>
      <details className="community-post-recipe-details" open={open || undefined}>
        <summary>Ver ingredientes y elaboración</summary>
        <h6>Ingredientes</h6>
        {recipe.ingredients.length === 0 ? (
          <p className="muted cadm-small">Esta ficha no tiene ingredientes.</p>
        ) : (
          <ul>
            {recipe.ingredients.map((i, n) => (
              <li key={`${i.name}-${n}`}>{ingredientText(i)}</li>
            ))}
          </ul>
        )}
        <h6>Elaboración</h6>
        {recipe.steps.length === 0 ? (
          <p className="muted cadm-small">Esta ficha no tiene pasos.</p>
        ) : (
          <ol>
            {recipe.steps.map((s, n) => (
              <li key={n}>{s}</li>
            ))}
          </ol>
        )}
        {recipe.tip && (
          <p className="community-post-recipe-tip">
            <strong>Consejo:</strong> {recipe.tip}
          </p>
        )}
        {freeze && (
          <p className="cadm-small">
            <strong>Conservación y congelación:</strong> {freeze}
          </p>
        )}
        {recipe.tags.length > 0 && <p className="muted cadm-small">Etiquetas: {recipe.tags.join(', ')}</p>}
      </details>
    </li>
  )
}

export function RecipeCardsList({ recipes, heading = 'Fichas de recetas', open = false }: { recipes: RecipeCard[]; heading?: string; open?: boolean }) {
  if (recipes.length === 0) return null
  return (
    <section className="cadm-recipes" aria-label={heading} data-help-id="comunidad.recetas-fichas">
      <h5>
        {heading} ({recipes.length})
      </h5>
      <ul className="community-post-recipes-list">
        {recipes.map((r, n) => (
          <RecipeCardView key={`${r.key}-${n}`} recipe={r} open={open && recipes.length === 1} />
        ))}
      </ul>
    </section>
  )
}

// ---- Qué ha cambiado, ficha por ficha ---------------------------------------------------------------------------------------------------------
const KIND_TAG: Record<RecipeChange['kind'], string> = { added: 'Nueva', removed: 'Eliminada', changed: 'Modificada' }

export function RecipeChangesView({ changes }: { changes: RecipeChange[] }) {
  if (changes.length === 0) return null
  return (
    <section className="cadm-recipes" aria-label="Cambios en las fichas de recetas" data-help-id="comunidad.recetas-cambios">
      <h5>Fichas de recetas</h5>
      <ul className="community-post-recipes-list">
        {changes.map((c, n) => (
          <li key={`${c.kind}-${c.title}-${n}`} className="community-post-recipe cadm-recipe-card">
            <p className="cadm-recipe-name">
              <span className={`cadm-recipe-tag cadm-recipe-tag-${c.kind}`}>{KIND_TAG[c.kind]}</span> {changeSummary(c)}
            </p>
            {c.kind === 'added' && c.after && (
              <ul className="community-post-recipes-list">
                <RecipeCardView recipe={c.after} open tag="Ficha propuesta" />
              </ul>
            )}
            {c.kind === 'removed' && c.before && (
              <ul className="community-post-recipes-list">
                <RecipeCardView recipe={c.before} tag="Ficha que se eliminaría" />
              </ul>
            )}
            {c.kind === 'changed' && c.diff && (
              <>
                <RecipeVersionCompare diff={c.diff} />
                {c.extras.length > 0 && (
                  <ul className="community-diff-list">
                    {c.extras.map((x) => (
                      <li key={x} className="community-diff-item changed">
                        <span className="community-diff-badge">Cambiado</span>
                        {x}
                      </li>
                    ))}
                  </ul>
                )}
                {c.after && (
                  <ul className="community-post-recipes-list">
                    <RecipeCardView recipe={c.after} tag="Ficha completa propuesta" />
                  </ul>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---- Avisos sobre lo que Pepa dice frente a lo que contiene la propuesta ---------------------------------------------------------------------
export function ReviseWarnings({ warnings }: { warnings: ReviseWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <div className="cadm-notice cadm-notice-error" role="status" data-help-id="comunidad.revise-aviso-recetas">
      <strong>Comprueba esto antes de aceptar:</strong>
      <ul className="cadm-options">
        {warnings.map((w) => (
          <li key={w.code}>⚠️ {w.message}</li>
        ))}
      </ul>
    </div>
  )
}

// ---- Edición de las fichas de un borrador -----------------------------------------------------------------------------------------------------
const toDraft = (e: RecipeCardEdit): RecipeDraftInput => ({ servings: e.servings, ingredients: e.ingredients, steps: stepsToText(e.steps), tags: e.tags })

export function RecipeCardsEditor({ value, onChange, disabled }: { value: RecipeCardEdit[]; onChange: (next: RecipeCardEdit[]) => void; disabled?: boolean }) {
  if (value.length === 0) return null
  const patch = (i: number, p: Partial<RecipeCardEdit>) => onChange(value.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <fieldset className="cadm-fieldset cadm-recipes-edit" data-help-id="comunidad.recetas-editar">
      <legend>Fichas de recetas ({value.length})</legend>
      <p className="muted cadm-small">Se guardan con el borrador. No se importan a ninguna Cocina ni se publica nada. Las mismas reglas que al publicar: nombre, al menos un ingrediente con su cantidad y al menos un paso.</p>
      {value.map((r, i) => (
        <details key={r.key} className="community-post-recipe cadm-recipe-edit" open={value.length === 1 || undefined}>
          <summary>
            <strong>{r.title || 'Receta sin título'}</strong>
          </summary>
          <label htmlFor={`recipe-title-${r.key}`}>Nombre de la receta</label>
          <input id={`recipe-title-${r.key}`} value={r.title} maxLength={120} disabled={disabled} onChange={(e) => patch(i, { title: e.target.value })} />
          <RecipeFields
            value={toDraft(r)}
            disabled={disabled}
            onChange={(d) => patch(i, { servings: d.servings, ingredients: d.ingredients, steps: stepsFromNotes(d.steps), tags: d.tags })}
          />
          <label htmlFor={`recipe-tip-${r.key}`}>Consejo (opcional)</label>
          <textarea id={`recipe-tip-${r.key}`} rows={2} value={r.tip} maxLength={400} disabled={disabled} onChange={(e) => patch(i, { tip: e.target.value })} />
        </details>
      ))}
    </fieldset>
  )
}
