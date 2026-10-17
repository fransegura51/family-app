// Acceso por edad y permisos (0277) en la interfaz de Comunidad: aviso de solo lectura, pantalla de «no disponible», guards de los botones de escritura y
// reacción a los errores del servidor. Render estático (renderToStaticMarkup, sin navegador ni red) y lectura del código fuente con ?raw.
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { PostDetail } from '@/domain/community'
import homeSrc from '@/ui/community/CommunityHome.tsx?raw'
import sectionSrc from '@/ui/community/CommunitySectionPage.tsx?raw'
import postActionsSrc from '@/ui/community/PostActions.tsx?raw'
import postPageSrc from '@/ui/community/PostDetailPage.tsx?raw'
import profileSrc from '@/ui/community/ProfilePage.tsx?raw'
import layoutSrc from '@/ui/community/CommunityLayout.tsx?raw'
import routesSrc from '@/ui/community/CommunityRoutes.tsx?raw'
import providerSrc from '@/ui/community/CommunityProvider.tsx?raw'
import recipePanelSrc from '@/ui/community/recipes/RecipePanel.tsx?raw'
import publishSheetSrc from '@/ui/community/recipes/RecipePublishSheet.tsx?raw'
import summarySrc from '@/ui/community/SummaryBox.tsx?raw'
import prefsCardSrc from '@/ui/NotificationPrefsCard.tsx?raw'
import homeEntrySrc from '@/ui/HomeScreen.tsx?raw'
import visibleHookSrc from '@/ui/community/useCommunityVisible.ts?raw'

const state = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}))

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/data/community', () => ({
  toggleLike: vi.fn(),
  toggleSave: vi.fn(),
  toggleFollowConversation: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  listFollowing: vi.fn(),
  blockUser: vi.fn(),
  deletePost: vi.fn(),
  reportContent: vi.fn(),
  getMyCommunityProfile: vi.fn(),
  communityStatus: vi.fn(),
  requestReadmission: vi.fn(),
  setCommunityAlias: vi.fn(),
  camelize: (v: unknown) => v,
}))
vi.mock('@/ui/community/CommunityProvider', () => ({ useCommunity: () => state.value }))

import { CommunityAccessGate, CommunityUnavailable } from '@/ui/community/CommunityAccessUi'
import { ParticipationOnly, ReadOnlyHint, ReadOnlyNotice, ReadOnlyNoticeView } from '@/ui/community/CommunityAccessNotices'
import { PostActions } from '@/ui/community/PostActions'
import { SummaryBox } from '@/ui/community/SummaryBox'

function setStatus(status: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  state.value = { status, me: null, loading: false, refresh: async () => undefined, requireParticipation: async () => true, ...extra }
}

function render(el: React.ReactElement) {
  return renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>)
}

const FULL = { launched: true, visible: true, isAdmin: false, access: 'participate', accessReason: null }
const READ = { launched: true, visible: true, isAdmin: false, access: 'read', accessReason: 'read_only' }
const NONE = (reason: string) => ({ launched: true, visible: false, isAdmin: false, access: 'none', accessReason: reason })

function post(over: Partial<PostDetail> = {}): PostDetail {
  return {
    id: 'p1',
    kind: 'consejo',
    section: 'hogar',
    topicId: 't',
    topicLabel: 'Ahorro',
    title: 'Cómo ahorrar',
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
  } as PostDetail
}

describe('aviso de solo lectura', () => {
  it('fijo, discreto y con la explicación a un toque', () => {
    const html = render(<ReadOnlyNoticeView />)
    expect(html).toContain('Tienes permiso solo de lectura')
    expect(html).toContain('role="note"')
    expect(html).toContain('<details>')
    expect(html).toContain('¿Qué significa?')
    expect(html).toContain('Permisos de Comunidad')
  })

  it('solo sale con permiso de lectura: ni con acceso completo ni sin estado todavía', () => {
    setStatus(READ)
    expect(render(<ReadOnlyNotice />)).toContain('Tienes permiso solo de lectura')
    setStatus(FULL)
    expect(render(<ReadOnlyNotice />)).toBe('')
    setStatus(null)
    expect(render(<ReadOnlyNotice />)).toBe('')
  })

  it('la frase corta bajo una publicación solo sale en solo lectura', () => {
    setStatus(READ)
    expect(render(<ReadOnlyHint />)).toContain('Solo lectura')
    setStatus(FULL)
    expect(render(<ReadOnlyHint />)).toBe('')
  })
})

