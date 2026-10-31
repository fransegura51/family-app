// @vitest-environment jsdom
// NOT-01 — el panel de Avisos en sus dos formas, con el panel real y datos simulados:
//  · «Por áreas»: agrupado por módulo, con contador de no leídos; las áreas con novedades suben arriba y salen abiertas, el resto plegadas; al leer o marcar nada salta ni se pliega.
//  · «Por prioridad personal»: Personales / Otras según los tipos que la persona haya elegido, con lo no leído primero.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppNotification } from '@/domain/notificationsCenter'

const store = vi.hoisted(() => ({ items: [] as unknown[], prefs: { notificationViewMode: 'areas', personalCategories: null } as { notificationViewMode: string; personalCategories: string[] | null } }))
const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  markNotificationUnread: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markAllNotificationsUnread: vi.fn(),
  deleteNotifications: vi.fn(),
  deleteAllNotifications: vi.fn(),
  getNotificationPrefs: vi.fn(),
}))
vi.mock('@/data/notifications', () => api)
const { NotificationPanel } = await import('@/ui/NotificationPanel')

function item(id: string, category: string, minute: number, readAt: string | null, bucket: 'personal' | 'other' = 'other'): AppNotification {
  return { id, bucket, category, title: `Aviso ${id}`, body: '', url: null, groupKey: null, payload: {}, createdAt: new Date(Date.UTC(2026, 9, 24, 8, minute)).toISOString(), readAt }
}

beforeEach(() => {
  store.items = [
    item('cal-read', 'task_assigned', 1, '2026-10-24T09:00:00.000Z', 'personal'),
    item('eco-unread', 'bank_import', 5, null),
    item('com-unread', 'community_digest', 9, null, 'personal'),
  ]
  store.prefs = { notificationViewMode: 'areas', personalCategories: null }
  api.listNotifications.mockImplementation(async () => store.items)
  api.getNotificationPrefs.mockImplementation(async () => store.prefs)
  api.markNotificationsRead.mockImplementation(async (ids: string[]) => {
    store.items = (store.items as AppNotification[]).map((n) => (ids.includes(n.id) && n.readAt === null ? { ...n, readAt: 'now' } : n))
  })
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return []
      }
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const setup = () =>
  render(
    <MemoryRouter>
      <NotificationPanel onClose={() => undefined} onUnreadChange={() => undefined} />
    </MemoryRouter>,
  )
const areaIds = () => [...document.querySelectorAll('[data-testid^="area-"]')].map((el) => el.getAttribute('data-testid'))

describe('NOT-01 · Por áreas', () => {
  it('las áreas con no leídos suben arriba (la del más reciente primero) y se abren; la que solo tiene leídos queda plegada', async () => {
    setup()
    await screen.findByTestId('area-comunidad')
    expect(areaIds()).toEqual(['area-comunidad', 'area-economia', 'area-calendario'])
    const com = screen.getByTestId('area-comunidad')
    expect(within(com).getByRole('button', { expanded: true }).textContent).toContain('1 sin leer')
    expect(within(screen.getByTestId('area-calendario')).getByRole('button', { expanded: false })).toBeTruthy()
    // sin bloques «Personales / Otras notificaciones» en este modo
    expect(screen.queryByText(/Otras notificaciones/)).toBeNull()
  })

  it('al marcar un aviso como leído el contador baja pero el área no se recoloca ni se pliega', async () => {
    setup()
    await screen.findByTestId('area-comunidad')
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como leída: Aviso com-unread' }))
    await waitFor(() => expect(within(screen.getByTestId('area-comunidad')).getByRole('button', { expanded: true }).textContent).not.toContain('sin leer'))
    expect(areaIds()).toEqual(['area-comunidad', 'area-economia', 'area-calendario'])
  })

  it('una área plegada se abre a mano', async () => {
    setup()
    await screen.findByTestId('area-calendario')
    fireEvent.click(within(screen.getByTestId('area-calendario')).getByRole('button', { expanded: false }))
    expect(within(screen.getByTestId('area-calendario')).getByRole('button', { expanded: true })).toBeTruthy()
  })
})

describe('NOT-01 · Por prioridad personal', () => {
  it('con los tipos elegidos por la persona, Personales sale con ellos y los no leídos primero', async () => {
    store.prefs = { notificationViewMode: 'personal', personalCategories: ['bank_import'] }
    setup()
    await screen.findByText(/Personales \(1\)/)
    expect(screen.getByText(/Otras notificaciones \(2\)/)).toBeTruthy()
    expect(screen.queryByTestId('area-economia')).toBeNull()
    const personal = screen.getByRole('region', { name: 'Personales' })
    expect(within(personal).getByText(/Aviso eco-unread/)).toBeTruthy()
  })

  it('sin elegir tipos vale el bloque de siempre', async () => {
    store.prefs = { notificationViewMode: 'personal', personalCategories: null }
    setup()
    await screen.findByText(/Personales \(2\)/)
  })
})
