// Tiempo y previsión en un sitio concreto — petición real: "quiero que el asistente de Pepa me
// diga también el tiempo que hace en un sitio en concreto y la previsión". Open-Meteo (no Google):
// gratis de verdad, sin clave ni cuenta que crear (a diferencia de Google Maps, nada de pasos en la
// consola de Google) — ver services/weather.ts.

export interface WeatherNow {
  temperatureC: number
  code: number
}

export interface WeatherDay {
  date: string // YYYY-MM-DD
  maxC: number
  minC: number
  code: number
  rainChance: number // % de posibilidades de lluvia ese día
}

export interface WeatherReport {
  now: WeatherNow
  // El primer día es HOY (mismo que `now`, pero máxima/mínima en vez de la temperatura actual) —
  // los siguientes son la previsión de verdad.
  forecast: WeatherDay[]
}

// Códigos WMO (los que usa Open-Meteo) traducidos a una palabra sencilla en español — lista
// completa en https://open-meteo.com/en/docs, tabla "WMO Weather interpretation codes".
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

// Petición real: "el tiempo que hace en un sitio en concreto y la previsión" — primero el tiempo
// AHORA MISMO, luego dos o tres días de previsión (sin repetir hoy, que ya ha salido). Solo avisa
// de lluvia si hay de verdad posibilidades (40% o más) — decirlo siempre sería ruido.
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
