// El mapa dibuja el tráfico en VERDE (TrafficLayer): una ruta del mismo verde se confunde con la carretera (queja real: «han marcado la ruta del
// mismo color que la carretera, tienes que marcarlo de un color que se diferencie»). Si el color de la persona cae en la gama de los verdes se usa
// otro color vistoso que no se parece a nada del mapa (se elige por persona, para que dos personas verdes no sean iguales entre sí). Además la
// línea lleva un borde blanco por debajo, que la separa de cualquier fondo.
const ROUTE_COLORS_FOR_GREENS = ['#7c3aed', '#db2777', '#2563eb', '#ea580c']
export function routeColorFor(color: string, memberId: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim())
  if (!m) return color
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta < 0.12) return color // casi gris: no es un verde
  let hue: number
  if (max === g) hue = 60 * ((b - r) / delta + 2)
  else if (max === r) hue = 60 * (((g - b) / delta) % 6)
  else hue = 60 * ((r - g) / delta + 4)
  if (hue < 0) hue += 360
  if (hue < 70 || hue > 175) return color
  let hash = 0
  for (const ch of memberId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return ROUTE_COLORS_FOR_GREENS[hash % ROUTE_COLORS_FOR_GREENS.length]
}
