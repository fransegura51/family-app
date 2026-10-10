// App nativa de PEPA (Capacitor, fase A de Android): ubicación en segundo plano, envío nativo de la posición y configuración sin secretos.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = vi.hoisted(() => ({
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(),
  openSettings: vi.fn(),
}))
const http = vi.hoisted(() => ({ post: vi.fn() }))
const native = vi.hoisted(() => ({ value: true }))

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => plugin,
  CapacitorHttp: http,
  Capacitor: { isNativePlatform: () => native.value },
}))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }) } }))

import { buildHistoryPointRequest, buildLiveLocationRequest, postHistoryPointNative, postLiveLocationNative } from '@/data/liveLocationNative'
import { watchPosition } from '@/services/geolocation'
import androidWorkflow from '../../.github/workflows/android-apk.yml?raw'
import deployWorkflow from '../../.github/workflows/deploy.yml?raw'
import { NATIVE_DISTANCE_FILTER_M, NATIVE_WATCHER_OPTIONS, watchNativePosition } from '@/services/nativeLocation'

const FILES = import.meta.glob(
  ['/capacitor.config.ts', '/android/app/build.gradle', '/src/data/location.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.clearAllMocks()
  native.value = true
  plugin.addWatcher.mockResolvedValue('w1')
  plugin.removeWatcher.mockResolvedValue(undefined)
  plugin.openSettings.mockResolvedValue(undefined)
})

describe('ubicación en segundo plano (app nativa)', () => {
  it('el vigilante pide seguir con el móvil bloqueado: lleva mensaje de segundo plano (sin él solo funciona con la app abierta)', () => {
    expect(NATIVE_WATCHER_OPTIONS.backgroundMessage).toBeTruthy()
    expect(NATIVE_WATCHER_OPTIONS.backgroundTitle).toBeTruthy()
    expect(NATIVE_WATCHER_OPTIONS.requestPermissions).toBe(true)
    expect(NATIVE_WATCHER_OPTIONS.distanceFilter).toBe(NATIVE_DISTANCE_FILTER_M)
    expect(NATIVE_DISTANCE_FILTER_M).toBeLessThan(150) // los lugares de PEPA miden 150 m
  })
  it('las posiciones llegan a quien escucha, con latitud y longitud', async () => {
    const seen: unknown[] = []
    watchNativePosition((c) => seen.push(c))
    await flush()
    const callback = plugin.addWatcher.mock.calls[0][1] as (l: unknown, e?: unknown) => void
    callback({ latitude: 38.1, longitude: -0.85, accuracy: 9, time: 1 })
    expect(seen).toEqual([{ latitude: 38.1, longitude: -0.85 }])
  })
  it('sin permiso: avisa con el código 1 (el mismo que la API web, que hace que PEPA deje de compartir) y abre los ajustes', async () => {
    const errors: [string, number][] = []
    watchNativePosition(() => undefined, (m, c) => errors.push([m, c]))
    await flush()
    const callback = plugin.addWatcher.mock.calls[0][1] as (l: unknown, e?: unknown) => void
    callback(undefined, { code: 'NOT_AUTHORIZED', message: 'x' })
    expect(errors[0][1]).toBe(1)
    expect(errors[0][0]).toContain('Permitir siempre')
    expect(plugin.openSettings).toHaveBeenCalled()
  })
  it('al parar se retira el vigilante; si se para antes de que arranque, se retira en cuanto arranca', async () => {
    const stop = watchNativePosition(() => undefined)
    await flush()
    stop()
    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'w1' })

    plugin.removeWatcher.mockClear()
    const stopEarly = watchNativePosition(() => undefined)
    stopEarly() // antes de que addWatcher resuelva
    await flush()
    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'w1' })
  })
})

