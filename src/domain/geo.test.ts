import { describe, expect, it } from 'vitest'
import { buildTrackSegments, decodePolyline, type TrackPoint } from './geo'

describe('decodePolyline (petición real: "que me marque la ruta hasta Madrid como en Google Maps")', () => {
  it('decodifica el ejemplo oficial de la documentación de Google', () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm — el mismo
    // ejemplo que usa Google para documentar el algoritmo, con los puntos ya conocidos.
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')
    expect(points).toHaveLength(3)
    expect(points[0].lat).toBeCloseTo(38.5, 5)
    expect(points[0].lng).toBeCloseTo(-120.2, 5)
    expect(points[1].lat).toBeCloseTo(40.7, 5)
    expect(points[1].lng).toBeCloseTo(-120.95, 5)
    expect(points[2].lat).toBeCloseTo(43.252, 5)
    expect(points[2].lng).toBeCloseTo(-126.453, 5)
  })

  it('una cadena vacía no da puntos', () => {
    expect(decodePolyline('')).toEqual([])
  })
})

// Petición real: "el mapa no marca el recorrido bien". Datos reales de Paco: solo 44 puntos en 24 h, con dos
// huecos de ~4 h y 4,5 km entre los dos lados, que el mapa unía con una recta cruzando campos.
describe('buildTrackSegments (recorrido de las últimas 24 h)', () => {
  const MIN = 60_000
  const HOME = { lat: 38.0825, lng: -0.7733 }
  // ~0,0009° de latitud ≈ 100 m.
  const at = (minutes: number, dLat = 0, dLng = 0): TrackPoint => ({ lat: HOME.lat + dLat, lng: HOME.lng + dLng, at: minutes * MIN })

  it('un trayecto con lecturas seguidas es UN trozo de línea continua, sin huecos', () => {
    const track = [at(0), at(1, 0.0009), at(2, 0.0018), at(3, 0.0027), at(4, 0.0036)]
    const { solid, gaps } = buildTrackSegments(track)
    expect(solid).toHaveLength(1)
    expect(solid[0]).toHaveLength(5)
    expect(gaps).toEqual([])
  })

  it('un hueco de horas con 4,5 km por medio NO se une con una recta: son dos trozos y un tramo discontinuo', () => {
    // Caso real: 06:16 → 10:45 (269 min) y 4,5 km entre los dos puntos.
    const morning = [at(0), at(1, 0.0009), at(2, 0.0018)]
    const afternoon = [at(270, 0.04), at(271, 0.0409), at(272, 0.0418)]
    const { solid, gaps } = buildTrackSegments([...morning, ...afternoon])
    expect(solid).toHaveLength(2)
    expect(gaps).toHaveLength(1)
    expect(gaps[0][0]).toEqual({ lat: HOME.lat + 0.0018, lng: HOME.lng })
    expect(gaps[0][1]).toEqual({ lat: HOME.lat + 0.04, lng: HOME.lng })
  })

  it('quieto en el mismo sitio horas (un punto cada 5 min, o aunque pasen horas) se queda en línea continua: no es un hueco', () => {
    const { solid, gaps } = buildTrackSegments([at(0), at(5, 0.0001), at(300, 0.0002)])
    expect(solid).toHaveLength(1)
    expect(gaps).toEqual([])
  })

  it('un salto imposible del GPS (km en segundos) se descarta y no dibuja un pico', () => {
    const track = [at(0), at(1, 0.0009), { lat: HOME.lat + 1, lng: HOME.lng, at: 1.5 * MIN }, at(2, 0.0018), at(3, 0.0027)]
    const { solid } = buildTrackSegments(track)
    expect(solid).toHaveLength(1)
    expect(solid[0]).toHaveLength(4)
    expect(Math.max(...solid[0].map((p) => p.lat))).toBeLessThan(HOME.lat + 0.01)
  })

  it('si el GPS se reubica de verdad en otro sitio (varias lecturas seguidas coinciden), acaba aceptándolo y no pierde el resto del rastro', () => {
    const far = (m: number, i: number): TrackPoint => ({ lat: HOME.lat + 1 + i * 0.0009, lng: HOME.lng, at: m * MIN })
    const { solid } = buildTrackSegments([at(0), far(1, 0), far(1.2, 1), far(1.4, 2), far(1.6, 3), far(1.8, 4)])
    const all = solid.flat()
    expect(all.some((p) => p.lat > HOME.lat + 0.5)).toBe(true)
  })

  it('un solo punto aislado no dibuja línea; con un hueco a cada lado solo deja los dos tramos discontinuos', () => {
    const { solid, gaps } = buildTrackSegments([at(0), at(300, 0.04), at(600, 0.08)])
    expect(solid).toEqual([])
    expect(gaps).toHaveLength(2)
  })

  it('ordena por hora antes de unir y no falla con 0 o 1 puntos', () => {
    expect(buildTrackSegments([])).toEqual({ solid: [], gaps: [] })
    expect(buildTrackSegments([at(0)])).toEqual({ solid: [], gaps: [] })
    const { solid } = buildTrackSegments([at(2, 0.0018), at(0), at(1, 0.0009)])
    expect(solid[0].map((p) => p.lat)).toEqual([HOME.lat, HOME.lat + 0.0009, HOME.lat + 0.0018])
  })
})

// Guardas de cómo usa el mapa ese recorrido (LocationMap.tsx no se puede montar sin Google Maps: se lee su fuente).
describe('LocationMap — el recorrido ya no une los huecos con una recta', () => {
  const MAP = (import.meta.glob('/src/ui/LocationMap.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/LocationMap.tsx']

  it('dibuja los trozos con datos en línea continua y los huecos en discontinua (rayas)', () => {
    expect(MAP).toContain('buildTrackSegments(')
    expect(MAP).toContain('for (const path of solid)')
    expect(MAP).toContain('for (const pair of gaps)')
    expect(MAP).toContain('strokeOpacity: 0,')
    expect(MAP).toContain("repeat: '14px'")
  })

  it('ya no pasa el historial entero como UNA sola línea', () => {
    expect(MAP).not.toContain('history.map((p) => ({ lat: p.latitude, lng: p.longitude }))')
  })

  it('no recrea las líneas en cada refresco (parpadeo): solo si el rastro ha cambiado de verdad', () => {
    expect(MAP).toContain('lineSignaturesRef.current.get(member.id) === signature')
  })
})
