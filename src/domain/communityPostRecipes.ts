// Recetas estructuradas dentro de una publicación de cocina (migración 0282). Cada una se puede importar SOLA a «La cocina de Pepa» de la familia.
//
// Las recetas NO salen de analizar el texto libre (eso inventaría cantidades y pasos): las escribe la edición con los datos reales del texto y la base de datos las
// valida (private.community_validate_post_recipes). Aquí está el mismo contrato para leerlas con seguridad en la app y para la prueba/generador del contenido inicial.
// Cantidad desconocida = texto vacío y raciones desconocidas = null (nunca un número inventado).

export interface PostRecipeIngredient {
  name: string
  quantity: string
  unit: string
}

export interface PostRecipe {
  key: string
  title: string
  // null = el artículo NO dice para cuántas personas es (nunca se asume un número): se pregunta antes de escalar cantidades.
  servings: number | null
  ingredients: PostRecipeIngredient[]
  steps: string[]
  tags: string[]
  tip: string | null
}

const KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Mismo criterio que la base de datos. Devuelve el motivo (para quien edita) o null si las recetas son válidas.
export function validatePostRecipes(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) return 'las recetas deben ser una lista de 1 a 12'
  const keys = new Set<string>()
  for (const r of raw) {
    if (!isObject(r)) return 'una receta no tiene el formato esperado'
    if (typeof r.key !== 'string' || !KEY_RE.test(r.key)) return 'cada receta necesita una clave (minúsculas, números y guiones, hasta 40)'
    if (keys.has(r.key)) return `la clave «${r.key}» está repetida`
    keys.add(r.key)
    if (r.simple === true) return `la receta «${r.key}» no puede ser un elemento sencillo`
    const t = typeof r.title === 'string' ? r.title.trim() : ''
    if (t.length < 1 || t.length > 120) return 'una receta necesita título (de 1 a 120 letras)'
    const where = `receta «${t.slice(0, 60)}»: `
    // Raciones: un entero de 1 a 50 o SIN INDICAR (null o ausente) cuando el artículo no las dice.
    if (r.servings !== undefined && r.servings !== null && (typeof r.servings !== 'number' || !Number.isInteger(r.servings) || r.servings < 1 || r.servings > 50))
      return where + 'las raciones deben ser un número entero de 1 a 50 o quedar sin indicar'
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 1 || r.ingredients.length > 60) return where + 'debe tener de 1 a 60 ingredientes'
    const names = new Set<string>()
    for (const ing of r.ingredients) {
      if (!isObject(ing)) return where + 'un ingrediente no tiene el formato esperado'
      const n = typeof ing.name === 'string' ? ing.name.trim() : ''
      if (n.length < 1 || n.length > 120) return where + 'cada ingrediente necesita nombre (hasta 120 letras)'
      if ((typeof ing.quantity !== 'string' && typeof ing.quantity !== 'number') || String(ing.quantity).length > 30) return where + `la cantidad de «${n.slice(0, 40)}» no es válida (hasta 30 caracteres)`
      if (typeof ing.unit !== 'string' || ing.unit.length > 30) return where + `la unidad de «${n.slice(0, 40)}» no es válida (hasta 30 caracteres)`
      const k = norm(n)
      if (names.has(k)) return where + `el ingrediente «${n.slice(0, 40)}» está repetido`
      names.add(k)
    }
    if (!Array.isArray(r.steps) || r.steps.length < 1 || r.steps.length > 30) return where + 'debe tener de 1 a 30 pasos'
    for (const st of r.steps) {
      if (typeof st !== 'string' || st.trim() === '' || st.length > 1000) return where + 'cada paso debe tener texto (hasta 1000 caracteres)'
    }
    if (r.tip !== undefined && r.tip !== null && (typeof r.tip !== 'string' || r.tip.trim().length < 1 || r.tip.trim().length > 400)) return where + 'el truco debe ser un texto de 1 a 400 caracteres'
    if (r.tags !== undefined && r.tags !== null) {
      if (!Array.isArray(r.tags) || r.tags.length > 12) return where + 'como máximo 12 etiquetas'
      for (const tg of r.tags) {
        if (typeof tg !== 'string' || tg.trim().length < 1 || tg.trim().length > 40) return where + 'cada etiqueta debe tener de 1 a 40 caracteres'
      }
    }
  }
  return null
}

