// Centro de Mando de Comunidad: estructura de cada pestaña y de cada tarjeta, con renderizado real (react-dom/server, sin navegador).
// En el servidor no se ejecutan los efectos: lo que se ve es siempre el primer pintado (cargando), así que esto comprueba que NUNCA queda en blanco.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import adminPageSource from '@/ui/community/AdminPage.tsx?raw'
import sharedSource from '@/ui/community/admin/AdminShared.tsx?raw'
import reportsSource from '@/ui/community/admin/ModerationReports.tsx?raw'
import listsSource from '@/ui/community/admin/ModerationLists.tsx?raw'
import usersSource from '@/ui/community/admin/UsersTab.tsx?raw'
import officialSource from '@/ui/community/admin/OfficialTab.tsx?raw'
import pollsSource from '@/ui/community/admin/PollsTab.tsx?raw'
import settingsSource from '@/ui/community/admin/SettingsTab.tsx?raw'
import logSource from '@/ui/community/admin/LogTab.tsx?raw'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// El CSS se lee del disco (con ?raw vitest lo deja vacío).
const cssSource = readFileSync(join(process.cwd(), 'src/ui/community/communityAdmin.css'), 'utf8')

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

// Quién mira: por defecto, un administrador con Comunidad cerrada; cada prueba puede cambiarlo.
const community = { status: { launched: false, visible: true, isAdmin: true } as { launched: boolean; visible: boolean; isAdmin: boolean } | null, loading: false }
vi.mock('@/ui/community/CommunityProvider', () => ({
  useCommunity: () => ({ status: community.status, me: null, loading: community.loading, refresh: async () => undefined, requireParticipation: async () => true }),
}))

const { AdminPage, AdminCenter, NotAdmin } = await import('@/ui/community/AdminPage')
const { AdminTabs, NoteForm, TwoTapButton, AdminLoading } = await import('@/ui/community/admin/AdminShared')
const { ReportGroupCard } = await import('@/ui/community/admin/ModerationReports')
const { HiddenCard, ReadmissionCard, RemovalCard } = await import('@/ui/community/admin/ModerationLists')
const { UserCard } = await import('@/ui/community/admin/UsersTab')
const { ProposalCard, ProposalEditForm } = await import('@/ui/community/admin/OfficialTab')
const { MenuCard, MenuReview } = await import('@/ui/community/admin/MenusSection')
const { PollCard } = await import('@/ui/community/admin/PollsTab')
const { FeaturedCard } = await import('@/ui/community/admin/FeaturedTab')
const { SettingRow } = await import('@/ui/community/admin/SettingsTab')
const dom = await import('@/domain/communityAdmin')

const noop = () => undefined
const render = (node: Parameters<typeof renderToStaticMarkup>[0], url = '/comunidad/admin') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, node))
const page = (tab: string) => render(createElement(AdminPage), `/comunidad/admin?tab=${tab}`)

describe('acceso: solo administración', () => {
  it('quien no es administrador ve el aviso y no se monta nada que llame al servidor', () => {
    community.status = { launched: true, visible: true, isAdmin: false }
    const html = page('resumen')
    expect(html).toContain('Esta zona es solo para la administración')
    expect(html).not.toContain('role="tablist"')
    expect(html).not.toContain('Centro de Mando de Comunidad')
    community.status = { launched: false, visible: true, isAdmin: true }
  })
  it('sin estado conocido tampoco se enseña el Centro de Mando', () => {
    community.status = null
    expect(page('resumen')).toContain('Esta zona es solo para la administración')
    community.status = { launched: false, visible: true, isAdmin: true }
  })
  it('mientras carga el estado enseña «Cargando…», no una pantalla en blanco', () => {
    community.loading = true
    expect(page('resumen')).toContain('Cargando')
    community.loading = false
  })
  it('el código decide el acceso ANTES de montar las pestañas (que son las que llaman al servidor)', () => {
    const gate = adminPageSource.slice(adminPageSource.indexOf('export function AdminPage'), adminPageSource.indexOf('export function NotAdmin'))
    expect(gate).toContain('status?.isAdmin')
    expect(gate).not.toContain('adminOverview')
    expect(gate.indexOf('NotAdmin')).toBeLessThan(gate.indexOf('AdminCenter'))
    expect(render(createElement(NotAdmin))).toContain('Volver a la portada de Comunidad')
  })
})

