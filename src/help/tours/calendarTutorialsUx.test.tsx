// @vitest-environment jsdom
// B4-UX02..06 y CAL-01 sobre los formularios REALES de Calendario (evento y tarea): avance al confirmar la fecha, recorrido opcional de opciones (con «Saltar opciones»), paso propio de
// «¿Para quién?» y puntos, marco que acompaña a cada explicación, datos que no se pierden al navegar por el tutorial y selección inicial = persona autenticada. Datos simulados:
// NO sustituye la prueba en un iPhone real.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FamilyMember } from '@/domain/types'

const data = vi.hoisted(() => ({ createEvent: vi.fn(async () => undefined) }))
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }) }))
vi.mock('@/data/calendar', async (orig) => ({ ...(await orig<typeof import('@/data/calendar')>()), createEvent: data.createEvent }))
vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const { TourRunner } = await import('@/help/tours/TourRunner')
const { getTour } = await import('@/help/tours/registry')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const { AddEventForm, AddTaskForm } = await import('@/ui/CalendarScreen')

const member = (id: string, name: string): FamilyMember =>
  ({ id, familyId: 'f', name, avatar: '🙂', color: '#4c6ef5', memberType: 'adult', birthDate: null, sex: null, weightGoalKg: null, birthdayFavorite: false, permissions: {}, linkedProfileId: null, photoPath: null, allowedSections: null, joinedAt: '2020-01-01' }) as FamilyMember
const ANA = member('m1', 'Ana')
const ERIC = member('m2', 'Eric')
const MEMBERS = [ANA, ERIC]
const CONFIRM = { focused: 400, blurred: 40, afterBlur: 20 }

type EventProps = Partial<Parameters<typeof AddEventForm>[0]>
const eventForm = (over: EventProps = {}) => (
  <AddEventForm members={MEMBERS} events={[]} categories={[]} defaultDate="2026-11-05" defaultMemberIds={['m1']} hideHeading onAdded={() => undefined} onManageCategories={() => undefined} {...over} />
)
const taskForm = (over: Partial<Parameters<typeof AddTaskForm>[0]> = {}) => (
  <AddTaskForm members={MEMBERS} categories={[]} defaultDate="2026-11-05" defaultMemberId="m1" onAdded={() => undefined} onManageCategories={() => undefined} {...over} />
)

function run(tourId: string, node: React.ReactNode) {
  const tour = getTour(tourId)!
  return render(
    <MemoryRouter initialEntries={['/calendario']}>
      {node}
      <TourRunner tour={tour} voiceMode="text" nextOptions={[]} onClose={() => undefined} onPick={() => undefined} missingAfterMs={400} confirmMs={CONFIRM} />
    </MemoryRouter>,
  )
}
const panel = () => screen.getByRole('dialog', { name: /Tutorial:/ })
const says = (t: RegExp | string) => waitFor(() => expect(within(panel()).getByText(t)).toBeTruthy(), { timeout: 2500 })
const btn = (name: RegExp) => within(panel()).getByRole('button', { name })
const next = () => fireEvent.click(btn(/Siguiente/))
const dateInput = () => document.querySelector('[data-help-id="calendar.event-date"] input') as HTMLInputElement
const ring = () => document.querySelector('.tour-ring') as HTMLElement | null
// Escribir en un campo y terminar (✓ del teclado de iPhone o tocar fuera = el campo pierde el foco): el tutorial NO avanza mientras se escribe, solo al terminar.
const typeAndLeave = (el: Element, value: string) => {
  fireEvent.change(el, { target: { value } })
  fireEvent.focusOut(el)
}

beforeEach(() => {
  setTargetVisibilityForTests(() => true)
  data.createEvent.mockClear()
  localStorage.clear()
})
afterEach(() => {
  setTargetVisibilityForTests(null)
  vi.restoreAllMocks()
  cleanup()
})

