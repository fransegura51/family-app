// Ubicación con la app nativa cerrada: la llave propia del móvil se pide una vez, se entrega al servicio nativo y se anula al dejar de compartir.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ value: true, ios: false }))
const data = vi.hoisted(() => ({ createLocationDeviceToken: vi.fn(), revokeLocationDeviceTokens: vi.fn() }))
const location = vi.hoisted(() => ({ configureNativeUpload: vi.fn(), clearNativeUpload: vi.fn() }))

vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => native.value, isIosApp: () => native.ios }))
vi.mock('@/data/location', () => data)
vi.mock('@/services/nativeLocation', () => location)

import { disableNativeUpload, enableNativeUpload } from '@/services/nativeUpload'

beforeEach(async () => {
  vi.clearAllMocks()
  native.value = true
  native.ios = false
  data.createLocationDeviceToken.mockResolvedValue('t'.repeat(64))
  data.revokeLocationDeviceTokens.mockResolvedValue(undefined)
  location.configureNativeUpload.mockResolvedValue(undefined)
  location.clearNativeUpload.mockResolvedValue(undefined)
  await disableNativeUpload() // deja el estado interno limpio
  vi.clearAllMocks()
})

describe('envío nativo de la ubicación (app cerrada)', () => {
  it('en iPhone también: la llave se entrega al código nativo que relanza la app y manda la ubicación', async () => {
    native.ios = true
    await enableNativeUpload('m1')
    expect(data.createLocationDeviceToken).toHaveBeenCalledWith('m1')
    expect(location.configureNativeUpload).toHaveBeenCalledWith('t'.repeat(64))
    await disableNativeUpload()
    expect(location.clearNativeUpload).toHaveBeenCalledTimes(1)
    expect(data.revokeLocationDeviceTokens).toHaveBeenCalledTimes(1)
  })

  it('pide la llave de ESA persona y se la da al servicio nativo', async () => {
    await enableNativeUpload('m1')
    expect(data.createLocationDeviceToken).toHaveBeenCalledWith('m1')
    expect(location.configureNativeUpload).toHaveBeenCalledWith('t'.repeat(64))
  })

  it('solo una vez por arranque y persona (no en cada reinicio del vigilante: ahorra llamadas)', async () => {
    await enableNativeUpload('m1')
    await enableNativeUpload('m1')
    await enableNativeUpload('m1')
    expect(data.createLocationDeviceToken).toHaveBeenCalledTimes(1)
  })

  it('si cambia la persona, pide otra llave', async () => {
    await enableNativeUpload('m1')
    await enableNativeUpload('m2')
    expect(data.createLocationDeviceToken).toHaveBeenCalledTimes(2)
    expect(data.createLocationDeviceToken).toHaveBeenLastCalledWith('m2')
  })

  it('si falla pedir la llave no rompe nada y se reintenta la próxima vez', async () => {
    data.createLocationDeviceToken.mockRejectedValueOnce(new Error('sin red'))
    await expect(enableNativeUpload('m1')).resolves.toBeUndefined()
    expect(location.configureNativeUpload).not.toHaveBeenCalled()
    await enableNativeUpload('m1')
    expect(location.configureNativeUpload).toHaveBeenCalledTimes(1)
  })

  it('una app nativa anterior (sin el servicio nuevo) no vuelve a pedir llave en cada reinicio del vigilante', async () => {
    location.configureNativeUpload.mockRejectedValue(new Error('UNIMPLEMENTED'))
    await enableNativeUpload('m1')
    await enableNativeUpload('m1')
    await enableNativeUpload('m1')
    expect(data.createLocationDeviceToken).toHaveBeenCalledTimes(1)
  })

  it('al dejar de compartir borra la configuración nativa y anula la llave en el servidor', async () => {
    await enableNativeUpload('m1')
    await disableNativeUpload()
    expect(location.clearNativeUpload).toHaveBeenCalledTimes(1)
    expect(data.revokeLocationDeviceTokens).toHaveBeenCalledTimes(1)
  })

  it('si el servidor no responde al anular, la configuración nativa se borra igual', async () => {
    data.revokeLocationDeviceTokens.mockRejectedValueOnce(new Error('sin red'))
    await expect(disableNativeUpload()).resolves.toBeUndefined()
    expect(location.clearNativeUpload).toHaveBeenCalledTimes(1)
  })

  it('en el navegador no hace nada', async () => {
    native.value = false
    await enableNativeUpload('m1')
    await disableNativeUpload()
    expect(data.createLocationDeviceToken).not.toHaveBeenCalled()
    expect(location.clearNativeUpload).not.toHaveBeenCalled()
    expect(data.revokeLocationDeviceTokens).not.toHaveBeenCalled()
  })
})
