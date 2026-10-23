import { useState } from 'react'
import { Link } from 'react-router-dom'
import { recordRecipeImport } from '@/data/community'
import { createRecipe } from '@/data/food'
import { communityErrorText } from '@/domain/communityErrors'
import type { PostDetail } from '@/domain/community'
import { publicRecipeToKitchenInput } from '@/domain/communityRecipeBridge'
import { errorMessage } from '@/domain/errorMessage'
import { copyCommunityPhotoToKitchen } from '@/ui/community/recipes/recipePhotoCopy'
import { emitHelpEvent } from '@/help/tours/helpBus'
import '@/ui/community/recipes/communityRecipes.css'

// «Guardar en mi Cocina» (CMN-§5.2): crea una copia EDITABLE de la receta pública en la Cocina privada de la familia, con el mismo createRecipe de siempre, y
// registra la importación en Comunidad. La importación NUNCA da acceso a la receta privada de nadie: lo que se copia es la receta PÚBLICA. Cada familia cuenta
// una sola vez (lo garantiza el servidor), aunque la guarde varias veces.
//  - No pide alias: guardar una receta en tu Cocina no es participar en Comunidad.
//  - Si algo falla a medias (la copia se creó pero no se pudo anotar), no se duplica la receta al reintentar: solo se reintenta anotar.
type Phase = 'idle' | 'working' | 'done' | 'record-failed'

export function RecipeImportButton({ detail, onImported }: { detail: PostDetail; onImported?: () => void }) {
  const recipe = detail.recipe
  const [phase, setPhase] = useState<Phase>('idle')
  const [privateId, setPrivateId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [photoMissed, setPhotoMissed] = useState(false)
  // La familia ya la tenía: hay que confirmar antes de crear OTRA copia.
  const [confirmAgain, setConfirmAgain] = useState(false)
  if (!recipe) return null
  const publicRecipe = recipe

  async function register(id: string) {
    await recordRecipeImport(publicRecipe.id, id)
    emitHelpEvent('comunidad.recipe-imported') // para los tutoriales «Enséñame»: la receta YA está en tu Cocina
    setPhase('done')
    onImported?.()
  }

  async function run() {
    setPhase('working')
    setError(null)
    setConfirmAgain(false)
    let id = privateId
    try {
      if (!id) {
        // La foto es opcional: si no se puede copiar, la receta se guarda igual y se avisa.
        let imagePath: string | null = null
        const photo = detail.photos[0]
        if (photo) {
          try {
            imagePath = await copyCommunityPhotoToKitchen(photo.path)
          } catch {
            setPhotoMissed(true)
          }
        }
        id = await createRecipe(publicRecipeToKitchenInput(detail.title, publicRecipe, imagePath))
        setPrivateId(id)
      }
      try {
        await register(id)
      } catch (e) {
        // La copia ya está en la Cocina. Solo falta anotarlo: no se vuelve a crear.
        setError(communityErrorText(e))
        setPhase('record-failed')
      }
    } catch (e) {
      setError(errorMessage(e, 'No se ha podido guardar la receta en tu Cocina.'))
      setPhase('idle')
    }
  }

  const kitchenLink = privateId ? `/alimentacion?tab=Recetas&receta=${encodeURIComponent(privateId)}` : '/alimentacion?tab=Recetas'
  const already = recipe.importedByMyFamily

  return (
    <div className="community-import">
      {phase === 'done' && (
        <p className="community-notice ok" role="status">
          ✅ Guardada en tu Cocina. Es una copia tuya: puedes cambiarla sin que cambie la de Comunidad.{' '}
          <Link to={kitchenLink}>Abrirla en mi Cocina</Link>
          {photoMissed && <span className="muted"> (No se ha podido copiar la foto.)</span>}
        </p>
      )}

      {phase === 'record-failed' && (
        <div>
          <p className="community-notice" role="alert">
            La receta ya está en tu Cocina, pero no se ha podido anotar en Comunidad. {error}
          </p>
          <button type="button" className="primary" onClick={() => privateId && register(privateId).catch((e) => setError(communityErrorText(e)))}>
            Volver a intentarlo
          </button>
        </div>
      )}

      {phase !== 'done' && phase !== 'record-failed' && !already && (
        <button type="button" className="primary" data-help-id="comunidad.recipe-import" onClick={run} disabled={phase === 'working'}>
          {phase === 'working' ? 'Guardando…' : '📥 Guardar en mi Cocina'}
        </button>
      )}

      {phase !== 'done' && phase !== 'record-failed' && already && (
        <>
          <p className="community-notice" role="status">
            Tu familia ya guardó esta receta en su Cocina. No hace falta guardarla otra vez.
          </p>
          {!confirmAgain ? (
            <button type="button" className="link-button" style={{ minHeight: 44 }} onClick={() => setConfirmAgain(true)}>
              Guardar otra copia
            </button>
          ) : (
            <div>
              <p className="muted" style={{ margin: '0 0 6px' }}>
                Se creará otra receta en tu Cocina. En Comunidad tu familia se cuenta una sola vez.
              </p>
              <button type="button" className="primary" onClick={run} disabled={phase === 'working'}>
                {phase === 'working' ? 'Guardando…' : 'Sí, guardar otra copia'}
              </button>{' '}
              <button type="button" className="link-button" style={{ minHeight: 44 }} onClick={() => setConfirmAgain(false)}>
                No
              </button>
            </div>
          )}
        </>
      )}

      {phase === 'idle' && error && <p className="error">{error}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Se guarda una copia que puedes editar. No se comparte nada de tu familia con quien la publicó.
      </p>
    </div>
  )
}