describe('barra de pestañas', () => {
  it('tiene las 8 pestañas con roles accesibles y solo la activa entra con Tab', () => {
    const html = page('usuarios')
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)).toHaveLength(8)
    for (const t of ['Resumen', 'Moderación', 'Usuarios', 'Contenido oficial', 'Encuestas', 'Destacados', 'Configuración', 'Historial']) expect(html).toContain(t)
    expect(html).toMatch(/id="cadm-tab-usuarios"[^>]*aria-selected="true"[^>]*tabindex="0"|aria-selected="true"[^>]*id="cadm-tab-usuarios"/)
    expect(html).toContain('role="tabpanel"')
    expect(html).toContain('aria-labelledby="cadm-tab-usuarios"')
  })
  it('cada pestaña activa pinta su panel con su título y no queda vacía', () => {
    for (const t of dom.ADMIN_TABS) {
      const html = page(t.id)
      expect(html, t.id).toContain(`id="cadm-panel-${t.id}"`)
      expect(html, t.id).toContain(`<h2 class="cadm-panel-title">${t.label}</h2>`)
      const panel = html.slice(html.indexOf(`id="cadm-panel-${t.id}"`))
      expect(panel.length, t.id).toBeGreaterThan(300)
    }
  })
  it('una dirección rara cae en Resumen', () => {
    expect(page('xyz')).toContain('id="cadm-panel-resumen"')
  })
  it('maneja las flechas, Inicio y Fin (patrón de pestañas)', () => {
    for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) expect(sharedSource).toContain(`'${k}'`)
    expect(render(createElement(AdminTabs, { active: 'resumen', onSelect: noop, idBase: 'x' }))).toContain('aria-label="Secciones del Centro de Mando"')
  })
})

describe('Resumen', () => {
  it('trae el interruptor de apertura con su explicación y dos toques', () => {
    const html = page('resumen')
    expect(html).toContain('Apertura de Comunidad')
    expect(html).toContain('Abrir Comunidad a todos')
    expect(html).toContain('Comunidad está CERRADA')
    expect(sharedSource).toContain('TwoTapButton')
    expect(sharedSource).toContain('Toca otra vez para confirmar')
  })
  it('con Comunidad abierta ofrece cerrarla', () => {
    community.status = { launched: true, visible: true, isAdmin: true }
    const html = page('resumen')
    expect(html).toContain('Cerrar Comunidad')
    expect(html).toContain('Comunidad está ABIERTA')
    community.status = { launched: false, visible: true, isAdmin: true }
  })
  it('muestra las métricas y los accesos rápidos cuando hay datos', async () => {
    const { OverviewTab } = await import('@/ui/community/admin/OverviewTab')
    const overview = dom.toAdminOverview({ posts: 40, posts7d: 6, comments7d: 21, members: 12, openReports: 2, hiddenContent: 1, activeBans: 1, readmissionRequests: 1, removalRequests: 0, featured: 3 })
    const html = render(createElement(OverviewTab, { overview, loading: false, error: null, onReload: noop, onGo: noop }))
    for (const t of ['Publicaciones', 'Publicaciones (7 días)', 'Comentarios (7 días)', 'Miembros', 'Denuncias abiertas', 'Contenido oculto', 'Expulsiones activas', 'Readmisiones pedidas', 'Eliminaciones pedidas', 'Destacados'])
      expect(html).toContain(t)
    expect(html).toContain('>40<')
    expect(html).toContain('Denuncias por revisar')
    expect(html).toContain('Propuestas de Pepa para revisar')
  })
  it('un error enseña el mensaje y «Reintentar»', async () => {
    const { OverviewTab } = await import('@/ui/community/admin/OverviewTab')
    const html = render(createElement(OverviewTab, { overview: null, loading: false, error: 'Algo ha fallado. Inténtalo de nuevo.', onReload: noop, onGo: noop }))
    expect(html).toContain('Algo ha fallado')
    expect(html).toContain('Reintentar')
  })
})

