// @vitest-environment jsdom
// Comienzo de un tutorial: cierra los menús, lleva a la pestaña/pantalla exacta, ESPERA a que esté en pantalla y solo entonces señala el primer control. Causa raíz de «No encuentro este
// control» en Compras: el botón «+ Añadir producto» vive en la pestaña «Lista», pero la app abre Compras en «Inicio» y el tutorial miraba demasiado pronto. Pantallas reales con datos
// simulados; no sustituye la prueba en un iPhone.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
        return () => empty()
      },
    },
  ),
}))
vi.mock('@/services/voice', async (orig) => ({ ...(await orig<typeof import('@/services/voice')>()), isSpeechSupported: () => false, isDictationSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const { TourRunner } = await import('@/help/tours/TourRunner')
const { getTour } = await import('@/help/tours/registry')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const dest = await import('@/help/destinations')
const { HelpDestMark } = await import('@/help/ui/HelpDest')

const PROFILE = { id: 'p1', familyId: 'f1', role: 'admin', displayName: 'Ana', allowedSections: null } as unknown as Profile

function runner(tourId: string, over: Partial<Parameters<typeof TourRunner>[0]> = {}) {
  return <TourRunner tour={getTour(tourId)!} voiceMode="text" nextOptions={[]} onClose={() => undefined} onPick={() => undefined} prepareMs={900} {...over} />
}
const panel = () => screen.getByRole('dialog', { name: /Tutorial:/ })
const says = (t: RegExp | string) => waitFor(() => expect(within(panel()).getByText(t)).toBeTruthy(), { timeout: 15000 })

beforeEach(() => {
  setTargetVisibilityForTests(() => true)
  localStorage.clear()
})
afterEach(() => {
  setTargetVisibilityForTests(null)
  cleanup()
  dest.clearDestination()
})

describe('preparación del tutorial', () => {
  function MenuScreen({ arrive }: { arrive: boolean }) {
    const [open, setOpen] = useState(true)
    dest.useCloseMenusOnHelp(() => setOpen(false))
    const [ready, setReady] = useState(false)
    dest.useHelpDestinations({ 'compras.lista': () => setReady(true) })
    return (
      <div>
        <p data-testid="menu">{open ? 'abierto' : 'cerrado'}</p>
        {arrive && ready && (
          <>
            <HelpDestMark id="compras.lista" />
            <button type="button" data-help-id="shopping.add-product">
              + Añadir producto
            </button>
          </>
        )}
      </div>
    )
  }

  it('cierra los menús abiertos y no señala nada hasta que la pantalla del tutorial está lista', async () => {
    render(
      <MemoryRouter initialEntries={['/compras']}>
        <MenuScreen arrive />
        {runner('com-anadir-producto')}
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('menu').textContent).toBe('cerrado'))
    await says(/Pulsa «\+ Añadir producto»/)
    await waitFor(() => expect(document.querySelector('.tour-ring')).toBeTruthy())
  })

  it('mientras llega la pantalla enseña «Preparando…» y NUNCA el aviso «No encuentro este control»', async () => {
    render(
      <MemoryRouter initialEntries={['/compras']}>
        <MenuScreen arrive={false} />
        {runner('com-anadir-producto', { prepareMs: 600 })}
      </MemoryRouter>,
    )
    await says(/Preparando la pantalla del tutorial/)
    expect(within(panel()).queryByText(/No encuentro este control/)).toBeNull()
    expect(document.querySelector('.tour-ring')).toBeNull()
  })

  it('si la pantalla no llega (sin acceso…) lo dice con claridad y ofrece reintentar, ver los pasos o salir; no avanza ni finge', async () => {
    const onPick = vi.fn()
    render(
      <MemoryRouter initialEntries={['/compras']}>
        <MenuScreen arrive={false} />
        {runner('com-anadir-producto', { prepareMs: 150, onPick })}
      </MemoryRouter>,
    )
    await says(/No he podido abrir la pantalla de este tutorial/)
    expect(within(panel()).getByRole('button', { name: /Reintentar/ })).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Ver los pasos escritos/ }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'card', id: 'com-anadir-producto' }))
    expect(document.querySelector('.tour-ring')).toBeNull()
  })

  it('«Reintentar» vuelve a pedir la pantalla y, si ya llega, empieza el tutorial', async () => {
    let allow = false
    function Late() {
      const [ready, setReady] = useState(false)
      dest.useHelpDestinations({
        'compras.lista': () => {
          if (allow) setReady(true)
        },
      })
      return ready ? (
        <>
          <HelpDestMark id="compras.lista" />
          <button type="button" data-help-id="shopping.add-product">
            + Añadir producto
          </button>
        </>
      ) : null
    }
    render(
      <MemoryRouter initialEntries={['/compras']}>
        <Late />
        {runner('com-anadir-producto', { prepareMs: 120 })}
      </MemoryRouter>,
    )
    await says(/No he podido abrir la pantalla/)
    allow = true
    fireEvent.click(within(panel()).getByRole('button', { name: /Reintentar/ }))
    await says(/Pulsa «\+ Añadir producto»/)
  })
})

