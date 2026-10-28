// Comunidad PEPA — comparación de un MENÚ semanal oficial antes/después de rectificarlo con Pepa, receta por receta. Código puro (sin red ni React).
// Reutiliza la comparación de fichas de los artículos (`compareRecipeCards`: ingredientes, cantidades, pasos, consejo, tiempos y congelación) y la lectura tolerante de
// recetas; aquí solo se recorre el menú (día → comida → recetas) y se comprueba lo que Pepa DICE frente a lo que la propuesta CONTIENE.
import { claimsNewRecipe, compareRecipeCards, readRecipeCards, type RecipeCard, type RecipeChange } from '@/domain/communityEditorialRecipes'
import { normalizeKey } from '@/domain/communityRecipeDiff'
import { MEAL_TEXT, WEEKDAY_NAMES, type MealKind, type ReviseTarget } from '@/domain/communityEditorial'

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export const MENU_MEAL_KINDS: MealKind[] = ['comida', 'cena']

// Una receta del menú: la ficha + si es un elemento SENCILLO (una pieza de fruta, pan tostado…: sin pasos y sin ser receta de Cocina).
export type MenuRecipeCard = RecipeCard & { simple: boolean }

export interface MealSnapshot {
  title: string
  side: string | null
  recipes: MenuRecipeCard[]
}

export function readMealSnapshot(raw: unknown): MealSnapshot | null {
  if (!isRec(raw)) return null
  const recipesRaw = Array.isArray(raw.recipes) ? raw.recipes : []
  const cards = readRecipeCards(recipesRaw)
  const recipeRecs = recipesRaw.filter(isRec)
  const title = str(raw.title).trim()
  if (!title && cards.length === 0) return null
  return {
    title,
    side: str(raw.side).trim() || null,
    // Las recetas del menú no traen `key`: se identifican por su nombre (sin tildes ni mayúsculas), así que quitar o mover una receta nunca se confunde con otra distinta.
    recipes: cards.map((c, i) => ({ ...c, key: normalizeKey(c.title) || `receta-${i + 1}`, simple: recipeRecs[i]?.simple === true })),
  }
}

export interface MealChange {
  dayIndex: number
  day: string
  meal: MealKind
  before: MealSnapshot | null
  after: MealSnapshot | null
  titleChanged: boolean
  sideChanged: boolean
  /** Receta por receta (añadida, eliminada o modificada). */
  recipes: RecipeChange[]
  /** Las mismas recetas en otro orden (la primera es el plato principal). */
  orderChanged: boolean
}

function mealsOf(payload: Rec): { dayIndex: number; day: string; meal: MealKind; snapshot: MealSnapshot | null }[] {
  const menu = isRec(payload.menu) ? payload.menu : {}
  const days = Array.isArray(menu.days) ? menu.days : []
  const out: { dayIndex: number; day: string; meal: MealKind; snapshot: MealSnapshot | null }[] = []
  days.forEach((d, dayIndex) => {
    const rec = isRec(d) ? d : {}
    const meals = isRec(rec.meals) ? rec.meals : {}
    for (const meal of MENU_MEAL_KINDS) out.push({ dayIndex, day: str(rec.day) || WEEKDAY_NAMES[dayIndex] || `Día ${dayIndex + 1}`, meal, snapshot: readMealSnapshot(meals[meal]) })
  })
  return out
}

const sameName = (a: string, b: string): boolean => normalizeKey(a) === normalizeKey(b)

// Comida por comida: lo que cambia entre dos versiones del menú. Una comida igual en todo no aparece.
export function compareMenus(before: Rec, after: Rec): MealChange[] {
  const a = mealsOf(before)
  const b = mealsOf(after)
  const keyOf = (x: { dayIndex: number; meal: MealKind }) => `${x.dayIndex}:${x.meal}`
  const map = new Map(a.map((x) => [keyOf(x), x]))
  const out: MealChange[] = []
  for (const y of b) {
    const x = map.get(keyOf(y))
    map.delete(keyOf(y))
    const bs = x?.snapshot ?? null
    const as = y.snapshot
    if (!bs && !as) continue
    const recipes = compareRecipeCards(bs?.recipes ?? [], as?.recipes ?? [])
    const titleChanged = (bs?.title ?? '') !== (as?.title ?? '')
    const sideChanged = (bs?.side ?? '') !== (as?.side ?? '')
    // Mismo conjunto de recetas pero otro orden.
    const orderChanged = !!bs && !!as && recipes.length === 0 && bs.recipes.length === as.recipes.length && bs.recipes.some((r, i) => !sameName(r.title, as.recipes[i].title))
    if (recipes.length === 0 && !titleChanged && !sideChanged && !orderChanged) continue
    out.push({ dayIndex: y.dayIndex, day: y.day, meal: y.meal, before: bs, after: as, titleChanged, sideChanged, recipes, orderChanged })
  }
  // Comidas que existían y ya no están (días que desaparecen del menú).
  for (const x of map.values()) {
    if (!x.snapshot) continue
    out.push({ dayIndex: x.dayIndex, day: x.day, meal: x.meal, before: x.snapshot, after: null, titleChanged: true, sideChanged: false, recipes: compareRecipeCards(x.snapshot.recipes, []), orderChanged: false })
  }
  return out.sort((p, q) => p.dayIndex - q.dayIndex || MENU_MEAL_KINDS.indexOf(p.meal) - MENU_MEAL_KINDS.indexOf(q.meal))
}

