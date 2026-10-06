// Raciones de una receta a partir de TEXTO de una fuente (ficha schema.org «recipeYield», plantilla de Wikibooks,
// texto de una petición). Estricto a propósito: solo acepta un número entero con una palabra que lo identifique
// como raciones/personas («4 raciones», «Para 6 personas», «Rinde 8 porciones», «Serves 4»). Cualquier otra cosa
// (rangos, «1 molde», «12 galletas», un número suelto) devuelve null: nunca se adivina ni se asume.

const SERVINGS_RE =
  /^(?:(rinde|para|serves?|makes|yields?|sirve|sirven)\s+)?(\d{1,2})\s*(raciones?|porciones?|personas?|comensales?|servings?|portions?|serves?)?$/

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// null si no se puede determinar con seguridad; si hay un número válido (1–50) con palabra de raciones, ese número.
export function servingsFromText(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null
  const normalized = stripAccents(text).trim().toLowerCase().replace(/\s+/g, ' ')
  const m = SERVINGS_RE.exec(normalized)
  if (!m) return null
  const [, keyword, digits, unit] = m
  // Un número suelto no basta: «4» en una ficha puede ser «4 bizcochos». Hace falta palabra de raciones o de personas.
  if (!keyword && !unit) return null
  const n = Number(digits)
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null
}
