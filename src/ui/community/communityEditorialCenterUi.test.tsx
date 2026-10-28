// @vitest-environment jsdom
// Centro Editorial (Contenido oficial): navegación interna, Resumen, listas COMPACTAS, filtros, detalle y actualización inmediata tras cada acción.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityError } from '@/domain/communityErrors'
import { toEditorialStatus } from '@/domain/communityEditorial'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const api = vi.hoisted(() => ({
  adminApproveProposal: vi.fn(),
  adminEditProposal: vi.fn(),
  adminListProposals: vi.fn(),
  adminRejectProposal: vi.fn(),
  adminReschedulePoll: vi.fn(),
  listCommunityTopics: vi.fn(),
  adminListMenus: vi.fn(),
  adminGetMenu: vi.fn(),
  adminRescheduleMenu: vi.fn(),
  adminRetryPublish: vi.fn(),
}))
vi.mock('@/data/community', () => api)

const ed = vi.hoisted(() => ({
  getEditorialStatus: vi.fn(),
  setEditorialToggle: vi.fn(),
  setMenuAutopublish: vi.fn(),
  listEditorialRuns: vi.fn(),
  listEditorialItems: vi.fn(),
  listEditorialRevisions: vi.fn(),
  listItemVersions: vi.fn(),
  scheduleItem: vi.fn(),
  generateNow: vi.fn(),
}))
vi.mock('@/data/communityEditorial', async (orig) => ({ ...(await orig<typeof import('@/data/communityEditorial')>()), ...ed }))

const { OfficialTab } = await import('@/ui/community/admin/OfficialTab')

type Row = Record<string, unknown>
const LONG_BODY = 'PARRAFO-SOLO-EN-EL-DETALLE: un texto largo del artículo que no debe salir en la lista.'
const article = (over: Row = {}): Row => ({
  id: 'a1', kind: 'article', section: 'hogar', topicId: 'ahorro', title: 'Trucos para ahorrar luz', body: LONG_BODY, status: 'proposed', version: 2,
  payload: { editorial: true, sources: [], recipes: [{ key: 'r1', title: 'Estofado de pollo', servings: 4, ingredients: [{ name: 'Pollo', quantity: 1, unit: 'kg' }], steps: ['Cocer'] }] },
  slotDate: '2026-11-02', generated: true, proposedBy: 'Pepa (IA)', tier: 1, ...over,
})
const poll = (over: Row = {}): Row => ({ id: 'p1', kind: 'poll', section: 'hogar', topicId: 'ahorro', title: '¿Qué cenas el viernes?', body: 'Intro', status: 'proposed', version: 1, payload: { options: ['Pizza', 'Sopa'] }, slotDate: '2026-11-07', generated: true, ...over })
const menuRow = (over: Row = {}): Row => ({ id: 'm1', title: 'Menú semanal de Pepa: semana del 2 al 8 de noviembre', state: 'draft', version: 4, scheduledWeekly: true, weekStart: '2026-11-02', weekEnd: '2026-11-08', ...over })
const prog = (over: Row = {}) => ({ id: 'a1', kind: 'article', title: 'Trucos para ahorrar luz', status: 'proposed', version: 2, slotDate: '2026-11-02', topicLabel: 'Ahorro', publishAt: null, publishError: null, tier: 1, ...over })

// «Base de datos» simulada: lo que el servidor devolvería. Cada prueba la cambia para simular acciones y fallos.
let db: { proposals: Record<string, Row[]>; menus: Row[]; program: Row[] }
const kindStatus = {
  enabled: false, weekStart: '2026-11-02', nextRun: '2026-11-04T07:00:00Z', dueNow: false, cycleDone: false, failedAttempts: 0, expected: 1, lastRun: null,
  drafts: { proposed: 0, approved: 0, published: 0, inTargetWeek: 0 },
}
const statusRaw = { launched: true, cycle: { runAt: '2026-10-28T07:00:00Z', due: false, monday: '2026-10-26' }, kinds: { articles: kindStatus, poll: kindStatus, menu: kindStatus }, menuAutopublish: false, ai: { enabled: true, dailyCap: 300, usedToday: 0 }, errors: [] }

beforeEach(() => {
  vi.clearAllMocks()
  window.scrollTo = vi.fn()
  window.history.replaceState({}, '', '/')
  db = { proposals: { proposed: [article(), poll()], approved: [], rejected: [], published: [] }, menus: [menuRow()], program: [prog(), prog({ id: 'p1', kind: 'poll', title: '¿Qué cenas el viernes?', slotDate: '2026-11-07' })] }
  api.adminListProposals.mockImplementation(async (s: string) => db.proposals[s] ?? [])
  api.adminListMenus.mockImplementation(async () => ({ autopublish: false, menus: db.menus }))
  api.listCommunityTopics.mockResolvedValue([{ id: 'ahorro', section: 'hogar', label: 'Ahorro' }])
  ed.listEditorialItems.mockImplementation(async () => db.program)
  ed.getEditorialStatus.mockResolvedValue(toEditorialStatus(statusRaw))
  ed.listEditorialRuns.mockResolvedValue([])
  ed.listEditorialRevisions.mockResolvedValue([])
  ed.listItemVersions.mockResolvedValue([])
})
afterEach(() => cleanup())

