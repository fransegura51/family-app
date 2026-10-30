import { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

// UI-POP-01 — una X discreta, arriba a la derecha, en TODA ventana emergente que se puede cerrar (hojas, diálogos, selectores) y todavía no la tiene.
//
// Un solo mecanismo común en vez de tocar cada una de las ~130 ventanas:
//  · Se vigila el documento: cada hoja (.modal-sheet / .sheet-modal) dentro de su capa (.modal-overlay / .sheet-modal-overlay) que NO trae ya una X recibe la suya. Las que ya la
//    tienen (botón .modal-close, «Cerrar»/«✕») no se duplican.
//  · La X cierra POR EL MISMO CAMINO que tocar fuera de la ventana (la capa recibe el toque y ejecuta su cierre de siempre): no se inventa otra forma de cerrar y cualquier
//    protección que esa ventana ya tenga sigue valiendo. Una ventana que NO se puede cerrar tocando fuera (confirmaciones obligatorias, avisos) no recibe X: no se salta nada.
//  · Cierra solo SU ventana (la que está encima): cada hoja lleva su propia X.
//  · Si se ha escrito algo en un formulario de la ventana, antes de cerrar se pregunta (nunca se pierden cambios en silencio). Los buscadores no cuentan.
//  · Tamaño táctil de 44 px, en el borde derecho con margen seguro, sin tapar el contenido ni mover nada (no ocupa sitio). No es un cambio de estilo.
// La X se pinta en su propia raíz de React dentro de la hoja, sin tocar lo que React ya gestiona.

const SHEET_SELECTOR = '.modal-sheet, .sheet-modal'
const OVERLAY_SELECTOR = '.modal-overlay, .sheet-modal-overlay'
const MARK = 'data-auto-close'

const CLOSE_GLYPHS = new Set(['✕', '×', '✖', '✗'])

/** ¿La hoja ya trae su propia X o botón de cerrar? (no se duplica). */
export function hasCloseControl(sheet: Element): boolean {
  if (sheet.querySelector(`[${MARK}]`)) return true
  for (const el of Array.from(sheet.querySelectorAll('button, [role="button"]'))) {
    if (el.classList.contains('modal-close')) return true
    const text = (el.textContent ?? '').trim()
    if (CLOSE_GLYPHS.has(text)) return true
    // Botón de icono con nombre «Cerrar…» (sin texto o con un solo símbolo). Un «Cerrar» escrito en grande al pie no es una X.
    const label = (el.getAttribute('aria-label') ?? '').trim().toLowerCase()
    if ((label === 'cerrar' || label.startsWith('cerrar ') || label === 'close') && text.length <= 2) return true
  }
  return false
}

/** ¿Esta capa se cierra al tocarla? (lo dice su propio manejador de React; una confirmación obligatoria no lo tiene). */
export function overlayClosesOnTap(overlay: Element): boolean {
  if (overlay.getAttribute('role') === 'alertdialog') return false
  const key = Object.keys(overlay).find((k) => k.startsWith('__reactProps$'))
  if (!key) return false
  const props = (overlay as unknown as Record<string, { onClick?: unknown } | undefined>)[key]
  return typeof props?.onClick === 'function'
}

function isSearchField(el: Element): boolean {
  const type = (el as HTMLInputElement).type
  return type === 'search' || el.getAttribute('role') === 'searchbox' || el.hasAttribute('data-no-dirty')
}

function CloseX({ sheet, dirty }: { sheet: HTMLElement; dirty: { value: boolean } }) {
  return (
    <button
      type="button"
      className="auto-modal-close"
      aria-label="Cerrar"
      data-testid="auto-modal-close"
      onClick={() => {
        const overlay = sheet.closest(OVERLAY_SELECTOR) as HTMLElement | null
        if (!overlay || !overlayClosesOnTap(overlay)) return
        if (dirty.value && !window.confirm('Tienes cambios sin guardar. ¿Cerrar sin guardarlos?')) return
        overlay.click()
      }}
    >
      <span aria-hidden="true">✕</span>
    </button>
  )
}

interface Attached {
  wrapper: HTMLElement
  root: Root
  onInput: (e: Event) => void
}

/** Pone o quita las X en todo el documento. Se exporta para poder probarlo sin montar la app. */
export function syncCloseButtons(attached: Map<HTMLElement, Attached>, doc: Document = document): void {
  // Hojas que ya no están en pantalla: se libera su X.
  for (const [sheet, info] of attached) {
    if (!doc.contains(sheet)) {
      sheet.removeEventListener('input', info.onInput, true)
      queueMicrotask(() => info.root.unmount())
      attached.delete(sheet)
    }
  }
  for (const sheet of Array.from(doc.querySelectorAll<HTMLElement>(SHEET_SELECTOR))) {
    if (attached.has(sheet)) continue
    const overlay = sheet.closest(OVERLAY_SELECTOR)
    if (!overlay || !overlayClosesOnTap(overlay) || hasCloseControl(sheet)) continue
    const wrapper = doc.createElement('div')
    wrapper.setAttribute(MARK, '')
    wrapper.className = 'auto-modal-close-anchor'
    sheet.insertBefore(wrapper, sheet.firstChild)
    const dirty = { value: false }
    const onInput = (e: Event) => {
      const target = e.target as Element | null
      if (target && !isSearchField(target) && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) dirty.value = true
    }
    sheet.addEventListener('input', onInput, true)
    const root = createRoot(wrapper)
    root.render(<CloseX sheet={sheet} dirty={dirty} />)
    attached.set(sheet, { wrapper, root, onInput })
  }
}

/** Se monta UNA vez en toda la app (main.tsx). No pinta nada por sí mismo. */
export function ModalCloseEnhancer() {
  useEffect(() => {
    const attached = new Map<HTMLElement, Attached>()
    let scheduled = false
    const schedule = () => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        syncCloseButtons(attached)
      })
    }
    syncCloseButtons(attached)
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      for (const [sheet, info] of attached) {
        sheet.removeEventListener('input', info.onInput, true)
        info.wrapper.remove()
        queueMicrotask(() => info.root.unmount())
      }
      attached.clear()
    }
  }, [])
  return null
}
