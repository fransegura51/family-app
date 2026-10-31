// «Mis listas» — revisión de lo que se importa (voz, texto, foto, PDF): lógica pura de las líneas propuestas.
// La separación de lo dictado REUTILIZA la de Compras: las pausas que detecta el micrófono (services/voice.ts las une con comas),
// el troceo local y, si todo sigue en una línea, la misma IA de separación (services/splitGroceryList.ts) con instrucciones de lista.
// Aquí solo viven las operaciones de la pantalla de revisión: separar, unir, mover y asignar columna. Nada se guarda desde aquí.

export interface ReviewLine {
  key: number
  text: string
  depth: 0 | 1
  uncertain: boolean
  /** Solo si el destino es una comparativa: columna elegida para este elemento (id real o provisional). */
  columnId: string | null
}

let nextKey = 0
export const newLineKey = (): number => ++nextKey

export function toReviewLines(src: { text: string; depth?: 0 | 1; uncertain?: boolean; columnId?: string | null }[]): ReviewLine[] {
  return src.map((l) => ({ key: newLineKey(), text: l.text, depth: l.depth ?? 0, uncertain: !!l.uncertain, columnId: l.columnId ?? null }))
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// Parte una línea en dos por la posición del cursor (0..longitud). Si el cursor está al principio o al final (o solo hay espacios a un lado)
// no se crea ningún elemento vacío: devuelve las líneas tal cual. La segunda mitad hereda sangría y columna y queda justo detrás.
export function splitLineAt(lines: ReviewLine[], key: number, pos: number): ReviewLine[] {
  const i = lines.findIndex((l) => l.key === key)
  if (i < 0) return lines
  const line = lines[i]
  const at = Math.min(Math.max(0, pos), line.text.length)
  const a = line.text.slice(0, at).trim()
  const b = line.text.slice(at).trim()
  if (!a || !b) return lines
  const first: ReviewLine = { ...line, text: a, uncertain: false }
  const second: ReviewLine = { key: newLineKey(), text: cap(b), depth: line.depth, uncertain: false, columnId: line.columnId }
  return [...lines.slice(0, i), first, second, ...lines.slice(i + 1)]
}

// Une una línea con la anterior (un espacio de por medio). Conserva la sangría y la columna de la primera.
export function mergeWithPrevious(lines: ReviewLine[], key: number): ReviewLine[] {
  const i = lines.findIndex((l) => l.key === key)
  if (i <= 0) return lines
  const prev = lines[i - 1]
  const merged: ReviewLine = { ...prev, text: `${prev.text.trim()} ${lines[i].text.trim().replace(/^./, (c) => c.toLowerCase())}`.trim(), uncertain: prev.uncertain || lines[i].uncertain }
  return [...lines.slice(0, i - 1), merged, ...lines.slice(i + 1)]
}

export function moveLine(lines: ReviewLine[], key: number, delta: -1 | 1): ReviewLine[] {
  const i = lines.findIndex((l) => l.key === key)
  const j = i + delta
  if (i < 0 || j < 0 || j >= lines.length) return lines
  const out = [...lines]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

// El primer elemento nunca puede ser subelemento.
export const normalizeReviewDepth = (lines: ReviewLine[]): ReviewLine[] => lines.map((l, i) => (i === 0 && l.depth === 1 ? { ...l, depth: 0 as const } : l))

// Columna de cada línea contra las columnas reales del destino: si la elegida ya no existe (se cambió de destino) se usa la predeterminada.
export function assignColumns(lines: ReviewLine[], validIds: string[], defaultId: string | null): ReviewLine[] {
  const ok = new Set(validIds)
  return lines.map((l) => (l.columnId && ok.has(l.columnId) ? l : { ...l, columnId: defaultId }))
}

// ¿Merece la pena pedir ayuda a la IA para separar esto? Igual que en Compras: solo cuando el troceo local deja UN trozo con varias palabras.
export function shouldAskAiToSplit(parts: string[]): boolean {
  return parts.length === 1 && parts[0].trim().split(/\s+/).length >= 3
}
