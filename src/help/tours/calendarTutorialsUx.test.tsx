// @vitest-environment jsdom
// B4-UX02..06 y CAL-01 sobre el formulario REAL de Calendario (nuevo evento) con los capítulos de «Crear eventos y tareas»: avance al confirmar la fecha, recorrido de las opciones, «¿Para quién?» y
// puntos, marco que acompaña a cada explicación, datos que no se pierden al navegar por el capítulo y guardado confirmado. Datos simulados: NO sustituye la prueba en un iPhone real.
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
const { HelpDestMark } = await import('@/help/ui/HelpDest')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const { AddEventForm } = await import('@/ui/CalendarScreen')

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

function run(tourId: string, node: React.ReactNode) {
  const tour = getTour(tourId)!
  return render(
    <MemoryRouter initialEntries={['/calendario']}>
      {node}
      {tour.startDest && <HelpDestMark id={tour.startDest} />}
      <TourRunner tour={tour} voiceMode="text" nextOptions={[]} onClose={() => undefined} onPick={() => undefined} missingAfterMs={400} confirmMs={CONFIRM} />
    </MemoryRouter>,
  )
}
const panel = () => screen.getByRole('dialog', { name: /Tutorial:/ })
const says = (t: RegExp | string) => waitFor(() => expect(within(panel()).getByText(t)).toBeTruthy(), { timeout: 2500 })
const btn = (name: RegExp) => within(panel()).getByRole('button', { name })
const next = () => fireEvent.click(btn(/Siguiente/))
const dateInput = () => document.querySelector('[data-help-id="calendar.event-date"] input') as HTMLInputElement
const ring = () => document.querySelector('[data-tour-active="true"]') as HTMLElement | null
const mark = (id: string) => document.querySelector(`[data-help-id="${id}"]`) as HTMLElement | null
// Escribir en un campo y terminar (✓ del teclado de iPhone o tocar fuera = el campo pierde el foco): el capítulo NO avanza mientras se escribe, solo al terminar.
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
    await says(/sin hora, sin «Todo el día» y sin recordatorio/)
    next()
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
  }

  it('al elegir una fecha válida y terminar la selección, avanza solo', async () => {
    await toDateStep()
    fireEvent.change(dateInput(), { target: { value: '2026-11-12' } }) // sin foco en el campo: selección terminada
    await says(/«Empieza» es la hora de inicio/)
    expect(dateInput().value).toBe('2026-11-12') // la fecha elegida se conserva
  })

  it('mientras el selector sigue abierto (el campo con el foco) NO avanza; al cerrarse (pierde el foco) sí', async () => {
    await toDateStep()
    dateInput().focus()
    fireEvent.change(dateInput(), { target: { value: '2026-11-12' } })
    await act(async () => new Promise((r) => setTimeout(r, 150))) // más que la espera sin foco, menos que la espera con foco
    expect(within(panel()).getByText(/Aquí eliges el día/)).toBeTruthy()
    dateInput().blur()
    await says(/«Empieza» es la hora de inicio/)
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
    await says(/«Empieza» es la hora de inicio/)
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
    await says(/«Empieza» es la hora de inicio/)
  })

  it('respeta la validación real: con una fecha fuera de límite no avanza', async () => {
    await toDateStep()
    dateInput().min = '2026-12-01'
    fireEvent.change(dateInput(), { target: { value: '2026-11-12' } }) // por debajo del mínimo: inválida
    await act(async () => new Promise((r) => setTimeout(r, 200)))
    expect(within(panel()).getByText(/Aquí eliges el día/)).toBeTruthy()
  })
})

