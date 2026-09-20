import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MenuEntry, Recipe } from '@/domain/types'

const recipes: Recipe[] = []
const menu: MenuEntry[] = []
let memberCount = 5

vi.mock('@/data/food', () => ({
  listRecipes: vi.fn(async () => recipes),
  listMenuEntries: vi.fn(async () => menu),
  setMenuEntry: vi.fn(),
  updateMenuEntry: vi.fn(),
  addRecipeIngredientsToShoppingList: vi.fn(),
  createRecipe: vi.fn(),
}))
vi.mock('@/data/shopping', () => ({ listShoppingItems: vi.fn(async () => []), addShoppingItem: vi.fn() }))
vi.mock('@/data/calendar', () => ({ createEvent: vi.fn() }))
vi.mock('@/data/family', () => ({
  listFamilyMembers: vi.fn(async () => {
    if (memberCount < 0) throw new Error('sin red')
    return Array.from({ length: memberCount }, (_, i) => ({ id: `m${i}`, name: `Persona ${i}` }))
  }),
}))

import { handleKitchenText } from '@/pepa/kitchen'
import { forgetRecentRecipes } from '@/pepa/recentContext'

const TODAY = new Date(2026, 8, 20)
const ON = { recipeRequests: true }

function recipe(id: string, title: string, ingredients: string[] = ['Lentejas']): Recipe {
  return {
    id,
    familyId: 'f',
    title,
    notes: null,
    imagePath: null,
    tags: [],
    ingredients: ingredients.map((name, i) => ({ id: `${id}-i${i}`, name, quantity: null, unit: null })),
  }
}

beforeEach(() => {
  recipes.length = 0
  menu.length = 0
  memberCount = 5
  forgetRecentRecipes()
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
})

describe('Cocina: petición de receta que no existe', () => {
  it('ofrece prepararla en vez de inventarla', async () => {
    const outcome = await handleKitchenText('Quiero hacer lentejas con chorizo y no tengo la receta', 'create', TODAY, ON)
    expect(outcome).toEqual({
      kind: 'recipe-offer',
      text: 'No tienes esa receta guardada. ¿Quieres que te prepare una?',
      request: { dish: 'lentejas con chorizo', servings: 5, preferences: [] },
    })
  })

  it('usa las raciones que se han dicho', async () => {
    const outcome = await handleKitchenText('Dame una receta de lentejas con chorizo para cuatro', 'create', TODAY, ON)
    expect(outcome).toMatchObject({ kind: 'recipe-offer', request: { dish: 'lentejas con chorizo', servings: 4 } })
  })

  it('sin raciones dichas: el tamaño de la familia, entre 2 y 8', async () => {
    memberCount = 12
    expect(await handleKitchenText('quiero hacer una paella', 'create', TODAY, ON)).toMatchObject({ request: { servings: 8 } })
    memberCount = 1
    expect(await handleKitchenText('quiero hacer una paella', 'create', TODAY, ON)).toMatchObject({ request: { servings: 4 } })
    memberCount = -1
    expect(await handleKitchenText('quiero hacer una paella', 'create', TODAY, ON)).toMatchObject({ request: { servings: 4 } })
  })

  it('las preferencias expresas se conservan', async () => {
    const outcome = await handleKitchenText('quiero hacer una lasaña sin gluten para cuatro', 'create', TODAY, ON)
    expect(outcome).toMatchObject({ request: { dish: 'lasaña', servings: 4, preferences: ['sin gluten'] } })
  })

  it('"somos dos" cambia las raciones de la petición reciente', async () => {
    await handleKitchenText('quiero hacer una paella para seis', 'create', TODAY, ON)
    const outcome = await handleKitchenText('somos dos', 'create', TODAY, ON)
    expect(outcome).toMatchObject({ kind: 'recipe-offer', request: { dish: 'paella', servings: 2 } })
    expect((outcome as { text: string }).text).toContain('para 2')
  })

  it('"somos dos" sin una petición reciente no hace nada', async () => {
    expect(await handleKitchenText('somos dos', 'create', TODAY, ON)).toBeNull()
  })
})

describe('Cocina: si la receta ya existe, se usa la de la familia', () => {
  it('no ofrece generar nada y propone añadir sus ingredientes', async () => {
    recipes.push(recipe('r1', 'Lentejas con chorizo', ['Lentejas', 'Chorizo']))
    const outcome = await handleKitchenText('Quiero hacer lentejas con chorizo y no tengo la receta', 'create', TODAY, ON)
    if (!outcome || outcome.kind !== 'proposal') throw new Error('debería proponer los ingredientes')
    expect(outcome.text).toContain('Ya tienes «Lentejas con chorizo»')
    expect(outcome.proposal.actionId).toBe('menu.ingredients_to_shopping')
  })

  it('una receta con parecido flojo no cuenta: se ofrece preparar una nueva', async () => {
    recipes.push(recipe('r2', 'Lentejas'))
    const outcome = await handleKitchenText('quiero hacer lentejas con chorizo y verduras', 'create', TODAY, ON)
    expect(outcome?.kind).toBe('recipe-offer')
  })

  it('con la receta sin ingredientes lo dice', async () => {
    recipes.push(recipe('r3', 'Paella', []))
    expect(await handleKitchenText('quiero hacer una paella', 'create', TODAY, ON)).toEqual({
      kind: 'answer',
      text: '«Paella» no tiene ingredientes apuntados.',
    })
  })
})

describe('Cocina: los botones de siempre no cambian', () => {
  it('sin la opción, las peticiones de receta y "somos dos" no se tratan', async () => {
    expect(await handleKitchenText('Quiero hacer lentejas con chorizo y no tengo la receta', 'create', TODAY)).toBeNull()
    expect(await handleKitchenText('Quiero hacer lentejas con chorizo y no tengo la receta', 'ask', TODAY)).toBeNull()
    expect(await handleKitchenText('somos dos', 'create', TODAY)).toBeNull()
  })

  it('pon tortilla de patatas para cenar el viernes sigue proponiendo apuntarla en el menú', async () => {
    recipes.push(recipe('r4', 'Tortilla de patata'))
    for (const options of [{}, ON]) {
      const outcome = await handleKitchenText('Pon tortilla de patatas para cenar el viernes', 'create', TODAY, options)
      if (!outcome || outcome.kind !== 'proposal') throw new Error('debería proponer')
      expect(outcome.proposal.actionId).toBe('menu.set')
      expect(outcome.text).toContain('«Tortilla de patata»')
      expect(outcome.text).toContain('en la cena')
    }
  })

  it('las consultas siguen igual', async () => {
    const outcome = await handleKitchenText('¿qué cenamos hoy?', 'ask', TODAY, ON)
    expect(outcome).toEqual({ kind: 'answer', text: 'No hay nada apuntado para la cena de hoy.' })
  })
})
