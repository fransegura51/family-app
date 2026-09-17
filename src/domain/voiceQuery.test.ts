import { describe, expect, it } from 'vitest'
import { buildNearbySearchUrl, extractPlaceSearchTerm, isUnsupportedDelete, normalize, stripWakeWord } from '@/domain/voiceQuery'

describe('normalize', () => {
  it('minúsculas y sin acentos, para comparar como habla la gente', () => {
    expect(normalize('  Qué tengo Mañana  ')).toBe('que tengo manana')
  })
})

describe('stripWakeWord', () => {
  it('quita "Pepa" (con "oye"/"vale" delante) esté donde esté', () => {
    expect(stripWakeWord('Pepa, apunta leche y pan')).toBe('apunta leche y pan')
    expect(stripWakeWord('vale Pepa, ponme en el calendario cita')).toBe('ponme en el calendario cita')
    expect(stripWakeWord('oye pepa apunta huevos')).toBe('apunta huevos')
  })
  it('sin Pepa, no toca nada', () => {
    expect(stripWakeWord('apunta leche')).toBe('apunta leche')
  })
})

describe('extractPlaceSearchTerm', () => {
  it('quita el verbo delante y "cerca/cercano" detrás', () => {
    expect(extractPlaceSearchTerm('búscame un restaurante cercano')).toBe('un restaurante')
    expect(extractPlaceSearchTerm('busca una farmacia de guardia')).toBe('una farmacia de guardia')
    expect(extractPlaceSearchTerm('dónde hay un supermercado cerca de aquí')).toBe('un supermercado')
  })
  it('sin coletillas, se queda tal cual (normalizado)', () => {
    expect(extractPlaceSearchTerm('gasolinera')).toBe('gasolinera')
  })
})

describe('buildNearbySearchUrl', () => {
  it('con coordenadas, centra el mapa ahí', () => {
    expect(buildNearbySearchUrl('restaurante', { latitude: 40.1, longitude: -3.2 })).toBe(
      'https://www.google.com/maps/search/restaurante/@40.1,-3.2,15z',
    )
  })
  it('sin coordenadas, busca solo por texto', () => {
    expect(buildNearbySearchUrl('restaurante', null)).toBe('https://www.google.com/maps/search/?api=1&query=restaurante')
  })
})

describe('isUnsupportedDelete', () => {
  it('borrar/quitar una cita o evento se detecta (bug real: se creaba "Borra la cita del" como cita)', () => {
    expect(isUnsupportedDelete('Borra la cita del 9 de septiembre')).toBe(true)
    expect(isUnsupportedDelete('quita el evento de mañana')).toBe(true)
    expect(isUnsupportedDelete('Eliminar la cita del dentista')).toBe(true)
  })
  it('apuntar algo nuevo no es borrar', () => {
    expect(isUnsupportedDelete('apunta cita dentista el 25 de septiembre')).toBe(false)
    expect(isUnsupportedDelete('borra leche de la lista')).toBe(false)
  })
})
