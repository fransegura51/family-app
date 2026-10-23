// @vitest-environment jsdom
// Sugerencias discretas de la Ayuda: la bienvenida solo se ofrece a cuentas NUEVAS (las marca el alta), una sola vez y sin obligar; el aviso de primera visita a un módulo sale una vez
// por módulo; nada de esto aparece a cuentas anteriores ni mientras hay un tutorial en marcha. Datos simulados: no sustituye la prueba en dispositivos reales.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }) }))
vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const { HelpNudges } = await import('@/help/ui/HelpNudges')
const { HelpUiContext } = await import('@/help/ui/helpContext')
const prefs = await import('@/help/prefs')

function mount(path: string, over: Record<string, unknown> = {}) {
  const startTourById = vi.fn()
  const api = { startTourById, activeTour: null, panelOpen: false, ...over } as never
  render(
    <MemoryRouter initialEntries={[path]}>
      <HelpUiContext.Provider value={api}>
        <HelpNudges />
      </HelpUiContext.Provider>
    </MemoryRouter>,
  )
  return { startTourById }
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('semántica de la bienvenida', () => {
  it('una cuenta anterior (sin valor) no tiene bienvenida pendiente', () => {
    expect(prefs.getWelcomeState()).toBeNull()
  })
  it('el alta la deja pendiente una vez y nunca pisa un «hecho» ni un «omitido»', () => {
    prefs.offerWelcomeToNewAccount()
    expect(prefs.getWelcomeState()).toBe('pending')
    prefs.setWelcomeState('skipped')
    prefs.offerWelcomeToNewAccount()
    expect(prefs.getWelcomeState()).toBe('skipped')
  })
})

describe('invitación de bienvenida', () => {
  it('no sale a una cuenta anterior', () => {
    mount('/')
    expect(screen.queryByText(/¿Te enseño PEPA/)).toBeNull()
  })

  it('sale en Inicio a una cuenta nueva y «Sí, enséñame» arranca el recorrido', () => {
    prefs.offerWelcomeToNewAccount()
    const { startTourById } = mount('/')
    expect(screen.getByText(/¿Te enseño PEPA en 1 o 2 minutos\?/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, enséñame' }))
    expect(startTourById).toHaveBeenCalledWith('bienvenida')
  })

  it('«Ahora no» la omite para siempre y desaparece', () => {
    prefs.offerWelcomeToNewAccount()
    mount('/')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    })
    expect(prefs.getWelcomeState()).toBe('skipped')
    expect(screen.queryByText(/¿Te enseño PEPA/)).toBeNull()
  })

  it('no sale fuera de Inicio ni con un tutorial en marcha ni con el panel de Pepa abierto', () => {
    prefs.offerWelcomeToNewAccount()
    mount('/calendario')
    expect(screen.queryByText(/¿Te enseño PEPA/)).toBeNull()
    cleanup()
    mount('/', { activeTour: 'cal-crear-evento' })
    expect(screen.queryByText(/¿Te enseño PEPA/)).toBeNull()
    cleanup()
    mount('/', { panelOpen: true })
    expect(screen.queryByText(/¿Te enseño PEPA/)).toBeNull()
  })
})

describe('aviso de primera visita a un módulo', () => {
  it('sale una sola vez por módulo a una cuenta nueva', () => {
    prefs.offerWelcomeToNewAccount()
    mount('/calendario')
    expect(screen.getByText(/¿Primera vez en/)).toBeTruthy()
    expect(prefs.hasSeenModuleHint('calendario')).toBe(true)
    cleanup()
    mount('/calendario')
    expect(screen.queryByText(/¿Primera vez en/)).toBeNull()
  })

  it('no sale a una cuenta anterior', () => {
    mount('/calendario')
    expect(screen.queryByText(/¿Primera vez en/)).toBeNull()
    expect(prefs.hasSeenModuleHint('calendario')).toBe(false)
  })

  it('se puede cerrar con la ✕', () => {
    prefs.offerWelcomeToNewAccount()
    mount('/compras')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la sugerencia' }))
    expect(screen.queryByText(/¿Primera vez en/)).toBeNull()
  })
})
