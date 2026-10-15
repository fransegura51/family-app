import { useEffect, useRef, type RefObject } from 'react'
import { FOCUSABLE_SELECTOR, trapFocusTarget } from '@/domain/focusTrap'

// Comportamiento de un diálogo modal accesible (panel de avisos de la campana, INC-20):
//  · el foco inicial entra en el diálogo (en el propio panel, para que el lector de pantalla lea su nombre y después se avance con Tab);
//  · el foco queda ATRAPADO: Tab y Mayús+Tab dan la vuelta dentro del diálogo y, si el foco se escapa por cualquier motivo, vuelve;
//  · Escape cierra;
//  · el fondo no se desplaza (se bloquea el scroll del documento) y queda marcado como no interactivo: `inert` donde se admite (el teclado y el lector no
//    entran) y `aria-hidden` como refuerzo;
//  · al cerrar, el foco vuelve al elemento que abrió el diálogo (el botón de la campana).
// `backgroundId` es el contenedor de la app que queda detrás (el diálogo debe renderizarse FUERA de él, con un portal, para no quedar también inerte).
export function useModalDialog(
  panelRef: RefObject<HTMLElement | null>,
  options: { onClose: () => void; returnFocusRef?: RefObject<HTMLElement | null>; backgroundId?: string },
): void {
  const onCloseRef = useRef(options.onClose)
  onCloseRef.current = options.onClose
  const { returnFocusRef, backgroundId = 'root' } = options

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    // Quién tenía el foco al abrir (por si el navegador no enfoca el botón al pulsarlo, como Safari): se usa si no se indicó el botón de la campana.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // El botón de la campana ya está en pantalla al abrir: se guarda aquí (no se lee la referencia al cerrar).
    const back = returnFocusRef?.current ?? opener

    // Foco inicial dentro del diálogo.
    panel.focus({ preventScroll: true })

    // Fondo: sin scroll y no interactivo.
    const body = document.body
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    const background = document.getElementById(backgroundId)
    const hadInert = background?.hasAttribute('inert') ?? false
    const previousAriaHidden = background?.getAttribute('aria-hidden') ?? null
    background?.setAttribute('inert', '')
    background?.setAttribute('aria-hidden', 'true')

    const focusables = (): HTMLElement[] =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null || el === document.activeElement)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      const current = items.indexOf(document.activeElement as HTMLElement)
      const target = trapFocusTarget(items.length, current, e.shiftKey)
      if (target === null) return // el navegador sigue su camino normal dentro del diálogo
      e.preventDefault()
      if (target === -1) panel?.focus({ preventScroll: true })
      else items[target].focus()
    }
    // Si el foco se va a algo de fuera del diálogo (p. ej. por código), se trae de vuelta.
    function onFocusIn(e: FocusEvent) {
      if (panel && e.target instanceof Node && !panel.contains(e.target)) panel.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
      body.style.overflow = previousOverflow
      if (background) {
        if (!hadInert) background.removeAttribute('inert')
        if (previousAriaHidden === null) background.removeAttribute('aria-hidden')
        else background.setAttribute('aria-hidden', previousAriaHidden)
      }
      // Devolver el foco (si el botón sigue en pantalla: al abrir un aviso se navega y Inicio ya no está).
      if (back && back.isConnected) back.focus({ preventScroll: true })
    }
  }, [panelRef, returnFocusRef, backgroundId])
}
