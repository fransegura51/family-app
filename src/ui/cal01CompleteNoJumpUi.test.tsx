// @vitest-environment jsdom
// CAL-01 — marcar una tarea como hecha NO recarga el calendario «desde cero»: no vuelve a aparecer «Cargando calendario…» (eso desmontaba la pantalla y la página saltaba arriba,
// perdiendo vista, fecha y posición). La recarga es de fondo. Datos simulados.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalendarEvent } from '@/domain/types'

const todayStr = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const task = { id: 't1', familyId: 'f', title: 'Sacar la basura', description: null, startAt: `${todayStr}T00:00:00.000Z`, endAt: null, allDay: true, color: null, recurrenceRule: null, exceptionDates: [], reminders: [], memberIds: [], points: 0, attachmentStoragePath: null, attachmentKind: null, attachmentOriginalName: null, locationLabel: null, locationLatitude: null, locationLongitude: null, note: null, visibility: 'shared', kind: 'task', categoryId: null } as CalendarEvent

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
const data = vi.hoisted(() => ({ completions: [] as { eventId: string; occurrenceDate: string; memberId: string | null; pointsAwarded: number }[], listCalls: 0 }))
vi.mock('@/data/supabaseClient', () => ({ supabase: new Proxy({}, { get: (_t, p) => (p === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: { id: 'u1' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : p === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : () => empty()) }) }))
vi.mock('@/data/calendar', async (orig) => ({
  ...(await orig<typeof import('@/data/calendar')>()),
  listUpcomingEvents: async () => {
    data.listCalls++
    return [task]
  },
  listEventCompletions: async () => data.completions.map((c) => ({ ...c })),
  listHolidayDates: async () => new Set<string>(),
  listExternalEvents: async () => [],
  listFeeds: async () => [],
  listContacts: async () => [],
  listExternalEventDismissals: async () => [],
  listExternalEventCompletions: async () => [],
  listPersonalNotes: async () => [],
  listCalendarCategories: async () => [],
  getCalendarPreferences: async () => ({ colorMode: 'categorias', taskOrder: 'eventos_primero', taskCompletion: { strikethrough: true, doneColor: null, moveCompletedToEnd: false } }),
  completeEventOccurrence: async (eventId: string, occurrenceDate: string) => {
    data.completions.push({ eventId, occurrenceDate, memberId: null, pointsAwarded: 0 })
  },
}))
vi.mock('@/data/family', async (orig) => ({ ...(await orig<typeof import('@/data/family')>()), listFamilyMembers: async () => [] }))

const { CalendarScreen } = await import('@/ui/CalendarScreen')
afterEach(cleanup)

describe('CAL-01 · marcar como hecho sin saltar al inicio', () => {
  it('al completar una tarea no vuelve a salir «Cargando calendario…» y la tarea queda hecha', async () => {
    render(
      <MemoryRouter>
        <CalendarScreen profile={{ id: 'u1', familyId: 'f', role: 'admin', displayName: 'Ana' } as never} />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Sacar la basura')).toBeTruthy()
    const callsBefore = data.listCalls
    // observar si en algún momento reaparece el cargando
    let sawLoading = false
    const obs = new MutationObserver(() => {
      if (document.body.textContent?.includes('Cargando calendario')) sawLoading = true
    })
    obs.observe(document.body, { childList: true, subtree: true, characterData: true })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Marcar como hecho' })[0])
    })
    await waitFor(() => expect(data.listCalls).toBeGreaterThan(callsBefore)) // se recargó de fondo
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Marcar como pendiente' }).length).toBeGreaterThan(0))
    obs.disconnect()
    expect(sawLoading).toBe(false)
  })
})