describe('Moderación', () => {
  it('explica las reglas y tiene sus cuatro apartados', () => {
    const html = page('moderacion')
    expect(html).toContain('NO retira nada')
    expect(html).toContain('provisional')
    expect(html).toContain('Tres advertencias')
    expect(html).toContain('queda resuelto para el otro')
    for (const t of ['Denuncias', 'Ocultos', 'Readmisiones', 'Eliminación de contenido']) expect(html).toContain(t)
    expect(html).toContain('Cargando denuncias')
  })
  it('una denuncia de publicación ofrece Sin acción, Ocultar, Advertir y Expulsar', () => {
    const [g] = dom.toReportGroups([
      { targetType: 'post', targetId: 'p1', reportCount: 3, reasons: ['acoso', 'spam'], firstAt: '2026-10-01T10:00:00Z', lastAt: '2026-10-02T10:00:00Z', status: 'open', content: { title: 'Mi receta', excerpt: 'Un texto', status: 'published', authorAlias: 'Marta' } },
    ])
    const html = render(createElement(ReportGroupCard, { group: g, onResolved: noop }))
    for (const b of ['Sin acción', 'Ocultar', 'Advertir', 'Expulsar']) expect(html).toContain(`>${b}<`)
    expect(html).toContain('3 denuncias')
    expect(html).toContain('Acoso o faltas de respeto')
    expect(html).toContain('Spam o publicidad')
    expect(html).toContain('Marta')
    expect(html).toContain('Primera denuncia')
    expect(html).toContain('Ver el contenido completo')
  })
  it('una denuncia ya resuelta enseña cómo se resolvió y no ofrece acciones', () => {
    const [g] = dom.toReportGroups([{ targetType: 'comment', targetId: 'c1', reportCount: 1, reasons: ['otro'], status: 'resolved', resolution: 'oculto', content: { excerpt: 'x', status: 'hidden', authorAlias: 'Luis' } }])
    const html = render(createElement(ReportGroupCard, { group: g, onResolved: noop }))
    expect(html).toContain('Resuelta: Ocultado')
    expect(html).not.toContain('>Advertir<')
  })
  it('una denuncia a una persona no ofrece Ocultar', () => {
    const [g] = dom.toReportGroups([{ targetType: 'user', targetId: 'u1', reportCount: 2, reasons: ['acoso'], status: 'open', content: { authorAlias: 'Pablo' } }])
    const html = render(createElement(ReportGroupCard, { group: g, onResolved: noop }))
    expect(html).not.toContain('>Ocultar<')
    expect(html).toContain('>Expulsar<')
  })
  it('el motivo es obligatorio para ocultar, advertir y expulsar (formulario y validación)', () => {
    expect(reportsSource).toContain('required={picked.needsNote}')
    expect(reportsSource).toContain('adminResolveContent')
    const html = render(createElement(NoteForm, { title: 'Ocultar', required: true, confirmLabel: 'Confirmar: Ocultar', onSubmit: noop, onCancel: noop }))
    expect(html).toContain('(obligatorio)')
    expect(html).toContain('<textarea')
    expect(html).toContain('Confirmar: Ocultar')
  })
  it('contenido oculto: restaurar pide motivo y distingue lo oculto automáticamente', () => {
    const [auto] = dom.toHiddenItems([{ type: 'post', id: 'p1', title: 'Algo', reason: 'auto: varias denuncias', hiddenAt: '2026-10-01T00:00:00Z', authorAlias: 'Ana' }])
    const html = render(createElement(HiddenCard, { item: auto, onRestored: noop }))
    expect(html).toContain('Restaurar')
    expect(html).toContain('Ocultado solo')
    expect(listsSource).toContain('adminSetVisibility(item.type, item.id, true, note)')
  })
  it('readmisión: aprobar o rechazar', () => {
    const [r] = dom.toReadmissions([{ banId: 'b1', profileId: 'u1', alias: 'Pablo', reason: 'Tercera advertencia', endsAt: '2026-10-01T00:00:00Z', requestedAt: '2026-10-05T00:00:00Z' }])
    const html = render(createElement(ReadmissionCard, { item: r, onDone: noop }))
    expect(html).toContain('Pablo')
    expect(html).toContain('>Aprobar<')
    expect(html).toContain('>Rechazar<')
    expect(listsSource).toContain('adminResolveReadmission')
  })
  it('eliminación de contenido: eliminar o rechazar, sin enseñar el contacto', () => {
    const [q] = dom.toRemovalRequests([{ id: 'q1', scope: 'all_my_content', detail: 'Quiero irme', status: 'open', alias: 'Eva', requesterContact: 'eva@correo.com', createdAt: '2026-10-01T00:00:00Z' }])
    const html = render(createElement(RemovalCard, { item: q, onDone: noop }))
    expect(html).toContain('Eliminar el contenido')
    expect(html).toContain('Rechazar')
    expect(html).toContain('TODAS')
    expect(html).not.toContain('correo.com')
    expect(listsSource).toContain('adminHandleRemoval')
  })
})