describe('B4-UX02 · avance al confirmar la fecha', () => {
  async function toDateStep() {
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
  }

  it('al elegir una fecha válida y terminar la selección, avanza solo', async () => {
    await toDateStep()
    fireEvent.change(dateInput(), { target: { value: '2026-11-12' } }) // sin foco en el campo: selección terminada
    await says(/hora de inicio/)
    expect(dateInput().value).toBe('2026-11-12') // la fecha elegida se conserva
  })

  it('mientras el selector sigue abierto (el campo con el foco) NO avanza; al cerrarse (pierde el foco) sí', async () => {
    await toDateStep()
    dateInput().focus()
    fireEvent.change(dateInput(), { target: { value: '2026-11-12' } })
    await act(async () => new Promise((r) => setTimeout(r, 150))) // más que la espera sin foco, menos que la espera con foco
    expect(within(panel()).getByText(/Aquí eliges el día/)).toBeTruthy()
    dateInput().blur()
    await says(/hora de inicio/)
  })

  it('con el selector abierto y varios cambios seguidos (girar la rueda) solo avanza al terminar', async () => {
    await toDateStep()
    dateInput().focus()
    for (const d of ['2026-11-06', '2026-11-07', '2026-11-08']) {
      fireEvent.change(dateInput(), { target: { value: d } })
      await act(async () => new Promise((r) => setTimeout(r, 60)))
      expect(within(panel()).getByText(/Aquí eliges el día/)).toBeTruthy()
    }
    dateInput().blur()
    await says(/hora de inicio/)
  })

  it('una fecha vacía (borrada) no cuenta como confirmada', async () => {
    await toDateStep()
    fireEvent.change(dateInput(), { target: { value: '' } })
    await act(async () => new Promise((r) => setTimeout(r, 200)))
    expect(within(panel()).getByText(/Aquí eliges el día/)).toBeTruthy()
  })

  it('un simple renderizado o abrir el formulario no avanza; con la fecha predeterminada se ofrece «Siguiente» sin obligar a tocarla', async () => {
    await toDateStep()
    await act(async () => new Promise((r) => setTimeout(r, 200)))
    expect(within(panel()).getByText(/Aquí eliges el día/)).toBeTruthy()
    expect(dateInput().value).toBe('2026-11-05')
    next()
    await says(/hora de inicio/)
  })

  it('respeta la validación real: con una fecha fuera de límite no avanza', async () => {
    await toDateStep()
    dateInput().min = '2026-12-01'
    fireEvent.change(dateInput(), { target: { value: '2026-11-12' } }) // por debajo del mínimo: inválida
    await act(async () => new Promise((r) => setTimeout(r, 200)))
    expect(within(panel()).getByText(/Aquí eliges el día/)).toBeTruthy()
  })
})

describe('B4-UX03 · recorrido de opciones adicionales', () => {
  async function toOptions() {
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
    next()
    await says(/hora de inicio/)
  }

  it('recorre las opciones reales en el orden de la pantalla y en cada una señala SU control', async () => {
    await toOptions()
    const order: Array<[RegExp, string]> = [
      [/hora de inicio/, 'calendar.event-time'],
      [/«Todo el día» sirve/, 'calendar.event-allday'],
      [/solo tú verás este evento/, 'calendar.event-private'],
      [/«Repetición» hace que/, 'calendar.event-repeat'],
      [/«Recordatorio» te avisa/, 'calendar.event-reminder'],
    ]
    for (const [text, id] of order) {
      await says(text)
      expect(document.querySelector(`[data-help-id="${id}"]`), id).toBeTruthy()
      next()
    }
    await says(/Aquí eliges para quién es el evento/)
  })

  it('«Saltar opciones» pasa directamente a «¿Para quién?» y no se pierde nada de lo escrito', async () => {
    await toOptions()
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Dentista')
    fireEvent.click(btn(/Saltar opciones/))
    await says(/Aquí eliges para quién es el evento/)
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Dentista')
    expect(dateInput().value).toBe('2026-11-05')
  })

  it('el paso de la hora se omite solo si el evento es de «Todo el día» (no existe ese control) y no hay marco huérfano', async () => {
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    fireEvent.click(screen.getByLabelText(/Todo el día/)) // sin horas
    typeAndLeave(screen.getByLabelText('Título'), 'Viaje')
    await says(/Aquí eliges el día/)
    next()
    await says(/«Todo el día» sirve/) // saltó la hora sin quedarse mirando un paso vacío
    expect(document.querySelector('[data-help-id="calendar.event-time"]')).toBeNull()
  })

  it('«Atrás» no vuelve a un paso que se omitió (no rebota hacia delante)', async () => {
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    fireEvent.click(screen.getByLabelText(/Todo el día/))
    typeAndLeave(screen.getByLabelText('Título'), 'Viaje')
    await says(/Aquí eliges el día/)
    next()
    await says(/«Todo el día» sirve/)
    fireEvent.click(btn(/Atrás/))
    await says(/Aquí eliges el día/)
  })

  it('el segundo grupo (categoría, ubicación/foto/nota) también se puede saltar y lleva a «Crear evento»', async () => {
    await toOptions()
    fireEvent.click(btn(/Saltar opciones/))
    await says(/Aquí eliges para quién es el evento/)
    next()
    await says(/Con una sola persona elegida aparece este campo/)
    next()
    await says(/«Categoría» agrupa/)
    expect(document.querySelector('[data-help-id="calendar.event-category"]')).toBeTruthy()
    fireEvent.click(btn(/Saltar opciones/))
    await says(/pulsa «Crear evento»/)
  })

  it('explorar un control (abrir «Repetición») no obliga a cambiarlo ni rompe el recorrido', async () => {
    await toOptions()
    for (let i = 0; i < 3; i++) next()
    await says(/«Repetición» hace que/)
    fireEvent.click(document.querySelector('[data-help-id="calendar.event-repeat"] button')!) // se abre el selector real
    expect(document.querySelector('.modal-sheet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' })) // se cierra sin elegir nada
    expect(within(panel()).getByText(/«Repetición» hace que/)).toBeTruthy()
    next()
    await says(/«Recordatorio» te avisa/)
  })
})

