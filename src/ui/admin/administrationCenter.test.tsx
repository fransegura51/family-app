// Centro de Administración único (B2): acceso y denegación, seis áreas, conservación de TODAS las herramientas de los dos paneles antiguos, redirecciones y «Invitar amigos».
// Renderizado real con react-dom/server (sin navegador): lo que se ve es el primer pintado; las pantallas con datos se comprueban además leyendo su código.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ADMIN_TABS } from '@/domain/communityAdmin'
import { INVITE_FRIENDS_ADMIN_NOTE } from '@/domain/inviteFriends'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

// Quién es la cuenta que mira, según el SERVIDOR (am_i_app_owner): cada prueba lo cambia.
const owner = { state: 'owner' as 'checking' | 'owner' | 'denied' | 'unverified', calls: [] as unknown[] }
vi.mock('@/state/useAppOwner', () => ({
  useAppOwner: (opts?: unknown) => {
    owner.calls.push(opts)
    return owner.state
  },
}))

// Una cuenta propietaria con Comunidad cerrada (como en producción para el Centro de Mando).
vi.mock('@/ui/community/CommunityProvider', () => ({
  useCommunity: () => ({ status: { launched: false, visible: true, isAdmin: true }, me: null, loading: false, refresh: async () => undefined, requireParticipation: async () => true }),
  CommunityProvider: ({ children }: { children: unknown }) => children,
}))

const { AdminGate } = await import('@/ui/admin/AdminGate')
const { AdministrationPage } = await import('@/ui/admin/AdministrationPage')
const { AreaFuncionalidades } = await import('@/ui/admin/AreaFuncionalidades')
const { AreaAyuda } = await import('@/ui/admin/AreaAyuda')
const { AreaResumen } = await import('@/ui/admin/AreaResumen')
const { InviteFriendsButton } = await import('@/ui/InviteFriendsButton')
const { InviteFriendsAdminCard } = await import('@/ui/admin/InviteFriendsAdminCard')
const { AdminPage } = await import('@/ui/community/AdminPage')

const html = (node: Parameters<typeof renderToStaticMarkup>[0], url = '/administracion') =>
  renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [url] }, node))

describe('acceso: solo cuentas propietarias, verificado en el servidor', () => {
  const child = createElement('p', null, 'CONTENIDO-SECRETO')

  it('propietaria → pasa y ve el contenido', () => {
    owner.state = 'owner'
    expect(html(createElement(AdminGate, null, child))).toContain('CONTENIDO-SECRETO')
  })
  it('cuenta normal → aviso claro y NO se monta nada del Centro', () => {
    owner.state = 'denied'
    const out = html(createElement(AdminGate, null, child))
    expect(out).toContain('Esta zona es solo para la administración de PEPA')
    expect(out).toContain('Es distinta de la administración de tu familia')
    expect(out).not.toContain('CONTENIDO-SECRETO')
  })
  it('si NO se puede verificar (sin red o error del servidor) se deniega, nunca se supone el permiso', () => {
    owner.state = 'unverified'
    const out = html(createElement(AdminGate, null, child))
    expect(out).toContain('No hemos podido comprobar tus permisos')
    expect(out).toContain('Reintentar')
    expect(out).not.toContain('CONTENIDO-SECRETO')
  })
  it('mientras se comprueba solo se ve «Comprobando permisos…», nunca el contenido', () => {
    owner.state = 'checking'
    const out = html(createElement(AdminGate, null, child))
    expect(out).toContain('Comprobando permisos')
    expect(out).not.toContain('CONTENIDO-SECRETO')
  })
  it('la puerta pregunta SIEMPRE al servidor (sin la caché de los botones de comodidad)', () => {
    owner.calls.length = 0
    owner.state = 'owner'
    html(createElement(AdminGate, null, child))
    expect(owner.calls).toContainEqual({ fresh: true })
  })
  it('la página completa del Centro va dentro de la puerta: una cuenta normal no ve ni las pestañas', () => {
    owner.state = 'denied'
    const out = html(createElement(AdministrationPage))
    expect(out).toContain('solo para la administración de PEPA')
    expect(out).not.toContain('role="tablist"')
    expect(out).not.toContain('Estado de funcionalidades')
    expect(read('src/ui/admin/AdministrationPage.tsx')).toMatch(/<AdminGate>\s*<AdminGroupsProvider>\s*<AdministrationCenter \/>\s*<\/AdminGroupsProvider>\s*<\/AdminGate>/)
  })
  it('el rol de administrador/a de una familia NO da acceso: la puerta no mira profile.role', () => {
    const gate = read('src/ui/admin/AdminGate.tsx') + read('src/state/useAppOwner.ts')
    expect(gate).not.toMatch(/role\s*===?\s*'admin'/)
    expect(read('src/state/useAppOwner.ts')).toContain('amIAppOwner')
    expect(read('src/data/suggestions.ts')).toContain("supabase.rpc('am_i_app_owner')")
  })
})