export interface MenuChangeStats {
  meals: number
  added: number
  removed: number
  changed: number
}

export function menuChangeStats(changes: MealChange[]): MenuChangeStats {
  const all = changes.flatMap((c) => c.recipes)
  return { meals: changes.length, added: all.filter((r) => r.kind === 'added').length, removed: all.filter((r) => r.kind === 'removed').length, changed: all.filter((r) => r.kind === 'changed').length }
}

export const mealLabel = (c: Pick<MealChange, 'day' | 'meal'>): string => `${c.day.charAt(0).toUpperCase()}${c.day.slice(1)} · ${MEAL_TEXT[c.meal]}`

export function statsText(s: MenuChangeStats): string {
  if (s.meals === 0) return 'No cambia ningún plato.'
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const parts = [plural(s.added, 'receta nueva', 'recetas nuevas'), plural(s.changed, 'modificada', 'modificadas'), plural(s.removed, 'eliminada', 'eliminadas')]
  return `${plural(s.meals, 'comida cambia', 'comidas cambian')}: ${parts.join(', ')}.`
}

// ---- Lo que Pepa dice frente a lo que la propuesta contiene ------------------------------------------------------------------------------------
export interface MenuWarning {
  code: 'slot-label-title' | 'dish-name-stale' | 'claims-new-recipe'
  message: string
}

const plainWords = (t: string): string[] => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

// Un nombre de plato que es la etiqueta de su hueco («Martes, cena», «cena»): el mismo criterio que aplica el servidor al rectificar (community-editorial/revise.ts).
export function isSlotLabelTitle(title: string): boolean {
  const words = plainWords(title)
  const days = WEEKDAY_NAMES.map((d) => plainWords(d).join(' '))
  return words.length > 0 && words.length <= 3 && words.every((w) => w === 'comida' || w === 'cena' || w === 'de' || w === 'del' || days.includes(w))
}

export function checkMenuClaims(input: { notes: string; changes: MealChange[] }): MenuWarning[] {
  const out: MenuWarning[] = []
  for (const c of input.changes) {
    const a = c.after
    if (!a) continue
    if (isSlotLabelTitle(a.title)) {
      out.push({ code: 'slot-label-title', message: `${mealLabel(c)}: el plato se llama «${a.title}», que no es el nombre de un plato. Pídele a Pepa que lo corrija o recházala.` })
      continue
    }
    const main = a.recipes[0]
    const mainBefore = c.before?.recipes[0]
    if (!c.titleChanged && main && mainBefore && !sameName(main.title, mainBefore.title) && !sameName(main.title, a.title)) {
      out.push({ code: 'dish-name-stale', message: `${mealLabel(c)}: la receta principal ahora es «${main.title}», pero el nombre del plato sigue siendo «${a.title}». En el menú se verá «${a.title}».` })
    }
  }
  if (input.notes && claimsNewRecipe(input.notes) && !input.changes.some((c) => c.recipes.some((r) => r.kind === 'added'))) {
    out.push({ code: 'claims-new-recipe', message: 'Pepa dice que ha añadido una receta, pero la propuesta no añade ninguna ficha nueva: comprueba qué ha cambiado de verdad antes de aceptar.' })
  }
  return out
}

// ---- Elegir el alcance de la rectificación (una receta / una comida / un día / todo el menú) -------------------------------------------------------
// Solo hace falta saber qué comidas hay cada día y cómo se llaman sus recetas (el resumen que ya trae el panel del menú).
export interface ScopeMenu {
  days: { day: string; comida: { title: string; recipes: { title: string }[] } | null; cena: { title: string; recipes: { title: string }[] } | null }[]
}

export function mealsOfDay(menu: ScopeMenu, day: number): MealKind[] {
  const d = menu.days[day]
  return d ? MENU_MEAL_KINDS.filter((m) => d[m] !== null) : []
}

export function recipeTitlesOf(menu: ScopeMenu, day: number, meal: MealKind): string[] {
  return menu.days[day]?.[meal]?.recipes.map((r) => r.title) ?? []
}

// Un destino válido para ese alcance, conservando lo ya elegido (día, comida, receta) cuando sigue existiendo.
export function scopeTargetFor(menu: ScopeMenu, scope: ReviseTarget['scope'], prev: ReviseTarget | null): ReviseTarget {
  if (scope === 'week') return { scope: 'week' }
  const lastDay = Math.max(0, menu.days.length - 1)
  const prevDay = prev && 'day' in prev ? prev.day : 0
  const day = Math.min(Math.max(0, prevDay), lastDay)
  if (scope === 'day') return { scope: 'day', day }
  const meals = mealsOfDay(menu, day)
  const prevMeal = prev && 'meal' in prev ? prev.meal : null
  const meal: MealKind = prevMeal && meals.includes(prevMeal) ? prevMeal : (meals[0] ?? 'comida')
  if (scope === 'meal') return { scope: 'meal', day, meal }
  const count = recipeTitlesOf(menu, day, meal).length
  const prevRecipe = prev && 'recipe' in prev ? prev.recipe : 0
  return { scope: 'recipe', day, meal, recipe: Math.min(Math.max(0, prevRecipe), Math.max(0, count - 1)) }
}
