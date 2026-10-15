// Accesibilidad básica de las pantallas y ventanas de Comunidad (ACC-M «teclado, lector de pantalla, contraste»): etiquetas, nombres, roles y foco, comprobados en
// cada ejecución sobre el HTML que dibujan los componentes (domain/staticA11y.ts), más el foco de teclado de las ventanas emergentes y los objetivos táctiles
// de 44 px leídos del CSS. No sustituye a la prueba con un lector de pantalla real (pendiente en dispositivos), pero impide que se cuelen controles sin nombre.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { CommentNode, PollView, PostDetail } from '@/domain/community'
import { nextTrapIndex } from '@/domain/communityDialogFocus'
import { a11yProblems } from '@/domain/staticA11y'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/data/community', () => ({
  camelize: (v: unknown) => v,
  toggleLike: vi.fn(),
  toggleSave: vi.fn(),
  toggleFollowConversation: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  listFollowing: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  deletePost: vi.fn(),
  reportContent: vi.fn(),
  visitorReport: vi.fn(),
  getMyCommunityProfile: vi.fn(),
  communityStatus: vi.fn(),
  requestReadmission: vi.fn(),
  setCommunityAlias: vi.fn(),
  listCommunityTopics: vi.fn(async () => []),
  getFavoriteTopics: vi.fn(async () => []),
  setFavoriteTopics: vi.fn(),
  createCommunityPhotoSignedUrls: vi.fn(async () => ({})),
  addComment: vi.fn(),
  uploadCommunityPhoto: vi.fn(),
  removeCommunityPhoto: vi.fn(),
}))
vi.mock('@/data/communityMinors', () => ({ getCommunityAccess: vi.fn() }))
vi.mock('@/services/communityPhoto', () => ({ prepareCommunityPhoto: vi.fn() }))
vi.mock('@/ui/community/CommunityProvider', () => ({
  useCommunity: () => ({
    status: { launched: true, visible: true, isAdmin: false, access: 'participate', accessReason: null },
    me: { hasProfile: true, id: 'yo', alias: 'Yo', rulesAccepted: true, banState: 'ok' },
    loading: false,
    refresh: async () => undefined,
    requireParticipation: async () => true,
  }),
}))

import { AliasDialog } from '@/ui/community/AliasDialog'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { CommentComposer } from '@/ui/community/CommentComposer'
import { CommentItem, type CommentActions } from '@/ui/community/CommentItem'
import { ConfirmDiscardDialog } from '@/ui/community/ConfirmDiscardDialog'
import { ConfirmDialog, ContentMenu } from '@/ui/community/ContentMenu'
import { DraftExpiryNotice } from '@/ui/community/DraftExpiryNotice'
import { FavoriteTopicsDialog } from '@/ui/community/FavoriteTopicsDialog'
import { PhotoLightbox } from '@/ui/community/PhotoLightbox'
import { PollBoxView } from '@/ui/community/PollBox'
import { PostActions } from '@/ui/community/PostActions'
import { PostCardView } from '@/ui/community/PostCardView'
import { PostEditorActions } from '@/ui/community/PostEditorActions'
import { ReportDialog } from '@/ui/community/ReportDialog'
import { RichTextEditor } from '@/ui/community/RichTextEditor'
import { SummaryBox } from '@/ui/community/SummaryBox'
import { UnsavedChangesDialog } from '@/ui/community/UnsavedChangesDialog'
import { ReportUserDialog } from '@/ui/community/ProfileParts'
import { RecipeFields } from '@/ui/community/recipes/RecipeFields'

const render = (el: React.ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>)
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
    kind: 'anecdota',
    anecdoteType: 'graciosa',
    section: 'hogar',
    topicId: 't',
    topicLabel: 'Ahorro',
    title: 'Una historia',
    excerpt: 'Resumen de la historia',
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
    commentCount: 2,
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
  } as PostDetail
}

