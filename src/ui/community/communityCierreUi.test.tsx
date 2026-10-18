// Cierre de la tanda del 17/10/2026: solo adultas, seguir a Pepa, menú semanal desde Cocina con fichas emergentes, filtros compactos de Recetas, avisos con lectura
// automática, imagen de Pepa y «Propón un tema». Se renderiza lo que se ve (sin red) y se lee el código para lo que solo se comprueba así.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countsLabel, createDwellTracker, DWELL_READ_MS, readCount, unreadCount, type AppNotification } from '@/domain/notificationsCenter'
import { peopleLabel, toTopicProposalGroups } from '@/domain/communityAdmin'
import { AuthorAvatar, isPepaAccount } from '@/ui/community/AuthorAvatar'
import { CommunityAvatar } from '@/ui/community/ProfileParts'
import { TopicGroupCard } from '@/ui/community/admin/TopicProposalsTab'
import { ProposeTopicDialog } from '@/ui/community/ProposeTopicDialog'
import profileSrc from '@/ui/community/ProfilePage.tsx?raw'
import recentSrc from '@/ui/community/RecentPage.tsx?raw'
import homeSrc from '@/ui/community/CommunityHome.tsx?raw'
import modalSrc from '@/ui/community/menu/CommunityMenuImportModal.tsx?raw'
import kitchenSrc from '@/ui/AlimentacionScreen.tsx?raw'
import menuPanelSrc from '@/ui/community/menu/MenuPostPanel.tsx?raw'
import accessSrc from '@/domain/communityAccess.ts?raw'

vi.mock('@/data/community', () => ({ proposeTopic: vi.fn(), listCommunityTopics: vi.fn(async () => []) }))
vi.mock('@/ui/community/CommunityProvider', () => ({ useCommunity: () => ({ requireParticipation: async () => true }) }))

const n = (id: string, read: boolean): AppNotification => ({
  id,
  bucket: 'personal',
  category: 'x',
  title: 't',
  body: '',
  url: null,
  groupKey: null,
  payload: {},
  createdAt: '2026-10-17T10:00:00Z',
  readAt: read ? '2026-10-17T11:00:00Z' : null,
})

