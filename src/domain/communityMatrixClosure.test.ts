// Comunidad PEPA — cierre de la matriz de cumplimiento (15/10/2026): subtipos opcionales de Anécdota (CMN-§4.8), memoria del estado de acceso para no llamar a
// Supabase de más (INC-17) y permiso para pedir el resumen de Pepa (INC-21). Lógica pura: sin red ni pantalla.
import { describe, expect, it, vi } from 'vitest'
import { ANECDOTE_TYPES, anecdoteTypeTag, parseAnecdoteType, type CommunityStatus, type Draft } from '@/domain/community'
import { canRequestSummary } from '@/domain/communityComments'
import {
  anecdoteTypeForServer,
  draftToForm,
  emptyForm,
  isFormDirty,
  validateForPublish,
  withAnecdoteType,
  withKind,
  type PostForm,
} from '@/domain/communityPostForm'
import { COMMUNITY_STATUS_TTL_MS, createCommunityStatusCache } from '@/domain/communityStatusCache'

const topics = [{ id: 'ahorro', section: 'hogar' as const, label: 'Ahorro' }]
const anecdote = (over: Partial<PostForm> = {}): PostForm => ({ ...emptyForm('anecdota', 'hogar'), topicId: 'ahorro', title: 'Mi historia', body: 'Fue así', ...over })

describe('subtipos opcionales de la Anécdota (CMN-§4.8)', () => {
  it('hay exactamente tres: graciosa, bonita y emotiva; cualquier otra cosa no es un subtipo', () => {
    expect(ANECDOTE_TYPES.map((t) => t.id)).toEqual(['graciosa', 'bonita', 'emotiva'])
    expect(parseAnecdoteType('emotiva')).toBe('emotiva')
    for (const bad of ['triste', '', null, undefined, 3, 'GRACIOSA']) expect(parseAnecdoteType(bad)).toBeNull()
  })

  it('la etiqueta solo existe en las anécdotas con subtipo', () => {
    expect(anecdoteTypeTag('anecdota', 'graciosa')).toBe('😂 Graciosa')
    expect(anecdoteTypeTag('anecdota', null)).toBeNull()
    expect(anecdoteTypeTag('anecdota', undefined)).toBeNull()
    expect(anecdoteTypeTag('consejo', 'graciosa')).toBeNull()
    expect(anecdoteTypeTag('pregunta', 'bonita')).toBeNull()
  })

  it('el subtipo es opcional: una anécdota sin subtipo se puede publicar igual', () => {
    expect(validateForPublish(anecdote(), topics)).toEqual({})
    expect(validateForPublish(anecdote({ anecdoteType: 'bonita' }), topics)).toEqual({})
  })

  it('solo viaja al servidor con el tipo Anécdota', () => {
    expect(anecdoteTypeForServer(anecdote({ anecdoteType: 'emotiva' }))).toBe('emotiva')
    expect(anecdoteTypeForServer(anecdote())).toBeNull()
    expect(anecdoteTypeForServer({ ...emptyForm('consejo', 'hogar'), anecdoteType: 'emotiva' })).toBeNull()
  })

  it('elegirlo solo funciona en una anécdota; al cambiar de tipo se quita', () => {
    expect(withAnecdoteType(anecdote(), 'graciosa').anecdoteType).toBe('graciosa')
    expect(withAnecdoteType(anecdote({ anecdoteType: 'graciosa' }), null).anecdoteType).toBeNull()
    const consejo = emptyForm('consejo', 'hogar')
    expect(withAnecdoteType(consejo, 'graciosa')).toBe(consejo)
    expect(withKind(anecdote({ anecdoteType: 'graciosa' }), 'consejo').anecdoteType).toBeNull()
  })

  it('cambiar el subtipo cuenta como cambio sin guardar; en un consejo no cuenta', () => {
    const base = anecdote()
    expect(isFormDirty(withAnecdoteType(base, 'bonita'), base)).toBe(true)
    expect(isFormDirty(base, base)).toBe(false)
    const c1 = emptyForm('consejo', 'hogar')
    expect(isFormDirty({ ...c1, anecdoteType: 'bonita' }, c1)).toBe(false)
  })

  it('un borrador recupera su subtipo (y lo ignora si no es anécdota o es raro)', () => {
    const d = (over: Partial<Draft>): Draft => ({
      id: 'd1',
      kind: 'anecdota',
      title: 'T',
      savedAt: '2026-10-15T10:00:00Z',
      daysLeft: 30,
      section: 'hogar',
      topicId: 'ahorro',
      body: 'x',
      photos: [],
      recipe: null,
      ...over,
    })
    expect(draftToForm(d({ anecdoteType: 'emotiva' })).anecdoteType).toBe('emotiva')
    expect(draftToForm(d({})).anecdoteType).toBeNull()
    expect(draftToForm(d({ kind: 'consejo', anecdoteType: 'emotiva' })).anecdoteType).toBeNull()
    expect(draftToForm(d({ anecdoteType: 'rara' as never })).anecdoteType).toBeNull()
  })
})

