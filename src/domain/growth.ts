import { WHO_HEAD_FOR_AGE, WHO_LENGTH_FOR_AGE, WHO_WEIGHT_FOR_AGE, type LmsRow, type LmsTable } from '@/domain/whoGrowthData'
import type { MemberSex } from '@/domain/types'

// Percentiles de crecimiento de bebés y niños pequeños con los patrones de
// la OMS (0 a 60 meses). Método LMS: para una edad, la OMS da tres números
// (L, M, S) y de ellos salen todas las curvas y el percentil exacto de una
// medida. Orientativo — nunca sustituye a la valoración del pediatra.

export type { MemberSex }
export type GrowthMeasure = 'weight' | 'length' | 'head'

export const MAX_GROWTH_MONTHS = 60

// La altura se guarda siempre en centímetros. Si alguien escribe 1,12 (metros)
// se entiende como 112 cm; lo que no tiene sentido como altura (p. ej. 5 o 900)
// devuelve null para poder avisar en vez de guardar un dato que descuadra el medidor.
export function normalizeHeightCm(value: number): number | null {
  if (!Number.isFinite(value)) return null
  if (value >= 0.3 && value <= 2.6) return Math.round(value * 1000) / 10
  if (value >= 30 && value <= 250) return value
  return null
}

// Tipo de ficha que se muestra: un "Bebé" pasa solo a "Niño/a" cuando cumple la
// edad configurada en la familia (por defecto 2 años).
export function effectiveMemberType<T extends string>(memberType: T | 'baby' | 'child', birthDate: string | null, babyUntilMonths: number, today: string): T | 'baby' | 'child' {
  if (memberType !== 'baby' || !birthDate) return memberType
  return ageInMonths(birthDate, today) >= babyUntilMonths ? 'child' : 'baby'
}

const TABLES: Record<GrowthMeasure, LmsTable> = {
  weight: WHO_WEIGHT_FOR_AGE,
  length: WHO_LENGTH_FOR_AGE,
  head: WHO_HEAD_FOR_AGE,
}

export const GROWTH_MEASURE_LABEL: Record<GrowthMeasure, { name: string; unit: string }> = {
  weight: { name: 'Peso', unit: 'kg' },
  length: { name: 'Altura', unit: 'cm' },
  head: { name: 'Perímetro cefálico', unit: 'cm' },
}

// Edad en meses (con decimales) en una fecha, a partir de la fecha de nacimiento.
export function ageInMonths(birthDate: string, onDate: string): number {
  const b = new Date(birthDate + 'T00:00:00Z').getTime()
  const d = new Date(onDate + 'T00:00:00Z').getTime()
  return Math.max(0, (d - b) / 86400000 / 30.4375)
}

function rowsFor(measure: GrowthMeasure, sex: MemberSex): readonly LmsRow[] {
  return TABLES[measure][sex === 'male' ? 'm' : 'f']
}

// L, M y S para una edad, interpolando entre los dos meses vecinos.
export function lmsAt(measure: GrowthMeasure, sex: MemberSex, months: number): { l: number; m: number; s: number } | null {
  const rows = rowsFor(measure, sex)
  if (months < 0 || months > MAX_GROWTH_MONTHS) return null
  const lo = Math.min(Math.floor(months), rows.length - 2)
  const a = rows[lo]
  const b = rows[lo + 1]
  const t = months - a[0]
  return { l: a[1] + (b[1] - a[1]) * t, m: a[2] + (b[2] - a[2]) * t, s: a[3] + (b[3] - a[3]) * t }
}

// Función de distribución de la normal estándar (aprox. de Abramowitz-Stegun, error < 1e-7).
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

export function zScore(measure: GrowthMeasure, sex: MemberSex, months: number, value: number): number | null {
  const p = lmsAt(measure, sex, months)
  if (!p || value <= 0) return null
  return p.l === 0 ? Math.log(value / p.m) / p.s : (Math.pow(value / p.m, p.l) - 1) / (p.l * p.s)
}

// Percentil (0-100) de una medida a una edad.
export function percentileFor(measure: GrowthMeasure, sex: MemberSex, months: number, value: number): number | null {
  const z = zScore(measure, sex, months, value)
  return z == null ? null : normalCdf(z) * 100
}

// Valor de la curva de un percentil concreto (p. ej. 50 = la media) a una edad.
export function valueAtZ(measure: GrowthMeasure, sex: MemberSex, months: number, z: number): number | null {
  const p = lmsAt(measure, sex, months)
  if (!p) return null
  return p.l === 0 ? p.m * Math.exp(p.s * z) : p.m * Math.pow(1 + p.l * p.s * z, 1 / p.l)
}

// z-scores de los percentiles que se dibujan (los habituales en las curvas pediátricas).
export const CURVE_PERCENTILES: { percentile: number; z: number }[] = [
  { percentile: 3, z: -1.8808 },
  { percentile: 15, z: -1.0364 },
  { percentile: 50, z: 0 },
  { percentile: 85, z: 1.0364 },
  { percentile: 97, z: 1.8808 },
]

export function curvePoints(measure: GrowthMeasure, sex: MemberSex, z: number, fromMonth: number, toMonth: number): { month: number; value: number }[] {
  const out: { month: number; value: number }[] = []
  for (let m = Math.max(0, Math.floor(fromMonth)); m <= Math.min(MAX_GROWTH_MONTHS, Math.ceil(toMonth)); m++) {
    const v = valueAtZ(measure, sex, m, z)
    if (v != null) out.push({ month: m, value: v })
  }
  return out
}

export type PercentileBand = 'muy-bajo' | 'bajo' | 'normal' | 'alto' | 'muy-alto'

export function percentileBand(percentile: number): { band: PercentileBand; label: string; text: string } {
  if (percentile < 3) return { band: 'muy-bajo', label: 'Muy por debajo', text: 'Por debajo del percentil 3: conviene comentarlo con el pediatra.' }
  if (percentile < 15) return { band: 'bajo', label: 'Por debajo de la media', text: 'Entre los percentiles 3 y 15: por debajo de la media, dentro de lo habitual.' }
  if (percentile <= 85) return { band: 'normal', label: 'En la media', text: 'Entre los percentiles 15 y 85: dentro de la media.' }
  if (percentile <= 97) return { band: 'alto', label: 'Por encima de la media', text: 'Entre los percentiles 85 y 97: por encima de la media, dentro de lo habitual.' }
  return { band: 'muy-alto', label: 'Muy por encima', text: 'Por encima del percentil 97: conviene comentarlo con el pediatra.' }
}

export function formatPercentile(p: number): string {
  if (p < 1) return '<1'
  if (p > 99) return '>99'
  return String(Math.round(p))
}
