// Comunidad abierta a todas las personas registradas (rediseño de menú, barra, perfil, lectura y recetas importables). Se renderiza lo que se ve
// (renderToStaticMarkup, sin red) y se lee el código fuente para lo que solo se puede comprobar así.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CommunityMenu } from '@/ui/community/CommunityMenu'
import { CommunityToolbar } from '@/ui/community/CommunityToolbar'
import { PostRecipesPanel } from '@/ui/community/recipes/PostRecipesPanel'
import layoutSrc from '@/ui/community/CommunityLayout.tsx?raw'
import profileSrc from '@/ui/community/ProfilePage.tsx?raw'
import recentSrc from '@/ui/community/RecentPage.tsx?raw'
import routesSrc from '@/ui/community/CommunityRoutes.tsx?raw'
import pageSrc from '@/ui/community/PostDetailPage.tsx?raw'
import composerSrc from '@/ui/community/CommentComposer.tsx?raw'
import actionsSrc from '@/ui/community/PostActions.tsx?raw'
import panelSrc from '@/ui/community/recipes/PostRecipesPanel.tsx?raw'
import navSrc from '@/ui/community/communityNav.ts?raw'

vi.mock('@/data/community', () => ({ importPostRecipes: vi.fn() }))

const css = readFileSync(join(process.cwd(), 'src/ui/community/community.css'), 'utf8')
const postCss = readFileSync(join(process.cwd(), 'src/ui/community/communityPost.css'), 'utf8')

const noop = () => undefined
const recipe = (key: string, title: string) => ({
  key,
  title,
  servings: 4,
  ingredients: [
    { name: 'huevos', quantity: '4', unit: '' },
    { name: 'sal', quantity: '', unit: '' },
  ],
  steps: ['Bate los huevos.', 'Cuaja en la sartén.'],
  tags: [],
  tip: null,
})

describe('menú desplegable de Comunidad', () => {
  const render = (isAdmin: boolean, activeKey: 'portada' | 'recetas' | 'hogar' | null = 'recetas', pinned: ('portada' | 'recetas' | 'hogar')[] = []) =>
    renderToStaticMarkup(
      <CommunityMenu order={['portada', 'recetas', 'hogar']} pinned={pinned} activeKey={activeKey} isAdmin={isAdmin} onOrderChange={noop} onTogglePin={noop} onGo={noop} onClose={noop} />,
    )

  it('enseña Portada, Recetas y cocina y Hogar y familia, con el actual resaltado y «Sacar»/«Quitar» como en Compras', () => {
    const html = render(false, 'recetas', ['hogar'])
    for (const label of ['Portada', 'Recetas y cocina', 'Hogar y familia']) expect(html).toContain(label)
    expect(html).toContain('economia-menu-row active')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('📍 Quitar') // Hogar está sacado a la pantalla
    expect(html).toContain('📌 Sacar')
    expect(html).toContain('✏️ Editar')
    expect(html).toContain('Cerrar')
  })

  it('Administración solo se enseña a la administración', () => {
    expect(render(false)).not.toContain('Administración')
    expect(render(true)).toContain('🛠️ Administración')
  })
})

describe('barra de herramientas', () => {
  const render = (canParticipate: boolean) =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={['/comunidad']}>
        <CommunityToolbar canParticipate={canParticipate} profileId="abc" />
      </MemoryRouter>,
    )

  it('con permiso para participar: seis botones, Publicar el más destacado y «Mi perfil» lleva al perfil público propio', () => {
    const html = render(true)
    for (const label of ['Buscar', 'Guardados', 'Borradores', 'Novedades', 'Mi perfil', 'Publicar']) expect(html).toContain(`>${label}<`)
    expect(html).not.toContain('Medallas')
    expect(html).toContain('community-toolbar-publish')
    expect(html).toContain('href="/comunidad/u/abc"')
    expect(html).toContain('href="/comunidad/recientes"')
    expect(html).toContain('href="/comunidad/nueva"')
  })

  it('con permiso solo de lectura: solo Buscar y Novedades', () => {
    const html = render(false)
    expect(html).toContain('>Buscar<')
    expect(html).toContain('>Novedades<')
    for (const label of ['Guardados', 'Borradores', 'Mi perfil', 'Publicar']) expect(html).not.toContain(`>${label}<`)
  })
})