describe('B4-UX04 · «¿Para quién?» y puntos', () => {
  async function toWho(form = eventForm()) {
    run('cal-crear-evento', form)
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
    next()
    await says(/hora de inicio/)
    fireEvent.click(btn(/Saltar opciones/))
    await says(/Aquí eliges para quién es el evento/)
  }

  it('tiene su propio paso, explica persona, puntos y «Toda la familia», y resalta el selector real', async () => {
    await toWho()
    const text = within(panel()).getByText(/Aquí eliges para quién es el evento/).textContent ?? ''
    expect(text).toMatch(/una persona/)
    expect(text).toMatch(/puntos/)
    expect(text).toMatch(/Toda la familia/)
    expect(text).toMatch(/no hay puntos/)
    expect(document.querySelector('[data-help-id="calendar.event-who"]')?.textContent).toContain('¿Para quién?')
  })

  it('con una persona elegida (la autenticada) enseña el campo de puntos real', async () => {
    await toWho()
    next()
    await says(/Con una sola persona elegida aparece este campo/)
    const points = document.querySelector('[data-help-id="calendar.event-points"]')!
    expect(points.textContent).toContain('Puntos al marcarlo')
  })

  it('con «Toda la familia» el campo de puntos no existe y el paso se omite sin inventar nada', async () => {
    await toWho(eventForm({ defaultMemberIds: undefined }))
    expect(document.querySelector('[data-help-id="calendar.event-points"]')).toBeNull()
    next()
    await says(/«Categoría» agrupa/) // saltó los puntos
  })

  it('no inventa reparto de puntos: con dos personas elegidas tampoco hay campo de puntos', async () => {
    await toWho(eventForm({ defaultMemberIds: ['m1', 'm2'] }))
    expect(document.querySelector('[data-help-id="calendar.event-points"]')).toBeNull()
  })

  it('el tutorial de TAREAS enseña lo mismo (quién la hace + puntos) sobre el formulario de tarea', async () => {
    run('cal-crear-tarea', taskForm())
    await says(/Escribe qué hay que hacer/)
    typeAndLeave(document.querySelector('[data-help-id="calendar.task-title"]')!, 'Sacar la basura')
    await says(/Aquí eliges para qué día es/)
    next()
    await says(/«Privado»: si lo marcas, solo tú verás esta tarea/)
    fireEvent.click(btn(/Saltar opciones/))
    await says(/Aquí eliges quién debe hacer la tarea/)
    expect(within(panel()).getByText(/Aquí eliges quién debe hacer la tarea/).textContent).toMatch(/Toda la familia/)
    next()
    await says(/Con una sola persona elegida aparece este campo/)
    expect(document.querySelector('[data-help-id="calendar.task-points"]')?.textContent).toContain('Puntos al marcarla')
  })
})

