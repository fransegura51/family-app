import { useMemo } from 'react'
import { changeSummary, type RecipeChange } from '@/domain/communityEditorialRecipes'
import { checkMenuClaims, compareMenus, mealLabel, menuChangeStats, statsText, type MealChange, type MealSnapshot } from '@/domain/communityMenuDiff'
import { RecipeCardView } from '@/ui/community/admin/EditorialRecipes'
import { RecipeVersionCompare } from '@/ui/community/recipes/RecipeVersionCompare'
import '@/ui/community/recipes/communityRecipes.css'
import '@/ui/community/admin/editorialRecipes.css'
import '@/ui/community/admin/menuChanges.css'

// Qué cambia en un MENÚ al rectificarlo con Pepa, comida por comida y receta por receta (nueva, eliminada o modificada), con el comparador de ingredientes, cantidades y
// pasos que usan los artículos y las familias, más consejo, tiempos y congelación, y la propuesta completa desplegable. NADA de esto acepta, aprueba ni publica nada.
// Todo el texto se pinta como texto de React, nunca como HTML.
const KIND_TAG: Record<RecipeChange['kind'], string> = { added: 'Nueva', removed: 'Eliminada', changed: 'Modificada' }

// `showNames`: enseñar también el cambio del nombre/acompañamiento del plato (la rectificación ya lo enseña arriba, en «Platos que cambian», y lo desactiva para no repetirlo).
export function MenuChanges({ before, after, notes, showNames = true }: { before: Record<string, unknown>; after: Record<string, unknown>; notes: string; showNames?: boolean }) {
  const changes = useMemo(() => compareMenus(before, after), [before, after])
  const warnings = useMemo(() => checkMenuClaims({ notes, changes }), [notes, changes])
  if (changes.length === 0 && warnings.length === 0) return null
  const stats = menuChangeStats(changes)
  const shown = showNames ? changes : changes.filter((c) => c.recipes.length > 0 || c.orderChanged)
  return (
    <section className="cadm-recipes cadm-menu-changes" aria-label="Cambios en las recetas del menú" data-help-id="comunidad.revise-menu-changes">
      <h5>Recetas del menú que cambian</h5>
      <p className="cadm-small">{statsText(stats)}</p>
      {warnings.length > 0 && (
        <div className="cadm-notice cadm-notice-error" role="status" data-help-id="comunidad.revise-menu-aviso">
          <strong>Comprueba esto antes de aceptar:</strong>
          <ul className="cadm-options">
            {warnings.map((w) => (
              <li key={w.code + w.message}>⚠️ {w.message}</li>
            ))}
          </ul>
        </div>
      )}
      <ul className="community-post-recipes-list">
        {shown.map((c) => (
          <MealChangeItem key={`${c.dayIndex}:${c.meal}`} change={c} showNames={showNames} />
        ))}
      </ul>
      {shown.some((c) => c.after) && (
        <details className="cadm-criteria cadm-menu-full">
          <summary>Ver la propuesta completa de lo que cambia</summary>
          <ul className="community-post-recipes-list">
            {shown
              .filter((c) => c.after)
              .map((c) => (
                <li key={`full-${c.dayIndex}:${c.meal}`} className="community-post-recipe cadm-recipe-card">
                  <MealFull label={mealLabel(c)} meal={c.after!} />
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function MealFull({ label, meal }: { label: string; meal: MealSnapshot }) {
  return (
    <>
      <p className="cadm-recipe-name">
        <strong>{label}</strong>
      </p>
      <p className="cadm-small">
        <strong>{meal.title || 'Sin nombre'}</strong>
        {meal.side ? ` (+ ${meal.side})` : ''}
      </p>
      <ul className="community-post-recipes-list">
        {meal.recipes.map((r, i) => (
          <RecipeCardView key={`${r.key}-${i}`} recipe={r} tag={r.simple ? 'Elemento sencillo' : i === 0 ? 'Plato principal' : undefined} />
        ))}
      </ul>
    </>
  )
}

function MealChangeItem({ change: c, showNames }: { change: MealChange; showNames: boolean }) {
  const removedMeal = !c.after
  return (
    <li className="community-post-recipe cadm-recipe-card">
      <p className="cadm-recipe-name">
        <strong>{mealLabel(c)}</strong>
        <span className="cadm-recipe-tag">{removedMeal ? 'Comida eliminada' : !c.before ? 'Comida nueva' : 'Modificada'}</span>
      </p>
      {showNames && (c.titleChanged || c.sideChanged) && c.before && c.after && (
        <p className="cadm-small cadm-menu-names">
          {c.titleChanged && (
            <span className="cadm-block">
              Nombre del plato: <del className="cadm-del">{c.before.title || 'sin nombre'}</del> → <ins className="cadm-ins">{c.after.title || 'sin nombre'}</ins>
            </span>
          )}
          {c.sideChanged && (
            <span className="cadm-block">
              Acompañamiento: <del className="cadm-del">{c.before.side ?? 'ninguno'}</del> → <ins className="cadm-ins">{c.after.side ?? 'ninguno'}</ins>
            </span>
          )}
        </p>
      )}
      {c.orderChanged && <p className="cadm-small">Las recetas cambian de orden (la primera es el plato principal).</p>}
      {c.recipes.length > 0 && (
        <ul className="community-post-recipes-list">
          {c.recipes.map((r, n) => (
            <li key={`${r.kind}-${r.title}-${n}`} className="community-post-recipe cadm-recipe-card">
              <p className="cadm-recipe-name">
                <span className={`cadm-recipe-tag cadm-recipe-tag-${r.kind}`}>{KIND_TAG[r.kind]}</span> {changeSummary(r)}
              </p>
              {r.kind === 'added' && r.after && (
                <ul className="community-post-recipes-list">
                  <RecipeCardView recipe={r.after} open />
                </ul>
              )}
              {r.kind === 'removed' && r.before && (
                <ul className="community-post-recipes-list">
                  <RecipeCardView recipe={r.before} />
                </ul>
              )}
              {r.kind === 'changed' && r.diff && (
                <>
                  <RecipeVersionCompare diff={r.diff} />
                  {r.extras.length > 0 && (
                    <ul className="community-diff-list">
                      {r.extras.map((x) => (
                        <li key={x} className="community-diff-item changed">
                          <span className="community-diff-badge">Cambiado</span>
                          {x}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
