// Escalado ORIENTATIVO de una cantidad de receta a los comensales del evento.
// cantidad nueva = cantidad original × comensales objetivo / raciones originales
// Escala solo cuando: hay raciones válidas (> 0), la cantidad es numérica y la unidad es interpretable de forma
// segura (masa, volumen, unidades, cucharadas, cucharaditas). Nunca modifica la receta ni inventa cantidades.
// El valor se conserva SIN redondear: el formato solo afecta a cómo se muestra.

export type ScaleSkipReason = 'sin_raciones' | 'cantidad_no_numerica' | 'unidad_no_escalable'
// «fraccionario»: el resultado no es un número entero de unidades indivisibles (p. ej. 3 huevos × 2,5 = 7,5).
// No se redondea en silencio: se propone tal cual y se marca para revisar.
export type ScaleNote = ScaleSkipReason | 'fraccionario'

export interface ScaledQuantity {
  value: number | null // numérico exacto; null si la cantidad original no es numérica
  unit: string // unidad a mostrar (plural según el valor si se escaló; la original si no)
  scaled: boolean
  reason: ScaleSkipReason | null // null si se escaló
  fractional: boolean
}

export type UnitFamily = 'masa' | 'volumen' | 'conteo' | 'cucharada' | 'cucharadita'

export interface UnitInfo {
  family: UnitFamily
  label: string // forma base usada para agrupar y mostrar: g, kg, ml, cl, l, unidad, cucharada, cucharadita
  factor: number // a la unidad base de su familia de masa (g) o volumen (ml); 1 en el resto
}

// Nombres reales que maneja PEPA (texto libre de recetas): singular, plural y abreviaturas habituales.
const UNIT_TABLE: Record<string, UnitInfo> = {
  g: { family: 'masa', label: 'g', factor: 1 },
  gr: { family: 'masa', label: 'g', factor: 1 },
  kg: { family: 'masa', label: 'kg', factor: 1000 },
  ml: { family: 'volumen', label: 'ml', factor: 1 },
  cl: { family: 'volumen', label: 'cl', factor: 10 },
  l: { family: 'volumen', label: 'l', factor: 1000 },
  lt: { family: 'volumen', label: 'l', factor: 1000 },
  litro: { family: 'volumen', label: 'l', factor: 1000 },
  litros: { family: 'volumen', label: 'l', factor: 1000 },
  unidad: { family: 'conteo', label: 'unidad', factor: 1 },
  unidades: { family: 'conteo', label: 'unidad', factor: 1 },
  ud: { family: 'conteo', label: 'unidad', factor: 1 },
  uds: { family: 'conteo', label: 'unidad', factor: 1 },
  cucharada: { family: 'cucharada', label: 'cucharada', factor: 1 },
  cucharadas: { family: 'cucharada', label: 'cucharada', factor: 1 },
  cda: { family: 'cucharada', label: 'cucharada', factor: 1 },
  cdas: { family: 'cucharada', label: 'cucharada', factor: 1 },
  cucharadita: { family: 'cucharadita', label: 'cucharadita', factor: 1 },
  cucharaditas: { family: 'cucharadita', label: 'cucharadita', factor: 1 },
  cdta: { family: 'cucharadita', label: 'cucharadita', factor: 1 },
  cdtas: { family: 'cucharadita', label: 'cucharadita', factor: 1 },
}

// Unidad interpretable de forma segura, o null (pizca, «al gusto», vacía, desconocida…).
export function unitInfo(unit: string | null | undefined): UnitInfo | null {
  if (!unit) return null
  return UNIT_TABLE[unit.trim().toLowerCase()] ?? null
}

// Forma de mostrar una unidad para un valor: «unidad»/«unidades», «cucharada»/«cucharadas»…
export function displayUnit(info: UnitInfo, value: number): string {
  if (info.family === 'conteo') return value === 1 ? 'unidad' : 'unidades'
  if (info.family === 'cucharada') return value === 1 ? 'cucharada' : 'cucharadas'
  if (info.family === 'cucharadita') return value === 1 ? 'cucharadita' : 'cucharaditas'
  return info.label
}

// Solo números simples («250», «1,5», «0.5»). Fracciones, rangos («2-3») y textos («un puñado») no se escalan.
export function parseSimpleNumber(text: string | null): number | null {
  if (text === null) return null
  const t = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function scaleIngredientQuantity(
  quantity: string | null,
  unit: string | null,
  originalServings: number | null | undefined,
  targetDiners: number,
): ScaledQuantity {
  const value = parseSimpleNumber(quantity)
  const originalUnit = (unit ?? '').trim()
  if (!originalServings || originalServings <= 0 || targetDiners <= 0) {
    return { value, unit: originalUnit, scaled: false, reason: 'sin_raciones', fractional: false }
  }
  if (value === null) return { value: null, unit: originalUnit, scaled: false, reason: 'cantidad_no_numerica', fractional: false }
  const info = unitInfo(unit)
  if (!info) return { value, unit: originalUnit, scaled: false, reason: 'unidad_no_escalable', fractional: false }
  const scaled = (value * targetDiners) / originalServings
  // Solo el CONTEO es indivisible (huevos, patatas): ahí un decimal no es una cantidad comprable.
  // Masa, volumen, cucharadas y cucharaditas son medidas continuas: 2,5 cucharadas es válido, sin aviso.
  const fractional = info.family === 'conteo' && Math.abs(scaled - Math.round(scaled)) > 1e-9
  return { value: scaled, unit: displayUnit(info, scaled), scaled: true, reason: null, fractional }
}
