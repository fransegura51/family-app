import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MAX_COMMENT, type CommentNode } from '@/domain/community'
import { newRepliesOf } from '@/domain/communityComments'
import { relativeTimeEs } from '@/domain/communityPost'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { CommunityRichText } from '@/ui/community/CommunityRichText'
import { ContentMenu } from '@/ui/community/ContentMenu'
import { paths } from '@/ui/community/communityNav'
import { useCommunityPhotoUrl } from '@/ui/community/communityPhotoUrl'
import '@/ui/community/communityPost.css'

export interface CommentActions {
  onLike: (c: CommentNode) => void
  onReply: (c: CommentNode) => void
  onEdit: (c: CommentNode, body: string) => Promise<string | null>
  onDelete: (c: CommentNode) => void
  onReport: (c: CommentNode) => void
  onBlock: (c: CommentNode) => void
  onUnblock: (c: CommentNode) => void
  onOpenPhoto: (url: string) => void
}

// Un comentario (raíz o respuesta). Tres formas: capa neutra si la persona ha bloqueado a su autor (nada de contenido), aviso neutro «Comentario eliminado» (el
// servidor lo manda cuando tiene respuestas) y comentario normal. Si no se puede interactuar, no se enseñan las acciones (sin explicar el motivo).
export function CommentItem({
  comment,
  isReply,
  actions,
  watchRef,
  highlighted,
  readOnly,
  children,
}: {
  comment: CommentNode
  isReply: boolean
  actions: CommentActions
  // Solo se pasa en comentarios NUEVOS: lo usa el vigilante de exposición para marcarlos como vistos.
  watchRef?: (el: HTMLElement | null) => void
  highlighted?: boolean
  // La publicación no admite interacciones de esta persona: se ocultan las acciones (sin explicar el motivo).
  readOnly?: boolean
  children?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Foto del comentario: por el Worker (los comentarios visibles están publicados); si no carga, firmada una vez.
  const photo = useCommunityPhotoUrl(comment.photoPath)

  const cls = 'community-comment' + (isReply ? ' is-reply' : '') + (comment.isNew ? ' is-new' : '') + (highlighted ? ' is-target' : '')

  if (comment.blockedByMe) {
    return (
      <li className={cls} id={`c-${comment.id}`}>
        <div className="community-blocked-card" role="group" aria-label="Contenido de usuario bloqueado por ti">
          <p>Contenido de usuario bloqueado por ti</p>
          <button type="button" className="link-button" onClick={() => actions.onUnblock(comment)}>
            Desbloquear
          </button>
        </div>
        {children}
      </li>
    )
  }

  if (comment.status === 'removed') {
    return (
      <li className={cls} id={`c-${comment.id}`}>
        <p className="community-comment-removed">Comentario eliminado</p>
        {children}
      </li>
    )
  }

  const author = comment.authorDeleted ? 'Usuario eliminado' : (comment.authorAlias ?? 'Alguien')
  const interactive = comment.canInteract !== false && !readOnly
  // Quien solo puede LEER (menor con permiso de lectura, sin alias…) sí puede denunciar: el menú le enseña solo «Denunciar».
  const reportOnly = !interactive && !comment.mine
  const newReplies = newRepliesOf(comment)

  async function saveEdit() {
    if (saving) return
    setSaving(true)
    setEditError(null)
    const err = await actions.onEdit(comment, draft)
    setSaving(false)
    if (err) setEditError(err)
    else setEditing(false)
  }

  return (
    <li className={cls} id={`c-${comment.id}`}>
      {/* La tarjeta (sin las respuestas) es lo que se vigila en pantalla: así «visto» se refiere a este comentario y no a todo su hilo. */}
      <div className="community-comment-card" ref={watchRef}>
      <div className="community-comment-head">
        <span className="community-comment-avatar" aria-hidden="true">
          {comment.authorAvatar ?? '🙂'}
        </span>
        <span className="community-comment-who">
          {comment.authorDeleted ? (
            <span>{author}</span>
          ) : (
            <Link to={paths.profile(comment.authorId)} aria-label={`Ver el perfil de ${author}`}>
              {author}
            </Link>
          )}
          {comment.authorIsOfficial && <span className="community-tag-official">Oficial</span>}
          <span className="muted"> · {relativeTimeEs(comment.createdAt)}</span>
          {comment.editedAt && <span className="muted"> · Editado</span>}
          {comment.isNew && <span className="community-new-badge"> Nuevo</span>}
        </span>
      </div>
      {isReply && comment.replyToAlias && <p className="muted community-comment-replyto">En respuesta a {comment.replyToAlias}</p>}

      {editing ? (
        <div className="community-comment-edit">
          <label>
            <span className="community-sr-only">Editar tu comentario</span>
            <textarea value={draft} rows={3} maxLength={MAX_COMMENT} onChange={(e) => setDraft(e.target.value)} autoFocus />
          </label>
          {editError && (
            <p className="error" role="alert">
              {editError}
            </p>
          )}
          <div className="community-comment-edit-actions">
            <button type="button" className="primary" disabled={saving || (!draft.trim() && !comment.photoPath)} onClick={() => void saveEdit()}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          {comment.body && <CommunityRichText text={comment.body} className="community-comment-body" />}
          {comment.photoPath && (
            <button type="button" className="community-comment-photo" aria-label="Ampliar la foto del comentario" onClick={() => photo.src && actions.onOpenPhoto(photo.src)}>
              {photo.src && <img src={photo.src} alt="Foto del comentario" loading="lazy" decoding="async" onError={photo.onError} />}
            </button>
          )}
        </>
      )}

      <div className="community-comment-actions">
        {interactive ? (
          <button
            type="button"
            className={'community-action' + (comment.likedByMe ? ' active' : '')}
            aria-pressed={comment.likedByMe}
            aria-label={comment.likedByMe ? `Quitar me gusta (${comment.likeCount})` : `Me gusta (${comment.likeCount})`}
            onClick={() => actions.onLike(comment)}
          >
            <span aria-hidden="true">{comment.likedByMe ? '❤️' : '🤍'}</span> {comment.likeCount}
          </button>
        ) : (
          comment.likeCount > 0 && (
            <span className="community-action-static" aria-label={`${comment.likeCount} me gusta`}>
              ❤️ {comment.likeCount}
            </span>
          )
        )}
        {interactive && (
          <button type="button" className="community-action" onClick={() => actions.onReply(comment)}>
            Responder
          </button>
        )}
        {(interactive || reportOnly) && !editing && (
          <ContentMenu label="Más opciones del comentario">
            {(close) =>
              comment.mine ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      setDraft(comment.body)
                      setEditError(null)
                      setEditing(true)
                    }}
                  >
                    Editar
                  </button>
                  <ConfirmButton label="Eliminar" confirmLabel="Sí, eliminar" confirmMessage="¿Eliminar este comentario?" className="community-menu-danger" onConfirm={() => actions.onDelete(comment)} />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      actions.onReport(comment)
                    }}
                  >
                    Denunciar
                  </button>
                  {interactive && !comment.authorDeleted && !comment.authorIsOfficial && (
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        actions.onBlock(comment)
                      }}
                    >
                      Bloquear a esta persona
                    </button>
                  )}
                </>
              )
            }
          </ContentMenu>
        )}
        {newReplies > 0 && (
          <span className="community-new-badge" role="status">
            {newReplies === 1 ? '1 respuesta nueva' : `${newReplies} respuestas nuevas`}
          </span>
        )}
      </div>
      </div>
      {children}
    </li>
  )
}
