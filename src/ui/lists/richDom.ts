import { mergeSpans, RICH_COLORS, type RichColorName, type RichSpan } from '@/domain/lists'

// Puente entre el texto con formato limitado (spans) y un elemento editable. Se construye SOLO con createElement/createTextNode
// (nunca innerHTML) y al leer solo se aceptan <b>/<strong> y <span data-c="color">; cualquier otra cosa se queda en texto plano.

export function renderSpans(root: HTMLElement, spans: RichSpan[]): void {
  root.replaceChildren()
  for (const s of spans) {
    if (!s.text) continue
    let node: Node = document.createTextNode(s.text)
    if (s.color) {
      const c = document.createElement('span')
      c.dataset.c = s.color
      c.style.color = RICH_COLORS[s.color]
      c.appendChild(node)
      node = c
    }
    if (s.bold) {
      const b = document.createElement('b')
      b.appendChild(node)
      node = b
    }
    root.appendChild(node)
  }
}

const isColor = (v: string | undefined): v is RichColorName => !!v && Object.prototype.hasOwnProperty.call(RICH_COLORS, v)

// Lee el contenido editable: negrita (b/strong), color (data-c) y texto. Saltos de línea y bloques se convierten en espacios.
export function readSpans(root: HTMLElement): RichSpan[] {
  const out: RichSpan[] = []
  const walk = (node: Node, bold: boolean, color: RichColorName | null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/[\r\n]+/g, ' ')
      if (text) out.push({ text, bold, color })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (tag === 'br') {
      out.push({ text: ' ', bold, color })
      return
    }
    let b = bold
    let c = color
    if (tag === 'b' || tag === 'strong') b = true
    if (tag === 'span' && isColor(el.dataset.c)) c = el.dataset.c
    el.childNodes.forEach((ch) => walk(ch, b, c))
  }
  root.childNodes.forEach((n) => walk(n, false, null))
  return mergeSpans(out)
}

// Posición (en caracteres del texto plano) de un punto de la selección dentro del editor.
function offsetOf(root: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange()
  r.selectNodeContents(root)
  r.setEnd(node, offset)
  return r.toString().length
}

export function getSelectionOffsets(root: HTMLElement): { from: number; to: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null
  return { from: offsetOf(root, r.startContainer, r.startOffset), to: offsetOf(root, r.endContainer, r.endOffset) }
}

function pointAt(root: HTMLElement, target: number): { node: Node; offset: number } {
  let remaining = target
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let last: Text | null = null
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    last = t
    if (remaining <= t.data.length) return { node: t, offset: remaining }
    remaining -= t.data.length
  }
  return last ? { node: last, offset: last.data.length } : { node: root, offset: 0 }
}

export function setSelectionOffsets(root: HTMLElement, from: number, to: number): void {
  const sel = window.getSelection()
  if (!sel) return
  const a = pointAt(root, from)
  const b = pointAt(root, to)
  const r = document.createRange()
  r.setStart(a.node, a.offset)
  r.setEnd(b.node, b.offset)
  sel.removeAllRanges()
  sel.addRange(r)
}
