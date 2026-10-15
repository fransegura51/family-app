// Lógica PURA del editor de recetas COMPARTIDO por la Cocina (receta privada) y Comunidad (copia pública independiente). Sin React ni red.
// La pantalla es una sola (`src/ui/recipeEditor/RecipeEditorFields.tsx`); aquí viven las reglas de las filas de ingredientes y pasos, de las etiquetas y de las
// raciones, para que las dos pantallas se comporten igual y se puedan probar sin navegador.
import { isValidServings } from '@/domain/recipeServings'

// Una fila de ingrediente tal como se edita: tres cajas («nombre · cantidad · unidad»). El id solo sirve para que React no confunda filas al subir/bajar/quitar.
export interface IngredientRow {
  id: string
  name: string
  quantity: string
  unit: string
}

// Un paso de la preparación tal como se edita (un cuadro de texto).
export interface StepRow {
  id: string
  text: string
}

// Particularidades de cada lado. Todo es opcional: sin límites (la Cocina) no se pone ninguno; Comunidad pasa los mismos que vuelve a comprobar el servidor.
export interface RecipeEditorLimits {
  maxIngredients?: number
  maxIngredientName?: number
  maxIngredientField?: number
  maxTags?: number
  maxTagLength?: number
  // 'lower' = las etiquetas se guardan en minúsculas y «Postres»/«postres» son la misma (Comunidad); 'keep' = tal cual se escriben (Cocina).
  tagCase?: 'keep' | 'lower'
}

// Sugerencias de unidad que se ofrecen al escribir en la caja «Unidad» (la persona puede escribir cualquier otra).
export const UNIT_SUGGESTIONS = ['g', 'kg', 'ml', 'l', 'unidades', 'cucharadas', 'cucharaditas', 'tazas', 'pizca', 'dientes', 'lonchas']

// Aviso común de raciones (mismo texto en la Cocina y en Comunidad).
export const SERVINGS_INVALID_TEXT = 'Las raciones deben ser un número entre 1 y 50, entero o con medio punto (6,5), o déjalo vacío.'

// ---- Filas

let rowSeq = 0

export function newIngredientRow(over: Partial<Omit<IngredientRow, 'id'>> = {}): IngredientRow {
  return { id: `ing-${++rowSeq}`, name: '', quantity: '', unit: '', ...over }
}

export function newStepRow(text = ''): StepRow {
  return { id: `step-${++rowSeq}`, text }
}

// Filas para empezar: tres ingredientes y dos pasos en blanco (da pistas de cuánto se espera sin obligar a nada).
export function blankIngredientRows(): IngredientRow[] {
  return [newIngredientRow(), newIngredientRow(), newIngredientRow()]
}

export function blankStepRows(): StepRow[] {
  return [newStepRow(), newStepRow()]
}

// Filas desde una lista guardada; si no hay ninguna se dejan las filas en blanco para empezar.
export function ingredientRowsFrom(list: Array<{ name: string; quantity?: string | null; unit?: string | null }>): IngredientRow[] {
  if (list.length === 0) return blankIngredientRows()
  return list.map((i) => newIngredientRow({ name: i.name, quantity: i.quantity ?? '', unit: i.unit ?? '' }))
}

export function stepRowsFrom(texts: string[]): StepRow[] {
  return texts.length > 0 ? texts.map((t) => newStepRow(t)) : blankStepRows()
}

// Las filas en blanco se quedan en pantalla pero no viajan al guardar: solo cuentan las que tienen nombre.
export function filledIngredients(rows: IngredientRow[]): IngredientRow[] {
  return rows.filter((r) => r.name.trim())
}

export function updateIngredientRow(rows: IngredientRow[], id: string, patch: Partial<Omit<IngredientRow, 'id'>>): IngredientRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
}

// Fila nueva justo debajo de `id` (o al final si id es null). Sin cambios si ya se ha llegado al máximo.
export function addIngredientRowAfter(rows: IngredientRow[], id: string | null, max?: number): IngredientRow[] {
  if (max !== undefined && rows.length >= max) return rows
  const at = id ? rows.findIndex((r) => r.id === id) + 1 : rows.length
  return [...rows.slice(0, at), newIngredientRow(), ...rows.slice(at)]
}

