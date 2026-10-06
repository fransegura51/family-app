// Escalado ORIENTATIVO de una cantidad de receta a los comensales del evento (2.ª tanda de Menú del evento).
// cantidad nueva = cantidad original × comensales objetivo / raciones originales
// Solo escala cuando: hay raciones conocidas, la cantidad es numérica y la unidad es de masa o volumen.
// Nunca modifica la receta ni inventa cantidades: lo que no se puede escalar se devuelve tal cual, marcado.

export type ScaleSkipReason = 'sin_raciones' | 'cantidad_no_numerica' | 'unidad_no_escalable'

export interface ScaledQuantity {
  quantity: string | null // texto para mostrar
  scaled: boolean
  reason: ScaleSkipReason | null // null si se escaló
}

const SCALABLE_UNITS = new Set(['g', 'gr', 'kg', 'ml', 'cl', 'l', 'lt', 'litro', 'litros'])

// Solo números simples («250», «1,5», «0.5»). Fracciones, rangos («2-3») y textos («un puñado») no se escalan.
export function parseSimpleNumber(text: string | null): number | null {
  if (text === null) return null
  const t = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

function formatNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return String(rounded).replace('.', ',')
}

export function scaleIngredientQuantity(
  quantity: string | null,
  unit: string | null,
  originalServings: number | null | undefined,
  targetDiners: number,
): ScaledQuantity {
  if (!originalServings || originalServings <= 0 || targetDiners <= 0) return { quantity, scaled: false, reason: 'sin_raciones' }
  const value = parseSimpleNumber(quantity)
  if (value === null) return { quantity, scaled: false, reason: 'cantidad_no_numerica' }
  const u = (unit ?? '').trim().toLowerCase()
  if (!SCALABLE_UNITS.has(u)) return { quantity, scaled: false, reason: 'unidad_no_escalable' }
  const scaled = (value * targetDiners) / originalServings
  return { quantity: `${formatNumber(scaled)}${unit ? ` ${unit.trim()}` : ''}`, scaled: true, reason: null }
}
