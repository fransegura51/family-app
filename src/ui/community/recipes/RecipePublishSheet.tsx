import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createPost, getMyCommunityProfile, listCommunityTopics, removeCommunityPhoto } from '@/data/community'
import { getRecipePhotoUrl } from '@/data/food'
import { communityErrorCode, communityErrorText } from '@/domain/communityErrors'
import type { CommunityTopic, RecipeDraftInput } from '@/domain/community'
import { MAX_TITLE } from '@/domain/community'
import {
  canPublishRecipe,
  cleanRecipeDraft,
  privateRecipeToDraft,
  recipePublishProblems,
} from '@/domain/communityRecipeBridge'
import { splitSteps } from '@/domain/communityRecipeDiff'
import { formatServingsValue } from '@/domain/servingsSourceNote'
import type { Recipe } from '@/domain/types'
import { paths } from '@/ui/community/communityNav'
import { CommunityProvider, useCommunity } from '@/ui/community/CommunityProvider'
import { MINORS_NO_PHOTOS_NOTE, participationBlockedText } from '@/domain/communityAccess'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
import { useCommunityPhotosAllowed } from '@/ui/community/useCommunityPhotosAllowed'
import { RecipeConsentCheckbox } from '@/ui/community/recipes/RecipeConsentCheckbox'
import { RecipeFields } from '@/ui/community/recipes/RecipeFields'
import { RecipeTitleField } from '@/ui/recipeEditor/RecipeEditorFields'
import { copyPrivatePhotoToCommunity } from '@/ui/community/recipes/recipePhotoCopy'
import { browserStore, rememberShared, sharedPostFor } from '@/ui/community/recipes/recipeUpdateCache'
import { useSimilarRecipes } from '@/ui/community/recipes/useSimilarRecipes'
import '@/ui/community/recipes/communityRecipes.css'
import { useDialogFocus } from '@/ui/community/useDialogFocus'

// «Compartir en Comunidad» (CMN-§5.1, recorrido D): publica una receta de la Cocina como copia PÚBLICA e INDEPENDIENTE.
//  - NUNCA se publica nada solo: la persona ve la vista previa de lo que será público, puede cambiarlo, elige tema y foto, MARCA la casilla de
//    consentimiento (obligatoria) y pulsa «Publicar».
//  - La copia pública no lleva ningún id ni dato de la familia. Cambiar después la receta privada NO cambia la pública (ni al revés).
//  - La foto es opcional: se copia la de la Cocina (por enlace firmado), se vuelve a dibujar para quitarle los datos ocultos (GPS…) y se sube a Comunidad.

// Se monta dentro de la Cocina, que no está dentro de las pantallas de Comunidad: por eso lleva su propio CommunityProvider (estado y alias). Solo se carga y
// consulta cuando la persona pulsa «Compartir en Comunidad».
export function RecipePublishHost(props: { recipe: Recipe; onClose: () => void }) {
  return (
    <CommunityProvider>
      <RecipePublishSheet {...props} />
    </CommunityProvider>
  )
}

