import { useEffect, useRef } from 'react'
import { nextTrapIndex } from '@/domain/communityDialogFocus'

// Foco de teclado en las ventanas emergentes de Comunidad (accesibilidad: lector de pantalla y teclado). Una ventana con `aria-modal="true"` debe:
//   1. llevar el foco DENTRO al abrirse (si no hay ya un campo con foco, va al primer control o a la propia ventana),
//   2. no dejarlo escapar con el tabulador (el foco da la vuelta dentro de la ventana, ni sube al fondo ni baja a lo que hay detrás),
//   3. devolverlo al botón que la abrió al cerrarse.
// «Escape» y el clic fuera los gestiona cada ventana (algunas no se pueden cerrar mientras guardan). Uso: `const ref = useDialogFocus<HTMLDivElement>()` y
// `<div ref={ref} role="dialog" aria-modal="true" …>`.
const FOCUSABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    // Los controles ocultos (sin tamaño) no pueden recibir el foco.
    const r = el.getBoundingClientRect()
    return r.width > 0 || r.height > 0 || el === document.activeElement
  })
}

export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!el.contains(document.activeElement)) {
      const first = focusableIn(el)[0]
      if (first) first.focus({ preventScroll: true })
      else {
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
        el.focus({ preventScroll: true })
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = focusableIn(el)
      const active = document.activeElement as HTMLElement | null
      const index = active ? list.indexOf(active) : -1
      const target = nextTrapIndex(list.length, index, e.shiftKey)
      if (target === null) return // el navegador mueve el foco por sí solo (todavía dentro)
      e.preventDefault()
      if (list.length === 0) el.focus({ preventScroll: true })
      else list[target].focus({ preventScroll: true })
    }
    el.addEventListener('keydown', onKeyDown)
    return () => {
      el.removeEventListener('keydown', onKeyDown)
      // Al cerrar, el foco vuelve al botón que abrió la ventana (si sigue en la página).
      if (opener && opener !== document.body && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])
  return ref
}
