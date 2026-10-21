// «¿Sigue existiendo mi cuenta?» y «salir de este dispositivo» (pantalla de bienvenida). Con la librería de Supabase simulada solo en su respuesta.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const signOut = vi.fn(async (_options?: unknown) => ({ error: null }))
vi.mock('@/data/supabaseClient', () => ({ supabase: { auth: { getUser: () => getUser(), signOut: (options?: unknown) => signOut(options) } } }))

import { accountStillExists, signOutThisDevice } from '@/data/session'

beforeEach(() => {
  getUser.mockReset()
  signOut.mockClear()
})

describe('accountStillExists', () => {
  it('con la cuenta viva responde que sí', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    expect(await accountStillExists()).toBe(true)
  })

  it('con la cuenta borrada (el servidor la rechaza) responde que no', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 403, code: 'user_not_found', message: 'User from sub claim in JWT does not exist' } })
    expect(await accountStillExists()).toBe(false)
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401, message: 'invalid JWT' } })
    expect(await accountStillExists()).toBe(false)
  })

  it('sin conexión o con un fallo del servidor NO se da por borrada (no se cierra la sesión de nadie por un fallo de red)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 0, message: 'Failed to fetch' } })
    expect(await accountStillExists()).toBe(true)
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 500, message: 'Internal error' } })
    expect(await accountStillExists()).toBe(true)
  })
})

describe('signOutThisDevice', () => {
  it('cierra SOLO este dispositivo (alcance local)', async () => {
    await signOutThisDevice()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
