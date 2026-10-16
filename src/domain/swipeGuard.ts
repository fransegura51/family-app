// Cambiar de día/semana/mes deslizando el dedo (Calendario) no debe robarle el gesto a un campo de texto: arrastrar horizontalmente dentro de una caja
// de escribir mueve el cursor o la selección, no pasa de día. Bug real (16/10/2026, app nativa): al editar un apunte y deslizar sobre el texto, cambiaba el día.
// Se decide en el momento de tocar (touchstart): si el dedo empieza en un campo de escritura, un selector o cualquier formulario, ese gesto no cuenta.
export const NO_DAY_SWIPE_SELECTOR = 'input, textarea, select, form, [contenteditable]:not([contenteditable="false"]), [data-no-swipe]'

// `target` es el elemento tocado; se usa solo `closest` para que sea fácil de probar sin navegador.
export function isDaySwipeBlockedTarget(target: unknown): boolean {
  const el = target as { closest?: (selector: string) => unknown } | null
  if (!el || typeof el.closest !== 'function') return false
  return el.closest(NO_DAY_SWIPE_SELECTOR) != null
}