describe('B4-UX03 · hora y «Todo el día» (capítulo 1)', () => {
  async function toHour() {
    run('cal-crear-evento', eventForm())
    await says(/sin hora, sin «Todo el día»/)
    next()
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
    next()
    await says(/«Empieza» es la hora de inicio/)
  }

  it('recorre la hora y «Todo el día» en el orden de la pantalla y en cada paso señala SU control; avisa de las 00:00', async () => {
    await toHour()
    expect(within(panel()).getByText(/se guarda a las 00:00/)).toBeTruthy()
    expect(mark('calendar.event-time')).toBeTruthy()
    next()
    await says(/«Todo el día» sirve/)
    expect(mark('calendar.event-allday')).toBeTruthy()
    expect(within(panel()).getByText(/Una tarea nunca lleva hora ni «Todo el día»/)).toBeTruthy()
  })

  it('el paso de la hora se omite solo si el evento es de «Todo el día» (no existe ese control) y no hay marco huérfano', async () => {
    run('cal-crear-evento', eventForm())
    await says(/sin hora, sin «Todo el día»/)
    fireEvent.click(screen.getByLabelText(/Todo el día/)) // sin horas
    next()
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Viaje')
    await says(/Aquí eliges el día/)
    next()
    await says(/«Todo el día» sirve/) // saltó la hora sin quedarse mirando un paso vacío
    expect(mark('calendar.event-time')).toBeNull()
  })

  it('«Atrás» no vuelve a un paso que se omitió (no rebota hacia delante)', async () => {
    run('cal-crear-evento', eventForm())
    await says(/sin hora, sin «Todo el día»/)
    fireEvent.click(screen.getByLabelText(/Todo el día/))
    next()
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Viaje')
    await says(/Aquí eliges el día/)
    next()
    await says(/«Todo el día» sirve/)
    fireEvent.click(btn(/Atrás/))
    await says(/Aquí eliges el día/)
  })

  it('el último paso (cerrar el formulario) se omite solo si no hay ✕ y el capítulo termina sin guardar nada', async () => {
    await toHour()
    next()
    await says(/«Todo el día» sirve/)
    next()
    await says(/Ya sabes lo básico de un evento/) // sin la ✕ de la pantalla (aquí solo está el formulario) el paso de cerrar no bloquea
    expect(data.createEvent).not.toHaveBeenCalled()
  })
})

describe('B4-UX04 · «¿Para quién?» y puntos', () => {
  it('Personas: explica privado, la lista, «Toda la familia» y la asignación por nombre, y resalta el selector real', async () => {
    run('tut-calendario-para-quien', eventForm())
    await says(/Si lo creas desde la vista Personal, ya viene marcado/)
    expect(mark('calendar.event-private')).toBeTruthy()
    next()
    await says(/Aquí decides para quién es/) // «Aviso a toda la familia» no sale con este ajuste: se omite solo
    expect(mark('calendar.event-who')?.textContent).toContain('¿Para quién?')
    fireEvent.click(within(mark('calendar.event-who')!).getByRole('button', { name: /Ana/ }))
    await says(/Marca a una o varias personas/)
    const text = within(panel()).getByText(/Marca a una o varias personas/).textContent ?? ''
    expect(text).toMatch(/Toda la familia/)
    expect(text).toMatch(/nombre de un miembro/)
  })

  it('Puntos: con una persona elegida (la autenticada) enseña el campo de puntos real', async () => {
    run('tut-calendario-puntos', eventForm())
    await says(/Los puntos son para UNA persona/)
    next() // sin abrir la lista: «Siguiente» salta los pasos de la ventana, que son opcionales
    await says(/Escribe cuántos puntos gana/)
    expect(mark('calendar.event-points')!.textContent).toContain('Puntos al marcarlo')
  })

  it('con «Toda la familia» el campo de puntos no existe y el capítulo lo explica en vez de inventar nada', async () => {
    run('tut-calendario-puntos', eventForm({ defaultMemberIds: undefined }))
    await says(/Los puntos son para UNA persona/)
    next()
    await says(/No veo el campo de puntos/)
    expect(mark('calendar.event-points')).toBeNull()
  })

  it('no inventa reparto de puntos: con dos personas elegidas tampoco hay campo de puntos', async () => {
    run('tut-calendario-puntos', eventForm({ defaultMemberIds: ['m1', 'm2'] }))
    await says(/Los puntos son para UNA persona/)
    expect(mark('calendar.event-points')).toBeNull()
  })

  it('el formulario de TAREAS no tiene hora, «Todo el día» ni recordatorio (por eso el capítulo 1 lo dice una sola vez)', async () => {
    const { AddTaskForm } = await import('@/ui/CalendarScreen')
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <AddTaskForm members={MEMBERS} categories={[]} defaultDate="2026-11-05" defaultMemberId="m1" onAdded={() => undefined} onManageCategories={() => undefined} />
      </MemoryRouter>,
    )
    const form = document.querySelector('form')!
    expect(within(form).queryByText(/Empieza|Termina|Todo el día|Recordatorio/)).toBeNull()
    expect(within(form).getByText(/Puntos al marcarla "Hecha"/)).toBeTruthy()
  })
})

