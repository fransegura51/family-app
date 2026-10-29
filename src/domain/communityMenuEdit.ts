// Editor del MENÚ SEMANAL OFICIAL (Centro de Mando de Comunidad): operaciones PURAS sobre el JSON del menú (payload.menu) y reglas de validación y de comprobación editorial.
// Código sin red ni React. La fuente de verdad es el JSON tal cual lo guarda el servidor: cada operación devuelve una copia nueva que solo cambia lo tocado
// (lo demás conserva su referencia y, por tanto, queda idéntico byte a byte). Las reglas de validación reflejan las del servidor
// (private.community_validate_menu / community_validate_menu_recipe, migración 0270): el servidor las vuelve a comprobar al guardar, aquí se enseñan antes.
// Esto edita SOLO el contenido del menú oficial: nunca toca recetas de la Cocina ni de otras familias.

export type Rec = Record<string, unknown>
export type MenuMealKey = 'comida' | 'cena'
export const EDIT_MEALS: { key: MenuMealKey; label: string }[] = [
  { key: 'comida', label: 'Comida' },
  { key: 'cena', label: 'Cena' },
]
export const EDIT_DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const
export const EDIT_DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
export const MAX_RECIPES_PER_MEAL = 6

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

// Mismo criterio que private.community_menu_text_key: sin tildes, minúsculas y solo letras o cifras separadas por un espacio.
export function textKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// ---- Lectura del menú ---------------------------------------------------------------------------------------------------------------------------
export interface EditableMenuItem {
  id: string
  title: string
  body: string
  version: number
  /** 'proposed' (borrador) o 'approved' (aprobado/programado). Editar un menú aprobado lo devuelve a «pendiente de aprobar». */
  status: 'proposed' | 'approved'
  /** Contenido completo del elemento (schedule, source…): se manda ENTERO al guardar, con solo `menu` cambiado. */
  payload: Rec
  menu: Rec
}

// Una fila de `adminListProposals` → el menú editable. null si no es un menú editable (otro tipo, ya publicado o sin 7 días).
export function toEditableMenuItem(row: unknown): EditableMenuItem | null {
  if (!isRec(row) || row.kind !== 'menu') return null
  const status = row.status === 'approved' ? 'approved' : row.status === 'proposed' ? 'proposed' : null
  const payload = isRec(row.payload) ? row.payload : null
  if (!status || !payload || str(row.id) === '' || row.published_post_id) return null
  const menu = isRec(payload.menu) ? payload.menu : null
  if (!menu || arr(menu.days).length !== 7) return null
  return { id: str(row.id), title: str(row.title), body: str(row.body), version: typeof row.version === 'number' ? row.version : 1, status, payload, menu }
}

export function mealOf(menu: Rec, day: number, meal: MenuMealKey): Rec | null {
  const d = arr(menu.days)[day]
  const meals = isRec(d) && isRec(d.meals) ? d.meals : null
  const m = meals?.[meal]
  return isRec(m) ? m : null
}

export function recipesOf(menu: Rec, day: number, meal: MenuMealKey): Rec[] {
  return arr(mealOf(menu, day, meal)?.recipes).filter(isRec)
}

// ---- Operaciones (inmutables) -----------------------------------------------------------------------------------------------------------------
function withMeal(menu: Rec, day: number, meal: MenuMealKey, change: (m: Rec) => Rec): Rec {
  const days = arr(menu.days)
  const d = days[day]
  if (!isRec(d) || !isRec(d.meals) || !isRec(d.meals[meal])) return menu
  const nextMeal = change(d.meals[meal] as Rec)
  if (nextMeal === d.meals[meal]) return menu
  const nextDay: Rec = { ...d, meals: { ...d.meals, [meal]: nextMeal } }
  return { ...menu, days: days.map((x, i) => (i === day ? nextDay : x)) }
}

export function setMealFields(menu: Rec, day: number, meal: MenuMealKey, fields: { title?: string; side?: string }): Rec {
  return withMeal(menu, day, meal, (m) => {
    const next: Rec = { ...m }
    if (fields.title !== undefined) next.title = fields.title
    if (fields.side !== undefined) {
      // El acompañamiento es opcional: vacío = se quita la clave (el servidor acepta su ausencia).
      if (fields.side.trim() === '') delete next.side
      else next.side = fields.side
    }
    return next
  })
}

export function replaceRecipe(menu: Rec, day: number, meal: MenuMealKey, index: number, recipe: Rec): Rec {
  return withMeal(menu, day, meal, (m) => ({ ...m, recipes: arr(m.recipes).map((r, i) => (i === index ? recipe : r)) }))
}

export function addRecipe(menu: Rec, day: number, meal: MenuMealKey, recipe: Rec): Rec {
  return withMeal(menu, day, meal, (m) => (arr(m.recipes).length >= MAX_RECIPES_PER_MEAL ? m : { ...m, recipes: [...arr(m.recipes), recipe] }))
}