const status = (visible: boolean): CommunityStatus => ({ launched: visible, visible, isAdmin: false })

describe('memoria del estado de acceso a Comunidad (INC-17: menos llamadas a Supabase)', () => {
  it('dos pantallas que lo piden a la vez comparten UNA sola consulta', async () => {
    const fetchStatus = vi.fn(async () => status(true))
    const cache = createCommunityStatusCache(fetchStatus)
    const [a, b, c] = await Promise.all([cache.get(), cache.get(), cache.get()])
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    expect([a.visible, b.visible, c.visible]).toEqual([true, true, true])
  })

  it('dentro del plazo se reutiliza; pasado el plazo se vuelve a preguntar', async () => {
    let t = 1_000_000
    const fetchStatus = vi.fn(async () => status(true))
    const cache = createCommunityStatusCache(fetchStatus, () => t)
    await cache.get()
    t += COMMUNITY_STATUS_TTL_MS - 1
    await cache.get()
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    expect(cache.peek()?.visible).toBe(true)
    t += 2
    expect(cache.peek()).toBeNull()
    await cache.get()
    expect(fetchStatus).toHaveBeenCalledTimes(2)
  })

  it('un fallo (sin red) NO se guarda: la próxima vez se vuelve a intentar', async () => {
    const fetchStatus = vi.fn<() => Promise<CommunityStatus>>().mockRejectedValueOnce(new Error('sin red')).mockResolvedValue(status(false))
    const cache = createCommunityStatusCache(fetchStatus)
    await expect(cache.get()).rejects.toThrow('sin red')
    expect(cache.peek()).toBeNull()
    await expect(cache.get()).resolves.toMatchObject({ visible: false })
    expect(fetchStatus).toHaveBeenCalledTimes(2)
  })

  it('Comunidad puede alimentar la memoria sin una consulta extra, y «fresh» fuerza una consulta', async () => {
    const fetchStatus = vi.fn(async () => status(false))
    const cache = createCommunityStatusCache(fetchStatus)
    cache.prime(status(true))
    expect((await cache.get()).visible).toBe(true)
    expect(fetchStatus).not.toHaveBeenCalled()
    expect((await cache.get({ fresh: true })).visible).toBe(false)
    expect(fetchStatus).toHaveBeenCalledTimes(1)
  })

  it('al cambiar de persona (clear) se olvida todo, incluida una consulta que estaba en vuelo', async () => {
    let release: (s: CommunityStatus) => void = () => undefined
    const fetchStatus = vi.fn(() => new Promise<CommunityStatus>((resolve) => (release = resolve)))
    const cache = createCommunityStatusCache(fetchStatus)
    const pending = cache.get()
    cache.clear()
    release(status(true)) // la respuesta de la persona anterior llega tarde
    await pending
    expect(cache.peek()).toBeNull() // no queda guardada para la persona nueva
    cache.prime(status(false))
    cache.clear()
    expect(cache.peek()).toBeNull()
  })
})

describe('quién puede pedir el resumen de Pepa (INC-21)', () => {
  const alias = { hasProfile: true, banState: 'ok' as const }
  it('solo con permiso de participar, alias y sin expulsión', () => {
    expect(canRequestSummary('participate', alias)).toBe(true)
    expect(canRequestSummary('participate', { hasProfile: true })).toBe(true)
  })
  it('un lector (solo lectura) o sin acceso NO provoca la llamada', () => {
    expect(canRequestSummary('read', alias)).toBe(false)
    expect(canRequestSummary('none', alias)).toBe(false)
  })
  it('sin alias, expulsada o mientras aún se está cargando, tampoco', () => {
    expect(canRequestSummary('participate', { hasProfile: false })).toBe(false)
    expect(canRequestSummary('participate', null)).toBe(false)
    expect(canRequestSummary('participate', undefined)).toBe(false)
    expect(canRequestSummary('participate', { hasProfile: true, banState: 'banned' })).toBe(false)
    expect(canRequestSummary('participate', { hasProfile: true, banState: 'readmission' })).toBe(false)
    expect(canRequestSummary(null, alias)).toBe(false)
    expect(canRequestSummary(undefined, alias)).toBe(false)
  })
})
