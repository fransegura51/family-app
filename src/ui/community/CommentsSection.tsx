import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  blockUser,
  deleteComment,
  editComment,
  generateSummary,
  getCommunityUserPrefs,
  getSummary,
  listComments,
  requestSummaryRefresh,
  toggleLike,
  unblockUser,
  type CommunityUserPrefs,
} from '@/data/community'
import { communityErrorText } from '@/domain/communityErrors'
import { COMMENT_ORDER_LABELS, type CommentNode, type CommentOrder, type SummaryState } from '@/domain/community'
import {
  COMMENT_ORDERS,
  DEFAULT_FOLD_THRESHOLD,
  applySeen,
  buildSegments,
  collectNewIds,
  containsComment,
  countPublished,
  dayLabel,
  locateComment,
  madridDayKey,
  mergeRoots,
  needsSeenMark,
  patchComment,
  planSummary,
  reconcileFolded,
  removeCommentLocal,
  replyListOf,
  resolveCommentOrder,
  shouldFoldReadComments,
  visibleReplies,
  type FoldState,
} from '@/domain/communityComments'
import { toggleCount } from '@/domain/communityPost'
import { CommentItem, type CommentActions } from '@/ui/community/CommentItem'
import type { ReplyTarget } from '@/ui/community/CommentComposer'
import { ConfirmDialog } from '@/ui/community/ContentMenu'
import { PhotoLightbox } from '@/ui/community/PhotoLightbox'
import { ReportDialog } from '@/ui/community/ReportDialog'
import { SummaryBox } from '@/ui/community/SummaryBox'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { useCommentExposure } from '@/ui/community/useCommentExposure'
import '@/ui/community/communityPost.css'

const PAGE_SIZE = 30
// Para llegar a un comentario de un aviso que está en páginas posteriores se cargan páginas hasta encontrarlo, con tope (nunca un bucle sin fin).
const MAX_JUMP_PAGES = 8

export interface CommentsRefresh {
  // Sube cada vez que hay que recargar (por ejemplo tras publicar un comentario).
  token: number
  // Comentario al que ir tras recargar (el recién publicado).
  jumpTo?: string | null
}

