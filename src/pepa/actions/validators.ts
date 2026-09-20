// Comprobaciones estrictas comunes a todas las acciones.

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

// YYYY-MM-DD que existe de verdad ("2026-02-31" se rechaza).
export function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// Rechaza cualquier campo que la acción no espera: una propuesta no puede
// llevar "de contrabando" nada más que lo declarado.
export function unknownKeys(record: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(record).filter((k) => !allowed.includes(k))
}

export function isUniqueStringArray(value: unknown, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxLength && value.every((v) => typeof v === 'string') && new Set(value).size === value.length
}
