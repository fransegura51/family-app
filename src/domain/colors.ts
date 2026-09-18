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
