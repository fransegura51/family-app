// Prompt consolidado 17/10/2026: filtros de varios temas, «Leído», orden del marco, botón de menú en el móvil nativo y menú «Más» dentro de la pantalla.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PostCard } from '@/domain/community'
import { clearOpenedLocally, markOpenedLocally, readBadge, READ_LABELS } from '@/domain/communityRead'
import { Breadcrumbs, BreadcrumbSlotContext } from '@/ui/community/Breadcrumbs'
import { PostCardView } from '@/ui/community/PostCardView'
import layoutSrc from '@/ui/community/CommunityLayout.tsx?raw'
import sectionSrc from '@/ui/community/CommunitySectionPage.tsx?raw'
import menuSrc from '@/ui/community/ContentMenu.tsx?raw'
import dataSrc from '@/data/community.ts?raw'

vi.mock('@/data/community', () => ({ unblockUser: vi.fn() }))

const css = readFileSync(join(process.cwd(), 'src/ui/styles.css'), 'utf8')
const card = (over: Partial<PostCard> = {}): PostCard =>
  ({
    id: 'p1',
    kind: 'consejo',
    section: 'hogar',
    topicId: 'ahorro-economia',
    topicLabel: 'Ahorro y economía',
    title: 'Un consejo',
    excerpt: 'Texto',
    authorId: 'a1',
    authorAlias: 'Antonia',
    authorAvatar: null,
    authorIsOfficial: false,
    authorDeleted: false,
    isOfficial: false,
    officialLabel: null,
    featured: false,
    thumbPath: null,
    likeCount: 0,
    commentCount: 0,
    saveCount: 0,
    avgRating: null,
    ratingCount: 0,
    importCount: 0,
    createdAt: '2026-10-17T10:00:00Z',
    editedAt: null,
    lastActivityAt: '2026-10-17T10:00:00Z',
    unanswered: false,
    likedByMe: false,
    savedByMe: false,
    canInteract: true,
    ...over,
  }) as PostCard
const html = (c: PostCard) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PostCardView item={c} />
    </MemoryRouter>,
  )

afterEach(() => clearOpenedLocally())

describe('«✓ Leído» / «Actualizada» en las tarjetas', () => {
  it('sin lectura no hay etiqueta; leída = «✓ Leído»; cambiada tras leerla = «Actualizada»', () => {
    expect(html(card())).not.toContain('community-card-read')
    expect(html(card({ readState: 'read' }))).toContain('✓ Leído')
    expect(html(card({ readState: 'updated' }))).toContain('Actualizada')
    expect(html(card({ readState: 'updated' }))).not.toContain('✓ Leído')
  })

  it('la etiqueta va en la fila de interacciones (no añade una línea ni altura a la tarjeta)', () => {
    const out = html(card({ readState: 'read' }))
    const start = out.indexOf('community-card-stats')
    const stats = out.slice(start, out.indexOf('</div>', start))
    expect(stats).toContain('community-card-read')
  })

  it('abrir una publicación en esta sesión la deja leída aunque la lista venga de la memoria (volver atrás)', () => {
    expect(readBadge(card())).toBeNull()
    markOpenedLocally('p1')
    expect(readBadge(card())).toBe('read')
    expect(html(card())).toContain(READ_LABELS.read)
    expect(readBadge(card({ id: 'otra' }))).toBeNull()
  })

  it('el cliente solo marca como abierta al leer el DETALLE, no al pedir listas', () => {
    expect(dataSrc).toContain('markOpenedLocally(id)')
    expect((dataSrc.match(/markOpenedLocally/g) ?? []).length).toBe(2) // import + una llamada
  })
})

