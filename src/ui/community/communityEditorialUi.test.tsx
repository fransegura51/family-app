// @vitest-environment jsdom
// Generación semanal y «Rectificar con Pepa» (administración de Comunidad): interfaz real en jsdom con las RPC y la función de servidor simuladas.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityError } from '@/domain/communityErrors'
import { toEditorialStatus, toReviseProposal, type EditorialItemRow } from '@/domain/communityEditorial'
import { toProposals } from '@/domain/communityAdmin'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const api = vi.hoisted(() => ({
  adminApproveProposal: vi.fn(),
  adminEditProposal: vi.fn(),
  adminListProposals: vi.fn(),
  adminRejectProposal: vi.fn(),
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
  decideRevision: vi.fn(),
  restoreItemVersion: vi.fn(),
  scheduleItem: vi.fn(),
  generateNow: vi.fn(),
  requestRevision: vi.fn(),
}))
vi.mock('@/data/communityEditorial', async (orig) => ({ ...(await orig<typeof import('@/data/communityEditorial')>()), ...ed }))

const { EditorialCallError } = await import('@/data/communityEditorial')
const { EditorialPanel } = await import('@/ui/community/admin/EditorialPanel')
const { RevisePanel } = await import('@/ui/community/admin/RevisePanel')
const { ProposalCard, OfficialTab } = await import('@/ui/community/admin/OfficialTab')
const { MenuReview } = await import('@/ui/community/admin/MenusSection')
const dom = await import('@/domain/communityAdmin')

const kind = (over: Record<string, unknown> = {}) => ({
  enabled: false,
  weekStart: '2026-11-02',
  nextRun: '2026-11-04T07:00:00Z',
  dueNow: false,
  cycleDone: false,
  failedAttempts: 0,
  expected: 1,
  lastRun: null,
  drafts: { proposed: 0, approved: 0, published: 0, inTargetWeek: 0 },
  ...over,
})
const statusRaw = (over: Record<string, unknown> = {}) => ({
  launched: true,
  cycle: { runAt: '2026-10-28T07:00:00Z', due: false, monday: '2026-10-26' },
  kinds: {
    articles: kind({ expected: 7, drafts: { proposed: 2, approved: 1, published: 0, inTargetWeek: 3 }, lastRun: { id: 'r1', status: 'ok', trigger: 'schedule', startedAt: '2026-10-28T07:07:00Z', itemsCreated: 7, itemsExpected: 7 } }),
    poll: kind({ weekStart: '2026-10-26' }),
    menu: kind(),
  },
  menuAutopublish: false,
  ai: { enabled: true, dailyCap: 300, usedToday: 12 },
  errors: [{ id: 'e1', kind: 'menu', trigger: 'schedule', weekStart: '2026-11-02', status: 'error', startedAt: '2026-10-28T07:07:00Z', error: 'TIMEOUT: la ejecución no terminó.', itemsCreated: 0, itemsExpected: 1 }],
  ...over,
})

const item = (over: Partial<EditorialItemRow>): EditorialItemRow => ({
  id: 'a1',
  kind: 'article',
  title: 'Trucos para ahorrar luz',
  status: 'proposed',
  version: 1,
  slotDate: '2026-11-02',
  topicLabel: 'Ahorro',
  publishAt: null,
  publishError: null,
  tier: 1,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  ed.getEditorialStatus.mockResolvedValue(toEditorialStatus(statusRaw()))
  ed.listEditorialItems.mockResolvedValue([item({}), item({ id: 'p1', kind: 'poll', title: '¿Qué cenas?', slotDate: '2026-11-07' }), item({ id: 'm1', kind: 'menu', title: 'Menú de la semana', slotDate: '2026-11-02', status: 'approved', publishAt: '2026-11-07T09:00:00Z' })])
  ed.listEditorialRuns.mockResolvedValue([])
  ed.listEditorialRevisions.mockResolvedValue([])
  ed.listItemVersions.mockResolvedValue([])
  ed.setEditorialToggle.mockResolvedValue(undefined)
  ed.setMenuAutopublish.mockResolvedValue(undefined)
})
afterEach(() => cleanup())

const mount = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>)
const panel = () => mount(<EditorialPanel onReview={vi.fn()} onGenerated={vi.fn()} />)
const card = (label: RegExp) => screen.getByRole('article', { name: label })