describe('Usuarios', () => {
  const [u] = dom.toAdminUsers([
    {
      id: 'u1',
      alias: 'Rosa',
      createdAt: '2026-09-01T00:00:00Z',
      posts: 4,
      warnings: [{ id: 'w1', reason: 'Spam', issuedAt: '2026-09-20T00:00:00Z', revokedAt: null }],
      bans: [],
      banState: 'ok',
    },
  ])
  it('tiene buscador por alias y avisa de que el historial es restringido', () => {
    const html = page('usuarios')
    expect(html).toContain('Buscar por alias')
    expect(html).toContain('type="search"')
    expect(html).toContain('solo lo ve la administración')
    expect(html).toContain('Buscando personas')
  })
  it('cada persona: estado, advertencias vigentes y acciones', () => {
    const html = render(createElement(UserCard, { user: u, onChanged: noop }))
    expect(html).toContain('Rosa')
    expect(html).toContain('Participa con normalidad')
    expect(html).toContain('Advertencias vigentes: 1 de 3')
    expect(html).toContain('>Advertir<')
    expect(html).toContain('Expulsar de Comunidad')
    expect(html).toContain('Ver el historial de infracciones')
  })
  it('todas las acciones llaman a su función y piden motivo', () => {
    for (const f of ['adminWarn', 'adminRevokeWarning', 'adminBan', 'adminLiftBan']) expect(usersSource).toContain(f)
    expect((usersSource.match(/required\n/g) ?? []).length).toBe(4)
    expect(usersSource).toContain('Retirar esta advertencia')
    expect(usersSource).toContain('Retirar esta expulsión')
  })
})

