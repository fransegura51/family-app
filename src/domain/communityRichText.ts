// Texto enriquecido de Comunidad (preguntas, consejos, anécdotas, recetas y comentarios): un subconjunto MUY pequeño de Markdown — negrita, cursiva, listas con
// viñetas o numeradas y enlaces — que se convierte en un árbol de datos y se pinta como elementos de React. NUNCA se inserta HTML: no hay forma de colar código
// (XSS). Los enlaces solo pueden ser http/https de sitios con nombre (no direcciones IP), siempre se marcan como «sitio externo» y los acortadores se avisan.
// El servidor vuelve a comprobar todo (migración 0265) y rechaza código ejecutable, enlaces peligrosos y dominios bloqueados.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'link'; href: string; host: string; label: string; shortener: boolean }

export type Block = { t: 'p'; c: Inline[] } | { t: 'ul'; items: Inline[][] } | { t: 'ol'; items: Inline[][] }

const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy'])

export interface SafeLink {
  href: string
  host: string
  shortener: boolean
}

// null = enlace NO permitido (se pintará como texto normal, nunca como enlace).
export function safeLink(raw: string): SafeLink | null {
  const candidate = raw.trim()
  if (!/^https?:\/\//i.test(candidate)) return null
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  const host = url.hostname.toLowerCase()
  if (!host.includes('.') || /^[0-9.]+$/.test(host) || host.startsWith('[')) return null
  const clean = host.replace(/^www\./, '')
  return { href: url.toString(), host: clean, shortener: SHORTENERS.has(clean) }
}

const INLINE_TOKEN = /(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(_[^_\s][^_\n]*_)|(\[[^\]\n]+\]\((?:[^()\s]|\([^()\s]*\))+\))|(https?:\/\/[^\s)<>\]]+)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE_TOKEN)) {
    const index = m.index ?? 0
    if (index > last) out.push({ t: 'text', v: text.slice(last, index) })
    const token = m[0]
    if (m[1]) {
      out.push({ t: 'bold', c: parseInline(token.slice(2, -2)) })
    } else if (m[2] || m[3]) {
      out.push({ t: 'italic', c: parseInline(token.slice(1, -1)) })
    } else if (m[4]) {
      const parts = /^\[([^\]]+)\]\((.+)\)$/.exec(token)
      const link = parts ? safeLink(parts[2]) : null
      if (parts && link) out.push({ t: 'link', ...link, label: parts[1] })
      else out.push({ t: 'text', v: parts ? parts[1] : token })
    } else {
      // Enlace suelto: se quita la puntuación final que no forma parte de la dirección.
      const trimmed = token.replace(/[.,;:!?]+$/, '')
      const link = safeLink(trimmed)
      if (link) {
        out.push({ t: 'link', ...link, label: trimmed })
        if (trimmed.length < token.length) out.push({ t: 'text', v: token.slice(trimmed.length) })
      } else {
        out.push({ t: 'text', v: token })
      }
    }
    last = index + token.length
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) })
  return out
}

export function parseRichText(body: string): Block[] {
  const blocks: Block[] = []
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  let paragraph: string[] = []
  let list: { kind: 'ul' | 'ol'; items: string[] } | null = null
  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ t: 'p', c: parseInline(paragraph.join('\n')) })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push({ t: list.kind, items: list.items.map(parseInline) })
    list = null
  }
  for (const line of lines) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      const kind = bullet ? 'ul' : 'ol'
      if (list && list.kind !== kind) flushList()
      if (!list) list = { kind, items: [] }
      list.items.push((bullet ?? numbered)![1])
    } else if (line.trim() === '') {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  flushParagraph()
  flushList()
  return blocks
}

// Texto plano (para extractos, vistas previas y comprobaciones).
export function richTextToPlain(body: string): string {
  const inlineText = (items: Inline[]): string =>
    items.map((i) => (i.t === 'text' ? i.v : i.t === 'link' ? i.label : inlineText(i.c))).join('')
  return parseRichText(body)
    .map((b) => (b.t === 'p' ? inlineText(b.c) : b.items.map((it) => inlineText(it)).join(' · ')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function countLinks(body: string): number {
  return (body.match(/https?:\/\/[^\s)<>\]]+/gi) ?? []).length
}

// ---- Ayudas del editor: devuelven el texto nuevo y dónde queda la selección.
export interface EditResult {
  text: string
  selectionStart: number
  selectionEnd: number
}

function wrap(text: string, start: number, end: number, mark: string, placeholder: string): EditResult {
  const selected = text.slice(start, end) || placeholder
  const next = text.slice(0, start) + mark + selected + mark + text.slice(end)
  return { text: next, selectionStart: start + mark.length, selectionEnd: start + mark.length + selected.length }
}

export const applyBold = (text: string, start: number, end: number) => wrap(text, start, end, '**', 'texto en negrita')
export const applyItalic = (text: string, start: number, end: number) => wrap(text, start, end, '*', 'texto en cursiva')

function prefixLines(text: string, start: number, end: number, prefixFor: (i: number) => string, placeholder: string): EditResult {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const nextNl = text.indexOf('\n', end)
  const lineEnd = nextNl === -1 ? text.length : nextNl
  const chunk = text.slice(lineStart, lineEnd) || placeholder
  const prefixed = chunk
    .split('\n')
    .map((l, i) => prefixFor(i) + l.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, ''))
    .join('\n')
  const next = text.slice(0, lineStart) + prefixed + text.slice(lineEnd)
  return { text: next, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length }
}

export const applyBullets = (text: string, start: number, end: number) => prefixLines(text, start, end, () => '- ', 'elemento de la lista')
export const applyNumbered = (text: string, start: number, end: number) => prefixLines(text, start, end, (i) => `${i + 1}. `, 'primer paso')

export function applyLink(text: string, start: number, end: number, url: string): EditResult {
  const label = text.slice(start, end) || 'enlace'
  const insert = `[${label}](${url})`
  return { text: text.slice(0, start) + insert + text.slice(end), selectionStart: start + 1, selectionEnd: start + 1 + label.length }
}
