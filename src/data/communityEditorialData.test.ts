// Capa de datos del programa editorial: llamadas RPC con los nombres y argumentos exactos, y la función de servidor `community-editorial` (fetch simulado).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sb = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc: sb.rpc, auth: { getSession: sb.getSession } } }))

import {
  EditorialCallError,
  decideRevision,
  generateNow,
  getEditorialStatus,
  listEditorialItems,
  listEditorialRevisions,
  listEditorialRuns,
  listItemVersions,
  requestRevision,
  restoreItemVersion,
  scheduleItem,
  setEditorialToggle,
  setMenuAutopublish,
} from '@/data/communityEditorial'

const fetchMock = vi.fn()
const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

beforeEach(() => {
  sb.rpc.mockReset()
  sb.getSession.mockReset()
  fetchMock.mockReset()
  sb.getSession.mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('RPC de administración', () => {
  it('estado del programa: llama a la RPC y lo lee en camelCase', async () => {
    sb.rpc.mockResolvedValue({
      data: { launched: true, cycle: { run_at: '2026-10-28T07:00:00Z', due: false, monday: '2026-10-26' }, kinds: { articles: { enabled: true, week_start: '2026-11-02', next_run: '2026-11-04T07:00:00Z', due_now: false, drafts: { proposed: 2, in_target_week: 3 } } }, menu_autopublish: false, ai: { enabled: true, daily_cap: 300, used_today: 4 }, errors: [] },
      error: null,
    })
    const s = await getEditorialStatus()
    expect(sb.rpc).toHaveBeenCalledWith('community_admin_editorial_status', {})
    expect(s.kinds.articles.enabled).toBe(true)
    expect(s.kinds.articles.drafts.inTargetWeek).toBe(3)
    expect(s.ai.dailyCap).toBe(300)
    expect(s.menuAutopublish).toBe(false)
  })
  it('el interruptor de la encuesta usa «polls» y manda el booleano pedido', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null })
    await setEditorialToggle('polls', true)
    await setEditorialToggle('articles', false)
    await setEditorialToggle('menu', true)
    expect(sb.rpc).toHaveBeenNthCalledWith(1, 'community_admin_set_editorial_toggle', { p_kind: 'polls', p_enabled: true })
    expect(sb.rpc).toHaveBeenNthCalledWith(2, 'community_admin_set_editorial_toggle', { p_kind: 'articles', p_enabled: false })
    expect(sb.rpc).toHaveBeenNthCalledWith(3, 'community_admin_set_editorial_toggle', { p_kind: 'menu', p_enabled: true })
  })
  it('la publicación del menú aprobado a su hora tiene su propia RPC', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null })
    await setMenuAutopublish(true)
    expect(sb.rpc).toHaveBeenCalledWith('community_admin_set_menu_autopublish', { p_enabled: true })
  })
  it('un fallo del servidor se convierte en una frase en español', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'NOT_ADMIN' } })
    await expect(setEditorialToggle('menu', true)).rejects.toThrow('solo para la administración')
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'STALE' } })
    await expect(decideRevision('r1', true)).rejects.toThrow('ya no vale')
  })
  it('listas: historial de ejecuciones, programa, propuestas y versiones', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [{ id: 'r1', kind: 'menu', trigger: 'manual', week_start: '2026-11-02', status: 'ok', started_at: '2026-10-28T07:00:00Z', items_created: 1, items_expected: 1, attempt: 1 }], error: null })
    const runs = await listEditorialRuns(10)
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_editorial_runs', { p_limit: 10 })
    expect(runs[0]).toMatchObject({ id: 'r1', kind: 'menu', trigger: 'manual', itemsCreated: 1 })

    sb.rpc.mockResolvedValueOnce({ data: [{ id: 'a1', kind: 'article', title: 'T', status: 'proposed', version: 1, slot_date: '2026-11-02', topic_label: 'Ahorro', tier: 2 }], error: null })
    const items = await listEditorialItems('2026-11-02')
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_editorial_items', { p_week: '2026-11-02' })
    expect(items[0]).toMatchObject({ id: 'a1', slotDate: '2026-11-02', topicLabel: 'Ahorro', tier: 2 })

    sb.rpc.mockResolvedValueOnce({ data: [], error: null })
    await listEditorialItems()
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_editorial_items', { p_week: null })

    sb.rpc.mockResolvedValueOnce({ data: [{ id: 'rv', item_id: 'a1', base_version: 2, scope: 'dish', instruction: 'x', status: 'proposed', before: { title: 'A' }, result: { title: 'B' }, notes: 'n' }], error: null })
    const revs = await listEditorialRevisions('a1')
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_editorial_revisions', { p_item: 'a1' })
    expect(revs[0]).toMatchObject({ id: 'rv', scope: 'dish', baseVersion: 2 })

    sb.rpc.mockResolvedValueOnce({ data: [{ version: 3, title: 'T3', body: 'b', edited_at: '2026-10-28T07:00:00Z' }, { version: 1, title: 'T1', body: 'a' }], error: null })
    const vers = await listItemVersions('a1')
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_item_versions', { p_item: 'a1' })
    expect(vers.map((v) => v.version)).toEqual([3, 1])
  })
  it('aceptar o rechazar una rectificación, restaurar una versión y reprogramar', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { accepted: true, version: 4 }, error: null })
    expect(await decideRevision('rv1', true)).toEqual({ accepted: true, version: 4 })
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_editorial_decide_revision', { p_revision: 'rv1', p_accept: true })
    sb.rpc.mockResolvedValueOnce({ data: { accepted: false }, error: null })
    expect(await decideRevision('rv1', false)).toEqual({ accepted: false, version: null })
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_editorial_decide_revision', { p_revision: 'rv1', p_accept: false })
    sb.rpc.mockResolvedValueOnce({ data: 7, error: null })
    expect(await restoreItemVersion('a1', 2)).toBe(7)
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_restore_item_version', { p_item: 'a1', p_version: 2 })
    sb.rpc.mockResolvedValueOnce({ data: null, error: null })
    await scheduleItem('a1', '2026-11-03T09:00:00.000Z')
    expect(sb.rpc).toHaveBeenLastCalledWith('community_admin_schedule_item', { p_id: 'a1', p_publish_at: '2026-11-03T09:00:00.000Z' })
  })
})

