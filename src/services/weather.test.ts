import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWeather } from './weather'

afterEach(() => vi.unstubAllGlobals())

const OPEN_METEO_RESPONSE = {
  current: { temperature_2m: 20.7, weather_code: 3 },
  daily: {
    time: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
    weather_code: [3, 95, 95, 95],
    temperature_2m_max: [26.4, 24.1, 21.9, 22.3],
    temperature_2m_min: [16.8, 16.4, 17.0, 17.0],
    precipitation_probability_max: [13, 70, 58, 58],
  },
}

describe('getWeather (Open-Meteo, petición real: "el tiempo que hace en un sitio en concreto y la previsión")', () => {
  it('convierte la respuesta de Open-Meteo al formato interno', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(OPEN_METEO_RESPONSE))))
    const report = await getWeather(40.4168, -3.7038)
    expect(report).toEqual({
      now: { temperatureC: 20.7, code: 3 },
      forecast: [
        { date: '2026-10-01', maxC: 26.4, minC: 16.8, code: 3, rainChance: 13 },
        { date: '2026-10-02', maxC: 24.1, minC: 16.4, code: 95, rainChance: 70 },
        { date: '2026-10-03', maxC: 21.9, minC: 17.0, code: 95, rainChance: 58 },
        { date: '2026-10-04', maxC: 22.3, minC: 17.0, code: 95, rainChance: 58 },
      ],
    })
  })

  it('pide las coordenadas correctas, sin ninguna clave (API gratis)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(OPEN_METEO_RESPONSE)))
    vi.stubGlobal('fetch', fetchMock)
    await getWeather(40.4168, -3.7038)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('latitude=40.4168')
    expect(url).toContain('longitude=-3.7038')
    expect(url).not.toContain('key=')
  })

  it('si Open-Meteo falla, no rompe — devuelve null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })))
    expect(await getWeather(40.4168, -3.7038)).toBeNull()
  })

  it('sin red, tampoco rompe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    )
    expect(await getWeather(40.4168, -3.7038)).toBeNull()
  })
})
