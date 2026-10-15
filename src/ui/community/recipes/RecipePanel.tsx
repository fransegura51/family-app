import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { PostDetail } from '@/domain/community'
import { authorLabel, formatRecipeDate, formatScaledQuantity } from '@/domain/communityRecipeBridge'
import { splitSteps } from '@/domain/communityRecipeDiff'
import { scaleIngredientQuantity } from '@/domain/recipeScaling'
import { isValidServings } from '@/domain/recipeServings'
import { formatServingsValue } from '@/domain/servingsSourceNote'
import { paths } from '@/ui/community/communityNav'
import { RecipeImportButton } from '@/ui/community/recipes/RecipeImportButton'
import { RecipeRatingBox, RecipeReviewsList, type RatingSummary } from '@/ui/community/recipes/RecipeRatingBox'
import '@/ui/community/recipes/communityRecipes.css'

// Parte de receta de la página de una publicación (CMN-§4/§5): quién la escribió (por alias), raciones con el escalado de cantidades de la Cocina,
// ingredientes y pasos legibles, versión y fecha, etiquetas, cuántas familias la han guardado, «Guardar en mi Cocina», valoración con estrellas y reseñas.
// TODO el texto de la receta se pinta como texto de React (nunca como HTML).
export function RecipePanel({ detail, onChanged }: { detail: PostDetail; onChanged?: () => void }) {
  const recipe = detail.recipe
  // Raciones elegidas para ver las cantidades (null = las de la receta). Solo cambia lo que se VE: nunca la receta.
  const [target, setTarget] = useState<number | null>(null)
  // Valoración al día tras valorar (la ficha trae la de cuando se abrió).
  const [rating, setRating] = useState<RatingSummary | null>(null)

  if (!recipe) return <p className="muted">Esta receta no está disponible.</p>

  const base = isValidServings(recipe.servings) ? recipe.servings : null
  const diners = target ?? base
  const steps = splitSteps(recipe.steps)
  const summary: RatingSummary = rating ?? { avgRating: detail.avgRating, ratingCount: detail.ratingCount, myRating: recipe.myRating }
  const families = detail.importCount
  const author = authorLabel(detail.authorAlias, detail.authorDeleted)
  const canRate = detail.canInteract && !detail.isMine
  const cannotRateReason = detail.isMine ? 'Es tu receta: las valoraciones las ponen otras familias.' : 'No puedes valorar esta receta.'

  function setDiners(n: number) {
    if (n < 1 || n > 50) return
    setTarget(n === base ? null : n)
  }

  function quantityText(quantity: string, unit: string): string {
    if (base !== null && diners !== null && diners !== base) {
      const scaled = scaleIngredientQuantity(quantity, unit, base, diners)
      if (scaled.scaled && scaled.value !== null) {
        return `${scaled.fractional ? '≈ ' : ''}${formatScaledQuantity(scaled.value)}${scaled.unit ? ' ' + scaled.unit : ''}`
      }
    }
    return [quantity, unit].filter((x) => x && x.trim()).join(' ')
  }

  return (
    <div className="community-recipe-panel">
      <div className="community-recipe-meta">
        <span>
          Receta de{' '}
          {detail.authorDeleted ? (
            author
          ) : (
            <Link to={paths.profile(detail.authorId)}>
              {detail.authorAvatar ? `${detail.authorAvatar} ` : ''}
              {author}
            </Link>
          )}
        </span>
        <span className="muted">
          Versión {recipe.version} · Actualizada el {formatRecipeDate(recipe.updatedAt)}
        </span>
        {families > 0 && (
          <span className="muted" title="Familias distintas que la han guardado en su Cocina">
            📥 {families} {families === 1 ? 'familia la ha guardado' : 'familias la han guardado'}
          </span>
        )}
      </div>

      {recipe.tags.length > 0 && (
        <ul className="community-recipe-tags" aria-label="Etiquetas" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {recipe.tags.map((t) => (
            <li key={t} className="chip">
              {t}
            </li>
          ))}
        </ul>
      )}

      <section aria-label="Ingredientes">
        <h3>Ingredientes</h3>
        {base !== null && diners !== null && (
          <div className="community-servings" role="group" aria-label="Cambiar las raciones">
            <button type="button" aria-label="Una ración menos" onClick={() => setDiners(Math.max(1, diners - 1))} disabled={diners <= 1}>
              −
            </button>
            <span className="community-servings-value" aria-live="polite">
              Para {formatServingsValue(diners)} {diners === 1 ? 'persona' : 'personas'}
            </span>
            <button type="button" aria-label="Una ración más" onClick={() => setDiners(Math.min(50, diners + 1))} disabled={diners >= 50}>
              +
            </button>
            {diners !== base && (
              <button type="button" className="link-button" style={{ fontSize: 14 }} onClick={() => setTarget(null)}>
                Volver a {formatServingsValue(base)}
              </button>
            )}
          </div>
        )}
        {base !== null && diners !== null && diners !== base && (
          <p className="muted" style={{ fontSize: 13 }}>
            Las cantidades están calculadas para {formatServingsValue(diners)} y son orientativas. La receta original es para {formatServingsValue(base)}.
          </p>
        )}
        {base === null && <p className="muted">Esta receta no indica para cuántas personas es.</p>}
        <ul className="community-recipe-ingredients">
          {recipe.ingredients.map((i, k) => {
            const q = quantityText(i.quantity, i.unit)
            return (
              <li key={`${i.name}-${k}`}>
                {i.name}
                {q && ` — ${q}`}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-label="Preparación">
        <h3>Preparación</h3>
        {steps.length > 0 ? (
          <ol className="community-recipe-steps">
            {steps.map((s, k) => (
              <li key={k}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">Esta receta no tiene pasos escritos.</p>
        )}
      </section>

      <RecipeImportButton detail={detail} onImported={() => onChanged?.()} />

      <RecipeRatingBox
        recipeId={recipe.id}
        summary={summary}
        canRate={canRate}
        cannotRateReason={cannotRateReason}
        onChanged={(next) => {
          setRating(next)
          onChanged?.()
        }}
      />
      <RecipeReviewsList recipeId={recipe.id} ratingCount={summary.ratingCount} />
    </div>
  )
}