// Una comida necesita al menos una receta (el servidor lo exige): quitar la única no hace nada; se sustituye en su lugar.
export function removeRecipe(menu: Rec, day: number, meal: MenuMealKey, index: number): Rec {
  return withMeal(menu, day, meal, (m) => (arr(m.recipes).length <= 1 ? m : { ...m, recipes: arr(m.recipes).filter((_, i) => i !== index) }))
}

export function moveRecipe(menu: Rec, day: number, meal: MenuMealKey, index: number, direction: -1 | 1): Rec {
  return withMeal(menu, day, meal, (m) => {
    const list = [...arr(m.recipes)]
    const to = index + direction
    if (index < 0 || index >= list.length || to < 0 || to >= list.length) return m
    ;[list[index], list[to]] = [list[to], list[index]]
    return { ...m, recipes: list }
  })
}

// Contenido completo para guardar: todo lo que ya tenía el elemento (programación, fuente…) y solo `menu` cambiado.
export function buildMenuPayload(original: Rec, menu: Rec): Rec {
  return { ...original, menu }
}

export function menuChanged(original: Rec, current: Rec): boolean {
  return JSON.stringify(original) !== JSON.stringify(current)
}

// Títulos de plato que han cambiado: el texto de la publicación NO se regenera, hay que avisar para que se revise.
export function changedMealTitles(original: Rec, current: Rec): string[] {
  const out: string[] = []
  for (let d = 0; d < 7; d++) {
    for (const { key } of EDIT_MEALS) {
      const a = str(mealOf(original, d, key)?.title)
      const b = str(mealOf(current, d, key)?.title)
      if (a !== b) out.push(`${EDIT_DAYS[d]} (${key}): «${a}» → «${b}»`)
    }
  }
  return out
}

// ---- Formulario de UNA receta ---------------------------------------------------------------------------------------------------------------
export interface RecipeFormIngredient {
  name: string
  quantity: string
  unit: string
}
export interface RecipeForm {
  title: string
  servings: number | null
  ingredients: RecipeFormIngredient[]
  steps: string[]
  tags: string[]
  tip: string
  /** Minutos como texto (se escriben en un campo): vacío = sin tiempos. */
  activeMin: string
  totalMin: string
  freezeIdeal: boolean
  freezeNote: string
  /** Elemento sencillo (una pieza de fruta, pan tostado…): sin pasos, no es una receta de Cocina. */
  simple: boolean
}

export function emptyRecipeForm(servings: number | null, simple = false): RecipeForm {
  return { title: '', servings, ingredients: [{ name: '', quantity: '', unit: '' }], steps: [], tags: [], tip: '', activeMin: '', totalMin: '', freezeIdeal: false, freezeNote: '', simple }
}

export function recipeToForm(r: Rec): RecipeForm {
  const time = isRec(r.time) ? r.time : null
  const freeze = isRec(r.freeze) ? r.freeze : null
  return {
    title: str(r.title),
    servings: typeof r.servings === 'number' ? r.servings : null,
    ingredients: arr(r.ingredients)
      .filter(isRec)
      .map((i) => ({ name: str(i.name), quantity: str(i.quantity), unit: str(i.unit) })),
    steps: arr(r.steps).map(str),
    tags: arr(r.tags).map(str),
    tip: str(r.tip),
    activeMin: time && typeof time.active === 'number' ? String(time.active) : '',
    totalMin: time && typeof time.total === 'number' ? String(time.total) : '',
    freezeIdeal: freeze?.ideal === true,
    freezeNote: freeze ? str(freeze.note) : '',
    simple: r.simple === true,
  }
}

// Formulario → receta. Se parte de la receta ORIGINAL y solo se cambian los campos del formulario: lo que el formulario no muestra se conserva tal cual.
export function formToRecipe(original: Rec | null, f: RecipeForm): Rec {
  const base: Rec = { ...(original ?? {}) }
  const out: Rec = {
    ...base,
    title: f.title.trim(),
    servings: f.servings,
    ingredients: f.ingredients.map((i) => ({ name: i.name.trim(), quantity: i.quantity.trim(), unit: i.unit.trim() })),
    steps: f.steps.map((s) => s.trim()).filter(Boolean),
  }
  if (f.simple) out.simple = true
  else delete out.simple
  const tip = f.tip.trim()
  if (tip) out.tip = tip
  else delete out.tip
  if (f.tags.length > 0) out.tags = f.tags
  else delete out.tags
  const a = f.activeMin.trim()
  const t = f.totalMin.trim()
  if (a === '' && t === '') delete out.time
  else out.time = { active: a === '' ? Number.NaN : Number(a), total: t === '' ? Number.NaN : Number(t) }
  const note = f.freezeNote.trim()
  if (f.freezeIdeal) out.freeze = note ? { ideal: true, note } : { ideal: true }
  else if (note) out.freeze = { ideal: false, note }
  else if (isRec(base.freeze) && base.freeze.ideal === false && !str(base.freeze.note)) out.freeze = base.freeze
  else delete out.freeze
  return out
}

