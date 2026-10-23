// @vitest-environment jsdom
// Los destinos de la Ayuda contra las PANTALLAS REALES (Cocina, Compras, Familia, Configuración), con los datos simulados: pedir un destino abre de verdad esa vista interna y la
// pantalla pinta su marca de llegada. Es la regresión del fallo «Llévame abre la portada de La cocina de Pepa pero no el Menú semanal».
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/domain/types'

const empty = () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, neq: empty, or: empty, not: empty })
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'auth') return { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }
        if (prop === 'channel') return () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) })
        if (prop === 'removeChannel') return () => undefined
        if (prop === 'rpc') return () => empty()
        return () => empty()
      },
    },
  ),
}))
vi.mock('@/services/voice', async (orig) => ({ ...(await orig<typeof import('@/services/voice')>()), isSpeechSupported: () => false, isDictationSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const dest = await import('@/help/destinations')

afterEach(() => {
  cleanup()
  dest.clearDestination()
})

const PROFILE = { id: 'p1', familyId: 'f1', role: 'admin', displayName: 'Ana', allowedSections: null } as unknown as Profile

async function reach(screen: React.ReactNode, id: string, path: string) {
  render(<MemoryRouter initialEntries={[path]}>{screen}</MemoryRouter>)
  act(() => void dest.requestDestination(id))
  await waitFor(() => expect(dest.findDestination(id), id).not.toBeNull(), { timeout: 10000 })
}

describe('destinos en las pantallas reales', () => {
  it('Cocina: Menú semanal, Recetas y ¿Qué cocino hoy? se abren por su nombre (no solo la portada)', async () => {
    const { AlimentacionScreen } = await import('@/ui/AlimentacionScreen')
    for (const id of ['cocina.menu', 'cocina.recetas', 'cocina.cocinar']) {
      await reach(<AlimentacionScreen />, id, '/alimentacion')
      cleanup()
      dest.clearDestination()
    }
  }, 30000)

  it('Compras: la pestaña Lista (donde está «+ Añadir producto»), Tickets e Historial', async () => {
    const { ShoppingScreen } = await import('@/ui/ShoppingScreen')
    for (const id of ['compras.lista', 'compras.tickets', 'compras.historial']) {
      await reach(<ShoppingScreen />, id, '/compras')
      cleanup()
      dest.clearDestination()
    }
  }, 30000)

  it('Familia: el botón «+ Añadir miembro» (solo administración) se alcanza y lleva su marca', async () => {
    const { FamilyScreen } = await import('@/ui/FamilyScreen')
    await reach(<FamilyScreen profile={PROFILE} />, 'familia.anadir-miembro', '/familia')
    expect(document.querySelector('[data-help-dest="familia.anadir-miembro"]')).toBeTruthy()
  })

  it('Familia con una cuenta que NO es administradora: el destino no existe (no se finge) y la espera termina', async () => {
    const { FamilyScreen } = await import('@/ui/FamilyScreen')
    render(
      <MemoryRouter initialEntries={['/familia']}>
        <FamilyScreen profile={{ ...PROFILE, role: 'adult' }} />
      </MemoryRouter>,
    )
    act(() => void dest.requestDestination('familia.anadir-miembro'))
    await expect(dest.waitForDestination('familia.anadir-miembro', 700)).resolves.toBe('timeout')
  })

  it('Configuración: abre el tema pedido (Pepa, Avisos, Seguridad, Mi cuenta)', async () => {
    const { MenuSettingsScreen } = await import('@/ui/MenuSettingsScreen')
    for (const id of ['config.pepa', 'config.avisos', 'config.seguridad', 'config.cuenta']) {
      await reach(<MenuSettingsScreen profile={PROFILE} />, id, '/menu-organizar')
      expect(document.querySelector('[data-settings-open="true"]')).toBeTruthy()
      cleanup()
      dest.clearDestination()
    }
  }, 30000)
})
