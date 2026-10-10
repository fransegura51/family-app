// Conectar Google Calendar y el banco desde la app nativa: se abre en una pestaña segura y se vuelve a la APP (no al navegador); en la web nada cambia.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const browser = vi.hoisted(() => ({ open: vi.fn() }))
const native = vi.hoisted(() => ({ value: true }))
vi.mock('@capacitor/browser', () => ({ Browser: browser }))
vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => native.value }))
vi.mock('@/data/supabaseClient', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } },
}))

import volverApp from '../../public/volver-app.html?raw'
import manifest from '../../android/app/src/main/AndroidManifest.xml?raw'
import googleStart from '../../supabase/functions/google-calendar-oauth-start/index.ts?raw'
import googleCallback from '../../supabase/functions/google-calendar-oauth-callback/index.ts?raw'
import bankStart from '../../supabase/functions/enable-banking-auth-start/index.ts?raw'
import bankCallback from '../../supabase/functions/enable-banking-auth-callback/index.ts?raw'
import appSrc from '@/App.tsx?raw'
import { ALLOWED_RETURN_PATHS, parseDeepLink } from '@/domain/nativeDeepLink'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  native.value = true
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' }) })
})

describe('enlace de vuelta a la app', () => {
  it('convierte el enlace de PEPA en una ruta interna, con su consulta', () => {
    expect(parseDeepLink('es.pepafamilyapp.app://open/calendario?google=connected')).toBe('/calendario?google=connected')
    expect(parseDeepLink('es.pepafamilyapp.app://open/?bank=connected&detail=ok')).toBe('/?bank=connected&detail=ok')
    expect(parseDeepLink('es.pepafamilyapp.app://open/dinero?bank=error')).toBe('/dinero?bank=error')
    expect(parseDeepLink('es.pepafamilyapp.app://open')).toBe('/')
  })
  it('solo acepta las rutas conocidas a las que ya volvía la web, y nada de otras apps o direcciones', () => {
    expect([...ALLOWED_RETURN_PATHS]).toEqual(['/', '/calendario', '/dinero'])
    for (const bad of ['es.pepafamilyapp.app://open/admin-uso', 'es.pepafamilyapp.app://open//malo.com', 'https://malo.example/calendario', 'otra.app://open/calendario', 'es.pepafamilyapp.app://open/../familia']) {
      expect(parseDeepLink(bad), bad).toBeNull()
    }
  })
})

describe('arranque de la conexión', () => {
  it('Google, desde la app: avisa al servidor (native=1) y abre la pestaña segura (no sale de la app)', async () => {
    const { startGoogleConnect } = await import('@/data/googleCalendarSync')
    await startGoogleConnect()
    expect(fetchMock.mock.calls[0][0]).toContain('/functions/v1/google-calendar-oauth-start?native=1')
    expect(browser.open).toHaveBeenCalledWith({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' })
  })
  it('Google, desde el navegador: igual que siempre (sin native, y se salta con la propia pestaña)', async () => {
    native.value = false
    const loc = { href: '' }
    vi.stubGlobal('window', { location: loc })
    const { startGoogleConnect } = await import('@/data/googleCalendarSync')
    await startGoogleConnect()
    expect(fetchMock.mock.calls[0][0]).not.toContain('native')
    expect(loc.href).toBe('https://accounts.google.com/o/oauth2/v2/auth?x=1')
    expect(browser.open).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('Banco, desde la app: el servidor recibe native: true y se abre la pestaña segura', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://banco.example/auth' }) })
    const { startBankConnection } = await import('@/data/bank')
    await startBankConnection('Caja Rural', 'ES')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ aspspName: 'Caja Rural', aspspCountry: 'ES', native: true })
    expect(browser.open).toHaveBeenCalledWith({ url: 'https://banco.example/auth' })
  })
  it('Banco, desde el navegador: no manda native y salta con la pestaña', async () => {
    native.value = false
    const loc = { href: '' }
    vi.stubGlobal('window', { location: loc })
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: 'https://banco.example/auth' }) })
    const { startBankConnection } = await import('@/data/bank')
    await startBankConnection('Caja Rural', 'ES')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).native).toBeUndefined()
    expect(loc.href).toBe('https://banco.example/auth')
    vi.unstubAllGlobals()
  })
})