describe('B4-UX06 · explicación y marco van juntos', () => {
  it('el marco cambia con cada paso y nunca queda un resaltado del paso anterior', async () => {
    const tops: Record<string, number> = { 'calendar.event-title': 100, 'calendar.event-date': 200, 'calendar.event-time': 300, 'calendar.event-allday': 400 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const id = this.dataset?.helpId ?? (this.querySelector('[data-help-id]') as HTMLElement | null)?.dataset.helpId ?? '' // la etiqueta que rodea al campo marcado cuenta como el campo
      const top = tops[id] ?? 0
      return { top, left: 10, width: 100, height: 40, right: 110, bottom: top + 40, x: 10, y: top, toJSON: () => ({}) } as DOMRect
    })
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    await waitFor(() => expect(parseFloat(ring()!.style.top)).toBe(100 - 4))
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
    await waitFor(() => expect(parseFloat(ring()!.style.top)).toBe(200 - 4))
    next()
    await says(/hora de inicio/)
    await waitFor(() => expect(parseFloat(ring()!.style.top)).toBe(300 - 4))
    next()
    await says(/«Todo el día» sirve/)
    await waitFor(() => expect(parseFloat(ring()!.style.top)).toBe(400 - 4))
  })

  it('si el control del paso no existe, no se dibuja ningún marco (ni el del paso anterior)', async () => {
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    await waitFor(() => expect(ring()).toBeTruthy())
    cleanup()
    // Sin el formulario abierto, el paso «abrir» apunta a un botón que tampoco existe en esta pantalla de prueba: sin marco.
    run('cal-crear-evento', <div />)
    await act(async () => new Promise((r) => setTimeout(r, 100)))
    expect(ring()).toBeNull()
  })
})

describe('datos del formulario y guardado confirmado', () => {
  it('pausar, volver atrás, avanzar y reiniciar el tutorial NO borra lo que la persona ya escribió', async () => {
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista de Eric')
    await says(/Aquí eliges el día/)
    fireEvent.click(btn(/Pausar/))
    await says(/Tutorial en pausa/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Seguir/ }))
    await says(/Aquí eliges el día/)
    fireEvent.click(btn(/Atrás/))
    await says(/Escribe cómo se llama el evento/)
    fireEvent.click(btn(/Reiniciar/))
    await act(async () => {})
    expect((screen.getByLabelText('Título') as HTMLInputElement).value).toBe('Dentista de Eric')
    expect(dateInput().value).toBe('2026-11-05')
  })

  it('termina SOLO cuando el servidor confirma; el evento se guarda con la persona y los puntos elegidos; el tutorial no guarda nada', async () => {
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
    next()
    await says(/hora de inicio/)
    fireEvent.click(btn(/Saltar opciones/))
    await says(/Aquí eliges para quién es el evento/)
    next()
    await says(/Con una sola persona elegida aparece este campo/)
    fireEvent.change(document.querySelector('[data-help-id="calendar.event-points"] input')!, { target: { value: '5' } })
    next()
    fireEvent.click(btn(/Saltar opciones/))
    await says(/pulsa «Crear evento»/)
    expect(data.createEvent).not.toHaveBeenCalled()
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull() // paso sensible
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }))
    await waitFor(() => expect(data.createEvent).toHaveBeenCalledTimes(1))
    expect(data.createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dentista', memberIds: ['m1'], points: 5 }))
    await says(/Tu evento ya está en el calendario/)
    expect(within(panel()).getByRole('button', { name: /Cerrar/ })).toBeTruthy()
    expect(within(panel()).getByRole('button', { name: /Repetir/ })).toBeTruthy()
  })

  it('si el guardado falla, el tutorial no da el evento por creado', async () => {
    data.createEvent.mockRejectedValueOnce(new Error('Sin conexión'))
    run('cal-crear-evento', eventForm())
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
    next()
    fireEvent.click(btn(/Saltar opciones/))
    await says(/Aquí eliges para quién es el evento/)
    next()
    await says(/Con una sola persona/)
    next()
    fireEvent.click(btn(/Saltar opciones/))
    await says(/pulsa «Crear evento»/)
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }))
    await screen.findByText(/Sin conexión/)
    expect(within(panel()).getByText(/pulsa «Crear evento»/)).toBeTruthy()
  })

  it('el tutorial de tareas termina con el aviso de tarea creada', async () => {
    run('cal-crear-tarea', taskForm())
    await says(/Escribe qué hay que hacer/)
    typeAndLeave(document.querySelector('[data-help-id="calendar.task-title"]')!, 'Basura')
    await says(/Aquí eliges para qué día es/)
    next()
    await says(/«Privado»/)
    fireEvent.click(btn(/Saltar opciones/))
    await says(/Aquí eliges quién debe hacer la tarea/)
    next()
    await says(/Con una sola persona/)
    next()
    await says(/«Categoría» agrupa la tarea/)
    fireEvent.click(btn(/Saltar opciones/))
    await says(/pulsa «Crear tarea»/)
    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }))
    await waitFor(() => expect(data.createEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'task', memberIds: ['m1'] })))
    await says(/Tu tarea ya está en el calendario/)
  })
})
