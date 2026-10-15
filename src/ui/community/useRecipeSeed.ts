// Comunidad PEPA — «semilla» de una receta para el editor de publicaciones. Cuando la ruta trae ?receta=<id de una receta privada de la Cocina>
// (paths.newPost({ tipo: 'receta', receta })), el editor llama a este gancho y recibe el título y los campos YA convertidos a receta pública, para empezar
// el formulario con ellos. Solo LEE (una consulta de UNA receta, y solo si la ruta trae ?receta=); no publica nada: la persona lo revisa y pulsa Publicar.
//  - El editor debe pedir el CONSENTIMIENTO explícito antes de publicar una receta que viene de la Cocina (ver RecipeConsentCheckbox y `needsConsent`).
//  - Si la receta no existe o no es de la familia, devuelve null y el editor se queda con el formulario en blanco.
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getRecipeById } from '@/data/food'
import type { RecipeDraftInput } from '@/domain/community'
import { privateRecipeToDraft } from '@/domain/communityRecipeBridge'

export interface RecipeSeed {
  recipe: RecipeDraftInput
  title?: string
  // La semilla viene de una receta PRIVADA: antes de publicar hay que marcar el consentimiento.
  needsConsent: true
  // Ruta de la foto de la receta PRIVADA (si tiene). Se puede copiar a Comunidad con copyPrivatePhotoToCommunity, solo si la persona lo elige.
  privateImagePath: string | null
}

export function useRecipeSeed(): RecipeSeed | null {
  const [params] = useSearchParams()
  const privateId = params.get('receta')
  // El resultado lleva el id al que corresponde: si cambia la ruta, la semilla vieja deja de valer sin resetear nada dentro del efecto.
  const [result, setResult] = useState<{ id: string; seed: RecipeSeed | null } | null>(null)

  useEffect(() => {
    if (!privateId) return
    let cancelled = false
    getRecipeById(privateId).then(
      (recipe) => {
        if (cancelled) return
        if (!recipe) {
          setResult({ id: privateId, seed: null })
          return
        }
        const draft = privateRecipeToDraft(recipe)
        setResult({ id: privateId, seed: { recipe: draft.recipe, title: draft.title, needsConsent: true, privateImagePath: recipe.imagePath } })
      },
      () => {
        if (!cancelled) setResult({ id: privateId, seed: null })
      },
    )
    return () => {
      cancelled = true
    }
  }, [privateId])

  return privateId && result?.id === privateId ? result.seed : null
}
