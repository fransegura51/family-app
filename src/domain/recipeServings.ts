// Raciones de una receta a partir de TEXTO de una fuente (ficha schema.org «recipeYield», plantilla de Wikibooks,
// texto de una petición). Estricto a propósito: solo se interpreta cuando el texto habla de raciones/personas.
//  - Número entero: «4 raciones», «Para 6 personas», «Rinde 8 porciones», «Serves 4» → 4.
//  - Rango: «6-7 personas», «6–7 personas», «6 - 7 personas», «6 a 7 personas», «entre 6 y 7 personas» → punto medio
//    (6,5). Se conserva el texto original como `servingsSource` (solo informativo; el cálculo usa el punto medio).
//  - Cualquier otra cosa («180-200 ºC», «20-30 minutos», «6-7 huevos», «1 molde», un número suelto) → null.
// Los valores válidos son enteros o medios puntos entre 1 y 50 (la misma regla que la base de datos).

const SERVINGS_UNIT = 'raciones?|porciones?|personas?|comensales?|servings?|portions?'
const SINGLE_RE = new RegExp(`^(?:(rinde|para|serves?|makes|yields?|sirve|sirven)\\s+)?(\\d{1,2})\\s*(${SERVINGS_UNIT}|serves?)?$`)
// Rango con unidad obligatoria (un rango sin palabra de raciones es ambiguo).
const RANGE_RE = new RegExp(`^(?:(rinde|para|serves?|makes|yields?|sirve|sirven|entre)\\s+)?(\\d{1,2})\\s*(-|a|y)\\s*(\\d{1,2})\\s*(${SERVINGS_UNIT})$`)
const SOURCE_MAX_LENGTH = 60

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Valor válido para raciones: entero o medio punto, entre 1 y 50 (igual que la restricción de la base de datos).
export function isValidServings(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 50 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9
}

export interface ServingsFromSource {
  servings: number // valor de cálculo: entero o medio punto
  servingsSource: string | null // texto original de la fuente; solo si era un rango
}

// null si no se puede determinar con seguridad. Un entero devuelve servingsSource null; un rango, su texto original.
export function servingsFromSource(text: string | null | undefined): ServingsFromSource | null {
  if (typeof text !== 'string') return null
  const original = text.trim().replace(/\s+/g, ' ')
  const normalized = stripAccents(original).toLowerCase().replace(/[–—]/g, '-')

  const range = RANGE_RE.exec(normalized)
  if (range) {
    const [, prefix, fromDigits, separator, toDigits] = range
    // «entre X y Y» solo con «y»; «X a Y» y «X-Y» sin «entre». Así «6 y 7 personas» sin «entre» no se interpreta.
    if (prefix === 'entre' ? separator !== 'y' : separator === 'y') return null
    const from = Number(fromDigits)
    const to = Number(toDigits)
    if (from < 1 || to > 50 || from >= to) return null
    const midpoint = (from + to) / 2
    return {
      servings: midpoint,
      servingsSource: original.length <= SOURCE_MAX_LENGTH ? original : null,
    }
  }

  const single = servingsFromText(text)
  return single === null ? null : { servings: single, servingsSource: null }
}

// Solo enteros con palabra de raciones (sin rangos). Se mantiene para los llamantes que solo aceptan un número.
export function servingsFromText(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null
  const normalized = stripAccents(text).trim().toLowerCase().replace(/\s+/g, ' ')
  const m = SINGLE_RE.exec(normalized)
  if (!m) return null
  const [, keyword, digits, unit] = m
  // Un número suelto no basta: «4» en una ficha puede ser «4 bizcochos». Hace falta palabra de raciones o de personas.
  if (!keyword && !unit) return null
  const n = Number(digits)
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null
}
