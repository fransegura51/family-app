// @vitest-environment jsdom
// Calendario (grupo g1): visita, tutoriales y explicaciones contra la pantalla REAL de Calendario (CalendarScreen) con los datos simulados. La persona (la prueba) toca los controles de
// verdad; el tutorial avanza al comprobar cada acción y los pasos que guardan solo terminan cuando la pantalla confirma el guardado. NO sustituye la prueba en un móvil real.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, FamilyMember, Profile } from '@/domain/types'

const todayStr = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const at = (hhmm: string) => new Date(`${todayStr}T${hhmm}`).toISOString()
const baseEvent = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e1',
  familyId: 'f',
  title: 'Dentista de Eric',
  description: null,
  startAt: at('10:00'),
  endAt: at('11:00'),
  allDay: false,
  color: null,
  recurrenceRule: null,
  exceptionDates: [],
  reminders: [],
  memberIds: ['m1'],
  points: 3,
  attachmentStoragePath: null,
  attachmentKind: null,
  attachmentOriginalName: null,
  locationLabel: null,
  locationLatitude: null,
  locationLongitude: null,
  note: null,
  visibility: 'shared',
  kind: 'event',
  categoryId: null,
  ...over,
})
const member = (id: string, name: string): FamilyMember =>
  ({ id, familyId: 'f', name, avatar: '🙂', color: '#4c6ef5', memberType: 'adult', birthDate: null, sex: null, weightGoalKg: null, birthdayFavorite: false, permissions: {}, linkedProfileId: id === 'm1' ? 'p1' : null, photoPath: null, allowedSections: null, joinedAt: '2020-01-01' }) as FamilyMember

const data = vi.hoisted(() => ({
  events: [] as unknown[],
  complete: vi.fn(async () => undefined),
  update: vi.fn(async () => undefined),
  addNote: vi.fn(async () => undefined),
  createEvent: vi.fn(async () => 'new'),
}))
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }) }))
vi.mock('@/data/calendar', async (orig) => ({
  ...(await orig<typeof import('@/data/calendar')>()),
  listUpcomingEvents: async () => data.events,
  listEventCompletions: async () => [],
  listCalendarCategories: async () => [],
  getCalendarPreferences: async () => ({ colorMode: 'categorias', taskOrder: 'eventos_primero', taskCompletion: { strikethrough: true, doneColor: null, moveCompletedToEnd: false } }),
  completeEventOccurrence: data.complete,
  updateEvent: data.update,
  createEvent: data.createEvent,
}))
vi.mock('@/data/family', async (orig) => ({ ...(await orig<typeof import('@/data/family')>()), listFamilyMembers: async () => [member('m1', 'Ana'), member('m2', 'Eric')] }))
vi.mock('@/data/contacts', async (orig) => ({ ...(await orig<typeof import('@/data/contacts')>()), listContacts: async () => [] }))
vi.mock('@/data/personalNotes', async (orig) => ({ ...(await orig<typeof import('@/data/personalNotes')>()), listPersonalNotes: async () => [], addPersonalNote: data.addNote }))
vi.mock('@/data/externalCalendarFeeds', async (orig) => ({
  ...(await orig<typeof import('@/data/externalCalendarFeeds')>()),
  listExternalEvents: async () => [],
  listFeeds: async () => [],
  listHolidayDates: async () => new Set<string>(),
  listExternalEventDismissals: async () => [],
  listExternalEventCompletions: async () => [],
}))
vi.mock('@/data/notifications', async (orig) => ({ ...(await orig<typeof import('@/data/notifications')>()), getTaskNotifyModeCached: async () => null }))
vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const { TourRunner } = await import('@/help/tours/TourRunner')
const { getTour } = await import('@/help/tours/registry')
const { HelpDestMark } = await import('@/help/ui/HelpDest')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const { CalendarScreen } = await import('@/ui/CalendarScreen')
const { EXPLAINERS_G1 } = await import('@/help/explainers/groups/g1')
const { TOURS_G1 } = await import('@/help/tours/defs/groups/g1')

const PROFILE = { id: 'p1', familyId: 'f', role: 'admin', allowedSections: null } as unknown as Profile
const CONFIRM = { focused: 400, blurred: 40, afterBlur: 20 }