// Lo que devuelve el detalle de la publicación (`variants`): solo se usa lo que pasa la validación; algo dañado o ausente = sin recetas (nunca recetas a medias).
export function parsePostRecipes(raw: unknown): PostRecipe[] {
  if (raw === null || raw === undefined || validatePostRecipes(raw) !== null) return []
  return (raw as Record<string, unknown>[]).map((r) => ({
    key: r.key as string,
    title: (r.title as string).trim(),
    servings: typeof r.servings === 'number' ? r.servings : null,
    ingredients: (r.ingredients as Record<string, unknown>[]).map((i) => ({ name: (i.name as string).trim(), quantity: String(i.quantity ?? ''), unit: String(i.unit ?? '') })),
    steps: (r.steps as string[]).map((s) => s.trim()),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    tip: typeof r.tip === 'string' && r.tip.trim() !== '' ? r.tip.trim() : null,
  }))
}

// «250-300 g arroz blanco», «huevo» (sin cantidad: no se inventa).
export function ingredientLine(i: PostRecipeIngredient): string {
  const amount = [i.quantity.trim(), i.unit.trim()].filter(Boolean).join(' ')
  return amount ? `${amount} ${i.name}` : i.name
}

// Selección múltiple: añadir o quitar una receta de la lista a importar.
export function toggleKey(selected: readonly string[], key: string): string[] {
  return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
}

// Claves en el orden en que están en la publicación (el servidor también importa en ese orden).
export function orderedKeys(recipes: readonly PostRecipe[], selected: readonly string[]): string[] {
  return recipes.map((r) => r.key).filter((k) => selected.includes(k))
}

// ---- Importación («Importar a mi Cocina»): resultado y errores propios (además de los de Comunidad)
export interface PostRecipeImportResult {
  ok: boolean
  // true = ya se había hecho con esta misma clave: no se ha creado nada otra vez.
  replayed: boolean
  postId: string
  recipes: { id: string; key: string; title: string; created: boolean; servingsKnown?: boolean }[]
  recipesCreated: number
  recipesReused: number
}

export type PostRecipeErrorCode = 'BAD_KEY' | 'KEY_REUSED' | 'BAD_DUPLICATES' | 'NO_FAMILY' | 'RECIPES_INVALID'
export const POST_RECIPE_ERROR_MESSAGES: Record<PostRecipeErrorCode, string> = {
  BAD_KEY: 'No se ha podido preparar la importación. Vuelve a intentarlo.',
  KEY_REUSED: 'Esta importación ya se había enviado con otras opciones. Vuelve a elegir las recetas.',
  BAD_DUPLICATES: 'No se ha entendido qué hacer con las recetas que ya tienes. Vuelve a intentarlo.',
  NO_FAMILY: 'Tu cuenta no tiene una familia en PEPA, así que no hay Cocina donde guardar la receta.',
  RECIPES_INVALID: 'Las recetas de esta publicación tienen algún dato incorrecto.',
}
const POST_RECIPE_ERROR_KEYS = Object.keys(POST_RECIPE_ERROR_MESSAGES) as PostRecipeErrorCode[]

export function postRecipeErrorCode(error: unknown): PostRecipeErrorCode | null {
  const raw = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : String(error ?? '')
  return POST_RECIPE_ERROR_KEYS.find((k) => new RegExp(`\\b${k}\\b`).test(raw)) ?? null
}

// «4 raciones», «1 ración» o «Raciones: sin indicar en el artículo».
export function servingsText(servings: number | null): string {
  if (servings === null) return 'raciones sin indicar'
  return servings === 1 ? '1 ración' : `${servings} raciones`
}

// Recetas importadas que no traen raciones (hay que indicarlas antes de escalar cantidades).
export function recipesWithoutServings(r: PostRecipeImportResult): string[] {
  return r.recipes.filter((x) => x.servingsKnown === false).map((x) => x.title)
}

// Resumen en claro de lo hecho (sin tecnicismos).
export function importResultSummary(r: PostRecipeImportResult): string {
  const created = r.recipesCreated
  const reused = r.recipesReused
  const parts: string[] = []
  if (created > 0) parts.push(created === 1 ? '1 receta nueva guardada' : `${created} recetas nuevas guardadas`)
  if (reused > 0) parts.push(reused === 1 ? '1 receta que ya tenías (no se ha duplicado)' : `${reused} recetas que ya tenías (no se han duplicado)`)
  return parts.join(' · ') || 'No había nada que guardar.'
}
