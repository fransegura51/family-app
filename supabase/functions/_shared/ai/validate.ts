// Validación estricta de lo que devuelve un modelo de IA. Código puro (sin
// APIs de Deno), para poder probarlo con los tests normales del proyecto.

// El modelo a veces envuelve el JSON en ```json ... ```; se quita y se
// intenta leer. Devuelve null si no es JSON válido.
export function parseJsonLoose(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return null
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

// Fecha YYYY-MM-DD que además existe de verdad en el calendario
// ("2026-02-31" se rechaza).
export function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : null
}

// Texto recortado; null si no es texto o queda vacío. `maxLen` evita que
// una respuesta desmesurada acabe en la app.
export function asCleanString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLen) : null
}

export function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}