// Receta nueva (o elemento sencillo) lista para editar: la clave solo la usa el editor para distinguirla.
export function newRecipeRaw(servings: number | null, simple = false): Rec {
  return formToRecipe(null, emptyRecipeForm(servings, simple))
}

// ---- Validación de una receta (las reglas del servidor) -----------------------------------------------------------------------------------
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

export function validateRecipeRaw(r: Rec): string | null {
  const title = str(r.title).trim()
  if (title.length < 1 || title.length > 120) return 'La receta necesita un nombre (de 1 a 120 letras).'
  const t = `Receta «${title.slice(0, 60)}»: `
  if (!isInt(r.servings) || r.servings < 1 || r.servings > 50) return `${t}las raciones deben ser un número entero de 1 a 50.`
  const ings = arr(r.ingredients)
  if (ings.length < 1 || ings.length > 60) return `${t}debe tener de 1 a 60 ingredientes.`
  const names: string[] = []
  for (const raw of ings) {
    if (!isRec(raw)) return `${t}un ingrediente no tiene el formato esperado.`
    const name = str(raw.name).trim()
    if (name.length < 1 || name.length > 120) return `${t}cada ingrediente necesita nombre (hasta 120 letras).`
    if (str(raw.quantity).length > 30) return `${t}la cantidad de «${name.slice(0, 40)}» no es válida (hasta 30 caracteres).`
    if (str(raw.unit).length > 30) return `${t}la unidad de «${name.slice(0, 40)}» no es válida (hasta 30 caracteres).`
    const key = textKey(name)
    if (names.includes(key)) return `${t}el ingrediente «${name.slice(0, 40)}» está repetido.`
    names.push(key)
  }
  const simple = r.simple === true
  const steps = arr(r.steps)
  if (steps.length > 30 || (!simple && steps.length < 1)) return simple ? `${t}los pasos deben ser una lista de hasta 30.` : `${t}debe tener de 1 a 30 pasos.`
  for (const s of steps) if (typeof s !== 'string' || s.trim() === '' || s.length > 1000) return `${t}cada paso debe tener texto (hasta 1000 caracteres).`
  if (r.tip !== undefined && r.tip !== null && (typeof r.tip !== 'string' || r.tip.trim().length < 1 || r.tip.trim().length > 400)) return `${t}el consejo debe ser un texto de 1 a 400 caracteres.`
  if (isRec(r.freeze)) {
    if (typeof r.freeze.ideal !== 'boolean') return `${t}la congelación no es válida.`
    if (r.freeze.note !== undefined && (typeof r.freeze.note !== 'string' || r.freeze.note.trim().length < 1 || r.freeze.note.trim().length > 300)) return `${t}la nota de congelación debe ser un texto de 1 a 300 caracteres.`
  }
  if (isRec(r.time)) {
    const { active, total } = r.time
    if (!isInt(active) || !isInt(total)) return `${t}los tiempos deben ser minutos enteros: trabajo activo y total (rellena los dos o ninguno).`
    if (active < 1 || active > 600 || total < 1 || total > 1440) return `${t}el trabajo activo va de 1 a 600 minutos y el total de 1 a 1440.`
    if (total < active) return `${t}el tiempo total no puede ser menor que el de trabajo activo.`
  }
  if (r.tags !== undefined) {
    const tags = arr(r.tags)
    if (tags.length > 12) return `${t}como máximo 12 etiquetas.`
    for (const g of tags) if (typeof g !== 'string' || g.trim().length < 1 || g.trim().length > 40) return `${t}cada etiqueta debe tener de 1 a 40 caracteres.`
  }
  return null
}

export function validateRecipeForm(original: Rec | null, f: RecipeForm): string | null {
  return validateRecipeRaw(formToRecipe(original, f))
}

