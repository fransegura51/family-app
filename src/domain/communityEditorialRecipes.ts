// Comunidad PEPA — fichas de recetas de los artículos oficiales (payload.recipes) en la revisión de borradores y en la rectificación con Pepa. Código puro, sin red ni React.
// Reutiliza lo que ya existe: el contrato de las fichas (`communityPostRecipes`, las mismas reglas que la base de datos al publicar) y la comparación de recetas de Comunidad
// (`communityRecipeDiff`: ingredientes, cantidades y pasos). Aquí solo se une: leer las fichas de un borrador, compararlas antes/después, comprobar lo que Pepa DICE que ha
// hecho contra lo que la propuesta CONTIENE, y editar las fichas sin perder campos.
import {
  diffRecipes as diffRecipeData,
  normalizeKey,
  type DiffRecipe,
  type RecipeDiff,
} from '@/domain/communityRecipeDiff'
import { validatePostRecipes } from '@/domain/communityPostRecipes'

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export interface RecipeCardIngredient {
  name: string
  quantity: string
  unit: string
}

export interface RecipeCard {
  key: string
  title: string
  // null = el artículo no dice para cuántas personas es (nunca se asume un número).
  servings: number | null
  ingredients: RecipeCardIngredient[]
  steps: string[]
  tip: string | null
  tags: string[]
  time: { active: number; total: number } | null
  freeze: { ideal: boolean; note: string | null } | null
}

// Lectura TOLERANTE: se enseña lo que haya (una propuesta de la IA puede traer algo a medias y la persona debe verlo para decidir). La validez se comprueba aparte.
export function readRecipeCards(raw: unknown): RecipeCard[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isRec).map((r, i) => {
    const title = str(r.title).trim() || str(r.name).trim() || 'Receta sin título'
    const ingredients = (Array.isArray(r.ingredients) ? r.ingredients : []).filter(isRec).map((x) => ({
      name: str(x.name).trim(),
      quantity: typeof x.quantity === 'number' ? String(x.quantity) : str(x.quantity).trim(),
      unit: str(x.unit).trim(),
    }))
    const time = isRec(r.time) && typeof r.time.active === 'number' && typeof r.time.total === 'number' ? { active: r.time.active, total: r.time.total } : null
    const freeze = isRec(r.freeze) && typeof r.freeze.ideal === 'boolean' ? { ideal: r.freeze.ideal, note: str(r.freeze.note).trim() || null } : null
    return {
      key: str(r.key) || `receta-${i + 1}`,
      title,
      servings: typeof r.servings === 'number' ? r.servings : null,
      ingredients,
      steps: (Array.isArray(r.steps) ? r.steps : []).filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean),
      tip: str(r.tip).trim() || null,
      tags: (Array.isArray(r.tags) ? r.tags : []).filter((t): t is string => typeof t === 'string'),
      time,
      freeze,
    }
  })
}

export const recipeCardsOf = (payload: Rec): RecipeCard[] => readRecipeCards(payload.recipes)

// ---- Texto de cada dato -----------------------------------------------------------------------------------------------------------------------
export function servingsLabel(n: number | null): string {
  return n === null ? 'Raciones: no se indican' : n === 1 ? '1 ración' : `${n} raciones`
}

export function timeLabel(t: RecipeCard['time']): string | null {
  return t ? `${t.active} min de trabajo · ${t.total} min en total` : null
}

export function freezeLabel(f: RecipeCard['freeze']): string | null {
  if (!f) return null
  return `${f.ideal ? 'Se puede congelar' : 'No conviene congelarla'}${f.note ? `: ${f.note}` : '.'}`
}

export function ingredientText(i: RecipeCardIngredient): string {
  const amount = [i.quantity, i.unit].filter(Boolean).join(' ')
  return amount ? `${amount} ${i.name}` : i.name
}

// ---- Comparación antes / después --------------------------------------------------------------------------------------------------------------
export type RecipeChangeKind = 'added' | 'removed' | 'changed'

export interface RecipeChange {
  kind: RecipeChangeKind
  title: string
  before: RecipeCard | null
  after: RecipeCard | null
  // Ingredientes, cantidades y pasos (solo en «changed»).
  diff: RecipeDiff | null
  // Consejo, tiempos y congelación: lo que el comparador de recetas no mira.
  extras: string[]
}

const toDiffRecipe = (c: RecipeCard): DiffRecipe => ({ title: c.title, servings: c.servings, ingredients: c.ingredients, steps: c.steps.join('\n'), tags: c.tags })

