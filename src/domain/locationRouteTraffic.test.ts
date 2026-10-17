// «¿Cómo está el tráfico hasta Madrid?» y sus formas de decirlo (petición real, 17/10/2026): antes no encajaba en ninguna orden de Ubicación.
import { describe, expect, it } from 'vitest'
import { cleanTrafficPlace, routeLocation } from './locationRoute'

describe('tráfico hasta un destino', () => {
  const casos: [string, string][] = [
    ['¿Cómo está el tráfico hasta Madrid?', 'madrid'],
    ['como esta el trafico a Madrid ahora mismo', 'madrid'],
    ['cómo va el tráfico hacia Valencia', 'valencia'],
    ['qué tal el tráfico para ir a Murcia', 'murcia'],
    ['hay tráfico hasta el cole', 'el cole'],
    ['hay atascos hacia Alicante', 'alicante'],
    ['hay retenciones en la carretera a Madrid', 'madrid'],
    ['cómo está la carretera hasta el trabajo', 'el trabajo'],
    ['dime el tráfico a Elche', 'elche'],
    ['cómo está el tráfico en Madrid', 'madrid'],
    ['cómo está el tráfico hasta el aeropuerto de Alicante por favor', 'el aeropuerto de alicante'],
    ['cómo está el tráfico de camino a casa', 'casa'],
  ]
  for (const [frase, lugar] of casos) {
    it(`«${frase}» -> tráfico hasta «${lugar}»`, () => {
      expect(routeLocation(frase)).toEqual({ type: 'eta', place: lugar, traffic: true })
    })
  }

  it('sin destino no es una orden de Ubicación', () => {
    expect(routeLocation('hay tráfico')).toBeNull()
    expect(routeLocation('cómo está el tráfico')).toBeNull()
  })

  it('«cuánto se tarda» sigue siendo la pregunta de siempre, sin la marca de tráfico', () => {
    expect(routeLocation('cuánto se tarda hasta Madrid')).toEqual({ type: 'eta', place: 'madrid' })
  })

  it('cleanTrafficPlace quita los rellenos del final', () => {
    expect(cleanTrafficPlace('madrid ahora mismo')).toBe('madrid')
    expect(cleanTrafficPlace('valencia hoy por favor')).toBe('valencia')
    expect(cleanTrafficPlace('murcia?')).toBe('murcia')
  })
})
