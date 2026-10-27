// @vitest-environment jsdom
// B2-UX: tarjeta de acceso en Configuración, bloques plegables en las áreas (sin perder lo escrito ni repetir consultas), buscador global de herramientas y pestañas de
// Comunidad agrupadas. Interfaz real con jsdom; los datos de Supabase se sustituyen por versiones mudas.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_AREAS } from '@/admin/adminAreas'
import { ADMIN_GROUP_IDS, ADMIN_TOOLS, searchAdminTools } from '@/admin/adminTools'
import { ADMIN_TAB_GROUPS, ADMIN_TABS, MODERATION_SECTIONS } from '@/domain/communityAdmin'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
const owner = { state: 'owner' as 'checking' | 'owner' | 'denied' | 'unverified' }
vi.mock('@/state/useAppOwner', () => ({ useAppOwner: () => owner.state }))
vi.mock('@/data/appUsage', () => ({ listAppUsage: async () => [] }))
vi.mock('@/data/appUsageActivity', () => ({ listAppUsageActivity: async () => [], listAppOwnerFamilies: async () => [] }))
vi.mock('@/data/familyInvites', () => ({ listFamilyInvites: async () => [], generateFamilyInvite: async () => 'ABC', deleteFamilyInvite: async () => undefined }))
vi.mock('@/data/errorReports', () => ({ listClientErrors: async () => [], deleteClientErrors: async () => undefined }))
vi.mock('@/data/family', () => ({ getAmazonWebhookToken: async () => 'tok', regenerateAmazonWebhookToken: async () => 'tok2' }))
vi.mock('@/ui/community/CommunityProvider', () => ({
  CommunityProvider: ({ children }: { children: unknown }) => children,
  useCommunity: () => ({ status: { launched: true, visible: true, isAdmin: true }, me: null, loading: false, refresh: async () => undefined, requireParticipation: async () => true }),
}))
vi.mock('@/data/community', () => new Proxy({}, { get: () => async () => ({}) }))

const { AdminCenterCard } = await import('@/ui/admin/AdminCenterCard')
const { AdminGroup, AdminGroupsProvider, AdminGroupsToolbar } = await import('@/ui/admin/AdminGroups')
const { AdministrationPage } = await import('@/ui/admin/AdministrationPage')
const { AdminTabs } = await import('@/ui/community/admin/AdminShared')

afterEach(() => cleanup())

function Where() {
  const l = useLocation()
  return <p data-testid="where">{l.pathname + l.search}</p>
}