describe('función de servidor community-editorial', () => {
  it('«Generar ahora»: POST con la sesión, la clave pública y el cuerpo exacto', async () => {
    fetchMock.mockImplementation(() => reply(200, { ok: true, run_id: 'r1', status: 'ok', created: 7, expected: 7, item_ids: ['a'], errors: [] }))
    const r = await generateNow('articles')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.supabase.co/functions/v1/community-editorial')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok-123', apikey: 'anon-key', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({ action: 'generate', kind: 'articles' })
    expect(r).toMatchObject({ runId: 'r1', status: 'ok', created: 7, expected: 7 })
    await generateNow('poll', '2026-11-02')
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)).toEqual({ action: 'generate', kind: 'poll', week: '2026-11-02' })
  })
  it('sin sesión no llama a la función', async () => {
    sb.getSession.mockResolvedValue({ data: { session: null } })
    await expect(generateNow('menu')).rejects.toMatchObject({ code: 'unauthorized' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('cada error de la función se traduce a español claro', async () => {
    const cases: [number, string, string][] = [
      [401, 'unauthorized', 'sesión'],
      [403, 'not_admin', 'administración'],
      [409, 'busy', 'en curso'],
      [400, 'bad_request', 'petición'],
      [403, 'ai_not_allowed', 'IA'],
      [500, 'internal_error', 'Algo ha fallado'],
    ]
    for (const [status, error, snippet] of cases) {
      fetchMock.mockReturnValueOnce(reply(status, { ok: false, error }))
      const err = await generateNow('articles').catch((e: unknown) => e)
      expect(err).toBeInstanceOf(EditorialCallError)
      expect((err as EditorialCallError).code).toBe(error)
      expect((err as EditorialCallError).message).toContain(snippet)
      expect((err as EditorialCallError).message).not.toMatch(/[a-z]+_[a-z]+/)
    }
  })
  it('una respuesta que no es JSON (p. ej. 504) o un corte de red se explican sin texto técnico', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response('upstream timeout', { status: 504 })))
    const t = (await generateNow("menu").catch((e: unknown) => e)) as EditorialCallError
    expect(t.code).toBe('timeout')
    expect(t.message).toContain('tardando más de lo normal')
    fetchMock.mockReturnValueOnce(Promise.reject(new TypeError('Failed to fetch')))
    const n = (await generateNow("menu").catch((e: unknown) => e)) as EditorialCallError
    expect(n.code).toBe('network')
    expect(n.message).not.toContain('Failed to fetch')
  })
  it('rectificar: manda item, instrucción y ámbito; un plato lleva su destino', async () => {
    const ok = { ok: true, revision_id: 'rv1', notes: 'Cambié el plato', before: { title: 'M', body: 'a', payload: {} }, result: { title: 'M', body: 'b', payload: {} }, quality: [] }
    fetchMock.mockReturnValueOnce(reply(200, ok))
    const r = await requestRevision('item-1', '  Cámbialo por pescado  ', { day: 2, meal: 'cena' })
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({ action: 'revise', item_id: 'item-1', instruction: 'Cámbialo por pescado', scope: 'dish', target: { day: 2, meal: 'cena' } })
    expect(r.revisionId).toBe('rv1')
    expect(r.notes).toBe('Cambié el plato')
    fetchMock.mockReturnValueOnce(reply(200, ok))
    await requestRevision('item-1', 'Hazlo más cercano')
    expect(JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string)).toEqual({ action: 'revise', item_id: 'item-1', instruction: 'Hazlo más cercano', scope: 'item' })
  })
  it('rectificar: los errores de IA se traducen y recuerdan que no se ha cambiado nada', async () => {
    for (const error of ['ai_failed', 'invalid_output', 'rate_limit', 'not_available', 'ai_not_allowed']) {
      fetchMock.mockReturnValueOnce(reply(422, { ok: false, error }))
      const err = (await requestRevision('i', 'algo').catch((e: unknown) => e)) as EditorialCallError
      expect(err.code).toBe(error)
      expect(err.message).not.toMatch(/[a-z]+_[a-z]+/)
    }
  })
})
