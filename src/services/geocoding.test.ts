import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Bug real reportado: "me he quedado sin límites otra vez, no puede ser" — searchAndResolveFirst
// (lo que usa Pepa por voz) hacía DOS llamadas a Google por cada pregunta sobre un sitio no guardado
// (buscar el nombre + confirmar sus coordenadas), y cada una gastaba un uso del freno diario por su
// cuenta — una sola pregunta real gastaba el doble de lo que parecía desde fuera.
vi.mock('@/services/googleMapsProxy', () => ({ callGoogleMaps: vi.fn() }))

import { callGoogleMaps } from '@/services/googleMapsProxy'
import { GoogleMapsDailyLimitError } from '@/services/googleMapsUsageGuard'
import { searchAndResolveFirst } from './geocoding'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
  vi.mocked(callGoogleMaps).mockReset()
})

afterEach(() => vi.unstubAllGlobals())

describe('searchAndResolveFirst', () => {
  it('busca el nombre y confirma sus coordenadas con UNA sola llamada contada en el freno, no dos', async () => {
    vi.mocked(callGoogleMaps)
      .mockResolvedValueOnce({ suggestions: [{ label: 'Rafal, Alicante', placeId: 'p1' }] }) // autocomplete
      .mockResolvedValueOnce({ place: { label: 'Rafal, Alicante', latitude: 38.19, longitude: -0.81 } }) // details

    const result = await searchAndResolveFirst('Rafal')

    expect(callGoogleMaps).toHaveBeenCalledTimes(2) // las dos llamadas a Google siguen pasando...
    expect(result).toEqual({ label: 'Rafal, Alicante', latitude: 38.19, longitude: -0.81 })
    // ...pero el freno diario solo se ha movido UNA vez por la pregunta entera.
    expect(localStorage.getItem('pepa-google-maps-guard-search')).toContain('"count":1')
  })

  it('sin resultados, no llama a los detalles ni gasta un segundo uso', async () => {
    vi.mocked(callGoogleMaps).mockResolvedValueOnce({ suggestions: [] })
    const result = await searchAndResolveFirst('un sitio inventado')
    expect(result).toBeNull()
    expect(callGoogleMaps).toHaveBeenCalledTimes(1)
  })

  it('con el freno diario ya agotado, ni siquiera llama a Google', async () => {
    localStorage.setItem('pepa-google-maps-guard-search', JSON.stringify({ day: new Date().toISOString().slice(0, 10), count: 500 }))
    await expect(searchAndResolveFirst('Rafal')).rejects.toThrow(GoogleMapsDailyLimitError)
    expect(callGoogleMaps).not.toHaveBeenCalled()
  })

  it('una cadena vacía no gasta nada', async () => {
    expect(await searchAndResolveFirst('   ')).toBeNull()
    expect(callGoogleMaps).not.toHaveBeenCalled()
  })
})
