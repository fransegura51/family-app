import { describe, expect, it } from 'vitest'
import type { RecipeDraftInput } from '@/domain/community'
import { MAX_RECIPE_INGREDIENTS, MAX_RECIPE_TAGS, MAX_TAG_LENGTH, cleanRecipeDraft } from '@/domain/communityRecipeBridge'
import { COMMUNITY_RECIPE_LIMITS, draftToEditorRows, editorRowsToDraft } from '@/domain/communityRecipeEditor'
import { addIngredientRowAfter, moveStepRow, newIngredientRow, updateIngredientRow } from '@/domain/recipeEditor'

// Puente entre la copia pública (RecipeDraftInput) y las filas del editor compartido.
const draft: RecipeDraftInput = {
  servings: 6.5,
  ingredients: [
    { name: 'Patatas', quantity: '500', unit: 'g' },
    { name: 'Huevos', quantity: '6', unit: 'unidades' },
  ],
  steps: '1. Pelar las patatas.\n2. Cuajar la tortilla.',
  tags: ['favoritos'],
}

describe('límites de Comunidad', () => {
  it('son los que vuelve a comprobar el servidor', () => {
    expect(COMMUNITY_RECIPE_LIMITS.maxIngredients).toBe(MAX_RECIPE_INGREDIENTS)
    expect(COMMUNITY_RECIPE_LIMITS.maxTags).toBe(MAX_RECIPE_TAGS)
    expect(COMMUNITY_RECIPE_LIMITS.maxTagLength).toBe(MAX_TAG_LENGTH)
    expect(COMMUNITY_RECIPE_LIMITS.tagCase).toBe('lower')
  })
})

describe('copia pública ↔ filas del editor', () => {
  it('ida y vuelta sin pérdidas (y el resultado ya está «limpio»)', () => {
    const rows = draftToEditorRows(draft)
    expect(rows.servingsText).toBe('6.5')
    expect(rows.ingredients.map((r) => r.name)).toEqual(['Patatas', 'Huevos'])
    expect(rows.steps.map((s) => s.text)).toEqual(['Pelar las patatas.', 'Cuajar la tortilla.'])
    const back = editorRowsToDraft(rows, draft.tags)
    expect(back).toEqual(draft)
    expect(cleanRecipeDraft(back)).toEqual(back)
  })

  it('una receta vacía deja filas en blanco para empezar, que no viajan en el valor', () => {
    const rows = draftToEditorRows({ servings: null, ingredients: [], steps: '', tags: [] })
    expect(rows.ingredients).toHaveLength(3)
    expect(rows.steps).toHaveLength(2)
    expect(rows.servingsText).toBe('')
    expect(editorRowsToDraft(rows, [])).toEqual({ servings: null, ingredients: [], steps: '', tags: [] })
  })

  it('raciones inválidas escritas en la caja no viajan (null) y los saltos de línea dentro de un paso se unen', () => {
    const rows = draftToEditorRows(draft)
    expect(editorRowsToDraft({ ...rows, servingsText: '2.3' }, []).servings).toBeNull()
    expect(editorRowsToDraft({ ...rows, servingsText: '' }, []).servings).toBeNull()
    expect(editorRowsToDraft({ ...rows, servingsText: '8' }, []).servings).toBe(8)
    const steps = [{ id: 'x', text: 'uno\ndos' }]
    expect(editorRowsToDraft({ ...rows, steps }, []).steps).toBe('1. uno dos')
  })

  it('editar con las funciones del editor compartido llega a la copia pública', () => {
    const rows = draftToEditorRows(draft)
    const ingredients = updateIngredientRow(addIngredientRowAfter(rows.ingredients, null, COMMUNITY_RECIPE_LIMITS.maxIngredients), rows.ingredients[0].id, { quantity: '750' })
    const filled = [...ingredients.slice(0, 2), newIngredientRow({ name: 'Cebolla', quantity: '1', unit: 'unidades' })]
    const out = editorRowsToDraft({ ...rows, ingredients: filled, steps: moveStepRow(rows.steps, 0, 1) }, ['rápidas'])
    expect(out.ingredients.map((i) => `${i.name} ${i.quantity}`)).toEqual(['Patatas 750', 'Huevos 6', 'Cebolla 1'])
    expect(out.steps).toBe('1. Cuajar la tortilla.\n2. Pelar las patatas.')
    expect(out.tags).toEqual(['rápidas'])
  })
})