describe('pantalla «Comunidad no está disponible para tu cuenta»', () => {
  it('explica cada motivo y vuelve a Inicio', () => {
    const under = render(<CommunityUnavailable reason="under_15" />)
    expect(under).toContain('Comunidad no está disponible para tu cuenta')
    expect(under).toContain('15 años')
    expect(under).toContain('href="/"')
    expect(render(<CommunityUnavailable reason="age_unknown" />)).toContain('fecha de nacimiento')
    expect(render(<CommunityUnavailable reason="not_authorized" />)).toContain('quien administra tu familia')
  })

  it('el marco de rutas la enseña solo sin acceso, y no monta nada más', () => {
    setStatus(NONE('under_15'))
    expect(render(<CommunityAccessGate />)).toContain('Comunidad no está disponible para tu cuenta')
    setStatus(NONE('age_unknown'))
    expect(render(<CommunityAccessGate />)).toContain('fecha de nacimiento')
  })

  it('con acceso (completo o de lectura), cargando o sin estado deja pasar a las rutas', () => {
    for (const s of [FULL, READ, null]) {
      setStatus(s)
      expect(render(<CommunityAccessGate />)).not.toContain('no está disponible')
    }
    setStatus(NONE('under_15'), { loading: true })
    expect(render(<CommunityAccessGate />)).not.toContain('no está disponible')
  })
})

describe('rutas que solo existen para quien participa', () => {
  it('con solo lectura se enseña la explicación, no la pantalla', () => {
    setStatus(READ)
    const html = render(
      <ParticipationOnly>
        <p>PANTALLA DE ESCRIBIR</p>
      </ParticipationOnly>,
    )
    expect(html).not.toContain('PANTALLA DE ESCRIBIR')
    expect(html).toContain('Esto necesita permiso para participar')
  })

  it('con acceso completo se enseña la pantalla', () => {
    setStatus(FULL)
    expect(
      render(
        <ParticipationOnly>
          <p>PANTALLA DE ESCRIBIR</p>
        </ParticipationOnly>,
      ),
    ).toContain('PANTALLA DE ESCRIBIR')
  })

  it('las rutas de escritura están envueltas en ParticipationOnly y todo cuelga del marco de acceso', () => {
    expect(routesSrc).toContain('<Route element={<CommunityAccessGate />}>')
    for (const r of ['nueva', 'editar/:id', 'borradores', 'guardados', 'mi-perfil', 'medallas']) {
      expect(routesSrc, r).toMatch(new RegExp(`path="${r.replace('/', '\\/')}" element=\\{<ParticipationOnly>`))
    }
    // La lectura (portada, secciones, publicaciones, buscador, perfiles, novedades, normas) queda abierta a la lectura.
    for (const r of ['s/:section', 'p/:id', 'buscar', 'u/:id', 'novedades', 'normas']) expect(routesSrc, r).not.toMatch(new RegExp(`path="${r.replace('/', '\\/')}" element=\\{<ParticipationOnly>`))
  })
})

describe('botones de una publicación según el acceso', () => {
  it('con acceso completo: me gusta, guardar y seguir la conversación', () => {
    setStatus(FULL)
    const html = render(<PostActions detail={post()} onPatch={() => undefined} onReload={() => undefined} />)
    expect(html).toContain('Me gusta')
    expect(html).toContain('Guardar')
    expect(html).toContain('Seguir la conversación')
    expect(html).toContain('Más opciones de la publicación')
  })

  it('con solo lectura: se ve el número de me gusta y se puede compartir, pero no interactuar; el menú solo ofrece denunciar (no bloquear)', () => {
    setStatus(READ)
    const html = render(<PostActions detail={post()} onPatch={() => undefined} onReload={() => undefined} />)
    expect(html).not.toContain('Me gusta ·')
    expect(html).not.toContain('Guardar')
    expect(html).not.toContain('Seguir la conversación')
    // Quien solo lee puede DENUNCIAR (el menú no ofrece bloquear, editar ni eliminar: eso lo decide el código del menú con `canParticipate`).
    expect(html).toContain('Más opciones de la publicación')
    expect(html).not.toContain('Seguir a ')
    expect(html).toContain('community-action-static')
    expect(html).toContain('Compartir')
  })

  it('con solo lectura sus propias publicaciones tampoco se editan ni se eliminan', () => {
    setStatus(READ)
    expect(render(<PostActions detail={post({ isMine: true })} onPatch={() => undefined} onReload={() => undefined} />)).not.toContain('Más opciones de la publicación')
    setStatus(FULL)
    expect(render(<PostActions detail={post({ isMine: true })} onPatch={() => undefined} onReload={() => undefined} />)).toContain('Más opciones de la publicación')
  })

  it('el resumen de Pepa se lee en solo lectura, pero sin el botón de actualizarlo', () => {
    const props = { commentCount: 20, summary: 'Resumen', busy: false, failed: false, conversationOpen: false, onOpenConversation: () => undefined, onRefresh: () => undefined }
    setStatus(READ)
    const ro = render(<SummaryBox {...props} />)
    expect(ro).toContain('Resumen')
    expect(ro).not.toContain('Actualizar resumen')
    setStatus(FULL)
    expect(render(<SummaryBox {...props} />)).toContain('Actualizar resumen')
  })
})

