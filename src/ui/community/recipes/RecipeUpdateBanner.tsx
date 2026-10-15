import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecipeUpdate, markRecipeUpdated } from '@/data/community'
import { communityStatusCache } from '@/data/communityStatusCache'
import { updateRecipe } from '@/data/food'
import { CommunityError, communityErrorText } from '@/domain/communityErrors'
import type { RecipeUpdateInfo } from '@/domain/community'
import { privateCopyEditedSinceImport, privateRecipeToDiffRecipe, recipeUpdateToKitchenInput } from '@/domain/communityRecipeBridge'
import { diffRecipes, summarizeDiff, type DiffRecipe } from '@/domain/communityRecipeDiff'
import type { Recipe } from '@/domain/types'
import { paths } from '@/ui/community/communityNav'
import { RecipeVersionCompare } from '@/ui/community/recipes/RecipeVersionCompare'
import { browserStore, forgetNotImported, isKnownNotImported, rememberNotImported, shouldAskForUpdate } from '@/ui/community/recipes/recipeUpdateCache'
import { FocusScope } from '@/ui/community/FocusScope'
import { useCommunityVisible } from '@/ui/community/useCommunityVisible'
import '@/ui/community/recipes/communityRecipes.css'

// Aviso «Hay una versión nueva» dentro de la ficha de una receta de la Cocina que se importó de Comunidad (CMN-§5.3).
//  - Se consulta SOLO al abrir esa receta, una vez por sesión (y las recetas que no son importadas se recuerdan en el dispositivo y no se vuelven a consultar).
//  - Nunca cambia nada solo: enseña la comparación y la familia elige «Actualizar mi copia» o «Dejarla como está».

// Una consulta por receta y sesión (si se abre varias veces la misma receta, no se repite).
const sessionLookups = new Map<string, Promise<RecipeUpdateInfo | null>>()

function lookup(privateRecipeId: string): Promise<RecipeUpdateInfo | null> {
  let p = sessionLookups.get(privateRecipeId)
  if (!p) {
    p = getRecipeUpdate(privateRecipeId).then((info) => {
      // null = no es una importación: se recuerda para siempre en este dispositivo.
      if (info === null) rememberNotImported(browserStore(), privateRecipeId)
      return info
    })
    sessionLookups.set(privateRecipeId, p)
    // Si falla (sin red) no se queda guardado el fallo: la próxima vez se vuelve a intentar.
    p.catch(() => sessionLookups.delete(privateRecipeId))
  }
  return p
}

export function RecipeUpdateBanner({ recipe, onUpdated }: { recipe: Recipe; onUpdated: () => void }) {
  const recipeId = recipe.id
  // El resultado lleva el id al que corresponde: al cambiar de receta el anterior deja de valer sin resetear nada dentro del efecto.
  const [result, setResult] = useState<{ id: string; info: RecipeUpdateInfo | null } | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Si la copia ya se cambió pero no se pudo anotar en Comunidad, solo se reintenta anotar (no se vuelve a tocar la receta).
  const [needsMark, setNeedsMark] = useState(false)

  // Coste (INC-17): si Comunidad no está abierta para esta persona (o aún no se sabe), NO se pregunta nada a Supabase por esta receta. El estado se recuerda
  // 2 minutos y se comparte con Inicio, así que saberlo no añade consultas.
  const visible = useCommunityVisible()

  useEffect(() => {
    if (!shouldAskForUpdate(visible, isKnownNotImported(browserStore(), recipeId))) return
    let cancelled = false
    lookup(recipeId).then(
      (info) => {
        if (!cancelled) setResult({ id: recipeId, info })
      },
      (e: unknown) => {
        // Sin red o sin Comunidad: la receta se ve igual, sin aviso. Si el servidor dice que Comunidad no está abierta o que no hay acceso, se olvida el
        // estado recordado para que las demás recetas no vuelvan a preguntar.
        const code = e instanceof CommunityError ? e.code : null
        if (code === 'NOT_LAUNCHED' || code === 'COMMUNITY_ACCESS_DENIED') communityStatusCache.clear()
      },
    )
    return () => {
      cancelled = true
    }
  }, [recipeId, visible])

  const info = result?.id === recipeId ? result.info : null
  const compare = useMemo(() => {
    if (!info?.available || !info.hasUpdate || !info.current) return null
    const current: DiffRecipe = info.current
    // Si falta la versión que importó (no debería), se compara con la copia actual de la familia.
    const imported: DiffRecipe | null = info.imported ?? null
    const before = imported ?? privateRecipeToDiffRecipe(recipe)
    return { current, imported, diff: diffRecipes(before, current), edited: imported ? privateCopyEditedSinceImport(recipe, imported) : false }
  }, [info, recipe])

  if (!info || !compare) return null

  async function mark() {
    await markRecipeUpdated(recipeId)
    sessionLookups.delete(recipeId)
    forgetNotImported(browserStore(), recipeId)
  }

  async function apply() {
    if (!compare || !info) return
    setBusy(true)
    setError(null)
    // `updated` va aparte del estado porque el estado de React no se ve dentro de esta misma ejecución.
    let updated = needsMark
    try {
      if (!updated) {
        await updateRecipe(recipeId, recipeUpdateToKitchenInput(recipe, compare.current, compare.imported))
        updated = true
        setNeedsMark(true)
      }
      await mark()
      setNeedsMark(false)
      setOpen(false)
      setResult({ id: recipeId, info: { ...info, hasUpdate: false } })
      onUpdated()
    } catch (e) {
      setError(updated ? `Tu receta ya está actualizada, pero no se ha podido anotar en Comunidad. ${communityErrorText(e)}` : communityErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const summary = summarizeDiff(compare.diff)
  return (
    <div className="community-update-banner" role="status">
      <strong>🆕 Hay una versión nueva de esta receta en Comunidad</strong>
      {summary && <span>{summary}</span>}
      <span className="muted">Tu copia no cambia sola. Mira qué ha cambiado y decide si quieres actualizarla.</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => setOpen(true)}>
          Ver los cambios
        </button>
        {info.postId && <Link to={paths.post(info.postId)}>Ver la receta en Comunidad</Link>}
      </div>

      {open && (
        <FocusScope>
          <div className="modal-overlay" role="presentation" onClick={() => !busy && setOpen(false)}>
            <div className="modal-sheet" role="dialog" aria-modal="true" aria-label="Comparar versiones de la receta" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Versión nueva
                </h2>
                <button type="button" className="modal-close" aria-label="Cerrar" onClick={() => setOpen(false)} disabled={busy}>
                  ✕
                </button>
              </div>
              <p className="muted">
                Tú tienes la versión {info.importedVersion ?? '—'} y la actual es la {info.currentVersion ?? '—'}. Esto es lo que ha cambiado:
              </p>
              <RecipeVersionCompare diff={compare.diff} />
              {compare.edited && (
                <p className="community-notice">
                  Has cambiado tu copia desde que la guardaste. Si actualizas, tu receta quedará como la versión nueva y se perderán esos cambios. Se mantienen tu foto y tus
                  etiquetas.
                </p>
              )}
              {error && <p className="error">{error}</p>}
              <div className="community-compare-actions">
                <button type="button" className="primary" onClick={apply} disabled={busy}>
                  {busy ? 'Actualizando…' : needsMark ? 'Reintentar' : 'Actualizar mi copia'}
                </button>
                <button type="button" className="link-button" onClick={() => setOpen(false)} disabled={busy}>
                  Dejarla como está
                </button>
              </div>
            </div>
          </div>
        </FocusScope>
      )}
    </div>
  )
}
