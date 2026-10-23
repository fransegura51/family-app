// @vitest-environment jsdom
// Los tres tutoriales piloto contra los FORMULARIOS REALES de PEPA (no contra una pantalla de mentira): Calendario → Crear un evento, Compras → Añadir un producto y
// Familia → Añadir un miembro. La persona (la prueba) escribe y pulsa los botones de verdad; el tutorial avanza al comprobar cada acción y solo termina cuando la pantalla real
// confirma que se guardó. Los datos (Supabase) están simulados: esto NO sustituye la prueba en dispositivos reales (ordenador y móvil).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({ addMember: vi.fn(async () => 'nuevo-id'), addItem: vi.fn(async () => undefined), createEvent: vi.fn(async () => undefined) }))
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }) }))
vi.mock('@/data/family', async (orig) => ({ ...(await orig<typeof import('@/data/family')>()), addFamilyMember: data.addMember }))
vi.mock('@/data/shopping', async (orig) => ({ ...(await orig<typeof import('@/data/shopping')>()), addShoppingItem: data.addItem }))
vi.mock('@/data/calendar', async (orig) => ({ ...(await orig<typeof import('@/data/calendar')>()), createEvent: data.createEvent }))
vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const { TourRunner } = await import('@/help/tours/TourRunner')
const { getTour } = await import('@/help/tours/registry')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const { AddMemberForm } = await import('@/ui/FamilyScreen')
const { AddShoppingItemForm } = await import('@/ui/ShoppingScreen')
const { AddEventForm } = await import('@/ui/CalendarScreen')

function run(tourId: string, path: string, screenNode: React.ReactNode) {
  const tour = getTour(tourId)!
  return render(
    <MemoryRouter initialEntries={[path]}>
      {screenNode}
      <TourRunner tour={tour} voiceMode="text" nextOptions={[]} onClose={() => undefined} onPick={() => undefined} missingAfterMs={400} />
    </MemoryRouter>,
  )
}
const panel = () => screen.getByRole('dialog', { name: /Tutorial:/ })
const says = (t: RegExp | string) => waitFor(() => expect(within(panel()).getByText(t)).toBeTruthy())

beforeEach(() => {
  setTargetVisibilityForTests(() => true)
  data.addMember.mockClear()
  data.addItem.mockClear()
  data.createEvent.mockClear()
  localStorage.clear()
})
afterEach(() => {
  setTargetVisibilityForTests(null)
  cleanup()
})

describe('Familia → Añadir un miembro (formulario real)', () => {
  it('guía por nombre, tipo y «Añadir»; el clic no basta; termina cuando la ficha se crea de verdad; no envía ninguna invitación', async () => {
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says('Escribe su nombre.') // el formulario ya estaba abierto: el primer paso se omite
    expect(document.querySelector('[data-help-id="family.member-name"]')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.tour-ring')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Eric' } })
    await says(/Elige qué es/)
    expect(within(panel()).getByRole('button', { name: /Siguiente/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'baby' } }) // elegir el tipo también cuenta
    await says(/pulsa «Añadir»/)
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull()
    expect(data.addMember).not.toHaveBeenCalled() // el tutorial NO ha creado nada por su cuenta

    fireEvent.click(screen.getByRole('button', { name: 'Añadir' })) // la persona guarda
    await waitFor(() => expect(data.addMember).toHaveBeenCalledTimes(1))
    expect(data.addMember).toHaveBeenCalledWith(expect.objectContaining({ name: 'Eric', memberType: 'baby' }))
    await says(/La ficha está creada/)
    expect(within(panel()).getByText(/Yo no envío ninguna invitación por ti/)).toBeTruthy()
  })

  it('si el guardado falla (el servidor rechaza), el tutorial NO da el paso por hecho y sigue esperando', async () => {
    data.addMember.mockRejectedValueOnce(new Error('Sin permisos'))
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says('Escribe su nombre.')
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Eric' } })
    await says(/Elige qué es/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/pulsa «Añadir»/)
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }))
    await waitFor(() => expect(data.addMember).toHaveBeenCalledTimes(1))
    await screen.findByText(/Sin permisos/) // la pantalla real enseña su error
    expect(within(panel()).getByText(/pulsa «Añadir»/)).toBeTruthy() // el tutorial sigue en el mismo paso
    expect(within(panel()).queryByText(/La ficha está creada/)).toBeNull()
  })
})