describe('Contenido oficial', () => {
  const [tip, poll, article, approved] = dom.toProposals([
    { id: 'i1', kind: 'tip', section: 'hogar', topicId: 'ahorro', title: 'Apaga las luces', body: 'Un consejo **útil**', status: 'proposed', version: 1, batchWeek: '2026-10-12' },
    { id: 'i2', kind: 'poll', section: 'recetas', topicId: 'platos-principales', title: '¿Qué cenas hoy?', status: 'proposed', version: 2, payload: { options: ['Pasta', 'Arroz'] } },
    { id: 'i3', kind: 'article', section: 'hogar', topicId: 'ahorro', title: 'Cuánto cuesta la cesta', status: 'proposed', version: 1, payload: { sources: [], methodology: '' } },
    {
      id: 'i4',
      kind: 'article',
      section: 'hogar',
      topicId: 'ahorro',
      title: 'Precios',
      status: 'approved',
      version: 2,
      approvedVersion: 2,
      approvedAt: '2026-10-14T08:00:00Z',
      approvedByName: 'Jennifer',
      payload: { sources: [{ title: 'INE: IPC', publisher: 'INE', url: 'https://www.ine.es/ipc', date: '2026-09' }], methodology: 'Serie anual', comparison: 'Respecto a 2025' },
    },
  ])
  it('muestra tipo, tema, título, cuerpo y las acciones editar, aprobar y rechazar', () => {
    const html = render(createElement(ProposalCard, { proposal: tip, topics: [{ id: 'ahorro', section: 'hogar', label: 'Ahorro' }], onDone: noop }))
    expect(html).toContain('Consejo de Pepa')
    expect(html).toContain('Tema: Ahorro')
    expect(html).toContain('Apaga las luces')
    expect(html).toContain('<strong>útil</strong>')
    for (const b of ['Editar', 'Aprobar', 'Rechazar']) expect(html).toContain(`>${b}<`)
    expect(html).toContain('Pendiente de revisar')
    expect(html).toContain('Lote de la semana del 12 de octubre')
  })
  it('las encuestas enseñan sus opciones y explican la programación', () => {
    const html = render(createElement(ProposalCard, { proposal: poll, topics: [], onDone: noop }))
    expect(html).toContain('Opciones de la encuesta')
    expect(html).toContain('Pasta')
    expect(html).toContain('sale sola el próximo sábado a las 10:00')
    expect(html).toContain('NO se publica al momento')
    expect(html).toContain('Versión 2')
  })
  it('un artículo sin fuentes avisa de que no se puede aprobar (y el servidor lo confirma con NO_SOURCES)', () => {
    const html = render(createElement(ProposalCard, { proposal: article, topics: [], onDone: noop }))
    expect(html).toContain('no tiene fuentes externas')
    expect(html).toContain('Sin fuentes')
    expect(officialSource).toContain('adminApproveProposal')
    expect(officialSource).toContain('ActionNotice error={mode')
  })
  it('un artículo con fuentes las enseña con enlace seguro, metodología y comparación', () => {
    const html = render(createElement(ProposalCard, { proposal: approved, topics: [], onDone: noop }))
    expect(html).toContain('href="https://www.ine.es/ipc"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('Metodología')
    expect(html).toContain('Serie anual')
    expect(html).toContain('Comparación y contexto')
  })
  it('una propuesta aprobada enseña quién aprobó, cuándo y qué versión, y avisa de que editar obliga a aprobar de nuevo', () => {
    const html = render(createElement(ProposalCard, { proposal: approved, topics: [], onDone: noop }))
    expect(html).toContain('Aprobada por Jennifer')
    expect(html).toContain('versión 2')
    expect(html).toContain('hay que aprobarla de nuevo')
    expect(html).not.toContain('>Aprobar<')
  })
  it('la edición permite cambiar título, texto, tema, opciones y fuentes', () => {
    const t = render(createElement(ProposalEditForm, { proposal: tip, topics: [{ id: 'ahorro', section: 'hogar', label: 'Ahorro' }], busy: false, error: null, onSave: noop, onCancel: noop }))
    for (const s of ['Título', 'Texto', 'Tema', 'Guardar cambios']) expect(t).toContain(s)
    const p = render(createElement(ProposalEditForm, { proposal: poll, topics: [], busy: false, error: null, onSave: noop, onCancel: noop }))
    expect(p).toContain('Opciones (de 2 a 6)')
    expect(p).toContain('Añadir opción')
    const a = render(createElement(ProposalEditForm, { proposal: approved, topics: [], busy: false, error: null, onSave: noop, onCancel: noop }))
    expect(a).toContain('Fuentes externas')
    expect(a).toContain('Metodología')
    expect(a).toContain('tendrás que aprobarla de nuevo')
  })
  it('la pestaña dice que nada se publica sin aprobación ni por fecha y filtra por estado', () => {
    const html = page('oficial')
    expect(html).toContain('Nada oficial se publica sin que una persona lo apruebe')
    expect(html).toContain('ni siquiera cuando llega la fecha')
    for (const f of ['Pendientes', 'Aprobadas', 'Rechazadas', 'Publicadas']) expect(html).toContain(f)
    expect(officialSource).toContain('adminEditProposal')
    expect(officialSource).toContain('adminRejectProposal')
  })
})

describe('Menú semanal de Pepa (Contenido oficial)', () => {
  const menu = (over: Record<string, unknown>) =>
    dom.toMenuList({
      menus: [
        {
          id: 'm1',
          title: 'Menú de la semana del 26 de octubre',
          state: 'draft',
          version: 2,
          scheduledWeekly: true,
          source: 'Banco editorial · menú 12',
          weekStart: null,
          weekEnd: null,
          publishAt: null,
          publishAttempts: 0,
          checkErrors: 0,
          checkWarnings: 2,
          ...over,
        },
      ],
    }).menus[0]
  it('la pestaña enseña la sección del menú con su aviso y la propia lista de propuestas sigue debajo', () => {
    const html = page('oficial')
    expect(html).toContain('Menú semanal de Pepa')
    expect(html).toContain('Cargando los menús')
    expect(html).toContain('Consejos, encuestas y artículos')
    expect(officialSource).toContain('MenusSection')
    expect(officialSource).toContain("p.kind !== 'menu'")
  })
  it('el aviso fijo de la publicación automática viene del texto del dominio y no hay forma de cambiarla desde el panel', async () => {
    const section = (await import('@/ui/community/admin/MenusSection.tsx?raw')).default
    expect(section).toContain('ADMIN_TEXT.menuAutopublishOff')
    expect(dom.ADMIN_TEXT.menuAutopublishOff).toBe('La publicación automática está DESACTIVADA hasta que se valide')
    expect(section).not.toContain('adminSetSetting')
  })
  it('un borrador enseña su estado, la fuente, la revisión de calidad y las acciones: revisar, editar, aprobar y rechazar', () => {
    const html = render(createElement(MenuCard, { menu: menu({}), topics: [], onDone: noop }))
    expect(html).toContain('Borrador (pendiente de revisar)')
    expect(html).toContain('Fuente: Banco editorial · menú 12')
    expect(html).toContain('La revisión de calidad tiene 2 avisos')
    for (const b of ['Revisar el menú', 'Editar el texto', 'Aprobar', 'Rechazar']) expect(html).toContain(`>${b}<`)
    expect(html).toContain('NO se publica al momento')
    expect(html).toContain('próximo sábado a las 10:00')
  })
  it('un menú con texto editado sin revisar los datos exige confirmarlo antes de poder aprobar', () => {
    const html = render(createElement(MenuCard, { menu: menu({ textStale: true }), topics: [], onDone: noop }))
    expect(html).toContain('Has cambiado el texto sin tocar los datos del menú')
    expect(html).toContain('He revisado que el texto y los datos del menú dicen lo mismo')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Aprobar<\/button>/)
  })
  it('un menú inválido no se puede aprobar (el botón está desactivado) y explica por qué', () => {
    const html = render(createElement(MenuCard, { menu: menu({ checkErrors: 1, checkWarnings: 0 }), topics: [], onDone: noop }))
    expect(html).toContain('El menú no es válido y no se puede aprobar')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Aprobar<\/button>/)
  })
  it('un menú programado enseña la semana y la hora de Madrid, y ofrece reprogramar, cancelar la programación y rechazar (no aprobar)', () => {
    const html = render(
      createElement(MenuCard, {
        menu: menu({ state: 'scheduled', weekStart: '2026-10-26', weekEnd: '2026-11-01', publishAt: '2026-10-24T08:00:00Z', approvedAt: '2026-10-20T08:00:00Z', approvedByName: 'Jennifer' }),
        topics: [],
        onDone: noop,
      }),
    )
    expect(html).toContain('Programado')
    expect(html).toContain('Sale el sábado, 24 de octubre de 2026, 10:00')
    expect(html).toContain('Semana del 26 de octubre al 1 de noviembre de 2026')
    expect(html).toContain('Aprobada por Jennifer')
    for (const b of ['Reprogramar', 'Cancelar la programación', 'Rechazar']) expect(html).toContain(b)
    expect(html).not.toContain('>Aprobar<')
  })
  it('un menú con error enseña el error, los intentos y ofrece reintentar y reprogramar', () => {
    const html = render(
      createElement(MenuCard, {
        menu: menu({ state: 'error', publishAttempts: 3, publishError: 'P0001: fallo forzado', weekStart: '2026-10-26', weekEnd: '2026-11-01', publishAt: '2026-10-24T08:00:00Z' }),
        topics: [],
        onDone: noop,
      }),
    )
    expect(html).toContain('Con error')
    expect(html).toContain('Error al publicar (intento 3 de 3): P0001: fallo forzado')
    expect(html).toContain('Reintentar ahora')
    expect(html).toContain('Reprogramar')
  })
  it('un menú publicado enlaza a la publicación y no ofrece acciones', () => {
    const html = render(createElement(MenuCard, { menu: menu({ state: 'published', publishedPostId: 'post-1', weekStart: '2026-10-26', weekEnd: '2026-11-01' }), topics: [], onDone: noop }))
    expect(html).toContain('Ver el menú en Comunidad')
    expect(html).not.toContain('>Aprobar<')
    expect(html).not.toContain('Reprogramar')
  })
  it('la revisión enseña los errores y avisos de calidad, el resumen de los 7 días y el texto, y avisa de los límites de la revisión', () => {
    const detail = dom.toMenuDetail({
      id: 'm1',
      title: 'Menú',
      body: 'Texto del menú',
      check: [
        { code: 'INVALID', severity: 'error', message: 'Faltan días' },
        { code: 'QUANTITY_ABSURD', severity: 'warning', message: 'Cantidad rara', day: 'lunes', meal: 'comida', recipe: 'Lentejas' },
      ],
      menu: { servings: 4, days: [{ day: 'lunes', meals: { comida: { title: 'Lentejas', side: 'Fruta', recipes: [] }, cena: { title: 'Crema', recipes: [] } } }] },
    })!
    const html = render(createElement(MenuReview, { detail }))
    expect(html).toContain('Faltan días')
    expect(html).toContain('lunes · comida · Lentejas: Cantidad rara')
    expect(html).toContain('lunes</strong> — comida: Lentejas (+ Fruta); cena: Crema')
    expect(html).toContain('Texto del menú')
    expect(html).toContain('no comprueba seguridad alimentaria, alérgenos ni valores nutricionales')
  })
  it('el detalle (menú completo) solo se pide al abrir la revisión o la edición, nunca al pintar la lista', async () => {
    const section = (await import('@/ui/community/admin/MenusSection.tsx?raw')).default
    expect(section.match(/adminGetMenu\(/g)).toHaveLength(1)
    expect(section).toContain("loadDetail('review')")
    expect(section).not.toContain('setInterval')
    expect(section).not.toContain('dangerouslySetInnerHTML')
  })
})

