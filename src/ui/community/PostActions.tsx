import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { blockUser, deletePost, followUser, toggleFollowConversation, toggleLike, toggleSave, unfollowUser } from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import type { FollowMode, PostDetail } from '@/domain/community'
import { toggleCount } from '@/domain/communityPost'
import { ConfirmButton } from '@/ui/ConfirmButton'
import { ConfirmDialog, ContentMenu } from '@/ui/community/ContentMenu'
import { ReportDialog } from '@/ui/community/ReportDialog'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { paths } from '@/ui/community/communityNav'
import { getShareUrl, shareCommunityPost } from '@/ui/community/communityShare'
import '@/ui/community/communityPost.css'

const FOLLOW_MODE_LABELS: Record<FollowMode, string> = {
  smart: 'Avisos inteligentes',
  every: 'Avisar de todo',
  off: 'Sin avisos',
}

// Acciones de una publicación: me gusta, guardar, seguir la conversación, seguir a su autor, compartir, denunciar, bloquear y (si es mía) editar y eliminar.
// Cada acción que interactúa pide primero requireParticipation() (alias y normas la primera vez). Los contadores cambian al instante y, si el servidor falla,
// vuelven atrás. Si `canInteract` es falso las acciones de interacción ni se enseñan (sin explicar el motivo).
export function PostActions({ detail, onPatch, onReload }: { detail: PostDetail; onPatch: (p: Partial<PostDetail>) => void; onReload: () => void }) {
  const { requireParticipation } = useCommunity()
  const navigate = useNavigate()
  const busy = useRef(new Set<string>())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [manualUrl, setManualUrl] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [followMode, setFollowMode] = useState<FollowMode | ''>('')

  const interactive = detail.canInteract
  const authorAlias = detail.authorDeleted ? 'Usuario eliminado' : (detail.authorAlias ?? 'esta persona')
  const canFollowAuthor = !detail.isMine && !detail.authorDeleted
  const canBlockAuthor = !detail.isMine && !detail.authorDeleted && !detail.authorIsOfficial

  // Plantilla común: pide participación, evita dobles toques y deja el mensaje de error si algo falla.
  async function run(key: string, work: () => Promise<void>) {
    if (busy.current.has(key)) return
    setError(null)
    setNotice(null)
    if (!(await requireParticipation())) return
    busy.current.add(key)
    try {
      await work()
    } catch (e) {
      setError(communityErrorText(e))
    } finally {
      busy.current.delete(key)
    }
  }

  const like = () =>
    run('like', async () => {
      const before = { liked: detail.likedByMe, count: detail.likeCount }
      const t = toggleCount(before.liked, before.count)
      onPatch({ likedByMe: t.active, likeCount: t.count })
      try {
        const r = await toggleLike('post', detail.id)
        onPatch({ likedByMe: r.liked, likeCount: r.likeCount })
      } catch (e) {
        onPatch({ likedByMe: before.liked, likeCount: before.count })
        throw e
      }
    })

  const save = () =>
    run('save', async () => {
      const before = { saved: detail.savedByMe, count: detail.saveCount }
      const t = toggleCount(before.saved, before.count)
      onPatch({ savedByMe: t.active, saveCount: t.count })
      try {
        const r = await toggleSave(detail.id)
        onPatch({ savedByMe: r.saved, saveCount: r.saveCount })
      } catch (e) {
        onPatch({ savedByMe: before.saved, saveCount: before.count })
        throw e
      }
    })

  const followConversation = () =>
    run('follow-conversation', async () => {
      const before = detail.followingConversation
      onPatch({ followingConversation: !before })
      try {
        onPatch({ followingConversation: await toggleFollowConversation(detail.id) })
      } catch (e) {
        onPatch({ followingConversation: before })
        throw e
      }
    })

  const followAuthor = () =>
    run('follow-author', async () => {
      const before = detail.followingAuthor
      onPatch({ followingAuthor: !before })
      try {
        if (before) {
          await unfollowUser(detail.authorId)
          setFollowMode('')
        } else {
          await followUser(detail.authorId, 'smart')
          setFollowMode('smart')
        }
      } catch (e) {
        onPatch({ followingAuthor: before })
        throw e
      }
    })

  const changeFollowMode = (mode: FollowMode) =>
    run('follow-mode', async () => {
      await followUser(detail.authorId, mode)
      setFollowMode(mode)
    })

  async function share() {
    setError(null)
    setNotice(null)
    const r = await shareCommunityPost(detail.id, detail.title)
    if (r === 'copied') setNotice('Enlace copiado. Ya puedes pegarlo donde quieras.')
    else if (r === 'failed') setManualUrl(getShareUrl(detail.id))
  }

  async function startReport() {
    if (await requireParticipation()) setReporting(true)
  }

  async function startBlock() {
    if (!(await requireParticipation())) return
    setBlockError(null)
    setBlocking(true)
  }

  async function confirmBlock() {
    setBlockBusy(true)
    setBlockError(null)
    try {
      await blockUser(detail.authorId)
      setBlocking(false)
      // La publicación vuelve a pedirse: ahora el servidor la sustituye por la capa neutra.
      onReload()
    } catch (e) {
      setBlockError(communityErrorText(e))
    } finally {
      setBlockBusy(false)
    }
  }

  async function remove() {
    setError(null)
    try {
      await deletePost(detail.id)
      navigate(paths.section(detail.section), { replace: true })
    } catch (e) {
      setError(communityErrorText(e))
    }
  }

  return (
    <div className="community-actions" role="group" aria-label="Acciones de la publicación">
      <div className="community-actions-row">
        {interactive ? (
          <button
            type="button"
            className={'community-action' + (detail.likedByMe ? ' active' : '')}
            aria-pressed={detail.likedByMe}
            aria-label={detail.likedByMe ? `Quitar me gusta (${detail.likeCount})` : `Me gusta (${detail.likeCount})`}
            onClick={() => void like()}
          >
            <span aria-hidden="true">{detail.likedByMe ? '❤️' : '🤍'}</span> Me gusta · {detail.likeCount}
          </button>
        ) : (
          <span className="community-action-static">❤️ {detail.likeCount}</span>
        )}
        {interactive && (
          <button
            type="button"
            className={'community-action' + (detail.savedByMe ? ' active' : '')}
            aria-pressed={detail.savedByMe}
            aria-label={detail.savedByMe ? 'Quitar de mis guardados' : 'Guardar esta publicación'}
            onClick={() => void save()}
          >
            <span aria-hidden="true">{detail.savedByMe ? '🔖' : '📑'}</span> {detail.savedByMe ? 'Guardada' : 'Guardar'}
          </button>
        )}
        {interactive && (
          <button
            type="button"
            className={'community-action' + (detail.followingConversation ? ' active' : '')}
            aria-pressed={detail.followingConversation}
            onClick={() => void followConversation()}
          >
            <span aria-hidden="true">{detail.followingConversation ? '🔔' : '🔕'}</span> {detail.followingConversation ? 'Siguiendo la conversación' : 'Seguir la conversación'}
          </button>
        )}
        <button type="button" className="community-action" onClick={() => void share()}>
          <span aria-hidden="true">📤</span> Compartir
        </button>
        {(interactive || detail.isMine) && (
          <ContentMenu label="Más opciones de la publicación">
            {(close) =>
              detail.isMine ? (
                <>
                  <Link to={paths.edit(detail.id)} onClick={close}>
                    Editar
                  </Link>
                  <ConfirmButton
                    label="Eliminar publicación"
                    confirmLabel="Sí, eliminar"
                    confirmMessage="¿Eliminar esta publicación? No se puede deshacer."
                    className="community-menu-danger"
                    onConfirm={() => void remove()}
                  />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      void startReport()
                    }}
                  >
                    Denunciar
                  </button>
                  {canBlockAuthor && (
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        void startBlock()
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
      </div>

      {interactive && canFollowAuthor && (
        <div className="community-actions-row community-follow-author">
          <button
            type="button"
            className={'community-action' + (detail.followingAuthor ? ' active' : '')}
            aria-pressed={detail.followingAuthor}
            onClick={() => void followAuthor()}
          >
            <span aria-hidden="true">{detail.followingAuthor ? '✔️' : '➕'}</span> {detail.followingAuthor ? `Siguiendo a ${authorAlias}` : `Seguir a ${authorAlias}`}
          </button>
          {detail.followingAuthor && (
            <label className="community-follow-mode">
              <span className="community-sr-only">Avisos de esta persona</span>
              <select value={followMode} aria-label="Avisos de esta persona" onChange={(e) => void changeFollowMode(e.target.value as FollowMode)}>
                <option value="" disabled>
                  Cambiar avisos…
                </option>
                {(Object.keys(FOLLOW_MODE_LABELS) as FollowMode[]).map((m) => (
                  <option key={m} value={m}>
                    {FOLLOW_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
      {manualUrl && (
        <label className="community-share-manual">
          Copia este enlace:
          <input type="text" readOnly value={manualUrl} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {reporting && <ReportDialog type="post" id={detail.id} onClose={() => setReporting(false)} />}
      {blocking && (
        <ConfirmDialog
          title="Bloquear a esta persona"
          text={`No veréis lo que publique la otra persona ni ella lo tuyo. No se le avisa. Puedes desbloquearla cuando quieras.`}
          confirmLabel="Sí, bloquear"
          busy={blockBusy}
          error={blockError}
          onConfirm={() => void confirmBlock()}
          onCancel={() => setBlocking(false)}
        />
      )}
    </div>
  )
}