function extrasChanges(a: RecipeCard, b: RecipeCard): string[] {
  const out: string[] = []
  if ((a.tip ?? '') !== (b.tip ?? '')) out.push(a.tip && b.tip ? 'El consejo ha cambiado.' : b.tip ? 'Se ha añadido un consejo.' : 'Se ha quitado el consejo.')
  if ((timeLabel(a.time) ?? '') !== (timeLabel(b.time) ?? '')) out.push(`Tiempos: ${timeLabel(a.time) ?? 'sin indicar'} → ${timeLabel(b.time) ?? 'sin indicar'}.`)
  if ((freezeLabel(a.freeze) ?? '') !== (freezeLabel(b.freeze) ?? '')) out.push(`Congelación: ${freezeLabel(a.freeze) ?? 'sin indicar'} → ${freezeLabel(b.freeze) ?? 'sin indicar'}`)
  return out
}

// Empareja por título (sin tildes ni mayúsculas) y, si no coincide, por clave: así un cambio de nombre es «modificada» y no «eliminada + añadida».
export function compareRecipeCards(before: RecipeCard[], after: RecipeCard[]): RecipeChange[] {
  const out: RecipeChange[] = []
  const used = new Set<number>()
  const find = (a: RecipeCard): number => {
    let j = after.findIndex((b, k) => !used.has(k) && normalizeKey(b.title) === normalizeKey(a.title))
    if (j < 0) j = after.findIndex((b, k) => !used.has(k) && b.key === a.key)
    return j
  }
  for (const a of before) {
    const j = find(a)
    if (j < 0) {
      out.push({ kind: 'removed', title: a.title, before: a, after: null, diff: null, extras: [] })
      continue
    }
    used.add(j)
    const b = after[j]
    const diff = diffRecipeData(toDiffRecipe(a), toDiffRecipe(b))
    const extras = extrasChanges(a, b)
    if (diff.hasChanges || extras.length > 0) out.push({ kind: 'changed', title: b.title, before: a, after: b, diff, extras })
  }
  after.forEach((b, k) => {
    if (!used.has(k)) out.push({ kind: 'added', title: b.title, before: null, after: b, diff: null, extras: [] })
  })
  return out
}

export function changeSummary(c: RecipeChange): string {
  if (c.kind === 'added') return `Receta añadida: ${c.title} (${c.after?.ingredients.length ?? 0} ingredientes, ${c.after?.steps.length ?? 0} pasos).`
  if (c.kind === 'removed') return `Receta eliminada: ${c.title}.`
  const d = c.diff
  const bits: string[] = []
  if (d) {
    if (d.titleChanged) bits.push('cambia el nombre')
    if (d.servingsChanged) bits.push('cambian las raciones')
    const ing = d.ingredientsAdded.length + d.ingredientsRemoved.length + d.ingredientsChanged.length
    if (ing > 0) bits.push(ing === 1 ? '1 ingrediente' : `${ing} ingredientes`)
    if (d.stepOps.some((o) => o.type !== 'same')) bits.push('cambian pasos')
  }
  if (c.extras.length > 0) bits.push('consejo, tiempos o congelación')
  return `Receta cambiada: ${c.title}${bits.length > 0 ? ` (${bits.join(', ')})` : ''}.`
}

// ---- ¿Admite este artículo fichas de recetas? -------------------------------------------------------------------------------------------------
// La MISMA regla que aplica el servidor al rectificar (community-editorial/revise.ts): solo los artículos de la sección «recetas» o los que ya traen fichas. No se cambia.
export function recipesAdmitted(section: string | null | undefined, payload: Rec): boolean {
  return section === 'recetas' || recipeCardsOf(payload).length > 0
}

// ---- Lo que Pepa dice frente a lo que la propuesta contiene -----------------------------------------------------------------------------------
export interface ReviseWarning {
  code: 'claims-new-recipe' | 'asked-new-recipe' | 'recipes-not-admitted' | 'unrequested-recipe-change' | 'recipes-removed'
  message: string
}

const ADD_WORDS = '(?:a[ñn]ad|incorpor|incluy|agreg|insert|a[ñn]adi|cre[oóe]|escrib)\\w*'
const RECIPE_WORDS = '(?:receta|ficha)'
// «he añadido la ficha de la receta…», «incorporada la receta…», «añade la receta del estofado…», «añade una ficha…»
const CLAIM_RE = new RegExp(`${ADD_WORDS}[^.\\n]{0,90}\\b${RECIPE_WORDS}s?\\b|\\b${RECIPE_WORDS}s?\\b[^.\\n]{0,60}\\b(?:a[ñn]adid|incorporad|incluid|agregad)\\w*`, 'i')
const TOUCHES_RECIPES_RE = /receta|ficha|ingrediente|cantidad|raci[oó]n|paso|elaboraci[oó]n|preparaci[oó]n/i

export const claimsNewRecipe = (text: string): boolean => CLAIM_RE.test(text)

