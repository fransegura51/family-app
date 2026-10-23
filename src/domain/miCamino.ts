// «Mi Camino» (Pequeños Grandes → Puntos y recompensas, modo Camino) — lógica pura y testeable del
// recorrido circular aprobado en el prototipo V32: tres mundos de 150 puntos cada uno, un circuito de
// 450 puntos que vuelve a empezar SIN reiniciar ni gastar nada. El dibujo (canvas, animaciones) vive
// en ui/miCaminoEngine.js y ui/MiCamino.tsx; aquí no hay nada que dependa del DOM.
//
// La entrada es siempre el total de puntos GANADOS alguna vez (memberLifetimePoints, domain/rewards.ts):
// canjear una recompensa nunca hace retroceder el recorrido, y este módulo no crea ningún saldo nuevo.

export const MI_CAMINO_WORLD_POINTS = 150
export const MI_CAMINO_WORLD_COUNT = 3
export const MI_CAMINO_LAP_POINTS = MI_CAMINO_WORLD_POINTS * MI_CAMINO_WORLD_COUNT

export type MiCaminoWorld = 0 | 1 | 2

export interface MiCaminoPosition {
  /** Puntos ganados en total (entero, nunca negativo). */
  total: number
  /** 0 = Pueblo de las Golosinas, 1 = Reino Submarino, 2 = Planeta Espacial. */
  world: MiCaminoWorld
  /** Vuelta al circuito, empezando en 1 (a partir de 450 puntos vale 2). */
  lap: number
  /** Puntos dentro del mundo actual, 0-149. */
  pointsInWorld: number
  /** Puntos dentro de la vuelta actual, 0-449. */
  pointsInLap: number
  /** Puntos que faltan para entrar en el siguiente mundo (1-150). */
  pointsToNextWorld: number
  /** Primer punto de la vuelta actual (0, 450, 900…): las etiquetas del camino se suman a este valor. */
  lapBase: number
}

export const MI_CAMINO_WORLD_TITLES: readonly string[] = [
  '🍭 Mundo 1 · Pueblo de las Golosinas',
  '🫧 Mundo 2 · Reino submarino',
  '🚀 Mundo 3 · Planeta Espacial',
]

export const MI_CAMINO_WORLD_TAGS: readonly string[] = [
  'Golosinas · 0–149 · ciclo de 450',
  'Submarino · 150–299',
  'Espacio · 300–449 · regreso a Golosinas',
]

function sanitizeTotal(totalPoints: number): number {
  if (!Number.isFinite(totalPoints)) return 0
  return Math.max(0, Math.floor(totalPoints))
}

export function miCaminoPosition(totalPoints: number): MiCaminoPosition {
  const total = sanitizeTotal(totalPoints)
  const pointsInWorld = total % MI_CAMINO_WORLD_POINTS
  return {
    total,
    world: (Math.floor(total / MI_CAMINO_WORLD_POINTS) % MI_CAMINO_WORLD_COUNT) as MiCaminoWorld,
    lap: Math.floor(total / MI_CAMINO_LAP_POINTS) + 1,
    pointsInWorld,
    pointsInLap: total % MI_CAMINO_LAP_POINTS,
    pointsToNextWorld: MI_CAMINO_WORLD_POINTS - pointsInWorld,
    lapBase: Math.floor(total / MI_CAMINO_LAP_POINTS) * MI_CAMINO_LAP_POINTS,
  }
}

// Dos niños comparten escena (mismo paisaje y mismo trozo de camino) SOLO si están en el mismo mundo Y
// en la misma vuelta: un niño en la vuelta 2 de Golosinas no aparece en el paisaje de otro que sigue en
// la vuelta 1, aunque el tipo de mundo coincida.
export function miCaminoShareScene(totalA: number, totalB: number): boolean {
  const a = miCaminoPosition(totalA)
  const b = miCaminoPosition(totalB)
  return a.world === b.world && a.lap === b.lap
}

// Texto del progreso de cada niño: «85 puntos para el siguiente mundo · vuelta 1».
export function miCaminoProgressText(totalPoints: number): string {
  const p = miCaminoPosition(totalPoints)
  return `${p.pointsToNextWorld} ${p.pointsToNextWorld === 1 ? 'punto' : 'puntos'} para el siguiente mundo · vuelta ${p.lap}`
}

export interface MiCaminoFigureSlot {
  /** Desplazamiento horizontal en el lienzo (px de la escena de 720×470). */
  dx: number
  /** Desplazamiento vertical (px): quien va más abajo se dibuja delante. */
  dy: number
  /** true si comparte posición con otro niño (el dibujo usa entonces la altura de «empate»). */
  tied: boolean
}

// Cuando varios niños están (casi) en el mismo punto no se dibujan uno encima de otro: se escalonan.
// Con dos niños es exactamente el desplazamiento aprobado del prototipo (−49/−24 y +49/+24). Con más,
// el mismo criterio repartido en abanico. `positions` son las posiciones mostradas (puntos) de los
// niños que se dibujan en la escena; devuelve un hueco por niño, en el mismo orden.
export function miCaminoFigureSlots(positions: number[], tolerance = 2): MiCaminoFigureSlot[] {
  const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b] || a - b)
  const clusters: number[][] = []
  for (const idx of order) {
    const current = clusters[clusters.length - 1]
    if (current && positions[idx] - positions[current[current.length - 1]] < tolerance) current.push(idx)
    else clusters.push([idx])
  }
  const slots: MiCaminoFigureSlot[] = positions.map(() => ({ dx: 0, dy: 0, tied: false }))
  for (const cluster of clusters) {
    const m = cluster.length
    if (m === 1) continue
    // Se mantiene el orden original de los niños dentro del grupo (el primero a la izquierda/arriba).
    const members = [...cluster].sort((a, b) => a - b)
    const stepX = m === 2 ? 98 : Math.min(70, 190 / (m - 1))
    const stepY = m === 2 ? 48 : 20
    members.forEach((idx, s) => {
      const centered = s - (m - 1) / 2
      slots[idx] = { dx: centered * stepX, dy: centered * stepY, tied: true }
    })
  }
  return slots
}