function PublicPreview({ title, draft, photoUrl }: { title: string; draft: RecipeDraftInput; photoUrl: string | null }) {
  const steps = splitSteps(draft.steps)
  return (
    <div className="community-recipe-preview" aria-label="Vista previa de lo que será público">
      {photoUrl && <img src={photoUrl} alt="Foto de la receta" />}
      <h3 style={{ fontSize: 18 }}>{title.trim() || 'Sin nombre'}</h3>
      {draft.servings !== null && <p style={{ margin: 0 }}>👥 Raciones: {formatServingsValue(draft.servings)}</p>}
      {draft.tags.length > 0 && (
        <p style={{ margin: 0 }}>
          {draft.tags.map((t) => (
            <span key={t} className="chip" style={{ marginRight: 4 }}>
              {t}
            </span>
          ))}
        </p>
      )}
      <div>
        <h3>Ingredientes</h3>
        {draft.ingredients.length > 0 ? (
          <ul className="community-recipe-ingredients">
            {draft.ingredients.map((i, k) => (
              <li key={k}>
                {i.name}
                {(i.quantity || i.unit) && ` — ${[i.quantity, i.unit].filter(Boolean).join(' ')}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="error">Falta al menos un ingrediente.</p>
        )}
      </div>
      <div>
        <h3>Preparación</h3>
        {steps.length > 0 ? (
          <ol className="community-recipe-steps">
            {steps.map((s, k) => (
              <li key={k}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">Sin pasos escritos.</p>
        )}
      </div>
    </div>
  )
}

export function RecipePublishSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { status, me, requireParticipation } = useCommunity()
  const initial = useMemo(() => privateRecipeToDraft(recipe), [recipe])
  const [title, setTitle] = useState(initial.title)
  const [draft, setDraft] = useState<RecipeDraftInput>(initial.recipe)
  const [body, setBody] = useState('')
  const [topicId, setTopicId] = useState('')
  const [topics, setTopics] = useState<CommunityTopic[]>([])
  const [topicsError, setTopicsError] = useState<string | null>(null)
  const [includePhoto, setIncludePhoto] = useState(!!recipe.imagePath)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishedId, setPublishedId] = useState<string | null>(null)
  // Si ya se compartió desde este dispositivo, se avisa (crear otra publicación sería una copia repetida).
  const alreadySharedId = useMemo(() => sharedPostFor(browserStore(), recipe.id), [recipe.id])
  const dialogRef = useDialogFocus<HTMLDivElement>()

  // Temas de «Recetas y cocina» (una consulta al abrir) y foto de vista previa (enlace firmado de la Cocina: solo la ve quien la abre).
  useEffect(() => {
    let cancelled = false
    listCommunityTopics().then(
      (all) => {
        if (!cancelled) setTopics(all.filter((t) => t.section === 'recetas'))
      },
      (e: unknown) => {
        if (!cancelled) setTopicsError(communityErrorText(e))
      },
    )
    if (recipe.imagePath) {
      getRecipePhotoUrl(recipe.imagePath).then(
        (u) => {
          if (!cancelled) setPhotoUrl(u)
        },
        () => undefined,
      )
    }
    return () => {
      cancelled = true
    }
  }, [recipe.imagePath])

  const clean = useMemo(() => cleanRecipeDraft(draft), [draft])
  const problems = recipePublishProblems(title, draft)
  // Cerrada = Comunidad no abierta, sin acceso por edad/permisos, o permiso solo de lectura (no se puede publicar): se explica el motivo exacto.
  const { canParticipate } = useCommunityAccess()
  // Las personas menores de edad participan sin fotos: no se ofrece incluir la portada de la receta (una consulta por sesión, solo si la receta tiene foto).
  const { photosAllowed, forbid: forbidPhotosForMe } = useCommunityPhotosAllowed(!!recipe.imagePath)
  const withPhoto = includePhoto && photosAllowed !== false
  const blockedText = participationBlockedText(status)
  const closed = (status !== null && !status.visible) || !canParticipate
  // «¿Es lo mismo que…?»: hasta 3 parecidas, solo una ayuda (nunca bloquea «Publicar»).
  const similar = useSimilarRecipes(title, !closed && !publishedId)
  const canPublish = !closed && !publishedId && canPublishRecipe({ consent, topicId: topicId || null, title, draft })

  async function publish() {
    if (!canPublish || busy) return
    setBusy(true)
    setError(null)
    let uploaded: string | null = null
    try {
      // Alias y normas la primera vez (si cancela, no se publica nada).
      if (!(await requireParticipation())) return
      if (withPhoto && recipe.imagePath) {
        // El id del perfil público puede no estar aún en el estado si acaba de elegir alias: se pide directamente.
        const profileId = me?.id ?? (await getMyCommunityProfile())?.id
        if (!profileId) {
          setError('No se ha podido preparar tu perfil público. Inténtalo de nuevo.')
          return
        }
        try {
          uploaded = await copyPrivatePhotoToCommunity(profileId, recipe.imagePath)
        } catch (e) {
          setError(`No se ha podido copiar la foto (${communityErrorText(e)}). Quita la foto de la lista y vuelve a publicar.`)
          return
        }
      }
      const id = await createPost({
        kind: 'receta',
        section: 'recetas',
        topicId,
        title: title.trim(),
        body: body.trim(),
        photos: uploaded ? [uploaded] : [],
        recipe: clean,
        // La casilla de consentimiento está marcada (si no, «Publicar» no está activo): el servidor anota solo la fecha de ese consentimiento.
        recipeConsent: consent,
      })
      rememberShared(browserStore(), recipe.id, id)
      setPublishedId(id)
    } catch (e) {
      // Si la publicación falla, la foto subida se retira (quedaría huérfana en Comunidad).
      if (uploaded) await removeCommunityPhoto(uploaded)
      if (communityErrorCode(e) === 'PHOTOS_NOT_ALLOWED') {
        // Persona menor de edad: sin foto. Se desmarca y puede volver a publicar la receta sin ella.
        forbidPhotosForMe()
        setIncludePhoto(false)
        setError(`${communityErrorText(e)} Hemos quitado la foto: vuelve a publicar la receta.`)
      } else {
        setError(communityErrorText(e))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={() => !busy && onClose()} onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-sheet community-recipe-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-publish-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="community-publish-title" className="section-title" style={{ margin: 0 }}>
            Compartir en Comunidad
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar" disabled={busy}>
            ✕
          </button>
        </div>

        {publishedId ? (
          <div role="status">
            <p className="community-notice ok">🎉 ¡Tu receta ya es pública! Otras familias pueden leerla, valorarla y guardarla en su Cocina.</p>
            <p className="muted">Tu receta de la Cocina sigue siendo solo tuya. Si la cambias, la pública no cambia sola: puedes editar la pública desde Comunidad.</p>
            <div className="community-recipe-sheet-actions">
              <Link to={paths.post(publishedId)} className="primary" style={{ textAlign: 'center', padding: 14, borderRadius: 10 }}>
                Ver mi receta en Comunidad
              </Link>
              <button type="button" className="link-button" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        ) : closed ? (
          <p className="community-notice">{blockedText ?? 'Comunidad todavía no está abierta. Cuando se abra podrás compartir tus recetas.'}</p>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              Vas a publicar una <strong>copia</strong> de esta receta para que la lea cualquier persona. Tu receta de la Cocina no cambia ni se enlaza con la pública.
            </p>

            {alreadySharedId && (
              <p className="community-notice" role="status">
                Ya compartiste esta receta desde este dispositivo. <Link to={paths.post(alreadySharedId)}>Ver la publicada</Link>. Si publicas otra vez se creará una copia más.
              </p>
            )}

            {similar.length > 0 && (
              <div className="community-similar" role="region" aria-label="Publicaciones parecidas">
                <p>
                  <strong>¿Es lo mismo que…?</strong>
                </p>
                <p className="muted">Quizá ya se ha publicado algo parecido. Es solo una ayuda: puedes seguir y publicar igualmente.</p>
                <ul>
                  {similar.map((p) => (
                    // Se abren en otra pestaña para no perder esta hoja.
                    <li key={p.id}>
                      <Link to={paths.post(p.id)} target="_blank" rel="noopener noreferrer">
                        {p.title} <span className="muted">(se abre en otra pestaña)</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {editing ? (
              <div className="community-recipe-sheet">
                <RecipeTitleField label="Nombre de la receta" value={title} onChange={setTitle} maxLength={MAX_TITLE} large={false} disabled={busy} />
                <RecipeFields value={draft} onChange={setDraft} disabled={busy} />
                <button type="button" className="link-button" style={{ minHeight: 44, alignSelf: 'flex-start' }} onClick={() => setEditing(false)}>
                  Listo, ver cómo queda
                </button>
              </div>
            ) : (
              <>
                <PublicPreview title={title} draft={clean} photoUrl={withPhoto ? photoUrl : null} />
                <button type="button" className="link-button" style={{ minHeight: 44, alignSelf: 'flex-start' }} onClick={() => setEditing(true)} disabled={busy}>
                  ✏️ Cambiar algo antes de publicar
                </button>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Los cambios que hagas aquí solo afectan a la copia pública.
                </p>
              </>
            )}

            {recipe.imagePath && photosAllowed === false && <p className="muted">{MINORS_NO_PHOTOS_NOTE}</p>}
            {recipe.imagePath && photosAllowed !== false && (
              <label className="checkbox-label" style={{ minHeight: 44 }}>
                <input type="checkbox" checked={includePhoto} onChange={(e) => setIncludePhoto(e.target.checked)} disabled={busy} />
                <span>
                  Incluir la foto de mi receta. <span className="muted">Comprueba que no salgan personas ni datos privados.</span>
                </span>
              </label>
            )}

            <label className="community-field">
              <span>Tema (obligatorio)</span>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={busy} aria-required="true">
                <option value="">Elige un tema…</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {topicsError && <span className="error">{topicsError}</span>}
            </label>

            <label className="community-field">
              <span>Algo que contar de la receta (opcional)</span>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} disabled={busy} placeholder="Por ejemplo, de dónde viene o cuándo la haces." />
            </label>

            {problems.length > 0 && (
              <ul className="error" style={{ margin: 0, paddingLeft: 20 }}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}

            <RecipeConsentCheckbox checked={consent} onChange={setConsent} disabled={busy} />

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <div className="community-recipe-sheet-actions">
              <button type="button" className="primary" onClick={publish} disabled={!canPublish || busy}>
                {busy ? 'Publicando…' : 'Publicar en Comunidad'}
              </button>
              <button type="button" className="link-button" onClick={onClose} disabled={busy}>
                Cancelar
              </button>
            </div>
            {!consent && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Para publicar tienes que marcar la casilla de arriba.</p>}
          </>
        )}
      </div>
    </div>
  )
}
