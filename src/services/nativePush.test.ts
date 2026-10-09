// Avisos nativos en la app de Android: registro del móvil en Firebase, permisos y que ningún aviso se duplique ni rompa la web.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  addListener: vi.fn(),
}))
const local = vi.hoisted(() => ({ schedule: vi.fn(), addListener: vi.fn(), requestPermissions: vi.fn() }))
const native = vi.hoisted(() => ({ value: true }))
const supa = vi.hoisted(() => ({ upsert: vi.fn(), from: vi.fn() }))

vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: push }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: local }))
vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => native.value }))
vi.mock('@/data/supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) => {
      supa.from(t)
      return { upsert: supa.upsert, delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
    },
  },
}))
vi.mock('@/data/errorReports', () => ({ reportClientError: vi.fn() }))

import ReminderWatcherSrc from '@/ui/ReminderWatcher.tsx?raw'
import KeeperSrc from '@/ui/PushSubscriptionKeeper.tsx?raw'

const handlers: Record<string, (e: unknown) => void> = {}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  native.value = true
  for (const k of Object.keys(handlers)) delete handlers[k]
  push.checkPermissions.mockResolvedValue({ receive: 'granted' })
  push.requestPermissions.mockResolvedValue({ receive: 'granted' })
  push.register.mockResolvedValue(undefined)
  push.unregister.mockResolvedValue(undefined)
  push.addListener.mockImplementation(async (name: string, fn: (e: unknown) => void) => {
    handlers[name] = fn
    return { remove: vi.fn() }
  })
  local.addListener.mockImplementation(async (name: string, fn: (e: unknown) => void) => {
    handlers[`local:${name}`] = fn
    return { remove: vi.fn() }
  })
  local.schedule.mockResolvedValue(undefined)
  supa.upsert.mockResolvedValue({ error: null })
})

describe('registro del móvil nativo', () => {
  it('guarda el token de Firebase como «fcm:<token>» en la misma tabla de siempre (push_subscriptions), por dirección única', async () => {
    const { registerNativeDevice } = await import('@/data/push')
    const done = registerNativeDevice()
    await new Promise((r) => setTimeout(r, 0))
    expect(push.register).toHaveBeenCalledTimes(1)
    handlers['registration']({ value: 'TOKEN123' })
    await done
    expect(supa.from).toHaveBeenCalledWith('push_subscriptions')
    expect(supa.upsert).toHaveBeenCalledWith({ profile_id: 'u1', endpoint: 'fcm:TOKEN123', p256dh: 'native', auth: 'native' }, { onConflict: 'endpoint' })
  })
  it('si Firebase no está configurado (falta google-services.json) el fallo llega con su motivo, no se queda colgado', async () => {
    const { registerNativeDevice } = await import('@/data/push')
    const done = registerNativeDevice()
    await new Promise((r) => setTimeout(r, 0))
    handlers['registrationError']({ error: 'FirebaseApp no inicializada' })
    await expect(done).rejects.toThrow('FirebaseApp no inicializada')
  })
  it('un token renovado por Firebase se vuelve a guardar', async () => {
    const { registerNativeDevice } = await import('@/data/push')
    const done = registerNativeDevice()
    await new Promise((r) => setTimeout(r, 0))
    handlers['registration']({ value: 'A' })
    await done
    handlers['registration']({ value: 'B' })
    await new Promise((r) => setTimeout(r, 0))
    expect(supa.upsert).toHaveBeenCalledTimes(2)
    expect(supa.upsert.mock.calls[1][0]).toMatchObject({ endpoint: 'fcm:B' })
  })
})