describe('Encuestas', () => {
  const rows = dom.buildPollRows(
    dom.toProposals([
      { id: 'a', kind: 'poll', title: 'Cerrada', status: 'published', publishAt: '2026-10-10T08:00:00Z', publishedPostId: 'post-a', payload: { options: ['x', 'y'] } },
      { id: 'b', kind: 'poll', title: 'Abierta', status: 'published', publishAt: '2026-10-17T08:00:00Z', publishedPostId: 'post-b', payload: { options: ['x', 'y'] } },
      { id: 'c', kind: 'poll', title: 'Próxima', status: 'approved', publishAt: '2026-10-24T08:00:00Z', payload: { options: ['x', 'y'] } },
    ]),
    new Date('2026-10-17T12:00:00Z'),
  )
  const byId = (id: string) => rows.find((r) => r.id === id)!
  it('enseña apertura y cierre en hora de Madrid y el estado', () => {
    const html = render(createElement(PollCard, { poll: byId('c') }))
    expect(html).toContain('sábado, 24 de octubre de 2026, 10:00')
    expect(html).toContain('domingo, 25 de octubre de 2026, 17:00')
    expect(html).toContain('Hora peninsular española')
    expect(html).toContain('Aprobada, abre pronto')
  })
  it('una encuesta cerrada y publicada ofrece los resultados finales; una abierta, no', () => {
    expect(render(createElement(PollCard, { poll: byId('a') }))).toContain('Ver resultados finales')
    expect(render(createElement(PollCard, { poll: byId('a') }))).toContain('Cerrada')
    const open = render(createElement(PollCard, { poll: byId('b') }))
    expect(open).toContain('Abierta a votos')
    expect(open).not.toContain('Ver resultados finales')
    expect(open).toContain('Los resultados finales se verán cuando cierre')
  })
  it('getPoll solo se pide si hay publicación (y solo al pulsar)', () => {
    expect(pollsSource).toContain('poll.publishedPostId !== null')
    expect(pollsSource).toContain('getPoll(postId)')
    expect(pollsSource).not.toMatch(/useEffect[^]*getPoll/)
  })
  it('la pestaña explica el calendario y manda a Contenido oficial para las pendientes', () => {
    const html = page('encuestas')
    expect(html).toContain('sábado a las 10:00')
    expect(html).toContain('domingo a las 17:00')
    expect(html).toContain('Contenido oficial')
    expect(html).toContain('Cargando encuestas')
  })
})

