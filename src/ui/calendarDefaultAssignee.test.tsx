// @vitest-environment jsdom
// CAL-01 — «¿Para quién?» de un formulario NUEVO (evento y tarea) empieza en la persona autenticada, no en «Toda la familia». Causa de la regresión: el formulario de evento nunca recibía la
// ficha de la cuenta (solo la de la columna de Familiar) y arrancaba siempre vacío = «Toda la familia»; el de tarea sí la recibía pero la perdía tras guardar. Estas pruebas fijan el
// comportamiento: selección inicial, «Toda la familia» disponible a mano, puntos solo con UNA persona, elección manual intocable, ficha ausente (aviso, sin elegir a nadie más) y
// formularios de edición sin tocar. Datos simulados.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent, FamilyMember } from '@/domain/types'

const data = vi.hoisted(() => ({ createEvent: vi.fn(async () => undefined) }))
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: () => () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }) }))
vi.mock('@/data/calendar', async (orig) => ({ ...(await orig<typeof import('@/data/calendar')>()), createEvent: data.createEvent }))

const { AddEventForm, AddTaskForm } = await import('@/ui/CalendarScreen')

const member = (id: string, name: string): FamilyMember =>
  ({ id, familyId: 'f', name, avatar: '🙂', color: '#4c6ef5', memberType: 'adult', birthDate: null, sex: null, weightGoalKg: null, birthdayFavorite: false, permissions: {}, linkedProfileId: null, photoPath: null, allowedSections: null, joinedAt: '2020-01-01' }) as FamilyMember
const MEMBERS = [member('m1', 'Ana'), member('m2', 'Eric')]

type EProps = Partial<Parameters<typeof AddEventForm>[0]>
type TProps = Partial<Parameters<typeof AddTaskForm>[0]>
const ev = (over: EProps = {}) => (
  <AddEventForm members={MEMBERS} events={[]} categories={[]} defaultDate="2026-11-05" hideHeading onAdded={() => undefined} onManageCategories={() => undefined} {...over} />
)
const tk = (over: TProps = {}) => <AddTaskForm members={MEMBERS} categories={[]} defaultDate="2026-11-05" onAdded={() => undefined} onManageCategories={() => undefined} {...over} />

const who = (kind: 'event' | 'task') => document.querySelector(`[data-help-id="calendar.${kind}-who"]`) as HTMLElement
const whoSummary = (kind: 'event' | 'task') => who(kind).querySelector('.category-picker-toggle')!.textContent ?? ''
const points = (kind: 'event' | 'task') => document.querySelector(`[data-help-id="calendar.${kind}-points"]`)
function pick(kind: 'event' | 'task', name: string) {
  fireEvent.click(who(kind).querySelector('.category-picker-toggle')!)
  const sheet = document.querySelector('.modal-sheet') as HTMLElement
  fireEvent.click(within(sheet).getByText(name))
  fireEvent.click(within(sheet).getByRole('button', { name: 'Cerrar' }))
}

beforeEach(() => data.createEvent.mockClear())
afterEach(cleanup)

