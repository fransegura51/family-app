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

// «conteo» son unidades enteras (huevos, patatas, lechugas…). Las piezas con nombre propio (lonchas, rebanadas, dientes, hojas, rodajas, lomos, muslos, filetes) son familias
// APARTE: 4 lonchas no se suman con 4 unidades. «pizca» es una cantidad de condimento: no se escala ni se suma (en la compra queda «al gusto»).
export type UnitFamily = 'masa' | 'volumen' | 'conteo' | 'cucharada' | 'cucharadita' | 'loncha' | 'rebanada' | 'diente' | 'hoja' | 'rodaja' | 'lomo' | 'muslo' | 'filete' | 'pizca'

// Familias de piezas indivisibles: una cantidad con decimales no se puede comprar tal cual (hay que redondear hacia arriba).
const COUNT_FAMILIES: readonly UnitFamily[] = ['conteo', 'loncha', 'rebanada', 'diente', 'hoja', 'rodaja', 'lomo', 'muslo', 'filete']
export function isCountFamily(family: UnitFamily): boolean {
  return COUNT_FAMILIES.includes(family)
}

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
  loncha: { family: 'loncha', label: 'loncha', factor: 1 },
  lonchas: { family: 'loncha', label: 'loncha', factor: 1 },
  rebanada: { family: 'rebanada', label: 'rebanada', factor: 1 },
  rebanadas: { family: 'rebanada', label: 'rebanada', factor: 1 },
  diente: { family: 'diente', label: 'diente', factor: 1 },
  dientes: { family: 'diente', label: 'diente', factor: 1 },
  hoja: { family: 'hoja', label: 'hoja', factor: 1 },
  hojas: { family: 'hoja', label: 'hoja', factor: 1 },
  rodaja: { family: 'rodaja', label: 'rodaja', factor: 1 },
  rodajas: { family: 'rodaja', label: 'rodaja', factor: 1 },
  lomo: { family: 'lomo', label: 'lomo', factor: 1 },
  lomos: { family: 'lomo', label: 'lomo', factor: 1 },
  muslo: { family: 'muslo', label: 'muslo', factor: 1 },
  muslos: { family: 'muslo', label: 'muslo', factor: 1 },
  filete: { family: 'filete', label: 'filete', factor: 1 },
  filetes: { family: 'filete', label: 'filete', factor: 1 },
  huevo: { family: 'conteo', label: 'unidad', factor: 1 },
  huevos: { family: 'conteo', label: 'unidad', factor: 1 },
  pizca: { family: 'pizca', label: 'pizca', factor: 1 },
  pizcas: { family: 'pizca', label: 'pizca', factor: 1 },
}

// Texto de una unidad listo para buscarla en la tabla: minúsculas, sin punto final de abreviatura y sin el complemento («dientes de ajo» → «dientes», «lonchas de queso»
// → «lonchas»). Una unidad que no está en la tabla sigue sin interpretarse.
function normalizeUnit(unit: string): string {
  const t = unit.trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ')
  if (UNIT_TABLE[t]) return t
  return t.split(' de ')[0]?.trim() ?? t
}

// Unidad interpretable de forma segura, o null (pizca, «al gusto», vacía, desconocida…).
export function unitInfo(unit: string | null | undefined): UnitInfo | null {
  if (!unit) return null
  return UNIT_TABLE[normalizeUnit(unit)] ?? null
}

// Forma de mostrar una unidad para un valor: «unidad»/«unidades», «cucharada»/«cucharadas»…
export function displayUnit(info: UnitInfo, value: number): string {
  if (info.family === 'conteo') return value === 1 ? 'unidad' : 'unidades'
  if (info.family === 'masa' || info.family === 'volumen') return info.label
  // Piezas, cucharadas, cucharaditas, pizcas: singular con 1 y plural con el resto («lonchas», «dientes», «pizcas»).
  return value === 1 ? info.label : info.label + 's'
}

// Cantidad que se COMPRA a partir de la cantidad de cocina: las piezas indivisibles se redondean hacia arriba (1,5 lechugas → 2), el resto se deja tal cual. La receta no se toca:
// esto solo es lo práctico para la lista de la compra.
export function purchaseValue(value: number, info: UnitInfo): number {
  return isCountFamily(info.family) ? Math.ceil(value - 1e-9) : value
}

const VULGAR: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }

// Números simples («250», «1,5», «0.5») y fracciones habituales («1/2», «1 1/2», «½», «1½»). Rangos («2-3») y textos («un puñado») no se escalan.
export function parseSimpleNumber(text: string | null): number | null {
  if (text === null) return null
  const t = text.trim().replace(',', '.')
  let n: number
  const plain = /^\d+(\.\d+)?$/.exec(t)
  const frac = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(t)
  const vulgar = /^(\d+)?\s*([½¼¾⅓⅔])$/.exec(t)
  if (plain) n = Number(t)
  else if (frac) {
    const den = Number(frac[3])
    if (den <= 0) return null
    n = Number(frac[1] ?? 0) + Number(frac[2]) / den
  } else if (vulgar) n = Number(vulgar[1] ?? 0) + VULGAR[vulgar[2]]
  else return null
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
  // Cantidad numérica SIN unidad («2» huevos, «1» lechuga): son unidades enteras.
  const info = originalUnit === '' ? unitInfo('unidad') : unitInfo(unit)
  if (!info) return { value, unit: originalUnit, scaled: false, reason: 'unidad_no_escalable', fractional: false }
  // Una pizca es un toque de condimento: no se multiplica con los comensales.
  if (info.family === 'pizca') return { value, unit: originalUnit, scaled: false, reason: 'unidad_no_escalable', fractional: false }
  const scaled = (value * targetDiners) / originalServings
  // Las piezas indivisibles (huevos, lonchas, dientes…) no se compran con decimales: se marca como fraccionario. Masa, volumen, cucharadas y cucharaditas son medidas
  // continuas: 2,5 cucharadas es válido, sin aviso.
  const fractional = isCountFamily(info.family) && Math.abs(scaled - Math.round(scaled)) > 1e-9
  return { value: scaled, unit: originalUnit === '' ? '' : displayUnit(info, scaled), scaled: true, reason: null, fractional }
}
