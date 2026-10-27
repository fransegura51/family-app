import { cleanAiText } from '../_shared/communityAi.ts'
import { asArray, asRecord, normKey } from './util.ts'
import type { Validation } from './attempt.ts'

// Limpieza y validación de fichas de recetas. Réplica en código de los validadores SQL (private.community_validate_menu_recipe de la migración 0270 y
// private.community_validate_post_recipes de la 0282) para rechazar ANTES de llegar a la base de datos y poder reintentar con una pista.
// La base de datos sigue siendo la que manda: vuelve a validar al crear el borrador.

export type RecipeMode = 'post' | 'menu'
export const MENU_SERVINGS = 4
export const POST_RECIPES_MAX = 6

export const RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    key: { type: 'STRING' },
    title: { type: 'STRING' },
    servings: { type: 'INTEGER', nullable: true },
    simple: { type: 'BOOLEAN', nullable: true },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, quantity: { type: 'STRING' }, unit: { type: 'STRING' } },
        required: ['name', 'quantity', 'unit'],
      },
    },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    tip: { type: 'STRING', nullable: true },
    time: { type: 'OBJECT', nullable: true, properties: { active: { type: 'INTEGER' }, total: { type: 'INTEGER' } } },
    freeze: { type: 'OBJECT', nullable: true, properties: { ideal: { type: 'BOOLEAN' }, note: { type: 'STRING', nullable: true } } },
    tags: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
  },
  required: ['title', 'ingredients', 'steps'],
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })

// Clave estable de una receta (minúsculas, números y guiones; hasta 40).
export function slugKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const k = normKey(value).replace(/ /g, '-').slice(0, 40).replace(/-+$/, '')
  return /^[a-z0-9][a-z0-9-]{0,39}$/.test(k) ? k : null
}

export function cleanRecipe(raw: unknown, mode: RecipeMode): Validation<Record<string, unknown>> {
  const r = asRecord(raw)
  if (!r) return fail('una receta no tiene el formato esperado')
  const title = cleanAiText(r.title, { min: 1, max: 120 })
  if (!title) return fail('una receta necesita un título limpio (1-120 letras, sin enlaces)')
  const label = `receta «${title.slice(0, 40)}»`

  let servings: number | null
  if (mode === 'menu') {
    // Las cantidades se escriben para 4 raciones: cualquier otro valor no cuadraría con el menú.
    if (r.servings === undefined || r.servings === null || r.servings === MENU_SERVINGS) servings = MENU_SERVINGS
    else return fail(`${label}: las raciones deben ser ${MENU_SERVINGS}`)
  } else if (r.servings === undefined || r.servings === null) {
    servings = null
  } else if (typeof r.servings === 'number' && Number.isInteger(r.servings) && r.servings >= 1 && r.servings <= 50) {
    servings = r.servings
  } else {
    return fail(`${label}: las raciones deben ser un entero de 1 a 50 o null`)
  }

  const ingsRaw = asArray(r.ingredients)
  if (ingsRaw.length < 1 || ingsRaw.length > 60) return fail(`${label}: de 1 a 60 ingredientes`)
  const ingredients: { name: string; quantity: string | number; unit: string }[] = []
  const seen = new Set<string>()
  for (const i of ingsRaw) {
    const ir = asRecord(i)
    if (!ir || typeof ir.name !== 'string') return fail(`${label}: un ingrediente no tiene el formato esperado`)
    // Sin comas en los nombres («pimiento, troceado» → «pimiento»): la coma rompe la lista de la compra.
    const name = cleanAiText(ir.name.split(',')[0], { min: 1, max: 120 })
    if (!name) return fail(`${label}: nombre de ingrediente no válido`)
    let quantity: string | number
    if (typeof ir.quantity === 'number' && Number.isFinite(ir.quantity) && ir.quantity >= 0) quantity = ir.quantity
    else if (typeof ir.quantity === 'string') {
      const q = ir.quantity.trim()
      if (q.length > 30 || /[<>]/.test(q)) return fail(`${label}: la cantidad de «${name.slice(0, 30)}» no es válida`)
      quantity = q
    } else return fail(`${label}: falta la cantidad de «${name.slice(0, 30)}»`)
    const unitRaw = ir.unit === undefined || ir.unit === null ? '' : ir.unit
    if (typeof unitRaw !== 'string' || unitRaw.trim().length > 30 || /[<>]/.test(unitRaw)) return fail(`${label}: la unidad de «${name.slice(0, 30)}» no es válida`)
    const k = normKey(name)
    if (seen.has(k)) return fail(`${label}: el ingrediente «${name.slice(0, 30)}» está repetido`)
    seen.add(k)
    ingredients.push({ name, quantity, unit: unitRaw.trim() })
  }

  const simple = mode === 'menu' && r.simple === true
  const stepsRaw = asArray(r.steps)
  if (!simple && stepsRaw.length < 1) return fail(`${label}: necesita al menos un paso`)
  if (stepsRaw.length > 30) return fail(`${label}: como máximo 30 pasos`)
  const steps: string[] = []
  for (const s of stepsRaw) {
    const st = cleanAiText(s, { min: 1, max: 1000 })
    if (!st) return fail(`${label}: un paso está vacío, es demasiado largo o lleva enlaces`)
    steps.push(st)
  }

  const out: Record<string, unknown> = {}
  if (mode === 'post') {
    const key = slugKey(r.key) ?? slugKey(title)
    if (!key) return fail(`${label}: no se pudo crear su clave`)
    out.key = key
  }
  out.title = title
  out.servings = servings
  out.ingredients = ingredients
  out.steps = steps
  if (simple) out.simple = true
  // Campos opcionales: si vienen mal formados se descartan (nunca se inventan).
  const tip = r.tip == null ? null : cleanAiText(r.tip, { min: 1, max: 400 })
  if (tip) out.tip = tip
  const time = asRecord(r.time)
  if (time && Number.isInteger(time.active) && Number.isInteger(time.total)) {
    const a = time.active as number
    const t = time.total as number
    if (a >= 1 && a <= 600 && t >= 1 && t <= 1440 && t >= a) out.time = { active: a, total: t }
  }
  const freeze = asRecord(r.freeze)
  if (freeze && typeof freeze.ideal === 'boolean') {
    const note = freeze.note == null ? null : cleanAiText(freeze.note, { min: 1, max: 300 })
    out.freeze = note ? { ideal: freeze.ideal, note } : { ideal: freeze.ideal }
  }
  if (Array.isArray(r.tags)) {
    const tags = r.tags.map((t) => cleanAiText(t, { min: 1, max: 40 })).filter((t): t is string => t !== null).slice(0, 12)
    if (tags.length > 0) out.tags = tags
  }
  return { ok: true, value: out }
}

// Fichas de recetas de un artículo: de 1 a 6, con claves distintas y sin «elementos sencillos».
export function cleanPostRecipes(raw: unknown): Validation<Record<string, unknown>[]> {
  const list = asArray(raw)
  if (list.length < 1 || list.length > POST_RECIPES_MAX) return fail(`las recetas deben ser de 1 a ${POST_RECIPES_MAX}`)
  const out: Record<string, unknown>[] = []
  const keys = new Set<string>()
  for (const item of list) {
    const c = cleanRecipe(item, 'post')
    if (!c.ok) return c
    const base = c.value.key as string
    let key = base
    // Si dos recetas salen con la misma clave se desambigua (sufijo numérico) en vez de descartar el trabajo.
    for (let n = 2; keys.has(key); n++) key = `${base.slice(0, 36)}-${n}`
    keys.add(key)
    out.push({ ...c.value, key })
  }
  return { ok: true, value: out }
}
