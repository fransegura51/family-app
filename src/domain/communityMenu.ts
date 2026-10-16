// Comunidad PEPA — MENÚ SEMANAL OFICIAL: tipos, escalado, selección, fechas y compra. Código puro (sin red ni React).
// Reutiliza lo que ya existe: el escalado de recipeScaling.ts, la suma y agrupación de menuShoppingPlan.ts («Preparar compra del menú» de Eventos) y los
// formatos de communityRecipeBridge.ts. Aquí solo se adapta el menú oficial a esas piezas; no hay un segundo sistema de menús.
import { formatScaledQuantity } from '@/domain/communityRecipeBridge'
import { buildMenuShoppingPlan, type ShoppingPlanLine } from '@/domain/menuShoppingPlan'
import { scaleIngredientQuantity } from '@/domain/recipeScaling'
import { isValidServings } from '@/domain/recipeServings'
import { normalizeKey } from '@/domain/communityRecipeDiff'
import type { EventMenuItem, Recipe, ShoppingItem } from '@/domain/types'

// ---- Tipos del menú (contrato de community_get_post → `menu`)
export type MenuMealKey = 'comida' | 'cena'
export const MENU_MEALS: { key: MenuMealKey; label: string; icon: string }[] = [
  { key: 'comida', label: 'Comida', icon: '🍽️' },
  { key: 'cena', label: 'Cena', icon: '🌙' },
]
export const MENU_DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const
export type MenuDayName = (typeof MENU_DAYS)[number]
const DAY_SHORT: Record<MenuDayName, string> = { lunes: 'Lun', martes: 'Mar', miércoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sábado: 'Sáb', domingo: 'Dom' }

export interface MenuIngredient {
  name: string
  quantity: string
  unit: string
}
export interface MenuRecipe {
  title: string
  servings: number | null
  ingredients: MenuIngredient[]
  steps: string[]
  tags: string[]
}
export interface MenuMeal {
  title: string
  side: string
  recipes: MenuRecipe[]
}
export interface MenuDay {
  day: MenuDayName
  meals: Partial<Record<MenuMealKey, MenuMeal>>
}
export interface CommunityMenu {
  version: number
  servings: number
  days: MenuDay[]
  // Solo en los menús semanales programados (lunes y domingo de su semana, «AAAA-MM-DD»). El menú de ejemplo no lleva fechas.
  weekStart: string | null
  weekEnd: string | null
}

export const MENU_MIN_SERVINGS = 1
export const MENU_MAX_SERVINGS = 12

// ---- Lectura defensiva del menú (el servidor ya lo valida; aquí solo se evita que un dato raro rompa la pantalla)
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')

export function normalizeDayName(raw: string): MenuDayName | null {
  const key = normalizeKey(raw)
  return MENU_DAYS.find((d) => normalizeKey(d) === key) ?? null
}

export function dayShort(day: MenuDayName): string {
  return DAY_SHORT[day]
}

export function dayLabel(day: MenuDayName): string {
  return day.charAt(0).toUpperCase() + day.slice(1)
}

function parseRecipe(raw: unknown): MenuRecipe | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = str(r.title).trim()
  if (!title) return null
  const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .map((i): MenuIngredient | null => {
      if (!i || typeof i !== 'object') return null
      const o = i as Record<string, unknown>
      const name = str(o.name).trim()
      return name ? { name, quantity: str(o.quantity).trim(), unit: str(o.unit).trim() } : null
    })
    .filter((i): i is MenuIngredient => i !== null)
  return {
    title,
    servings: isValidServings(r.servings as number) ? (r.servings as number) : null,
    ingredients,
    steps: (Array.isArray(r.steps) ? r.steps : []).map((s) => str(s).trim()).filter(Boolean),
    tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => str(t).trim()).filter(Boolean),
  }
}

