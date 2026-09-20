import { describe, expect, it } from 'vitest'
import { buildMenuAnswer, findRecipeMatches, menuEntryText } from './kitchenMenu'
import type { MenuEntry, Recipe } from './types'

function recipe(id: string, title: string): Recipe {
  return { id, familyId: 'f', title, notes: null, imagePath: null, tags: [], ingredients: [] }
}

function entry(id: string, entryDate: string, mealType: MenuEntry['mealType'], recipeId: string | null, freeText: string | null = null): MenuEntry {
  return { id, familyId: 'f', entryDate, mealType, recipeId, freeText }
}

const RECIPES = [
  recipe('r1', 'Tortilla de patata'),
  recipe('r2', 'Tortilla francesa'),
  recipe('r3', 'Lentejas con chorizo'),
  recipe('r4', 'Patatas bravas'),
  recipe('r5', 'Pizza'),
]

// Domingo 20 de septiembre de 2026.
const TODAY = new Date(2026, 8, 20)

describe('findRecipeMatches', () => {
  it('encuentra por una palabra, sin acentos ni mayúsculas', () => {
    expect(findRecipeMatches('TORTILLA', RECIPES).map((m) => m.recipe.id)).toEqual(['r2', 'r1'])
    expect(findRecipeMatches('lentéjas', RECIPES).map((m) => m.recipe.id)).toEqual(['r3'])
    expect(findRecipeMatches('lentejas', RECIPES).map((m) => m.recipe.id)).toEqual(['r3'])
  })

  it('el singular y el plural coinciden', () => {
    expect(findRecipeMatches('patata', RECIPES).map((m) => m.recipe.id)).toEqual(['r4', 'r1'])
    expect(findRecipeMatches('tortillas de patatas', RECIPES).map((m) => m.recipe.id)).toEqual(['r1'])
  })

  it('el nombre exacto gana', () => {
    const [best] = findRecipeMatches('pizza', RECIPES)
    expect(best.recipe.id).toBe('r5')
    expect(best.score).toBe(3)
  })

  it('nada parecido devuelve vacío', () => {
    expect(findRecipeMatches('dentista', RECIPES)).toEqual([])
    expect(findRecipeMatches('', RECIPES)).toEqual([])
    expect(findRecipeMatches('de la', RECIPES)).toEqual([])
  })
})

describe('menuEntryText', () => {
  it('usa el título de la receta o el texto libre', () => {
    expect(menuEntryText(entry('e', '2026-09-20', 'cena', 'r1'), RECIPES)).toBe('Tortilla de patata')
    expect(menuEntryText(entry('e', '2026-09-20', 'cena', null, ' Bocadillos '), RECIPES)).toBe('Bocadillos')
    expect(menuEntryText(entry('e', '2026-09-20', 'cena', 'zzz'), RECIPES)).toBeNull()
  })
})

describe('buildMenuAnswer', () => {
  const entries = [
    entry('e1', '2026-09-20', 'cena', 'r1'),
    entry('e2', '2026-09-20', 'comida', 'r3'),
    entry('e3', '2026-09-20', 'comida', null, 'Ensalada'),
    entry('e4', '2026-09-25', 'cena', 'r5'),
  ]

  it('una comida de hoy', () => {
    expect(buildMenuAnswer({ date: '2026-09-20', meals: ['cena'], entries, recipes: RECIPES, today: TODAY })).toEqual({
      text: 'Para la cena de hoy: Tortilla de patata.',
      recipeIds: ['r1'],
    })
  })

  it('varios platos se unen con "y"', () => {
    expect(buildMenuAnswer({ date: '2026-09-20', meals: ['comida'], entries, recipes: RECIPES, today: TODAY }).text).toBe(
      'Para la comida de hoy: Lentejas con chorizo y Ensalada.',
    )
  })

  it('un día con nombre usa "del"', () => {
    expect(buildMenuAnswer({ date: '2026-09-25', meals: ['cena'], entries, recipes: RECIPES, today: TODAY }).text).toBe(
      'Para la cena del viernes, 25 de septiembre: Pizza.',
    )
  })

  it('sin nada apuntado', () => {
    expect(buildMenuAnswer({ date: '2026-09-21', meals: ['cena'], entries, recipes: RECIPES, today: TODAY })).toEqual({
      text: 'No hay nada apuntado para la cena de mañana.',
      recipeIds: [],
    })
    expect(buildMenuAnswer({ date: '2026-09-21', meals: ['desayuno'], entries, recipes: RECIPES, today: TODAY }).text).toBe(
      'No hay nada apuntado para el desayuno de mañana.',
    )
  })

  it('comida y cena juntas', () => {
    expect(buildMenuAnswer({ date: '2026-09-20', meals: ['comida', 'cena'], entries, recipes: RECIPES, today: TODAY }).text).toBe(
      'Hoy. Comida: Lentejas con chorizo y Ensalada. Cena: Tortilla de patata.',
    )
    expect(buildMenuAnswer({ date: '2026-09-21', meals: ['comida', 'cena'], entries, recipes: RECIPES, today: TODAY }).text).toBe(
      'Mañana. Comida: sin apuntar. Cena: sin apuntar.',
    )
  })
})
