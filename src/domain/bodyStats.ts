// Cálculos de la vista de adultos de Peso y medidas (IMC, cambios, rangos de fechas).

export type BmiBand = 'bajo' | 'normal' | 'sobrepeso' | 'obesidad'

export function bmi(weightKg: number, heightCm: number): number | null {
  if (weightKg <= 0 || heightCm < 100 || heightCm > 250) return null
  const m = heightCm / 100
  return weightKg / (m * m)
}

// Clasificación de la OMS para adultos — orientativa.
export function bmiBand(value: number): { band: BmiBand; label: string } {
  if (value < 18.5) return { band: 'bajo', label: 'Bajo peso' }
  if (value < 25) return { band: 'normal', label: 'Peso normal' }
  if (value < 30) return { band: 'sobrepeso', label: 'Sobrepeso' }
  return { band: 'obesidad', label: 'Obesidad' }
}

export type RangeKey = '1M' | '3M' | '6M' | '1A' | 'Todo'

export const RANGE_DAYS: Record<RangeKey, number | null> = { '1M': 30, '3M': 91, '6M': 182, '1A': 365, Todo: null }

export interface DatedValue {
  date: string
  value: number
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000)
}

export function filterRange<T extends { date: string }>(points: T[], range: RangeKey, today: string): T[] {
  const days = RANGE_DAYS[range]
  if (days == null) return points
  return points.filter((p) => daysBetween(p.date, today) <= days)
}

// Cambio entre la última medida y la de hace ~N días (la más cercana anterior a ese momento; si no hay ninguna tan antigua, la primera).
export function changeOverDays(points: DatedValue[], days: number): { delta: number; since: string } | null {
  if (points.length < 2) return null
  const latest = points[points.length - 1]
  const older = points.slice(0, -1)
  const candidates = older.filter((p) => daysBetween(p.date, latest.date) >= days)
  const ref = candidates.length > 0 ? candidates[candidates.length - 1] : older[0]
  return { delta: latest.value - ref.value, since: ref.date }
}

// Progreso hacia un objetivo: 0 = punto de partida (primera medida), 1 = objetivo alcanzado.
export function goalProgress(first: number, current: number, goal: number): number {
  if (first === goal) return current === goal ? 1 : 0
  const p = (first - current) / (first - goal)
  return Math.max(0, Math.min(1, p))
}