describe('avisos: lectura automática a los 3 segundos a la vista', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('un aviso que sigue a la vista 3 s se da por leído, UNA sola vez', () => {
    const seen = vi.fn()
    const t = createDwellTracker(seen)
    t.enter('a')
    vi.advanceTimersByTime(DWELL_READ_MS - 1)
    expect(seen).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(seen).toHaveBeenCalledWith('a')
    t.enter('a')
    vi.advanceTimersByTime(DWELL_READ_MS * 2)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('si sale de la vista antes de tiempo (o se cierra el panel enseguida) no se marca', () => {
    const seen = vi.fn()
    const t = createDwellTracker(seen)
    t.enter('a')
    t.enter('b')
    vi.advanceTimersByTime(2000)
    t.leave('a')
    t.cancelAll() // el panel se cierra
    vi.advanceTimersByTime(10_000)
    expect(seen).not.toHaveBeenCalled()
    expect(t.pending()).toBe(0)
  })

  it('cuenta nuevas y leídas por separado', () => {
    const list = [n('1', false), n('2', false), n('3', true)]
    expect(unreadCount(list)).toBe(2)
    expect(readCount(list)).toBe(1)
    expect(countsLabel(2, 1)).toBe('2 nuevas · 1 leída')
    expect(countsLabel(1, 0)).toBe('1 nueva · 0 leídas')
  })
})

describe('imagen de Pepa en Comunidad', () => {
  it('solo la cuenta OFICIAL con el emoji de Pepa usa la miniatura; una persona con ese emoji no', () => {
    expect(isPepaAccount(true, '👵')).toBe(true)
    expect(isPepaAccount(false, '👵')).toBe(false)
    expect(isPepaAccount(true, '🏡')).toBe(false)
    expect(renderToStaticMarkup(<AuthorAvatar emoji="👵" official />)).toContain('community-pepa-mini')
    expect(renderToStaticMarkup(<AuthorAvatar emoji="👵" official={false} />)).not.toContain('<img')
    expect(renderToStaticMarkup(<AuthorAvatar emoji="🍳" official />)).toContain('🍳')
  })

  it('en el perfil y en las listas se pinta la imagen de Pepa (círculo) y el resto, su emoji o iniciales', () => {
    expect(renderToStaticMarkup(<CommunityAvatar alias="Pepa" emoji="👵" size="lg" official />)).toContain('community-avatar-pepa')
    expect(renderToStaticMarkup(<CommunityAvatar alias="Ana" emoji="🍳" size="lg" />)).not.toContain('<img')
  })
})

describe('seguir a Pepa y a otras personas', () => {
  it('el perfil se puede seguir también si es oficial, enseña el número de seguidores y «Siguiendo»', () => {
    expect(profileSrc).toContain('const canFollow = canParticipate && !profile.isMe && profile.canInteract !== false')
    expect(profileSrc).toContain('profile.followerCount')
    expect(profileSrc).toContain('✓ Siguiendo')
    expect(profileSrc).not.toMatch(/listFollowers|\bfollowers\b/)
  })

  it('«Seguidos»: el mismo listado con solo las cuentas que sigo y un cambio rápido entre Últimas y Seguidos', () => {
    expect(recentSrc).toContain("sp.get('ver') === 'seguidos'")
    expect(recentSrc).toContain('following })')
    expect(recentSrc).toContain('👥 Seguidos')
  })
})

describe('solo personas adultas', () => {
  it('los textos hablan de 18 años y de la ficha de Familia; no queda rastro de permisos de la familia ni de declaraciones', () => {
    expect(accessSrc).toContain('solo para personas de 18 años o más')
    expect(accessSrc).not.toContain('Permisos de Comunidad')
    expect(accessSrc).not.toContain('under_15')
    expect(accessSrc).not.toContain('guardian')
  })
})

describe('Cocina → Menú semanal', () => {
  it('«📥 Importar menú de Comunidad» abre el MISMO importador (MenuImportSheet), solo con Comunidad abierta', () => {
    expect(kitchenSrc).toContain('📥 Importar menú de Comunidad')
    expect(kitchenSrc).toContain('communityVisible === true')
    expect(modalSrc).toContain('<MenuImportSheet')
    expect(modalSrc).toContain("initial={{ scope: 'week' }}")
    expect(modalSrc).toContain("kind: 'menu'")
    // No hay otro selector de raciones ni otro flujo: todo lo decide MenuImportSheet.
    expect(modalSrc).not.toContain('runMenuImport')
    expect(modalSrc).not.toContain('type="number"')
  })

  it('los platos con receta guardada son un enlace que abre su ficha emergente (ingredientes, raciones, preparación, foto) y desde ahí la receta completa', () => {
    expect(kitchenSrc).toContain('setViewRecipeId(r.id)')
    expect(kitchenSrc).toContain('function RecipeQuickViewModal(')
    expect(kitchenSrc).toContain('Abrir la receta completa (y editarla)')
    expect(kitchenSrc).toContain('<RecipeImage imagePath={recipe.imagePath}')
    // El texto libre sigue siendo texto: solo las entradas con receta real son enlace.
    expect(kitchenSrc).toContain('<span>{e.freeText}</span>')
  })

  it('el menú semanal publicado: el artículo completo a la vista y el importador debajo', () => {
    expect(menuPanelSrc).not.toContain('<details')
    expect(menuPanelSrc.indexOf('<CommunityRichText')).toBeLessThan(menuPanelSrc.indexOf('<MenuPlanView'))
  })
})

describe('Recetas: filtros compactos', () => {
  it('buscador, ⭐ Favoritos y un botón «Filtros»; las etiquetas y el ingrediente van DENTRO del panel', () => {
    expect(kitchenSrc).toContain('🔍 Buscar receta guardada')
    expect(kitchenSrc).toContain('⭐ Favoritos')
    expect(kitchenSrc).toContain('🎚️ Filtros')
    expect(kitchenSrc).toContain('{filtersOpen && (')
    expect(kitchenSrc).toContain('Con el ingrediente')
    // Ya no hay una fila permanente con todas las etiquetas encima de la lista.
    const beforePanel = kitchenSrc.slice(kitchenSrc.indexOf('recipe-quick-filters'), kitchenSrc.indexOf('{filtersOpen && ('))
    expect(beforePanel).not.toContain('availableTags.map')
  })
})

describe('Propón un tema', () => {
  it('formulario de categoría + tema, enviado al servidor de propuestas y separado del buzón de sugerencias; antes de «Invitar amigos»', () => {
    const html = renderToStaticMarkup(<ProposeTopicDialog onClose={() => undefined} />)
    expect(html).toContain('Propón un tema')
    expect(html).toContain('Categoría')
    expect(html).toContain('Enviar propuesta')
    expect(html).toContain('distinto del buzón de sugerencias')
    expect(homeSrc.indexOf('<ProposeTopicButton />')).toBeLessThan(homeSrc.indexOf('<InviteFriendsButton />'))
  })

  it('la administración ve los temas agrupados (cuántas personas) sin saber quién propone, y puede convertirlos en borrador o descartarlos', () => {
    const groups = toTopicProposalGroups([{ groupKey: 'k', label: 'Compra semanal', topicId: 't', topicLabel: 'Ahorro', people: 3, proposals: 4, firstAt: 'a', lastAt: 'b', texts: ['x', 'y'], ids: ['1', '2'] }, { raro: true }])
    expect(groups).toHaveLength(1)
    expect(peopleLabel(1)).toBe('1 persona')
    expect(peopleLabel(3)).toBe('3 personas')
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TopicGroupCard group={groups[0]} picked={false} onToggle={() => undefined} busy={false} onDraft={() => undefined} onDismiss={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('3 personas')
    expect(html).toContain('Convertir en borrador')
    expect(html).toContain('Descartar')
    expect(html).not.toContain('profile')
  })
})

describe('contenido inicial: raciones desconocidas', () => {
  it('las recetas cuyo texto no da raciones llevan servings null en el JSON y en el parche', () => {
    const root = process.cwd()
    const data = JSON.parse(readFileSync(join(root, 'supabase/seed/community_post_recipes.json'), 'utf8')) as Record<string, { key: string; servings: number | null }[]>
    const all = Object.entries(data)
      .filter(([k]) => !k.startsWith('_'))
      .flatMap(([, v]) => v)
    const unknown = all.filter((r) => r.servings === null).map((r) => r.key)
    expect(unknown.sort()).toEqual(
      [
        'albondigas-y-hamburguesas-con-calabacin',
        'bizcocho-de-platano',
        'caldo-casero-de-verduras',
        'cubitos-de-albahaca-y-ajo',
        'cubitos-de-cilantro-y-lima',
        'cubitos-de-perejil-y-ajo',
        'cubitos-de-romero-y-tomillo',
        'picatostes',
        'pan-rallado-casero',
        'salsa-de-calabaza-para-pasta',
        'salsa-de-tomate-con-zanahoria',
        'tarro-de-galletas-para-regalar',
      ].sort(),
    )
    // Las que SÍ dicen raciones en su texto las conservan.
    expect(all.find((r) => r.key === 'migas')?.servings).toBe(4)
    expect(all.find((r) => r.key === 'tortitas-de-platano')?.servings).toBe(2)
    expect(all.find((r) => r.key === 'tortilla-con-patata')?.servings).toBe(1)
    expect(all.filter((r) => r.servings !== null)).toHaveLength(16)
  })
})
