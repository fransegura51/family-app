// @vitest-environment jsdom
// La IA de la Ayuda en la interfaz: solo cuentas adultas, solo cuando la búsqueda local no tiene un resultado claro, solo ELIGE entre fichas verificadas (el texto que se ve es
// siempre el de la ficha) y, si falla, la Ayuda sigue con la búsqueda local. Encendida únicamente dentro de estas pruebas (en producción está apagada).
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/domain/types'

const ai = vi.hoisted(() => ({ calls: [] as { query: string; pool: { id: string; title: string }[] }[], reply: null as string[] | null | 'wait', release: null as null | (() => void) }))
vi.mock('@/help/aiClient', () => ({
  rankHelpWithAi: async (query: string, pool: { id: string; title: string }[]) => {
    ai.calls.push({ query, pool })
    if (ai.reply === 'wait') await new Promise<void>((r) => (ai.release = r))
    return ai.reply === 'wait' ? ['cal-crear-evento'] : ai.reply
  },
}))
vi.mock('@/services/voice', () => ({ isSpeechSupported: () => true, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
vi.mock('@/data/communityStatusCache', () => ({ communityStatusCache: { peek: () => ({ visible: true, access: 'participate' }), get: async () => ({ visible: true }), prime: () => undefined, clear: () => undefined } }))

const { HelpProvider } = await import('@/help/ui/HelpProvider')
const { HelpPanel } = await import('@/help/ui/HelpPanel')
const { useHelp } = await import('@/help/ui/helpContext')
const { setHelpAiForTests } = await import('@/help/ai')

const ADULT: Pick<Profile, 'role' | 'allowedSections'> = { role: 'adult', allowedSections: null }
const CHILD: Pick<Profile, 'role' | 'allowedSections'> = { role: 'child', allowedSections: null }

function Opener({ q }: { q: string }) {
  const help = useHelp()
  return (
    <button type="button" onClick={() => help.openHelp({ query: q })}>
      abrir
    </button>
  )
}
const app = (profile: Pick<Profile, 'role' | 'allowedSections'>, q: string) =>
  render(
    <MemoryRouter initialEntries={['/compras']}>
      <HelpProvider profile={profile}>
        <Opener q={q} />
        <HelpPanel />
      </HelpProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  ai.calls.length = 0
  ai.reply = ['cal-crear-evento']
  ai.release = null
  localStorage.clear()
  setHelpAiForTests(true)
})
afterEach(() => {
  setHelpAiForTests(null)
  cleanup()
})

describe('IA de la Ayuda en la interfaz', () => {
  it('si la búsqueda local no tiene un resultado claro, la IA elige una ficha verificada y se enseña SU texto, avisando de que la eligió la IA', async () => {
    app(ADULT, 'quiero meter una reunion de trabajo')
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    await waitFor(() => expect(within(panel).getByRole('heading', { name: 'Crear un evento en el calendario' })).toBeTruthy())
    expect(ai.calls).toHaveLength(1)
    expect(within(panel).getByText(/He elegido esta ficha con ayuda de la IA/)).toBeTruthy()
    expect(within(panel).getByText(/pulsa «\+ Nuevo evento»/)).toBeTruthy() // texto de la ficha, no del modelo
  })

  it('mientras piensa se ve «Pensando…» y la conversación no se bloquea', async () => {
    ai.reply = 'wait'
    app(ADULT, 'quiero meter una reunion de trabajo')
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByText(/Déjame pensarlo un momento/)).toBeTruthy()
    ai.release?.()
    await waitFor(() => expect(within(panel).queryByText(/Déjame pensarlo/)).toBeNull())
  })

  it('a la IA solo viajan fichas que esa persona puede ver (nada de Comunidad si no tiene acceso a ella ya está filtrado por permisos)', async () => {
    app(ADULT, 'quiero meter una reunion de trabajo')
    fireEvent.click(screen.getByText('abrir'))
    await screen.findByRole('complementary')
    await waitFor(() => expect(ai.calls).toHaveLength(1))
    const ids = ai.calls[0].pool.map((c) => c.id)
    expect(ids).toContain('cal-crear-evento')
    expect(ids.length).toBeGreaterThan(50)
    for (const c of ai.calls[0].pool) expect(Object.keys(c).sort()).toEqual(['id', 'title'])
  })

  it('si la IA no elige nada o falla, se queda la respuesta local (la Ayuda nunca depende de la IA)', async () => {
    ai.reply = null
    app(ADULT, 'cotizacion del bitcoin')
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    await waitFor(() => expect(within(panel).getByText(/No he encontrado nada sobre eso/)).toBeTruthy())
    expect(within(panel).queryByText(/He elegido esta ficha con ayuda de la IA/)).toBeNull()
  })

  it('si la IA devuelve una lista vacía también se queda lo local', async () => {
    ai.reply = []
    app(ADULT, 'cotizacion del bitcoin')
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    await waitFor(() => expect(within(panel).getByText(/No he encontrado nada sobre eso/)).toBeTruthy())
  })

  it('una cuenta no adulta (niño/a) NUNCA llama a la IA: solo búsqueda local', async () => {
    app(CHILD, 'quiero meter una reunion de trabajo')
    fireEvent.click(screen.getByText('abrir'))
    await screen.findByRole('complementary')
    expect(ai.calls).toHaveLength(0)
  })

  it('con un resultado local CLARO no se llama a la IA (ahorro de consumo)', async () => {
    app(ADULT, 'como cambio la contraseña')
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    expect(within(panel).getByRole('heading', { name: 'Cambiar mi correo o mi contraseña' })).toBeTruthy()
    expect(ai.calls).toHaveLength(0)
  })

  it('con el interruptor apagado (producción hoy) no se llama nunca a la IA', async () => {
    setHelpAiForTests(false)
    app(ADULT, 'quiero meter una reunion de trabajo')
    fireEvent.click(screen.getByText('abrir'))
    await screen.findByRole('complementary')
    expect(ai.calls).toHaveLength(0)
  })

  it('si la IA elige una ficha restringida para esa persona, se explica la restricción (sin botones)', async () => {
    ai.reply = ['fam-anadir-miembro']
    app({ role: 'adult', allowedSections: null }, 'dar de alta a un nuevo integrante de mi hogar')
    fireEvent.click(screen.getByText('abrir'))
    const panel = await screen.findByRole('complementary')
    await waitFor(() => expect(within(panel).getByRole('heading', { name: 'Añadir un miembro a la familia' })).toBeTruthy())
    expect(within(panel).getByText(/solo lo puede hacer la administración de tu familia/i)).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Llévame' })).toBeNull()
  })
})
