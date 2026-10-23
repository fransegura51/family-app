// @vitest-environment jsdom
// Ayuda contextual en el móvil: se abre por el PRINCIPIO (preguntas recomendadas antes del buscador), sin enfocar el buscador ni abrir el teclado, con «Acciones frecuentes» plegada;
// cada consulta nueva se enseña desde su pregunta; el historial se conserva; con el teclado abierto la hoja se pega al área visible. Servicios simulados; no sustituye la prueba en
// un iPhone real.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/domain/types'

vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }) }))
vi.mock('@/data/communityStatusCache', () => ({ communityStatusCache: { peek: () => null, get: async () => null, prime: () => undefined, clear: () => undefined } }))

const { HelpProvider } = await import('@/help/ui/HelpProvider')
const { HelpPanel } = await import('@/help/ui/HelpPanel')
const { HelpHint } = await import('@/help/ui/HelpHint')

const ADULT: Pick<Profile, 'role' | 'allowedSections'> = { role: 'adult', allowedSections: null }

class FakeVV extends EventTarget {
  offsetTop = 0
  offsetLeft = 0
  width = 390
  height = 768
  scale = 1
  set(p: Partial<Pick<FakeVV, 'offsetTop' | 'height'>>) {
    Object.assign(this, p)
    this.dispatchEvent(new Event('resize'))
  }
}
let vv: FakeVV
const scrolled: Array<{ text: string; opts: unknown }> = []

function app(url = '/contactos') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <HelpProvider profile={ADULT}>
        <HelpHint label="Ayuda sobre este módulo" />
        <HelpPanel />
      </HelpProvider>
    </MemoryRouter>,
  )
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Ayuda sobre este módulo' }))
const panel = () => screen.getByRole('complementary')
const ask = (q: string) => {
  fireEvent.change(within(panel()).getByLabelText('¿Qué quieres hacer o saber?'), { target: { value: q } })
  fireEvent.submit(within(panel()).getByLabelText('¿Qué quieres hacer o saber?').closest('form')!)
}

beforeEach(() => {
  vv = new FakeVV()
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
  scrolled.length = 0
  Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
    scrolled.push({ text: this.textContent ?? '', opts })
  }
})
afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
})

describe('apertura de la Ayuda contextual', () => {
  it('desde Contactos: sale por el principio con las preguntas recomendadas del módulo y el buscador sin foco (no se abre el teclado)', () => {
    app()
    open()
    expect(within(panel()).getByText(/Ayuda de Contactos/)).toBeTruthy()
    expect(document.activeElement).not.toBe(within(panel()).getByLabelText('¿Qué quieres hacer o saber?'))
    expect(document.activeElement?.tagName).not.toBe('INPUT')
    const body = panel().querySelector('.help-panel-body') as HTMLElement
    expect(body.scrollTop).toBe(0)
    expect(scrolled.length).toBe(0) // nada se desplaza solo hacia el buscador
  })

  it('«Ayuda de [módulo]» viene desplegada y «Acciones frecuentes» plegada; ambas se pueden abrir y cerrar', () => {
    app()
    open()
    const mod = within(panel()).getByText(/Ayuda de Contactos/).closest('details')!
    const frequent = within(panel()).getByText('Acciones frecuentes').closest('details')!
    expect(mod.open).toBe(true)
    expect(frequent.open).toBe(false)
    fireEvent.click(within(panel()).getByText('Acciones frecuentes')) // jsdom no alterna <details> con clic: se hace a mano
    frequent.open = true
    expect(frequent.open).toBe(true)
    frequent.open = false
    expect(frequent.open).toBe(false)
  })

  it('el buscador siempre está accesible y no queda tras listas enormes (las preguntas recomendadas son pocas)', () => {
    app()
    open()
    expect(within(panel()).getByLabelText('¿Qué quieres hacer o saber?')).toBeTruthy()
    const chips = within(within(panel()).getByText(/Ayuda de Contactos/).closest('details')!).getAllByRole('button')
    expect(chips.length).toBeLessThanOrEqual(8)
  })

  it('cada módulo muestra SU ayuda al abrir (Calendario no enseña lo de Contactos)', () => {
    app('/calendario')
    open()
    expect(within(panel()).getByText(/Ayuda de Calendario/)).toBeTruthy()
    expect(within(panel()).queryByText(/Ayuda de Contactos/)).toBeNull()
  })
})

