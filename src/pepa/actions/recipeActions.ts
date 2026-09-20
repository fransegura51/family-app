import { createRecipe } from '@/data/food'
import { composeNotes, type RecipeCreateParams } from '@/domain/recipeDraft'
import { normalize } from '@/domain/voiceQuery'
import { defineAction } from '@/pepa/actions/types'
import { asRecord, unknownKeys } from '@/pepa/actions/validators'

// recipe.create — guardar una receta propuesta (por la IA o escrita a mano en la
// tarjeta). Es la ÚNICA vía por la que una receta propuesta llega a guardarse, y
// usa la función de siempre (createRecipe).

const KEYS = ['title', 'servings', 'timeMinutes', 'ingredients', 'steps', 'tags'] as const
const NO_COMMA = /^[^,\n]*$/

function isShortText(value: unknown, min: number, max: number, allowComma = false): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max && (allowComma || NO_COMMA.test(value))
}

// Protección extra contra un doble toque: la misma receta no se guarda dos
// veces seguidas en pocos segundos.
const DOUBLE_SAVE_WINDOW_MS = 10_000
let lastSave: { signature: string; at: number } | null = null

function signatureOf(params: RecipeCreateParams): string {
  return JSON.stringify([normalize(params.title), params.servings, params.ingredients.length, params.steps.length])
}

export const recipeCreateAction = defineAction<RecipeCreateParams>({
  id: 'recipe.create',

  validate(raw) {
    const rec = asRecord(raw)
    if (!rec) return { ok: false, errors: ['Petición no válida'] }
    const errors: string[] = []
    const extra = unknownKeys(rec, KEYS)
    if (extra.length > 0) errors.push(`Campos no permitidos: ${extra.join(', ')}`)

    if (!isShortText(rec.title, 1, 80)) errors.push('El nombre de la receta no es válido')
    if (typeof rec.servings !== 'number' || !Number.isInteger(rec.servings) || rec.servings < 1 || rec.servings > 20) errors.push('Las raciones no son válidas')
    if (rec.timeMinutes !== null && (typeof rec.timeMinutes !== 'number' || !Number.isInteger(rec.timeMinutes) || rec.timeMinutes < 1 || rec.timeMinutes > 1440)) {
      errors.push('El tiempo no es válido')
    }

    const ingredients: RecipeCreateParams['ingredients'] = []
    if (!Array.isArray(rec.ingredients) || rec.ingredients.length < 1 || rec.ingredients.length > 30) errors.push('Los ingredientes no son válidos')
    else {
      for (const item of rec.ingredients) {
        const ing = asRecord(item)
        if (!ing || unknownKeys(ing, ['name', 'quantity', 'unit']).length > 0 || !isShortText(ing.name, 1, 60) || !(ing.quantity === '' || isShortText(ing.quantity, 1, 20)) || !(ing.unit === '' || isShortText(ing.unit, 1, 20))) {
          errors.push('Algún ingrediente no es válido')
          break
        }
        ingredients.push({ name: (ing.name as string).trim(), quantity: (ing.quantity as string).trim(), unit: (ing.unit as string).trim() })
      }
    }

    const steps: string[] = []
    if (!Array.isArray(rec.steps) || rec.steps.length < 1 || rec.steps.length > 20) errors.push('Los pasos no son válidos')
    else {
      for (const step of rec.steps) {
        if (!isShortText(step, 1, 400, true) || /\n/.test(step as string)) {
          errors.push('Algún paso no es válido')
          break
        }
        steps.push((step as string).trim())
      }
    }

    const tags: string[] = []
    if (!Array.isArray(rec.tags) || rec.tags.length > 3 || !rec.tags.every((t) => isShortText(t, 1, 30))) errors.push('Las etiquetas no son válidas')
    else tags.push(...(rec.tags as string[]).map((t) => t.trim()))

    if (errors.length > 0) return { ok: false, errors }
    return {
      ok: true,
      params: {
        title: (rec.title as string).trim(),
        servings: rec.servings as number,
        timeMinutes: rec.timeMinutes as number | null,
        ingredients,
        steps,
        tags,
      },
    }
  },

  initialSelection() {
    return { choices: {}, checked: [] }
  },

  applySelection(params) {
    return params
  },

  present(params, ctx) {
    const duplicate = ctx.recipes.some((r) => normalize(r.title).trim() === normalize(params.title).trim())
    return {
      title: '📖 Guardar receta',
      lines: [`${params.title} — ${params.servings} raciones`, `${params.ingredients.length} ingredientes, ${params.steps.length} pasos`],
      warnings: duplicate ? ['Ya tienes una receta con ese nombre: se guardará otra aparte.'] : [],
      choices: [],
      checks: [],
      confirmLabel: 'Guardar receta',
    }
  },

  async execute(params) {
    const signature = signatureOf(params)
    if (lastSave && lastSave.signature === signature && Date.now() - lastSave.at < DOUBLE_SAVE_WINDOW_MS) {
      throw new Error('Esta receta ya se acaba de guardar')
    }
    lastSave = { signature, at: Date.now() }
    try {
      await createRecipe({
        title: params.title,
        notes: composeNotes({
          title: params.title,
          servings: params.servings,
          timeMinutes: params.timeMinutes,
          ingredients: [],
          steps: params.steps,
          tags: params.tags,
        }),
        ingredientLines: params.ingredients.map((i) => [i.name, i.quantity, i.unit].join(', ')),
        tags: params.tags,
        imagePath: null,
      })
    } catch (err) {
      // Si no se ha guardado, se puede volver a intentar sin esperar.
      lastSave = null
      throw err
    }
    window.dispatchEvent(new CustomEvent('family-app:recipes-changed'))
    return `Receta guardada: ${params.title}.`
  },
})

// Solo para pruebas.
export function resetRecipeSaveGuard(): void {
  lastSave = null
}
