// Memoria corta de «¿quién eres?» y «¿de qué familia?» (rendimiento: antes se repetían ANTES de cada operación). Se prueba el módulo puro.
import { describe, expect, it, vi } from 'vitest'
import { memoizeFamilyFetch, memoizeGetUser } from '@/data/authRequestCache'
import sharedClient from '@/data/supabaseClient.ts?raw'
import shopping from '@/data/shopping.ts?raw'
import talkActions from '@/pepa/actions/talkActions.ts?raw'
import voiceCapture from '@/ui/VoiceCapture.tsx?raw'

type UserResult = { data: { user: { id: string } | null }; error: unknown }
const ok = (id: string): UserResult => ({ data: { user: { id } }, error: null })

describe('memoizeGetUser', () => {
  it('repetir la pregunta con la misma sesión no vuelve a llamar al servidor (durante un minuto)', async () => {
    let t = 1000
    const original = vi.fn().mockResolvedValue(ok('u1'))
    const cache = memoizeGetUser(original, async () => 'token-a', () => t)
    await cache.call()
    await cache.call()
    t += 59_000
    await cache.call()
    expect(original).toHaveBeenCalledTimes(1)
    t += 2_000
    await cache.call()
    expect(original).toHaveBeenCalledTimes(2)
  })

  it('si cambia el token (otra sesión), pregunta de nuevo y no mezcla usuarios', async () => {
    let token = 'token-a'
    const original = vi.fn<() => Promise<UserResult>>().mockResolvedValueOnce(ok('u1')).mockResolvedValueOnce(ok('u2'))
    const cache = memoizeGetUser(original, async () => token)
    expect((await cache.call()).data.user?.id).toBe('u1')
    token = 'token-b'
    expect((await cache.call()).data.user?.id).toBe('u2')
  })

  it('varias llamadas a la vez comparten una sola', async () => {
    const original = vi.fn().mockImplementation(() => new Promise<UserResult>((resolve) => setTimeout(() => resolve(ok('u1')), 10)))
    const cache = memoizeGetUser(original, async () => 'token-a')
    await Promise.all([cache.call(), cache.call(), cache.call()])
    expect(original).toHaveBeenCalledTimes(1)
  })

  it('un error no se recuerda, y sin sesión se hace la consulta de siempre', async () => {
    const original = vi.fn().mockResolvedValueOnce({ data: { user: null }, error: new Error('x') }).mockResolvedValue(ok('u1'))
    const cache = memoizeGetUser(original, async () => 'token-a')
    await cache.call()
    await cache.call()
    expect(original).toHaveBeenCalledTimes(2)
    const noSession = memoizeGetUser(original, async () => null)
    await noSession.call()
    await noSession.call()
    expect(original).toHaveBeenCalledTimes(4)
  })

  it('clear() lo olvida todo', async () => {
    const original = vi.fn().mockResolvedValue(ok('u1'))
    const cache = memoizeGetUser(original, async () => 'token-a')
    await cache.call()
    cache.clear()
    await cache.call()
    expect(original).toHaveBeenCalledTimes(2)
  })
})