describe('B4-UX06 · explicación y marco van juntos', () => {
  it('el marco cambia con cada paso y nunca queda un resaltado del paso anterior', async () => {
    // El marcador es un atributo del propio control: en cada paso está en SU control (y en ninguno más), también el de «campo dentro de una etiqueta».
    const marked = () => {
      const all = document.querySelectorAll('[data-tour-active="true"]')
      expect(all.length).toBeLessThanOrEqual(1)
      const el = all[0] as HTMLElement | undefined
      return el ? (el.dataset.helpId ?? (el.querySelector('[data-help-id]') as HTMLElement | null)?.dataset.helpId ?? '') : ''
    }
    run('cal-crear-evento', eventForm())
    await says(/sin hora, sin «Todo el día»/)
    expect(marked()).toBe('') // el paso de bienvenida es solo una explicación: sin marco
    next()
    await says(/Escribe cómo se llama el evento/)
    await waitFor(() => expect(marked()).toBe('calendar.event-title'))
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
    await waitFor(() => expect(marked()).toBe('calendar.event-date'))
    next()
    await says(/«Empieza» es la hora de inicio/)
    await waitFor(() => expect(marked()).toBe('calendar.event-time'))
    next()
    await says(/«Todo el día» sirve/)
    await waitFor(() => expect(marked()).toBe('calendar.event-allday'))
  })

  it('si el control del paso no existe, no se dibuja ningún marco (ni el del paso anterior)', async () => {
    run('cal-crear-evento', eventForm())
    await says(/sin hora, sin «Todo el día»/)
    next()
    await says(/Escribe cómo se llama el evento/)
    await waitFor(() => expect(ring()).toBeTruthy())
    cleanup()
    // Sin el formulario abierto, el paso del título apunta a un control que tampoco existe en esta pantalla de prueba: sin marco.
    run('cal-crear-evento', <div />)
    await act(async () => new Promise((r) => setTimeout(r, 100)))
    expect(ring()).toBeNull()
  })
})

describe('datos del formulario y guardado confirmado', () => {
  it('pausar, volver atrás, avanzar y reiniciar el capítulo NO borra lo que la persona ya escribió', async () => {
    run('cal-crear-evento', eventForm())
    await says(/sin hora, sin «Todo el día»/)
    next()
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

  it('el capítulo «Guardar» termina SOLO cuando el servidor confirma; el evento se guarda con la persona elegida; el capítulo no guarda nada por su cuenta', async () => {
    run('tut-calendario-guardar-evento', eventForm())
    await says(/Este capítulo guarda de verdad/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Elige el día/)
    next()
    await says(/Con título y fecha ya se puede guardar/)
    next()
    await says(/pulsa «Crear evento»/)
    expect(data.createEvent).not.toHaveBeenCalled()
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull() // paso sensible
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }))
    await waitFor(() => expect(data.createEvent).toHaveBeenCalledTimes(1))
    expect(data.createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dentista', memberIds: ['m1'] }))
    // Aquí no hay panel del día (solo el formulario), así que el paso «resultado» se omite y llega el final.
    await says(/Ya sabes crear un evento/)
    expect(within(panel()).getByRole('button', { name: /Cerrar/ })).toBeTruthy()
    expect(within(panel()).getByRole('button', { name: /Repetir/ })).toBeTruthy()
  })

  it('si el guardado falla, el capítulo no da el evento por creado', async () => {
    data.createEvent.mockRejectedValueOnce(new Error('Sin conexión'))
    run('tut-calendario-guardar-evento', eventForm())
    await says(/Este capítulo guarda de verdad/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Elige el día/)
    next()
    next()
    await says(/pulsa «Crear evento»/)
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }))
    await screen.findByText(/Sin conexión/)
    expect(within(panel()).getByText(/pulsa «Crear evento»/)).toBeTruthy()
  })
})