describe.each([
  ['event', (over: object) => ev(over as EProps), (id: string | null) => ({ defaultMemberIds: id ? [id] : undefined })],
  ['task', (over: object) => tk(over as TProps), (id: string | null) => ({ defaultMemberId: id })],
] as const)('CAL-01 · formulario nuevo de %s', (kind, make, defaults) => {
  it('arranca con la persona autenticada elegida (no «Toda la familia») y con el campo de puntos', () => {
    render(make(defaults('m1')))
    expect(whoSummary(kind)).toContain('Ana')
    expect(whoSummary(kind)).not.toContain('Toda la familia')
    expect(points(kind)).toBeTruthy()
  })

  it('«Toda la familia» sigue disponible a mano: al quitar la selección se oculta el campo de puntos', () => {
    render(make(defaults('m1')))
    pick(kind, 'Ana') // desmarca
    expect(whoSummary(kind)).toContain('Toda la familia')
    expect(points(kind)).toBeNull()
  })

  it('con dos personas no hay campo de puntos (no se inventa un reparto) y con una sola vuelve a haberlo', () => {
    render(make(defaults('m1')))
    pick(kind, 'Eric')
    expect(whoSummary(kind)).toContain('Ana')
    expect(whoSummary(kind)).toContain('Eric')
    expect(points(kind)).toBeNull()
    pick(kind, 'Ana')
    expect(whoSummary(kind)).toContain('Eric')
    expect(points(kind)).toBeTruthy()
  })

  it('si la cuenta no tiene ficha entre los miembros: no se preselecciona a NADIE más y el formulario lo dice con claridad', () => {
    render(make({ ...defaults(null), defaultMissing: true }))
    expect(whoSummary(kind)).toContain('Toda la familia')
    expect(screen.getByTestId('default-assignee-missing').textContent).toMatch(/No he podido identificar tu ficha/)
    expect(points(kind)).toBeNull()
    pick(kind, 'Eric') // al elegir a alguien el aviso desaparece
    expect(screen.queryByTestId('default-assignee-missing')).toBeNull()
  })

  it('con ficha, no aparece ningún aviso', () => {
    render(make({ ...defaults('m1'), defaultMissing: false }))
    expect(screen.queryByTestId('default-assignee-missing')).toBeNull()
  })

  it('una elección MANUAL no se pisa cuando el formulario se actualiza con otra ficha por defecto', () => {
    const { rerender } = render(make(defaults('m1')))
    pick(kind, 'Eric') // Ana + Eric
    rerender(make(defaults('m2')))
    expect(whoSummary(kind)).toContain('Ana')
    expect(whoSummary(kind)).toContain('Eric')
  })

  it('si la ficha llega tarde (los miembros cargan después) y la persona no ha elegido nada, se aplica; si ya eligió, no', () => {
    const late = render(make({ ...defaults(null), defaultMissing: true }))
    late.rerender(make({ ...defaults('m1'), defaultMissing: false }))
    expect(whoSummary(kind)).toContain('Ana')
    late.unmount()
    const manual = render(make({ ...defaults(null), defaultMissing: true }))
    pick(kind, 'Eric')
    manual.rerender(make({ ...defaults('m1'), defaultMissing: false }))
    expect(whoSummary(kind)).toContain('Eric')
    expect(whoSummary(kind)).not.toContain('Ana')
  })

  it('al guardar se crea para la persona elegida y el formulario vuelve a su valor por defecto (la persona autenticada), no a «Toda la familia»', async () => {
    render(make(defaults('m1')))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Algo' } })
    pick(kind, 'Eric')
    pick(kind, 'Ana') // solo Eric
    fireEvent.click(screen.getByRole('button', { name: kind === 'event' ? 'Crear evento' : 'Crear tarea' }))
    await waitFor(() => expect(data.createEvent).toHaveBeenCalledTimes(1))
    expect(data.createEvent).toHaveBeenCalledWith(expect.objectContaining({ memberIds: ['m2'] }))
    await waitFor(() => expect(whoSummary(kind)).toContain('Ana'))
    expect(whoSummary(kind)).not.toContain('Eric')
  })

  it('por defecto se guarda para la persona autenticada con sus puntos', async () => {
    render(make(defaults('m1')))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Algo' } })
    fireEvent.change(points(kind)!.querySelector('input')!, { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: kind === 'event' ? 'Crear evento' : 'Crear tarea' }))
    await waitFor(() => expect(data.createEvent).toHaveBeenCalledWith(expect.objectContaining({ memberIds: ['m1'], points: 7 })))
  })

  it('con «Toda la familia» se guarda sin personas y sin puntos', async () => {
    render(make(defaults('m1')))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Algo' } })
    fireEvent.change(points(kind)!.querySelector('input')!, { target: { value: '9' } })
    pick(kind, 'Ana') // Toda la familia
    fireEvent.click(screen.getByRole('button', { name: kind === 'event' ? 'Crear evento' : 'Crear tarea' }))
    await waitFor(() => expect(data.createEvent).toHaveBeenCalledWith(expect.objectContaining({ memberIds: [], points: 0 })))
  })
})

describe('CAL-01 · autorrelleno por título (evento)', () => {
  const past = { id: 'e1', title: 'Dentista', startAt: '2026-10-01T09:00:00.000Z', endAt: null, allDay: false, recurrenceRule: null, reminders: [], memberIds: ['m2'], points: 3 } as unknown as CalendarEvent

  it('si la persona no ha elegido nada a mano, copiar del evento anterior sigue funcionando', () => {
    render(ev({ defaultMemberIds: ['m1'], events: [past] }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Dentista' } })
    expect(whoSummary('event')).toContain('Eric')
  })

  it('si ya eligió para quién es a mano, el autorrelleno NO se lo cambia', () => {
    render(ev({ defaultMemberIds: ['m1'], events: [past] }))
    pick('event', 'Eric')
    pick('event', 'Ana') // solo Eric, a mano... y luego se escribe un título con historial
    pick('event', 'Eric') // deja Toda la familia a mano
    expect(whoSummary('event')).toContain('Toda la familia')
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Dentista' } })
    expect(whoSummary('event')).toContain('Toda la familia')
  })
})

describe('CAL-01 · pantalla y edición', () => {
  const SRC = readFileSync('src/ui/CalendarScreen.tsx', 'utf8').replace(/\r\n/g, '\n')

  it('la pantalla pasa SIEMPRE la ficha de la cuenta a los dos formularios nuevos (la columna de Familiar manda en el de evento)', () => {
    expect(SRC).toContain('defaultMemberIds={addingEventMemberId ? [addingEventMemberId] : myMemberId ? [myMemberId] : undefined}')
    expect(SRC).toContain('defaultMissing={!addingEventMemberId && !myMemberId}')
    expect(SRC).toContain('defaultMemberId={myMemberId}')
    expect(SRC).toContain('defaultMissing={!myMemberId}')
  })

  it('el formulario de EDICIÓN parte de lo guardado: no usa la selección por defecto', () => {
    const edit = SRC.slice(SRC.indexOf('function EditEventForm({'), SRC.indexOf('export function useAssignees'))
    expect(edit).toContain('useState<string[]>(event.memberIds)')
    expect(edit).not.toContain('useAssignees(')
    expect(edit).not.toContain('defaultMemberId')
  })

  it('el gancho no preselecciona a otra persona si no hay ficha: sin ficha el valor inicial es vacío', () => {
    const hook = SRC.slice(SRC.indexOf('export function useAssignees'), SRC.indexOf('const DEFAULT_ASSIGNEE_MISSING'))
    expect(hook).toContain('idsOf(defaultKey)')
    expect(hook).not.toContain('members[0]')
  })
})