// ---- Validación del menú completo (como el servidor) ---------------------------------------------------------------------------------------
export function validateMenuLocal(menu: Rec): string | null {
  const days = arr(menu.days)
  if (days.length !== 7) return 'El menú debe tener exactamente 7 días (de lunes a domingo).'
  const titles: string[] = []
  for (let i = 0; i < 7; i++) {
    const name = EDIT_DAYS[i]
    const dishKeys: string[] = []
    const firstKeys: string[] = []
    for (const { key } of EDIT_MEALS) {
      const meal = mealOf(menu, i, key)
      if (!meal) return `${name}: falta la ${key}.`
      const title = str(meal.title).trim()
      if (title.length < 1 || title.length > 120) return `${name} (${key}): el plato necesita título (de 1 a 120 letras).`
      if (meal.side !== undefined && meal.side !== null && (typeof meal.side !== 'string' || meal.side.length > 120)) return `${name} (${key}): el acompañamiento debe ser un texto de hasta 120 letras.`
      const recipes = arr(meal.recipes)
      if (recipes.length < 1 || recipes.length > MAX_RECIPES_PER_MEAL) return `${name} (${key}): el plato debe tener de 1 a ${MAX_RECIPES_PER_MEAL} recetas.`
      for (const raw of recipes) {
        const err = isRec(raw) ? validateRecipeRaw(raw) : 'una receta no tiene el formato esperado.'
        if (err) return `${name} (${key}), ${err}`
      }
      titles.push(textKey(title))
      dishKeys.push(textKey(title))
      firstKeys.push(textKey(str((recipes[0] as Rec).title)))
    }
    if (dishKeys[0] === dishKeys[1] || firstKeys[0] === firstKeys[1]) return `${name}: la comida y la cena no pueden ser el mismo plato principal.`
  }
  const counts = new Map<string, number>()
  for (const t of titles) counts.set(t, (counts.get(t) ?? 0) + 1)
  for (const [t, n] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) if (n > 2) return `El plato «${t}» aparece más de 2 veces en la semana.`
  return null
}

// ---- Comprobación editorial (resumen para quien aprueba) ---------------------------------------------------------------------------------
export interface CheckIssue {
  day: string
  meal: MenuMealKey
  recipe: string
  message: string
}
export interface MenuEditorialCheck {
  /** Platos (comida + cena de cada día) y recetas/elementos sencillos que llevan. */
  dishes: number
  recipes: number
  simpleItems: number
  /** Recetas que cumplen todos los datos obligatorios. */
  completeRecipes: number
  /** Errores que IMPIDEN aprobar: datos obligatorios pendientes y reglas del menú. */
  errors: string[]
  incomplete: CheckIssue[]
  /** Recomendaciones editoriales: NUNCA impiden aprobar (un consejo es opcional). */
  recommendations: CheckIssue[]
  canApprove: boolean
}

export function menuEditorialCheck(menuRaw: unknown): MenuEditorialCheck {
  const menu = isRec(menuRaw) ? menuRaw : {}
  const out: MenuEditorialCheck = { dishes: 0, recipes: 0, simpleItems: 0, completeRecipes: 0, errors: [], incomplete: [], recommendations: [], canApprove: false }
  if (arr(menu.days).length !== 7) {
    out.errors.push('El menú debe tener exactamente 7 días (de lunes a domingo).')
    return out
  }
  for (let d = 0; d < 7; d++) {
    for (const { key } of EDIT_MEALS) {
      const meal = mealOf(menu, d, key)
      if (!meal) continue
      out.dishes += 1
      for (const r of recipesOf(menu, d, key)) {
        out.recipes += 1
        const simple = r.simple === true
        if (simple) out.simpleItems += 1
        const title = str(r.title).trim() || 'Receta sin nombre'
        const problem = validateRecipeRaw(r)
        if (problem) out.incomplete.push({ day: EDIT_DAYS[d], meal: key, recipe: title, message: problem })
        else out.completeRecipes += 1
        if (!simple) {
          if (!str(r.tip).trim()) out.recommendations.push({ day: EDIT_DAYS[d], meal: key, recipe: title, message: 'No lleva consejo (es opcional).' })
          if (!isRec(r.time)) out.recommendations.push({ day: EDIT_DAYS[d], meal: key, recipe: title, message: 'No indica tiempos (es opcional).' })
        }
        for (const i of arr(r.ingredients).filter(isRec)) {
          if (str(i.quantity).trim() === '') out.recommendations.push({ day: EDIT_DAYS[d], meal: key, recipe: title, message: `«${str(i.name).trim() || 'ingrediente'}» no tiene cantidad (al comprar saldrá sin cantidad).` })
        }
      }
    }
  }
  const menuError = validateMenuLocal(menu)
  if (menuError && out.incomplete.length === 0) out.errors.push(menuError)
  if (out.incomplete.length > 0) out.errors.push(`${out.incomplete.length === 1 ? 'Una receta tiene' : `${out.incomplete.length} recetas tienen`} datos obligatorios pendientes.`)
  out.canApprove = out.errors.length === 0
  return out
}

// Líneas del resumen, sin adornos: se pintan tal cual.
export function checkSummaryLines(c: MenuEditorialCheck): string[] {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const lines = [`${plural(c.dishes, 'plato', 'platos')} y ${plural(c.recipes, 'receta o elemento', 'recetas o elementos')} (${c.simpleItems} sencillos).`, `${c.completeRecipes} de ${c.recipes} completas.`]
  return lines
}
