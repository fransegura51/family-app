// Color de la línea de la ruta de cada persona en el mapa: SU color (el mismo del marcador). Excepción: el mapa dibuja el tráfico en VERDE
// (TrafficLayer) y una ruta de verde claro se confundiría con la carretera (queja real: «han marcado la ruta del mismo color que la carretera»).
// Petición real (13/10/2026): «cada usuario con su color; si es verde claro, ponlo en un verde más oscuro». Así que un verde se OSCURECE (sigue siendo
// verde, el de esa persona, solo que más oscuro) en vez de cambiarse por otro color. Además la línea lleva un borde blanco por debajo (ver
// LocationMap.tsx), que la separa de cualquier fondo.
const GREEN_HUE_MIN = 70
const GREEN_HUE_MAX = 175
// Luminosidad y saturación del verde oscuro: lo bastante oscuro para no parecerse al verde del tráfico, lo bastante vivo para verse en el mapa.
const DARK_GREEN_LIGHTNESS = 0.26
const DARK_GREEN_MIN_SATURATION = 0.7

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return null
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = 60 * (((g - b) / delta) % 6)
  else if (max === g) h = 60 * ((b - r) / delta + 2)
  else h = 60 * ((r - g) / delta + 4)
  if (h < 0) h += 360
  return { h, s, l }
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let rgb: [number, number, number]
  if (h < 60) rgb = [c, x, 0]
  else if (h < 120) rgb = [x, c, 0]
  else if (h < 180) rgb = [0, c, x]
  else if (h < 240) rgb = [0, x, c]
  else if (h < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return `#${rgb.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

// `memberId` ya no hace falta (antes repartía otros colores entre personas verdes); se conserva para no tocar a quien lo llama.
export function routeColorFor(color: string, _memberId?: string): string {
  const hsl = hexToHsl(color)
  if (!hsl) return color
  if (hsl.s < 0.12) return color // casi gris: no es un verde
  if (hsl.h < GREEN_HUE_MIN || hsl.h > GREEN_HUE_MAX) return color
  return hslToHex(hsl.h, Math.max(hsl.s, DARK_GREEN_MIN_SATURATION), DARK_GREEN_LIGHTNESS)
}