const poll: PollView = {
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

// Cada pieza se dibuja y se revisa. Si algo falla, el mensaje dice qué control y por qué.
const SCREENS: [string, () => React.ReactElement][] = [
  ['tarjeta de publicación (anécdota con subtipo)', () => <PostCardView item={post() as never} />],
  ['tarjeta de una persona bloqueada', () => <PostCardView item={{ blockedByMe: true, id: 'p2', authorId: 'u2' }} />],
  ['migas de pan', () => <Breadcrumbs crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Comunidad', to: '/comunidad' }, { label: 'Recetas y cocina' }]} />],
  ['acciones de la publicación', () => <PostActions detail={post()} onPatch={noop} onReload={noop} />],
  ['comentario normal con respuestas', () => <CommentItem comment={comment({ isNew: true, replies: [comment({ id: 'r1', parentId: 'c1', replyToId: 'c1', replyToAlias: 'Marta' })] })} isReply={false} actions={actions} />],
  ['comentario eliminado y comentario de una persona bloqueada', () => (
    <>
      <CommentItem comment={{ ...comment(), status: 'removed', body: '', authorAlias: null }} isReply={false} actions={actions} />
      <CommentItem comment={{ ...comment({ id: 'c3' }), blockedByMe: true }} isReply={false} actions={actions} />
    </>
  )],
  ['campo para comentar (con respuesta)', () => <CommentComposer postId="p1" replyTarget={{ id: 'c1', rootId: 'c1', alias: 'Cocinillas' }} onCancelReply={noop} onPosted={noop} />],
  ['resumen de Pepa', () => <SummaryBox commentCount={20} summary="Se habló de ahorrar." busy={false} failed={false} conversationOpen={false} onOpenConversation={noop} onRefresh={noop} />],
  ['encuesta', () => <PollBoxView poll={poll} canVote selected={null} voting={false} error={null} nowMs={Date.parse('2026-10-17T12:00:00Z')} onSelect={noop} onVote={noop} />],
  ['editor de texto enriquecido', () => <RichTextEditor value="Hola" onChange={noop} label="Texto de la publicación" help="Ayuda" />],
  ['botones del editor (crear)', () => <PostEditorActions mode="create" busy={false} onDiscard={noop} onSaveDraft={noop} onPublish={noop} />],
  ['aviso de caducidad de borradores', () => <DraftExpiryNotice />],
  ['campos de receta del editor compartido', () => <RecipeFields value={{ servings: 4, ingredients: [{ name: 'harina', quantity: '200', unit: 'g' }], steps: 'Mezclar', tags: [] }} onChange={noop} />],
  ['menú «Más» de una publicación', () => <ContentMenu label="Más acciones de la publicación">{() => <button type="button">Denunciar</button>}</ContentMenu>],
  ['ventana: denunciar (como miembro)', () => <ReportDialog type="post" id="p1" onClose={noop} />],
  ['ventana: denunciar (como lector)', () => <ReportDialog type="comment" id="c1" channel="visitor" onClose={noop} />],
  ['ventana: denunciar a una persona', () => <ReportUserDialog profileId="u2" onClose={noop} />],
  ['ventana: confirmar (bloquear)', () => <ConfirmDialog title="Bloquear a esta persona" text="No veréis lo que publique." confirmLabel="Sí, bloquear" busy={false} error={null} onConfirm={noop} onCancel={noop} />],
  ['ventana: ¿descartar los cambios?', () => <ConfirmDiscardDialog title="¿Descartar?" message="Se perderá lo escrito." confirmLabel="Sí" cancelLabel="No" onConfirm={noop} onCancel={noop} />],
  ['ventana: cambios sin guardar', () => <UnsavedChangesDialog onKeep={noop} onSave={noop} onDiscard={noop} />],
  ['ventana: elegir alias', () => <AliasDialog current={null} onDone={noop} onCancel={noop} />],
  ['ventana: temas favoritos', () => <FavoriteTopicsDialog topics={[{ id: 'ahorro-economia', section: 'hogar', label: 'Ahorro y economía' }]} onClose={noop} onSaved={noop} />],
  ['ventana: foto ampliada (varias fotos)', () => <PhotoLightbox urls={['a.jpg', 'b.jpg']} label="Fotos de la publicación" onClose={noop} />],
]

describe('accesibilidad básica de las pantallas y ventanas de Comunidad', () => {
  for (const [name, make] of SCREENS) {
    it(name, () => {
      const html = render(make())
      expect(html.length, 'se dibuja algo').toBeGreaterThan(0)
      expect(a11yProblems(html)).toEqual([])
    })
  }

  it('el comprobador de verdad está mirando: una ventana sin nombre se detecta', () => {
    expect(a11yProblems(render(<div role="dialog" aria-modal="true"><button type="button">x</button></div>))).toEqual(['<div> (ventana) sin nombre'])
  })
})

describe('foco de teclado en las ventanas emergentes', () => {
  it('el tabulador da la vuelta dentro de la ventana y se mete dentro si el foco estaba fuera', () => {
    expect(nextTrapIndex(3, 2, false)).toBe(0) // Tab desde el último → primero
    expect(nextTrapIndex(3, 0, true)).toBe(2) // Mayús+Tab desde el primero → último
    expect(nextTrapIndex(3, 1, false)).toBeNull() // en medio, el navegador lo hace solo
    expect(nextTrapIndex(3, 1, true)).toBeNull()
    expect(nextTrapIndex(3, -1, false)).toBe(0) // foco en la propia ventana o fuera de la lista
    expect(nextTrapIndex(3, -1, true)).toBe(2)
    expect(nextTrapIndex(1, 0, false)).toBe(0) // un solo control: se queda en él
    expect(nextTrapIndex(1, 0, true)).toBe(0)
    expect(nextTrapIndex(0, -1, false)).toBe(0) // sin controles: no se escapa
  })

  // Todas las ventanas de Comunidad con aria-modal usan el mismo foco (dentro, atrapado y devuelto al cerrar), salvo las que tienen su propio gestor probado aparte.
  const files = listFiles(join(process.cwd(), 'src/ui/community'), /\.tsx$/).filter((f) => !/\.test\.tsx$/.test(f))
  const dialogs = files.map((f) => ({ f, src: readFileSync(f, 'utf8') })).filter((x) => x.src.includes('aria-modal="true"'))

  it('hay ventanas que revisar (la prueba no vale en vacío)', () => {
    expect(dialogs.length).toBeGreaterThanOrEqual(10)
  })

  for (const { f, src } of dialogs) {
    it(`usa useDialogFocus o FocusScope: ${f.replace(/.*community[\\/]/, '')}`, () => {
      expect(/useDialogFocus<|<FocusScope>/.test(src)).toBe(true)
      // y cada ventana con aria-modal lleva nombre propio
      for (const m of src.matchAll(/<div[^>]*aria-modal="true"[^>]*>|<div\s[^>]*?\n?[^>]*aria-modal="true"[^>]*>/g)) expect(m[0]).toMatch(/aria-label|aria-labelledby/)
    })
  }

  it('el gestor del foco: entra, atrapa el tabulador y devuelve el foco al abrir/cerrar', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/community/useDialogFocus.ts'), 'utf8')
    expect(src).toContain("addEventListener('keydown'")
    expect(src).toContain('nextTrapIndex(')
    expect(src).toContain('opener.focus(')
    expect(src).toContain('first.focus(')
  })
})

describe('objetivos táctiles de 44 px (CSS de Comunidad)', () => {
  const css = readFileSync(join(process.cwd(), 'src/ui/community/community.css'), 'utf8')
  it('botones de texto, casillas con etiqueta, migas, enlace al perfil y enlaces «Ver la fuente» llegan a 44 px', () => {
    expect(css).toMatch(/\.community-screen \.link-button[\s\S]*?min-height:\s*44px/)
    expect(css).toMatch(/\.community-screen \.checkbox-label\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.community-crumbs a\s*\{[^}]*padding:\s*13px/)
    expect(css).toMatch(/\.community-post-author a,\s*\.community-external-link\s*\{[^}]*padding:\s*13px 6px/)
  })
})

function listFiles(dir: string, pattern: RegExp): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listFiles(p, pattern))
    else if (pattern.test(name)) out.push(p)
  }
  return out
}