describe('los componentes de escritura usan el guard común (código fuente)', () => {
  it('portada y secciones: «Crear publicación» solo con permiso de participar', () => {
    for (const src of [homeSrc, sectionSrc]) {
      expect(src).toContain('useCommunityAccess()')
      expect(src).toMatch(/\{canParticipate && \(\s*<button[^>]*onClick=\{\(\) => void onCreate\(\)\}/)
    }
    expect(sectionSrc).toContain('topics && canParticipate')
  })

  it('publicación: interactuar exige también participar (comentar, responder, votar) y el cuadro de comentar no se monta en solo lectura', () => {
    expect(postActionsSrc).toContain('detail.canInteract && canParticipate')
    expect(postPageSrc).toContain('const canInteract = detail.canInteract && canParticipate')
    expect(postPageSrc).toContain('<PollBox postId={detail.id} canInteract={canInteract} />')
    expect(postPageSrc).toContain('canInteract={canInteract}')
    expect(postPageSrc).toMatch(/\{canInteract && \(\s*<CommentComposer/)
    expect(postPageSrc).toContain('<ReadOnlyHint />')
  })

  it('perfil: seguir, bloquear y denunciar exigen participar', () => {
    expect(profileSrc).toContain('const canFollow = canParticipate &&')
    expect(profileSrc).toContain('const canModerate = canParticipate &&')
  })

  it('receta: valorar e importar exigen participar; compartir desde la Cocina explica el motivo', () => {
    expect(recipePanelSrc).toContain('&& canParticipate')
    expect(recipePanelSrc).toContain('{canParticipate && <RecipeImportButton')
    expect(publishSheetSrc).toContain('participationBlockedText(status)')
    expect(publishSheetSrc).toContain('!canParticipate')
    expect(summarySrc).toContain('{canParticipate && (')
  })

  it('el menú oculta Guardados, Borradores, Medallas y Mi perfil en solo lectura y enseña el aviso fijo', () => {
    for (const l of ['Guardados', 'Borradores', 'Medallas', 'Mi perfil']) expect(layoutSrc, l).toMatch(new RegExp(`${l}', participates: true`))
    expect(layoutSrc).toContain('canParticipate || !l.participates')
    expect(layoutSrc).toContain('<ReadOnlyNotice />')
  })

  it('los avisos de Comunidad de Familia solo se ajustan si se puede participar', () => {
    expect(prefsCardSrc).toContain("accessFromStatus(st).level === 'participate'")
  })

  it('la entrada de Inicio sigue dependiendo de `visible` (que ya incluye el acceso)', () => {
    expect(homeEntrySrc).toContain('useCommunityVisible() === true')
    expect(visibleHookSrc).toContain('return status === null ? null : status.visible')
  })
})

describe('Provider: estado de acceso y reacción a los errores del servidor', () => {
  it('guarda el acceso y expone access, canRead, canParticipate y refreshAccess', () => {
    for (const k of ['access: CommunityAccess', 'canRead: boolean', 'canParticipate: boolean', 'refreshAccess: () => Promise<CommunityAccess>']) expect(providerSrc, k).toContain(k)
    expect(providerSrc).toContain('accessFromStatus(status)')
  })

  it('se suscribe al manejador común de errores, refresca el acceso con UNA consulta y avisa una sola vez', () => {
    expect(providerSrc).toContain('onCommunityAccessError(')
    expect(providerSrc).toContain('accessBusy')
    expect(providerSrc).toContain('communityStatus()')
    expect(providerSrc).toContain('accessErrorNotice(')
    expect(providerSrc).toContain('AccessNoticeDialog')
  })

  it('requireParticipation es la red de seguridad: sin permiso de participar explica y devuelve false', () => {
    const body = /const requireParticipation = useCallback\(async \(\) => \{([\s\S]*?)let current = meRef\.current/.exec(providerSrc)?.[1] ?? ''
    expect(body).toContain("level !== 'participate'")
    expect(body).toContain('return false')
  })
})