describe('el Centro: seis áreas accesibles', () => {
  it('propietaria: barra de seis áreas (tablist), la del parámetro ?area= activa y el resumen por defecto', () => {
    owner.state = 'owner'
    const out = html(createElement(AdministrationPage))
    expect(out).toContain('Centro de Administración')
    expect(out).toContain('role="tablist"')
    for (const label of ['Resumen general', 'Usuarios, familias e invitaciones', 'Comunidad y moderación', 'Estado de funcionalidades', 'Ayuda y documentación', 'Sistema']) {
      expect(out).toContain(label)
    }
    expect((out.match(/role="tab"/g) ?? []).length).toBe(6)
    expect(out).toMatch(/id="admin-tab-resumen"[^>]*aria-selected="true"/)
  })
  it('?area=sistema abre esa área y solo ella está seleccionada', () => {
    owner.state = 'owner'
    const out = html(createElement(AdministrationPage), '/administracion?area=sistema')
    expect(out).toMatch(/id="admin-tab-sistema"[^>]*aria-selected="true"/)
    expect(out).toMatch(/id="admin-tab-resumen"[^>]*aria-selected="false"/)
  })
  it('responsive: las áreas se parten en filas en el móvil y no hay desplazamiento horizontal', () => {
    const css = read('src/ui/admin/administration.css')
    expect(css).toContain('flex: 1 1 calc(50% - 6px)')
    expect(css).toMatch(/@media \(min-width: 720px\)/)
    expect(css).toContain('overflow-wrap: anywhere')
    expect(read('src/ui/community/communityAdmin.css')).toContain('flex-wrap: wrap')
  })
  it('el Resumen enseña las seis áreas y NO pide datos al servidor al abrirse (solo con el botón)', () => {
    const out = html(createElement(AreaResumen, { onGo: () => undefined }))
    expect(out).toContain('Las seis áreas')
    expect(out).toContain('Datos en vivo')
    expect(out).toContain('Invitar amigos')
    const src = read('src/ui/admin/AreaResumen.tsx')
    expect(src).toContain("'Cargar datos en vivo'")
    // Las consultas están dentro de loadLive(), que solo se llama desde el botón (no hay useEffect).
    expect(src).not.toContain('useEffect')
    expect(src).toContain('onClick={() => void loadLive()}')
  })
})

describe('no se pierde ninguna herramienta de los dos paneles antiguos', () => {
  it('Panel de admin (/admin-uso) → área Usuarios: uso por familias y cuentas, actividad e invitaciones de familia nueva', () => {
    const src = read('src/ui/admin/AreaUsuarios.tsx')
    for (const piece of [
      'listAppUsage()',
      '<AppActivityPanel accounts={rows} />',
      'Familias y cuentas',
      'Códigos de invitación para familias nuevas',
      'Generar código',
      'handleGenerateInvite',
      'handleDeleteInvite',
      '✕ Anular',
      'caduca a los 7 días de generarse',
      'Último acceso',
      'Notificaciones activadas',
    ]) {
      expect(src, piece).toContain(piece)
    }
  })
  it('Panel de admin → área Sistema: errores (agrupados, con traza, borrar uno o todos) y automatizaciones', () => {
    const src = read('src/ui/admin/AreaSistema.tsx')
    for (const piece of ['Errores de la app', 'errorGroups', 'clearErrors', 'Borrar todos', 'Borrar estos', 'componentStack', '<AmazonWebhookSettings />', '⚙️ Automatizaciones']) {
      expect(src, piece).toContain(piece)
    }
  })
  it('las vistas administrativas de Sugerencias y Reseñas se alcanzan desde el área Sistema', () => {
    const src = read('src/ui/admin/AreaSistema.tsx')
    expect(src).toContain('to="/sugerencias"')
    expect(src).toContain('to="/resenas"')
  })
  it('Centro de Mando de Comunidad → área Comunidad: la MISMA pantalla con las 9 pestañas, y la propia pantalla vuelve a comprobar isAdmin', () => {
    expect(read('src/ui/admin/AreaComunidad.tsx')).toContain('<AdminPage embedded />')
    owner.state = 'owner'
    const out = html(createElement(AdminPage, { embedded: true }), '/administracion?area=comunidad&tab=moderacion')
    expect(out).toContain('Centro de Mando de Comunidad')
    expect(out).not.toContain('<h1')
    expect((out.match(/role="tab"/g) ?? []).length).toBe(ADMIN_TABS.length)
    for (const t of ADMIN_TABS) expect(out, t.label).toContain(t.label)
    expect(read('src/ui/community/AdminPage.tsx')).toContain('status?.isAdmin')
  })
  it('cambiar de pestaña dentro de Comunidad conserva ?area=comunidad (no se sale del área)', () => {
    const src = read('src/ui/community/AdminPage.tsx')
    expect(src).toContain("next.set('tab', tab)")
    expect(src).toContain('new URLSearchParams(prev)')
  })
})

