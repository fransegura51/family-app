// @vitest-environment jsdom
// Las áreas integradas de «Pepa te acompaña» (interfaz real en jsdom): Conoce esta sección, Enséñame, Cómo funciona PEPA y la pestaña de Soporte (oculta mientras esté apagado).
// Se usan los registros reales de visitas, tutoriales y explicaciones; la API de la Ayuda se simula. No sustituye la prueba en un móvil real.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))

const { HelpAreaTabs, HelpHowArea, HelpLearnArea, HelpSectionArea, ExplainerDetail, AREA_TABS, availableAreas } = await import('@/help/ui/HelpAreas')
const { HelpUiContext } = await import('@/help/ui/helpContext')
const { EXPLAINERS } = await import('@/help/explainers')
const { TOURS } = await import('@/help/tours/registry')
const { setTourProgress } = await import('@/help/prefs')

function api(over: Record<string, unknown> = {}) {
  const fns = { startTourById: vi.fn(), openExplainer: vi.fn(), setArea: vi.fn(), goToPlace: vi.fn() }
  return {
    ...fns,
    area: 'section',
    explainerId: null,
    ctx: { role: 'admin', allowedSections: null, platform: 'web', community: 'ok' },
    canDoTour: () => true,
    canExplain: () => true,
    ...over,
  }
}
function mount(ui: React.ReactElement, over: Record<string, unknown> = {}) {
  const value = api(over)
  render(<HelpUiContext.Provider value={value as never}>{ui}</HelpUiContext.Provider>)
  return value
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('pestañas de las áreas', () => {
  it('Preguntar, Conoce esta sección, Enséñame y Cómo funciona PEPA; Soporte técnico NO se ofrece mientras esté apagado', () => {
    mount(<HelpAreaTabs />)
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs.join('|')).toMatch(/Preguntar/)
    expect(tabs.join('|')).toMatch(/Conoce esta sección/)
    expect(tabs.join('|')).toMatch(/Enséñame/)
    expect(tabs.join('|')).toMatch(/Cómo funciona PEPA/)
    expect(tabs.join('|')).not.toMatch(/Soporte/)
    expect(availableAreas()).not.toContain('support')
    expect(AREA_TABS.find((t) => t.id === 'support')).toBeTruthy() // existe, pero apagada
  })

  it('tocar una pestaña cambia de área', () => {
    const v = mount(<HelpAreaTabs />)
    fireEvent.click(screen.getByRole('tab', { name: /Enséñame/ }))
    expect(v.setArea).toHaveBeenCalledWith('learn')
  })
})

describe('Conoce esta sección', () => {
  it('ofrece la visita de la sección actual y la arranca; las demás secciones aparecen aparte', () => {
    const v = mount(<HelpSectionArea focusModule="calendario" />)
    const here = screen.getByRole('region', { name: /Visita de Calendario/ })
    fireEvent.click(within(here).getByRole('button', { name: /Empezar la visita/ }))
    expect(v.startTourById).toHaveBeenCalledWith('visita-calendario')
    expect(screen.getByRole('region', { name: /Otras secciones/ })).toBeTruthy()
  })

  it('no ofrece visitas que esta cuenta no puede hacer (permisos, Comunidad 18+, plataforma)', () => {
    mount(<HelpSectionArea focusModule="calendario" />, { canDoTour: (id: string) => !id.includes('comunidad') && id !== 'visita-calendario' })
    expect(screen.queryByRole('button', { name: /Empezar la visita/ })).toBeNull()
    expect(screen.queryByText(/Comunidad/)).toBeNull()
    expect(screen.getByText(/no hay visita guiada disponible para tu cuenta/)).toBeTruthy()
  })
})

describe('Enséñame', () => {
  it('es un catálogo con búsqueda, agrupado por sección, que arranca el tutorial elegido', () => {
    const v = mount(<HelpLearnArea focusModule={null} />, { area: 'learn' })
    expect(screen.getByText('¿Qué quieres aprender a hacer?')).toBeTruthy()
    const first = screen.getAllByRole('button', { name: /^Enséñame: / })[0]
    fireEvent.click(first)
    expect(v.startTourById).toHaveBeenCalledTimes(1)
    const search = screen.getByLabelText('Buscar entre los tutoriales') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'zzzzzz-no-existe' } })
    expect(screen.getByText('No hay tutoriales con esa búsqueda.')).toBeTruthy()
  })

  it('muestra el estado de cada tutorial: hecho / hay versión nueva, y deja repetirlo', () => {
    const t = TOURS.find((x) => (x.kind ?? 'tutorial') === 'tutorial' && x.module === 'calendario')!
    setTourProgress(t.id, { status: 'completed', at: '2026-10-01', version: t.version })
    mount(<HelpLearnArea focusModule="calendario" />, { area: 'learn' })
    const row = screen.getByRole('button', { name: new RegExp(`Enséñame: ${t.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).closest('li')!
    expect(row.textContent).toMatch(/✓ Hecho/)
    expect(within(row as HTMLElement).getByRole('button', { name: /Enséñame/ }).textContent).toBe('Repetir')
  })

  it('no lista ningún tutorial que la cuenta no pueda hacer', () => {
    mount(<HelpLearnArea focusModule={null} />, { area: 'learn', canDoTour: () => false })
    expect(screen.queryAllByRole('button', { name: /^Enséñame: / })).toHaveLength(0)
  })
})

describe('Cómo funciona PEPA', () => {
  it('lista las explicaciones por sección, se pueden buscar y abren el detalle', () => {
    const v = mount(<HelpHowArea focusModule={null} />, { area: 'how' })
    const first = screen.getAllByRole('button', { name: /^Leer: / })[0]
    fireEvent.click(first)
    expect(v.openExplainer).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Buscar entre las explicaciones'), { target: { value: 'zzzzzz-no-existe' } })
    expect(screen.getByText('No hay explicaciones con esa búsqueda.')).toBeTruthy()
  })

  it('el detalle enseña ejemplo, límites y qué hacer si sale mal, y ofrece «Enséñame a corregirlo» solo si se puede', () => {
    const withTour = EXPLAINERS.find((e) => e.tour)
    expect(withTour, 'alguna explicación enlaza con un tutorial de corrección').toBeTruthy()
    const v = mount(<ExplainerDetail e={withTour!} />, { area: 'how' })
    expect(screen.getByText(/Lo que PEPA no hace/)).toBeTruthy()
    expect(screen.getByText(/Si el resultado no es el que esperabas/)).toBeTruthy()
    expect(screen.getAllByText(/Ejemplo:/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Enséñame a corregirlo' }))
    expect(v.startTourById).toHaveBeenCalledWith(withTour!.tour)
    expect(screen.queryByRole('button', { name: /Me parece un fallo/ })).toBeNull() // Soporte apagado
    cleanup()
    mount(<ExplainerDetail e={withTour!} />, { canDoTour: () => false })
    expect(screen.queryByRole('button', { name: 'Enséñame a corregirlo' })).toBeNull()
  })

  it('no muestra explicaciones que la cuenta no puede ver', () => {
    mount(<HelpHowArea focusModule={null} />, { area: 'how', canExplain: () => false })
    expect(screen.queryAllByRole('button', { name: /^Leer: / })).toHaveLength(0)
  })
})
