// «Mis listas» — lógica pura y testeable (sin DOM ni base de datos): tipos, texto con formato limitado, estructura de dos
// niveles, ordenación, duplicados, búsqueda y troceado de lo que se dicta. Las pantallas y la capa de datos solo orquestan.
//
// Reglas de producto que viven aquí:
//  · Tres formatos: tareas, ideas y comparativa (pros/contras u opciones, sin puntuaciones ni cálculos).
//  · Un único nivel de carpetas; el título es el nombre de la lista (no existe un segundo «nombre de archivo»).
//  · Texto con formato LIMITADO: negrita y color de una paleta cerrada, aplicable a palabras sueltas; nada más.
//  · Dos niveles de estructura (elemento y subelemento) sin subelementos huérfanos.

export type ListKind = 'tareas' | 'ideas' | 'comparativa'
export type ListVisibility = 'privada' | 'familiar'
export type ListSortMode = 'manual' | 'pendientes_arriba'

export const LIST_KIND_LABELS: Record<ListKind, string> = {
  tareas: 'Tareas',
  ideas: 'Ideas',
  comparativa: 'Comparativa',
}
export const LIST_KIND_HINTS: Record<ListKind, string> = {
  tareas: 'Elementos que se marcan como hechos',
  ideas: 'Anotaciones, planes y recordatorios sin fecha',
  comparativa: 'Pros y contras u opciones, en columnas',
}
export const LIST_VISIBILITY_LABELS: Record<ListVisibility, string> = {
  privada: 'Privada',
  familiar: 'Familiar',
}

export const LIST_TITLE_MAX = 120
export const FOLDER_NAME_MAX = 80
export const ITEM_TEXT_MAX = 1000
export const COLUMN_TITLE_MAX = 60

