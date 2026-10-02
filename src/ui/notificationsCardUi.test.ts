import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Petición real: "¿Dónde se activan los recordatorios en la app? No sé dónde se activan... añade un
// botón para activar los avisos desde la aplicación de Pepa, para activarlo o desactivarlo". Antes solo
// había una tarjeta en Inicio que desaparecía para siempre al contestar "Permitir"/"Bloquear".
const SOURCES = import.meta.glob(
  [
    '/src/ui/NotificationsCard.tsx',
    '/src/ui/FamilyScreen.tsx',
    '/src/ui/HomeScreen.tsx',
    '/src/ui/PushSubscriptionKeeper.tsx',
    '/src/data/push.ts',
    '/supabase/functions/send-family-push/index.ts',
    '/supabase/migrations/0188_send_test_push.sql',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>
const CARD = SOURCES['/src/ui/NotificationsCard.tsx']
const FAMILY = SOURCES['/src/ui/FamilyScreen.tsx']
const HOME = SOURCES['/src/ui/HomeScreen.tsx']
const KEEPER = SOURCES['/src/ui/PushSubscriptionKeeper.tsx']
const PUSH_DATA = SOURCES['/src/data/push.ts']
const SEND_FAMILY_PUSH = SOURCES['/supabase/functions/send-family-push/index.ts']
const SQL = SOURCES['/supabase/migrations/0188_send_test_push.sql'].replace(/--[^\n]*/g, '')

describe('NotificationsCard — botón fijo para activar y desactivar los avisos', () => {
  it('tiene los tres botones: activar, desactivar y mandarse un aviso de prueba', () => {
    expect(CARD).toContain('Activar avisos')
    expect(CARD).toContain('Desactivar avisos')
    expect(CARD).toContain('Mandarme un aviso de prueba')
  })

  it('está en Familia y la ve CUALQUIER persona, no solo el administrador (el permiso es de cada móvil)', () => {
    expect(FAMILY).toContain('<NotificationsCard />')
    expect(FAMILY).not.toMatch(/isAdmin\s*&&\s*<NotificationsCard/)
  })

  it('explica cada caso: sin soporte (iPhone sin instalar), bloqueado por el móvil, activado, desactivado y sin activar', () => {
    expect(CARD).toContain("permission === 'unsupported'")
    expect(CARD).toContain('Añadir a')
    expect(CARD).toContain("permission === 'denied'")
    expect(CARD).toContain('Abre los ajustes del móvil')
    expect(CARD).toContain('✓ Activados')
    expect(CARD).toContain('Desactivados en este móvil')
  })

  it('"activado" exige permiso concedido + no desactivado por la persona + este móvil dado de alta de verdad', () => {
    expect(CARD).toContain("permission === 'granted' && !disabled && subscribed === true")
  })

  it('un error (p. ej. el enfriamiento del aviso de prueba) se enseña, no se traga', () => {
    expect(CARD).toContain('setError(errorMessage(err')
    expect(CARD).toContain('{error && <p className="error">{error}</p>}')
  })
})

describe('activar/desactivar de verdad (data/push.ts)', () => {
  it('desactivar marca el móvil, lo da de baja del navegador y borra SU dirección de envío del servidor', () => {
    const body = PUSH_DATA.slice(PUSH_DATA.indexOf('export async function disablePushNotifications'), PUSH_DATA.indexOf('export async function sendTestPush'))
    expect(body).toContain('setNotificationsDisabledByUser(true)')
    expect(body).toContain('unsubscribeFromPush()')
    expect(body).toContain(".from('push_subscriptions').delete().eq('endpoint', endpoint)")
  })

  it('activar quita la marca, pide el permiso solo si no se ha decidido y registra el móvil', () => {
    const body = PUSH_DATA.slice(PUSH_DATA.indexOf('export async function enablePushNotifications'), PUSH_DATA.indexOf('export async function disablePushNotifications'))
    expect(body).toContain('setNotificationsDisabledByUser(false)')
    expect(body).toContain("if (permission === 'default') {")
    expect(body).toContain('permission = await requestPermission()')
    expect(body).toContain('savePushSubscription(subscription)')
  })

  it('activar NO falla en silencio: sin clave, sin registro posible o sin respuesta del móvil lanza un error con la causa', () => {
    const body = PUSH_DATA.slice(PUSH_DATA.indexOf('export async function enablePushNotifications'), PUSH_DATA.indexOf('export async function disablePushNotifications'))
    expect(body).toContain("throw new Error('Falta la clave de avisos en esta versión de la app.')")
    expect(body).toContain('if (!subscription) {')
    expect(body).toContain('Este navegador no puede recibir avisos con la app cerrada')
    expect(body).toContain('withTimeout(')
  })

  it('si el permiso queda denegado o sin contestar, devuelve ese estado (la pantalla lo explica) en vez de seguir', () => {
    expect(PUSH_DATA).toContain("if (permission !== 'granted') return permission")
  })

  it('la tarjeta avisa si el móvil se quedó sin respuesta del usuario, y deja un detalle técnico visible para poder diagnosticar', () => {
    expect(CARD).toContain('No has contestado a la pregunta del móvil')
    expect(CARD).toContain('Detalle: permiso {permission}, registrado')
  })

  it('la tarjeta de Inicio y la de Familia hacen exactamente lo mismo (una sola función)', () => {
    expect(HOME).toContain('enablePushNotifications')
    expect(HOME).not.toContain('subscribeToPush')
  })

  it('PushSubscriptionKeeper NO vuelve a registrar un móvil que su dueño desactivó', () => {
    expect(KEEPER).toContain('isNotificationsDisabledByUser()')
  })
})

describe('que funcione igual en Android y en iPhone', () => {
  const EXTRA = import.meta.glob(['/src/main.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const MAIN = EXTRA['/src/main.tsx']

  it('cada intento que no termina bien deja constancia del estado real del navegador (client_errors) para poder diagnosticar un móvil concreto', () => {
    expect(PUSH_DATA).toContain('export async function reportPushProblem')
    expect(PUSH_DATA).toContain('permiso=')
    expect(PUSH_DATA).toContain('registro=')
    expect(PUSH_DATA).toContain('suscripcion=')
    expect(PUSH_DATA).toContain('modo=')
    expect(PUSH_DATA).toContain('gestoAlPedir=')
    expect(PUSH_DATA).toContain('permissionsApi=')
    expect(CARD).toContain("void reportPushProblem('fallo en la tarjeta de avisos', err)")
    expect(KEEPER).toContain("reportPushProblem('registro automático al abrir la app', err)")
  })

  it('las instrucciones de "bloqueado" son distintas en Android y en iPhone (cada sistema lo esconde en un sitio)', () => {
    expect(CARD).toContain('/android/i.test(ua)')
    expect(CARD).toContain('Abre Chrome desde su icono')
    expect(CARD).toContain('/iphone|ipad/i.test(ua)')
    expect(CARD).toContain('<ol ')
    expect(CARD.replace(/\/\/[^\n]*/g, '')).not.toMatch(/Borrar y restablecer|Borrar datos/)
  })

  it('si Chrome contesta "denegado" sin preguntar (el permiso sigue en "default"), la tarjeta lo explica con los pasos exactos en vez de parecer rota', () => {
    expect(CARD).toContain("setBlockedByBrowser(result === 'denied' && getPermissionState() !== 'denied')")
    expect(CARD).toContain('El navegador ha bloqueado la pregunta de permiso para esta página')
    expect(CARD).toContain('<StepsList />')
    expect(CARD).toContain('Activar avisos')
    expect(CARD).toContain('el candado a la izquierda de la dirección')
  })

  it('un móvil con la app vieja (archivos ya borrados) se recarga solo UNA vez por minuto, nunca en bucle', () => {
    expect(MAIN).toContain("window.addEventListener('vite:preloadError'")
    expect(MAIN).toContain('Date.now() - last < 60_000')
    expect(MAIN).toContain('window.location.reload()')
  })
})

describe('aviso de prueba — send_test_push_to_me (migración 0188)', () => {
  it('solo lo puede ejecutar quien ha iniciado sesión (nunca anon)', () => {
    expect(SQL).toContain('revoke execute on function public.send_test_push_to_me() from public, anon')
    expect(SQL).toContain('grant execute on function public.send_test_push_to_me() to authenticated')
  })

  it('la familia y la persona salen de la sesión, nunca de un parámetro que se pueda falsear', () => {
    expect(SQL).toContain('v_profile uuid := auth.uid()')
    expect(SQL).toContain('v_family uuid := private.current_family_id()')
    expect(SQL).toMatch(/send_test_push_to_me\(\)\s+returns void/)
  })

  it('SECURITY DEFINER con search_path vacío', () => {
    expect(SQL).toMatch(/security definer\s+set search_path = ''/)
  })

  it('tiene enfriamiento de 20 s por persona (cada pulsación cuesta una invocación)', () => {
    expect(SQL).toContain("interval '20 seconds'")
    expect(SQL).toContain('Espera unos segundos')
  })

  it('el aviso va SOLO a esa persona (only_profile_id), no a toda la familia', () => {
    expect(SQL).toContain("'only_profile_id', v_profile")
  })

  it('el registro de pruebas tiene RLS activo y ninguna política', () => {
    expect(SQL).toContain('alter table push_test_log enable row level security')
    expect(SQL).not.toContain('create policy')
  })
})

describe('send-family-push — only_profile_id', () => {
  it('solo avisa a ese perfil, y solo si es de la familia indicada (un id de otra familia no recibe nada)', () => {
    expect(SEND_FAMILY_PUSH).toContain('.filter((id) => onlyProfileId === null || id === onlyProfileId)')
    // profiles ya viene filtrado por familia: el id ajeno nunca llega a la lista.
    expect(SEND_FAMILY_PUSH).toMatch(/from\("profiles"\)\.select\("id"\)\.eq\("family_id", familyId\)/)
  })
})

describe('preferencia "desactivado" por móvil (services/notifications.ts)', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    vi.stubGlobal('Notification', { permission: 'granted' })
    // El entorno de tests es Node (sin navegador): `window` apunta al propio global y no hay
    // service worker, así que showNotification cae al constructor de Notification.
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('navigator', {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('se guarda y se quita', async () => {
    const mod = await import('@/services/notifications')
    expect(mod.isNotificationsDisabledByUser()).toBe(false)
    mod.setNotificationsDisabledByUser(true)
    expect(mod.isNotificationsDisabledByUser()).toBe(true)
    mod.setNotificationsDisabledByUser(false)
    expect(mod.isNotificationsDisabledByUser()).toBe(false)
  })

  it('con los avisos desactivados showNotification no enseña nada, ni local', async () => {
    const mod = await import('@/services/notifications')
    const created: string[] = []
    vi.stubGlobal('Notification', class {
      static permission = 'granted'
      constructor(title: string) {
        created.push(title)
      }
    })
    mod.setNotificationsDisabledByUser(true)
    mod.showNotification('hola', 'cuerpo')
    expect(created).toEqual([])

    mod.setNotificationsDisabledByUser(false)
    mod.showNotification('hola', 'cuerpo')
    expect(created).toEqual(['hola'])
  })
})