describe('watchPosition elige según dónde corre', () => {
  it('dentro de la app nativa usa el vigilante nativo', async () => {
    native.value = true
    watchPosition(() => undefined)
    await flush()
    expect(plugin.addWatcher).toHaveBeenCalledTimes(1)
  })
  it('en el navegador sigue usando la API web, sin tocar el plugin', () => {
    native.value = false
    const watch = vi.fn().mockReturnValue(7)
    vi.stubGlobal('navigator', { geolocation: { watchPosition: watch, clearWatch: vi.fn() } })
    watchPosition(() => undefined)
    expect(watch).toHaveBeenCalledTimes(1)
    expect(plugin.addWatcher).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('envío nativo de la posición en vivo', () => {
  const args = {
    supabaseUrl: 'https://x.supabase.co',
    anonKey: 'anon',
    accessToken: 'jwt',
    familyId: 'fam',
    memberId: 'mem',
    latitude: 38.1,
    longitude: -0.85,
    recordedAt: '2026-10-09T20:00:00.000Z',
  }
  it('es el mismo upsert que hace supabase-js: mezcla por miembro, con el token de la sesión', () => {
    const req = buildLiveLocationRequest(args)
    expect(req.url).toBe('https://x.supabase.co/rest/v1/member_locations?on_conflict=member_id')
    expect(req.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer jwt', Prefer: 'resolution=merge-duplicates,return=minimal' })
    expect(req.data).toEqual([{ member_id: 'mem', family_id: 'fam', latitude: 38.1, longitude: -0.85, recorded_at: args.recordedAt }])
  })
  it('un fallo del servidor se nota (no se da por guardada una posición que no se guardó)', async () => {
    http.post.mockResolvedValueOnce({ status: 201 })
    await expect(postLiveLocationNative(args)).resolves.toBeUndefined()
    http.post.mockResolvedValueOnce({ status: 401 })
    await expect(postLiveLocationNative(args)).rejects.toThrow('401')
  })
  it('el rastro de la ruta también sale por la capa nativa (con la web se congelaba en segundo plano): mismo cuerpo que supabase-js, sin pisar nada', () => {
    const req = buildHistoryPointRequest(args)
    expect(req.url).toBe('https://x.supabase.co/rest/v1/member_location_history')
    expect(req.headers).toMatchObject({ apikey: 'anon', Authorization: 'Bearer jwt', Prefer: 'return=minimal' })
    expect(req.headers.Prefer).not.toContain('merge-duplicates') // cada punto es una fila nueva
    expect(req.data).toEqual([{ member_id: 'mem', family_id: 'fam', latitude: 38.1, longitude: -0.85, recorded_at: args.recordedAt }])
  })
  it('un fallo al guardar un punto del rastro se nota', async () => {
    http.post.mockResolvedValueOnce({ status: 201 })
    await expect(postHistoryPointNative(args)).resolves.toBeUndefined()
    http.post.mockResolvedValueOnce({ status: 403 })
    await expect(postHistoryPointNative(args)).rejects.toThrow('403')
  })
  it('appendLocationHistoryPoint usa el camino nativo solo dentro de la app nativa', () => {
    const src = FILES['/src/data/location.ts']
    expect(src).toContain('await postHistoryPointNative({')
  })
  it('updateMemberLocation usa el camino nativo solo dentro de la app nativa y recuerda la familia en memoria', () => {
    const src = FILES['/src/data/location.ts']
    expect(src).toContain('if (isNativeApp()) {')
    expect(src).toContain('await postLiveLocationNative({')
    expect(src).toContain('nativeFamilyCache')
  })
})

describe('configuración de la app y secretos', () => {
  const config = FILES['/capacitor.config.ts']
  it('abre la PEPA publicada (por https) y activa lo que la ubicación en segundo plano exige en Android', () => {
    expect(config).toContain("appId: 'es.pepafamilyapp.app'")
    expect(config).toContain("url: 'https://fransegura51.github.io/family-app/'")
    expect(config).toContain('cleartext: false')
    expect(config).toContain('useLegacyBridge: true')
  })
  it('la llave de firma NO está en el repositorio (es público): el APK se firma con variables de entorno de GitHub Actions', () => {
    const gradle = FILES['/android/app/build.gradle']
    expect(gradle).toContain("System.getenv('PEPA_KEYSTORE_PATH')")
    expect(gradle).not.toMatch(/storePassword\s+['"]/)
    expect(gradle).not.toMatch(/keyPassword\s+['"]/)
    const wf = androidWorkflow
    for (const secret of ['ANDROID_KEYSTORE_B64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) expect(wf).toContain(`secrets.${secret}`)
    expect(wf).not.toMatch(/PASSWORD:\s+[^$\s]/)
  })
  it('la construcción del APK es aparte y manual: no toca el despliegue de la web', () => {
    const wf = androidWorkflow
    expect(wf).toContain('workflow_dispatch:')
    expect(wf).not.toMatch(/\bpush:/)
    expect(deployWorkflow).not.toContain('android')
  })
  it('cada compilación sube el número de versión (Android solo instala encima una versión mayor)', () => {
    expect(FILES['/android/app/build.gradle']).toContain("project.property('pepaVersionCode')")
    expect(androidWorkflow).toContain('-PpepaVersionCode=${{ github.run_number }}')
  })
})
