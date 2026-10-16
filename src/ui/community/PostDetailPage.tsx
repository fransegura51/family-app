import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigationType, useParams, useSearchParams } from 'react-router-dom'
import { getPost, unblockUser } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { KIND_ICONS, KIND_LABELS, anecdoteTypeTag, type BlockedCard, type HiddenPostNotice, type PostDetail } from '@/domain/community'
import { formatLongDate, isBlockedLayer, isHiddenNotice, sortPhotos, type PostLookup } from '@/domain/communityPost'
import { ArticleSources } from '@/ui/community/ArticleSources'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { CommentComposer, type ReplyTarget } from '@/ui/community/CommentComposer'
import { CommentsSection, type CommentsRefresh } from '@/ui/community/CommentsSection'
import { ReadOnlyHint } from '@/ui/community/CommunityAccessNotices'
import { CommunityRichText } from '@/ui/community/CommunityRichText'
import { useCommunityAccess } from '@/ui/community/useCommunityAccess'
import { PhotoLightbox } from '@/ui/community/PhotoLightbox'
import { PollBox } from '@/ui/community/PollBox'
import { PostActions } from '@/ui/community/PostActions'
import { MenuPostPanel } from '@/ui/community/menu/MenuPostPanel'
import { MenuDietaryWarnings } from '@/ui/MenuDietaryWarnings'
import { RecipePanel } from '@/ui/community/recipes/RecipePanel'
import { pageCrumbs, paths, postCrumbs } from '@/ui/community/communityNav'
import { useCommunityPhotoUrls } from '@/ui/community/communityPhotoUrl'
import '@/ui/community/communityPost.css'

// Página completa de una publicación (no es un modal). Entra por /comunidad/p/:id; desde un aviso llega con ?nuevos=1&c=<id de comentario>.
type PageState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'gone' }
  | { status: 'hidden'; notice: HiddenPostNotice }
  | { status: 'blocked'; card: BlockedCard }
  | { status: 'ok'; detail: PostDetail }

export function PostDetailPage() {
  const { id = '' } = useParams()
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  // Al cambiar de publicación se vuelve al estado de «cargando» (al recargar la misma, por ejemplo tras bloquear, se sustituye sin parpadeo).
  const lastId = useRef(id)
  if (lastId.current !== id) {
    lastId.current = id
    setState({ status: 'loading' })
  }

  useEffect(() => {
    let cancelled = false
    getPost(id)
      .then((found) => {
        if (cancelled) return
        // El servidor puede devolver también la capa neutra de bloqueado, que el contrato de datos no tipa: se amplía aquí.
        const r: PostLookup = found
        if (!r) setState({ status: 'gone' })
        else if (isHiddenNotice(r)) setState({ status: 'hidden', notice: r })
        else if (isBlockedLayer(r)) setState({ status: 'blocked', card: r })
        else setState({ status: 'ok', detail: r })
      })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: communityErrorText(e) })
      })
    return () => {
      cancelled = true
    }
  }, [id, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const patch = useCallback((p: Partial<PostDetail>) => {
    setState((s) => (s.status === 'ok' ? { status: 'ok', detail: { ...s.detail, ...p } } : s))
  }, [])

  if (state.status === 'loading') {
    return (
      <div className="community-post-page">
        <Breadcrumbs crumbs={pageCrumbs('Publicación')} />
        <p className="muted" role="status">
          Cargando la publicación…
        </p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="community-post-page">
        <Breadcrumbs crumbs={pageCrumbs('Publicación')} />
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" className="primary" onClick={reload}>
          Reintentar
        </button>
      </div>
    )
  }

  // El servidor no devuelve nada si no existe, se eliminó, está oculta o no se puede ver: aviso neutro, sin ningún dato.
  if (state.status === 'gone') {
    return (
      <div className="community-post-page">
        <Breadcrumbs crumbs={pageCrumbs('Publicación')} />
        <h1>Esta publicación ya no está disponible</h1>
        <Link to={paths.home} className="link-button">
          Volver a la portada de Comunidad
        </Link>
      </div>
    )
  }

  // Solo su autor recibe este aviso mínimo (con su título); nadie más ve nada.
  if (state.status === 'hidden') {
    return (
      <div className="community-post-page">
        <Breadcrumbs crumbs={pageCrumbs('Publicación')} />
        <h1 className="community-post-title">{state.notice.title}</h1>
        <p className="community-notice" role="status">
          Una persona de la administración ha ocultado esta publicación.
        </p>
        <Link to={paths.home} className="link-button">
          Volver a la portada de Comunidad
        </Link>
      </div>
    )
  }

  if (state.status === 'blocked') {
    return <BlockedPost authorId={state.card.authorId} onChanged={reload} />
  }

  return <PostView key={state.detail.id} detail={state.detail} patch={patch} reload={reload} />
}

