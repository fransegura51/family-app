import { useState } from 'react'
import type { RecipeDraftInput } from '@/domain/community'
import { COMMUNITY_RECIPE_LIMITS, draftToEditorRows, editorRowsToDraft, type CommunityEditorRows } from '@/domain/communityRecipeEditor'
import { RecipeEditorFields } from '@/ui/recipeEditor/RecipeEditorFields'
import '@/ui/community/recipes/communityRecipes.css'

// ADAPTADOR delgado: los campos de la receta del editor de publicaciones de Comunidad NO son un editor aparte. Pintan EL MISMO editor compartido con la Cocina
// (`RecipeEditorFields`: raciones entre 1 y 50 con medios puntos, etiquetas, ingredientes «nombre · cantidad · unidad» uno por fila y pasos numerados que se
// pueden subir y bajar). Aquí solo está lo propio de Comunidad: traducir entre la copia pública (`RecipeDraftInput`) y las filas, y los límites del servidor.
// Lo que la Cocina hace además (buscar recetas en internet, foto, guardado) no aplica: la foto de la publicación y el guardado los gestiona el editor de publicaciones.

interface Local extends CommunityEditorRows {
  // Huella del valor que recibimos o enviamos la última vez: si el padre nos da OTRO valor (p. ej. al cargar un borrador) se reconstruyen las filas.
  key: string
}

function fromValue(value: RecipeDraftInput): Local {
  return { ...draftToEditorRows(value), key: JSON.stringify(value) }
}

export function RecipeFields({ value, onChange, disabled }: { value: RecipeDraftInput; onChange: (next: RecipeDraftInput) => void; disabled?: boolean }) {
  const [local, setLocal] = useState<Local>(() => fromValue(value))
  // Si el valor de fuera ya no es el que enviamos nosotros, se reconstruyen las filas desde él (estado derivado durante el render, sin efectos).
  let current = local
  if (local.key !== JSON.stringify(value)) {
    current = fromValue(value)
    setLocal(current)
  }

  function emit(patch: Partial<CommunityEditorRows>, tags: string[] = value.tags) {
    const merged: CommunityEditorRows = { ingredients: current.ingredients, steps: current.steps, servingsText: current.servingsText, ...patch }
    const next = editorRowsToDraft(merged, tags)
    setLocal({ ...merged, key: JSON.stringify(next) })
    onChange(next)
  }

  return (
    // Las clases de la Cocina (.recipe-form) y las de 44 px táctiles de Comunidad (.community-recipe-fields, en communityRecipes.css).
    <div className="recipe-form community-recipe-fields" role="group" aria-label="Datos de la receta">
      <RecipeEditorFields
        servingsText={current.servingsText}
        onServingsTextChange={(servingsText) => emit({ servingsText })}
        tags={value.tags}
        onTagsChange={(tags) => emit({}, tags)}
        ingredients={current.ingredients}
        onIngredientsChange={(ingredients) => emit({ ingredients })}
        steps={current.steps}
        onStepsChange={(steps) => emit({ steps })}
        limits={COMMUNITY_RECIPE_LIMITS}
        disabled={disabled}
      />
    </div>
  )
}