export function parseMenu(raw: unknown): CommunityMenu | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (!Array.isArray(m.days)) return null
  const days: MenuDay[] = []
  for (const d of m.days) {
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const name = normalizeDayName(str(o.day))
    if (!name || days.some((x) => x.day === name)) continue
    const meals: Partial<Record<MenuMealKey, MenuMeal>> = {}
    const rawMeals = (o.meals && typeof o.meals === 'object' ? o.meals : {}) as Record<string, unknown>
    for (const { key } of MENU_MEALS) {
      const meal = rawMeals[key]
      if (!meal || typeof meal !== 'object') continue
      const mm = meal as Record<string, unknown>
      const recipes = (Array.isArray(mm.recipes) ? mm.recipes : []).map(parseRecipe).filter((r): r is MenuRecipe => r !== null)
      if (recipes.length === 0) continue
      meals[key] = { title: str(mm.title).trim() || recipes[0].title, side: str(mm.side).trim(), recipes }
    }
    if (Object.keys(meals).length > 0) days.push({ day: name, meals })
  }
  if (days.length === 0) return null
  // Siempre de lunes a domingo, aunque el menú llegue desordenado.
  days.sort((a, b) => MENU_DAYS.indexOf(a.day) - MENU_DAYS.indexOf(b.day))
  const servings = isValidServings(m.servings as number) ? (m.servings as number) : 4
  const ws = typeof m.weekStart === 'string' && isIsoDate(m.weekStart) ? m.weekStart : null
  const we = typeof m.weekEnd === 'string' && isIsoDate(m.weekEnd) ? m.weekEnd : null
  return { version: typeof m.version === 'number' ? m.version : 1, servings, days, weekStart: ws, weekEnd: we }
}

// ---- Escalado para mostrar (solo cambia lo que se VE; la receta oficial no se toca)
// «250 g», «1,5 cucharadas», «≈ 0,75 unidades» (con ≈ cuando el resultado no es un número entero de unidades). Vacío si no hay cantidad.
export function ingredientQuantityText(i: MenuIngredient, recipeServings: number | null, target: number): string {
  const scaled = scaleIngredientQuantity(i.quantity || null, i.unit || null, recipeServings, target)
  if (scaled.scaled && scaled.value !== null) {
    return `${scaled.fractional ? '≈ ' : ''}${formatScaledQuantity(scaled.value)}${scaled.unit ? ' ' + scaled.unit : ''}`
  }
  return [i.quantity, i.unit].filter((x) => x && x.trim()).join(' ')
}

// Raciones con las que está escrita una receta del menú (las suyas o, si no las trae, las del menú).
export function recipeBaseServings(recipe: MenuRecipe, menu: CommunityMenu): number {
  return recipe.servings ?? menu.servings
}

// ---- Qué parte del menú se elige (la misma forma que usa el servidor: alcance + día + comida + receta)
export type MenuScope = 'week' | 'day' | 'meal' | 'recipe'
export interface MenuSelection {
  scope: MenuScope
  day?: MenuDayName
  meal?: MenuMealKey
  // 0 = plato principal; 1 = acompañamiento.
  recipeIndex?: number
}

export interface SelectedRecipe {
  day: MenuDayName
  meal: MenuMealKey
  mealTitle: string
  recipeIndex: number
  recipe: MenuRecipe
}

// Las recetas que abarca una selección, en orden de semana (lunes → domingo, comida antes que cena).
export function selectRecipes(menu: CommunityMenu, sel: MenuSelection): SelectedRecipe[] {
  const out: SelectedRecipe[] = []
  for (const d of menu.days) {
    if (sel.scope !== 'week' && d.day !== sel.day) continue
    for (const { key } of MENU_MEALS) {
      if ((sel.scope === 'meal' || sel.scope === 'recipe') && key !== sel.meal) continue
      const meal = d.meals[key]
      if (!meal) continue
      meal.recipes.forEach((recipe, recipeIndex) => {
        if (sel.scope === 'recipe' && recipeIndex !== sel.recipeIndex) return
        out.push({ day: d.day, meal: key, mealTitle: meal.title, recipeIndex, recipe })
      })
    }
  }
  return out
}