describe('Destacados', () => {
  it('explica que la selección es automática y deja retirar o volver a poner', () => {
    const html = page('destacados')
    expect(html).toContain('se eligen solos')
    expect(html).toContain('No hace falta aprobarlos')
    const [f, g] = dom.toFeaturedItems([
      { id: 'p1', title: 'Tortilla', featuredAt: '2026-10-01T00:00:00Z', removed: false, likes: 5, comments: 2, saves: 1 },
      { id: 'p2', title: 'Croquetas', featuredAt: '2026-10-01T00:00:00Z', removed: true, likes: 1, comments: 0, saves: 0 },
    ])
    const a = render(createElement(FeaturedCard, { item: f, onChanged: noop }))
    expect(a).toContain('Retirar de destacados')
    expect(a).toContain('5 me gusta')
    const b = render(createElement(FeaturedCard, { item: g, onChanged: noop }))
    expect(b).toContain('Volver a poner como destacada')
    expect(b).toContain('Retirada por administración')
  })
})

describe('Configuración', () => {
  it('parámetros numéricos con descripción y dominios bloqueados', () => {
    const html = page('configuracion')
    expect(html).toContain('Solo se pueden cambiar los parámetros autorizados')
    expect(html).toContain('Cargando la configuración')
    const [fixed, editable] = dom.toAdminSettings({
      settings: [
        { key: 'first_ban_days', value: 30, description: 'Duración de la primera expulsión (a la tercera advertencia).' },
        { key: 'max_links_per_post', value: 10, description: 'Enlaces por publicación o comentario.' },
      ],
      blockedDomains: [],
    }).settings
    // Fijado por la especificación: se ve el valor y la etiqueta, sin campo ni botón.
    const row = render(createElement(SettingRow, { setting: fixed, onSaved: noop }))
    expect(row).toContain('Duración de la primera expulsión')
    expect(row).toContain('<strong>30</strong>')
    expect(row).toContain('días')
    expect(row).toContain('Fijado por las reglas aprobadas')
    expect(row).not.toContain('<input')
    expect(row).not.toContain('Guardar')
    // Autorizado: campo, rango y botón.
    const ed = render(createElement(SettingRow, { setting: editable, onSaved: noop }))
    expect(ed).toContain('value="10"')
    expect(ed).toContain('(de 1 a 50)')
    expect(ed).toContain('Guardar')
    expect(ed).not.toContain('Fijado por las reglas aprobadas')
    for (const f of ['adminGetSettings', 'adminSetSetting', 'adminBlockDomain']) expect(settingsSource).toContain(f)
    expect(settingsSource).toContain('Dominios bloqueados')
    expect(settingsSource).toContain('LaunchSwitch')
  })
  it('el interruptor de apertura se muestra como interruptor y no como número', () => {
    expect(settingsSource).toContain(".filter((s) => s.kind !== 'switch')")
  })
})

