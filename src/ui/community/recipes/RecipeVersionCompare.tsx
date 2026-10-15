import { ingredientAmount, type RecipeDiff } from '@/domain/communityRecipeDiff'
import { formatServingsValue } from '@/domain/servingsSourceNote'
import '@/ui/community/recipes/communityRecipes.css'

// Comparación de dos versiones de una receta (la que la familia importó y la actual de Comunidad): qué ingredientes se añadieron, quitaron o cambiaron, qué
// pasos son nuevos, quitados o cambiados, y si cambió el nombre, las raciones o las etiquetas. Cada diferencia lleva SIEMPRE una palabra («Nuevo», «Quitado»,
// «Cambiado»), no solo un color. Todo el texto de la receta se pinta como texto de React (nunca como HTML).
function servingsText(n: number | null): string {
  return n === null ? 'sin raciones' : formatServingsValue(n)
}

export function RecipeVersionCompare({ diff }: { diff: RecipeDiff }) {
  if (!diff.hasChanges) {
    return <p className="muted">No hay diferencias en el nombre, los ingredientes ni los pasos entre las dos versiones.</p>
  }
  const stepChanges = diff.stepOps.some((o) => o.type !== 'same')
  const hasIngredientChanges = diff.ingredientsAdded.length + diff.ingredientsRemoved.length + diff.ingredientsChanged.length > 0
  return (
    <div className="community-compare">
      {(diff.titleChanged || diff.servingsChanged || diff.tagsAdded.length > 0 || diff.tagsRemoved.length > 0) && (
        <section className="community-compare-section">
          <h4>Datos generales</h4>
          <ul className="community-diff-list">
            {diff.titleChanged && (
              <li className="community-diff-item changed">
                <span className="community-diff-badge">Cambiado</span>Nombre: <span className="community-diff-from">{diff.titleChanged.from}</span> → <strong>{diff.titleChanged.to}</strong>
              </li>
            )}
            {diff.servingsChanged && (
              <li className="community-diff-item changed">
                <span className="community-diff-badge">Cambiado</span>Raciones: <span className="community-diff-from">{servingsText(diff.servingsChanged.from)}</span> →{' '}
                <strong>{servingsText(diff.servingsChanged.to)}</strong>
              </li>
            )}
            {diff.tagsAdded.length > 0 && (
              <li className="community-diff-item added">
                <span className="community-diff-badge">Nuevo</span>Etiquetas nuevas: {diff.tagsAdded.join(', ')}
              </li>
            )}
            {diff.tagsRemoved.length > 0 && (
              <li className="community-diff-item removed">
                <span className="community-diff-badge">Quitado</span>Etiquetas quitadas: {diff.tagsRemoved.join(', ')}
              </li>
            )}
          </ul>
        </section>
      )}

      {hasIngredientChanges && (
        <section className="community-compare-section">
          <h4>Ingredientes</h4>
          <ul className="community-diff-list">
            {diff.ingredientsAdded.map((i, k) => (
              <li key={`a-${k}`} className="community-diff-item added">
                <span className="community-diff-badge">Nuevo</span>
                {i.name}
                {ingredientAmount(i) && ` — ${ingredientAmount(i)}`}
              </li>
            ))}
            {diff.ingredientsRemoved.map((i, k) => (
              <li key={`r-${k}`} className="community-diff-item removed">
                <span className="community-diff-badge">Quitado</span>
                {i.name}
                {ingredientAmount(i) && ` — ${ingredientAmount(i)}`}
              </li>
            ))}
            {diff.ingredientsChanged.map((c, k) => (
              <li key={`c-${k}`} className="community-diff-item changed">
                <span className="community-diff-badge">Cambiado</span>
                {c.after.name}:{' '}
                <span className="community-diff-from">{ingredientAmount(c.before) || 'sin cantidad'}</span> → <strong>{ingredientAmount(c.after) || 'sin cantidad'}</strong>
              </li>
            ))}
          </ul>
          {diff.ingredientsSame > 0 && <p className="muted">Los otros {diff.ingredientsSame} ingredientes no cambian.</p>}
        </section>
      )}

      {stepChanges && (
        <section className="community-compare-section">
          <h4>Pasos</h4>
          <ul className="community-diff-list">
            {diff.stepOps.map((op, k) => {
              if (op.type === 'same') return null
              if (op.type === 'changed') {
                return (
                  <li key={k} className="community-diff-item changed">
                    <span className="community-diff-badge">Cambiado</span>
                    <span className="community-diff-from">{op.from}</span>
                    <br />→ <strong>{op.to}</strong>
                  </li>
                )
              }
              return (
                <li key={k} className={`community-diff-item ${op.type}`}>
                  <span className="community-diff-badge">{op.type === 'added' ? 'Nuevo' : 'Quitado'}</span>
                  {op.text}
                </li>
              )
            })}
          </ul>
          <p className="muted">Los pasos que no aparecen aquí no cambian.</p>
        </section>
      )}
    </div>
  )
}
