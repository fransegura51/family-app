// Bordes de lugares que vigila el iPhone con la app cerrada (16/10/2026): casa y el cole están a 439 m y los cambios significativos de ubicación solo
// despiertan la app tras ~500 m, así que no salió ningún aviso. Las regiones de iOS sí despiertan la app al cruzar el borde de un lugar.
import { describe, expect, it } from 'vitest'
import { NATIVE_REGION_MAX, NATIVE_REGION_MIN_RADIUS_M, placesToNativeRegions } from '@/domain/nativeRegions'
import type { LocationPlace } from '@/domain/types'
import swift from '../../ios-patches/background-geolocation/PepaNativeLocation.swift?raw'
import patch from '../../scripts/patch-background-geolocation-ios.mjs?raw'
import nativeUpload from '@/services/nativeUpload.ts?raw'
import nativeLocation from '@/services/nativeLocation.ts?raw'
import placesData from '@/data/location.ts?raw'

function place(id: string, over: Partial<LocationPlace> = {}): LocationPlace {
  return { id, familyId: 'f', name: id, category: null, latitude: 38.0, longitude: -1.0, radiusM: 50, notifyArrivals: true, ...over }
}

describe('placesToNativeRegions', () => {
  it('solo vigila los lugares con el aviso de llegada/salida activado: son los únicos con avisos del servidor', () => {
    const regions = placesToNativeRegions([place('a'), place('b', { notifyArrivals: false })])
    expect(regions.map((r) => r.id)).toEqual(['a'])
  })

  it('el borde nunca baja de 100 m (iOS no es fiable con menos), pero un lugar grande conserva su radio', () => {
    const regions = placesToNativeRegions([place('a', { radiusM: 50 }), place('b', { radiusM: 300 }), place('c', { radiusM: 0 })])
    expect(NATIVE_REGION_MIN_RADIUS_M).toBe(100)
    expect(regions.map((r) => r.radius)).toEqual([100, 300, 100])
  })

  it('entrega id, latitud, longitud y radio, y descarta posiciones inválidas', () => {
    const regions = placesToNativeRegions([place('a', { latitude: 37.99, longitude: -1.13 }), place('x', { latitude: Number.NaN })])
    expect(regions).toEqual([{ id: 'a', latitude: 37.99, longitude: -1.13, radius: 100 }])
  })

  it('iOS admite como máximo 20 regiones por app: se mandan 20, siempre las mismas (orden estable)', () => {
    const many = Array.from({ length: 25 }, (_, i) => place(`p${String(i).padStart(2, '0')}`))
    const regions = placesToNativeRegions([...many].reverse())
    expect(NATIVE_REGION_MAX).toBe(20)
    expect(regions).toHaveLength(20)
    expect(regions[0].id).toBe('p00')
    expect(regions[19].id).toBe('p19')
  })

  it('sin lugares devuelve una lista vacía (así se dejan de vigilar los que hubiera)', () => {
    expect(placesToNativeRegions([])).toEqual([])
  })
})

