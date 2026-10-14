import type { RecipeDraftInput } from '@/domain/community'

// PROVISIONAL (lo sustituye la construcción de recetas): campos de la receta del editor de publicaciones (los mismos que el editor de Cocina).
export function RecipeFields({ value }: { value: RecipeDraftInput; onChange: (next: RecipeDraftInput) => void; disabled?: boolean }) {
  return <p className="muted">Editor de receta (en construcción): {value.ingredients.length} ingredientes.</p>
}