describe('Historial', () => {
  it('es de solo lectura, paginado y aclara que es independiente del historial de avisos', () => {
    const html = page('historial')
    expect(html).toContain('solo de lectura')
    expect(html).toContain('independiente del historial de avisos')
    expect(html).toContain('Cargando el historial')
    expect(html).toContain('Más antiguas')
    expect(html).toContain('Más recientes')
    expect(logSource).toContain('adminListLog')
    expect(logSource).not.toMatch(/adminDelete|adminEdit|delete|remove/i)
  })
})

describe('calidad general', () => {
  const all = [adminPageSource, sharedSource, reportsSource, listsSource, usersSource, officialSource, pollsSource, settingsSource, logSource]
  it('nunca usa dangerouslySetInnerHTML ni consultas periódicas', () => {
    for (const s of all) {
      expect(s).not.toContain('dangerouslySetInnerHTML')
      expect(s).not.toContain('setInterval')
    }
  })
  it('el texto de otras personas va como texto de React o con CommunityRichText', () => {
    expect(reportsSource).toContain('CommunityRichText')
    expect(officialSource).toContain('CommunityRichText')
  })
  it('mantiene las pestañas ya visitadas montadas (no repite consultas) y usa la dirección para recordar la pestaña', () => {
    expect(adminPageSource).toContain('hidden={t.id !== active}')
    expect(adminPageSource).toContain('useSearchParams')
  })
  it('los botones y campos son táctiles y no hay scroll horizontal', () => {
    expect(cssSource).toMatch(/\.cadm-btn\s*\{[^}]*min-height:\s*44px/)
    expect(cssSource).toMatch(/\.cadm-tab\s*\{[^}]*min-height:\s*44px/)
    expect(cssSource).toMatch(/\.cadm-tabs\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(cssSource).not.toContain('overflow-x: scroll')
  })
  it('los botones de dos toques se desarman solos y se pueden cancelar', () => {
    expect(sharedSource).toContain('setTimeout(() => setArmed(false), 6000)')
    const html = render(createElement(TwoTapButton, { label: 'Cerrar Comunidad', onConfirm: noop }))
    expect(html).toContain('Cerrar Comunidad')
    expect(html).not.toContain('Cancelar')
  })
  it('estados de carga con role=status', () => {
    expect(render(createElement(AdminLoading))).toContain('role="status"')
  })
  it('AdminCenter se puede pintar directamente', () => {
    expect(render(createElement(AdminCenter))).toContain('Centro de Mando de Comunidad')
  })
})
