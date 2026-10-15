// Comunidad PEPA — regla pura del tabulador dentro de una ventana emergente (sin pantalla, para poder probarla): ¿hay que corregir el foco?
//   count  = cuántos controles con foco tiene la ventana,
//   index  = posición del control que tiene el foco ahora (−1 si el foco no está en ninguno de ellos, p. ej. en la propia ventana),
//   shift  = true si se pulsó Mayús+Tab (hacia atrás).
// Devuelve a qué control hay que llevar el foco, o null si el navegador ya lo hará bien por sí solo (en medio de la lista).
export function nextTrapIndex(count: number, index: number, shift: boolean): number | null {
  if (count <= 0) return 0 // sin controles: el foco se queda en la propia ventana (el llamador lo gestiona)
  if (index < 0) return shift ? count - 1 : 0 // foco fuera de la lista (la ventana misma o algo de detrás): se mete dentro
  if (shift && index === 0) return count - 1 // retroceder desde el primero → al último
  if (!shift && index === count - 1) return 0 // avanzar desde el último → al primero
  return null
}