export function selectionTitle(sel: MenuSelection, menu: CommunityMenu): string {
  if (sel.scope === 'week') return 'Todo el menú de la semana'
  if (sel.scope === 'day') return `El ${sel.day ?? 'día'}`
  const meal = sel.meal === 'cena' ? 'cena' : 'comida'
  if (sel.scope === 'meal') return `La ${meal} del ${sel.day}`
  const r = selectRecipes(menu, sel)[0]
  return r ? `Receta «${r.recipe.title}»` : 'Una receta'
}

// ---- Fechas (todo en fecha LOCAL «AAAA-MM-DD»: sin husos horarios, para que el lunes sea siempre el lunes de la persona)
export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + 'T00:00:00').getTime())
}

export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function fromIso(iso: string): Date {
  return new Date(iso + 'T00:00:00')
}

export function addDays(iso: string, days: number): string {
  const d = fromIso(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

// Lunes de la semana de una fecha (la semana empieza en lunes).
export function mondayOf(iso: string): string {
  const d = fromIso(iso)
  const back = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - back)
  return toIsoDate(d)
}

export function isMonday(iso: string): boolean {
  return isIsoDate(iso) && fromIso(iso).getDay() === 1
}

// Semana de destino por defecto: la del menú si trae fechas y no ha pasado; si no (o es el menú de ejemplo), la PRÓXIMA semana.
export function defaultTargetMonday(menu: CommunityMenu, todayIso: string): string {
  const thisMonday = mondayOf(todayIso)
  if (menu.weekStart && isMonday(menu.weekStart) && menu.weekStart >= thisMonday) return menu.weekStart
  return addDays(thisMonday, 7)
}

// Semanas que se ofrecen como destino: desde la de esta semana, 12 por delante (más la del menú si cae fuera).
export function targetMondayOptions(menu: CommunityMenu, todayIso: string, count = 12): string[] {
  const first = mondayOf(todayIso)
  const out = Array.from({ length: count }, (_, i) => addDays(first, 7 * i))
  if (menu.weekStart && isMonday(menu.weekStart) && !out.includes(menu.weekStart)) out.push(menu.weekStart)
  return out.sort()
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export function formatDayMonth(iso: string): string {
  const d = fromIso(iso)
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`
}

// «19 de octubre al 25 de octubre» (si cambia de mes se dicen los dos meses; si no, «del 19 al 25 de octubre»).
export function formatWeekRange(mondayIso: string): string {
  const a = fromIso(mondayIso)
  const b = fromIso(addDays(mondayIso, 6))
  if (a.getMonth() === b.getMonth()) return `del ${a.getDate()} al ${b.getDate()} de ${MONTHS[b.getMonth()]}`
  return `del ${a.getDate()} de ${MONTHS[a.getMonth()]} al ${b.getDate()} de ${MONTHS[b.getMonth()]}`
}

export function formatDayDate(iso: string): string {
  const d = fromIso(iso)
  const names = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return `${names[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`
}

// ---- Vista previa e importación (respuestas del servidor, ya en camelCase)
export type ConflictMode = 'skip' | 'replace' | 'append'
export type DuplicateMode = 'reuse' | 'copy'

export interface PreviewExistingEntry {
  id: string
  label: string
  kind: 'receta' | 'texto'
}
export interface PreviewExistingRecipe {
  id: string
  title: string
  sameContent: boolean
}
export interface PreviewRecipe {
  index: number
  role: 'principal' | 'acompanamiento'
  title: string
  ingredientCount: number
  existingRecipes: PreviewExistingRecipe[]
  action: 'create' | 'reuse'
}
export interface PreviewSlot {
  day: MenuDayName
  meal: MenuMealKey
  date: string | null
  title: string
  side: string
  existing: PreviewExistingEntry[]
  recipes: PreviewRecipe[]
}
export interface MenuImportPreview {
  postId: string
  scope: MenuScope
  targetStart: string | null
  targetEnd: string | null
  servings: number
  menuServings: number | null
  duplicateRecipes: DuplicateMode
  slots: PreviewSlot[]
  summary: { slots: number; slotsBusy: number; recipesNew: number; recipesKnown: number }
}
export interface MenuImportResult {
  ok: true
  replayed: boolean
  scope: MenuScope
  targetStart: string | null
  targetEnd: string | null
  servings: number
  onConflict: ConflictMode
  recipesCreated: number
  recipesReused: number
  recipes: { id: string; title: string; created: boolean }[]
  slotsImported: number
  slotsSkipped: number
  slotsReplaced: number
  slotsAppended: number
  skipped: { day: MenuDayName; meal: MenuMealKey; date: string }[]
  entriesCreated: number
  entriesRemoved: number
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Frases del resultado, una por línea, en lenguaje llano.
export function importResultLines(r: MenuImportResult): string[] {
  const lines: string[] = []
  if (r.recipesCreated > 0) lines.push(`${plural(r.recipesCreated, 'receta nueva guardada', 'recetas nuevas guardadas')} en tu Cocina.`)
  if (r.recipesReused > 0) lines.push(`${plural(r.recipesReused, 'receta que ya tenías se ha reutilizado', 'recetas que ya tenías se han reutilizado')} (no se han duplicado).`)
  if (r.entriesCreated > 0) lines.push(`${plural(r.entriesCreated, 'plato apuntado', 'platos apuntados')} en tu menú${r.targetStart ? ` de la semana ${formatWeekRange(r.targetStart)}` : ''}.`)
  if (r.slotsReplaced > 0) lines.push(`${plural(r.slotsReplaced, 'comida o cena sustituida', 'comidas o cenas sustituidas')} (${plural(r.entriesRemoved, 'plato quitado', 'platos quitados')} de tu menú; tus recetas siguen ahí).`)
  if (r.slotsAppended > 0) lines.push(`${plural(r.slotsAppended, 'comida o cena con platos añadidos', 'comidas o cenas con platos añadidos')} detrás de lo que ya tenías.`)
  if (r.slotsSkipped > 0) lines.push(`${plural(r.slotsSkipped, 'comida o cena omitida', 'comidas o cenas omitidas')} porque ya tenías algo apuntado (no se ha tocado).`)
  if (r.entriesCreated === 0 && r.recipesCreated === 0 && r.recipesReused === 0) lines.push('No se ha guardado nada nuevo.')
  return lines
}

// ---- Errores del servidor de la importación (además de los de Comunidad)
export type MenuErrorCode = 'BAD_MENU' | 'BAD_SCOPE' | 'BAD_TARGET_START' | 'BAD_SERVINGS' | 'BAD_CONFLICT' | 'BAD_DUPLICATES' | 'BAD_KEY' | 'KEY_REUSED' | 'NO_FAMILY'
export const MENU_ERROR_MESSAGES: Record<MenuErrorCode, string> = {
  BAD_MENU: 'Este menú no se puede importar ahora mismo porque tiene algún dato incorrecto. No se ha guardado nada.',
  BAD_SCOPE: 'Lo que has elegido importar no existe en este menú. Elígelo de nuevo.',
  BAD_TARGET_START: 'La semana elegida no es válida. Elige una semana de la lista.',
  BAD_SERVINGS: 'Las raciones deben estar entre 1 y 50.',
  BAD_CONFLICT: 'No se ha entendido qué hacer con lo que ya tienes en tu menú. Elígelo de nuevo.',
  BAD_DUPLICATES: 'No se ha entendido qué hacer con las recetas que ya tienes. Elígelo de nuevo.',
  BAD_KEY: 'No se ha podido preparar la importación. Cierra esta ventana y vuelve a intentarlo.',
  KEY_REUSED: 'Esta importación ya se había enviado con otras opciones. Cierra la ventana y vuelve a empezar.',
  NO_FAMILY: 'Tu cuenta no tiene una familia en PEPA, así que no hay Cocina donde guardar el menú.',
}
const MENU_ERROR_KEYS = Object.keys(MENU_ERROR_MESSAGES) as MenuErrorCode[]

export function menuErrorCode(error: unknown): MenuErrorCode | null {
  const raw = typeof error === 'object' && error !== null ? String((error as { message?: unknown }).message ?? '') : String(error ?? '')
  return MENU_ERROR_KEYS.find((k) => new RegExp(`\\b${k}\\b`).test(raw)) ?? null
}

// ---- Compras: ingredientes del menú sumados con el código de «Preparar compra del menú» (Eventos)
// Cada receta del menú se presenta como una «receta» y un «plato de la familia» para reutilizar tal cual buildMenuShoppingPlan. Nada se guarda aquí.
export function buildMenuShopping(menu: CommunityMenu, sel: MenuSelection, servings: number): ShoppingPlanLine[] {
  const picked = selectRecipes(menu, sel)
  const recipes: Recipe[] = []
  const items: EventMenuItem[] = []
  picked.forEach((p, n) => {
    const id = `menu:${p.day}:${p.meal}:${p.recipeIndex}:${n}`
    recipes.push({
      id,
      familyId: '',
      title: p.recipe.title,
      notes: null,
      imagePath: null,
      tags: p.recipe.tags,
      servings: recipeBaseServings(p.recipe, menu),
      servingsSource: null,
      ingredients: p.recipe.ingredients.map((i, k) => ({ id: `${id}:${k}`, name: i.name, quantity: i.quantity || null, unit: i.unit || null })),
    })
    items.push({
      id,
      eventId: '',
      familyId: '',
      name: p.recipe.title,
      category: null,
      quantityNote: null,
      transferred: false,
      sortOrder: n,
      createdAt: '',
      recipeId: id,
      notes: null,
      source: 'importado',
      documentId: null,
      preparedBy: 'familia',
      kind: 'dish',
    })
  })
  // «familia»: todo se cocina en casa (así se incluyen los ingredientes de todos los platos).
  return buildMenuShoppingPlan(items, recipes, servings, 'familia')
}

export interface MenuShoppingRow {
  line: ShoppingPlanLine
  // Ya hay un producto con ese nombre SIN comprar en la lista de la familia (se enseña y se deja sin marcar; la persona puede marcarlo igualmente).
  inList: boolean
}

// Marca los productos que ya están en la lista (solo los pendientes de comprar; los ya comprados no cuentan). Compara solo el nombre, sin tildes ni mayúsculas
// (la misma regla que «Pepa» al añadir los ingredientes de un menú): que haya «cebolla» no dice si hay bastante, por eso solo se avisa, no se bloquea.
export function markShoppingDuplicates(lines: ShoppingPlanLine[], current: Pick<ShoppingItem, 'name' | 'status'>[]): MenuShoppingRow[] {
  const pending = new Set(current.filter((c) => c.status === 'pendiente').map((c) => normalizeKey(c.name)))
  return lines.map((line) => ({ line, inList: pending.has(normalizeKey(line.name)) }))
}

// Textos de «avisos de revisión» de una línea (los mismos que «Preparar compra del menú»).
export const SHOPPING_NOTE_LABEL: Record<string, string> = {
  sin_raciones: 'La receta no tiene raciones: cantidad original, sin escalar.',
  cantidad_no_numerica: 'La cantidad no es un número: revísala.',
  unidad_no_escalable: 'Unidad que no se puede escalar: cantidad original.',
  fraccionario: 'El resultado no es un número entero de unidades: revísalo antes de comprar.',
}