const mount = (url = '/') => render(<MemoryRouter initialEntries={[url]}><OfficialTab onChanged={vi.fn()} /></MemoryRouter>)
const nav = (name: RegExp) => screen.getByRole('button', { name })
const summaryCard = (label: RegExp) => screen.getByRole('button', { name: label })

describe('Centro Editorial: Resumen y navegación', () => {
  it('enseña las seis secciones y el Resumen con contadores reales; cada tarjeta lleva a su lista con el filtro aplicado', async () => {
    mount()
    await screen.findByRole('button', { name: /Artículos pendientes de revisión: 1/ })
    for (const s of ['Resumen', 'Artículos', 'Encuestas', 'Menús semanales', 'Programación y configuración', 'Historial y errores']) expect(screen.getAllByText(new RegExp(s)).length).toBeGreaterThan(0)
    expect(summaryCard(/Encuestas pendientes: 1/)).toBeTruthy()
    expect(summaryCard(/Menús pendientes: 1/)).toBeTruthy()
    expect(summaryCard(/Aprobado y programado: 0/)).toBeTruthy()
    expect(summaryCard(/Errores que requieren intervención: 0/)).toBeTruthy()
    fireEvent.click(summaryCard(/Menús pendientes/))
    const list = await screen.findByRole('article', { name: /Menú semanal de Pepa: Menú semanal de Pepa/ })
    expect(list).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pendientes (1)' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('un error de publicación sale en el Resumen y en el contador, con acceso directo al elemento', async () => {
    db.proposals.approved = [article({ id: 'a9', status: 'approved', publishAt: '2026-11-02T09:00:00Z', publishError: 'No se pudo publicar' })]
    mount()
    await screen.findByRole('button', { name: /Errores que requieren intervención: 1/ })
    expect(screen.getByRole('button', { name: /Historial y errores \(1\)/ })).toBeTruthy()
    expect(screen.getByText(/No se pudo publicar/)).toBeTruthy()
  })

  it('la sección elegida se recuerda en la dirección (?ed=)', async () => {
    mount('/?ed=menus')
    await screen.findByRole('article', { name: /Menú semanal de Pepa/ })
  })
})