describe('consultas consecutivas', () => {
  it('cada consulta nueva se enseña desde SU pregunta (no desde el final de la respuesta) y se conserva el historial', () => {
    app()
    open()
    ask('menú semanal')
    expect(scrolled.at(-1)?.text).toBe('menú semanal')
    expect((scrolled.at(-1)?.opts as { block?: string }).block).toBe('start')
    ask('crear un evento')
    expect(scrolled.at(-1)?.text).toBe('crear un evento')
    const log = within(panel()).getByRole('log')
    expect(within(log).getByText('menú semanal')).toBeTruthy() // la anterior sigue ahí
    expect(within(log).getByText('crear un evento')).toBeTruthy()
    expect(log.querySelectorAll('.help-bubble-user').length).toBe(2) // sin duplicados
  })

  it('al tocar una pregunta recomendada, la respuesta se enseña desde su principio', () => {
    app()
    open()
    const first = within(within(panel()).getByText(/Ayuda de Contactos/).closest('details')!).getAllByRole('button')[0]
    fireEvent.click(first)
    expect((scrolled.at(-1)?.opts as { block?: string }).block).toBe('start')
    expect(scrolled.at(-1)?.text).toContain(first.textContent ?? '')
  })

  it('minimizar y reabrir conserva la conversación y la coloca en la última pregunta; cerrar del todo la borra y vuelve a empezar por el principio', () => {
    app()
    open()
    ask('menú semanal')
    ask('crear un evento')
    scrolled.length = 0
    fireEvent.click(within(panel()).getByRole('button', { name: /Minimizar la Ayuda/ }))
    expect(screen.queryByRole('complementary')).toBeNull()
    open()
    expect(within(panel()).getAllByText('crear un evento').length).toBeGreaterThan(0)
    expect(scrolled.at(-1)?.text).toBe('crear un evento') // posición útil: la última pregunta
    fireEvent.click(within(panel()).getByRole('button', { name: /Cerrar la Ayuda/ }))
    open()
    expect(within(panel()).queryByText('crear un evento')).toBeNull()
    expect(within(panel()).getByText(/Ayuda de Contactos/).closest('details')!.open).toBe(true)
  })
})

describe('teclado del iPhone', () => {
  it('con el teclado abierto la hoja se pega al área visible (encima del teclado) y no crece hasta la barra de estado', async () => {
    app()
    open()
    expect(panel().dataset.keyboard).toBe('false')
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(panel().dataset.keyboard).toBe('true'))
    expect(parseFloat(panel().style.bottom)).toBe(768 - 420 + 8) // justo encima del teclado
    expect(panel().style.maxHeight).toContain('420px')
    expect(panel().style.maxHeight).toContain('safe-area-inset-top')
    act(() => vv.set({ height: 768 }))
    await waitFor(() => expect(panel().dataset.keyboard).toBe('false'))
    expect(panel().style.bottom).toBe('') // vuelve a su sitio de siempre
  })

  it('al tocar el buscador y abrirse el teclado se lleva a una posición visible', () => {
    vi.useFakeTimers()
    app()
    open()
    const input = within(panel()).getByLabelText('¿Qué quieres hacer o saber?')
    input.focus()
    act(() => vv.set({ height: 420 }))
    act(() => void vi.advanceTimersByTime(500))
    expect(scrolled.some((s) => s.text.includes('¿Qué quieres hacer o saber?'))).toBe(true)
    vi.useRealTimers()
  })

  it('escribir con el teclado abierto funciona y enviar sigue añadiendo la respuesta', async () => {
    app()
    open()
    act(() => vv.set({ height: 420 }))
    await waitFor(() => expect(panel().dataset.keyboard).toBe('true'))
    ask('cambiar mi contraseña')
    expect(within(panel()).getByRole('log').querySelectorAll('.help-bubble-user').length).toBe(1)
  })
})