describe('navegación: redirecciones y enlaces contextuales', () => {
  it('/administracion es la ruta principal y /admin-uso redirige al área Usuarios', () => {
    const app = read('src/App.tsx')
    expect(app).toContain('<Route path="/administracion" element={<AdministrationPage />} />')
    expect(app).toContain('<Route path="/admin-uso" element={<Navigate to={legacyAdminUsagePath()} replace />} />')
    expect(app).not.toContain('AdminUsageScreen')
  })
  it('/comunidad/admin redirige al área Comunidad conservando la pestaña, FUERA de la puerta de acceso de Comunidad', () => {
    const src = read('src/ui/community/CommunityRoutes.tsx')
    expect(src).toContain('legacyCommunityAdminPath(search)')
    expect(src.indexOf('path="admin"')).toBeGreaterThan(-1)
    expect(src.indexOf('path="admin"')).toBeLessThan(src.indexOf('<CommunityAccessGate />'))
    expect(src).not.toContain('<AdminPage />')
  })
  it('los enlaces contextuales apuntan al Centro nuevo (Configuración y menú de Comunidad)', () => {
    expect(read('src/ui/admin/AdminCenterCard.tsx')).toContain('<Link to="/administracion"')
    expect(read('src/ui/community/communityNav.ts')).toContain("admin: '/administracion?area=comunidad'")
    expect(read('src/ui/community/CommunityMenu.tsx')).toContain('onGo(paths.admin)')
  })
  it('el panel antiguo ya no existe como pantalla aparte (no hay pantallas duplicadas)', () => {
    expect(() => read('src/ui/AdminUsageScreen.tsx')).toThrow()
  })
  it('el uso de la app no cuenta las visitas al Centro de Administración', async () => {
    const { sectionKeyForPath } = await import('@/domain/usageSections')
    expect(sectionKeyForPath('/administracion')).toBeNull()
  })
})

describe('«Invitar amigos»: no activa, solo visible para administradoras de PEPA, con su aviso', () => {
  it('administradora: botón desactivado + aviso exacto de que está en preparación', () => {
    owner.state = 'owner'
    const out = html(createElement(InviteFriendsButton))
    expect(out).toContain('Invitar amigos (próximamente)')
    expect(out).toContain('disabled')
    expect(out).toContain(INVITE_FRIENDS_ADMIN_NOTE)
    expect(INVITE_FRIENDS_ADMIN_NOTE).toBe(
      'Función en preparación. Actualmente solo está visible para los administradores de PEPA. Cuando se active oficialmente, estará disponible para todos los usuarios.',
    )
  })
  it('usuario normal, sin verificar o comprobando: no se pinta NADA', () => {
    for (const s of ['denied', 'unverified', 'checking'] as const) {
      owner.state = s
      expect(html(createElement(InviteFriendsButton)), s).toBe('')
    }
  })
  it('no activa invitaciones ni registro público: sin llamadas al servidor ni enlaces en el botón', () => {
    const src = read('src/ui/InviteFriendsButton.tsx')
    expect(src).not.toMatch(/supabase|rpc\(|fetch\(|navigate|onClick|<Link|href=/)
    expect(src).toContain('disabled')
  })
  it('el Centro enseña su estado «No activa» con el mismo aviso y recuerda que sin invitación no hay cuenta', () => {
    const out = html(createElement(InviteFriendsAdminCard))
    expect(out).toContain('No activa')
    expect(out).toContain(INVITE_FRIENDS_ADMIN_NOTE)
    expect(out).toContain('nadie puede crear una cuenta sin una invitación válida')
  })
})

describe('Estado de funcionalidades y Ayuda: pantallas', () => {
  it('Estado de funcionalidades: búsqueda, cuatro filtros, recuento y una ficha por función', () => {
    const out = html(createElement(AreaFuncionalidades))
    for (const l of ['Buscar', 'Módulo', 'Estado de la función', 'Cobertura de la Ayuda', 'Verificación']) expect(out).toContain(l)
    expect(out).toContain('operativas')
    expect(out).toContain('parciales')
    expect(out).toContain('desactivadas')
    expect(out).toMatch(/Mostrando las \d+ funciones/)
    // Las fichas están agrupadas por módulo en bloques plegables (el detalle de estado y Ayuda se prueba abriéndolos en adminUx.test.tsx).
    expect(out).toContain('admin-group')
    expect(out).toContain('Comunidad')
    expect(out).toContain('Calendario')
    const src = read('src/ui/admin/AreaFuncionalidades.tsx')
    expect(src).toContain('admin-pill-help-${help.coverage}')
    expect(src).toContain('admin-pill-${e.state}')
  })
  it('Ayuda y documentación: cobertura, secciones, tutoriales y base para B3 (sin consultas al servidor)', () => {
    const out = html(createElement(AreaAyuda))
    for (const piece of ['Cobertura de las funciones', 'Cobertura por módulo', 'Estado de las fichas', 'Tutoriales y vídeos', 'Errores y rutas rotas', 'Valoraciones', 'Prioridades para completar la documentación']) expect(out).toContain(piece)
    expect(read('src/ui/admin/AreaAyuda.tsx')).toContain('computeHelpHealth')
    expect(read('src/ui/admin/AreaAyuda.tsx')).not.toMatch(/supabase|@\/data\//)
  })
})
