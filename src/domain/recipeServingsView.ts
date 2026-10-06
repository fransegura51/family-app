// Qué muestra la FICHA de una receta sobre sus raciones. Solo presentación: no cambia ningún valor guardado.
//  - Sin raciones (null): no hay nada que mostrar (ni fila vacía, ni «desconocidas»).
//  - Con raciones: «Raciones: 4» (o «6,5», en coma decimal).
//  - La fuente original («Fuente original: 6-7 personas») solo si existe; nunca se inventa ni se reconstruye.

import { formatServingsValue } from '@/domain/servingsSourceNote'

export interface RecipeServingsView {
  value: string // «4», «6,5», «7»
  source: string | null // texto original de la fuente, o null
}

export function recipeServingsView(servings: number | null | undefined, servingsSource: string | null | undefined): RecipeServingsView | null {
  if (typeof servings !== 'number' || !Number.isFinite(servings)) return null
  return { value: formatServingsValue(servings), source: servingsSource ? servingsSource : null }
}
