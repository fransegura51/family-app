// Corrección "fotografías integradas como cabezas" — dónde cae la cabeza de cada uno de los 24
// fotogramas de cada diseño de corredor (raceSpriteData.ts), calculado UNA vez analizando los
// píxeles reales de cada PNG (primera fila opaca hacia abajo hasta el estrechamiento del cuello,
// centro de masa horizontal de esa región) — nunca un punto fijo a ojo. cx/cy/r están en fracción
// (0-1) del propio ancho/alto del sprite, para poder convertirse a coordenadas de pantalla con la
// MISMA transformación (x, y, escala k) que ya coloca el cuerpo en RaceTrack.tsx — así la foto nunca
// se desincroniza del cuerpo durante la animación.
export interface RaceHeadAnchor {
  cx: number
  cy: number
  r: number
}

export const raceHeadAnchorsA: RaceHeadAnchor[] = [
  { cx: 0.5362, cy: 0.1633, r: 0.1992 },
  { cx: 0.5392, cy: 0.1583, r: 0.2034 },
  { cx: 0.5475, cy: 0.1583, r: 0.2119 },
  { cx: 0.5509, cy: 0.1608, r: 0.2161 },
  { cx: 0.5598, cy: 0.1608, r: 0.2246 },
  { cx: 0.5639, cy: 0.1608, r: 0.2288 },
  { cx: 0.5693, cy: 0.1608, r: 0.2331 },
  { cx: 0.575, cy: 0.1558, r: 0.2373 },
  { cx: 0.5781, cy: 0.1583, r: 0.2415 },
  { cx: 0.5851, cy: 0.1508, r: 0.2458 },
  { cx: 0.5851, cy: 0.1508, r: 0.2458 },
  { cx: 0.5836, cy: 0.1558, r: 0.2458 },
  { cx: 0.5863, cy: 0.1608, r: 0.25 },
  { cx: 0.5805, cy: 0.1608, r: 0.2458 },
  { cx: 0.5805, cy: 0.1608, r: 0.2458 },
  { cx: 0.5793, cy: 0.1608, r: 0.2458 },
  { cx: 0.5764, cy: 0.1608, r: 0.2415 },
  { cx: 0.5722, cy: 0.1608, r: 0.2373 },
  { cx: 0.5693, cy: 0.1608, r: 0.2331 },
  { cx: 0.5663, cy: 0.1558, r: 0.2288 },
  { cx: 0.5616, cy: 0.1558, r: 0.2246 },
  { cx: 0.5533, cy: 0.1558, r: 0.2161 },
  { cx: 0.5492, cy: 0.1558, r: 0.2119 },
  { cx: 0.5409, cy: 0.1583, r: 0.2034 },
]

export const raceHeadAnchorsB: RaceHeadAnchor[] = [
  { cx: 0.512, cy: 0.1799, r: 0.188 },
  { cx: 0.5132, cy: 0.1799, r: 0.188 },
  { cx: 0.5209, cy: 0.1772, r: 0.196 },
  { cx: 0.5248, cy: 0.1772, r: 0.2 },
  { cx: 0.5298, cy: 0.1772, r: 0.204 },
  { cx: 0.5379, cy: 0.1772, r: 0.212 },
  { cx: 0.5421, cy: 0.1746, r: 0.216 },
  { cx: 0.5421, cy: 0.1746, r: 0.216 },
  { cx: 0.5462, cy: 0.1746, r: 0.22 },
  { cx: 0.5462, cy: 0.1746, r: 0.22 },
  { cx: 0.5467, cy: 0.1746, r: 0.22 },
  { cx: 0.5454, cy: 0.1799, r: 0.22 },
  { cx: 0.5443, cy: 0.1799, r: 0.22 },
  { cx: 0.5443, cy: 0.1799, r: 0.22 },
  { cx: 0.5404, cy: 0.1799, r: 0.216 },
  { cx: 0.5364, cy: 0.1799, r: 0.212 },
  { cx: 0.5338, cy: 0.1772, r: 0.208 },
  { cx: 0.5299, cy: 0.1772, r: 0.204 },
  { cx: 0.5265, cy: 0.1746, r: 0.2 },
  { cx: 0.5227, cy: 0.1746, r: 0.196 },
  { cx: 0.5152, cy: 0.1772, r: 0.188 },
  { cx: 0.5115, cy: 0.1772, r: 0.188 },
  { cx: 0.5048, cy: 0.1799, r: 0.192 },
  { cx: 0.502, cy: 0.1825, r: 0.196 },
]