// Quitar una fila; la última nunca desaparece: se queda una en blanco.
export function removeIngredientRow(rows: IngredientRow[], id: string): IngredientRow[] {
  return rows.length > 1 ? rows.filter((r) => r.id !== id) : [newIngredientRow()]
}

export function updateStepRow(rows: StepRow[], id: string, text: string): StepRow[] {
  return rows.map((r) => (r.id === id ? { ...r, text } : r))
}

export function addStepRow(rows: StepRow[]): StepRow[] {
  return [...rows, newStepRow()]
}

export function removeStepRow(rows: StepRow[], id: string): StepRow[] {
  return rows.length > 1 ? rows.filter((r) => r.id !== id) : [newStepRow()]
}

// Subir (-1) o bajar (1) un paso. Fuera de los extremos no hace nada.
export function moveStepRow(rows: StepRow[], index: number, direction: -1 | 1): StepRow[] {
  const target = index + direction
  if (target < 0 || target >= rows.length) return rows
  const next = [...rows]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

// ---- Raciones

// Texto de la caja → número. Vacío = desconocidas (null, nunca 0). Admite coma decimal («6,5»). Un texto que no es número da NaN (inválido).
export function parseServingsText(text: string): number | null {
  const t = text.trim().replace(',', '.')
  return t === '' ? null : Number(t)
}

// Hay algo escrito y no vale (fuera de 1–50 o ni entero ni medio punto).
export function servingsTextInvalid(text: string): boolean {
  const parsed = parseServingsText(text)
  return parsed !== null && !isValidServings(parsed)
}

// Valor listo para guardar: el número si es válido, null si está vacío o no vale.
export function validServings(text: string): number | null {
  const parsed = parseServingsText(text)
  return isValidServings(parsed) ? parsed : null
}

// ---- Etiquetas

function tagKey(tag: string, limits: RecipeEditorLimits): string {
  return limits.tagCase === 'lower' ? tag.toLowerCase() : tag
}

export function tagIsOn(tags: string[], tag: string, limits: RecipeEditorLimits = {}): boolean {
  const key = tagKey(tag, limits)
  return tags.some((t) => tagKey(t, limits) === key)
}

// Etiquetas que no están entre las sugeridas (las propias de la persona): se enseñan aparte con una ✕ para quitarlas.
export function customTags(tags: string[], options: string[], limits: RecipeEditorLimits = {}): string[] {
  return tags.filter((t) => !tagIsOn(options, t, limits))
}

// Lo escrito en «Nueva etiqueta» → etiqueta limpia ('' si no hay nada).
export function cleanTagInput(raw: string, limits: RecipeEditorLimits = {}): string {
  let t = raw.trim()
  if (limits.tagCase === 'lower') t = t.toLowerCase()
  if (limits.maxTagLength !== undefined) t = t.slice(0, limits.maxTagLength)
  return t
}

export function tagsAtLimit(tags: string[], limits: RecipeEditorLimits = {}): boolean {
  return limits.maxTags !== undefined && tags.length >= limits.maxTags
}

// Marca o desmarca una etiqueta. Al marcar respeta el máximo (si ya está lleno no añade).
export function toggleTag(tags: string[], tag: string, limits: RecipeEditorLimits = {}): string[] {
  const key = tagKey(tag, limits)
  if (tagIsOn(tags, tag, limits)) return tags.filter((t) => tagKey(t, limits) !== key)
  if (tagsAtLimit(tags, limits)) return tags
  return [...tags, cleanTagInput(tag, limits) || tag]
}

// Añade la etiqueta escrita a mano (sin repetir, sin pasar del máximo).
export function addTag(tags: string[], raw: string, limits: RecipeEditorLimits = {}): string[] {
  const t = cleanTagInput(raw, limits)
  if (!t || tagIsOn(tags, t, limits) || tagsAtLimit(tags, limits)) return tags
  return [...tags, t]
}
