// Tiempo y previsión — petición real: "quiero que el asistente de Pepa me diga también el tiempo
// que hace en un sitio en concreto y la previsión". Open-Meteo (open-meteo.com): API meteorológica
// gratis de verdad (sin clave, sin cuenta, sin tope de uso para esto) y pensada para llamarse
// directamente desde el navegador (CORS abierto, comprobado a mano) — a diferencia de Google Maps,
// no hace falta pasar por el servidor ni crear nada en ninguna consola.
import type { WeatherDay, WeatherReport } from '@/domain/weather'

interface OpenMeteoResponse {
  current?: { temperature_2m: number; weather_code: number }
  daily?: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
  }
}

export async function getWeather(latitude: number, longitude: number): Promise<WeatherReport | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=auto&forecast_days=4`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as OpenMeteoResponse
    if (!data.current || !data.daily) return null

    const forecast: WeatherDay[] = data.daily.time.map((date, i) => ({
      date,
      maxC: data.daily!.temperature_2m_max[i],
      minC: data.daily!.temperature_2m_min[i],
      code: data.daily!.weather_code[i],
      rainChance: data.daily!.precipitation_probability_max[i],
    }))

    return {
      now: { temperatureC: data.current.temperature_2m, code: data.current.weather_code },
      forecast,
    }
  } catch {
    return null
  }
}