describe('B2-UX01 · tarjeta de acceso al Centro en Configuración', () => {
  it('administradora de PEPA: tarjeta con título, descripción e icono, toda ella es el enlace a /administracion', () => {
    owner.state = 'owner'
    render(
      <MemoryRouter>
        <AdminCenterCard />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/administracion')
    expect(link.textContent).toContain('Centro de Administración PEPA')
    expect(link.textContent).toContain('Gestiona usuarios, Comunidad, funcionalidades, Ayuda y sistema')
    expect(link.textContent).toContain('🛡️')
    expect(link.className).toContain('admin-center-card')
  })
  it('usuario normal, administrador de familia, sin verificar o comprobando: no se pinta nada', () => {
    for (const s of ['denied', 'unverified', 'checking'] as const) {
      owner.state = s
      const { container, unmount } = render(
        <MemoryRouter>
          <AdminCenterCard />
        </MemoryRouter>,
      )
      expect(container.innerHTML, s).toBe('')
      unmount()
    }
  })
  it('en Configuración está justo debajo de «Nombre de familia» y ya no hay enlace al final', () => {
    const src = read('src/ui/MenuSettingsScreen.tsx')
    const i = src.indexOf('<FamilyNameSection />')
    const j = src.indexOf('<AdminCenterCard />')
    expect(i).toBeGreaterThan(-1)
    expect(j).toBeGreaterThan(i)
    expect(src.slice(i, j)).not.toMatch(/<SettingsGroup/)
    expect(src).not.toContain('AdminUsageLink')
    expect(src.match(/<AdminCenterCard \/>/g)).toHaveLength(1)
  })
  it('el estilo es propio (fondo y borde diferenciados) y la tarjeta es accesible por teclado', () => {
    const css = read('src/ui/admin/administration.css')
    expect(css).toMatch(/\.admin-center-card \{[^}]*border: 2px solid/s)
    expect(css).toContain('.admin-center-card:focus-visible')
  })
})

describe('B2-UX02 · bloques plegables', () => {
  const wrap = (node: React.ReactNode) =>
    render(
      <MemoryRouter>
        <AdminGroupsProvider>{node}</AdminGroupsProvider>
      </MemoryRouter>,
    )

  it('el encabezado es un botón con aria-expanded que abre y pliega; empieza plegado salvo defaultOpen', () => {
    wrap(
      <>
        <AdminGroup area="usuarios" id="a" title="Plegado">
          <p>contenido-a</p>
        </AdminGroup>
        <AdminGroup area="usuarios" id="b" title="Abierto" defaultOpen>
          <p>contenido-b</p>
        </AdminGroup>
      </>,
    )
    const a = screen.getByRole('button', { name: /Plegado/ })
    const b = screen.getByRole('button', { name: /Abierto/ })
    expect(a.getAttribute('aria-expanded')).toBe('false')
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByText('contenido-a')).toBeNull() // nunca abierto: ni siquiera se monta (no pide datos)
    fireEvent.click(a)
    expect(a.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('contenido-a')).toBeTruthy()
    expect(document.getElementById(a.getAttribute('aria-controls')!)).toBeTruthy()
  })

  it('al plegar NO se pierde lo escrito en un formulario (el contenido se conserva oculto)', () => {
    wrap(
      <AdminGroup area="usuarios" id="f" title="Formulario" defaultOpen>
        <input aria-label="nota" />
      </AdminGroup>,
    )
    const input = screen.getByLabelText('nota') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Familia López' } })
    const head = screen.getByRole('button', { name: /Formulario/ })
    fireEvent.click(head) // plegar
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('.admin-group-body')!.hasAttribute('hidden')).toBe(true)
    // El mismo nodo sigue en el documento con su valor.
    expect(document.body.contains(input)).toBe(true)
    fireEvent.click(head) // desplegar
    expect((screen.getByLabelText('nota') as HTMLInputElement).value).toBe('Familia López')
  })

  it('«Expandir todo» y «Plegar todo» actúan solo sobre los bloques de su área', () => {
    wrap(
      <>
        <AdminGroupsToolbar area="usuarios" />
        <AdminGroup area="usuarios" id="a" title="Uno">
          <p>uno</p>
        </AdminGroup>
        <AdminGroup area="usuarios" id="b" title="Dos">
          <p>dos</p>
        </AdminGroup>
        <AdminGroup area="sistema" id="c" title="Otra área">
          <p>tres</p>
        </AdminGroup>
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expandir todo' }))
    expect(screen.getByRole('button', { name: /Uno/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /Dos/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: /Otra área/ }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Plegar todo' }))
    expect(screen.getByRole('button', { name: /Uno/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('el indicador del encabezado sigue visible con el bloque plegado', () => {
    wrap(
      <AdminGroup area="sistema" id="e" title="Errores" badge={3} badgeTone="alert">
        <p>x</p>
      </AdminGroup>,
    )
    expect(screen.getByRole('button', { name: /Errores/ }).textContent).toContain('3')
    expect(document.querySelector('.admin-group-badge-alert')).toBeTruthy()
  })

  it('forceOpen (filtros activos) enseña el bloque sin cambiar su estado guardado', () => {
    const tree = (force: boolean) => (
      <MemoryRouter>
        <AdminGroupsProvider>
          <AdminGroup area="funcionalidades" id="m" title="Módulo" forceOpen={force}>
            <p>fila</p>
          </AdminGroup>
        </AdminGroupsProvider>
      </MemoryRouter>
    )
    const { rerender } = render(tree(true))
    expect(screen.getByText('fila')).toBeTruthy()
    rerender(tree(false))
    expect(screen.getByRole('button', { name: /Módulo/ }).getAttribute('aria-expanded')).toBe('false')
  })
})

describe('B2-UX02 · el Centro con sus siete áreas', () => {
  const page = (url = '/administracion') =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <AdministrationPage />
        <Where />
      </MemoryRouter>,
    )

  it('cada área (salvo Comunidad, que tiene sus pestañas) tiene su «Expandir todo» y sus bloques', async () => {
    owner.state = 'owner'
    page('/administracion?area=usuarios')
    await waitFor(() => expect(document.getElementById('admin-group-usuarios-familias')).toBeTruthy(), { timeout: 10000 })
    const panel = document.getElementById('admin-panel-usuarios')!
    expect(within(panel).getByRole('button', { name: 'Expandir todo' })).toBeTruthy()
    for (const g of ADMIN_GROUP_IDS.usuarios) expect(document.getElementById(`admin-group-usuarios-${g}`), g).toBeTruthy()
  }, 30000)

  it('el estado de los bloques se conserva al ir a otra área y volver', async () => {
    owner.state = 'owner'
    page('/administracion?area=usuarios')
    await waitFor(() => expect(document.getElementById('admin-group-usuarios-familias')).toBeTruthy(), { timeout: 10000 })
    const head = within(document.getElementById('admin-group-usuarios-familias')!).getByRole('button', { name: /Familias y cuentas/ })
    fireEvent.click(head)
    expect(head.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(document.getElementById('admin-tab-sistema')!)
    await waitFor(() => expect(document.getElementById('admin-group-sistema-errores')).toBeTruthy(), { timeout: 10000 })
    fireEvent.click(document.getElementById('admin-tab-usuarios')!)
    expect(within(document.getElementById('admin-group-usuarios-familias')!).getByRole('button', { name: /Familias y cuentas/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('el buscador global lleva al área y despliega el bloque de la herramienta', async () => {
    owner.state = 'owner'
    page('/administracion')
    await act(async () => {})
    fireEvent.change(screen.getByLabelText('Buscar una herramienta'), { target: { value: 'token' } })
    const results = screen.getByRole('list', { name: 'Resultados de la búsqueda' })
    fireEvent.click(within(results).getAllByRole('button')[0])
    await act(async () => {})
    expect(screen.getByTestId('where').textContent).toContain('area=sistema')
    await waitFor(() => expect(document.getElementById('admin-group-sistema-automatizaciones')).toBeTruthy(), { timeout: 10000 })
    const head = within(document.getElementById('admin-group-sistema-automatizaciones')!).getByRole('button', { name: /Automatizaciones/ })
    expect(head.getAttribute('aria-expanded')).toBe('true')
  })

  it('buscar una sección de Moderación abre Comunidad en esa pestaña y sección', async () => {
    owner.state = 'owner'
    page('/administracion')
    await act(async () => {})
    fireEvent.change(screen.getByLabelText('Buscar una herramienta'), { target: { value: 'readmisiones' } })
    fireEvent.click(within(screen.getByRole('list', { name: 'Resultados de la búsqueda' })).getAllByRole('button')[0])
    await act(async () => {})
    const where = screen.getByTestId('where').textContent!
    expect(where).toContain('area=comunidad')
    expect(where).toContain('tab=moderacion')
    expect(where).toContain('seccion=readmisiones')
  })

  it('una búsqueda sin resultados lo dice, sin romper nada', async () => {
    owner.state = 'owner'
    page('/administracion')
    fireEvent.change(screen.getByLabelText('Buscar una herramienta'), { target: { value: 'zzzzqq' } })
    expect(screen.getByRole('status').textContent).toContain('Ninguna herramienta coincide')
  })

  it('cuenta normal: ni buscador ni áreas (la puerta sigue delante de todo)', () => {
    owner.state = 'denied'
    page('/administracion')
    expect(screen.queryByLabelText('Buscar una herramienta')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    owner.state = 'owner'
  })
})

describe('Estado de funcionalidades dentro de los bloques', () => {
  it('con «Expandir todo» aparecen las fichas con el estado de la función y la cobertura de la Ayuda, por separado', async () => {
    owner.state = 'owner'
    render(
      <MemoryRouter initialEntries={['/administracion?area=funcionalidades']}>
        <AdministrationPage />
      </MemoryRouter>,
    )
    await waitFor(() => expect(document.getElementById('admin-panel-funcionalidades')!.querySelector('.admin-group')).toBeTruthy())
    fireEvent.click(within(document.getElementById('admin-panel-funcionalidades')!).getByRole('button', { name: 'Expandir todo' }))
    expect(document.querySelectorAll('.admin-feature').length).toBeGreaterThan(30)
    expect(document.querySelector('.admin-pill-operativa')).toBeTruthy()
    expect(document.querySelector('[class*="admin-pill-help-"]')).toBeTruthy()
  }, 30000)
  it('con un filtro activo se enseñan abiertos los módulos con resultados', async () => {
    owner.state = 'owner'
    render(
      <MemoryRouter initialEntries={['/administracion?area=funcionalidades']}>
        <AdministrationPage />
      </MemoryRouter>,
    )
    const panel = await waitFor(() => {
      const p = document.getElementById('admin-panel-funcionalidades')!
      expect(p.querySelector('input[type="search"]')).toBeTruthy()
      return p
    })
    fireEvent.change(panel.querySelector('input[type="search"]')!, { target: { value: 'alergias' } })
    const groups = panel.querySelectorAll('.admin-group')
    expect(groups.length).toBeGreaterThanOrEqual(1)
    expect(groups.length).toBeLessThan(10)
    for (const g of groups) expect(g.className).toContain('admin-group-open')
  })
})

describe('registro de herramientas del buscador', () => {
  const sources: Record<string, string> = {
    resumen: read('src/ui/admin/AreaResumen.tsx'),
    usuarios: read('src/ui/admin/AreaUsuarios.tsx'),
    ia: read('src/ui/admin/AreaIA.tsx'),
    ayuda: read('src/ui/admin/AreaAyuda.tsx'),
    sistema: read('src/ui/admin/AreaSistema.tsx'),
  }

  it('cada herramienta apunta a un área, un bloque y una pestaña que EXISTEN', () => {
    const tabIds = ADMIN_TABS.map((t) => t.id)
    const sectionIds = MODERATION_SECTIONS.map((s) => s.id)
    for (const t of ADMIN_TOOLS) {
      expect(ADMIN_AREAS.map((a) => a.id), t.id).toContain(t.area)
      if (t.group) expect(ADMIN_GROUP_IDS[t.area as keyof typeof ADMIN_GROUP_IDS], `${t.id}: bloque ${t.group}`).toContain(t.group)
      if (t.area === 'comunidad') expect(tabIds, t.id).toContain(t.tab)
      if (t.seccion) expect(sectionIds, t.id).toContain(t.seccion)
    }
  })
  it('todos los bloques de cada área están en el registro de bloques y viceversa', () => {
    for (const [area, ids] of Object.entries(ADMIN_GROUP_IDS)) {
      const found = [...sources[area].matchAll(/<AdminGroup\s+area="([a-z]+)"\s+id="([a-z-]+)"/g)].filter((m) => m[1] === area).map((m) => m[2])
      expect(found.sort(), area).toEqual([...ids].sort())
    }
  })
  it('la búsqueda ignora acentos, mayúsculas y orden, y encuentra las herramientas clave', () => {
    expect(searchAdminTools('CÓDIGOS de invitación').map((t) => t.id)).toContain('usuarios-generar-codigo')
    expect(searchAdminTools('token')[0].area).toBe('sistema')
    expect(searchAdminTools('denuncias').some((t) => t.id === 'com-denuncias')).toBe(true)
    expect(searchAdminTools('')).toEqual([])
    expect(searchAdminTools('xyzxyz')).toEqual([])
  })
  it('cubre cada una de las nueve pestañas de Comunidad y las cinco secciones de Moderación', () => {
    for (const t of ADMIN_TABS) expect(ADMIN_TOOLS.some((x) => x.area === 'comunidad' && x.tab === t.id), t.id).toBe(true)
    for (const s of MODERATION_SECTIONS) expect(ADMIN_TOOLS.some((x) => x.seccion === s.id), s.id).toBe(true)
  })
})

describe('Comunidad: pestañas agrupadas sin perder ninguna', () => {
  it('los grupos contienen las nueve pestañas, una sola vez cada una', () => {
    const ids = ADMIN_TAB_GROUPS.flatMap((g) => g.ids)
    expect([...ids].sort()).toEqual(ADMIN_TABS.map((t) => t.id).sort())
  })
  it('agrupadas: etiquetas de tema + las nueve pestañas con sus roles y navegación por teclado', () => {
    const onSelect = vi.fn()
    render(<AdminTabs active="resumen" onSelect={onSelect} idBase="t" grouped />)
    expect(screen.getAllByRole('tab')).toHaveLength(9)
    for (const g of ADMIN_TAB_GROUPS) expect(screen.getByText(g.label)).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith('moderacion')
  })
  it('sin agrupar (el Centro de Mando suelto) sigue igual que antes', () => {
    render(<AdminTabs active="resumen" onSelect={() => undefined} idBase="t" />)
    expect(screen.getAllByRole('tab')).toHaveLength(9)
    expect(screen.queryByText('Supervisión')).toBeNull()
  })
})
