// Cuán reciente es la última posición de alguien. La web instalada solo manda posición mientras la app está abierta
// en primer plano; con el móvil en el bolsillo no llega nada. Antes la pantalla decía «Compartiendo ubicación» aunque
// la última posición tuviera horas, y el punto del mapa parecía en vivo. Ahora se dice la verdad.

export const STALE_POSITION_MS = 10 * 60_000

export interface PositionFreshness {
  stale: boolean
  ageLabel: string
}

export function describePositionAge(recordedAt: string, nowMs: number): PositionFreshness {
  const ageMs = Math.max(0, nowMs - new Date(recordedAt).getTime())
  const minutes = Math.floor(ageMs / 60_000)
  const stale = ageMs >= STALE_POSITION_MS
  if (minutes < 1) return { stale, ageLabel: 'ahora mismo' }
  if (minutes < 60) return { stale, ageLabel: `hace ${minutes} min` }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return { stale, ageLabel: rest === 0 ? `hace ${hours} h` : `hace ${hours} h ${rest} min` }
  const days = Math.floor(hours / 24)
  return { stale, ageLabel: `hace ${days} ${days === 1 ? 'día' : 'días'}` }
}