describe('código nativo del iPhone: vigilar los bordes', () => {
  it('registra regiones circulares con entrada y salida, solo con su prefijo, y respeta el máximo de 20', () => {
    expect(swift).toContain('CLCircularRegion(')
    expect(swift).toContain('region.notifyOnEntry = true')
    expect(swift).toContain('region.notifyOnExit = true')
    expect(swift).toContain('manager.startMonitoring(for: region)')
    expect(swift).toContain('region.identifier.hasPrefix(PepaNativeLocation.regionPrefix)')
    expect(swift).toContain('list.prefix(20)')
    expect(swift).toContain('isMonitoringAvailable(for: CLCircularRegion.self)')
  })

  it('al cruzar un borde (entrar o salir) despierta la ubicación continua y se apaga sola tras un rato sin moverse, para no gastar batería', () => {
    expect(swift).toContain('didEnterRegion region: CLRegion')
    expect(swift).toContain('didExitRegion region: CLRegion')
    expect(swift).toContain('wakeForRegion()')
    expect(swift).toContain('idleStopSeconds: TimeInterval = 180')
    expect(swift).toContain('self?.manager?.stopUpdatingLocation()')
  })

  it('al relanzar iOS la app cerrada se vuelven a registrar los bordes guardados (start → syncRegions) y al borrar la configuración se paran', () => {
    expect(swift).toMatch(/manager\.startUpdatingLocation\(\)\s*scheduleIdleStop\(\)\s*syncRegions\(\)/)
    expect(swift).toContain('PepaNativeLocation.keyRegions,')
    expect(swift).toMatch(/private func stop\(\) \{[\s\S]*?stopMonitoring\(for: region\)/)
  })

  it('sigue vigilando los cambios significativos de ubicación (los bordes los complementan, no los sustituyen)', () => {
    expect(swift).toContain('startMonitoringSignificantLocationChanges()')
  })

  it('el parche expone setNativeRegions a JavaScript (Swift y Objective-C) y guarda la lista tal cual', () => {
    expect(patch).toContain('CAPPluginMethod(name: "setNativeRegions"')
    expect(patch).toContain('CAP_PLUGIN_METHOD(setNativeRegions, CAPPluginReturnPromise)')
    expect(patch).toContain('PepaNativeLocation.shared.setRegions(json: json)')
  })
})

describe('la app entrega los bordes al iPhone', () => {
  it('al empezar a compartir y cada vez que cambian los lugares (crear, editar, borrar, activar/desactivar el aviso)', () => {
    expect(nativeUpload).toContain('void syncNativeRegions()')
    expect(nativeUpload).toContain('export async function syncNativeRegions()')
    expect(nativeUpload).toContain('if (!isNativeApp() || !isIosApp()) return')
    expect((placesData.match(/void resyncNativeRegions\(\)/g) ?? []).length).toBe(4)
  })

  it('el método nativo se declara en el complemento y se manda la lista como texto JSON', () => {
    expect(nativeLocation).toContain('setNativeRegions(options: { regionsJson: string }): Promise<void>')
    expect(nativeLocation).toContain('JSON.stringify(regions)')
  })
})

describe('código nativo del iPhone: saltos de GPS y posiciones de red falsas', () => {
  it('una lectura a más de 150 m de la última enviada (hasta un día después) se retiene: no se envía sin pruebas de movimiento real', () => {
    expect(swift).toContain('jumpMeters: CLLocationDistance = 150')
    expect(swift).toContain('jumpCheckWindowSeconds: TimeInterval = 86_400')
    expect(swift).toContain('if fromLast <= PepaNativeLocation.jumpMeters { return markAccepted(location) }')
    expect(swift).toContain('heldJump = HeldJump(first: location, last: location, speedReadings: 0, awayReadings: 0)')
  })

  it('se acepta con dos lecturas seguidas con velocidad ≥ 0,5 m/s, o tres seguidas cada vez más lejos, o 30 min en el mismo sitio (la misma regla que Android y la app abierta)', () => {
    expect(swift).toContain('minMovingSpeed: CLLocationSpeed = 0.5')
    expect(swift).toContain('jumpSpeedReadings = 2')
    expect(swift).toContain('jumpAwayReadings = 3')
    expect(swift).toContain('jumpPersistSeconds: TimeInterval = 1_800')
    expect(swift).toContain('jumpMinAwayStep: CLLocationDistance = 15')
    expect(swift).toContain('location.speed >= PepaNativeLocation.minMovingSpeed')
    expect(swift).toMatch(/next\.speedReadings >= PepaNativeLocation\.jumpSpeedReadings\s*\|\| next\.awayReadings >= PepaNativeLocation\.jumpAwayReadings\s*\|\| location\.timestamp\.timeIntervalSince\(next\.first\.timestamp\) >= PepaNativeLocation\.jumpPersistSeconds/)
  })

  it('solo lo que se envía actualiza la última posición y el reloj de envíos; una lectura retenida no cambia nada', () => {
    expect(swift).toMatch(/private func markAccepted\(_ location: CLLocation\) -> Bool \{\s*heldJump = nil\s*lastSentLocation = location\s*return true\s*\}/)
    expect(swift).toMatch(/if !acceptAfterJumpCheck\(location\) \{ return \}\s*lastUploadAt = now\s*upload\(location\)/)
  })

  it('mantiene los filtros de siempre (un envío cada 10 s, precisión mejor de 100 m, lectura reciente) antes de mirar el salto', () => {
    expect(swift).toContain('minUploadGap { return }')
    expect(swift.indexOf('maxAccuracy { return }')).toBeLessThan(swift.indexOf('acceptAfterJumpCheck(location)'))
    expect(swift.indexOf('maxReadingAgeSeconds { return }')).toBeLessThan(swift.indexOf('acceptAfterJumpCheck(location)'))
  })
})

describe('código nativo del iPhone: lectura antigua al relanzar la app cerrada', () => {
  it('una lectura de más de 15 s de antigüedad no se envía (el servidor la daría por reciente)', () => {
    expect(swift).toContain('maxReadingAgeSeconds: TimeInterval = 15')
    expect(swift).toContain('now.timeIntervalSince(location.timestamp) > PepaNativeLocation.maxReadingAgeSeconds { return }')
    expect(swift.indexOf('maxAccuracy { return }')).toBeLessThan(swift.indexOf('maxReadingAgeSeconds { return }'))
  })

  it('la última posición enviada se guarda en el móvil (sobrevive a que iOS relance la app) y se borra con la configuración', () => {
    expect(swift).toContain('private var lastSentLocation: CLLocation? {')
    expect(swift).toContain('defaults.set(location.coordinate.latitude, forKey: PepaNativeLocation.keyLastLat)')
    expect(swift).toMatch(/PepaNativeLocation\.keyRegions,\s*PepaNativeLocation\.keyLastLat, PepaNativeLocation\.keyLastLon, PepaNativeLocation\.keyLastAt\]/)
  })
})

