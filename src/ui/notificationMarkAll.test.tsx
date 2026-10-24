// @vitest-environment jsdom
// «Marcar todas como leídas / como no leídas» del panel de Avisos (24/10/2026), además de la lectura automática a los 3 s: el panel real, con los datos simulados.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppNotification } from '@/domain/notificationsCenter'

const store = vi.hoisted(() => ({ items: [] as unknown[] }))
const api = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  markNotificationUnread: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markAllNotificationsUnread: vi.fn(),
  deleteNotifications: vi.fn(),
  deleteAllNotifications: vi.fn(),
}))
vi.mock('@/data/notifications', () => api)

const { NotificationPanel } = await import('@/ui/NotificationPanel')

function item(id: string, readAt: string | null): AppNotification {
  return {
    id,
    bucket: 'personal',
    category: 'general',
    title: `Aviso ${id}`,
    body: '',
    url: null,
    groupKey: null,
    payload: {},
    createdAt: new Date(Date.UTC(2026, 9, 24, 8, Number(id))).toISOString(),
    readAt,
  }
}

function setup() {
  return render(
    <MemoryRouter>
      <NotificationPanel onClose={() => undefined} onUnreadChange={() => undefined} />
    </MemoryRouter>,
  )
}

// IntersectionObserver de mentira: deja decidir a mano qué avisos «se ven».
let observed: HTMLElement[] = []
let callback: IntersectionObserverCallback | null = null

beforeEach(() => {
  store.items = [item('1', null), item('2', null), item('3', '2026-10-24T09:00:00.000Z')]
  api.listNotifications.mockImplementation(async () => store.items)
  api.markNotificationUnread.mockResolvedValue(undefined)
  api.markNotificationsRead.mockImplementation(async (ids: string[]) => {
    store.items = (store.items as AppNotification[]).map((n) => (ids.includes(n.id) && n.readAt === null ? { ...n, readAt: 'now' } : n))
  })
  api.markAllNotificationsRead.mockImplementation(async () => {
    store.items = (store.items as AppNotification[]).map((n) => ({ ...n, readAt: n.readAt ?? 'now' }))
  })
  api.markAllNotificationsUnread.mockImplementation(async () => {
    store.items = (store.items as AppNotification[]).map((n) => ({ ...n, readAt: null }))
  })
  observed = []
  callback = null
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb
      }
      observe(el: Element) {
        observed.push(el as HTMLElement)
      }
      disconnect() {
        observed = []
      }
      unobserve() {}
      takeRecords() {
        return []
      }
    },
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Marcar todas como leídas / como no leídas', () => {
  it('marca todo como leído de golpe y deja desactivado el botón de leídas', async () => {
    setup()
    const readAll = await screen.findByRole('button', { name: 'Marcar todas como leídas' })
    expect(screen.getByText('2 nuevas · 1 leída')).toBeTruthy()
    fireEvent.click(readAll)
    await waitFor(() => expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('0 nuevas · 3 leídas')).toBeTruthy())
    expect((screen.getByRole('button', { name: 'Marcar todas como leídas' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Marcar todas como no leídas' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('marca todo como no leído y deja desactivado el botón de no leídas', async () => {
    setup()
    const unreadAll = await screen.findByRole('button', { name: 'Marcar todas como no leídas' })
    fireEvent.click(unreadAll)
    await waitFor(() => expect(api.markAllNotificationsUnread).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('3 nuevas · 0 leídas')).toBeTruthy())
    expect((screen.getByRole('button', { name: 'Marcar todas como no leídas' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('abrir el panel no marca nada de golpe', async () => {
    setup()
    await screen.findByRole('button', { name: 'Marcar todas como leídas' })
    expect(api.markAllNotificationsRead).not.toHaveBeenCalled()
    expect(api.markAllNotificationsUnread).not.toHaveBeenCalled()
  })

  it('lo que se deja como no leído a mano NO se vuelve a leer solo a los 3 segundos; lo demás sí', async () => {
    setup()
    const unreadAll = await screen.findByRole('button', { name: 'Marcar todas como no leídas' })
    fireEvent.click(unreadAll)
    await waitFor(() => expect(screen.getByText('3 nuevas · 0 leídas')).toBeTruthy())
    // El 3 era «leído» y se ha dejado como no leído A MANO: no se observa para la lectura automática. Los 1 y 2 ya estaban sin leer (nadie los tocó): siguen en marcha.
    const watched = observed.filter((el) => el.dataset.unread === 'true').map((el) => el.dataset.notificationId)
    expect(watched.sort()).toEqual(['1', '2'])

    // A los 3 s a la vista, los 1 y 2 se leen solos; el 3 se queda sin leer.
    vi.useFakeTimers()
    const entries = observed.map((target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry)
    await act(async () => {
      callback?.(entries, {} as IntersectionObserver)
      await vi.advanceTimersByTimeAsync(3200)
    })
    expect(api.markNotificationsRead).toHaveBeenCalledTimes(1)
    expect((api.markNotificationsRead.mock.calls[0][0] as string[]).sort()).toEqual(['1', '2'])
  })

  it('«Marcar como no leída» de un solo aviso tampoco se deshace solo a los 3 segundos', async () => {
    setup()
    const one = await screen.findByRole('button', { name: 'Marcar como no leída: Aviso 3' })
    fireEvent.click(one)
    await waitFor(() => expect(api.markNotificationUnread).toHaveBeenCalledWith('3'))
    await waitFor(() => expect(screen.getByText('3 nuevas · 0 leídas')).toBeTruthy())
    expect(observed.filter((el) => el.dataset.unread === 'true').map((el) => el.dataset.notificationId)).not.toContain('3')
  })
})

describe('botón visible junto a cada aviso para marcar leído / no leído', () => {
  it('cada aviso sin leer tiene «Marcar como leída» y cada leído «Marcar como no leída», y cada uno cambia solo ese aviso', async () => {
    setup()
    const markOne = await screen.findByRole('button', { name: 'Marcar como leída: Aviso 1' })
    expect(screen.getByRole('button', { name: 'Marcar como leída: Aviso 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Marcar como no leída: Aviso 3' })).toBeTruthy()
    // El texto que se ve (no solo el nombre accesible) también es claro.
    expect(markOne.textContent).toContain('Marcar leída')

    fireEvent.click(markOne)
    await waitFor(() => expect(api.markNotificationsRead).toHaveBeenCalledWith(['1']))
    await waitFor(() => expect(screen.getByText('1 nueva · 2 leídas')).toBeTruthy())
    // Ese aviso ahora ofrece volver a dejarlo sin leer.
    expect(screen.getByRole('button', { name: 'Marcar como no leída: Aviso 1' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Marcar como leída: Aviso 1' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como no leída: Aviso 1' }))
    await waitFor(() => expect(api.markNotificationUnread).toHaveBeenCalledWith('1'))
    await waitFor(() => expect(screen.getByText('2 nuevas · 1 leída')).toBeTruthy())
  })
})