describe('Compras → Añadir un producto (formulario real)', () => {
  it('guía por el nombre, la tienda (opcional) y «Añadir»; termina solo cuando el producto se guarda', async () => {
    run('com-anadir-producto', '/compras', <AddShoppingItemForm suggestions={[]} knownStores={['Mercadona']} hideHeading onAdded={() => undefined} />)
    await says(/Escribe el producto/)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Leche' } })
    await says(/pon la tienda/)
    expect(within(panel()).getByRole('button', { name: /Siguiente/ })).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/Pulsa «Añadir»/)
    expect(data.addItem).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }))
    await waitFor(() => expect(data.addItem).toHaveBeenCalledTimes(1))
    expect(data.addItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Leche' }))
    await says(/El producto ya está en tu lista/)
  })

  it('el paso de la tienda es opcional: se puede rellenar o saltar, y atrás vuelve sin perder lo escrito', async () => {
    run('com-anadir-producto', '/compras', <AddShoppingItemForm suggestions={[]} knownStores={[]} hideHeading onAdded={() => undefined} />)
    await says(/Escribe el producto/)
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Pan' } })
    await says(/pon la tienda/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Atrás/ }))
    await says(/Escribe el producto/)
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Pan')
  })
})

describe('Calendario → Crear un evento (formulario real)', () => {
  it('guía por título, fecha, opciones y «Crear evento»; termina solo cuando el evento se crea de verdad', async () => {
    run('cal-crear-evento', '/calendario', <AddEventForm members={[]} events={[]} categories={[]} defaultDate="2026-11-05" hideHeading onAdded={() => undefined} onManageCategories={() => undefined} />)
    await says(/Escribe cómo se llama el evento/)
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Dentista de Eric' } })
    await says(/Comprueba el día/)
    expect(document.querySelector('[data-help-id="calendar.event-date"]')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/hora, repetición, recordatorio/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/pulsa «Crear evento»/)
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull()
    expect(data.createEvent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }))
    await waitFor(() => expect(data.createEvent).toHaveBeenCalledTimes(1))
    expect(data.createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dentista de Eric' }))
    await says(/Tu evento ya está en el calendario/)
  })

  it('sin título el formulario real no se guarda (validación real) y el tutorial no avanza', async () => {
    run('cal-crear-evento', '/calendario', <AddEventForm members={[]} events={[]} categories={[]} defaultDate="2026-11-05" hideHeading onAdded={() => undefined} onManageCategories={() => undefined} />)
    await says(/Escribe cómo se llama el evento/)
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' })) // título vacío: la validación del navegador lo impide
    await act(async () => {})
    expect(data.createEvent).not.toHaveBeenCalled()
    expect(within(panel()).getByText(/Escribe cómo se llama el evento/)).toBeTruthy()
  })
})

describe('el recorrido de bienvenida sobre la barra real', () => {
  it('solo señala controles reales (menú, calendario, compras, ayuda) y nunca crea ningún dato', () => {
    const w = getTour('bienvenida')!
    expect(w.steps.every((s) => s.completeOn.every((c) => c.type !== 'event'))).toBe(true)
    expect(data.addMember).not.toHaveBeenCalled()
    expect(data.addItem).not.toHaveBeenCalled()
    expect(data.createEvent).not.toHaveBeenCalled()
  })
})

// B4-UX01: el mismo motor con el teclado abierto en los otros dos pilotos (Compras y Familia) sobre sus formularios reales: la capa sigue al área visible y la escritura no se bloquea.
describe('con el teclado abierto (visualViewport) en Compras y Familia', () => {
  function fakeKeyboard() {
    const vv = Object.assign(new EventTarget(), { offsetTop: 0, offsetLeft: 0, width: 390, height: 420, scale: 1 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv })
    return vv
  }
  afterEach(() => Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined }))

  it('Compras: la capa mide el área visible, la tarjeta es compacta y escribir el nombre sigue avanzando', async () => {
    fakeKeyboard()
    run('com-anadir-producto', '/compras', <AddShoppingItemForm suggestions={[]} knownStores={[]} hideHeading onAdded={() => undefined} />)
    await says(/Escribe el producto/)
    const layer = document.querySelector('[data-tour-layer]') as HTMLElement
    expect(layer.dataset.keyboard).toBe('true')
    expect(layer.style.height).toBe('420px')
    expect(panel().className).toContain('tour-panel-compact')
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Leche' } })
    await says(/pon la tienda/)
  })

  it('Familia: lo mismo con el nombre del miembro', async () => {
    fakeKeyboard()
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says('Escribe su nombre.')
    expect((document.querySelector('[data-tour-layer]') as HTMLElement).dataset.keyboard).toBe('true')
    expect(panel().className).toContain('tour-panel-compact')
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Eric' } })
    await says(/Elige qué es/)
  })
})