describe('Generación semanal: panel', () => {
  it('enseña los tres tipos de forma independiente, nacen en pausa y explican el estado', async () => {
    panel()
    await screen.findByRole('article', { name: /artículos/i })
    for (const re of [/artículos/i, /encuesta/i, /menú semanal/i]) {
      const c = card(re)
      expect(within(c).getByRole('switch').getAttribute('aria-checked')).toBe('false')
      expect(within(c).getByText(/En pausa: no se prepararán borradores nuevos; los que ya existen, y lo aprobado o programado, no cambian/)).toBeTruthy()
      expect(within(c).getByText(/No se ejecutará mientras esté en pausa/)).toBeTruthy()
    }
    const a = card(/artículos/i)
    expect(within(a).getByText(/Próxima ejecución programada: miércoles 4 nov, 08:00 \(hora de Madrid\)/)).toBeTruthy()
    expect(within(a).getByText(/Correcta · .*7 de 7 borradores/)).toBeTruthy()
    expect(within(a).getByText(/Borradores de la semana .*: 3 de 7/)).toBeTruthy()
  })

  it('los interruptores llaman a la RPC correcta (la encuesta es «polls») y recargan el estado', async () => {
    panel()
    await screen.findByRole('article', { name: /artículos/i })
    fireEvent.click(within(card(/artículos/i)).getByRole('switch'))
    await waitFor(() => expect(ed.setEditorialToggle).toHaveBeenCalledWith('articles', true))
    fireEvent.click(within(card(/encuesta/i)).getByRole('switch'))
    await waitFor(() => expect(ed.setEditorialToggle).toHaveBeenCalledWith('polls', true))
    fireEvent.click(within(card(/menú semanal/i)).getByRole('switch'))
    await waitFor(() => expect(ed.setEditorialToggle).toHaveBeenCalledWith('menu', true))
    await waitFor(() => expect(ed.getEditorialStatus.mock.calls.length).toBeGreaterThan(1))
  })

  it('un interruptor activado se puede pausar, y un fallo se explica sin cambiar nada', async () => {
    ed.getEditorialStatus.mockResolvedValue(toEditorialStatus(statusRaw({ kinds: { articles: kind({ enabled: true, expected: 7 }), poll: kind(), menu: kind() } })))
    panel()
    await screen.findByRole('article', { name: /artículos/i })
    const sw = within(card(/artículos/i)).getByRole('switch')
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(within(card(/artículos/i)).getByText(/Activa: Pepa preparará borradores cada miércoles/)).toBeTruthy()
    ed.setEditorialToggle.mockRejectedValueOnce(new CommunityError('NOT_ADMIN'))
    fireEvent.click(sw)
    expect(await screen.findByText(/solo para la administración de Comunidad/)).toBeTruthy()
    expect(ed.setEditorialToggle).toHaveBeenCalledWith('articles', false)
  })

  it('enseña el uso de IA y el control de publicar el menú aprobado, SEPARADO de los tres interruptores de generación', async () => {
    panel()
    const c = await screen.findByRole('region', { name: 'Publicar a su hora el menú ya aprobado' })
    expect(screen.getByText(/IA usada hoy: 12 de 300/)).toBeTruthy()
    expect(within(c).getByText(/Es distinto de la generación: la generación puede estar activa y esto desactivado/)).toBeTruthy()
    expect(within(c).getByText(/Desactivada: un menú aprobado queda programado pero no sale solo/)).toBeTruthy()
    expect(within(c).getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(c.closest('article')).toBeNull()
    expect(screen.getAllByRole('switch')).toHaveLength(4)
  })

  it('activar el menú a su hora pide confirmación (y no llama hasta confirmar); cancelar no hace nada', async () => {
    panel()
    const c = await screen.findByRole('region', { name: 'Publicar a su hora el menú ya aprobado' })
    fireEvent.click(within(c).getByRole('switch'))
    expect(within(c).getByText('Un menú que apruebes saldrá solo el sábado a las 10:00 (hora de Madrid). Sigue necesitando tu aprobación antes; nada se publica sin revisión.')).toBeTruthy()
    expect(ed.setMenuAutopublish).not.toHaveBeenCalled()
    fireEvent.click(within(c).getByRole('button', { name: 'Cancelar' }))
    expect(ed.setMenuAutopublish).not.toHaveBeenCalled()
    fireEvent.click(within(c).getByRole('switch'))
    fireEvent.click(within(c).getByRole('button', { name: 'Sí, activar' }))
    await waitFor(() => expect(ed.setMenuAutopublish).toHaveBeenCalledWith(true))
    expect(ed.setEditorialToggle).not.toHaveBeenCalled()
    await waitFor(() => expect(ed.getEditorialStatus.mock.calls.length).toBeGreaterThan(1))
  })

  it('desactivarlo no pide confirmación y un fallo se explica', async () => {
    ed.getEditorialStatus.mockResolvedValue(toEditorialStatus(statusRaw({ menuAutopublish: true })))
    panel()
    const c = await screen.findByRole('region', { name: 'Publicar a su hora el menú ya aprobado' })
    expect(within(c).getByText(/Activada: un menú aprobado sale solo el sábado a las 10:00/)).toBeTruthy()
    ed.setMenuAutopublish.mockRejectedValueOnce(new CommunityError('NOT_ADMIN'))
    fireEvent.click(within(c).getByRole('switch'))
    expect(ed.setMenuAutopublish).toHaveBeenCalledWith(false)
    expect(await within(c).findByRole('alert')).toBeTruthy()
  })

  it('«toca ahora» solo se avisa con el tipo activado', async () => {
    ed.getEditorialStatus.mockResolvedValue(toEditorialStatus(statusRaw({ kinds: { articles: kind({ enabled: true, dueNow: true, expected: 7 }), poll: kind({ dueNow: true }), menu: kind() } })))
    panel()
    await screen.findByRole('article', { name: /artículos/i })
    expect(within(card(/artículos/i)).getByText(/Toca ahora: se preparará en la próxima hora en punto y 7 minutos/)).toBeTruthy()
    expect(within(card(/encuesta/i)).queryByText(/Toca ahora/)).toBeNull()
  })

  it('errores recientes con motivo claro e historial de ejecuciones a petición', async () => {
    ed.listEditorialRuns.mockResolvedValue([{ id: 'x', kind: 'articles', trigger: 'manual', weekStart: '2026-11-02', status: 'ok', startedAt: '2026-10-28T07:00:00Z', finishedAt: null, itemsCreated: 7, itemsExpected: 7, attempt: 1, error: null }])
    panel()
    expect(await screen.findByText(/La ejecución no terminó a tiempo\./)).toBeTruthy()
    expect(screen.queryByText(/TIMEOUT/)).toBeNull()
    expect(ed.listEditorialRuns).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Ver el historial de ejecuciones/ }))
    expect(await screen.findByText(/manual · Correcta/)).toBeTruthy()
    expect(ed.listEditorialRuns).toHaveBeenCalledWith(30)
  })

  it('NINGÚN botón del panel publica ni aprueba: solo Activar/Pausar, Generar ahora, Revisar, historial y actualizar', async () => {
    panel()
    await screen.findByRole('article', { name: /artículos/i })
    await screen.findAllByRole('button', { name: /Revisar/ })
    const names = screen.getAllByRole('button').map((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim())
    for (const n of names) expect(n, n).not.toMatch(/aprobar|publicar|rechazar/i)
    expect(names.some((n) => /^Generar ahora/.test(n))).toBe(true)
  })
})

