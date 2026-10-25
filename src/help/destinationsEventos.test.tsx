// @vitest-environment jsdom
// Destino «eventos.lista» contra la pantalla REAL de Eventos: los capítulos de Eventos empiezan siempre desde la lista de eventos (sin evento ni módulo abierto) y la Ayuda espera a la marca
// de llegada, que la pantalla pinta cuando la lista ya está cargada.
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('destino de Eventos', () => {
  it('«eventos.lista» se alcanza en la pantalla real de Eventos (la lista cargada pinta su marca y el botón «+ Nuevo evento»)', async () => {
    const { EventosScreen } = await import('@/ui/EventosScreen')
    render(
      <MemoryRouter initialEntries={['/eventos']}>
        <EventosScreen />
      </MemoryRouter>,
    )
    act(() => void dest.requestDestination('eventos.lista'))
    await waitFor(() => expect(dest.findDestination('eventos.lista')).not.toBeNull(), { timeout: 10000 })
    expect(document.querySelector('[data-help-id="eventos.new-event"]')).toBeTruthy()
  }, 30000)
})
