// Borrador de receta propuesta por la IA: escalado de raciones, formato de
// cantidades y paso a los datos que guarda PEPA. Código puro, sin acceso a
// datos ni a la IA.

export interface DraftIngredient {
  name: string
  // Cantidad numérica (la que devuelve la IA), que permite recalcular las
  // raciones. Si la persona escribe un texto libre al editar ("una pizca"),
  // se guarda tal cual en quantityText y ya no se escala.
  quantity: number | null
  quantityText: string | null
  unit: string | null
}

export interface RecipeDraftData {
  title: string
  servings: number
  timeMinutes: number | null
  ingredients: DraftIngredient[]
  steps: string[]
  tags: string[]
}

export const SERVING_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10]

// Las etiquetas que ya ofrece el sistema de recetas de PEPA.
export const RECIPE_TAG_OPTIONS = ['Postres', 'Fáciles de preparar', 'Vegetariano', 'Rápidas']

function trimZeros(text: string): string {
  return text.replace(/\.?0+$/, '')
}

// "400", "0.5", "1.5"... con PUNTO decimal: el formato de ingredientes de PEPA
// ("nombre, cantidad, unidad") separa los campos por comas, así que una coma
// dentro de la cantidad los descuadraría al guardar.
export function formatQuantity(quantity: number, unit: string | null): string {
  let rounded: number
  if (unit === 'g' || unit === 'ml') {
    rounded = quantity >= 100 ? Math.round(quantity / 10) * 10 : quantity >= 20 ? Math.round(quantity / 5) * 5 : Math.max(1, Math.round(quantity))
  } else if (unit === 'kg' || unit === 'l') {
    rounded = Math.round(quantity * 100) / 100
  } else {
    rounded = quantity < 10 ? Math.max(0.5, Math.round(quantity * 2) / 2) : Math.round(quantity)
  }
  return trimZeros(rounded.toFixed(2))
}

// Cantidad lista para guardar/mostrar: el texto libre si lo hay, o el número formateado.
export function quantityString(ingredient: DraftIngredient): string {
  if (ingredient.quantityText !== null) return ingredient.quantityText
  return ingredient.quantity === null ? '' : formatQuantity(ingredient.quantity, ingredient.unit)
}

// Recalcula las cantidades para otro número de raciones. Lo que tiene texto
// libre o no tiene cantidad se deja igual.
export function scaleDraft(draft: RecipeDraftData, servings: number): RecipeDraftData {
  if (servings === draft.servings || draft.servings <= 0) return { ...draft, servings }
  const ratio = servings / draft.servings
  return {
    ...draft,
    servings,
    ingredients: draft.ingredients.map((ing) =>
      ing.quantity !== null && ing.quantityText === null
        ? { ...ing, quantity: ing.quantity * ratio, quantityText: null }
        : ing,
    ),
  }
}

const SINGULAR_UNITS: Record<string, string> = {
  unidades: 'unidad',
  cucharadas: 'cucharada',
  cucharaditas: 'cucharadita',
  dientes: 'diente',
  lonchas: 'loncha',
  tazas: 'taza',
}

// "1 unidad", "2 unidades": la unidad en singular cuando la cantidad es exactamente 1.
export function unitFor(quantity: string, unit: string | null): string {
  if (!unit) return ''
  return quantity === '1' ? (SINGULAR_UNITS[unit] ?? unit) : unit
}

// Cómo se ve un ingrediente en la propuesta: "400 g lentejas".
export function ingredientDisplay(ingredient: DraftIngredient): string {
  const quantity = quantityString(ingredient)
  const parts = [quantity, quantity ? unitFor(quantity, ingredient.unit) : null, ingredient.name].filter(Boolean)
  return parts.join(' ')
}

// Texto libre para editar: una línea "nombre, cantidad, unidad" por ingrediente
// (el mismo formato que ya usa el formulario de recetas).
export function ingredientsToText(ingredients: DraftIngredient[]): string {
  return ingredients.map((i) => [i.name, quantityString(i), i.unit ?? ''].join(', ')).join('\n')
}

const NUMERIC = /^\d+(?:\.\d+)?$/

export function textToIngredients(text: string): DraftIngredient[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((p) => p.trim())
      // "agua, 1,5, l": una coma decimal partió la cantidad en dos trozos.
      if (parts.length >= 4 && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) parts.splice(1, 2, `${parts[1]}.${parts[2]}`)
      const [name = '', quantity = '', unit = ''] = parts
      const numeric = NUMERIC.test(quantity)
      return {
        name,
        quantity: numeric ? Number(quantity) : null,
        // Con número, se vuelve a formatear al guardar; con texto libre, se respeta tal cual.
        quantityText: numeric ? null : quantity || null,
        unit: unit || null,
      }
    })
    .filter((i) => i.name)
}

export function stepsToText(steps: string[]): string {
  return steps.join('\n')
}

export function textToSteps(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\s*[.)-]\s*/, '').trim())
    .filter(Boolean)
}

// El sistema de recetas de PEPA guarda "notas" de texto: primero las raciones y el
// tiempo, luego los pasos numerados.
export function composeNotes(draft: RecipeDraftData): string {
  const header = [`Raciones: ${draft.servings}`, draft.timeMinutes !== null ? `Tiempo aproximado: ${draft.timeMinutes} min` : null].filter(Boolean).join(' · ')
  const steps = draft.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')
  return `${header}\n\n${steps}`
}

// Parámetros de la acción recipe.create (todo texto, listo para validar y guardar).
export interface RecipeCreateParams {
  title: string
  servings: number
  timeMinutes: number | null
  ingredients: { name: string; quantity: string; unit: string }[]
  steps: string[]
  tags: string[]
}

export function draftToCreateParams(draft: RecipeDraftData): RecipeCreateParams {
  return {
    title: draft.title.trim(),
    servings: draft.servings,
    timeMinutes: draft.timeMinutes,
    ingredients: draft.ingredients.map((i) => ({
      name: i.name.trim(),
      quantity: quantityString(i),
      unit: quantityString(i) ? unitFor(quantityString(i), i.unit) : '',
    })),
    steps: draft.steps,
    tags: draft.tags,
  }
}

// De la respuesta de la IA (ya validada en el servidor) al borrador.
export function draftFromAi(raw: {
  title: string
  servings: number
  timeMinutes: number | null
  ingredients: { name: string; quantity: number | null; unit: string | null }[]
  steps: string[]
  tags: string[]
}): RecipeDraftData {
  return {
    title: raw.title,
    servings: raw.servings,
    timeMinutes: raw.timeMinutes,
    ingredients: raw.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, quantityText: null, unit: i.unit })),
    steps: raw.steps,
    tags: raw.tags,
  }
}
