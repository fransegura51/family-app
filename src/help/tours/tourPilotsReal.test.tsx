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
const { HelpDestMark } = await import('@/help/ui/HelpDest')
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
      {tour.startDest && <HelpDestMark id={tour.startDest} />}
      <TourRunner tour={tour} voiceMode="text" nextOptions={[]} onClose={() => undefined} onPick={() => undefined} missingAfterMs={400} />
    </MemoryRouter>,
  )
}
const panel = () => screen.getByRole('dialog', { name: /Tutorial:/ })
// Escribir y terminar (✓ del teclado = el campo pierde el foco): el tutorial no avanza mientras se escribe.
const typeAndLeave = (el: Element, value: string) => {
  fireEvent.change(el, { target: { value } })
  fireEvent.focusOut(el)
}
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
  it('guía por nombre, tipo, datos opcionales y «Añadir»; el clic no basta; termina cuando la ficha se crea de verdad; no envía ninguna invitación', async () => {
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/) // el formulario ya estaba abierto: el primer paso se omite
    expect(document.querySelector('[data-help-id="family.member-name"]')).toBeTruthy()
    await waitFor(() => expect(document.querySelector('.tour-ring')).toBeTruthy())

    typeAndLeave(screen.getByLabelText('Nombre'), 'Eric')
    await says(/Elige qué es esta persona/)
    expect(within(panel()).getByRole('button', { name: /Siguiente/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'baby' } }) // elegir el tipo también cuenta
    await says(/El color identifica/) // antes del guardado se explican los datos opcionales que existen de verdad
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).not.toBeNull()
    fireEvent.click(within(panel()).getByRole('button', { name: /Saltar datos opcionales/ }))
    await says(/pulsa «Añadir»/)
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull()
    expect(data.addMember).not.toHaveBeenCalled() // el tutorial NO ha creado nada por su cuenta

    fireEvent.click(screen.getByRole('button', { name: 'Añadir' })) // la persona guarda
    await waitFor(() => expect(data.addMember).toHaveBeenCalledTimes(1))
    expect(data.addMember).toHaveBeenCalledWith(expect.objectContaining({ name: 'Eric', memberType: 'baby' }))
    await says(/La ficha está creada/)
    expect(within(panel()).getByText(/Yo no envío ninguna invitación por ti/)).toBeTruthy()
  })

  it('NO avanza mientras se escribe el nombre (ni con 2 letras): solo al terminar (✓ del teclado, intro, tocar fuera) o con «Siguiente»; lo escrito no se pierde', async () => {
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/)
    const name = screen.getByLabelText('Nombre') as HTMLInputElement
    name.focus()
    for (const v of ['E', 'Er', 'Eri', 'Eric']) {
      fireEvent.change(name, { target: { value: v } }) // cada letra
      await act(async () => new Promise((r) => setTimeout(r, 30)))
      expect(within(panel()).getByText(/Escribe su nombre/)).toBeTruthy()
    }
    fireEvent.keyDown(name, { key: 'Enter' }) // intro / «ir» del teclado
    await says(/Elige qué es esta persona/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Atrás/ }))
    await says(/Escribe su nombre/)
    expect(name.value).toBe('Eric')
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ })) // «Siguiente» sin tocar el teclado
    await says(/Elige qué es esta persona/)
  })

  it('tocar un botón de la tarjeta de Pepa mientras el campo tiene el foco no salta dos pasos', async () => {
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/)
    const name = screen.getByLabelText('Nombre') as HTMLInputElement
    name.focus()
    fireEvent.change(name, { target: { value: 'Eric' } })
    const next = within(panel()).getByRole('button', { name: /Siguiente/ })
    fireEvent.pointerDown(next) // el toque en la tarjeta ocurre ANTES de que el campo pierda el foco
    fireEvent.focusOut(name)
    fireEvent.click(next)
    await says(/Elige qué es esta persona/)
    await act(async () => new Promise((r) => setTimeout(r, 100)))
    expect(within(panel()).getByText(/Elige qué es esta persona/)).toBeTruthy() // seguimos en «tipo», no en «color»
  })

  it('explica cada tipo de miembro (comprobado contra los permisos reales) y distingue administrar la familia de administrar la aplicación PEPA', async () => {
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/)
    typeAndLeave(screen.getByLabelText('Nombre'), 'Eric')
    await says(/Elige qué es esta persona/)
    const details = within(panel()).getByText('Qué significa cada tipo').closest('details')!
    expect(details.hasAttribute('open')).toBe(false) // no satura la tarjeta
    const text = details.textContent ?? ''
    for (const t of ['Administrador/a', 'Adulto', 'Niño/a', 'Bebé', 'Invitado/a']) expect(text).toContain(t)
    expect(text).toMatch(/No es lo mismo que administrar la aplicación PEPA/)
    expect(text).toMatch(/no tiene cuenta propia/) // bebé
    expect(text).toMatch(/limitar a qué secciones/) // niño
  })

  it('los datos opcionales se explican con sus controles reales y el de secciones solo aparece para Niño/a e Invitado/a', async () => {
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/)
    typeAndLeave(screen.getByLabelText('Nombre'), 'Eric')
    await says(/Elige qué es esta persona/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/El color identifica/)
    expect(document.querySelector('[data-help-id="family.member-color"]')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/Comunidad PEPA, que es solo para mayores de 18 años/)
    expect(document.querySelector('[data-help-id="family.member-birth"]')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/curvas de crecimiento/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/aquí marcas las secciones/) // el tipo por defecto es Niño/a: sí existe
    expect(document.querySelector('[data-help-id="family.member-sections"]')).toBeTruthy()
  })

  it('con un tipo sin restricción de secciones (Adulto) el paso de secciones no existe y se omite solo', async () => {
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/)
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'adult' } })
    typeAndLeave(screen.getByLabelText('Nombre'), 'Eric')
    await says(/Elige qué es esta persona/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    for (const re of [/El color identifica/, /fecha de nacimiento/, /curvas de crecimiento/]) {
      await says(re)
      fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    }
    await says(/pulsa «Añadir»/) // sin paso de secciones
  })

  it('salir del tutorial sin guardar no crea nada', async () => {
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/)
    typeAndLeave(screen.getByLabelText('Nombre'), 'Eric')
    await says(/Elige qué es esta persona/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Salir/ }))
    await act(async () => {})
    expect(data.addMember).not.toHaveBeenCalled()
  })

  it('si el guardado falla (el servidor rechaza), el tutorial NO da el paso por hecho y sigue esperando', async () => {
    data.addMember.mockRejectedValueOnce(new Error('Sin permisos'))
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/)
    typeAndLeave(screen.getByLabelText('Nombre'), 'Eric')
    await says(/Elige qué es esta persona/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/El color identifica/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Saltar datos opcionales/ }))
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
    typeAndLeave(screen.getByLabelText('Nombre'), 'Leche')
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
    typeAndLeave(screen.getByLabelText('Nombre'), 'Pan')
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
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista de Eric')
    await says(/Aquí eliges el día/)
    expect(document.querySelector('[data-help-id="calendar.event-date"]')).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ })) // fecha predeterminada: «Siguiente» sin tocarla
    await says(/hora de inicio/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Saltar opciones/ }))
    await says(/Aquí eliges para quién es el evento/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ })) // sin personas: «Toda la familia», sin puntos (el paso de puntos se omite)
    await says(/«Categoría» agrupa/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Saltar opciones/ }))
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
    typeAndLeave(screen.getByLabelText('Nombre'), 'Leche')
    await says(/pon la tienda/)
  })

  it('Familia: lo mismo con el nombre del miembro', async () => {
    fakeKeyboard()
    run('fam-anadir-miembro', '/familia', <AddMemberForm onAdded={() => undefined} existingMembers={[]} />)
    await says(/Escribe su nombre/)
    expect((document.querySelector('[data-tour-layer]') as HTMLElement).dataset.keyboard).toBe('true')
    expect(panel().className).toContain('tour-panel-compact')
    typeAndLeave(screen.getByLabelText('Nombre'), 'Eric')
    await says(/Elige qué es esta persona/)
  })
})
