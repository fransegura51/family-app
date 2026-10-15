// Lógica pura del atrapa-foco de un diálogo modal (panel de avisos de la campana, INC-20). Sin DOM: se prueba con números.

// Elementos que reciben foco con el teclado dentro del diálogo (el tabindex -1 solo se enfoca por código, no con Tab).
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A qué elemento hay que llevar el foco a mano cuando se pulsa Tab o Mayús+Tab, o null si el navegador puede seguir su camino normal.
//  · count: cuántos elementos enfocables hay dentro del diálogo.
//  · currentIndex: posición del que tiene el foco ahora (-1 si el foco está en el propio diálogo o fuera de la lista).
//  · backwards: true con Mayús+Tab.
// Devuelve la posición a enfocar (0 = primero, count - 1 = último) o -1 si no hay nada enfocable (el foco se queda en el propio diálogo).
export function trapFocusTarget(count: number, currentIndex: number, backwards: boolean): number | null {
  if (count <= 0) return -1
  // Foco fuera de la lista (el diálogo mismo, o algo ajeno): se entra por el primero (Tab) o por el último (Mayús+Tab).
  if (currentIndex < 0 || currentIndex >= count) return backwards ? count - 1 : 0
  if (backwards && currentIndex === 0) return count - 1
  if (!backwards && currentIndex === count - 1) return 0
  return null
}

// Texto que se anuncia al lector de pantalla con el número de avisos sin leer (región «polite», discreta).
export function unreadAnnouncement(count: number): string {
  if (count <= 0) return 'No tienes avisos sin leer.'
  return count === 1 ? 'Tienes 1 aviso sin leer.' : `Tienes ${count} avisos sin leer.`
}