describe('Novedades, Mi perfil y medallas', () => {
  it('Novedades = últimas publicaciones por fecha (la más reciente primero), no los avisos personales; la ruta existe y los comentarios sin leer siguen aparte', () => {
    // «Últimas publicaciones»: primero lo no leído y debajo lo leído (cada grupo por fecha); «Seguidos» sigue por fecha.
    expect(recentSrc).toContain("order: following ? 'recientes' : 'no_leidas'")
    expect(recentSrc).toContain('listPosts(')
    expect(recentSrc).not.toContain('newsBreakdown')
    expect(routesSrc).toContain('path="recientes"')
    expect(routesSrc).toContain('path="novedades"')
    expect(navSrc).toContain('recent: `${COMMUNITY_BASE}/recientes`')
  })

  it('las medallas viven en Mi perfil (con su progreso) y ya no hay una entrada Medallas en el menú ni en la barra', () => {
    // Las medallas con su progreso viven en «Mis medallas» (una tarjeta de acceso en Mi perfil), no como lista larga en el perfil.
    expect(profileSrc).toContain('<Link to={paths.medals} className="community-profile-tile">')
    expect(profileSrc).not.toContain('<MedalsContent')
    expect(layoutSrc).not.toContain('Medallas')
  })
})

describe('lectura de publicaciones largas', () => {
  it('el formulario de comentar va completo al final (no es una capa fija) y el acceso rápido es un botón compacto que se esconde al bajar', () => {
    expect(postCss).not.toMatch(/\.community-composer\s*\{[^}]*position:\s*(sticky|fixed)/)
    expect(postCss).toMatch(/\.community-comment-quick\s*\{[^}]*bottom:\s*calc\(70px \+ env\(safe-area-inset-bottom/)
    expect(postCss).toContain('body.community-floating-hidden .community-comment-quick')
    expect(pageSrc).toContain('<CommentQuickButton />')
    expect(pageSrc).toContain('IntersectionObserver')
    expect(composerSrc).toContain("export const COMMENT_FORM_ID = 'community-comment-form'")
  })

  it('responder sigue llevando al formulario y poniendo el cursor en él', () => {
    expect(composerSrc).toContain("formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })")
    expect(composerSrc).toContain('textRef.current?.focus({ preventScroll: true })')
    expect(composerSrc).toContain('addComment(postId, body, path, replyTarget?.id ?? null)')
  })

  it('el marco deja el hueco inferior para el menú de PEPA y la zona segura del iPhone', () => {
    expect(css).toMatch(/\.community-screen \{\s*padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom/)
  })
})

describe('«Importar a mi Cocina» de las recetas de una publicación', () => {
  const render = (variants: unknown) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <PostRecipesPanel postId="p1" variants={variants} />
      </MemoryRouter>,
    )

  it('cada receta tiene su botón; con varias aparece la casilla para elegir varias y con una sola no', () => {
    const many = render([recipe('tortilla', 'Tortilla de patata'), recipe('francesa', 'Tortilla francesa')])
    expect(many.match(/📥 Importar a mi Cocina/g)).toHaveLength(2)
    expect(many).toContain('Elegir «Tortilla de patata» para importar')
    expect(many).toContain('Ver ingredientes y preparación')
    expect(many).toContain('4 raciones')
    expect(many).not.toContain('Importar las elegidas')
    const one = render([recipe('tortilla', 'Tortilla de patata')])
    expect(one.match(/📥 Importar a mi Cocina/g)).toHaveLength(1)
    expect(one).not.toContain('type="checkbox"')
  })

  it('una cantidad desconocida se enseña sin número (no se inventa) y lo dañado o ausente no enseña nada', () => {
    const html = render([recipe('tortilla', 'Tortilla')])
    expect(html).toContain('<li>4 huevos</li>')
    expect(html).toContain('<li>sal</li>')
    expect(render(null)).toBe('')
    expect(render(undefined)).toBe('')
    expect(render([{ ...recipe('x', 'X'), steps: [] }])).toBe('')
  })

  it('antes de importar enseña qué se va a guardar; importa solo lo elegido, con clave de idempotencia y sin tocar la publicación', () => {
    expect(panelSrc).toContain('Se guardará en tu Cocina:')
    expect(panelSrc).toContain('importPostRecipes(postId, keys, keyRef.current.key)')
    expect(panelSrc).toContain('if (!pending || pending.length === 0 || sending.current) return')
    expect(panelSrc).toContain('se usa la que ya tienes')
    expect(panelSrc).toContain('/alimentacion?tab=Recetas')
  })

  it('«Guardar publicación» sigue existiendo aparte y el panel va en la página de la publicación', () => {
    expect(actionsSrc).toContain('Guardar')
    expect(pageSrc).toContain('<PostRecipesPanel postId={detail.id} variants={detail.variants} />')
  })
})