describe('filtros de varios temas en las secciones', () => {
  it('Todos + temas destacados, «Ver todos los temas» / «Ver menos», contador discreto y «Limpiar filtros»', () => {
    for (const t of ['Todos', 'Ver todos los temas', 'Ver menos', 'Limpiar filtros', 'temas seleccionados', 'toggleTopic', 'splitFeaturedTopics', 'aria-expanded']) expect(sectionSrc).toContain(t)
    expect(sectionSrc).toContain('community-chips-compact')
  })
  it('«Ordenar por» y «Tipo» siguen, y «Mis temas favoritos» es un bloque aparte de los filtros temporales', () => {
    expect(sectionSrc).toContain('Ordenar por')
    expect(sectionSrc).toContain('Tipo')
    expect(sectionSrc.indexOf('community-filter-grid')).toBeLessThan(sectionSrc.indexOf('⭐ Mis temas favoritos'))
  })
  it('los filtros viven en la dirección y se recuperan al volver atrás', () => {
    expect(sectionSrc).toContain('setSp(sectionFiltersToParams(next), { replace: true })')
    expect(sectionSrc).toContain("navType === 'POP'")
  })
})

describe('orden del marco de Comunidad', () => {
  it('menú, cabecera, migas, barra de herramientas (una sola vez) y contenido', () => {
    const iMenu = layoutSrc.indexOf('community-menu-btn')
    const iHeader = layoutSrc.indexOf('<CommunityHeader />', iMenu)
    const iCrumbs = layoutSrc.indexOf('community-crumb-slot', iHeader)
    const iToolbar = layoutSrc.indexOf('<CommunityToolbar', iCrumbs)
    const iOutlet = layoutSrc.indexOf('<Outlet />', iToolbar)
    expect(iMenu).toBeGreaterThan(-1)
    expect(iHeader).toBeGreaterThan(iMenu)
    expect(iCrumbs).toBeGreaterThan(iHeader)
    expect(iToolbar).toBeGreaterThan(iCrumbs)
    expect(iOutlet).toBeGreaterThan(iToolbar)
    expect((layoutSrc.match(/<CommunityToolbar/g) ?? []).length).toBe(1)
    expect(layoutSrc).not.toContain('community-topstrip-title')
  })

  it('las migas de cada página se colocan en su hueco (debajo de la cabecera); sin marco se pintan en su sitio', () => {
    const crumbs = [{ label: 'Comunidad', to: '/comunidad' }, { label: 'Recetas y cocina' }]
    const inline = renderToStaticMarkup(
      <MemoryRouter>
        <Breadcrumbs crumbs={crumbs} />
      </MemoryRouter>,
    )
    expect(inline).toContain('Migas de pan')
    // El marco existe pero el hueco aún no está montado: no se pinta nada (así no saltan).
    const waiting = renderToStaticMarkup(
      <MemoryRouter>
        <BreadcrumbSlotContext.Provider value={null}>
          <Breadcrumbs crumbs={crumbs} />
        </BreadcrumbSlotContext.Provider>
      </MemoryRouter>,
    )
    expect(waiting).toBe('')
  })
})

describe('botón «☰ Menú» flotante en la app nativa', () => {
  it('respeta la zona segura de arriba igual que .app-content y los botones de Pepa', () => {
    expect(css).toContain('top: calc(58px + env(safe-area-inset-top, 0px));')
    expect(css).toContain('top: calc(80px + env(safe-area-inset-top, 0px));')
    expect(css).toContain('padding-top: calc(54px + env(safe-area-inset-top, 0px));')
    expect(css).toContain('top: calc(8px + env(safe-area-inset-top, 0px));')
  })
})

describe('menú «··· Más» dentro de la pantalla', () => {
  it('se coloca midiendo el botón y el menú (hacia arriba si no cabe abajo) y se cierra tocando fuera', () => {
    expect(menuSrc).toContain('placeMenu')
    expect(menuSrc).toContain("position: 'fixed'")
    expect(menuSrc).toContain('visualViewport')
    expect(menuSrc).toContain("document.addEventListener('mousedown', onDown)")
    expect(menuSrc).toContain("e.key === 'Escape'")
  })
})
