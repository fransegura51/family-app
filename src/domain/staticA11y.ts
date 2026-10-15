// Comprobador de accesibilidad básica sobre HTML YA DIBUJADO (el que devuelve renderToStaticMarkup). Sirve para las pruebas: sin navegador, detecta lo más grave y
// más común que un lector de pantalla o el teclado notan, y que un fallo de código dejaría pasar sin que ninguna otra prueba lo vea:
//   · botones y enlaces sin nombre (sin texto, sin aria-label ni aria-labelledby, ni imagen con alt),
//   · campos de formulario sin etiqueta (label for / label que lo envuelve / aria-label / aria-labelledby),
//   · imágenes sin atributo alt (decorativas: alt=""),
//   · ventanas (role=dialog/alertdialog) sin nombre, y sin aria-modal,
//   · tabindex positivo (rompe el orden natural del teclado),
//   · ids repetidos y referencias (for, aria-labelledby, aria-describedby) a ids que no existen,
//   · listas de radio (role=radio) fuera de un role=radiogroup con nombre.
// No sustituye a una auditoría con lector de pantalla real (eso queda en la matriz como pendiente de dispositivos), pero convierte «etiquetas, roles y nombres»
// en algo que se comprueba en cada ejecución.
interface Node {
  tag: string
  attrs: Record<string, string>
  children: Node[]
  text: string
  parent: Node | null
}

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr'])

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of src.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  }
  return attrs
}

export function parseHtml(html: string): Node {
  const root: Node = { tag: '#root', attrs: {}, children: [], text: '', parent: null }
  let cur = root
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9-]+)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>|([^<]+)/g
  for (const m of html.matchAll(re)) {
    if (m[1]) {
      // cierre: sube hasta el elemento abierto con ese nombre
      let n: Node | null = cur
      while (n && n.tag !== m[1].toLowerCase()) n = n.parent
      if (n && n.parent) cur = n.parent
    } else if (m[2]) {
      const tag = m[2].toLowerCase()
      const node: Node = { tag, attrs: parseAttrs(m[3] ?? ''), children: [], text: '', parent: cur }
      cur.children.push(node)
      if (!VOID.has(tag) && m[4] !== '/') cur = node
    } else if (m[5]) {
      cur.text += m[5]
    }
  }
  return root
}

function walk(node: Node, fn: (n: Node) => void) {
  for (const c of node.children) {
    fn(c)
    walk(c, fn)
  }
}

function textOf(node: Node): string {
  let t = node.text
  for (const c of node.children) {
    if (c.attrs['aria-hidden'] === 'true') continue
    if (c.tag === 'img' && c.attrs.alt) t += ' ' + c.attrs.alt
    t += ' ' + textOf(c)
  }
  return t.replace(/\s+/g, ' ').trim()
}

function ancestor(node: Node, tag: string): Node | null {
  for (let n = node.parent; n; n = n.parent) if (n.tag === tag) return n
  return null
}

export interface A11yOptions {
  // Selectores permitidos sin nombre propio por un motivo concreto (p. ej. el campo de fotos oculto, que se activa con su botón visible).
  ignoreIds?: string[]
}

export function a11yProblems(html: string, options: A11yOptions = {}): string[] {
  const root = parseHtml(html)
  const problems: string[] = []
  const ids = new Map<string, Node[]>()
  const labelsFor = new Map<string, Node[]>()
  walk(root, (n) => {
    if (n.attrs.id !== undefined) ids.set(n.attrs.id, [...(ids.get(n.attrs.id) ?? []), n])
    if (n.tag === 'label' && n.attrs.for) labelsFor.set(n.attrs.for, [...(labelsFor.get(n.attrs.for) ?? []), n])
  })
  const describe = (n: Node) => `<${n.tag}${n.attrs.id ? '#' + n.attrs.id : ''}${n.attrs.class ? '.' + n.attrs.class.split(' ')[0] : ''}>`
  const referencedName = (n: Node): string => {
    const by = n.attrs['aria-labelledby']
    if (!by) return ''
    return by
      .split(/\s+/)
      .map((id) => (ids.get(id)?.[0] ? textOf(ids.get(id)![0]) : ''))
      .join(' ')
      .trim()
  }

  walk(root, (n) => {
    if (options.ignoreIds?.includes(n.attrs.id ?? '\u0000')) return
    const label = (n.attrs['aria-label'] ?? '').trim()
    // Lo oculto (hidden, aria-hidden, display:none), o dentro de algo oculto, no lo ve ni lo oye nadie: no se revisa.
    for (let p: Node | null = n; p; p = p.parent) {
      if (p.attrs.hidden !== undefined || p.attrs['aria-hidden'] === 'true' || (p.attrs.style ?? '').includes('display:none')) return
    }
    if (n.tag === 'button' || (n.tag === 'a' && n.attrs.href !== undefined) || n.attrs.role === 'button') {
      if (!label && !textOf(n) && !referencedName(n) && !n.attrs.title) problems.push(`${describe(n)} no tiene nombre (sin texto ni aria-label)`)
    }
    if (n.tag === 'input' || n.tag === 'select' || n.tag === 'textarea') {
      const type = (n.attrs.type ?? 'text').toLowerCase()
      if (n.tag === 'input' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) {
        if ((type === 'submit' || type === 'button') && !n.attrs.value && !label) problems.push(`${describe(n)} (${type}) sin valor ni aria-label`)
      } else {
        const wrapped = ancestor(n, 'label') !== null
        const byFor = n.attrs.id !== undefined && (labelsFor.get(n.attrs.id)?.length ?? 0) > 0
        if (!label && !referencedName(n) && !wrapped && !byFor) problems.push(`${describe(n)} (campo ${type}) sin etiqueta`)
      }
    }
    if (n.tag === 'img' && n.attrs.alt === undefined) problems.push(`${describe(n)} sin atributo alt`)
    if (n.attrs.role === 'dialog' || n.attrs.role === 'alertdialog') {
      if (!label && !referencedName(n)) problems.push(`${describe(n)} (ventana) sin nombre`)
      if (n.attrs['aria-modal'] !== 'true') problems.push(`${describe(n)} (ventana) sin aria-modal`)
    }
    if (n.attrs.tabindex !== undefined && Number(n.attrs.tabindex) > 0) problems.push(`${describe(n)} con tabindex positivo`)
    if (n.attrs.role === 'radio') {
      const group = ancestor(n, 'div') // el grupo puede ser cualquier contenedor
      let ok = false
      for (let p: Node | null = group; p; p = p.parent) if (p.attrs.role === 'radiogroup' && (p.attrs['aria-label'] || p.attrs['aria-labelledby'])) ok = true
      if (!ok) problems.push(`${describe(n)} (radio) fuera de un radiogroup con nombre`)
    }
    for (const attr of ['aria-labelledby', 'aria-describedby'] as const) {
      for (const id of (n.attrs[attr] ?? '').split(/\s+/).filter(Boolean)) if (!ids.has(id)) problems.push(`${describe(n)} ${attr} apunta a «${id}», que no existe`)
    }
  })
  for (const [id, nodes] of ids) if (nodes.length > 1) problems.push(`id repetido «${id}» (${nodes.length} veces)`)
  for (const [id] of labelsFor) if (!ids.has(id)) problems.push(`<label for="${id}"> apunta a un campo que no existe`)
  return problems
}
