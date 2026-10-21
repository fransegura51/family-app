// «Cerrar sesión» cierra SOLO el dispositivo desde el que se pulsa (decisión 20/10/2026). Se comprueba con la librería de Supabase REAL instalada (no con un simulacro de ella): un cliente
// con almacenamiento en memoria y un «servidor» falso que apunta qué se le pide. Así se ve que:
//  · scope 'local': pide al servidor cerrar SOLO esta sesión y deja vacío el almacenamiento del dispositivo (credenciales y estado de sesión);
//  · signOut() sin alcance (como estaba) es «global»: cierra las de todos los dispositivos. Por eso la tarjeta usa 'local'.
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

function fakeJwt(sub: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, aud: 'authenticated', role: 'authenticated', email: 'prueba@example.invalid', exp: Math.floor(Date.now() / 1000) + 3600 })}.${Buffer.from('firma-de-prueba').toString('base64url')}`
}

function setup() {
  const store = new Map<string, string>()
  const calls: string[] = []
  const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'prueba@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}${new URL(url).search}`)
    if (url.includes('/auth/v1/user')) return new Response(JSON.stringify(user), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 })
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const client = createClient('https://ejemplo.supabase.test', 'anon-key', {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
    },
    global: { fetch: fakeFetch },
    // Node 20 (el que usa la comprobación automática de GitHub) no trae WebSocket de serie y el cliente de Supabase lo pide al crearse: se le da uno de mentira (nunca se conecta).
    realtime: { transport: class FakeWebSocket {} as never },
  })
  return { client, store, calls }
}

async function signedIn() {
  const s = setup()
  const { error } = await s.client.auth.setSession({ access_token: fakeJwt('u1'), refresh_token: 'refresh-1' })
  expect(error).toBeNull()
  expect([...s.store.keys()].some((k) => k.includes('auth-token'))).toBe(true) // la sesión está guardada en el dispositivo
  s.calls.length = 0
  return s
}

describe('Cerrar sesión: alcance local', () => {
  it("signOut({ scope: 'local' }) pide al servidor cerrar solo esta sesión y limpia las credenciales de este dispositivo", async () => {
    const { client, store, calls } = await signedIn()
    const { error } = await client.auth.signOut({ scope: 'local' })
    expect(error).toBeNull()
    expect(calls.some((c) => c.startsWith('POST /auth/v1/logout') && c.includes('scope=local'))).toBe(true)
    expect(calls.some((c) => c.includes('scope=global') || c.includes('scope=others'))).toBe(false)
    expect([...store.keys()].filter((k) => k.includes('auth-token'))).toEqual([]) // ni sesión, ni tokens guardados
    expect((await client.auth.getSession()).data.session).toBeNull()
  })
  it('cerrar sesión no deja el usuario en caché: getSession devuelve null y no se vuelve a pedir nada con el token antiguo', async () => {
    const { client, calls } = await signedIn()
    await client.auth.signOut({ scope: 'local' })
    calls.length = 0
    expect((await client.auth.getUser()).data.user).toBeNull()
    expect(calls.filter((c) => c.includes('/auth/v1/user'))).toEqual([]) // sin sesión no se llama al servidor con ningún token
  })
  it('como estaba (signOut() sin alcance) el cierre es GLOBAL: cierra las sesiones de todos los dispositivos — por eso se cambió', async () => {
    const { client, calls } = await signedIn()
    await client.auth.signOut()
    expect(calls.some((c) => c.startsWith('POST /auth/v1/logout') && c.includes('scope=global'))).toBe(true)
  })
  it("cerrar las demás (scope 'others') deja ESTA sesión abierta: no se usa en la tarjeta de «Cerrar sesión»", async () => {
    const { client, store, calls } = await signedIn()
    await client.auth.signOut({ scope: 'others' })
    expect(calls.some((c) => c.includes('scope=others'))).toBe(true)
    expect([...store.keys()].some((k) => k.includes('auth-token'))).toBe(true)
  })
})