describe('Centro Editorial: listas compactas (regresión: nunca artículos completos en la lista)', () => {
  it('la lista enseña tipo, título, tema, fecha, estado, versión y «Ver / Gestionar», pero NO el texto ni las fichas', async () => {
    mount('/?ed=articulos')
    const card = await screen.findByRole('article', { name: /Artículo de Equipo PEPA: Trucos para ahorrar luz/ })
    const c = within(card)
    expect(c.getByText('Pendiente de revisar')).toBeTruthy()
    expect(c.getByText(/Ahorro · Previsto: 2 de noviembre · Versión 2/)).toBeTruthy()
    expect(c.getByRole('button', { name: /Ver o gestionar: Trucos para ahorrar luz/ })).toBeTruthy()
    expect(screen.queryByText(/PARRAFO-SOLO-EN-EL-DETALLE/)).toBeNull()
    expect(screen.queryByText(/Estofado de pollo/)).toBeNull()
    expect(document.querySelectorAll('.cadm-proposal').length).toBe(0)
  })

  it('«Aprobadas» y «Publicadas» tampoco enseñan contenido completo', async () => {
    db.proposals.approved = [article({ id: 'a2', status: 'approved', title: 'Aprobado largo', publishAt: '2026-11-03T09:00:00Z' })]
    db.proposals.published = [article({ id: 'a3', status: 'published', title: 'Publicado largo', publishAt: '2026-10-20T09:00:00Z' })]
    mount('/?ed=articulos')
    fireEvent.click(await screen.findByRole('button', { name: /^Aprobadas/ }))
    await screen.findByRole('article', { name: /Aprobado largo/ })
    expect(screen.queryByText(/PARRAFO-SOLO-EN-EL-DETALLE/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Publicadas/ }))
    await screen.findByRole('article', { name: /Publicado largo/ })
    expect(screen.queryByText(/PARRAFO-SOLO-EN-EL-DETALLE/)).toBeNull()
    expect(screen.queryByText(/Estofado de pollo/)).toBeNull()
  })

  it('«Ver / Gestionar» abre el detalle con el contenido completo y todas las acciones; «Volver a la lista» regresa sin perder el filtro', async () => {
    mount('/?ed=articulos')
    fireEvent.change(await screen.findByLabelText('Buscar por título'), { target: { value: 'trucos' } })
    fireEvent.click(await screen.findByRole('button', { name: /Ver o gestionar: Trucos para ahorrar luz/ }))
    await screen.findByText(/PARRAFO-SOLO-EN-EL-DETALLE/)
    expect(screen.getByText(/Estofado de pollo/)).toBeTruthy()
    for (const b of ['Editar', 'Rectificar con Pepa', 'Rechazar']) expect(screen.getAllByRole('button', { name: b }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Volver a la lista/ }))
    await waitFor(() => expect(screen.queryByText(/PARRAFO-SOLO-EN-EL-DETALLE/)).toBeNull())
    expect((screen.getByLabelText('Buscar por título') as HTMLInputElement).value).toBe('trucos')
  })

  it('busca por título, filtra por fechas y avisa si nada coincide', async () => {
    db.proposals.proposed = [article(), article({ id: 'a2', title: 'Plato de ducha limpio', slotDate: '2026-11-05' })]
    mount('/?ed=articulos')
    await screen.findByRole('article', { name: /Trucos para ahorrar luz/ })
    fireEvent.change(screen.getByLabelText('Buscar por título'), { target: { value: 'ducha' } })
    expect(screen.queryByRole('article', { name: /Trucos para ahorrar luz/ })).toBeNull()
    expect(screen.getByRole('article', { name: /Plato de ducha limpio/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Buscar por título'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-04' } })
    expect(screen.queryByRole('article', { name: /Trucos para ahorrar luz/ })).toBeNull()
    expect(screen.getByRole('article', { name: /Plato de ducha limpio/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Buscar por título'), { target: { value: 'zzz' } })
    expect(screen.getByText('Ningún elemento coincide con esos filtros.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }))
    await screen.findByRole('article', { name: /Trucos para ahorrar luz/ })
  })

  it('carga progresiva: con muchos elementos enseña 20 y «Ver más» añade el resto', async () => {
    db.proposals.proposed = Array.from({ length: 25 }, (_, n) => article({ id: `x${n}`, title: `Artículo número ${String(n).padStart(2, '0')}`, slotDate: `2026-11-${String(1 + (n % 28)).padStart(2, '0')}` }))
    mount('/?ed=articulos')
    await screen.findAllByRole('button', { name: /Ver o gestionar/ })
    expect(screen.getAllByRole('button', { name: /Ver o gestionar/ })).toHaveLength(20)
    fireEvent.click(screen.getByRole('button', { name: /Ver 5 más/ }))
    expect(screen.getAllByRole('button', { name: /Ver o gestionar/ })).toHaveLength(25)
  })
})

describe('Centro Editorial: actualización inmediata (regresión: estados desactualizados)', () => {
  it('al aprobar, la tarjeta, los contadores y el programa semanal cambian a la vez sin recargar', async () => {
    api.adminApproveProposal.mockImplementation(async () => {
      db.proposals.proposed = db.proposals.proposed.filter((p) => p.id !== 'a1')
      db.proposals.approved = [article({ status: 'approved', publishAt: '2026-11-02T09:00:00Z', approvedAt: '2026-10-29T08:00:00Z', approvedByName: 'Jennifer', approvedVersion: 2 })]
      // El servidor del programa tarda en reflejarlo: devuelve el estado viejo. El registro compartido manda.
      return { scheduled: true, publishAt: '2026-11-02T09:00:00Z', postId: null }
    })
    mount('/?ed=articulos')
    fireEvent.click(await screen.findByRole('button', { name: /Ver o gestionar: Trucos para ahorrar luz/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }))
    fireEvent.click(screen.getByRole('button', { name: /Toca otra vez: aprobar y programar para su día/ }))
    await waitFor(() => expect(api.adminApproveProposal).toHaveBeenCalledWith('a1'))
    // El detalle sigue abierto y ya muestra el estado REAL (aprobada), sin volver a entrar.
    await waitFor(() => expect(screen.getByText('Aprobada')).toBeTruthy())
    expect(api.adminListProposals.mock.calls.length).toBeGreaterThan(2)
    expect(ed.listEditorialItems.mock.calls.length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: /Volver a la lista/ }))
    // Contadores del Resumen.
    fireEvent.click(await screen.findByRole('button', { name: /Resumen/ }))
    await screen.findByRole('button', { name: /Artículos pendientes de revisión: 0/ })
    expect(summaryCard(/Aprobado y programado: 1/)).toBeTruthy()
    // Programa semanal: el hueco ya figura aprobado aunque la lista del programa devolviera el estado viejo.
    fireEvent.click(nav(/Programación y configuración/))
    await screen.findByRole('button', { name: /Revisar artículo: Trucos para ahorrar luz/ })
    const row = screen.getByRole('button', { name: /Revisar artículo: Trucos para ahorrar luz/ }).closest('.cadm-program-item') as HTMLElement
    expect(within(row).getByText(/Aprobado/)).toBeTruthy()
    expect(within(row).queryByText(/Borrador \(pendiente de revisar\)/)).toBeNull()
  })

  it('si el servidor RECHAZA la acción no se enseña un éxito: se muestra el error y el estado sigue siendo el real', async () => {
    api.adminApproveProposal.mockRejectedValue(new CommunityError('NO_SOURCES'))
    mount('/?ed=articulos')
    fireEvent.click(await screen.findByRole('button', { name: /Ver o gestionar: Trucos para ahorrar luz/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }))
    fireEvent.click(screen.getByRole('button', { name: /Toca otra vez/ }))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(screen.queryByText('Aprobada')).toBeNull()
    expect(screen.getAllByText('Pendiente de revisar').length).toBeGreaterThan(0)
  })

  it('si falla la recarga se avisa («no se ha podido actualizar») y se conservan los datos anteriores con «Reintentar»', async () => {
    mount('/?ed=articulos')
    fireEvent.click(await screen.findByRole('button', { name: /Ver o gestionar: Trucos para ahorrar luz/ }))
    await screen.findByText(/PARRAFO-SOLO-EN-EL-DETALLE/)
    api.adminListMenus.mockRejectedValue(new CommunityError('UNKNOWN'))
    fireEvent.click(screen.getByRole('button', { name: /Volver a la lista/ }))
    await screen.findByText(/No se ha podido actualizar/)
    // Lo último correcto sigue a la vista.
    expect(screen.getByRole('article', { name: /Trucos para ahorrar luz/ })).toBeTruthy()
    api.adminListMenus.mockImplementation(async () => ({ autopublish: false, menus: db.menus }))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.queryByText(/No se ha podido actualizar/)).toBeNull())
  })

  it('rechazar desde el detalle lo saca de «Pendientes» y lo deja en «Rechazadas» al instante', async () => {
    api.adminRejectProposal.mockImplementation(async () => {
      db.proposals.proposed = db.proposals.proposed.filter((p) => p.id !== 'a1')
      db.proposals.rejected = [article({ status: 'rejected', reviewNote: 'No encaja' })]
    })
    mount('/?ed=articulos')
    fireEvent.click(await screen.findByRole('button', { name: /Ver o gestionar: Trucos para ahorrar luz/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'No encaja' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirmar: rechazar/ }))
    await waitFor(() => expect(api.adminRejectProposal).toHaveBeenCalledWith('a1', 'No encaja'))
    await waitFor(() => expect(screen.getByText('Rechazada')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Volver a la lista/ }))
    await waitFor(() => expect(screen.queryByRole('article', { name: /Trucos para ahorrar luz/ })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /^Rechazadas/ }))
    await screen.findByRole('article', { name: /Trucos para ahorrar luz/ })
  })
})

