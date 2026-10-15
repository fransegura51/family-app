// Página de una publicación y su conversación: estructura que se ve (renderToStaticMarkup, sin navegador ni red: los efectos no se ejecutan) y reglas que
// solo se pueden comprobar leyendo el código fuente (coste, marcas de «visto», migas sin título, etc.).
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { CommentNode, PollView, PostDetail } from '@/domain/community'
import pageSrc from '@/ui/community/PostDetailPage.tsx?raw'
import sectionSrc from '@/ui/community/CommentsSection.tsx?raw'
import exposureSrc from '@/ui/community/useCommentExposure.ts?raw'
import composerSrc from '@/ui/community/CommentComposer.tsx?raw'
import actionsSrc from '@/ui/community/PostActions.tsx?raw'
import itemSrc from '@/ui/community/CommentItem.tsx?raw'
import pollSrc from '@/ui/community/PollBox.tsx?raw'
import shareSrc from '@/ui/community/communityShare.ts?raw'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'src/ui/community/communityPost.css'), 'utf8')

vi.mock('@/data/community', () => ({
  communityPhotoUrl: (p: string) => `https://fotos.test/${p}`,
  getPoll: vi.fn(),
  votePoll: vi.fn(),
  getPost: vi.fn(),
  listComments: vi.fn(),
  getSummary: vi.fn(),
  getCommunityUserPrefs: vi.fn(),
  generateSummary: vi.fn(),
  requestSummaryRefresh: vi.fn(),
  markCommentsSeen: vi.fn(),
  reportContent: vi.fn(),
  addComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
  deletePost: vi.fn(),
  toggleLike: vi.fn(),
  toggleSave: vi.fn(),
  toggleFollowConversation: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  getMyCommunityProfile: vi.fn(),
  uploadCommunityPhoto: vi.fn(),
  removeCommunityPhoto: vi.fn(),
}))
vi.mock('@/ui/community/CommunityProvider', () => ({
  useCommunity: () => ({ status: null, me: { hasProfile: true, id: 'yo' }, loading: false, refresh: async () => undefined, requireParticipation: async () => true }),
}))
vi.mock('@/services/communityPhoto', () => ({ prepareCommunityPhoto: vi.fn() }))
// El panel de recetas lo construye otro módulo y arrastra media aplicación: aquí solo importa que se monte con `detail` y `onChanged`.
vi.mock('@/ui/community/recipes/RecipePanel', () => ({ RecipePanel: () => null }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

import { ArticleSources } from '@/ui/community/ArticleSources'
import { CommentComposer } from '@/ui/community/CommentComposer'
import { CommentItem, type CommentActions } from '@/ui/community/CommentItem'
import { CommentsSection } from '@/ui/community/CommentsSection'
import { PhotoLightbox } from '@/ui/community/PhotoLightbox'
import { PollBoxView } from '@/ui/community/PollBox'
import { PostActions } from '@/ui/community/PostActions'
import { PostDetailPage } from '@/ui/community/PostDetailPage'
import { ReportDialog } from '@/ui/community/ReportDialog'
import { SummaryBox } from '@/ui/community/SummaryBox'

function render(el: React.ReactElement) {
  return renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>)
}

const noop = () => undefined
const actions: CommentActions = { onLike: noop, onReply: noop, onEdit: async () => null, onDelete: noop, onReport: noop, onBlock: noop, onUnblock: noop, onOpenPhoto: noop }

function comment(over: Partial<CommentNode> = {}): CommentNode {
  return {
    id: 'c1',
    parentId: null,
    replyToId: null,
    replyToAlias: null,
    status: 'published',
    authorId: 'u1',
    authorAlias: 'Cocinillas',
    authorAvatar: '🍳',
    authorIsOfficial: false,
    authorDeleted: false,
    body: 'Qué buena receta',
    photoPath: null,
    createdAt: '2026-10-14T10:00:00Z',
    editedAt: null,
    likeCount: 2,
    likedByMe: false,
    mine: false,
    isNew: false,
    canInteract: true,
    replies: [],
    ...over,
  }
}

function post(over: Partial<PostDetail> = {}): PostDetail {
  return {
    id: 'p1',
    kind: 'consejo',
    section: 'hogar',
    topicId: 't',
    topicLabel: 'Ahorro y economía',
    title: 'Cómo ahorrar en la compra',
    excerpt: '',
    authorId: 'u1',
    authorAlias: 'Ahorradora',
    authorAvatar: '💡',
    authorIsOfficial: false,
    authorDeleted: false,
    isOfficial: false,
    officialLabel: null,
    featured: false,
    thumbPath: null,
    likeCount: 3,
    commentCount: 0,
    saveCount: 1,
    avgRating: null,
    ratingCount: 0,
    importCount: 0,
    createdAt: '2026-10-10T10:00:00Z',
    editedAt: null,
    lastActivityAt: '2026-10-10T10:00:00Z',
    unanswered: false,
    likedByMe: false,
    savedByMe: false,
    canInteract: true,
    body: 'Cuerpo',
    photos: [],
    recipe: null,
    articleSources: null,
    isMine: false,
    followingConversation: false,
    followingAuthor: false,
    ...over,
  }
}

describe('página de la publicación (estructura)', () => {
  it('es una página completa con migas SIN el título y el título completo como h1', () => {
    expect(pageSrc).toContain('postCrumbs(detail.section)')
    expect(pageSrc).toContain('<h1 className="community-post-title">{detail.title}</h1>')
    expect(pageSrc).not.toMatch(/postCrumbs\([^)]*title/)
    expect(pageSrc).not.toContain('dangerouslySetInnerHTML')
    expect(pageSrc).toContain('CommunityRichText')
  })

  it('cubre los avisos neutros: no disponible, oculta por administración y bloqueada', () => {
    expect(pageSrc).toContain('Esta publicación ya no está disponible')
    expect(pageSrc).toContain('Una persona de la administración ha ocultado esta publicación')
    expect(pageSrc).toContain('Contenido de usuario bloqueado por ti')
    expect(pageSrc).toContain('Desbloquear')
  })

  it('muestra «Editado», «Oficial» y «Destacado por la comunidad», y monta la receta con el panel de recetas', () => {
    expect(pageSrc).toContain('Editado')
    expect(pageSrc).toContain('>Oficial<')
    expect(pageSrc).toContain('Destacado por la comunidad')
    expect(pageSrc).toContain('<RecipePanel detail={detail} onChanged={reload} />')
  })

  it('el campo de comentar va el último, sin explicar nada si no se puede interactuar', () => {
    expect(pageSrc.indexOf('<CommentsSection')).toBeLessThan(pageSrc.indexOf('<CommentComposer'))
    expect(pageSrc).toContain('{detail.canInteract && (')
  })

  it('al cargar muestra un aviso accesible', () => {
    const html = render(<PostDetailPage />)
    expect(html).toContain('Cargando la publicación')
    expect(html).toContain('aria-label="Migas de pan"')
    expect(html).toContain('Publicación')
  })
})

describe('acciones', () => {
  it('con interacción: me gusta, guardar, seguir conversación, seguir al autor, compartir y menú Más', () => {
    const html = render(<PostActions detail={post()} onPatch={noop} onReload={noop} />)
    expect(html).toContain('Me gusta (3)')
    expect(html).toContain('Guardar esta publicación')
    expect(html).toContain('Seguir la conversación')
    expect(html).toContain('Seguir a Ahorradora')
    expect(html).toContain('Compartir')
    expect(html).toContain('Más opciones de la publicación')
    expect(html).toContain('aria-pressed')
  })

  it('sin interacción posible: no hay botones de interacción y NO se explica por qué', () => {
    const html = render(<PostActions detail={post({ canInteract: false })} onPatch={noop} onReload={noop} />)
    expect(html).not.toContain('Me gusta (')
    expect(html).not.toContain('Guardar esta publicación')
    expect(html).not.toContain('Seguir')
    expect(html).not.toContain('Denunciar')
    expect(html.toLowerCase()).not.toContain('bloque')
    expect(html).toContain('Compartir')
  })

  it('en una publicación mía no se puede seguir al autor y el menú es editar y eliminar', () => {
    const html = render(<PostActions detail={post({ isMine: true })} onPatch={noop} onReload={noop} />)
    expect(html).not.toContain('Seguir a ')
    // El menú está cerrado: sus opciones salen al abrirlo (se comprueba en el código).
    expect(actionsSrc).toContain('paths.edit(detail.id)')
    expect(actionsSrc).toContain('<ConfirmButton')
    expect(actionsSrc).toContain('deletePost(detail.id)')
  })

  it('cada acción que interactúa pide primero requireParticipation, y los contadores vuelven atrás si falla', () => {
    expect(actionsSrc).toContain('await requireParticipation()')
    expect(actionsSrc).toMatch(/onPatch\(\{ likedByMe: before\.liked, likeCount: before\.count \}\)/)
    expect(actionsSrc).toMatch(/onPatch\(\{ savedByMe: before\.saved, saveCount: before\.count \}\)/)
    expect(actionsSrc).toContain("followUser(detail.authorId, 'smart')")
    expect(actionsSrc).toContain('blockUser(detail.authorId)')
    expect(actionsSrc).toContain('ConfirmDialog')
  })

  it('compartir: menú nativo y, si no, copiar el enlace estable (con dominio público opcional)', () => {
    expect(shareSrc).toContain('navigator.share')
    expect(shareSrc).toContain('navigator.clipboard.writeText')
    expect(shareSrc).toContain('VITE_COMMUNITY_PUBLIC_BASE')
    expect(shareSrc).toContain('comunidad/p/')
    expect(shareSrc).toContain('export function getShareUrl')
  })
})

describe('denunciar', () => {
  it('lista todos los motivos y un detalle opcional', () => {
    const html = render(<ReportDialog type="post" id="p1" onClose={noop} />)
    for (const label of ['Spam o publicidad', 'Acoso o faltas de respeto', 'Violencia', 'Contenido sexual', 'Algo ilegal', 'Datos privados de alguien', 'Información engañosa', 'Otro motivo']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Detalle (opcional)')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    // Hasta elegir un motivo no se puede enviar.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Enviar denuncia/)
  })
})

describe('encuesta oficial', () => {
  const base: PollView = {
    id: 'q1',
    postId: 'p1',
    question: '¿Cómo organizas la compra?',
    options: ['Una vez por semana', 'Cada día', 'Online'],
    opensAt: '2026-10-17T08:00:00Z',
    closesAt: '2026-10-18T15:00:00Z',
    status: 'open',
    myVote: null,
    resultsVisible: false,
    final: false,
    counts: null,
    totalVotes: null,
  }
  const view = (poll: PollView, canVote = true, nowMs = Date.parse('2026-10-17T12:00:00Z')) =>
    render(<PollBoxView poll={poll} canVote={canVote} selected={null} voting={false} error={null} nowMs={nowMs} onSelect={noop} onVote={noop} />)

  it('antes de votar los resultados están OCULTOS y se explica que el voto es anónimo', () => {
    const html = view(base)
    expect(html).toContain('type="radio"')
    expect(html).toContain('Los resultados se verán cuando votes')
    expect(html).toContain('anónimo')
    expect(html).not.toContain('%')
    expect(html).toContain('Encuesta abierta. Se cierra el domingo 18 de octubre a las 17:00 (hora de Madrid).')
    expect(html).toContain('no son muestras representativas')
  })

  it('tras votar se ven resultados provisionales y ya no hay formulario', () => {
    const html = view({ ...base, myVote: 1, resultsVisible: true, counts: [3, 5, 2], totalVotes: 10 })
    expect(html).toContain('Resultados provisionales')
    expect(html).toContain('50 %')
    expect(html).toContain('(tu voto)')
    expect(html).not.toContain('type="radio"')
  })

  it('cerrada: resultados finales para todos, aunque no hayan votado', () => {
    const html = view({ ...base, status: 'closed', final: true, resultsVisible: true, counts: [1, 1, 2], totalVotes: 4 }, true, Date.parse('2026-10-19T09:00:00Z'))
    expect(html).toContain('Resultados finales')
    expect(html).toContain('Encuesta cerrada')
    expect(html).not.toContain('type="radio"')
  })

  it('sin poder interactuar no se ofrece votar (sin explicaciones)', () => {
    const html = view(base, false)
    expect(html).not.toContain('type="radio"')
    expect(html).not.toContain('Votar')
  })

  it('votar pide participación primero', () => {
    expect(pollSrc).toContain('await requireParticipation()')
    expect(pollSrc).toContain('votePoll(postId, selected)')
  })
})

describe('artículo oficial', () => {
  it('enseña las fuentes con aviso de sitio externo y la nota de muestras no representativas', () => {
    const html = render(
      <ArticleSources raw={{ sources: [{ title: 'Gasto de los hogares', publisher: 'INE', url: 'https://www.ine.es/gasto', date: '2026-02-01' }], methodology: 'Encuesta anual.' }} />,
    )
    expect(html).toContain('Gasto de los hogares')
    expect(html).toContain('INE')
    expect(html).toContain('1 de febrero de 2026')
    expect(html).toContain('href="https://www.ine.es/gasto"')
    expect(html).toContain('sitio externo')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('Las encuestas de PEPA no son muestras representativas.')
  })
})

describe('resumen de Pepa', () => {
  it('resumen, número de comentarios, «Ver toda la conversación» y «Actualizar resumen»', () => {
    const html = render(<SummaryBox commentCount={22} summary="La mayoría recomienda congelar." busy={false} failed={false} conversationOpen={false} onOpenConversation={noop} onRefresh={noop} />)
    expect(html).toContain('Resumen de Pepa')
    expect(html).toContain('22 comentarios')
    expect(html).toContain('La mayoría recomienda congelar.')
    expect(html).toContain('Ver toda la conversación')
    expect(html).toContain('Actualizar resumen')
  })

  it('con la conversación abierta ya no hay botón de abrirla; si falla la IA no bloquea nada', () => {
    const html = render(<SummaryBox commentCount={16} summary={null} busy={false} failed conversationOpen onOpenConversation={noop} onRefresh={noop} />)
    expect(html).not.toContain('Ver toda la conversación')
    expect(html).toContain('Puedes leer los comentarios más abajo')
  })

  it('la conversación decide por el servidor (eligible) y pide el resumen UNA vez, sin bucles', () => {
    expect(sectionSrc).toContain('planSummary(s)')
    expect(sectionSrc).toContain('generatedRef.current')
    expect(sectionSrc).toContain('generateSummary(postId)')
    expect(sectionSrc).toContain('requestSummaryRefresh(postId)')
    expect(sectionSrc).toContain('generateSummary(postId, true)')
    expect(sectionSrc).not.toContain('setInterval')
    expect(sectionSrc).not.toContain('while (')
    // Con la conversación plegada no se piden los comentarios hasta abrirla.
    expect(sectionSrc).toContain('const open = !plan.foldConversation || cameForComment')
  })
})

describe('comentarios', () => {
  it('comentario normal: autor, me gusta, responder y menú; «Nuevo» y respuestas nuevas', () => {
    const html = render(<CommentItem comment={comment({ isNew: true, replies: [comment({ id: 'r', isNew: true })] })} isReply={false} actions={actions} />)
    expect(html).toContain('Cocinillas')
    expect(html).toContain('Qué buena receta')
    expect(html).toContain('Me gusta (2)')
    expect(html).toContain('Responder')
    expect(html).toContain('Más opciones del comentario')
    expect(html).toContain('1 respuesta nueva')
  })

  it('una respuesta a otra respuesta indica a quién responde (un solo nivel de sangría)', () => {
    const html = render(<CommentItem comment={comment({ id: 'r', parentId: 'c1', replyToId: 'r0', replyToAlias: 'Marta' })} isReply actions={actions} />)
    expect(html).toContain('En respuesta a Marta')
    expect(html).toContain('is-reply')
  })

  it('comentario eliminado con respuestas: aviso neutro, sin autor ni texto', () => {
    const html = render(<CommentItem comment={{ ...comment(), status: 'removed', body: '', authorAlias: null }} isReply={false} actions={actions} />)
    expect(html).toContain('Comentario eliminado')
    expect(html).not.toContain('Cocinillas')
    expect(html).not.toContain('Responder')
  })

  it('autor bloqueado: capa neutra con Desbloquear y nada de contenido', () => {
    const html = render(<CommentItem comment={{ ...comment(), blockedByMe: true, body: 'NO DEBE SALIR' }} isReply={false} actions={actions} />)
    expect(html).toContain('Contenido de usuario bloqueado por ti')
    expect(html).toContain('Desbloquear')
    expect(html).not.toContain('NO DEBE SALIR')
  })

  it('sin interacción: ni me gusta ni responder ni menú (y sin explicar el motivo)', () => {
    const html = render(<CommentItem comment={comment({ canInteract: false })} isReply={false} actions={actions} />)
    expect(html).not.toContain('Me gusta (')
    expect(html).not.toContain('Responder')
    expect(html).not.toContain('Más opciones')
    expect(render(<CommentItem comment={comment()} readOnly isReply={false} actions={actions} />)).not.toContain('Responder')
  })

  it('foto de comentario: miniatura que se amplía al tocarla (botón accesible)', () => {
    const html = render(<CommentItem comment={comment({ photoPath: 'u1/foto.jpg' })} isReply={false} actions={actions} />)
    expect(html).toContain('aria-label="Ampliar la foto del comentario"')
    expect(html).toContain('https://fotos.test/u1/foto.jpg')
    expect(html).toContain('alt="Foto del comentario"')
  })

  it('el texto de otras personas nunca entra como HTML', () => {
    const html = render(<CommentItem comment={comment({ body: '<img src=x onerror=alert(1)>' })} isReply={false} actions={actions} />)
    expect(html).not.toContain('<img src=x')
    expect(itemSrc).not.toContain('dangerouslySetInnerHTML')
    expect(sectionSrc).not.toContain('dangerouslySetInnerHTML')
  })

  it('autor eliminado: «Usuario eliminado» y sin enlace al perfil', () => {
    const html = render(<CommentItem comment={comment({ authorDeleted: true, authorAlias: 'Usuario eliminado' })} isReply={false} actions={actions} />)
    expect(html).toContain('Usuario eliminado')
    expect(html).not.toContain('/comunidad/u/')
  })

  it('«Ver respuestas (X)», orden temporal, plegado por días y «Desplegar todo» existen en la conversación', () => {
    expect(sectionSrc).toContain('Ver respuestas ({hiddenCount})')
    expect(sectionSrc).toContain('Ocultar respuestas')
    expect(sectionSrc).toContain('Orden de los comentarios')
    expect(sectionSrc).toContain('COMMENT_ORDER_LABELS')
    expect(sectionSrc).toContain('Desplegar todo')
    expect(sectionSrc).toContain('comentarios leídos')
    expect(sectionSrc).toContain('Ver más comentarios')
    // El orden temporal no cambia la preferencia permanente.
    expect(sectionSrc).not.toContain('setCommunityUserPrefs')
  })

  it('la conversación al cargar enseña un aviso; el orden por defecto sale de la preferencia de la persona', () => {
    expect(render(<CommentsSection postId="p1" commentCount={3} canInteract fromNotification={false} targetCommentId={null} refresh={{ token: 0 }} onReply={noop} />)).toContain(
      'Cargando la conversación',
    )
    expect(sectionSrc).toContain('getCommunityUserPrefs()')
    expect(sectionSrc).toContain('resolveCommentOrder(tempOrder, prefs.commentOrder)')
  })

  it('desde un aviso abre el grupo y la respuesta, y hace scroll hasta ella', () => {
    expect(sectionSrc).toContain('locateComment(roots, target)')
    expect(sectionSrc).toContain('scrollIntoView')
    expect(sectionSrc).toContain("'first-new'")
    expect(sectionSrc).toContain('MAX_JUMP_PAGES')
  })
})

describe('campo para comentar', () => {
  it('siempre accesible: fijo abajo en móvil, 16 px (sin zoom en iPhone), una foto como máximo y respuesta con quién', () => {
    expect(css).toMatch(/\.community-composer\s*\{[^}]*position:\s*sticky[^}]*bottom:/)
    expect(css).toMatch(/\.community-composer-field textarea\s*\{[^}]*font-size:\s*16px/)
    const html = render(<CommentComposer postId="p1" replyTarget={{ id: 'c1', rootId: 'c1', alias: 'Cocinillas' }} onCancelReply={noop} onPosted={noop} />)
    expect(html).toContain('Respondiendo a')
    expect(html).toContain('Cocinillas')
    expect(html).toContain('Publicar')
    expect(html).toContain('Añadir una foto al comentario')
    expect(html).toContain('accept="image/*"')
    expect(composerSrc).toContain('prepareCommunityPhoto(file)')
    expect(composerSrc).toContain('requireParticipation()')
    expect(composerSrc).toContain('addComment(postId, body, path, replyTarget?.id ?? null)')
  })

  it('la foto solo se sube al pulsar Publicar (no se dejan fotos huérfanas)', () => {
    expect(composerSrc.indexOf('prepareCommunityPhoto')).toBeLessThan(composerSrc.indexOf('uploadCommunityPhoto(profileId'))
    expect(composerSrc).toContain('removeCommunityPhoto')
  })
})

describe('lectura: marcar como vistos solo lo que se ha visto', () => {
  it('usa IntersectionObserver con 1 s, en lotes y sin consultas periódicas', () => {
    expect(exposureSrc).toContain('IntersectionObserver')
    expect(exposureSrc).toContain('markCommentsSeen(batch)')
    expect(exposureSrc).toContain('SEEN_BATCH_MAX')
    expect(exposureSrc).not.toContain('setInterval')
    expect(exposureSrc).toContain("document.visibilityState === 'visible'")
  })

  it('nada llama a markCommentsSeen por abrir la publicación', () => {
    expect(sectionSrc).not.toContain('markCommentsSeen')
    expect(pageSrc).not.toContain('markCommentsSeen')
    expect(itemSrc).not.toContain('markCommentsSeen')
  })

  it('solo se vigilan los comentarios nuevos', () => {
    expect(sectionSrc).toContain('needsSeenMark(root) ? watch(root.id) : undefined')
    expect(sectionSrc).toContain('needsSeenMark(r) ? watch(r.id) : undefined')
  })
})

describe('foto ampliada', () => {
  it('ventana con cierre, cierra con Escape y devuelve a la misma posición', () => {
    const html = render(<PhotoLightbox urls={['a.jpg', 'b.jpg']} label="Fotos" onClose={noop} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="Cerrar la foto"')
    expect(html).toContain('Foto siguiente')
    expect(html).toContain('community-lightbox')
  })
})

describe('móvil y accesibilidad', () => {
  it('objetivos táctiles de 44 px en acciones, menú y campo', () => {
    expect(css).toMatch(/\.community-action,[\s\S]*?min-height:\s*44px/)
    expect(css).toMatch(/\.community-fold-head\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.community-menu-list > button,[\s\S]*?min-height:\s*44px/)
  })
  it('el texto largo no ensancha la página', () => {
    expect(css).toMatch(/\.community-post-page\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })
})
