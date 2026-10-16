// Ubicación con la app nativa cerrada: la llave propia del móvil se pide una vez, se entrega al servicio nativo y se anula al dejar de compartir.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({ value: true, ios: false }))
const data = vi.hoisted(() => ({ createLocationDeviceToken: vi.fn(), revokeLocationDeviceTokens: vi.fn(), listPlaces: vi.fn() }))
const location = vi.hoisted(() => ({
  configureNativeUpload: vi.fn(),
  clearNativeUpload: vi.fn(),
  configureNativeRegions: vi.fn(),
  takeNativeDiagnostics: vi.fn(),
  hasBackgroundLocationPermission: vi.fn(),
}))

vi.mock('@/services/nativeApp', () => ({ isNativeApp: () => native.value, isIosApp: () => native.ios }))
vi.mock('@/data/location', () => data)
vi.mock('@/services/nativeLocation', () => location)

import { disableNativeUpload, enableNativeUpload, syncNativeRegions } from '@/services/nativeUpload'

beforeEach(async () => {
  vi.clearAllMocks()
  native.value = true
  native.ios = false
  data.createLocationDeviceToken.mockResolvedValue('t'.repeat(64))
  data.revokeLocationDeviceTokens.mockResolvedValue(undefined)
  location.configureNativeUpload.mockResolvedValue(undefined)
  location.clearNativeUpload.mockResolvedValue(undefined)
  location.configureNativeRegions.mockResolvedValue(undefined)
  location.takeNativeDiagnostics.mockResolvedValue({ log: '', lastOkAt: 0 })
  location.hasBackgroundLocationPermission.mockResolvedValue(true)
  data.listPlaces.mockResolvedValue([])
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

  const lugar = (id: string, notifyArrivals: boolean, radiusM = 50) => ({ id, familyId: 'f', name: id, category: null, latitude: 38, longitude: -1, radiusM, notifyArrivals })

  it('en iPhone, al empezar a compartir también se entregan los bordes de los lugares con aviso (con la app cerrada iOS despierta la app al cruzarlos)', async () => {
    native.ios = true
    data.listPlaces.mockResolvedValue([lugar('casa', true), lugar('cole', true, 30), lugar('gimnasio', false)])
    await enableNativeUpload('m1')
    await vi.waitFor(() => expect(location.configureNativeRegions).toHaveBeenCalledTimes(1))
    expect(location.configureNativeRegions).toHaveBeenCalledWith([
      { id: 'casa', latitude: 38, longitude: -1, radius: 100 },
      { id: 'cole', latitude: 38, longitude: -1, radius: 100 },
    ])
  })

  it('en Android no se mandan bordes (allí un servicio sigue vivo y no hacen falta)', async () => {
    native.ios = false
    data.listPlaces.mockResolvedValue([lugar('casa', true)])
    await enableNativeUpload('m1')
    await syncNativeRegions()
    expect(location.configureNativeRegions).not.toHaveBeenCalled()
  })

  it('syncNativeRegions (al crear, editar o borrar un lugar) vuelve a mandar la lista, y con una lista vacía deja de vigilar todo', async () => {
    native.ios = true
    data.listPlaces.mockResolvedValue([])
    await syncNativeRegions()
    expect(location.configureNativeRegions).toHaveBeenCalledWith([])
  })

  it('si falla cargar los lugares o la app es anterior a esta función, no rompe nada', async () => {
    native.ios = true
    data.listPlaces.mockRejectedValueOnce(new Error('sin red'))
    await expect(syncNativeRegions()).resolves.toBeUndefined()
    data.listPlaces.mockResolvedValue([lugar('casa', true)])
    location.configureNativeRegions.mockRejectedValueOnce(new Error('UNIMPLEMENTED'))
    await expect(syncNativeRegions()).resolves.toBeUndefined()
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
