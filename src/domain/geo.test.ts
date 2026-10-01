import { describe, expect, it } from 'vitest'
import { decodePolyline } from './geo'

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
