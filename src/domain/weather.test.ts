import { describe, expect, it } from 'vitest'
import { formatWeatherReport, weatherDescription, type WeatherReport } from './weather'

describe('weatherDescription', () => {
  it('traduce los códigos WMO conocidos', () => {
    expect(weatherDescription(0)).toBe('despejado')
    expect(weatherDescription(2)).toBe('parcialmente nublado')
    expect(weatherDescription(61)).toBe('con lluvia floja')
    expect(weatherDescription(95)).toBe('con tormenta')
  })

  it('un código desconocido no rompe nada', () => {
    expect(weatherDescription(12345)).toBe('sin datos claros del cielo')
  })
})

describe('formatWeatherReport (petición real: "el tiempo que hace en un sitio en concreto y la previsión")', () => {
  it('dice el tiempo de ahora y la previsión de los próximos días', () => {
    const report: WeatherReport = {
      now: { temperatureC: 21.4, code: 0 },
      forecast: [
        { date: '2026-10-01', maxC: 26.4, minC: 16.8, code: 0, rainChance: 13 },
        { date: '2026-10-02', maxC: 24.1, minC: 16.4, code: 95, rainChance: 70 },
        { date: '2026-10-03', maxC: 21.9, minC: 17.0, code: 61, rainChance: 58 },
      ],
    }
    const text = formatWeatherReport('Madrid', report)
    expect(text).toBe(
      'En Madrid ahora mismo hay 21°, despejado. Previsión: mañana 24°/16°, con un 70% de posibilidades de lluvia; pasado mañana 22°/17°, con un 58% de posibilidades de lluvia.',
    )
  })

  it('con poca probabilidad de lluvia (menos del 40%), no la menciona', () => {
    const report: WeatherReport = {
      now: { temperatureC: 18, code: 2 },
      forecast: [
        { date: '2026-10-01', maxC: 20, minC: 10, code: 2, rainChance: 5 },
        { date: '2026-10-02', maxC: 19, minC: 9, code: 1, rainChance: 20 },
      ],
    }
    const text = formatWeatherReport('Casa', report)
    expect(text).toBe('En Casa ahora mismo hay 18°, parcialmente nublado. Previsión: mañana 19°/9°.')
  })

  it('sin previsión de más días, solo dice el tiempo de ahora', () => {
    const report: WeatherReport = { now: { temperatureC: 15, code: 3 }, forecast: [{ date: '2026-10-01', maxC: 16, minC: 12, code: 3, rainChance: 10 }] }
    expect(formatWeatherReport('Bilbao', report)).toBe('En Bilbao ahora mismo hay 15°, nublado.')
  })
})