describe('Generación semanal: «Generar ahora»', () => {
  it('pide confirmación explícita y no genera hasta confirmar; cancelar no hace nada', async () => {
    panel()
    await screen.findByRole('article', { name: /artículos/i })
    fireEvent.click(within(card(/artículos/i)).getByRole('button', { name: /Generar ahora/ }))
    expect(within(card(/artículos/i)).getByText('Se prepararán borradores con IA; no se publica nada.')).toBeTruthy()
    expect(within(card(/artículos/i)).getByText(/Puede tardar hasta unos 2 minutos/)).toBeTruthy()
    expect(ed.generateNow).not.toHaveBeenCalled()
    fireEvent.click(within(card(/artículos/i)).getByRole('button', { name: 'Cancelar' }))
    expect(ed.generateNow).not.toHaveBeenCalled()
    expect(within(card(/artículos/i)).queryByText('Se prepararán borradores con IA; no se publica nada.')).toBeNull()
  })

  it('muestra el progreso, protege contra el doble clic y enseña el resultado sin publicar nada', async () => {
    let finish: (v: unknown) => void = () => undefined
    ed.generateNow.mockImplementation(() => new Promise((r) => (finish = r)))
    const onGenerated = vi.fn()
    mount(<EditorialPanel onReview={vi.fn()} onGenerated={onGenerated} />)
    await screen.findByRole('article', { name: /artículos/i })
    const a = card(/artículos/i)
    fireEvent.click(within(a).getByRole('button', { name: /Generar ahora/ }))
    const confirm = within(a).getByRole('button', { name: 'Sí, preparar borradores' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(ed.generateNow).toHaveBeenCalledTimes(1)
    expect(ed.generateNow).toHaveBeenCalledWith('articles')
    expect(within(a).getByText(/Pepa está preparando los borradores… Puede tardar hasta unos 2 minutos/)).toBeTruthy()
    const busy = within(a).getByRole('button', { name: /Generar ahora/ }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(ed.generateNow).toHaveBeenCalledTimes(1)
    // Los otros tipos siguen disponibles de forma independiente.
    expect((within(card(/encuesta/i)).getByRole('button', { name: /Generar ahora/ }) as HTMLButtonElement).disabled).toBe(false)
    await act(async () => finish({ runId: 'r1', status: 'ok', created: 7, expected: 7, itemIds: [], errorCount: 0 }))
    expect(await within(a).findByText(/Listo: se han preparado 7 de 7 borradores\. No se ha publicado nada/)).toBeTruthy()
    expect(onGenerated).toHaveBeenCalled()
    expect((within(a).getByRole('button', { name: /Generar ahora/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('funciona aunque esté en pausa (se avisa en la confirmación) y cada error se traduce', async () => {
    const cases: [string, RegExp][] = [
      ['busy', /Ya hay una preparación en curso/],
      ['not_admin', /Solo la administración de Comunidad/],
      ['unauthorized', /sesión ha caducado/],
      ['bad_request', /No se ha podido enviar la petición/],
      ['ai_not_allowed', /La IA no está disponible/],
      ['internal_error', /Algo ha fallado al preparar los borradores/],
    ]
    panel()
    await screen.findByRole('article', { name: /encuesta/i })
    const c = () => card(/encuesta/i)
    for (const [code, re] of cases) {
      ed.generateNow.mockRejectedValueOnce(new EditorialCallError(code, (await import('@/domain/communityEditorial')).generateErrorText(code)))
      fireEvent.click(within(c()).getByRole('button', { name: /Generar ahora/ }))
      expect(within(c()).getByText(/funciona aunque el interruptor esté en pausa/)).toBeTruthy()
      fireEvent.click(within(c()).getByRole('button', { name: 'Sí, preparar borradores' }))
      const alert = await within(c()).findByRole('alert')
      expect(alert.textContent, code).toMatch(re)
      expect(alert.textContent, code).not.toMatch(/[a-z]+_[a-z]+/)
    }
    expect(ed.generateNow).toHaveBeenCalledWith('poll')
  })
})

describe('Programa de la semana', () => {
  it('enseña cada día con su artículo, la encuesta del sábado y el menú, con su estado', async () => {
    panel()
    await screen.findByText(/Trucos para ahorrar luz/)
    expect(screen.getByText(/¿Qué cenas?/)).toBeTruthy()
    expect(screen.getByText(/Menú de la semana/)).toBeTruthy()
    expect(screen.getByText(/Aprobado · programado para el sábado 7 de noviembre a las 10:00/)).toBeTruthy()
    expect(screen.getByText('lunes 2 nov')).toBeTruthy()
    expect(screen.getByText('sábado 7 nov')).toBeTruthy()
    expect(ed.listEditorialItems).toHaveBeenCalledWith(null)
  })

  it('«Revisar» pasa el elemento a quien lo abre en el editor', async () => {
    const onReview = vi.fn()
    mount(<EditorialPanel onReview={onReview} onGenerated={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Revisar artículo: Trucos para ahorrar luz/ }))
    expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', kind: 'article' }))
  })

  it('en la pestaña, «Revisar» del programa abre ESE elemento en su detalle (con su hueco y su prioridad) y «Volver a la lista» regresa', async () => {
    const proposal = {
      id: 'a1', kind: 'article', section: 'hogar', topicId: 'ahorro', title: 'Trucos para ahorrar luz', body: 'Un texto práctico', status: 'proposed', version: 1,
      payload: { editorial: true, sources: [] }, slotDate: '2026-11-02', generated: true, proposedBy: 'Pepa (IA)', tier: 1,
    }
    api.listCommunityTopics.mockResolvedValue([{ id: 'ahorro', section: 'hogar', label: 'Ahorro' }])
    api.adminListProposals.mockResolvedValue([proposal, { ...proposal, id: 'other', title: 'Otro artículo', slotDate: '2026-11-03', tier: 2 }])
    api.adminListMenus.mockResolvedValue({ autopublish: false, menus: [] })
    mount(<OfficialTab onChanged={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: /Programación y configuración/ }))
    const open = await screen.findByRole('button', { name: /Revisar artículo: Trucos para ahorrar luz/ })
    fireEvent.click(open)
    await waitFor(() => expect(document.querySelector('[data-proposal-id="a1"]')).toBeTruthy())
    expect(document.querySelector('[data-proposal-id="other"]')).toBeNull()
    expect(screen.getAllByText(/Para el lunes 2 nov · Tema nuevo/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Borrador preparado por Pepa [(]IA[)]/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Volver a la lista/ }))
    await waitFor(() => expect(document.querySelector('[data-proposal-id="a1"]')).toBeNull())
  })
})

describe('Aprobar un artículo del programa', () => {
  const programArticle = (over: Record<string, unknown> = {}) =>
    toProposals([{ id: 'a1', kind: 'article', section: 'hogar', topicId: 'ahorro', title: 'Truco', body: 'Texto', status: 'proposed', version: 1, payload: { editorial: true, sources: [] }, slotDate: '2026-11-02', generated: true, tier: 2, ...over }])[0]

  it('un artículo práctico del programa (sin fuentes externas) se puede aprobar y se PROGRAMA, no se publica', async () => {
    api.adminApproveProposal.mockResolvedValue({ scheduled: true, publishAt: '2026-11-02T09:00:00Z', postId: null })
    const onDone = vi.fn()
    mount(<ProposalCard proposal={programArticle()} topics={[]} onDone={onDone} />)
    expect(screen.queryByText(/no tiene fuentes externas/)).toBeNull()
    expect(screen.getByText(/NO se publica al momento: se programa para el lunes 2 nov a las 10:00/)).toBeTruthy()
    expect(screen.getByText(/Idea de las familias/)).toBeTruthy()
    const btn = screen.getByRole('button', { name: 'Aprobar' })
    fireEvent.click(btn)
    fireEvent.click(screen.getByRole('button', { name: /Toca otra vez: aprobar y programar para su día/ }))
    await waitFor(() => expect(api.adminApproveProposal).toHaveBeenCalledWith('a1'))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Aprobado: se publicará el lunes 2 de noviembre a las 10:00 (hora de Madrid).', true))
  })

  it('un artículo con datos externos (no editorial) y sin fuentes SIGUE exigiendo fuentes', () => {
    mount(<ProposalCard proposal={programArticle({ payload: { sources: [] }, slotDate: null, generated: false })} topics={[]} onDone={vi.fn()} />)
    expect(screen.getByText(/no tiene fuentes externas, así que no se puede aprobar/)).toBeTruthy()
  })

  it('un artículo aprobado y programado se puede reprogramar (hora de Madrid) sin publicarlo', async () => {
    ed.scheduleItem.mockResolvedValue(undefined)
    const onDone = vi.fn()
    const p = programArticle({ status: 'approved', publishAt: '2099-01-01T09:00:00Z', approvedAt: '2026-10-28T07:00:00Z' })
    mount(<ProposalCard proposal={p} topics={[]} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reprogramar' }))
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '2020-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la nueva hora' }))
    expect(await screen.findByText(/Esa hora ya ha pasado/)).toBeTruthy()
    expect(ed.scheduleItem).not.toHaveBeenCalled()
    const future = new Date(Date.now() + 5 * 24 * 3600_000).toISOString().slice(0, 10)
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: future } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la nueva hora' }))
    await waitFor(() => expect(ed.scheduleItem).toHaveBeenCalledTimes(1))
    expect(ed.scheduleItem.mock.calls[0][0]).toBe('a1')
    expect(api.adminApproveProposal).not.toHaveBeenCalled()
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringContaining('Aprobado: se publicará el'), false))
  })
})

describe('Rectificar con Pepa', () => {
  const proposalRaw = {
    ok: true,
    revision_id: 'rv1',
    notes: 'He añadido tres trucos y quitado la repetición.',
    before: { title: 'Ahorrar luz', body: 'Apaga las luces. Apaga las luces siempre.', payload: { recipes: [{ title: 'Sopa', ingredients: [1], steps: [1] }] } },
    result: { title: 'Ahorrar luz en casa', body: 'Apaga las luces. Usa bombillas LED.', payload: { recipes: [{ title: 'Sopa', ingredients: [1], steps: [1] }, { title: 'Tortilla', ingredients: [1, 2], steps: [1] }] } },
    quality: [],
  }

  const open = (props: Partial<React.ComponentProps<typeof RevisePanel>> = {}) => {
    const onChanged = vi.fn()
    const onClose = vi.fn()
    mount(<RevisePanel itemId="a1" kind="article" onChanged={onChanged} onClose={onClose} {...props} />)
    return { onChanged, onClose }
  }
  const ask = async (text = 'Haz la introducción más cercana') => {
    fireEvent.change(screen.getByLabelText('¿Qué quieres cambiar?'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Pedir una nueva versión' }))
  }

  it('avisa desde el principio de que aceptar no publica y ofrece atajos de ejemplo que rellenan la instrucción', () => {
    open()
    expect(screen.getByText(/Aceptar una rectificación NUNCA publica/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Demasiado básico' }))
    expect((screen.getByLabelText('¿Qué quieres cambiar?') as HTMLTextAreaElement).value).toBe('Este artículo es demasiado básico; añade trucos que realmente ayuden.')
  })

  it('no llama a la IA con una instrucción vacía', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Pedir una nueva versión' }))
    expect(await screen.findByText(/Escribe qué quieres cambiar/)).toBeTruthy()
    expect(ed.requestRevision).not.toHaveBeenCalled()
  })

  it('pide la nueva versión y la compara con la anterior: título, texto por palabras, fichas de recetas y lo que dice Pepa', async () => {
    ed.requestRevision.mockResolvedValue(toReviseProposal(proposalRaw))
    open()
    await ask()
    await screen.findByText(/Comparación con la versión anterior/)
    expect(ed.requestRevision).toHaveBeenCalledWith('a1', 'Haz la introducción más cercana', undefined)
    expect(screen.getByText(/He añadido tres trucos y quitado la repetición\./)).toBeTruthy()
    expect(document.querySelectorAll('ins.cadm-ins').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('del.cadm-del').length).toBeGreaterThan(0)
    expect(screen.getByText(/Receta añadida: Tortilla/)).toBeTruthy()
    // Nada se ha guardado todavía.
    expect(ed.decideRevision).not.toHaveBeenCalled()
  })

  it('aceptar llama a decidir con accept=true, avisa de que NO publica y pide aprobar de nuevo', async () => {
    ed.requestRevision.mockResolvedValue(toReviseProposal(proposalRaw))
    ed.decideRevision.mockResolvedValue({ accepted: true, version: 5 })
    const { onChanged } = open()
    await ask()
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar esta versión' }))
    await waitFor(() => expect(ed.decideRevision).toHaveBeenCalledWith('rv1', true))
    const msg = await screen.findAllByText(/Aceptada: se ha guardado como versión 5/)
    expect(msg.length).toBeGreaterThan(0)
    expect(msg[0].textContent).toContain('No se ha publicado nada')
    expect(msg[0].textContent).toContain('aprobarlo de nuevo')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onChanged.mock.calls[0][0]).toContain('No se ha publicado nada')
    expect(screen.queryByRole('button', { name: 'Aceptar esta versión' })).toBeNull()
  })

  it('rechazar llama a decidir con accept=false y no cambia nada (no avisa de cambios)', async () => {
    ed.requestRevision.mockResolvedValue(toReviseProposal(proposalRaw))
    ed.decideRevision.mockResolvedValue({ accepted: false, version: null })
    const { onChanged } = open()
    await ask()
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(ed.decideRevision).toHaveBeenCalledWith('rv1', false))
    expect(await screen.findByText(/Propuesta rechazada: el borrador no ha cambiado/)).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('STALE: explica que el borrador cambió mientras tanto, descarta la propuesta y conserva la instrucción', async () => {
    ed.requestRevision.mockResolvedValue(toReviseProposal(proposalRaw))
    ed.decideRevision.mockRejectedValue(new CommunityError('STALE'))
    const { onChanged } = open()
    await ask('Quita las repeticiones')
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar esta versión' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('cambió mientras tanto')
    expect(alert.textContent).toContain('Pide una nueva')
    expect(screen.queryByRole('button', { name: 'Aceptar esta versión' })).toBeNull()
    expect((screen.getByLabelText('¿Qué quieres cambiar?') as HTMLTextAreaElement).value).toBe('Quita las repeticiones')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('un fallo de la IA se traduce, no pierde la instrucción y se puede reintentar; mientras trabaja no se puede repetir la petición', async () => {
    let fail: (e: unknown) => void = () => undefined
    ed.requestRevision.mockImplementationOnce(() => new Promise((_, rej) => (fail = rej)))
    open()
    await ask('Corrige las cantidades para cuatro personas')
    expect(screen.getByText(/Pepa está preparando la nueva versión/)).toBeTruthy()
    const working = screen.getByRole('button', { name: 'Preparando…' }) as HTMLButtonElement
    expect(working.disabled).toBe(true)
    fireEvent.click(working)
    expect(ed.requestRevision).toHaveBeenCalledTimes(1)
    await act(async () => fail(new EditorialCallError('invalid_output', (await import('@/domain/communityEditorial')).reviseErrorText('invalid_output'))))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('No se ha cambiado nada')
    expect((screen.getByLabelText('¿Qué quieres cambiar?') as HTMLTextAreaElement).value).toBe('Corrige las cantidades para cuatro personas')
    ed.requestRevision.mockResolvedValueOnce(toReviseProposal(proposalRaw))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await screen.findByText(/Comparación con la versión anterior/)
    expect(ed.requestRevision).toHaveBeenCalledTimes(2)
    expect(ed.requestRevision.mock.calls[1][1]).toBe('Corrige las cantidades para cuatro personas')
  })

  it('el historial enseña las versiones, no deja restaurar la actual y restaurar crea una versión nueva sin publicar', async () => {
    ed.listItemVersions.mockResolvedValue([
      { version: 3, title: 'Tres', body: '', editedAt: '2026-10-28T07:00:00Z' },
      { version: 2, title: 'Dos', body: '', editedAt: '2026-10-27T07:00:00Z' },
    ])
    ed.listEditorialRevisions.mockResolvedValue([{ id: 'old', itemId: 'a1', baseVersion: 2, scope: 'item', instruction: 'Más cercano', status: 'rejected', notes: '', createdAt: '2026-10-27T08:00:00Z', decidedAt: null, before: { title: '', body: '', payload: {} }, result: { title: '', body: '', payload: {} } }])
    ed.restoreItemVersion.mockResolvedValue(4)
    const { onChanged } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Ver el historial de versiones' }))
    await screen.findByText(/Versión 3/)
    expect(screen.getAllByRole('button', { name: /Restaurar esta versión/ })).toHaveLength(1)
    expect(screen.getByText(/«Más cercano» · Rechazada/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar esta versión' }))
    fireEvent.click(screen.getByRole('button', { name: /Toca otra vez: restaurar como versión nueva/ }))
    await waitFor(() => expect(ed.restoreItemVersion).toHaveBeenCalledWith('a1', 2))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.stringContaining('No se ha publicado nada')))
  })

  it('el historial permite retomar una propuesta sin decidir', async () => {
    ed.listEditorialRevisions.mockResolvedValue([{ id: 'pend', itemId: 'a1', baseVersion: 2, scope: 'item', instruction: 'Quita lo repetido', status: 'proposed', notes: 'Quité una frase', createdAt: null, decidedAt: null, before: proposalRaw.before, result: proposalRaw.result }])
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Ver el historial de versiones' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ver y decidir' }))
    expect(await screen.findByText(/Comparación con la versión anterior/)).toBeTruthy()
    expect((screen.getByLabelText('¿Qué quieres cambiar?') as HTMLTextAreaElement).value).toBe('Quita lo repetido')
    ed.decideRevision.mockResolvedValue({ accepted: false, version: null })
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(ed.decideRevision).toHaveBeenCalledWith('pend', false))
  })

  it('una tarjeta de artículo en borrador ofrece «Rectificar con Pepa»; una publicada, no', () => {
    const p = toProposals([{ id: 'a1', kind: 'article', section: 'hogar', topicId: 'ahorro', title: 'T', body: 'x', status: 'proposed', version: 1, payload: { editorial: true } }])[0]
    const { unmount } = mount(<ProposalCard proposal={p} topics={[]} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rectificar con Pepa' }))
    expect(screen.getByLabelText('¿Qué quieres cambiar?')).toBeTruthy()
    unmount()
    const published = toProposals([{ id: 'a2', kind: 'article', section: 'hogar', topicId: 'ahorro', title: 'T', body: 'x', status: 'published', version: 1, publishedPostId: 'post', payload: { sources: [] } }])[0]
    mount(<ProposalCard proposal={published} topics={[]} onDone={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Rectificar con Pepa' })).toBeNull()
  })

  it('encuesta: la comparación enseña las opciones nuevas y las eliminadas', async () => {
    ed.requestRevision.mockResolvedValue(
      toReviseProposal({ revision_id: 'rv2', notes: 'Cambié una opción', before: { title: '¿Qué cenas?', body: '', payload: { options: ['Pasta', 'Arroz'] } }, result: { title: '¿Qué cenas?', body: '', payload: { options: ['Pasta', 'Legumbres'] } } }),
    )
    open({ kind: 'poll' })
    await ask()
    await screen.findByText(/Opciones de la encuesta/)
    expect(screen.getByText('Legumbres').tagName).toBe('INS')
    expect(screen.getByText('Arroz').tagName).toBe('DEL')
  })
})

describe('Menús: cambiar un plato con Pepa', () => {
  const detail = dom.toMenuDetail({
    id: 'm1',
    title: 'Menú',
    body: 'Texto',
    check: [],
    menu: {
      servings: 4,
      days: [
        { day: 'lunes', meals: { comida: { title: 'Lentejas', recipes: [] }, cena: { title: 'Crema', recipes: [] } } },
        { day: 'martes', meals: { comida: { title: 'Pollo', recipes: [] }, cena: { title: 'Tortilla', recipes: [] } } },
      ],
    },
  })!

  it('junto a cada plato hay «Cambiar este plato con Pepa» y se manda el día y la comida de ESE plato (scope dish)', async () => {
    ed.requestRevision.mockResolvedValue(
      toReviseProposal({
        revision_id: 'rv3',
        notes: 'Cambié la cena del martes',
        before: { title: 'Menú', body: 'Texto', payload: { menu: { days: [{ day: 'lunes', meals: { comida: { title: 'Lentejas' }, cena: { title: 'Crema' } } }, { day: 'martes', meals: { comida: { title: 'Pollo' }, cena: { title: 'Tortilla' } } }] } } },
        result: { title: 'Menú', body: 'Texto', payload: { menu: { days: [{ day: 'lunes', meals: { comida: { title: 'Lentejas' }, cena: { title: 'Crema' } } }, { day: 'martes', meals: { comida: { title: 'Pollo' }, cena: { title: 'Merluza' } } }] } } },
        quality: [{ code: 'Q', severity: 'warning', message: 'Pescado y pollo seguidos', day: '1', meal: 'cena' }],
      }),
    )
    mount(<MenuReview detail={detail} revise={{ itemId: 'm1', onClose: vi.fn(), onChanged: vi.fn() }} />)
    const buttons = screen.getAllByRole('button', { name: /^Cambiar este plato con Pepa/ })
    expect(buttons).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: /Cambiar este plato con Pepa: martes, cena, Tortilla/ }))
    fireEvent.change(screen.getByLabelText('¿Qué quieres cambiar?'), { target: { value: 'Cámbialo por pescado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pedir una nueva versión' }))
    await screen.findByText(/Platos que cambian/)
    expect(ed.requestRevision).toHaveBeenCalledWith('m1', 'Cámbialo por pescado', { day: 1, meal: 'cena' })
    expect(screen.getByText('Tortilla').tagName).toBe('DEL')
    expect(screen.getByText('Merluza').tagName).toBe('INS')
    expect(screen.getByText(/Pescado y pollo seguidos/)).toBeTruthy()
    // Solo cambia ese plato.
    expect(screen.queryByText('Lentejas', { selector: 'ins,del' })).toBeNull()
  })

  it('«Pedir cambios generales del menú» manda el ámbito general (scope item, sin destino)', async () => {
    ed.requestRevision.mockRejectedValue(new EditorialCallError('ai_failed', 'Pepa no ha podido preparar la nueva versión.'))
    mount(<MenuReview detail={detail} revise={{ itemId: 'm1', onClose: vi.fn(), onChanged: vi.fn() }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Pedir cambios generales del menú' }))
    fireEvent.change(screen.getByLabelText('¿Qué quieres cambiar?'), { target: { value: 'Hazlo más barato' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pedir una nueva versión' }))
    await screen.findByRole('alert')
    expect(ed.requestRevision).toHaveBeenCalledWith('m1', 'Hazlo más barato', undefined)
  })

  it('sin la opción de rectificar (menú publicado) no hay botones de cambio', () => {
    mount(<MenuReview detail={detail} />)
    expect(screen.queryByRole('button', { name: /Cambiar este plato/ })).toBeNull()
  })
})
