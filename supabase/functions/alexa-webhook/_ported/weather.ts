// Copia verbatim de src/domain/weather.ts — pura, sin cambios (Deno no puede importar del
// frontend). Mantener a mano si se toca el original.

export interface WeatherNow {
  temperatureC: number
  code: number
}

export interface WeatherDay {
  date: string
  maxC: number
  minC: number
  code: number
  rainChance: number
}

export interface WeatherReport {
  now: WeatherNow
  forecast: WeatherDay[]
}

const DESCRIPTIONS: Record<number, string> = {
  0: 'despejado',
  1: 'mayormente despejado',
  2: 'parcialmente nublado',
  3: 'nublado',
  45: 'con niebla',
  48: 'con niebla escarchada',
  51: 'con llovizna floja',
  53: 'con llovizna',
  55: 'con llovizna fuerte',
  56: 'con llovizna helada',
  57: 'con llovizna helada fuerte',
  61: 'con lluvia floja',
  63: 'con lluvia',
  65: 'con lluvia fuerte',
  66: 'con lluvia helada',
  67: 'con lluvia helada fuerte',
  71: 'con nieve floja',
  73: 'con nieve',
  75: 'con nieve fuerte',
  77: 'con cellisca',
  80: 'con chubascos flojos',
  81: 'con chubascos',
  82: 'con chubascos fuertes',
  85: 'con chubascos de nieve flojos',
  86: 'con chubascos de nieve fuertes',
  95: 'con tormenta',
  96: 'con tormenta y granizo',
  99: 'con tormenta y granizo fuerte',
}

export function weatherDescription(code: number): string {
  return DESCRIPTIONS[code] ?? 'sin datos claros del cielo'
}

const DAY_LABELS = ['mañana', 'pasado mañana', 'en tres días', 'en cuatro días', 'en cinco días']

export function formatWeatherReport(label: string, report: WeatherReport): string {
  const now = `En ${label} ahora mismo hay ${Math.round(report.now.temperatureC)}°, ${weatherDescription(report.now.code)}.`
  const upcoming = report.forecast.slice(1)
  if (upcoming.length === 0) return now
  const parts = upcoming.map((day, i) => {
    const when = DAY_LABELS[i] ?? day.date
    const rain = day.rainChance >= 40 ? `, con un ${day.rainChance}% de posibilidades de lluvia` : ''
    return `${when} ${Math.round(day.maxC)}°/${Math.round(day.minC)}°${rain}`
  })
  return `${now} Previsión: ${parts.join('; ')}.`
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
    const data = await res.json()
    if (!data.current || !data.daily) return null
    const forecast: WeatherDay[] = data.daily.time.map((date: string, i: number) => ({
      date,
      maxC: data.daily.temperature_2m_max[i],
      minC: data.daily.temperature_2m_min[i],
      code: data.daily.weather_code[i],
      rainChance: data.daily.precipitation_probability_max[i],
    }))
    return { now: { temperatureC: data.current.temperature_2m, code: data.current.weather_code }, forecast }
  } catch {
    return null
  }
}

// Petición real (weather en Rafal, 01/10/2026) — reconoce "qué tiempo hace en X" y variantes, en
// cualquier parte de la frase (sin "^" delante). Copia funcional de WEATHER_RE
// (src/domain/locationRoute.ts): misma regla, "para" quitado de los conectores (ambiguo en
// español: "tiempo PARA X" no siempre es del tiempo).
const WEATHER_RE =
  /(?:que tiempo\s+(?:hace|va a hacer|hara|tenemos|tendremos)|que tal\s+(?:esta\s+)?el tiempo|como\s+(?:esta|va(?:\s+a estar)?)\s+el tiempo|dime(?:\s+(?:que tiempo hace|el tiempo))?|prevision(?:\s+(?:del tiempo|meteorologica))?|el tiempo)[\s\S]*?\s(?:en|de)\s+(.+)$/

export function matchWeatherPlace(normalizedText: string): string | null {
  const match = WEATHER_RE.exec(normalizedText)
  return match ? match[1].trim() : null
}
