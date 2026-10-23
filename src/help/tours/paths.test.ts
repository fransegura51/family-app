import { describe, expect, it } from 'vitest'
import { basePath, pathAllowed } from '@/help/tours/paths'

describe('pantallas permitidas de un tutorial', () => {
  it('una ruta exacta solo vale para ella misma', () => {
    expect(pathAllowed(['/comunidad'], '/comunidad')).toBe(true)
    expect(pathAllowed(['/comunidad'], '/comunidad/nueva')).toBe(false)
  })
  it('un comodín incluye la ruta base y todo lo que cuelga de ella, pero no rutas parecidas', () => {
    expect(pathAllowed(['/comunidad/*'], '/comunidad')).toBe(true)
    expect(pathAllowed(['/comunidad/*'], '/comunidad/p/123')).toBe(true)
    expect(pathAllowed(['/comunidad/*'], '/comunidad/nueva')).toBe(true)
    expect(pathAllowed(['/comunidad/*'], '/comunidadX')).toBe(false)
    expect(pathAllowed(['/comunidad/*'], '/eventos')).toBe(false)
  })
  it('basePath quita el comodín', () => {
    expect(basePath('/comunidad/*')).toBe('/comunidad')
    expect(basePath('/ayuda')).toBe('/ayuda')
  })
})