function run(tourId: string) {
  const tour = getTour(tourId)!
  return render(
    <MemoryRouter initialEntries={['/calendario']}>
      <CalendarScreen profile={PROFILE} />
      {tour.startDest && <HelpDestMark id={tour.startDest} />}
      <TourRunner tour={tour} voiceMode="text" nextOptions={[]} onClose={() => undefined} onPick={() => undefined} missingAfterMs={600} confirmMs={CONFIRM} />
    </MemoryRouter>,
  )
}
const panel = () => screen.getByRole('dialog', { name: /Tutorial:/ })
const says = (t: RegExp | string) => waitFor(() => expect(within(panel()).getByText(t)).toBeTruthy(), { timeout: 3000 })
const mark = (id: string) => document.querySelector(`[data-help-id="${id}"]`) as HTMLElement | null
const waitMark = (id: string) => waitFor(() => expect(mark(id)).toBeTruthy(), { timeout: 3000 })

beforeEach(() => {
  setTargetVisibilityForTests(() => true)
  data.events = [baseEvent({})]
  data.complete.mockClear()
  data.update.mockClear()
  data.addNote.mockClear()
  localStorage.clear()
})
afterEach(() => {
  setTargetVisibilityForTests(null)
  cleanup()
})

describe('Calendario · definiciones del grupo g1', () => {
  it('hay una visita y nueve tutoriales, con ids únicos, módulo calendario y sin duplicar los pilotos', () => {
    const ids = TOURS_G1.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('cal-crear-evento')
    expect(ids).not.toContain('cal-crear-tarea')
    expect(TOURS_G1.filter((t) => t.kind === 'visit').map((t) => t.id)).toEqual(['visita-calendario'])
    expect(TOURS_G1.filter((t) => (t.kind ?? 'tutorial') === 'tutorial')).toHaveLength(9)
    for (const t of TOURS_G1) expect(t.module).toBe('calendario')
  })

  it('la visita es solo informativa: 4-8 pasos, sin señales, sin pasos sensibles y con el primer paso visible con el calendario vacío', () => {
    const v = TOURS_G1.find((t) => t.id === 'visita-calendario')!
    expect(v.steps.length).toBeGreaterThanOrEqual(4)
    expect(v.steps.length).toBeLessThanOrEqual(8)
    for (const s of v.steps) {
      expect(s.completeOn).toEqual([])
      expect(s.manualNext).toBe(true)
      expect(s.sensitive).toBeFalsy()
      expect(s.target, s.id).toBeTruthy()
    }
    expect(v.steps[0].optional).toBeFalsy()
    expect(v.steps[0].target).toBe('calendar.menu')
  })

  it('todo lo que guarda es un paso sensible que espera el aviso de la pantalla; ningún tutorial borra ni envía', () => {
    for (const t of TOURS_G1) {
      for (const s of t.steps) {
        if (s.sensitive) expect(s.completeOn.every((c) => c.type === 'event'), `${t.id}/${s.id}`).toBe(true)
        // Nada que borre o envíe: ningún paso señala «Eliminar», compartir ni el botón de borrar.
        expect(s.target ?? '', `${t.id}/${s.id}`).not.toMatch(/delete|remove|share|eliminar/)
      }
    }
  })

  it('las explicaciones citan solo archivos que existen y textos de interfaz que están en el código', () => {
    const SRC = import.meta.glob(['/src/ui/**/*.tsx', '/src/domain/**/*.ts', '/src/state/**/*.ts', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const corpus = Object.values(SRC).join('\n')
    expect(EXPLAINERS_G1.map((e) => e.id)).toEqual([
      'exp-calendario-repeticiones',
      'exp-calendario-puntos',
      'exp-calendario-recordatorios',
      'exp-calendario-quien-recibe-avisos',
      'exp-calendario-privado-familiar',
    ])
    for (const e of EXPLAINERS_G1) {
      expect(e.verified).toBe('2026-10-23')
      expect(e.sections.length).toBeGreaterThanOrEqual(3)
      expect(e.sections.length).toBeLessThanOrEqual(6)
      for (const f of e.basedOn) expect(() => readFileSync(f), `${e.id}: ${f}`).not.toThrow()
      for (const l of e.labels ?? []) expect(corpus.includes(l), `${e.id}: «${l}» no está en el código`).toBe(true)
      if (e.tour) expect(TOURS_G1.some((t) => t.id === e.tour), `${e.id}: tutorial ${e.tour}`).toBe(true)
    }
  })
})

describe('Calendario · pantalla real', () => {
  it('Cambiar de vista: menú → vista elegida; el menú y las ocho vistas llevan marca y cambiar de vista no guarda nada', async () => {
    run('tut-calendario-cambiar-vista')
    await says(/Pulsa «☰ Menú»/)
    await waitMark('calendar.menu')
    fireEvent.click(mark('calendar.menu')!)
    await says(/Elige la vista que quieras/)
    for (const v of ['inicio', 'mes', 'semana', '3-dias', 'dia', 'familiar', 'agenda', 'personal']) expect(mark(`calendar.view-${v}`), v).toBeTruthy()
    fireEvent.click(mark('calendar.view-semana')!)
    await says(/Ya estás en esa vista/)
    expect(data.update).not.toHaveBeenCalled()
    expect(data.createEvent).not.toHaveBeenCalled()
  })

  it('Filtrar por persona: abrir → elegir una persona → informativos', async () => {
    run('tut-calendario-filtrar-persona')
    await says(/Pulsa «Filtrar por»/)
    await waitMark('calendar.filter')
    fireEvent.click(within(mark('calendar.filter')!).getByRole('button', { name: /Filtrar por/ }))
    await says(/Toca a una persona/)
    await waitFor(() => expect(document.querySelectorAll('[data-help-id="calendar.filter-person"]').length).toBe(2))
    fireEvent.click(document.querySelectorAll('[data-help-id="calendar.filter-person"]')[1])
    await says(/Cierra la ventana con la ✕/)
    expect(within(mark('calendar.filter')!).getByText(/Filtrar por: Eric/)).toBeTruthy()
  })

  it('Marcar como hecho: el clic no basta para el paso final… pero la marca solo sale en un apunte pendiente y el paso termina cuando se guardó', async () => {
    run('tut-calendario-marcar-hecho')
    await says(/Aquí están los apuntes del día elegido/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/Cada evento o tarea pendiente tiene un círculo/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/Cuando quieras, toca tú el círculo/)
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull() // paso sensible: sin «Siguiente»
    expect(data.complete).not.toHaveBeenCalled() // el tutorial no marca nada por su cuenta
    fireEvent.click(mark('calendar.entry-complete')!) // la persona lo marca
    await waitFor(() => expect(data.complete).toHaveBeenCalledTimes(1))
    expect(data.complete).toHaveBeenCalledWith('e1', todayStr, 'm1', 3) // los puntos van a la única persona asignada
    await says(/Hecho\. Si te has equivocado/)
  })

  it('Editar un evento: tocar el apunte abre el formulario; «Guardar» solo termina el tutorial cuando se guardó de verdad', async () => {
    run('tut-calendario-editar-evento')
    await says(/Toca el evento \(o la tarea\)/)
    await waitMark('calendar.entry-edit')
    fireEvent.click(mark('calendar.entry-edit')!)
    await says(/Aquí cambias el título/)
    await waitMark('calendar.edit-title')
    for (const id of ['calendar.edit-date', 'calendar.edit-repeat', 'calendar.edit-reminder', 'calendar.edit-who', 'calendar.edit-points', 'calendar.edit-save', 'calendar.edit-cancel']) expect(mark(id), id).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Saltar los datos/ }))
    await says(/«¿Para quién\?» cambia las personas asignadas/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/Cuando lo tengas, pulsa «Guardar»/) // el evento no se repite: el paso de la serie se omite solo
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull()
    expect(data.update).not.toHaveBeenCalled()
    fireEvent.change(mark('calendar.edit-title') as HTMLInputElement, { target: { value: 'Dentista de Eric (revisión)' } })
    fireEvent.click(mark('calendar.edit-save')!)
    await waitFor(() => expect(data.update).toHaveBeenCalledTimes(1))
    await says(/Los cambios ya están guardados/)
  })

  it('Editar una serie: aparece «Guardar cambios en» y el paso lo explica', async () => {
    data.events = [baseEvent({ recurrenceRule: 'FREQ=WEEKLY' })]
    run('tut-calendario-editar-evento')
    await waitMark('calendar.entry-edit')
    fireEvent.click(mark('calendar.entry-edit')!)
    await says(/Aquí cambias el título/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Saltar los datos/ }))
    await says(/«¿Para quién\?» cambia/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/Como esto se repite/)
    expect(mark('calendar.edit-scope')).toBeTruthy()
    expect(within(mark('calendar.edit-scope')!).getByText('Solo esta repetición')).toBeTruthy()
  })

  it('Nota personal: menú → Personal → escribir → «+ Añadir» (el paso final espera el guardado)', async () => {
    run('tut-calendario-nota-personal')
    await says(/Las notas personales están en la vista Personal/)
    await waitMark('calendar.menu')
    fireEvent.click(mark('calendar.menu')!)
    await says(/Toca «Personal»/)
    fireEvent.click(mark('calendar.view-personal')!)
    await says(/Aquí apuntas notas solo para ti/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
    await says(/Escribe tu nota/)
    const input = mark('calendar.note-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Llamar a la abuela' } })
    fireEvent.focusOut(input)
    await says(/Pulsa «\+ Añadir» para guardarla/)
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull()
    expect(data.addNote).not.toHaveBeenCalled()
    fireEvent.click(mark('calendar.note-add')!)
    await waitFor(() => expect(data.addNote).toHaveBeenCalledWith(todayStr, 'Llamar a la abuela'))
    await says(/Nota guardada en ese día/)
  })

  it('Tarea repetitiva y evento con recordatorio: arrancan con el formulario abierto y la ventana de opciones tiene sus marcas', async () => {
    const view = run('tut-calendario-tarea-repetitiva')
    await says(/Escribe qué hay que hacer cada vez/)
    expect(mark('calendar.task-title')).toBeTruthy()
    fireEvent.click(within(mark('calendar.task-repeat')!).getByRole('button', { name: /Repetición/ }))
    await waitMark('calendar.repeat-presets')
    expect(mark('calendar.repeat-close')).toBeTruthy()
    fireEvent.click(within(mark('calendar.repeat-presets')!).getByRole('button', { name: 'Todas las semanas' }))
    await waitMark('calendar.repeat-until')
    expect(mark('calendar.repeat-holidays')).toBeTruthy()
    view.unmount()

    run('tut-calendario-evento-recordatorio')
    await says(/Escribe cómo se llama el evento/)
    fireEvent.click(within(mark('calendar.event-reminder')!).getByRole('button', { name: /Recordatorio/ }))
    await waitMark('calendar.reminder-presets')
    expect(mark('calendar.reminder-close')).toBeTruthy()
    expect(within(mark('calendar.reminder-presets')!).getByRole('button', { name: /1 día antes de que empiece/ })).toBeTruthy()
  })

  it('Puntos: el campo de puntos solo sale con una persona y la ventana de «¿Para quién?» tiene lista y ✕ marcadas', async () => {
    run('tut-calendario-puntos')
    await says(/Escribe qué hay que hacer, por ejemplo/)
    fireEvent.click(within(mark('calendar.task-who')!).getByRole('button', { name: /Ana/ }))
    await waitMark('calendar.who-list')
    expect(mark('calendar.who-close')).toBeTruthy()
    expect(mark('calendar.task-points')).toBeTruthy()
    fireEvent.click(within(mark('calendar.who-list')!).getByText('Eric')) // ahora hay dos personas: no hay puntos
    await waitFor(() => expect(mark('calendar.task-points')).toBeNull())
    await act(async () => undefined)
  })

  it('La visita señala controles que existen en la pantalla real', async () => {
    const tour = getTour('visita-calendario')!
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <CalendarScreen profile={PROFILE} />
      </MemoryRouter>,
    )
    await waitMark('calendar.menu')
    await waitMark('calendar.entry-edit')
    for (const s of tour.steps) expect(mark(s.target!), s.id).toBeTruthy()
  })
})
