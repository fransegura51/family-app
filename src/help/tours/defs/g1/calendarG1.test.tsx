// @vitest-environment jsdom
// Calendario (grupos g1 y g8): visita, capítulos de las tres series y explicaciones contra la pantalla REAL de Calendario (CalendarScreen) con los datos simulados. La persona (la prueba) toca los
// controles de verdad; el capítulo avanza al comprobar cada acción y los pasos que guardan solo terminan cuando la pantalla confirma el guardado. NO sustituye la prueba en un móvil real.
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
vi.mock('@/data/notifications', async (orig) => ({ ...(await orig<typeof import('@/data/notifications')>()), getTaskNotifyModeCached: async () => null, getNotifyModesCached: async () => ({ task: null, event: null }) }))
vi.mock('@/services/voice', () => ({ isSpeechSupported: () => false, primeSpeech: () => undefined, speakAsync: async () => undefined, stopSpeech: () => undefined }))

const { TourRunner } = await import('@/help/tours/TourRunner')
const { getTour, TOURS } = await import('@/help/tours/registry')
const { reduceTour, startState } = await import('@/help/tours/engine')
const { setTargetVisibilityForTests } = await import('@/help/tours/domTargets')
const { CalendarScreen } = await import('@/ui/CalendarScreen')
const { EXPLAINERS_G1 } = await import('@/help/explainers/groups/g1')
const { TOURS_G1 } = await import('@/help/tours/defs/groups/g1')
const { SERIES_A } = await import('@/help/tours/series/a')
const { ALIASES_A } = await import('@/help/tours/aliases/a')

const PROFILE = { id: 'p1', familyId: 'f', role: 'admin', allowedSections: null } as unknown as Profile
const CONFIRM = { focused: 400, blurred: 40, afterBlur: 20 }

function run(tourId: string) {
  const tour = getTour(tourId)!
  return render(
    <MemoryRouter initialEntries={['/calendario']}>
      <CalendarScreen profile={PROFILE} />
      <TourRunner tour={tour} voiceMode="text" nextOptions={[]} onClose={() => undefined} onPick={() => undefined} missingAfterMs={600} confirmMs={CONFIRM} />
    </MemoryRouter>,
  )
}
const panel = () => screen.getByRole('dialog', { name: /Tutorial:/ })
const says = (t: RegExp | string) => waitFor(() => expect(within(panel()).getByText(t)).toBeTruthy(), { timeout: 3000 })
const next = () => fireEvent.click(within(panel()).getByRole('button', { name: /Siguiente/ }))
const mark = (id: string) => document.querySelector(`[data-help-id="${id}"]`) as HTMLElement | null
const waitMark = (id: string) => waitFor(() => expect(mark(id)).toBeTruthy(), { timeout: 3000 })
const typeAndLeave = (el: Element, value: string) => {
  fireEvent.change(el, { target: { value } })
  fireEvent.focusOut(el)
}

beforeEach(() => {
  setTargetVisibilityForTests(() => true)
  data.events = [baseEvent({})]
  data.complete.mockClear()
  data.update.mockClear()
  data.addNote.mockClear()
  data.createEvent.mockClear()
  localStorage.clear()
})
afterEach(() => {
  setTargetVisibilityForTests(null)
  cleanup()
})

