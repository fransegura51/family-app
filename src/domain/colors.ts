// Petición real: "las tarjetas de color pastel que sean de los colores
// del arcoíris (pastel) y que no se repita ninguno. Esa misma idea de
// colores pasteles la aplicaremos a la página de inicio de la App" —
// mismo criterio que ya usa distinctPaletteEntries (domain/finance.ts,
// dónuts) de repartir tonos por el círculo de color sin que se agoten
// ni se repitan (ángulo dorado 137.508°, el mismo que usan los
// girasoles para que sus semillas no se solapen nunca exactamente),
// pero aquí con la luminosidad/saturación de un fondo de tarjeta
// pastel (muy clara) en vez de los tonos vivos de un gráfico.
const GOLDEN_ANGLE = 137.508

// Petición real (Inicio): hoy varias tarjetas comparten color por
// casualidad (dos verdes iguales, dos azules iguales) porque cada una
// llevaba un hex elegido a mano por separado. Un solo color POR
// ÍNDICE, repartido por ángulo dorado, nunca coincide dos veces por
// mucho que crezca la lista.
export function pastelPalette(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const hue = Math.round((i * GOLDEN_ANGLE) % 360)
    return `hsl(${hue}, 70%, 90%)`
  })
}

// Petición real: extender el pastel a Calendario/Economía, donde el
// color de partida no sale de pastelPalette() sino que ya existe (el
// color que cada miembro elige a mano, m.color) — conserva su tono
// pero fuerza saturación/luminosidad a un pastel, en vez de generar
// uno nuevo sin relación con "su" color.
export function toPastel(hex: string): string {
  const { h } = hexToHsl(hex)
  return `hsl(${h}, 65%, 88%)`
}

// Igual que toPastel, pero a partir de un color que ya viene como
// "hsl(...)" (p. ej. categoryColors() en finance.ts, pensado para
// gráficas — tonos vivos, no pastel) en vez de un hex: conserva el
// tono para que la categoría se reconozca igual entre el dónut y el
// fondo pastel de su tarjeta, sin inventar una asignación de color
// distinta para cada sitio.
export function pastelFromHsl(hsl: string): string {
  const match = /hsl\((\d+(?:\.\d+)?)/.exec(hsl)
  const h = match ? Number(match[1]) : 0
  return `hsl(${h}, 65%, 88%)`
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6)
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60
      break
    case g:
      h = ((b - r) / d + 2) * 60
      break
    default:
      h = ((r - g) / d + 4) * 60
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

// Petición real: clases de producto, tiendas y etiquetas de receta no
// tienen un color guardado en la base de datos, y cada familia puede
// crear/renombrar las suyas — en vez de una migración nueva y una
// pantalla para fijarlo a mano, mismo nombre da SIEMPRE el mismo
// color: se ordena la lista alfabéticamente (estable aunque cambie el
// orden de creación) y se reparte pastelPalette() por índice. Calcular
// esto UNA vez por pantalla (no por fila) y consultar el mapa.
export function paletteByName(names: Iterable<string>): Map<string, string> {
  const sorted = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'es'))
  const palette = pastelPalette(sorted.length)
  return new Map(sorted.map((name, i) => [name, palette[i]]))
}