export function checkReviseClaims(input: { notes: string; instruction: string; section?: string | null; before: Rec; result: Rec }): ReviseWarning[] {
  const before = recipeCardsOf(input.before)
  const after = recipeCardsOf(input.result)
  const changes = compareRecipeCards(before, after)
  const added = changes.filter((c) => c.kind === 'added')
  const removed = changes.filter((c) => c.kind === 'removed')
  const changed = changes.filter((c) => c.kind === 'changed')
  const warnings: ReviseWarning[] = []
  const notesClaim = claimsNewRecipe(input.notes)
  const asked = claimsNewRecipe(input.instruction)
  const admitted = input.section === undefined || input.section === null ? before.length > 0 || after.length > 0 : recipesAdmitted(input.section, input.before)

  if ((notesClaim || asked) && added.length === 0) {
    if (!admitted) {
      warnings.push({
        code: 'recipes-not-admitted',
        message: `Este artículo no admite fichas de recetas según las reglas actuales (solo los de la sección «Recetas» o los que ya traen fichas), así que NO se ha añadido ninguna ficha${notesClaim ? ', aunque el resumen de Pepa diga lo contrario' : ''}. Si quieres la receta, escríbela en el texto o pídela en un artículo de recetas.`,
      })
    } else {
      const only = changed.length > 0 ? ` Solo se ${changed.length === 1 ? `modifica la ficha «${changed[0].title}»` : `modifican ${changed.length} fichas`}.` : ''
      warnings.push({
        code: notesClaim ? 'claims-new-recipe' : 'asked-new-recipe',
        message: notesClaim
          ? `Pepa dice que ha añadido una receta, pero la propuesta NO contiene ninguna ficha nueva.${only}`
          : `Pediste añadir una receta, pero la propuesta NO contiene ninguna ficha nueva.${only}`,
      })
    }
  }
  if (changes.length > 0 && !TOUCHES_RECIPES_RE.test(input.instruction) && !(notesClaim && added.length > 0)) {
    warnings.push({ code: 'unrequested-recipe-change', message: 'La instrucción no hablaba de recetas, pero la propuesta cambia fichas de recetas. Revísalas antes de aceptar.' })
  }
  if (removed.length > 0 && !/elimin|quit|borr|sustitu|cambi/i.test(input.instruction)) {
    warnings.push({ code: 'recipes-removed', message: `La propuesta elimina ${removed.length === 1 ? 'una ficha' : `${removed.length} fichas`} de recetas (${removed.map((r) => `«${r.title}»`).join(', ')}) y la instrucción no lo pedía.` })
  }
  return warnings
}

// ---- Edición manual de las fichas de un borrador ----------------------------------------------------------------------------------------------
// Se parte de las fichas ORIGINALES (JSON) y solo se cambian los campos editados: lo que el editor no muestra (tiempos, congelación, claves, etiquetas...) se conserva tal cual.
export interface RecipeCardEdit {
  key: string
  title: string
  servings: number | null
  ingredients: RecipeCardIngredient[]
  steps: string[]
  tip: string
  tags: string[]
}

export function cardsToEdits(cards: RecipeCard[]): RecipeCardEdit[] {
  return cards.map((c) => ({ key: c.key, title: c.title, servings: c.servings, ingredients: c.ingredients.map((i) => ({ ...i })), steps: [...c.steps], tip: c.tip ?? '', tags: [...c.tags] }))
}

export function applyRecipeEdits(original: unknown, edits: RecipeCardEdit[]): Rec[] {
  const base = Array.isArray(original) ? original.filter(isRec) : []
  return edits.map((e) => {
    const prev = base.find((r) => str(r.key) === e.key) ?? {}
    const out: Rec = { ...prev, key: e.key, title: e.title.trim(), servings: e.servings, ingredients: e.ingredients.map((i) => ({ name: i.name.trim(), quantity: i.quantity.trim(), unit: i.unit.trim() })), steps: e.steps.map((s) => s.trim()).filter(Boolean) }
    const tip = e.tip.trim()
    if (tip) out.tip = tip
    else delete out.tip
    if (e.tags.length > 0) out.tags = e.tags
    else delete out.tags
    return out
  })
}

// Mismas reglas que la base de datos al PUBLICAR (el servidor no las comprueba al guardar un borrador, por eso se exigen aquí). Devuelve el motivo o null.
export function validateRecipeEdits(original: unknown, edits: RecipeCardEdit[]): string | null {
  if (edits.length === 0) return null
  return validatePostRecipes(applyRecipeEdits(original, edits))
}

export function recipesChanged(original: unknown, edits: RecipeCardEdit[]): boolean {
  // Se compara contra las fichas tal como las ofrece el editor sin tocar nada (así normalizar espacios no cuenta como cambio).
  const untouched = cardsToEdits(readRecipeCards(original))
  return JSON.stringify(applyRecipeEdits(original, edits)) !== JSON.stringify(applyRecipeEdits(original, untouched))
}
