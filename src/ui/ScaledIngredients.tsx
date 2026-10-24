import { useState } from 'react'
import { formatScaledQuantity } from '@/domain/communityRecipeBridge'
import { scaleIngredientQuantity } from '@/domain/recipeScaling'
import { isValidServings } from '@/domain/recipeServings'
import { formatServingsValue } from '@/domain/servingsSourceNote'

// Ingredientes de una receta de la Cocina con botones «−» / «+» para ver las cantidades para otro número de personas (24/10/2026: «el visor de recetas guardadas no
// escala las cantidades»). Solo cambia lo que se VE: nunca la receta guardada. Mismas reglas que el visor de recetas de Comunidad (domain/recipeScaling.ts): sin raciones
// indicadas no se escala, las cantidades no numéricas o de unidades que no se escalan se dejan tal cual y las piezas enteras que salen con decimales llevan «≈».
// Usar con key={recipe.id} para que al cambiar de receta vuelva a las raciones originales.
interface IngredientLike {
  id: string
  name: string
  quantity: string | null
  unit: string | null
}

export function ScaledIngredients({ servings, ingredients }: { servings: number | null | undefined; ingredients: readonly IngredientLike[] }) {
  const [target, setTarget] = useState<number | null>(null)
  const base = isValidServings(servings) ? servings : null
  const diners = target ?? base

  function setDiners(n: number) {
    if (n < 1 || n > 50) return
    setTarget(n === base ? null : n)
  }

  function quantityText(quantity: string | null, unit: string | null): string {
    if (base !== null && diners !== null && diners !== base) {
      const scaled = scaleIngredientQuantity(quantity, unit, base, diners)
      if (scaled.scaled && scaled.value !== null) {
        return `${scaled.fractional ? '≈ ' : ''}${formatScaledQuantity(scaled.value)}${scaled.unit ? ' ' + scaled.unit : ''}`
      }
    }
    return [quantity, unit].filter((x) => x && x.trim()).join(' ')
  }

  return (
    <div className="day-modal-group" data-help-id="cocina.receta-escalar">
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
      <ul className="ingredient-list">
        {ingredients.map((i) => {
          const q = quantityText(i.quantity, i.unit)
          return (
            <li key={i.id}>
              {i.name}
              {q && ` — ${q}`}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
