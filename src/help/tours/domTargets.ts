// Localización de los controles REALES que señala un tutorial. Cada control lleva en el código de su pantalla una marca estable `data-help-id="modulo.control"` (nunca coordenadas ni
// el texto del botón como única ancla). Si el control no existe (otro rol, otra plataforma, pantalla distinta) devuelve null: el tutorial NUNCA inventa un botón.
export const HELP_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/

// Un control dentro de un <details> CERRADO no se ve aunque el navegador le devuelva una caja: no cuenta como presente (salvo el propio <summary>, que sí es visible).
function insideClosedDetails(el: HTMLElement): boolean {
  const summary = el.closest('summary')
  for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) {
    if (!d.open && !(summary && summary.parentElement === d)) return true
  }
  return false
}

function defaultVisible(el: HTMLElement): boolean {
  if (el.closest('[hidden]') || el.closest('[inert]')) return false
  if (insideClosedDetails(el)) return false
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

// ¿Hay en pantalla un texto «Cargando…» (visible, fuera del tutorial)? Mientras se carga una lista o un historial, los controles todavía no existen: el tutorial espera en vez de dar por
// ausentes (y omitir) los pasos opcionales. Solo se mira el texto, sin tocar nada.
export function screenIsLoading(): boolean {
  if (typeof document === 'undefined' || !document.body) return false
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n: Node | null
  let seen = 0
  while ((n = walker.nextNode()) && seen++ < 6000) {
    const t = n.nodeValue
    if (!t || !/^\s*Cargando\b/.test(t)) continue
    const el = n.parentElement
    if (el && !el.closest('[data-tour-layer]') && visible(el)) return true
  }
  return false
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
