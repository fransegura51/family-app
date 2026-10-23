// Localización de los controles REALES que señala un tutorial. Cada control lleva en el código de su pantalla una marca estable `data-help-id="modulo.control"` (nunca coordenadas ni
// el texto del botón como única ancla). Si el control no existe (otro rol, otra plataforma, pantalla distinta) devuelve null: el tutorial NUNCA inventa un botón.
export const HELP_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

function defaultVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden]') || el.closest('[inert]')) return false
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  const cs = window.getComputedStyle(el)
  return cs.visibility !== 'hidden' && cs.display !== 'none'
}

let visible: (el: HTMLElement) => boolean = defaultVisible

// Solo para pruebas (jsdom no calcula posiciones).
export function setTargetVisibilityForTests(fn: ((el: HTMLElement) => boolean) | null): void {
  visible = fn ?? defaultVisible
}

export function findTarget(id: string, root: ParentNode = document): HTMLElement | null {
  if (!HELP_ID_PATTERN.test(id)) return null
  const nodes = root.querySelectorAll<HTMLElement>(`[data-help-id="${id}"]`)
  for (const n of nodes) if (visible(n)) return n
  return null
}

// El campo cuyo valor se comprueba en una señal «filled»: el propio elemento si es un campo; si es una etiqueta o un contenedor, el primer campo de dentro.
export function fieldOf(el: HTMLElement): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el
  return el.querySelector('input, textarea, select')
}

// Qué elemento se rodea con el marco: un campo suelto se resalta junto con su etiqueta («Título» + el cuadro), para que el marco no corte la etiqueta ni se quede a medias encima de ella.
export function ringElementOf(el: HTMLElement): HTMLElement {
  const parent = el.parentElement
  if (parent && parent.tagName === 'LABEL' && fieldOf(el) === el && parent.querySelectorAll('input, textarea, select').length === 1) return parent
  return el
}

export function markedAncestor(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>('[data-help-id]') : null
}