// Conversación de una publicación: resumen de Pepa (solo con comentarios suficientes), orden, comentarios con respuestas, plegado de leídos por días y marca de
// «visto» solo por exposición real. El campo para escribir NO está aquí (vive en la página, fijo abajo) para que siga accesible con la conversación plegada.
export function CommentsSection({
  postId,
  commentCount,
  canInteract,
  fromNotification,
  targetCommentId,
  refresh,
  onReply,
}: {
  postId: string
  commentCount: number
  canInteract: boolean
  // Se entró desde un aviso (?nuevos=1): se abre la conversación y se va a lo nuevo.
  fromNotification: boolean
  targetCommentId: string | null
  refresh: CommentsRefresh
  onReply: (t: ReplyTarget) => void
}) {
  const { requireParticipation } = useCommunity()

  // ---- Estado general
  const [metaReady, setMetaReady] = useState(false)
  const [prefs, setPrefs] = useState<CommunityUserPrefs>({ commentOrder: 'antiguos', foldReadComments: true })
  const [summary, setSummary] = useState<SummaryState | null>(null)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [summaryFailed, setSummaryFailed] = useState(false)
  const [conversationOpen, setConversationOpen] = useState(false)

  // ---- Comentarios
  const [roots, setRoots] = useState<CommentNode[]>([])
  const [totalRoots, setTotalRoots] = useState(0)
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [tempOrder, setTempOrder] = useState<CommentOrder | null>(null)
  const [fold, setFold] = useState<FoldState>({ folded: new Set(), decided: new Set() })
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [openAll, setOpenAll] = useState(false)
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set())
  const [delta, setDelta] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)

  // ---- Ventanas y saltos
  const [reportId, setReportId] = useState<string | null>(null)
  const [blockTarget, setBlockTarget] = useState<CommentNode | null>(null)
  const [blockBusy, setBlockBusy] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [jumpId, setJumpId] = useState<string | null>(null)
  const [scrollId, setScrollId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // Valores que necesitan las funciones asíncronas sin quedarse con una copia vieja.
  const foldEnabledRef = useRef(false)
  const orderRef = useRef<CommentOrder>('antiguos')
  const rootsRef = useRef<CommentNode[]>([])
  rootsRef.current = roots
  const jumpPagesRef = useRef(0)
  const generatedRef = useRef(false)
  const likeBusy = useRef(new Set<string>())

  const order = resolveCommentOrder(tempOrder, prefs.commentOrder)
  orderRef.current = order

  const watch = useCommentExposure(
    useCallback((ids: string[]) => {
      // Vistos de verdad: ya no son nuevos (y «X respuestas nuevas» baja). Lo decidido sobre plegado no se toca.
      setRoots((r) => applySeen(r, new Set(ids)))
    }, []),
  )

  // ---- Carga de comentarios
  const loadFirst = useCallback(
    async (ord: CommentOrder, limit: number) => {
      setLoadingComments(true)
      setCommentsError(null)
      try {
        const list = await listComments(postId, ord, limit, 0)
        const items = list?.comments ?? []
        setRoots(items)
        setTotalRoots(list?.totalRoots ?? items.length)
        setFold((f) => reconcileFolded(f, items, { fold: foldEnabledRef.current, todayKey: madridDayKey(Date.now()) }))
        setCommentsLoaded(true)
      } catch (e) {
        setCommentsError(communityErrorText(e))
      } finally {
        setLoadingComments(false)
      }
    },
    [postId],
  )

  const loadMore = useCallback(async () => {
    setLoadingComments(true)
    setCommentsError(null)
    try {
      const list = await listComments(postId, orderRef.current, PAGE_SIZE, rootsRef.current.length)
      const items = list?.comments ?? []
      setRoots((prev) => mergeRoots(prev, items))
      setTotalRoots(list?.totalRoots ?? 0)
      setFold((f) => reconcileFolded(f, items, { fold: foldEnabledRef.current, todayKey: madridDayKey(Date.now()) }))
    } catch (e) {
      setCommentsError(communityErrorText(e))
      jumpPagesRef.current = MAX_JUMP_PAGES
    } finally {
      setLoadingComments(false)
    }
  }, [postId])

  // ---- Al abrir: preferencias y resumen (dos llamadas pequeñas, en paralelo) y, si la conversación no empieza plegada, los comentarios.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (commentCount <= 0) {
        setMetaReady(true)
        return
      }
      const [p, s] = await Promise.all([getCommunityUserPrefs().catch(() => null), getSummary(postId).catch(() => null)])
      if (cancelled) return
      const pr = p ?? { commentOrder: 'antiguos' as CommentOrder, foldReadComments: true }
      setPrefs(pr)
      setSummary(s)
      const plan = planSummary(s)
      foldEnabledRef.current = shouldFoldReadComments(commentCount, pr.foldReadComments, s?.threshold ?? DEFAULT_FOLD_THRESHOLD)
      const cameForComment = fromNotification || targetCommentId !== null
      const open = !plan.foldConversation || cameForComment
      setConversationOpen(open)
      setMetaReady(true)
      if (cameForComment) setJumpId(targetCommentId ?? 'first-new')
      if (open) await loadFirst(resolveCommentOrder(null, pr.commentOrder), PAGE_SIZE)
      // El resumen se pide UNA vez al abrir (sin bucles) si hace falta; si la IA falla, no pasa nada.
      if (!cancelled && plan.needsGenerate && !generatedRef.current) {
        generatedRef.current = true
        setSummaryBusy(true)
        const r = await generateSummary(postId)
        if (cancelled) return
        if (r.ok && r.summary) setSummary((cur) => (cur ? { ...cur, summary: r.summary ?? null, stale: false } : cur))
        else if (r.ok) {
          const again = await getSummary(postId).catch(() => null)
          if (!cancelled && again) setSummary(again)
        } else setSummaryFailed(true)
        if (!cancelled) setSummaryBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // Solo al abrir esta publicación: los cambios posteriores los gestionan las acciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  // ---- Recarga pedida desde fuera (comentario publicado)
  const firstRefresh = useRef(refresh.token)
  useEffect(() => {
    if (refresh.token === firstRefresh.current) return
    firstRefresh.current = refresh.token
    setDelta((d) => d + 1)
    setConversationOpen(true)
    jumpPagesRef.current = 0
    if (refresh.jumpTo) setJumpId(refresh.jumpTo)
    void loadFirst(orderRef.current, Math.min(100, Math.max(PAGE_SIZE, rootsRef.current.length + 1)))
  }, [refresh, loadFirst])

  // ---- Ir a un comentario (aviso o recién publicado): abre su grupo y su hilo y hace scroll hasta él.
  useEffect(() => {
    if (!jumpId || !commentsLoaded) return
    const target = jumpId === 'first-new' ? (collectNewIds(roots)[0] ?? null) : jumpId
    const loc = target ? locateComment(roots, target) : null
    if (loc && target) {
      const seg = buildSegments(roots, fold.folded).find((s) => s.type === 'fold' && s.comments.some((c) => c.id === loc.rootId))
      if (seg) setOpenGroups((g) => new Set(g).add(seg.key))
      if (loc.replyId) setExpandedThreads((t) => new Set(t).add(loc.rootId))
      setScrollId(target)
      setHighlightId(target)
      setJumpId(null)
      return
    }
    if (target && roots.length < totalRoots && jumpPagesRef.current < MAX_JUMP_PAGES && !loadingComments) {
      jumpPagesRef.current += 1
      void loadMore()
      return
    }
    if (!loadingComments) setJumpId(null)
  }, [jumpId, commentsLoaded, roots, totalRoots, fold.folded, loadingComments, loadMore])

  useEffect(() => {
    if (!scrollId) return
    const el = document.getElementById(`c-${scrollId}`)
    if (!el) return
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    setScrollId(null)
  }, [scrollId, roots, openGroups, expandedThreads])

  useEffect(() => {
    if (!highlightId) return
    const t = window.setTimeout(() => setHighlightId(null), 4000)
    return () => window.clearTimeout(t)
  }, [highlightId])

  // ---- Resumen
  async function refreshSummary() {
    if (summaryBusy) return
    setSummaryBusy(true)
    setSummaryFailed(false)
    try {
      await requestSummaryRefresh(postId).catch(() => undefined)
      const r = await generateSummary(postId, true)
      if (r.ok && r.summary) setSummary((cur) => (cur ? { ...cur, summary: r.summary ?? null, stale: false } : cur))
      else if (r.ok) setSummary(await getSummary(postId).catch(() => summary))
      else setSummaryFailed(true)
    } finally {
      setSummaryBusy(false)
    }
  }

  async function openConversation() {
    setConversationOpen(true)
    if (!commentsLoaded && !loadingComments) await loadFirst(orderRef.current, PAGE_SIZE)
  }

  async function changeOrder(next: CommentOrder) {
    // Cambio TEMPORAL: solo dentro de esta conversación; el ajuste permanente se cambia en Mi perfil.
    setTempOrder(next)
    orderRef.current = next
    await loadFirst(next, Math.min(100, Math.max(PAGE_SIZE, roots.length)))
  }

  // ---- Acciones sobre comentarios
  const actions: CommentActions = useMemo(
    () => ({
      onLike: async (c) => {
        if (likeBusy.current.has(c.id)) return
        if (!(await requireParticipation())) return
        likeBusy.current.add(c.id)
        const before = { liked: c.likedByMe, count: c.likeCount }
        const t = toggleCount(before.liked, before.count)
        setRoots((r) => patchComment(r, c.id, (x) => ({ ...x, likedByMe: t.active, likeCount: t.count })))
        try {
          const res = await toggleLike('comment', c.id)
          setRoots((r) => patchComment(r, c.id, (x) => ({ ...x, likedByMe: res.liked, likeCount: res.likeCount })))
        } catch (e) {
          setRoots((r) => patchComment(r, c.id, (x) => ({ ...x, likedByMe: before.liked, likeCount: before.count })))
          setActionError(communityErrorText(e))
        } finally {
          likeBusy.current.delete(c.id)
        }
      },
      onReply: async (c) => {
        if (!(await requireParticipation())) return
        const root = rootsRef.current.find((r) => containsComment(r, c.id))
        onReply({ id: c.id, rootId: root?.id ?? c.id, alias: c.authorDeleted ? 'Usuario eliminado' : (c.authorAlias ?? 'esta persona') })
      },
      onEdit: async (c, body) => {
        try {
          await editComment(c.id, body)
          setRoots((r) => patchComment(r, c.id, (x) => ({ ...x, body: body.trim(), editedAt: new Date().toISOString() })))
          return null
        } catch (e) {
          return communityErrorText(e)
        }
      },
      onDelete: async (c) => {
        try {
          await deleteComment(c.id)
          setRoots((r) => removeCommentLocal(r, c.id))
          setDelta((d) => d - 1)
        } catch (e) {
          setActionError(communityErrorText(e))
        }
      },
      onReport: async (c) => {
        if (await requireParticipation()) setReportId(c.id)
      },
      onBlock: async (c) => {
        if (!(await requireParticipation())) return
        setBlockError(null)
        setBlockTarget(c)
      },
      onUnblock: async (c) => {
        try {
          await unblockUser(c.authorId)
          await loadFirst(orderRef.current, Math.min(100, Math.max(PAGE_SIZE, rootsRef.current.length)))
        } catch (e) {
          setActionError(communityErrorText(e))
        }
      },
      onOpenPhoto: (url) => setPhotoUrl(url),
    }),
    [requireParticipation, onReply, loadFirst],
  )

  async function confirmBlock() {
    if (!blockTarget || blockBusy) return
    setBlockBusy(true)
    setBlockError(null)
    try {
      await blockUser(blockTarget.authorId)
      setBlockTarget(null)
      await loadFirst(orderRef.current, Math.min(100, Math.max(PAGE_SIZE, rootsRef.current.length)))
    } catch (e) {
      setBlockError(communityErrorText(e))
    } finally {
      setBlockBusy(false)
    }
  }

  // ---- Pintado
  const plan = planSummary(summary)
  const total = Math.max(0, (summary?.commentCount ?? commentCount) + delta)
  const todayKey = madridDayKey(Date.now())
  const segments = useMemo(() => buildSegments(roots, fold.folded), [roots, fold.folded])
  const hasFolded = segments.some((s) => s.type === 'fold')

  function renderThread(root: CommentNode) {
    const replies = replyListOf(root)
    const expanded = expandedThreads.has(root.id)
    const { shown, hiddenCount } = visibleReplies(replies, { expanded, forceIds: highlightId ? [highlightId] : [] })
    const toggle = (open: boolean) =>
      setExpandedThreads((t) => {
        const n = new Set(t)
        if (open) n.add(root.id)
        else n.delete(root.id)
        return n
      })
    return (
      <>
        {shown.length > 0 && (
          <ul className="community-replies" aria-label="Respuestas">
            {shown.map((r) => (
              <CommentItem key={r.id} comment={r} isReply readOnly={!canInteract} actions={actions} watchRef={needsSeenMark(r) ? watch(r.id) : undefined} highlighted={highlightId === r.id} />
            ))}
          </ul>
        )}
        {hiddenCount > 0 && (
          <button type="button" className="link-button community-replies-toggle" aria-expanded="false" onClick={() => toggle(true)}>
            Ver respuestas ({hiddenCount})
          </button>
        )}
        {expanded && replies.length > 3 && (
          <button type="button" className="link-button community-replies-toggle" aria-expanded="true" onClick={() => toggle(false)}>
            Ocultar respuestas
          </button>
        )}
      </>
    )
  }

  function renderRoot(root: CommentNode) {
    return (
      <CommentItem key={root.id} comment={root} isReply={false} readOnly={!canInteract} actions={actions} watchRef={needsSeenMark(root) ? watch(root.id) : undefined} highlighted={highlightId === root.id}>
        {renderThread(root)}
      </CommentItem>
    )
  }

  const conversation = (
    <div className="community-conversation">
      <div className="community-conversation-bar">
        <h2 id="comentarios">Comentarios ({total})</h2>
        {roots.length > 1 && (
          <label className="community-order">
            <span className="community-sr-only">Orden de los comentarios</span>
            <select value={order} aria-label="Orden de los comentarios" onChange={(e) => void changeOrder(e.target.value as CommentOrder)}>
              {COMMENT_ORDERS.map((o) => (
                <option key={o} value={o}>
                  {COMMENT_ORDER_LABELS[o]}
                </option>
              ))}
            </select>
          </label>
        )}
        {hasFolded && !openAll && (
          <button type="button" className="link-button" onClick={() => setOpenAll(true)}>
            Desplegar todo
          </button>
        )}
      </div>

      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}
      {commentsError && (
        <p className="error" role="alert">
          {commentsError}{' '}
          <button type="button" className="link-button" onClick={() => void loadFirst(orderRef.current, PAGE_SIZE)}>
            Reintentar
          </button>
        </p>
      )}
      {loadingComments && roots.length === 0 && <p className="muted">Cargando los comentarios…</p>}
      {commentsLoaded && roots.length === 0 && !commentsError && <p className="muted">Todavía no hay comentarios.{canInteract ? ' ¡Sé la primera persona en comentar!' : ''}</p>}

      <ul className="community-comment-list">
        {segments.map((seg) => {
          if (seg.type === 'comment') return renderRoot(seg.comment)
          const open = openAll || openGroups.has(seg.key)
          const n = countPublished(seg.comments)
          return (
            <li key={seg.key} className="community-fold">
              <button
                type="button"
                className="community-fold-head"
                aria-expanded={open}
                onClick={() =>
                  setOpenGroups((g) => {
                    const next = new Set(g)
                    if (next.has(seg.key)) next.delete(seg.key)
                    else next.add(seg.key)
                    return next
                  })
                }
              >
                <span aria-hidden="true">{open ? '▾' : '▸'}</span> {dayLabel(seg.dayKey, todayKey)} · {n} {n === 1 ? 'comentario leído' : 'comentarios leídos'}
              </button>
              {open && <ul className="community-comment-list">{seg.comments.map((c) => renderRoot(c))}</ul>}
            </li>
          )
        })}
      </ul>

      {roots.length < totalRoots && (
        <button type="button" className="link-button community-more" disabled={loadingComments} onClick={() => void loadMore()}>
          {loadingComments ? 'Cargando…' : 'Ver más comentarios'}
        </button>
      )}
    </div>
  )

  if (!metaReady) return <p className="muted">Cargando la conversación…</p>

  return (
    <section className="community-comments" aria-label="Conversación">
      {plan.useSummary && summary && (
        <SummaryBox
          commentCount={summary.commentCount}
          summary={summary.summary}
          busy={summaryBusy}
          failed={summaryFailed}
          conversationOpen={conversationOpen}
          onOpenConversation={() => void openConversation()}
          onRefresh={() => void refreshSummary()}
        />
      )}
      {conversationOpen ? (
        conversation
      ) : commentCount + delta <= 0 ? (
        <p className="muted">Todavía no hay comentarios.{canInteract ? ' ¡Sé la primera persona en comentar!' : ''}</p>
      ) : null}

      {reportId && <ReportDialog type="comment" id={reportId} onClose={() => setReportId(null)} />}
      {blockTarget && (
        <ConfirmDialog
          title="Bloquear a esta persona"
          text="No veréis lo que publique la otra persona ni ella lo tuyo. No se le avisa. Puedes desbloquearla cuando quieras."
          confirmLabel="Sí, bloquear"
          busy={blockBusy}
          error={blockError}
          onConfirm={() => void confirmBlock()}
          onCancel={() => setBlockTarget(null)}
        />
      )}
      {photoUrl && <PhotoLightbox urls={[photoUrl]} label="Foto del comentario" onClose={() => setPhotoUrl(null)} />}
    </section>
  )
}