describe('permisos y estado en la app nativa', () => {
  it('el permiso es el de Android (no el de la API web, que dentro de la app no existe)', async () => {
    const { refreshNativePermission } = await import('@/services/nativePush')
    const { getPermissionState, requestPermission } = await import('@/services/notifications')
    push.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    await refreshNativePermission()
    expect(getPermissionState()).toBe('default')
    expect(await requestPermission()).toBe('granted')
    expect(getPermissionState()).toBe('granted')
  })
  it('«hay suscripción» solo cuando Firebase ha dado token', async () => {
    const { hasPushSubscription } = await import('@/services/notifications')
    const { startNativePush } = await import('@/services/nativePush')
    expect(await hasPushSubscription()).toBe(false)
    await startNativePush(() => undefined, () => undefined)
    handlers['registration']({ value: 'T' })
    expect(await hasPushSubscription()).toBe(true)
  })
  it('el aviso local de la app nativa usa Android solo con permiso concedido', async () => {
    const { requestPermission, showNotification } = await import('@/services/notifications')
    push.requestPermissions.mockResolvedValue({ receive: 'denied' })
    await requestPermission()
    showNotification('t', 'b')
    await new Promise((r) => setTimeout(r, 0))
    expect(local.schedule).not.toHaveBeenCalled()
    push.requestPermissions.mockResolvedValue({ receive: 'granted' })
    await requestPermission()
    showNotification('Todavía pendiente', 'Basura — era a las 18:00')
    await new Promise((r) => setTimeout(r, 0))
    expect(local.schedule).toHaveBeenCalledTimes(1)
  })
})

describe('mostrar y abrir los avisos', () => {
  it('con la app abierta, un aviso de Firebase se enseña como aviso local con el mismo texto', async () => {
    const { startNativePush } = await import('@/services/nativePush')
    await startNativePush(() => undefined, () => undefined)
    handlers['pushNotificationReceived']({ title: 'Reunión', body: 'Empieza a las 16:30', data: { url: '/calendario' } })
    await new Promise((r) => setTimeout(r, 0))
    expect(local.schedule).toHaveBeenCalledTimes(1)
    const arg = local.schedule.mock.calls[0][0].notifications[0]
    expect(arg).toMatchObject({ title: 'Reunión', body: 'Empieza a las 16:30', extra: { url: '/calendario' } })
  })
  it('al tocar un aviso se abre PEPA en la pantalla del aviso (por defecto Calendario) y nunca en una dirección ajena', async () => {
    const assign = vi.fn()
    vi.stubGlobal('window', { location: { assign } })
    const { startNativePush } = await import('@/services/nativePush')
    await startNativePush(() => undefined, () => undefined)
    handlers['pushNotificationActionPerformed']({ notification: { data: { url: '/dinero' } } })
    handlers['pushNotificationActionPerformed']({ notification: { data: { url: 'https://malo.example' } } })
    expect(assign.mock.calls[0][0]).toMatch(/\?\/dinero$/)
    expect(assign.mock.calls[1][0]).toMatch(/\?\/calendario$/)
    vi.unstubAllGlobals()
  })
  it('al desactivar los avisos se da de baja en Firebase y se devuelve su dirección para borrarla del servidor', async () => {
    const { startNativePush, stopNativePush } = await import('@/services/nativePush')
    await startNativePush(() => undefined, () => undefined)
    handlers['registration']({ value: 'BYE' })
    expect(await stopNativePush()).toBe('fcm:BYE')
    expect(push.unregister).toHaveBeenCalled()
  })
})

describe('sin duplicados y la web intacta', () => {
  it('en la app nativa ya registrada, el vigilante local NO avisa de recordatorios (los manda solo el servidor) ni gasta consultas', () => {
    expect(ReminderWatcherSrc).toContain('if (isNativeApp() && (await hasPushSubscription())) return')
    const before = ReminderWatcherSrc.slice(0, ReminderWatcherSrc.indexOf('const reminders = await listActiveReminders()'))
    expect(before).toContain('if (isNativeApp() && (await hasPushSubscription())) return')
  })
  it('al abrir la app nativa se vuelve a registrar el móvil solo si Android ya dio permiso y los avisos no están desactivados', () => {
    expect(KeeperSrc).toContain('if (isNativeApp()) {')
    expect(KeeperSrc).toContain("permission === 'granted' ? registerNativeDevice()")
    expect(KeeperSrc).toContain('if (isNotificationsDisabledByUser()) return')
  })
  it('en el navegador nada cambia: sin app nativa, el estado de permisos y de suscripción es el de siempre', async () => {
    native.value = false
    vi.stubGlobal('Notification', { permission: 'denied' })
    vi.stubGlobal('window', { Notification: { permission: 'denied' } })
    const { getPermissionState } = await import('@/services/notifications')
    expect(getPermissionState()).toBe('denied')
    expect(push.register).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