const UID = '8019aaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const FAMILY_URL = `https://x.supabase.co/rest/v1/profiles?select=family_id&id=eq.${UID}`
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const auth = (token: string) => ({ headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.pgrst.object+json' } })

describe('memoizeFamilyFetch', () => {
  it('la consulta de familia se repite una sola vez durante 30 s y cada respuesta se puede leer entera', async () => {
    let t = 0
    const base = vi.fn().mockImplementation(async () => jsonResponse({ family_id: 'f1' }))
    const { fetch } = memoizeFamilyFetch(base as unknown as typeof fetch, () => t)
    const a = await fetch(FAMILY_URL, auth('tok'))
    const b = await fetch(FAMILY_URL, auth('tok'))
    expect(await a.json()).toEqual({ family_id: 'f1' })
    expect(await b.json()).toEqual({ family_id: 'f1' })
    expect(base).toHaveBeenCalledTimes(1)
    t += 31_000
    await fetch(FAMILY_URL, auth('tok'))
    expect(base).toHaveBeenCalledTimes(2)
  })

  it('otra sesión (otro token) nunca recibe lo de la anterior', async () => {
    const base = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => jsonResponse({ family_id: String((init?.headers as Record<string, string>).authorization) }))
    const { fetch } = memoizeFamilyFetch(base as unknown as typeof fetch)
    const a = await (await fetch(FAMILY_URL, auth('uno'))).json()
    const b = await (await fetch(FAMILY_URL, auth('dos'))).json()
    expect(a.family_id).toContain('uno')
    expect(b.family_id).toContain('dos')
    expect(base).toHaveBeenCalledTimes(2)
  })

  it('cualquier otra petición pasa sin tocar: otras consultas de profiles, otras tablas y las escrituras', async () => {
    const base = vi.fn().mockImplementation(async () => jsonResponse([]))
    const { fetch } = memoizeFamilyFetch(base as unknown as typeof fetch)
    await fetch(`https://x.supabase.co/rest/v1/profiles?select=family_id,role&id=eq.${UID}`, auth('t'))
    await fetch(`https://x.supabase.co/rest/v1/profiles?select=family_id,role&id=eq.${UID}`, auth('t'))
    await fetch('https://x.supabase.co/rest/v1/shopping_items?select=*', auth('t'))
    await fetch('https://x.supabase.co/rest/v1/shopping_items', { method: 'POST', body: '{}' })
    expect(base).toHaveBeenCalledTimes(4)
  })

  it('las respuestas con error no se recuerdan', async () => {
    const base = vi.fn().mockResolvedValueOnce(jsonResponse({ message: 'x' }, 500)).mockResolvedValue(jsonResponse({ family_id: 'f1' }))
    const { fetch } = memoizeFamilyFetch(base as unknown as typeof fetch)
    expect((await fetch(FAMILY_URL, auth('t'))).status).toBe(500)
    expect((await fetch(FAMILY_URL, auth('t'))).status).toBe(200)
    expect(base).toHaveBeenCalledTimes(2)
  })

  it('si la familia cambia (crear una familia, unirse con un código, editar el perfil) se olvida al momento', async () => {
    const base = vi.fn().mockImplementation(async () => jsonResponse({ family_id: 'f1' }))
    const { fetch } = memoizeFamilyFetch(base as unknown as typeof fetch)
    await fetch(FAMILY_URL, auth('t'))
    await fetch('https://x.supabase.co/rest/v1/rpc/join_family_with_code', { method: 'POST', body: '{}' })
    await fetch(FAMILY_URL, auth('t'))
    expect(base).toHaveBeenCalledTimes(3)
  })

  it('llamadas iguales a la vez comparten una sola', async () => {
    const base = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => setTimeout(() => resolve(jsonResponse({ family_id: 'f1' })), 10)))
    const { fetch } = memoizeFamilyFetch(base as unknown as typeof fetch)
    const results = await Promise.all([fetch(FAMILY_URL, auth('t')), fetch(FAMILY_URL, auth('t')), fetch(FAMILY_URL, auth('t'))])
    for (const r of results) expect(await r.json()).toEqual({ family_id: 'f1' })
    expect(base).toHaveBeenCalledTimes(1)
  })
})

describe('conexión con el cliente y con el guardado de la compra', () => {
  it('el cliente de Supabase usa las dos memorias y las vacía al iniciar o cerrar sesión', () => {
    expect(sharedClient).toContain('memoizeFamilyFetch(')
    expect(sharedClient).toContain('memoizeGetUser(')
    expect(sharedClient).toContain("event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED'")
    expect(sharedClient).toContain('jwt ? originalGetUser(jwt) : userCache.call()')
  })

  it('la compra por voz guarda todos los productos en UNA petición (no uno a uno)', () => {
    expect(shopping).toContain('export async function addShoppingItems(')
    expect(talkActions).toContain('await addShoppingItems(')
    expect(voiceCapture).toContain('await addShoppingItems(')
    expect(talkActions).not.toMatch(/for \(const name of items\)/)
  })
})

describe('el cliente de Supabase arranca bien con las memorias puestas', () => {
  it('instala la memoria en getUser, pasa el fetch con memoria y escucha los cambios de sesión', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    const getUser = vi.fn().mockResolvedValue(ok('u1'))
    const onAuthStateChange = vi.fn()
    let options: { global?: { fetch?: unknown } } = {}
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: (_url: string, _key: string, opts: { global?: { fetch?: unknown } }) => {
        options = opts
        return { auth: { getUser, getSession: async () => ({ data: { session: { access_token: 'tok' } } }), onAuthStateChange } }
      },
    }))
    const { supabase } = await import('@/data/supabaseClient')
    await supabase.auth.getUser()
    await supabase.auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(1)
    await supabase.auth.getUser('un-token-explicito')
    expect(getUser).toHaveBeenCalledTimes(2)
    expect(typeof options.global?.fetch).toBe('function')
    expect(onAuthStateChange).toHaveBeenCalledTimes(1)
    // Al iniciar sesión se olvida lo recordado
    const listener = onAuthStateChange.mock.calls[0][0] as (event: string) => void
    listener('SIGNED_IN')
    await supabase.auth.getUser()
    expect(getUser).toHaveBeenCalledTimes(3)
    vi.doUnmock('@supabase/supabase-js')
    vi.unstubAllEnvs()
  })
})