// Capa neutra: el servidor no manda el contenido de alguien bloqueado, solo permite desbloquear.
function BlockedPost({ authorId, onChanged }: { authorId: string; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="community-post-page">
      <Breadcrumbs crumbs={pageCrumbs('Publicación')} />
      <div className="community-blocked-card" role="group" aria-label="Contenido de usuario bloqueado por ti">
        <p>Contenido de usuario bloqueado por ti</p>
        <button
          type="button"
          className="link-button"
          onClick={async () => {
            try {
              await unblockUser(authorId)
              onChanged()
            } catch (e) {
              setError(communityErrorText(e))
            }
          }}
        >
          Desbloquear
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

function PostView({ detail, patch, reload }: { detail: PostDetail; patch: (p: Partial<PostDetail>) => void; reload: () => void }) {
  const [search] = useSearchParams()
  const navType = useNavigationType()
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null)
  const [refresh, setRefresh] = useState<CommentsRefresh>({ token: 0 })
  const [lightbox, setLightbox] = useState<number | null>(null)

  const fromNotification = search.get('nuevos') === '1'
  const targetCommentId = search.get('c')
  // Dato de entrada que no cambia aunque se actualice el contador al comentar (la conversación se prepara con lo que había al abrir).
  const initialCommentCount = useRef(detail.commentCount).current

  // Una publicación nueva empieza arriba (salvo al volver atrás o al llegar a un comentario concreto, donde manda el desplazamiento propio).
  useEffect(() => {
    if (navType !== 'POP' && !targetCommentId && !fromNotification) window.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.id])

  // Fotos: por el Worker (contenido publicado); la que no cargue pasa a una dirección firmada una vez (p. ej. la propia publicación aún no visible para todos).
  const photoPaths = sortPhotos(detail.photos).map((p) => p.path)
  const { urls: resolvedUrls, onError: onPhotoError } = useCommunityPhotoUrls(photoPaths)
  const gallery = photoPaths.flatMap((path, i) => (resolvedUrls[i] ? [{ path, url: resolvedUrls[i] as string }] : []))
  const photoUrls = gallery.map((g) => g.url)
  const author = detail.authorDeleted ? 'Usuario eliminado' : (detail.authorAlias ?? 'Alguien')
  const clearReply = useCallback(() => setReplyTarget(null), [])
  // Interactuar (comentar, responder, votar, me gusta…) exige además el permiso de participar; con solo lectura se ve todo pero no se puede interactuar.
  const { canParticipate } = useCommunityAccess()
  const canInteract = detail.canInteract && canParticipate

  return (
    <article className="community-post-page">
      <Breadcrumbs crumbs={postCrumbs(detail.section)} />

      <header className="community-post-header">
        <p className="community-post-meta">
          <span>
            {KIND_ICONS[detail.kind]} {KIND_LABELS[detail.kind]}
          </span>
          {anecdoteTypeTag(detail.kind, detail.anecdoteType) && <span className="community-tag-subtype">{anecdoteTypeTag(detail.kind, detail.anecdoteType)}</span>}
          <span>· {detail.topicLabel}</span>
          {(detail.isOfficial || detail.authorIsOfficial) && <span className="community-tag-official">Oficial</span>}
          {detail.isOfficial && detail.officialLabel && <span className="community-tag-official">{detail.officialLabel}</span>}
          {detail.featured && <span className="community-tag-featured">⭐ Destacado por la comunidad</span>}
        </p>
        <h1 className="community-post-title">{detail.title}</h1>
        <p className="community-post-author">
          <span aria-hidden="true">{detail.authorAvatar ?? '🙂'}</span>{' '}
          {detail.authorDeleted ? (
            <span>{author}</span>
          ) : (
            <Link to={paths.profile(detail.authorId)} aria-label={`Ver el perfil de ${author}`}>
              {author}
            </Link>
          )}
          <span className="muted"> · {formatLongDate(detail.createdAt)}</span>
          {detail.editedAt && <span className="muted"> · Editado</span>}
        </p>
      </header>

      {photoUrls.length > 0 && (
        <div className={'community-gallery' + (photoUrls.length === 1 ? ' single' : '')} role="group" aria-label="Fotos de la publicación">
          {gallery.map(({ path, url: u }, i) => (
            <button key={path} type="button" className="community-gallery-item" aria-label={`Ampliar la foto ${i + 1} de ${photoUrls.length}`} onClick={() => setLightbox(i)}>
              <img src={u} alt={`Foto ${i + 1} de ${photoUrls.length}`} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" onError={() => onPhotoError(path)} />
            </button>
          ))}
        </div>
      )}

      {/* Menú semanal oficial: el plan con sus acciones sustituye al cuerpo solo-texto (que queda como introducción plegable). */}
      {detail.kind === 'menu' ? <MenuPostPanel detail={detail} renderWarnings={(items) => <MenuDietaryWarnings items={items} />} /> : detail.body && <CommunityRichText text={detail.body} className="community-post-body" />}

      {detail.kind === 'receta' && <RecipePanel detail={detail} onChanged={reload} />}
      {detail.kind === 'encuesta' && <PollBox postId={detail.id} canInteract={canInteract} />}
      {detail.kind === 'articulo' && <ArticleSources raw={detail.articleSources} />}

      <PostActions detail={detail} onPatch={patch} onReload={reload} />
      <ReadOnlyHint />

      <CommentsSection
        postId={detail.id}
        commentCount={initialCommentCount}
        canInteract={canInteract}
        fromNotification={fromNotification}
        targetCommentId={targetCommentId}
        refresh={refresh}
        onReply={setReplyTarget}
      />

      {/* El campo para comentar va el último y queda fijo abajo en móvil, aunque la conversación esté plegada. Sin interacción posible, no se enseña. */}
      {canInteract && (
        <CommentComposer
          postId={detail.id}
          replyTarget={replyTarget}
          onCancelReply={clearReply}
          onPosted={(newId) => {
            setReplyTarget(null)
            patch({ commentCount: detail.commentCount + 1 })
            setRefresh((r) => ({ token: r.token + 1, jumpTo: newId }))
          }}
        />
      )}

      {lightbox !== null && <PhotoLightbox urls={photoUrls} startIndex={lightbox} label="Fotos de la publicación" onClose={() => setLightbox(null)} />}
    </article>
  )
}
