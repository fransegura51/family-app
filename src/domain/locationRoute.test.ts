import { describe, expect, it } from 'vitest'
import { routeLocation } from './locationRoute'

describe('routeLocation: buscar', () => {
  it('reconoce los verbos de siempre y limpia la frase', () => {
    expect(routeLocation('busca una farmacia de guardia')).toEqual({ type: 'search', term: 'una farmacia de guardia' })
    expect(routeLocation('búscame un restaurante cercano')).toEqual({ type: 'search', term: 'un restaurante' })
    expect(routeLocation('dónde está el ambulatorio')).toEqual({ type: 'search', term: 'el ambulatorio' })
    expect(routeLocation('dónde queda el colegio')).toEqual({ type: 'search', term: 'el colegio' })
  })

  it('también reconoce el infinitivo "buscar" (petición real)', () => {
    expect(routeLocation('buscar cargo frío mediterránea')).toEqual({ type: 'search', term: 'cargo frio mediterranea' })
    expect(routeLocation('buscar casa')).toEqual({ type: 'search', term: 'casa' })
    expect(routeLocation('buscar Mercadona Callosa')).toEqual({ type: 'search', term: 'mercadona callosa' })
  })

  it('una frase sin ningún verbo de búsqueda no es de Ubicación', () => {
    expect(routeLocation('qué tengo mañana')).toBeNull()
  })

  it('"buscar/busca una receta de..." no es de Ubicación — eso lo resuelve Cocina', () => {
    expect(routeLocation('busca una receta de tortilla')).toBeNull()
    expect(routeLocation('buscar una receta de lentejas')).toBeNull()
  })
})

describe('routeLocation: guardar', () => {
  it('la frase corta, sin nada más, cuenta como guardar', () => {
    expect(routeLocation('guárdalo')).toEqual({ type: 'save', name: null })
    expect(routeLocation('guárdala')).toEqual({ type: 'save', name: null })
    expect(routeLocation('guárdamelo')).toEqual({ type: 'save', name: null })
  })

  it('mencionar "sitio"/"lugar" también cuenta, aunque diga más cosas', () => {
    expect(routeLocation('guarda este sitio')).toEqual({ type: 'save', name: null })
    expect(routeLocation('guarda este lugar')).toEqual({ type: 'save', name: null })
  })

  it('con nombre nuevo ("como...")', () => {
    expect(routeLocation('guárdalo como Farmacia de la esquina')).toEqual({ type: 'save', name: 'farmacia de la esquina' })
    expect(routeLocation('guarda este sitio como El cole')).toEqual({ type: 'save', name: 'el cole' })
  })

  it('un "guarda" de la compra o el calendario, con más cosas detrás, no es de Ubicación', () => {
    expect(routeLocation('guarda leche y pan')).toBeNull()
    expect(routeLocation('guárdame la cita del viernes')).toBeNull()
  })
})

describe('routeLocation: tiempo en coche', () => {
  it('reconoce varias formas de preguntarlo', () => {
    expect(routeLocation('cuánto se tarda en coche a la farmacia')).toEqual({ type: 'eta', place: 'la farmacia' })
    expect(routeLocation('cuánto tardo hasta el cole')).toEqual({ type: 'eta', place: 'el cole' })
    expect(routeLocation('cuánto tiempo se tarda a casa de la abuela')).toEqual({ type: 'eta', place: 'casa de la abuela' })
    expect(routeLocation('cuánto se tarda en coche al aeropuerto')).toEqual({ type: 'eta', place: 'aeropuerto' })
  })

  it('peticiones reales: "cuánto tiempo tengo hasta X", "qué tiempo tengo hasta X", "qué distancia tengo hasta X"', () => {
    expect(routeLocation('cuánto tiempo tengo hasta trabajo')).toEqual({ type: 'eta', place: 'trabajo' })
    expect(routeLocation('qué tiempo tengo hasta Madrid')).toEqual({ type: 'eta', place: 'madrid' })
    expect(routeLocation('qué distancia tengo hasta Madrid')).toEqual({ type: 'eta', place: 'madrid' })
    expect(routeLocation('qué distancia hay hasta el cole')).toEqual({ type: 'eta', place: 'el cole' })
  })

  it('más peticiones reales: "cuánto queda...", "cuántos kilómetros tenemos a...", "qué se tarda en llegar a..."', () => {
    expect(routeLocation('cuánto queda hasta Valencia')).toEqual({ type: 'eta', place: 'valencia' })
    expect(routeLocation('cuántos kilómetros tenemos a Valencia')).toEqual({ type: 'eta', place: 'valencia' })
    expect(routeLocation('cuántos kilómetros tenemos a Madrid')).toEqual({ type: 'eta', place: 'madrid' })
    expect(routeLocation('cuántos kilómetros tenemos a Bilbao')).toEqual({ type: 'eta', place: 'bilbao' })
    expect(routeLocation('qué se tarda en llegar a Alicante')).toEqual({ type: 'eta', place: 'alicante' })
  })
})

describe('routeLocation: quién está más cerca', () => {
  it('reconoce varias formas de preguntarlo', () => {
    expect(routeLocation('quién está más cerca de la farmacia')).toEqual({ type: 'nearest', place: 'la farmacia' })
    expect(routeLocation('quién anda más cerca del cole')).toEqual({ type: 'nearest', place: 'cole' })
  })
})

describe('routeLocation: nada de esto', () => {
  it('devuelve null para frases que no son de Ubicación', () => {
    expect(routeLocation('qué cenamos hoy')).toBeNull()
    expect(routeLocation('añade leche a Mercadona')).toBeNull()
  })
})