describe('Calendario · definiciones', () => {
  it('hay una visita y trece capítulos en g1, con ids únicos y módulo calendario; los pilotos viven en su archivo', () => {
    const ids = TOURS_G1.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('cal-crear-evento')
    expect(TOURS_G1.filter((t) => t.kind === 'visit').map((t) => t.id)).toEqual(['visita-calendario'])
    expect(TOURS_G1.filter((t) => (t.kind ?? 'tutorial') === 'tutorial')).toHaveLength(13)
    for (const t of TOURS_G1) expect(t.module).toBe('calendario')
  })

  it('la visita es solo informativa: 4-8 pasos, sin señales, sin pasos sensibles, sin «Editar» del menú ☰ y con el primer paso visible con el calendario vacío', () => {
    const v = TOURS_G1.find((t) => t.id === 'visita-calendario')!
    expect(v.steps.length).toBeGreaterThanOrEqual(4)
    expect(v.steps.length).toBeLessThanOrEqual(8)
    for (const s of v.steps) {
      expect(s.completeOn).toEqual([])
      expect(s.manualNext).toBe(true)
      expect(s.sensitive).toBeFalsy()
      expect(s.target, s.id).toBeTruthy()
      expect(s.text, s.id).not.toMatch(/✏️ Editar|Al abrir/)
    }
    expect(v.steps[0].optional).toBeFalsy()
    expect(v.steps[0].target).toBe('calendar.menu')
    expect(v.steps.find((s) => s.id === 'hecho')!.text).toMatch(/Tarea/)
    expect(v.steps.find((s) => s.id === 'nueva-tarea')!.text).toMatch(/Todo el día/)
  })

  it('todo lo que guarda es un paso sensible que espera el aviso de la pantalla; ningún capítulo borra ni envía', () => {
    for (const t of TOURS.filter((x) => x.module === 'calendario')) {
      for (const s of t.steps) {
        if (s.sensitive) expect(s.completeOn.every((c) => c.type === 'event'), `${t.id}/${s.id}`).toBe(true)
        // Nada que borre: ningún paso señala «Eliminar» ni el botón de borrar. «Compartir» solo señala el icono y nunca espera un clic.
        expect(s.target ?? '', `${t.id}/${s.id}`).not.toMatch(/delete|remove|eliminar/)
        if (/share/.test(s.target ?? '')) expect(s.completeOn, `${t.id}/${s.id}`).toEqual([])
      }
    }
  })

  it('«Borrar un apunte» solo se cuenta: sin marcas, sin señales y sin pasos sensibles', () => {
    const t = getTour('tut-calendario-borrar-apunte')!
    for (const s of t.steps) {
      expect(s.target).toBeUndefined()
      expect(s.completeOn).toEqual([])
      expect(s.sensitive).toBeFalsy()
    }
  })

  it('las tres series existen, sus capítulos son tutoriales de Calendario y el primer paso de cada uno nunca es opcional', () => {
    expect(SERIES_A.map((s) => s.id)).toEqual(['ser-calendario-moverte', 'ser-calendario-crear', 'ser-calendario-gestionar'])
    for (const s of SERIES_A)
      for (const id of s.chapters) {
        const t = TOURS.find((x) => x.id === id)!
        expect(t, id).toBeTruthy()
        expect(t.module).toBe('calendario')
        expect(t.steps[0].optional, `${id}: el primer paso no puede ser opcional`).toBeFalsy()
      }
    expect(TOURS.filter((t) => t.module === 'calendario' && (t.kind ?? 'tutorial') === 'tutorial')).toHaveLength(SERIES_A.flatMap((s) => s.chapters).length)
  })

  it('«Crear eventos y tareas»: todos los capítulos arrancan con el formulario abierto, solo el último guarda y los intermedios terminan cerrando SIN guardar', () => {
    const crear = SERIES_A.find((s) => s.id === 'ser-calendario-crear')!
    crear.chapters.forEach((id, i) => {
      const t = getTour(id)!
      expect(t.startDest, id).toBe('calendario.nuevo-evento')
      const saves = t.steps.filter((s) => s.completeOn.some((c) => c.type === 'event'))
      if (i < crear.chapters.length - 1) {
        expect(saves, `${id}: no debe guardar`).toHaveLength(0)
        const last = t.steps[t.steps.length - 1]
        expect(last.target, `${id}: el último paso cierra el formulario`).toBe('calendar.event-close')
        expect(last.optional).toBe(true)
      } else {
        expect(saves).toHaveLength(1)
        expect(saves[0].sensitive).toBe(true)
        expect(saves[0].completeOn).toEqual([{ type: 'event', name: 'calendar.event-created' }])
        expect(t.steps[0].text, 'el primer paso avisa de que se guarda de verdad').toMatch(/guarda de verdad/)
        expect(t.steps[0].text).toMatch(/cierra con la ✕/)
        expect(saves[0].missingText).toMatch(/sin guardar/)
      }
    })
    // La diferencia tarea/evento se dice una sola vez, en el capítulo 1.
    expect(getTour('cal-crear-evento')!.steps[0].text).toMatch(/sin hora, sin «Todo el día» y sin recordatorio/)
  })

  it('los identificadores antiguos fusionados siguen funcionando por alias', () => {
    expect(ALIASES_A).toEqual({ 'cal-crear-tarea': 'cal-crear-evento', 'tut-calendario-tarea-repetitiva': 'tut-calendario-evento-repetitivo' })
    expect(getTour('cal-crear-tarea')!.id).toBe('cal-crear-evento')
    expect(getTour('tut-calendario-tarea-repetitiva')!.id).toBe('tut-calendario-evento-repetitivo')
  })

  it('el texto de Ayuda no menciona lo que ya no existe ni afirma lo que el código no hace', () => {
    for (const t of TOURS.filter((x) => x.module === 'calendario')) {
      const all = [t.finishText, ...t.steps.flatMap((s) => [s.text, ...(s.details ?? []).map((d) => d.text), s.missingText ?? ''])].join('\n')
      expect(all, t.id).not.toMatch(/✏️ Editar|⭐ Al abrir/)
      expect(all, t.id).not.toMatch(/título, fecha y nota/)
    }
    // Compartir: la nota NO se manda.
    expect(getTour('tut-calendario-compartir')!.steps[0].text).toMatch(/nota[^.]*no va/)
    // Hora opcional y primer preset real.
    expect(getTour('cal-crear-evento')!.steps.find((s) => s.id === 'hora')!.text).toMatch(/00:00/)
    expect(getTour('tut-calendario-evento-repetitivo')!.steps.find((s) => s.id === 'opciones')!.text).toMatch(/«Ninguno»/)
    // Asignación por el nombre del título.
    expect(getTour('tut-calendario-para-quien')!.steps.find((s) => s.id === 'lista')!.text).toMatch(/nombre de un miembro/)
  })

  it('las explicaciones citan solo archivos que existen y textos de interfaz que están en el código, y su tutorial existe', () => {
    const SRC = import.meta.glob(['/src/ui/**/*.tsx', '/src/domain/**/*.ts', '/src/state/**/*.ts', '/src/services/**/*.ts', '!/src/**/*.test.*'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const corpus = Object.values(SRC).join('\n')
    expect(EXPLAINERS_G1.map((e) => e.id)).toEqual([
      'exp-calendario-repeticiones',
      'exp-calendario-puntos',
      'exp-calendario-recordatorios',
      'exp-calendario-quien-recibe-avisos',
      'exp-calendario-privado-familiar',
      'exp-calendario-que-hace-pepa-al-crear',
      'exp-calendario-contenido-compartir',
    ])
    for (const e of EXPLAINERS_G1) {
      expect(['2026-10-23', '2026-10-25']).toContain(e.verified)
      expect(e.sections.length).toBeGreaterThanOrEqual(3)
      expect(e.sections.length).toBeLessThanOrEqual(6)
      for (const f of e.basedOn) expect(() => readFileSync(f), `${e.id}: ${f}`).not.toThrow()
      for (const l of e.labels ?? []) expect(corpus.includes(l), `${e.id}: «${l}» no está en el código`).toBe(true)
      if (e.tour) expect(getTour(e.tour), `${e.id}: tutorial ${e.tour}`).toBeTruthy()
    }
    // No se promete que la nota se comparta.
    const share = EXPLAINERS_G1.find((e) => e.id === 'exp-calendario-contenido-compartir')!
    expect(JSON.stringify(share)).toMatch(/NO van en ese texto/)
  })
})

describe('Calendario · marcas nuevas en la pantalla real', () => {
  it('Mes e Inicio: la cuadrícula del mes y las flechas ‹ › del día (distintas de las del mes) llevan marca', async () => {
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <CalendarScreen profile={PROFILE} />
      </MemoryRouter>,
    )
    await waitMark('calendar.month-grid')
    expect(mark('calendar.month-nav')).toBeTruthy()
    for (const id of ['calendar.day-nav', 'calendar.day-prev', 'calendar.day-next']) expect(mark(id), id).toBeTruthy()
    expect(mark('calendar.month-nav')!.contains(mark('calendar.day-prev'))).toBe(false) // las flechas del día NO son las del mes
    expect(mark('calendar.day-panel')!.contains(mark('calendar.day-next'))).toBe(true)
  })

  it('el formulario de evento y el de tarea tienen su ✕ (cerrar sin guardar) y sus tres iconos con marca propia', async () => {
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <CalendarScreen profile={PROFILE} />
      </MemoryRouter>,
    )
    await waitMark('calendar.new-event')
    fireEvent.click(mark('calendar.new-event')!)
    await waitMark('calendar.event-title')
    for (const id of ['calendar.event-close', 'calendar.event-location', 'calendar.event-attachment', 'calendar.event-note', 'calendar.event-allday', 'calendar.event-time']) expect(mark(id), id).toBeTruthy()
    fireEvent.click(mark('calendar.event-close')!)
    await waitFor(() => expect(mark('calendar.event-title')).toBeNull())
    fireEvent.click(mark('calendar.new-task')!)
    await waitMark('calendar.task-title')
    for (const id of ['calendar.task-close', 'calendar.task-location', 'calendar.task-attachment', 'calendar.task-note']) expect(mark(id), id).toBeTruthy()
    // una tarea no tiene hora, «Todo el día» ni recordatorio
    for (const id of ['calendar.task-time', 'calendar.task-allday', 'calendar.task-reminder']) expect(mark(id), id).toBeNull()
    expect(within(mark('calendar.task-title')!.closest('form')!).queryByText(/Todo el día|Recordatorio|Empieza/)).toBeNull()
    fireEvent.click(mark('calendar.task-close')!)
    await waitFor(() => expect(mark('calendar.task-title')).toBeNull())
  })

  it('la edición tiene marca en «Todo el día», la categoría, el bloque de extras y sus tres iconos', async () => {
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <CalendarScreen profile={PROFILE} />
      </MemoryRouter>,
    )
    await waitMark('calendar.entry-edit')
    fireEvent.click(mark('calendar.entry-edit')!)
    await waitMark('calendar.edit-title')
    for (const id of ['calendar.edit-allday', 'calendar.edit-category', 'calendar.edit-extras', 'calendar.edit-location', 'calendar.edit-attachment', 'calendar.edit-note', 'calendar.edit-private', 'calendar.edit-cancel']) expect(mark(id), id).toBeTruthy()
  })

  it('un apunte que se repite lleva la marca de la fila; uno que no se repite, no', async () => {
    data.events = [baseEvent({ recurrenceRule: 'FREQ=WEEKLY' })]
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <CalendarScreen profile={PROFILE} />
      </MemoryRouter>,
    )
    await waitMark('calendar.entry-recurring')
    cleanup()
    data.events = [baseEvent({})]
    render(
      <MemoryRouter initialEntries={['/calendario']}>
        <CalendarScreen profile={PROFILE} />
      </MemoryRouter>,
    )
    await waitMark('calendar.entry-edit')
    expect(mark('calendar.entry-recurring')).toBeNull()
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

describe('Serie «Moverte por tu calendario»', () => {
  it('Vistas: menú → «Sacar» → vista elegida; el menú y las ocho vistas llevan marca y cambiar de vista no guarda nada', async () => {
    run('tut-calendario-cambiar-vista')
    await says(/Pulsa «☰ Menú»/)
    await waitMark('calendar.menu')
    fireEvent.click(mark('calendar.menu')!)
    await says(/«📌 Sacar» la pone como botón suelto/)
    expect(mark('calendar.menu-pin')).toBeTruthy()
    next()
    await says(/Elige la vista que quieras/)
    for (const v of ['inicio', 'mes', 'semana', '3-dias', 'dia', 'familiar', 'agenda', 'personal']) expect(mark(`calendar.view-${v}`), v).toBeTruthy()
    fireEvent.click(mark('calendar.view-semana')!)
    await says(/Ya estás en esa vista/)
    expect(data.update).not.toHaveBeenCalled()
    expect(data.createEvent).not.toHaveBeenCalled()
  })

  it('Días y meses: desde Inicio salta el menú, explica las flechas del mes, la cuadrícula, las del día y la fecha, y termina al elegir', async () => {
    run('tut-calendario-saltar-fecha')
    await says(/Las flechas ‹ › de ARRIBA cambian de mes, no de día/) // ya estás en Inicio: los dos primeros pasos se omiten
    next()
    await says(/Toca un día del mes/)
    next()
    await says(/Las flechas ‹ › de DEBAJO cambian de día/)
    fireEvent.click(mark('calendar.day-next')!) // la persona pulsa la flecha del día: el paso se da por hecho
    await says(/Para ir lejos sin pulsar muchas flechas/)
    fireEvent.click(mark('calendar.date-jump')!)
    await says(/Elige el día en el selector/)
    fireEvent.change(mark('calendar.date-jump-input')!, { target: { value: '2026-12-24' } })
    await says(/La fecha pulsable también está en Personal/)
  })

  it('Filtrar por persona: abrir → elegir una persona → cerrar con la ✕ marcada → cómo quitarlo', async () => {
    run('tut-calendario-filtrar-persona')
    await says(/Pulsa «Filtrar por»/)
    await waitMark('calendar.filter')
    fireEvent.click(within(mark('calendar.filter')!).getByRole('button', { name: /Filtrar por/ }))
    await says(/Toca a una persona/)
    await waitFor(() => expect(document.querySelectorAll('[data-help-id="calendar.filter-person"]').length).toBe(2))
    fireEvent.click(document.querySelectorAll('[data-help-id="calendar.filter-person"]')[1])
    await says(/Cierra la ventana con la ✕/)
    expect(within(mark('calendar.filter')!).getByText(/Filtrar por: Eric/)).toBeTruthy()
    fireEvent.click(mark('calendar.filter-close')!)
    await says(/Para volver a verlo todo/)
  })

  it('Filtrar por persona en la vista Personal: el control no existe y el capítulo lo explica con su propio mensaje', async () => {
    run('tut-calendario-filtrar-persona')
    await waitMark('calendar.menu')
    fireEvent.click(mark('calendar.menu')!)
    fireEvent.click(await waitFor(() => mark('calendar.view-personal')!))
    await waitFor(() => expect(mark('calendar.filter')).toBeNull())
    await says(/«Filtrar por» no sale en la vista Personal/)
  })

  it('Personal y notas: menú → Personal → escribir → «+ Añadir» (el paso final espera el guardado) → compartir y borrar notas', async () => {
    run('tut-calendario-nota-personal')
    await says(/Tus notas y lo privado están en la vista Personal/)
    await waitMark('calendar.menu')
    fireEvent.click(mark('calendar.menu')!)
    await says(/Toca «Personal»/)
    fireEvent.click(mark('calendar.view-personal')!)
    await says(/Personal enseña lo tuyo/)
    expect(mark('calendar.day-nav')).toBeTruthy() // las flechas ‹ › que menciona el texto están a la vista
    next()
    await says(/Escribe tu nota/)
    const input = mark('calendar.note-input') as HTMLInputElement
    typeAndLeave(input, 'Llamar a la abuela')
    await says(/Pulsa «\+ Añadir» para guardarla/)
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull()
    expect(data.addNote).not.toHaveBeenCalled()
    fireEvent.click(mark('calendar.note-add')!)
    await waitFor(() => expect(data.addNote).toHaveBeenCalledWith(todayStr, 'Llamar a la abuela'))
    await says(/Cada nota tiene su 📤/)
    next()
    await says(/Nota guardada en ese día/)
  })
})

describe('Serie «Crear eventos y tareas»', () => {
  it('1 · Crear un evento: empieza con el formulario abierto, dice qué cambia en una tarea y termina cerrando sin guardar', async () => {
    run('cal-crear-evento')
    await says(/sin hora, sin «Todo el día» y sin recordatorio/)
    expect(mark('calendar.event-title')).toBeTruthy()
    next()
    await says(/Escribe cómo se llama el evento/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista')
    await says(/Aquí eliges el día/)
    next()
    await says(/00:00/)
    next()
    await says(/«Todo el día» sirve/)
    next()
    await says(/No se ha guardado nada/)
    fireEvent.click(mark('calendar.event-close')!)
    await says(/Ya sabes lo básico de un evento/)
    expect(data.createEvent).not.toHaveBeenCalled()
  })

  it('2 · Personas y categorías: privado, aviso (solo si sale), lista de personas con la asignación por nombre, categoría y cerrar sin guardar', async () => {
    run('tut-calendario-para-quien')
    await says(/Si lo creas desde la vista Personal, ya viene marcado/)
    next()
    await says(/Aquí decides para quién es/) // «Aviso a toda la familia» no sale con este ajuste: se omite solo
    fireEvent.click(within(mark('calendar.event-who')!).getByRole('button', { name: /Ana/ }))
    await says(/Marca a una o varias personas/)
    expect(within(panel()).getByText(/nombre de un miembro/)).toBeTruthy()
    next()
    await says(/Cierra esta ventana con la ✕/)
    fireEvent.click(mark('calendar.who-close')!)
    await says(/«Categoría \(opcional\)»/)
    expect(mark('calendar.event-category')).toBeTruthy()
    next()
    await says(/No se ha guardado nada/)
    fireEvent.click(mark('calendar.event-close')!)
    await says(/En una tarea es igual/)
    expect(data.createEvent).not.toHaveBeenCalled()
  })

  it('3 · Repeticiones: abre la ventana, enseña «Ninguno» y las opciones, y cierra sin guardar', async () => {
    run('tut-calendario-evento-repetitivo')
    await says(/Toca «Repetición»/)
    fireEvent.click(within(mark('calendar.event-repeat')!).getByRole('button', { name: /Repetición/ }))
    await waitMark('calendar.repeat-presets')
    await says(/«Ninguno» \(no se repite\)/)
    expect(within(mark('calendar.repeat-presets')!).getByRole('button', { name: 'Ninguno' })).toBeTruthy()
    expect(mark('calendar.repeat-close')).toBeTruthy()
    fireEvent.click(within(mark('calendar.repeat-presets')!).getByRole('button', { name: 'Todas las semanas' })) // elegir una opción da por hecho el paso
    await waitMark('calendar.repeat-until')
    expect(mark('calendar.repeat-holidays')).toBeTruthy()
    await says(/Repetir hasta/)
    next()
    await says(/Excluir festivos/)
    next()
    await says(/Cierra esta ventana con la ✕/)
    fireEvent.click(mark('calendar.repeat-close')!)
    await says(/No se ha guardado nada/)
    fireEvent.click(mark('calendar.event-close')!)
    await says(/Un evento que se repite se ve en todos los días/)
    expect(data.createEvent).not.toHaveBeenCalled()
  })

  it('4 · Recordatorios: la hora primero, la ventana con sus marcas y «+ Añadir recordatorio» explicado', async () => {
    run('tut-calendario-evento-recordatorio')
    await says(/Pon la hora de inicio/)
    expect(getTour('tut-calendario-evento-recordatorio')!.needs?.[0].target).toBe('calendar.event-time')
    next()
    await says(/Toca «Recordatorio»/)
    fireEvent.click(within(mark('calendar.event-reminder')!).getByRole('button', { name: /Recordatorio/ }))
    await waitMark('calendar.reminder-presets')
    expect(mark('calendar.reminder-close')).toBeTruthy()
    await says(/«\+ Añadir recordatorio»/) // sin hora de fin no hay «ancla»: ese paso se omite solo
    expect(within(mark('calendar.reminder-presets')!).getByRole('button', { name: /1 día antes de que empiece/ })).toBeTruthy()
  })

  it('5 · Puntos: el campo solo existe con una persona; con dos desaparece', async () => {
    run('tut-calendario-puntos')
    await says(/Los puntos son para UNA persona/)
    fireEvent.click(within(mark('calendar.event-who')!).getByRole('button', { name: /Ana/ }))
    await waitMark('calendar.who-list')
    expect(mark('calendar.who-close')).toBeTruthy()
    expect(mark('calendar.event-points')).toBeTruthy()
    fireEvent.click(within(mark('calendar.who-list')!).getByText('Eric')) // ahora hay dos personas: no hay puntos
    await waitFor(() => expect(mark('calendar.event-points')).toBeNull())
    fireEvent.click(within(mark('calendar.who-list')!).getByText('Eric')) // vuelve a una sola
    await waitMark('calendar.event-points')
    await says(/Cierra esta ventana con la ✕/)
    fireEvent.click(mark('calendar.who-close')!)
    await says(/Escribe cuántos puntos gana/)
    typeAndLeave(within(mark('calendar.event-points')!).getByRole('spinbutton'), '5')
    await says(/Los puntos se dan cuando alguien marca el apunte como hecho/)
    expect(data.createEvent).not.toHaveBeenCalled()
  })

  it('5 · Puntos con «Toda la familia»: no hay campo y el capítulo lo explica con su propio mensaje', async () => {
    run('tut-calendario-puntos')
    await says(/Los puntos son para UNA persona/)
    fireEvent.click(within(mark('calendar.event-who')!).getByRole('button', { name: /Ana/ }))
    await waitMark('calendar.who-list')
    fireEvent.click(within(mark('calendar.who-list')!).getByText('Ana')) // se quita: Toda la familia
    await waitFor(() => expect(mark('calendar.event-points')).toBeNull())
    await says(/Cierra esta ventana con la ✕/) // tocar la lista da por hecho el paso de la lista
    fireEvent.click(mark('calendar.who-close')!)
    await says(/No veo el campo de puntos/)
  })

  it('6 · Ubicación, adjuntos y notas: tres pasos, uno por icono, cada uno con su marca; los iconos abren su campo', async () => {
    run('tut-calendario-ubicacion-adjuntos')
    await says(/«📍 Ubicación»: tócalo/)
    fireEvent.click(mark('calendar.event-location')!)
    await screen.findByText(/Ubicación \(opcional\)/)
    await says(/«📷📎 Adjunto»/)
    fireEvent.click(mark('calendar.event-attachment')!)
    await screen.findByText(/Foto o archivo adjunto/)
    await says(/«📝 Nota»/)
    fireEvent.click(mark('calendar.event-note')!)
    await screen.findByText(/Nota \(opcional\)/)
    await says(/No se ha guardado nada/)
    fireEvent.click(mark('calendar.event-close')!)
    await says(/Los tres son opcionales/)
    expect(data.createEvent).not.toHaveBeenCalled()
  })

  it('7 · Guardar: avisa de que se guarda de verdad, termina SOLO cuando el servidor confirma y enseña dónde queda', async () => {
    run('tut-calendario-guardar-evento')
    await says(/Este capítulo guarda de verdad/)
    typeAndLeave(screen.getByLabelText('Título'), 'Dentista de Eric')
    await says(/Elige el día/)
    next()
    await says(/Con título y fecha ya se puede guardar/)
    next()
    await says(/pulsa «Crear evento»/)
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull() // paso sensible
    expect(data.createEvent).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }))
    await waitFor(() => expect(data.createEvent).toHaveBeenCalledTimes(1))
    expect(data.createEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dentista de Eric', memberIds: ['m1'] }))
    await says(/tu evento sale en el día que pusiste/)
    next()
    await says(/Ya sabes crear un evento/)
  })

  it('7 · Guardar: si cierras el formulario sin guardar, el capítulo lo dice y no se crea nada', async () => {
    run('tut-calendario-guardar-evento')
    await says(/Este capítulo guarda de verdad/)
    typeAndLeave(screen.getByLabelText('Título'), 'Prueba')
    await says(/Elige el día/)
    next()
    next()
    await says(/pulsa «Crear evento»/)
    fireEvent.click(mark('calendar.event-close')!)
    await says(/Has cerrado el formulario sin guardar/)
    expect(data.createEvent).not.toHaveBeenCalled()
  })
})

describe('Serie «Gestionar eventos y tareas»', () => {
  it('1 · Consultar un apunte: explica la fila, el círculo, los iconos, la segunda línea y la derecha; no guarda nada', async () => {
    run('tut-calendario-consultar-apunte')
    await says(/Cada evento o tarea es una fila/)
    next()
    await says(/El círculo de la izquierda/)
    next()
    await says(/🔒 si es privado/)
    next()
    await says(/Debajo del título/)
    next()
    await says(/«No realizada»/)
    next()
    await says(/Sigue con «Marcar como hecho»/)
    expect(data.complete).not.toHaveBeenCalled()
    expect(data.update).not.toHaveBeenCalled()
  })

  it('1 · Consultar un apunte sin ningún apunte: dice qué hace falta y se puede ver solo leyendo', async () => {
    data.events = []
    run('tut-calendario-consultar-apunte')
    await says(/necesitas ver al menos un evento o una tarea/)
  })

  it('2 · Marcar como hecho con un apunte pendiente: se omite el paso del día; el clic no basta y el paso termina cuando se guardó', async () => {
    run('tut-calendario-marcar-hecho')
    await says(/Este es el círculo de un apunte pendiente/) // «dia» se omite solo: ya hay un círculo a la vista
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull() // paso sensible: sin «Siguiente»
    expect(data.complete).not.toHaveBeenCalled() // el tutorial no marca nada por su cuenta
    fireEvent.click(mark('calendar.entry-complete')!) // la persona lo marca
    await waitFor(() => expect(data.complete).toHaveBeenCalledTimes(1))
    expect(data.complete).toHaveBeenCalledWith('e1', todayStr, 'm1', 3) // los puntos van a la única persona asignada
    await says(/Si te equivocas, vuelve a tocar el círculo/)
    next()
    await says(/Las tareas hechas se pueden tachar/)
  })

  it('2 · Marcar como hecho sin apuntes pendientes: pide cambiar de día con las flechas DEL PANEL y deja a la vista flechas y cuadrícula; si no hay ninguno, lo explica', async () => {
    data.events = []
    run('tut-calendario-marcar-hecho')
    await says(/flechas ‹ › DE ESTE PANEL/)
    const step = getTour('tut-calendario-marcar-hecho')!.steps[0]
    expect(step.keepVisible).toEqual(['calendar.day-prev', 'calendar.day-next', 'calendar.month-grid'])
    for (const id of step.keepVisible!) expect(mark(id), id).toBeTruthy()
    next()
    await says(/Ahora no veo ningún apunte pendiente tuyo/)
  })

  it('2 · Marcar como hecho: si el círculo se pulsa antes de tiempo, el capítulo no se atasca (da por hecho el paso y sigue)', () => {
    const t = getTour('tut-calendario-marcar-hecho')!
    const s = reduceTour(t, startState(t), { type: 'signal', signal: { type: 'event', name: 'calendar.event-completed' } })
    expect(s.status).toBe('running')
    expect(t.steps[s.index].id).toBe('deshacer')
  })

  it('3 · Editar un apunte: tocar el apunte abre el formulario; «Guardar» solo termina el capítulo cuando se guardó de verdad', async () => {
    run('tut-calendario-editar-evento')
    await says(/Toca el evento \(o la tarea\)/)
    await waitMark('calendar.entry-edit')
    fireEvent.click(mark('calendar.entry-edit')!)
    await says(/Aquí cambias el título/)
    await waitMark('calendar.edit-title')
    for (const id of ['calendar.edit-date', 'calendar.edit-allday', 'calendar.edit-private', 'calendar.edit-repeat', 'calendar.edit-who', 'calendar.edit-category', 'calendar.edit-extras', 'calendar.edit-points', 'calendar.edit-save', 'calendar.edit-cancel']) expect(mark(id), id).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: /Saltar los datos/ }))
    await says(/Cuando lo tengas, pulsa «Guardar»/)
    expect(within(panel()).queryByRole('button', { name: /Siguiente/ })).toBeNull()
    expect(data.update).not.toHaveBeenCalled()
    fireEvent.change(mark('calendar.edit-title') as HTMLInputElement, { target: { value: 'Dentista de Eric (revisión)' } })
    fireEvent.click(mark('calendar.edit-save')!)
    await waitFor(() => expect(data.update).toHaveBeenCalledTimes(1))
    await says(/Los cambios ya están guardados/)
  })

  it('3 · Editar un apunte: recorre uno a uno el título, la fecha, «Todo el día», privado, repetición, personas, categoría y extras', async () => {
    run('tut-calendario-editar-evento')
    await waitMark('calendar.entry-edit')
    fireEvent.click(mark('calendar.entry-edit')!)
    for (const re of [/Aquí cambias el título/, /La fecha\./, /«Todo el día» quita las horas/, /«Privado»: si lo marcas/, /«Repetición»: aquí cambias/, /«¿Para quién\?» cambia/, /«Categoría \(opcional\)»/, /Ubicación, adjunto y nota/]) {
      await says(re)
      next()
    }
    await says(/Cuando lo tengas, pulsa «Guardar»/)
  })

  it('3 · Editar un apunte y cerrar la edición sin guardar: el capítulo lo dice y no se guarda nada', async () => {
    run('tut-calendario-editar-evento')
    await waitMark('calendar.entry-edit')
    fireEvent.click(mark('calendar.entry-edit')!)
    await says(/Aquí cambias el título/)
    fireEvent.click(within(panel()).getByRole('button', { name: /Saltar los datos/ }))
    await says(/Cuando lo tengas, pulsa «Guardar»/)
    fireEvent.click(mark('calendar.edit-cancel')!)
    await says(/Has cerrado la edición sin guardar/)
    expect(data.update).not.toHaveBeenCalled()
  })

  it('4 · Cambiar una serie: con un apunte que se repite explica los tres alcances y termina sin cambiar nada', async () => {
    data.events = [baseEvent({ recurrenceRule: 'FREQ=WEEKLY' })]
    run('tut-calendario-cambiar-serie')
    await says(/Toca un evento o una tarea que se repita/)
    await waitMark('calendar.entry-recurring')
    fireEvent.click(mark('calendar.entry-edit')!)
    await says(/Como se repite, eliges a qué se aplican los cambios/)
    expect(within(mark('calendar.edit-scope')!).getByText('Solo esta repetición')).toBeTruthy()
    next()
    await says(/Ojo con la fecha/)
    next()
    await says(/Para no cambiar nada, pulsa «Cancelar»/)
    fireEvent.click(mark('calendar.edit-cancel')!)
    await says(/Esto es todo/)
    expect(data.update).not.toHaveBeenCalled()
  })

  it('4 · Cambiar una serie sin ningún apunte que se repita: dice qué hace falta', async () => {
    run('tut-calendario-cambiar-serie')
    await says(/necesitas un evento o una tarea que se repita/)
  })

  it('5 · Compartir: señala el icono 📤 sin pulsarlo, dice que la nota no se manda y exige tener un apunte propio', async () => {
    run('tut-calendario-compartir')
    await says(/La nota que hayas escrito en el apunte no va en ese texto/)
    expect(mark('calendar.entry-share')).toBeTruthy()
    next()
    await says(/pulsa tú el 📤/)
    next()
    await says(/no tiene menú de compartir/)
  })

  it('5 · Compartir sin apuntes: dice qué hace falta', async () => {
    data.events = []
    run('tut-calendario-compartir')
    await says(/necesitas ver al menos un evento o una tarea tuyos/)
  })

  it('6 · Borrar: solo texto; no hay nada que pulsar ni se marca ningún botón de borrar', async () => {
    run('tut-calendario-borrar-apunte')
    await says(/desliza la fila de un evento o tarea hacia la izquierda/)
    await act(async () => undefined)
    expect(document.querySelector('[data-tour-active="true"]')).toBeNull()
    next()
    await says(/«Solo este día», «Toda la serie» o «Cancelar»/)
    next()
    await says(/No hay papelera ni deshacer/)
    next()
    await says(/PEPA nunca borra nada por su cuenta/)
  })
})