describe('servidor: vuelve a la app solo si la conexión empezó en la app', () => {
  it('las dos funciones de inicio meten la marca en el state SOLO si viene de la app nativa', () => {
    expect(googleStart).toContain('searchParams.get("native") === "1"')
    expect(googleStart).toContain('...(fromApp ? { app: true } : {})')
    expect(bankStart).toContain('native } = await req.json()')
    expect(bankStart).toContain('...(native === true ? { app: true } : {})')
  })
  it('las dos de vuelta leen la marca antes que nada (también si el usuario cancela) y mandan a la página puente en vez de a la web', () => {
    for (const src of [googleCallback, bankCallback]) {
      expect(src).toContain('const APP_BRIDGE_URL = "https://fransegura51.github.io/family-app/volver-app.html"')
      expect(src).toContain('fromApp = readAppFlag(stateRaw)')
      expect(src.indexOf('fromApp = readAppFlag(stateRaw)')).toBeLessThan(src.indexOf('return back("error", '))
      expect(src).toContain('bridge.searchParams.set("to"')
      // Ninguna salida del manejador se salta la marca: todas pasan por back().
      const handler = src.slice(src.indexOf('Deno.serve('))
      expect(handler).not.toContain('return redirectTo(')
      // Y `back` se declara FUERA del try, para que valga también en el catch de errores inesperados.
      expect(handler.indexOf('const back =')).toBeLessThan(handler.indexOf('  try {'))
    }
  })
  it('a la web se vuelve exactamente a donde se volvía antes cuando no hay marca', () => {
    expect(googleCallback).toContain('const APP_RETURN_URL = "https://fransegura51.github.io/family-app/calendario"')
    expect(bankCallback).toContain('const APP_RETURN_URL = "https://fransegura51.github.io/family-app/"')
    expect(googleCallback).toContain('bridge.searchParams.set("to", `/calendario${url.search}`)')
    expect(bankCallback).toContain('bridge.searchParams.set("to", `/${url.search}`)')
  })
})

describe('página puente y Android', () => {
  function runBridge(search: string) {
    const els: Record<string, { href: string }> = { app: { href: '' }, web: { href: '' } }
    const script = volverApp.match(/<script>([\s\S]*?)<\/script>/)![1]
    const loc = { search, href: '' }
    new Function('location', 'document', 'URLSearchParams', 'setTimeout', script)(loc, { getElementById: (id: string) => els[id] }, URLSearchParams, () => 0)
    return { app: els.app.href, web: els.web.href }
  }
  it('arma el enlace de la app y el de la web a partir de la ruta indicada', () => {
    expect(runBridge('?to=%2Fcalendario%3Fgoogle%3Dconnected')).toEqual({
      app: 'es.pepafamilyapp.app://open/calendario?google=connected',
      web: 'https://fransegura51.github.io/family-app/calendario?google=connected',
    })
  })
  it('una ruta rara (otra dirección, esquema, doble barra) se sustituye por la raíz', () => {
    for (const bad of ['?to=https%3A%2F%2Fmalo.example', '?to=%2F%2Fmalo.example', '?to=javascript%3Aalert(1)', '?to=%2Fjavascript%3Aalert(1)', '']) {
      expect(runBridge(bad).app, bad).toBe('es.pepafamilyapp.app://open/')
    }
  })
  it('la app de Android atiende los enlaces es.pepafamilyapp.app:// (con el nombre que ya trae el proyecto)', () => {
    expect(manifest).toContain('android:scheme="@string/custom_url_scheme"')
    expect(manifest).toContain('android.intent.category.BROWSABLE')
    expect(manifest).toContain('android.intent.action.VIEW')
  })
  it('la app recibe los enlaces dentro del router, junto a los demás vigilantes', () => {
    expect(appSrc).toContain('<NativeDeepLinks />')
  })
})