describe('Centro Editorial: reprogramar encuestas', () => {
  it('una encuesta aprobada y programada se puede trasladar a otro sábado (solo cambia las fechas)', async () => {
    db.proposals.proposed = []
    db.proposals.approved = [poll({ status: 'approved', publishAt: '2026-11-07T09:00:00Z', approvedAt: '2026-10-29T08:00:00Z', approvedByName: 'Jennifer', approvedVersion: 1 })]
    api.adminReschedulePoll.mockResolvedValue({ opens_at: '2026-11-14T09:00:00Z', closes_at: '2026-11-15T16:00:00Z' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T10:00:00Z'))
    try {
      mount('/?ed=encuestas')
      fireEvent.click(await screen.findByRole('button', { name: /^Aprobadas/ }))
      fireEvent.click(await screen.findByRole('button', { name: /Ver o gestionar: ¿Qué cenas el viernes\?/ }))
      fireEvent.click(await screen.findByRole('button', { name: 'Reprogramar' }))
      const select = (await screen.findByLabelText('Sábado de apertura')) as HTMLSelectElement
      fireEvent.change(select, { target: { value: select.options[2].value } })
      fireEvent.click(screen.getByRole('button', { name: 'Reprogramar', hidden: false }))
      await waitFor(() => expect(api.adminReschedulePoll).toHaveBeenCalledWith('p1', select.options[2].value))
      await screen.findByText(/Encuesta reprogramada: abre el/)
    } finally {
      vi.useRealTimers()
    }
  })
})