describe('tutoriales sobre las pantallas reales', () => {
  it('COMPRAS: parte de la portada, el tutorial abre la pestaña «Lista», encuentra «+ Añadir producto» y lo señala', async () => {
    const { ShoppingScreen } = await import('@/ui/ShoppingScreen')
    render(
      <MemoryRouter initialEntries={['/compras']}>
        <ShoppingScreen />
        {runner('com-anadir-producto', { prepareMs: 12000 })}
      </MemoryRouter>,
    )
    await says(/Pulsa «\+ Añadir producto»/)
    expect(document.querySelector('[data-help-id="shopping.add-product"]')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.tour-ring')).toBeTruthy())
    expect(within(panel()).queryByText(/No encuentro este control/)).toBeNull()
    // al pulsarlo (la persona) se abre el formulario real y el tutorial sigue con el nombre
    fireEvent.click(document.querySelector('[data-help-id="shopping.add-product"]')!)
    await says(/Escribe el producto/)
  }, 40000)

  it('FAMILIA (administración): el botón «+ Añadir miembro» queda señalado y a la vista (se pide al navegador que lo desplace)', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    const orig = HTMLElement.prototype.getBoundingClientRect
    // El botón está debajo de la zona visible (como en el iPhone): el tutorial debe desplazarlo.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const below = this.dataset?.helpId === 'family.add-member'
      const top = below ? window.innerHeight + 400 : 0
      return { top, left: 10, width: 100, height: 40, right: 110, bottom: top + 40, x: 10, y: top, toJSON: () => ({}) } as DOMRect
    })
    const { FamilyScreen } = await import('@/ui/FamilyScreen')
    render(
      <MemoryRouter initialEntries={['/familia']}>
        <FamilyScreen profile={PROFILE} />
        {runner('fam-anadir-miembro', { prepareMs: 12000 })}
      </MemoryRouter>,
    )
    await says(/Pulsa «\+ Añadir miembro»/)
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    HTMLElement.prototype.getBoundingClientRect = orig
    vi.restoreAllMocks()
  }, 40000)

  it('FAMILIA sin ser administración: «+ Añadir miembro» no existe y el tutorial lo dice en vez de fingir', async () => {
    const { FamilyScreen } = await import('@/ui/FamilyScreen')
    render(
      <MemoryRouter initialEntries={['/familia']}>
        <FamilyScreen profile={{ ...PROFILE, role: 'adult' }} />
        {runner('fam-anadir-miembro', { prepareMs: 250 })}
      </MemoryRouter>,
    )
    await says(/No he podido abrir la pantalla de este tutorial/)
    act(() => undefined)
  }, 40000)
})
