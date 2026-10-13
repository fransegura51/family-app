// Carrera animada V6 (Pequeños Grandes → Puntos y recompensas) — lógica pura y testeable: en qué
// posición de la pista cae cada recompensa configurada, y qué tramo de la pista (cámara) hace falta
// ver para que todos los corredores quepan sin salirse de cuadro, sea cual sea su diferencia de
// puntos. El dibujo en sí (canvas, sprites, fauna) vive en ui/RaceTrack.tsx — aquí no hay nada que
// dependa del DOM ni de canvas, así se puede probar sin renderizar nada.
import type { Reward } from './types'

export interface RaceMilestoneMarker {
  position: number
  emoji: string
  title: string
}

// Solo las recompensas ACTIVAS y con emoji configurado se pintan en la pista — sin emoji no hay
// nada que dibujar, y una desactivada (o borrada del catálogo) deja de aparecer, igual que ya deja
// de poder canjearse. La posición en la pista es su propio coste en puntos (pointsCost): es el único
// dato real de "a partir de cuántos puntos" tiene sentido una recompensa en este modelo (no existe un
// campo de hito fijo aparte, el catálogo es de coste, no de umbrales).
export function raceMilestones(rewards: Reward[]): RaceMilestoneMarker[] {
  return rewards
    .filter((r) => r.active && r.emoji && r.pointsCost > 0)
    .map((r) => ({ position: r.pointsCost, emoji: r.emoji as string, title: r.title }))
    .sort((a, b) => a.position - b.position)
}

export interface RaceCameraRange {
  min: number
  max: number
}

// Mismo criterio que la demo V6 (cameraUpdate), generalizado de 2 a cualquier número de corredores:
// el tramo visible crece con la diferencia entre el que menos y el que más puntos lleva, nunca por
// debajo de minSpan (para que con 0-2 puntos la pista no se vea ridículamente corta), y se redondea
// a múltiplos de 5 para que las marcas de distancia caigan en números limpios.
export function raceCameraRange(points: number[], minSpan = 30): RaceCameraRange {
  if (points.length === 0) return { min: 0, max: minSpan }
  const lo = Math.min(0, ...points)
  const hi = Math.max(...points)
  let span = Math.max(minSpan, (hi - lo) * 1.36 + 12)
  span = Math.ceil(span / 5) * 5
  let min = Math.max(0, Math.min(lo - 5, hi - span * 0.72))
  if (lo === 0) min = 0
  let max = min + span
  if (max < hi + Math.max(5, span * 0.12)) {
    max = hi + Math.max(5, span * 0.12)
    min = Math.max(0, max - span)
  }
  return { min, max }
}

// Cada marca de distancia de la pista (25/10/5 en 5 según lo ancho que esté el tramo visible) —
// mismo criterio que la demo V6, generalizado a un rango de cámara cualquiera.
export function raceDistanceStep(camera: RaceCameraRange): number {
  const span = camera.max - camera.min
  return span > 110 ? 25 : span > 65 ? 10 : 5
}
