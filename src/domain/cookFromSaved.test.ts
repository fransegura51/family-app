import { describe, expect, it } from 'vitest'
import { describeSavedMatches, draftFromImportedRecipe, findRecipesWithIngredients } from '@/domain/cookFromSaved'
import type { Recipe } from '@/domain/types'

function recipe(title: string, ingredients: string[]): Recipe {
  return {
    id: title,
    familyId: 'f',
    title,
    notes: null,
    imagePath: null,
    tags: [],
    ingredients: ingredients.map((name, i) => ({ id: `${title}-${i}`, name, quantity: null, unit: null })),
  }
}

const RECIPES = [
  recipe('Ensalada mixta', ['Lechuga', 'Tomate', 'Pepino', 'Aceite', 'Sal']),
  recipe('Gazpacho', ['Tomates', 'Pepino', 'Pimiento verde', 'Ajo', 'Pan', 'Aceite de oliva']),
  recipe('Lentejas con chorizo', ['Lentejas', 'Chorizo', 'Zanahoria', 'Cebolla', 'Patata', 'Pimentón']),
  recipe('Tortilla de patata', ['Huevos', 'Patatas', 'Cebolla']),
  recipe('Paella de marisco', ['Arroz', 'Gambas', 'Mejillones', 'Calamares', 'Pimiento rojo', 'Caldo de pescado', 'Azafrán']),
]

describe('findRecipesWithIngredients (sin IA)', () => {
  it('encuentra la receta que se puede hacer entera, aunque cambien plurales y mayúsculas', () => {
    const found = findRecipesWithIngredients(['pepino', 'lechuga', 'tomate'], RECIPES)
    expect(found[0].recipe.title).toBe('Ensalada mixta')
    expect(found[0].missing).toEqual([]) // la sal y el aceite se dan por hechos
    expect(found[0].have.sort()).toEqual(['lechuga', 'pepino', 'tomate'])
  })

  it('las que casi se pueden hacer salen detrás, diciendo qué falta (máximo 3)', () => {
    const found = findRecipesWithIngredients(['pepino', 'lechuga', 'tomate'], RECIPES)
    const gazpacho = found.find((m) => m.recipe.title === 'Gazpacho')
    expect(gazpacho?.missing).toEqual(['Pimiento verde', 'Ajo', 'Pan'])
    expect(found.map((m) => m.recipe.title)).not.toContain('Paella de marisco')
  })

  it('«tomate» y «tomates», «patata» y «patatas» son lo mismo; «pimiento rojo» ≈ «pimiento»', () => {
    const found = findRecipesWithIngredients(['patata', 'huevo', 'cebolla'], RECIPES)
    expect(found[0].recipe.title).toBe('Tortilla de patata')
    expect(found[0].missing).toEqual([])
    const paella = findRecipesWithIngredients(['arroz', 'pimiento', 'gambas', 'mejillones', 'calamares', 'azafrán'], RECIPES)
    expect(paella[0].recipe.title).toBe('Paella de marisco')
    expect(paella[0].missing).toEqual(['Caldo de pescado'])
  })

  it('una receta sin ningún ingrediente en común no sale, ni una con demasiadas faltas', () => {
    expect(findRecipesWithIngredients(['kiwi', 'mango'], RECIPES)).toEqual([])
    expect(findRecipesWithIngredients(['arroz'], RECIPES)).toEqual([])
  })

  it('sin recetas guardadas, nada', () => {
    expect(findRecipesWithIngredients(['pepino'], [])).toEqual([])
    expect(findRecipesWithIngredients(['pepino'], [recipe('Vacía', [])])).toEqual([])
  })

  it('devuelve como mucho 5, primero las enteras', () => {
    const many = Array.from({ length: 8 }, (_, i) => recipe(`Plato ${i}`, i < 3 ? ['Tomate'] : ['Tomate', 'Queso']))
    const found = findRecipesWithIngredients(['tomate'], many)
    expect(found).toHaveLength(5)
    expect(found.slice(0, 3).every((m) => m.missing.length === 0)).toBe(true)
  })
})

describe('describeSavedMatches', () => {
  it('cuenta las recetas y ofrece la IA como paso aparte', () => {
    const text = describeSavedMatches(['pepino', 'lechuga', 'tomate'], findRecipesWithIngredients(['pepino', 'lechuga', 'tomate'], RECIPES))
    expect(text).toContain('De tus recetas guardadas, con pepino, lechuga y tomate puedes hacer: Ensalada mixta, que tienes entera')
    expect(text).toContain('pídeselas a la IA')
  })

  it('suma las recetas encontradas en internet', () => {
    const text = describeSavedMatches(['pepino'], [], ['Gazpacho', 'Salmorejo', 'Pisto', 'Otra'])
    expect(text).toContain('No tienes ninguna receta guardada que se pueda hacer con pepino.')
    expect(text).toContain('En internet he encontrado: Gazpacho, Salmorejo y Pisto.')
    expect(text).not.toContain('Otra')
  })

  it('si no hay nada guardado ni en internet, lo dice y pregunta por la IA', () => {
    expect(describeSavedMatches(['kiwi'], [])).toBe('No tienes ninguna receta guardada que se pueda hacer con kiwi, y no he encontrado nada en internet. ¿Quieres que le pida ideas a la IA?')
  })
})

describe('draftFromImportedRecipe (receta de internet → borrador para guardar)', () => {
  it('convierte la receta en un borrador revisable, sin comas en los ingredientes y con los pasos sin numerar', () => {
    const draft = draftFromImportedRecipe(
      { title: ' Gazpacho ', ingredients: ['1 kg de tomates, maduros', '1 pepino', ''], instructions: '1. Tritura todo.\n2) Enfría.\n\nSirve.', servings: 4 },
      2,
    )
    expect(draft.title).toBe('Gazpacho')
    expect(draft.servings).toBe(4)
    expect(draft.ingredients.map((i) => i.name)).toEqual(['1 kg de tomates maduros', '1 pepino'])
    expect(draft.steps).toEqual(['Tritura todo.', 'Enfría.', 'Sirve.'])
  })

  it('sin raciones en la ficha usa las pedidas; con demasiados pasos o texto, no pierde nada pero cabe en lo que admite una receta guardada', () => {
    const many = Array.from({ length: 25 }, (_, i) => `Paso ${i + 1}`).join('\n')
    const draft = draftFromImportedRecipe({ title: 'Larga', ingredients: Array.from({ length: 40 }, (_, i) => `ingrediente ${i}`), instructions: many, servings: null }, 3)
    expect(draft.servings).toBe(3)
    expect(draft.ingredients).toHaveLength(30)
    expect(draft.steps).toHaveLength(20)
    expect(draft.steps[19]).toContain('Paso 25')
    const long = draftFromImportedRecipe({ title: 'x', ingredients: ['a'], instructions: 'y'.repeat(500), servings: 99 }, 3)
    expect(long.steps[0].length).toBeLessThanOrEqual(400)
    expect(long.servings).toBe(3)
  })
})