export interface UserList {
  id: string
  familyId: string
  createdBy: string
  title: string
  kind: ListKind
  visibility: ListVisibility
  folderId: string | null
  sortOrder: number
  sortMode: ListSortMode
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
export interface ListFolder {
  id: string
  familyId: string
  createdBy: string
  name: string
  sortOrder: number
  createdAt: string
}
export interface ListColumn {
  id: string
  listId: string
  title: string
  sortOrder: number
}
export interface ListItem {
  id: string
  listId: string
  familyId: string
  /** 0 = elemento, 1 = subelemento (pertenece al elemento de nivel 0 anterior). */
  depth: 0 | 1
  /** Texto plano: lo que se busca, se envía a Compras y se exporta. */
  text: string
  /** Texto con formato limitado (ver parseRich); null si no tiene formato. */
  rich: string | null
  done: boolean
  doneAt: string | null
  sortOrder: number
  /** Solo en listas comparativas: columna a la que pertenece. */
  columnId: string | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------------------------- texto con formato limitado
// Formato guardado (cadena segura, nunca HTML): <b>…</b> negrita y <c:rojo>…</c> color de la paleta. El resto de «<», «>» y «&»
// va escapado (&lt; &gt; &amp;). Cualquier otra etiqueta se descarta al sanear. Se pinta con elementos de React, nunca con
// innerHTML, y la base de datos rechaza texto que no cumpla este formato.
export const RICH_COLORS = {
  rojo: '#d64545',
  naranja: '#e8801f',
  verde: '#2f9d6a',
  azul: '#2f6fc0',
  morado: '#7b4dd6',
} as const
export type RichColorName = keyof typeof RICH_COLORS
export const RICH_COLOR_NAMES = Object.keys(RICH_COLORS) as RichColorName[]

export interface RichSpan {
  text: string
  bold: boolean
  color: RichColorName | null
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unescapeText = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// Entiende el formato guardado; lo que no encaja (etiquetas raras, sin cerrar…) se trata como texto, sin romper nada.
export function parseRich(markup: string): RichSpan[] {
  const spans: RichSpan[] = []
  let bold = false
  let color: RichColorName | null = null
  const re = /<(\/?)(b|c)(?::([a-z]+))?>/g
  let last = 0
  const push = (raw: string) => {
    if (!raw) return
    const text = unescapeText(raw)
    const prev = spans[spans.length - 1]
    if (prev && prev.bold === bold && prev.color === color) prev.text += text
    else spans.push({ text, bold, color })
  }
  let m: RegExpExecArray | null
  while ((m = re.exec(markup))) {
    push(markup.slice(last, m.index))
    last = m.index + m[0].length
    const closing = m[1] === '/'
    if (m[2] === 'b') bold = !closing
    else if (closing) color = null
    else color = (RICH_COLOR_NAMES as string[]).includes(m[3]) ? (m[3] as RichColorName) : null
  }
  push(markup.slice(last))
  return spans
}

export function serializeRich(spans: RichSpan[]): string {
  let out = ''
  for (const s of spans) {
    if (!s.text) continue
    let part = escapeText(s.text)
    if (s.color) part = `<c:${s.color}>${part}</c>`
    if (s.bold) part = `<b>${part}</b>`
    out += part
  }
  return out
}

export const richToPlain = (markup: string): string => parseRich(markup).map((s) => s.text).join('')
// Vuelve a escribir el formato desde cero: el resultado SIEMPRE es válido, con etiquetas bien anidadas y sin nada inseguro.
export const sanitizeRich = (markup: string): string => serializeRich(parseRich(markup))
export const hasFormatting = (spans: RichSpan[]) => spans.some((s) => s.bold || s.color)
// Si el texto no lleva ningún formato real se guarda como null (solo texto plano).
export function richOrNull(spans: RichSpan[]): string | null {
  return hasFormatting(spans) ? serializeRich(spans) : null
}
// Valida lo que llega de fuera (importaciones, pegados): True solo si ya es exactamente un formato válido.
export const isValidRich = (markup: string): boolean => sanitizeRich(markup) === markup

// Aplica negrita o color SOLO a la parte seleccionada [from, to) del texto plano (por palabras sueltas, no toda la línea).
export function applyFormat(spans: RichSpan[], from: number, to: number, change: { bold?: boolean; color?: RichColorName | null }): RichSpan[] {
  if (to <= from) return spans
  const out: RichSpan[] = []
  let pos = 0
  for (const s of spans) {
    const start = pos
    const end = pos + s.text.length
    pos = end
    if (end <= from || start >= to) {
      out.push({ ...s })
      continue
    }
    const a = Math.max(from, start) - start
    const b = Math.min(to, end) - start
    if (a > 0) out.push({ ...s, text: s.text.slice(0, a) })
    out.push({
      text: s.text.slice(a, b),
      bold: change.bold !== undefined ? change.bold : s.bold,
      color: change.color !== undefined ? change.color : s.color,
    })
    if (b < s.text.length) out.push({ ...s, text: s.text.slice(b) })
  }
  return mergeSpans(out)
}
export const clearFormat = (spans: RichSpan[], from: number, to: number): RichSpan[] => applyFormat(spans, from, to, { bold: false, color: null })
export function mergeSpans(spans: RichSpan[]): RichSpan[] {
  const out: RichSpan[] = []
  for (const s of spans) {
    if (!s.text) continue
    const prev = out[out.length - 1]
    if (prev && prev.bold === s.bold && prev.color === s.color) prev.text += s.text
    else out.push({ ...s })
  }
  return out
}

// ---------------------------------------------------------------------------------------------- estructura de dos niveles
// Los elementos se guardan en una sola lista ordenada; un subelemento (depth 1) pertenece al último elemento de nivel 0 que
// lo precede. Estas funciones mantienen esa estructura SIEMPRE válida: el primer elemento nunca es subelemento, y mover o
// quitar un elemento arrastra o suelta a sus subelementos sin dejarlos huérfanos.
type Outline = { depth: 0 | 1 }

export function normalizeOutline<T extends Outline>(items: T[]): T[] {
  return items.map((it, i) => (i === 0 && it.depth === 1 ? { ...it, depth: 0 as const } : it))
}
// Índices del bloque de un elemento: él mismo y, si es de nivel 0, sus subelementos consecutivos.
export function blockRange<T extends Outline>(items: T[], index: number): [number, number] {
  let end = index + 1
  if (items[index]?.depth === 0) while (end < items.length && items[end].depth === 1) end++
  return [index, end]
}
export function canIndent<T extends Outline>(items: T[], index: number): boolean {
  if (index <= 0 || index >= items.length) return false
  const it = items[index]
  if (it.depth === 1) return false
  // un elemento con subelementos no puede pasar a subelemento (serían tres niveles)
  if (items[index + 1]?.depth === 1) return false
  return true
}
export function canOutdent<T extends Outline>(items: T[], index: number): boolean {
  return index >= 0 && index < items.length && items[index].depth === 1
}
export function indentItem<T extends Outline>(items: T[], index: number): T[] {
  if (!canIndent(items, index)) return items
  return normalizeOutline(items.map((it, i) => (i === index ? { ...it, depth: 1 as const } : it)))
}
// Al disminuir la sangría, los subelementos que seguían al elemento PASAN con él (siguen siendo suyos): al ser él de nivel 0,
// los siguientes subelementos quedan como hijos suyos, nunca sueltos.
export function outdentItem<T extends Outline>(items: T[], index: number): T[] {
  if (!canOutdent(items, index)) return items
  return items.map((it, i) => (i === index ? { ...it, depth: 0 as const } : it))
}
// Mueve un elemento (con sus subelementos) para que quede ANTES de la posición `to` del array original (0..length).
export function moveBlock<T extends Outline>(items: T[], from: number, to: number): T[] {
  const [a, b] = blockRange(items, from)
  if (to >= a && to <= b) return items
  const block = items.slice(a, b)
  const rest = [...items.slice(0, a), ...items.slice(b)]
  const insertAt = to > b ? to - block.length : to
  const result = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)]
  // Un subelemento movido a ser primero deja de serlo; un bloque de nivel 0 nunca queda partido.
  return normalizeOutline(result)
}
// Quitar un elemento de nivel 0 PROMUEVE a sus subelementos a elementos de nivel 0 (se conservan, no se pierden ni pasan a
// ser hijos del elemento anterior).
export function removeItem<T extends Outline>(items: T[], index: number): T[] {
  const removed = items[index]
  if (!removed) return items
  const [a, b] = blockRange(items, index)
  const rest: T[] = []
  items.forEach((it, i) => {
    if (i === index) return
    if (removed.depth === 0 && i > a && i < b) rest.push({ ...it, depth: 0 as const })
    else rest.push(it)
  })
  return normalizeOutline(rest)
}

// ---------------------------------------------------------------------------------------------- ordenación y estado
// Pendientes arriba y completados abajo, SIN perder el orden manual dentro de cada grupo ni separar subelementos de su elemento.
export function sortPendingFirst<T extends Outline & { done: boolean }>(items: T[]): T[] {
  type Block = { items: T[]; done: boolean }
  const blocks: Block[] = []
  for (const it of items) {
    if (it.depth === 0 || blocks.length === 0) blocks.push({ items: [it], done: it.done })
    else blocks[blocks.length - 1].items.push(it)
  }
  const pending = blocks.filter((b) => !b.done)
  const done = blocks.filter((b) => b.done)
  return [...pending, ...done].flatMap((b) => b.items)
}
export const displayItems = <T extends Outline & { done: boolean }>(items: T[], mode: ListSortMode): T[] => (mode === 'pendientes_arriba' ? sortPendingFirst(items) : items)

export function progressOf(items: { done: boolean; depth: number }[]): { done: number; total: number } {
  const top = items.filter((i) => i.depth === 0)
  return { done: top.filter((i) => i.done).length, total: top.length }
}

// ---------------------------------------------------------------------------------------------- duplicados y búsqueda
// Texto «comparable»: sin mayúsculas, tildes, signos ni cantidades iniciales («2 cuadernos» ≈ «cuadernos»).
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/^\s*(\d+([.,]\d+)?|un|una|unos|unas|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(kg|g|l|ml|uds?|unidades?|paquetes?|botes?)?\s*(de\s+)?/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
// Duplicado EVIDENTE: mismo texto comparable (no basta con que uno contenga al otro: «pan» y «pan de molde» son productos distintos).
export const isObviousDuplicate = (a: string, b: string): boolean => {
  const na = normalizeForCompare(a)
  return na.length > 0 && na === normalizeForCompare(b)
}

export function matchesQuery(text: string, query: string): boolean {
  if (!query.trim()) return true
  const hay = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  const needle = query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return hay.includes(needle)
}
// Busca por título Y por contenido, sin importar la carpeta. Devuelve los ids de lista que coinciden.
export function searchLists(lists: { id: string; title: string }[], itemTextByList: Record<string, string[]>, query: string): Set<string> {
  const q = query.trim()
  const out = new Set<string>()
  if (!q) {
    lists.forEach((l) => out.add(l.id))
    return out
  }
  for (const l of lists) {
    if (matchesQuery(l.title, q) || (itemTextByList[l.id] ?? []).some((t) => matchesQuery(t, q))) out.add(l.id)
  }
  return out
}

// ---------------------------------------------------------------------------------------------- dictado → varios elementos
// «Comprar mochila, dos cuadernos, un estuche y preparar uniforme» → cuatro elementos. Es solo una PROPUESTA: siempre se
// enseña en una vista previa editable.
export function splitDictation(text: string): string[] {
  const cleaned = text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[.]+\s*$/, '')
    .trim()
  if (!cleaned) return []
  const parts = cleaned
    .split(/\s*(?:[,;\n]|\.\s+(?=[A-ZÁÉÍÓÚÑ¿¡])|\s+y\s+(?=\S)|\s+además\s+|\s+también\s+)\s*/i)
    .map((p) => p.replace(/^(y|e|también|además)\s+/i, '').trim())
    .filter(Boolean)
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
}
// Líneas de un texto pegado o devuelto por la IA: una por línea, sin viñetas ni numeración inicial.
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*([-*•·▪◦]|\d+[.)]|\[[ xX]?\])\s*/, '').trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------------------------- duplicar una lista
export const newId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`)

export interface DuplicatedList {
  list: Omit<UserList, 'createdAt' | 'updatedAt' | 'createdBy' | 'familyId'>
  columns: Omit<ListColumn, 'listId'>[]
  items: Omit<ListItem, 'listId' | 'familyId' | 'createdAt' | 'updatedAt'>[]
}
// La copia conserva contenido y formato, con identificadores NUEVOS; es PRIVADA, sin carpeta ni archivada, con todos los
// elementos pendientes y sin heredar vínculos con Calendario ni Compras (esos viven en otras tablas y no se copian).
export function duplicateList(list: UserList, columns: ListColumn[], items: ListItem[], title?: string): DuplicatedList {
  const columnIds = new Map(columns.map((c) => [c.id, newId()]))
  return {
    list: {
      id: newId(),
      title: (title ?? `${list.title} (copia)`).slice(0, LIST_TITLE_MAX),
      kind: list.kind,
      visibility: 'privada',
      folderId: null,
      sortOrder: list.sortOrder,
      sortMode: list.sortMode,
      archivedAt: null,
    },
    columns: columns.map((c) => ({ id: columnIds.get(c.id)!, title: c.title, sortOrder: c.sortOrder })),
    items: items.map((it) => ({
      id: newId(),
      depth: it.depth,
      text: it.text,
      rich: it.rich,
      done: false,
      doneAt: null,
      sortOrder: it.sortOrder,
      columnId: it.columnId ? columnIds.get(it.columnId) ?? null : null,
    })),
  }
}

// ---------------------------------------------------------------------------------------------- importación (foto, PDF, voz)
export type ImportDestinationKind = 'añadir' | 'sustituir' | 'nueva' | 'otra'
export interface ImportedLine {
  text: string
  /** true = la IA marcó la línea como dudosa o ilegible: se enseña en la vista previa, nunca se inventa. */
  uncertain?: boolean
}
// Limpia lo que llega de la IA o del dictado antes de enseñarlo: recorta, quita vacíos y duplicados idénticos seguidos, y limita.
export function cleanImportedLines(lines: ImportedLine[], max = 200): ImportedLine[] {
  const out: ImportedLine[] = []
  for (const l of lines) {
    const text = l.text.replace(/\s+/g, ' ').trim().slice(0, ITEM_TEXT_MAX)
    if (!text) continue
    if (out.length && out[out.length - 1].text === text) continue
    out.push({ text, uncertain: l.uncertain })
    if (out.length >= max) break
  }
  return out
}

// Texto «limpio» para enviar un elemento a Compras: sin formato enriquecido.
export const plainForShopping = (item: { text: string; rich: string | null }): string => (item.rich ? richToPlain(item.rich) : item.text).replace(/\s+/g, ' ').trim()

export function validateTitle(title: string): string | null {
  const t = title.trim()
  if (!t) return 'Escribe un título.'
  if (t.length > LIST_TITLE_MAX) return `El título no puede pasar de ${LIST_TITLE_MAX} caracteres.`
  return null
}
export function validateFolderName(name: string, existing: string[] = []): string | null {
  const t = name.trim()
  if (!t) return 'Escribe un nombre para la carpeta.'
  if (t.length > FOLDER_NAME_MAX) return `El nombre no puede pasar de ${FOLDER_NAME_MAX} caracteres.`
  if (existing.some((e) => e.trim().toLowerCase() === t.toLowerCase())) return 'Ya tienes una carpeta con ese nombre.'
  return null
}

// ---------------------------------------------------------------------------------------------- mover bloques (arrastrar)
export interface Relocatable extends Outline {
  id: string
  columnId: string | null
}
export interface RelocateTarget {
  /** Elemento sobre el que se suelta (o null si se suelta sobre una columna vacía). */
  id: string | null
  /** Columna destino cuando no hay elemento (comparativa). */
  columnId?: string | null
  /** true = en la mitad inferior del destino. */
  after: boolean
}
// Mueve un elemento (con sus subelementos) a otro sitio, dentro de su columna o a otra columna. Un elemento de nivel 0 nunca queda
// en mitad de los subelementos de otro; un subelemento que quede el primero de su columna pasa a nivel 0.
export function relocateBlock<T extends Relocatable>(items: T[], dragId: string, target: RelocateTarget): T[] {
  const from = items.findIndex((i) => i.id === dragId)
  if (from < 0) return items
  const [a, b] = blockRange(items, from)
  if (target.id && items.slice(a, b).some((i) => i.id === target.id)) return items
  const block = items.slice(a, b)
  const rest = [...items.slice(0, a), ...items.slice(b)]
  let dest: string | null
  let at: number
  if (target.id) {
    const ti = rest.findIndex((i) => i.id === target.id)
    if (ti < 0) return items
    dest = rest[ti].columnId
    if (items[from].depth === 1) {
      at = ti + (target.after ? 1 : 0)
    } else {
      let ps = ti
      while (ps > 0 && rest[ps].depth === 1) ps--
      const [, pe] = blockRange(rest, ps)
      at = target.after ? pe : ps
    }
  } else {
    dest = target.columnId ?? null
    let last = -1
    rest.forEach((i, n) => {
      if (i.columnId === dest) last = n
    })
    at = last + 1
  }
  const moved = block.map((i) => ({ ...i, columnId: dest }))
  const result = [...rest.slice(0, at), ...moved, ...rest.slice(at)]
  // Sin subelementos huérfanos: dentro de cada columna, un subelemento solo cuelga de un elemento de nivel 0 anterior.
  const seen = new Set<string | null>()
  return result.map((i) => {
    if (i.depth === 0) {
      seen.add(i.columnId)
      return i
    }
    return seen.has(i.columnId) ? i : { ...i, depth: 0 as const }
  })
}
