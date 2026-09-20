import { getColorTheme, type ColorTheme } from '@/state/colorTheme'

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

// Petición real: elegir entre pastel y colores vivos para TODA la app.
// Cada color de la app sale de aquí: tono (hue) + la saturación y
// luminosidad de un pastel; en el estilo "vivo" se conserva el tono pero
// la luminosidad baja 20 puntos y la saturación sube a un mínimo del 80 %
// (nunca por debajo del 58 % de luminosidad, para que el texto oscuro se
// siga leyendo encima de cualquier tono).
export function toneFor(theme: ColorTheme, h: number, s = 70, l = 90): string {
  if (theme === 'vivo') return `hsl(${h}, ${Math.max(s, 80)}%, ${Math.max(58, l - 20)}%)`
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function tone(h: number, s = 70, l = 90): string {
  return toneFor(getColorTheme(), h, s, l)
}

// Petición real (Inicio): hoy varias tarjetas comparten color por
// casualidad (dos verdes iguales, dos azules iguales) porque cada una
// llevaba un hex elegido a mano por separado. Un solo color POR
// ÍNDICE, repartido por ángulo dorado, nunca coincide dos veces por
// mucho que crezca la lista.
export function pastelPalette(count: number, theme: ColorTheme = getColorTheme()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const hue = Math.round((i * GOLDEN_ANGLE) % 360)
    return toneFor(theme, hue)
  })
}

// Petición real: extender el pastel a Calendario/Economía, donde el
// color de partida no sale de pastelPalette() sino que ya existe (el
// color que cada miembro elige a mano, m.color) — conserva su tono
// pero fuerza saturación/luminosidad a un pastel, en vez de generar
// uno nuevo sin relación con "su" color.
export function toPastel(hex: string): string {
  const { h } = hexToHsl(hex)
  return tone(h, 65, 88)
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
  return tone(h, 65, 88)
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

// Petición real (Tickets): "¿por qué la mayoría de las tiendas no tienen
// color? Habría que definir algo para que a cualquier tienda nueva se
// le adjudique un color automáticamente" — paletteByName solo colorea
// los nombres que se le pasan, y una tienda que llega del banco o de un
// ticket sin haberla dado de alta (Amazon, Repsol...) quedaba fuera.
// Aquí el color sale del PROPIO nombre (hash → tono), sin depender de
// qué otras tiendas haya: cualquier tienda, nueva o no, tiene color al
// instante y es SIEMPRE el mismo en todas las pantallas. Se normaliza
// (minúsculas, sin acentos ni espacios de más) para que "MERCADONA" y
// "Mercadona" coincidan.
function nameKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function hashName(name: string): number {
  const key = nameKey(name)
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function colorForName(name: string): string {
  return tone(hashName(name) % 360)
}

// Petición real: "el color de Mercadona y Hiperber es tan similar que
// parece el mismo" — con colorForName (hash del nombre) dos tiendas
// pueden caer en tonos casi iguales por pura casualidad (Mercadona 223°
// y Hiperber 226°) y ningún hash lo evita del todo. Las tiendas DADAS
// DE ALTA se reparten por orden de alta con el ángulo dorado
// (pastelPalette), así que son distintas entre sí por construcción, y
// añadir una tienda nueva nunca cambia el color de las anteriores. Las
// que llegan sueltas del banco o de un ticket (sin dar de alta) siguen
// teniendo color automático por su nombre.
//
// Petición real: "son 8 tiendas las que se parecen de color" — las
// tiendas sueltas (banco/tickets) esquivaban los tonos de las dadas de
// alta, pero todas acababan en el mismo hueco libre (azul/lila). Ahora
// `otherNames` (las tiendas sueltas que salen en esa pantalla) se
// reparten entre sí Y frente a las dadas de alta: cada una coge el tono
// más alejado de todos los ya usados, alternando dos luminosidades para
// separar aún más las vecinas. El orden no depende de cómo lleguen los
// nombres (se ordenan por su hash), solo de qué tiendas hay.
export function storeColorResolver(
  registered: { name: string; createdAt: string }[],
  otherNames: Iterable<string> = [],
): (name: string) => string {
  const ordered = [...registered].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const palette = pastelPalette(ordered.length)
  const byKey = new Map(ordered.map((s, i) => [nameKey(s.name), palette[i]]))
  const taken = palette.map((c) => Number(/hsl\((\d+)/.exec(c)![1]))
  const circ = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

  const extras = [...new Set([...otherNames].map(nameKey))]
    .filter((k) => k && !byKey.has(k))
    .sort((a, b) => hashName(a) - hashName(b))
  const assigned = new Map<string, string>()
  extras.forEach((key, i) => {
    const preferred = hashName(key) % 360
    let bestHue = preferred
    let bestScore = -Infinity
    for (let h = 0; h < 360; h += 3) {
      const gap = taken.length ? Math.min(...taken.map((t) => circ(t, h))) : 360
      const score = gap - circ(h, preferred) * 0.001
      if (score > bestScore) {
        bestScore = score
        bestHue = h
      }
    }
    taken.push(bestHue)
    assigned.set(key, tone(bestHue, 70, i % 2 === 0 ? 90 : 84))
  })

  return (name) => {
    const key = nameKey(name)
    return byKey.get(key) ?? assigned.get(key) ?? colorForName(name)
  }
}

// Petición real: los colores de las clases de producto (Carne, Lácteos,
// Postres...) tienen que ser SIEMPRE los mismos en todas las pantallas
// (Lista, Historial, Estadísticas), igual que las tiendas, y también
// pastel — pero hay muchas más clases que tiendas y con solo el tono se
// parecerían entre sí, así que además del tono el propio nombre elige
// uno de tres matices (90/85/80 % de luminosidad): mismo estilo pastel,
// con el matiz más fuerte cuando se acaban los tonos bien separados.
export function colorForClass(name: string): string {
  const hash = hashName(name)
  const tier = (hash >>> 12) % 3
  const lightness = [90, 85, 80][tier]
  const saturation = [70, 74, 78][tier]
  return tone(hash % 360, saturation, lightness)
}

// Petición real: "las etiquetas generadas automáticamente que tengan
// colores diferentes, no todos iguales" — las etiquetas que crea un
// evento salían todas con el mismo azul. Un tono por número de orden
// (ángulo dorado, como pastelPalette) en hex, porque la columna
// tags.color guarda hex y la etiqueta se ve viva (punto) o pastel
// (fondo) según dónde.
export function distinctTagColor(index: number): string {
  const h = (index * GOLDEN_ANGLE) % 360
  const s = 0.72
  const l = 0.55
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const hex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

// Petición real: etiquetas de receta no tienen un color guardado en la
// base de datos, y cada familia puede crear/renombrar las suyas — en
// vez de una migración nueva y una pantalla para fijarlo a mano, mismo
// nombre da SIEMPRE el mismo color dentro de la lista que se le pasa:
// se ordena alfabéticamente y se reparte pastelPalette() por índice.
// Calcular esto UNA vez por pantalla (no por fila) y consultar el mapa.
// (Tiendas y clases de producto usan colorForName/colorForClass, que
// no dependen de qué otros nombres haya.)
export function paletteByName(names: Iterable<string>): Map<string, string> {
  const sorted = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'es'))
  const palette = pastelPalette(sorted.length)
  return new Map(sorted.map((name, i) => [name, palette[i]]))
}
