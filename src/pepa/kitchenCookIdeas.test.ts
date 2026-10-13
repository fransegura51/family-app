// «¿Qué cocino hoy?» por voz: «tengo pepino, lechuga y tomate, ¿qué puedo cocinar?» → PRIMERO tus recetas guardadas y recetas de internet (gratis); la IA solo si
// se pide («pídeselas a la IA»); «la primera» → la receta para guardar.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recipe } from '@/domain/types'

const ai = vi.hoisted(() => ({
  requestCookIdeas: vi.fn(),
  AiUnavailableError: class AiUnavailableError extends Error {
    readonly reason: string
    constructor(reason: string) {
      super(reason)
      this.reason = reason
    }
  },
}))
const store = vi.hoisted(() => ({ recipes: [] as unknown[], web: [] as { id: string; title: string; imageUrl: string | null; url: string }[], webFails: false }))

vi.mock('@/data/food', () => ({ listRecipes: vi.fn(async () => store.recipes), listMenuEntries: vi.fn(async () => []), setMenuEntry: vi.fn(), updateMenuEntry: vi.fn(), addRecipeIngredientsToShoppingList: vi.fn(), createRecipe: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn(async () => []) }))
vi.mock('@/data/shopping', () => ({ listShoppingItems: vi.fn(async () => []), addShoppingItem: vi.fn(), addShoppingItems: vi.fn() }))
vi.mock('@/data/calendar', () => ({ createEvent: vi.fn() }))
vi.mock('@/data/location', () => ({ addPlace: vi.fn() }))
vi.mock('@/data/family', () => ({ listFamilyMembers: vi.fn(async () => [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }, { id: 'm3', name: 'C' }]) }))
vi.mock('@/services/whatToCook', () => ({ requestCookIdeas: ai.requestCookIdeas }))
vi.mock('@/services/aiClient', () => ({ AiUnavailableError: ai.AiUnavailableError }))
vi.mock('@/services/cookpadSearch', () => ({
  searchCookpadRecipes: vi.fn(async () => {
    if (store.webFails) throw new Error('sin red')
    return store.web
  }),
}))

import type { CookIdeaData } from '@/domain/cookIdeas'
import { forgetCookIdeas, latestCookIdeas } from '@/pepa/cookIdeasStore'
import { handleKitchenText } from '@/pepa/kitchen'
import { forgetRecentRecipes } from '@/pepa/recentContext'
import { searchCookpadRecipes } from '@/services/cookpadSearch'

const TODAY = new Date(2026, 9, 13)
const ON = { recipeRequests: true }

const idea = (title: string, over: Partial<CookIdeaData> = {}): CookIdeaData => ({
  title,
  summary: 'Fresca.',
  missing: [],
  recipe: { title, servings: 3, timeMinutes: 15, ingredients: [{ name: 'Pepino', quantity: 1, quantityText: null, unit: 'unidades' }], steps: ['Corta.'], tags: [] },
  ...over,
})

function savedRecipe(title: string, ingredients: string[]): Recipe {
  return { id: title, familyId: 'f', title, notes: null, imagePath: null, tags: [], ingredients: ingredients.map((name, i) => ({ id: `${title}${i}`, name, quantity: null, unit: null })) }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.recipes = []
  store.web = []
  store.webFails = false
  forgetCookIdeas()
  forgetRecentRecipes()
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} })
})

describe('handleKitchenText: pedir ideas con lo que se tiene (primero gratis)', () => {
  it('busca en tus recetas guardadas y en internet, sin llamar a la IA, y lo cuenta por voz', async () => {
    store.recipes = [savedRecipe('Ensalada mixta', ['Lechuga', 'Tomate', 'Pepino', 'Aceite'])]
    store.web = [{ id: 'w1', title: 'Gazpacho fresquito', imageUrl: null, url: 'https://cookpad.com/es/recetas/1' }]
    const out = await handleKitchenText('Pepa, tengo pepino, lechuga y tomate, ¿qué puedo cocinar?', 'create', TODAY, ON)
    expect(ai.requestCookIdeas).not.toHaveBeenCalled()
    expect(searchCookpadRecipes).toHaveBeenCalledWith('pepino lechuga tomate')
    expect(out).toMatchObject({ kind: 'cook-ideas', ingredients: ['pepino', 'lechuga', 'tomate'], ideas: [] })
    if (out?.kind !== 'cook-ideas') throw new Error('debería contar recetas')
    expect(out.text).toContain('De tus recetas guardadas, con pepino, lechuga y tomate puedes hacer: Ensalada mixta, que tienes entera.')
    expect(out.text).toContain('En internet he encontrado: Gazpacho fresquito.')
    expect(out.text).toContain('pídeselas a la IA')
    const remembered = latestCookIdeas()
    expect(remembered?.saved).toHaveLength(1)
    expect(remembered?.web).toHaveLength(1) // la pestaña lo enseña al abrirse
  })

  it('sin recetas guardadas ni nada en internet, lo dice y pregunta por la IA', async () => {
    const out = await handleKitchenText('tengo kiwi y mango, ¿qué cocino?', 'create', TODAY, ON)
    expect(out).toMatchObject({ kind: 'cook-ideas', text: expect.stringContaining('¿Quieres que le pida ideas a la IA?') })
    expect(ai.requestCookIdeas).not.toHaveBeenCalled()
  })

  it('si internet falla, sigue con lo guardado', async () => {
    store.webFails = true
    store.recipes = [savedRecipe('Tortilla', ['Huevos', 'Patatas'])]
    const out = await handleKitchenText('tengo huevos y patatas, ¿qué puedo cocinar?', 'create', TODAY, ON)
    expect(out).toMatchObject({ kind: 'cook-ideas', text: expect.stringContaining('Tortilla') })
  })

  it('con los botones de siempre (sin «Hablar con PEPA») no se activa', async () => {
    const out = await handleKitchenText('tengo pepino y tomate, ¿qué cocino?', 'create', TODAY, {})
    expect(ai.requestCookIdeas).not.toHaveBeenCalled()
    expect(out?.kind).not.toBe('cook-ideas')
  })

  it('«qué cenamos hoy» sigue siendo del menú, no de ideas de cocina', async () => {
    const out = await handleKitchenText('¿qué cenamos hoy?', 'ask', TODAY, ON)
    expect(ai.requestCookIdeas).not.toHaveBeenCalled()
    expect(out?.kind).not.toBe('cook-ideas')
  })
})

describe('handleKitchenText: pedir más ideas a la IA (solo si se pide)', () => {
  async function afterFreeSearch() {
    await handleKitchenText('tengo pepino, tomate y pimiento, ¿qué puedo cocinar?', 'create', TODAY, ON)
    ai.requestCookIdeas.mockClear()
  }

  it('«pídeselas a la IA» llama a la IA con los mismos ingredientes y las raciones de la familia, y cuenta las ideas', async () => {
    await afterFreeSearch()
    ai.requestCookIdeas.mockResolvedValue([idea('Ensalada mixta'), idea('Gazpacho')])
    const out = await handleKitchenText('pídeselas a la IA', 'create', TODAY, ON)
    expect(ai.requestCookIdeas).toHaveBeenCalledWith({ ingredients: ['pepino', 'tomate', 'pimiento'], servings: 3, preferences: [] })
    expect(out).toMatchObject({ kind: 'cook-ideas', ingredients: ['pepino', 'tomate', 'pimiento'] })
    if (out?.kind !== 'cook-ideas') throw new Error('debería dar ideas')
    expect(out.text).toContain('puedes hacer: Ensalada mixta')
    expect(latestCookIdeas()?.ideas).toHaveLength(2)
  })

  it('también con un «sí» tras la pregunta', async () => {
    await afterFreeSearch()
    ai.requestCookIdeas.mockResolvedValue([idea('Ensalada mixta')])
    expect(await handleKitchenText('sí, por favor', 'create', TODAY, ON)).toMatchObject({ kind: 'cook-ideas' })
    expect(ai.requestCookIdeas).toHaveBeenCalledTimes(1)
  })

  it('si la IA no está disponible lo dice con claridad y no guarda nada', async () => {
    await afterFreeSearch()
    ai.requestCookIdeas.mockRejectedValueOnce(new ai.AiUnavailableError('daily_cap'))
    expect(await handleKitchenText('pídeselas a la IA', 'create', TODAY, ON)).toMatchObject({ kind: 'answer', text: expect.stringContaining('límite diario') })
    ai.requestCookIdeas.mockRejectedValueOnce(new ai.AiUnavailableError('not_adult_account'))
    expect(await handleKitchenText('pídeselas a la IA', 'create', TODAY, ON)).toMatchObject({ text: expect.stringContaining('cuentas de adultos') })
    ai.requestCookIdeas.mockRejectedValueOnce(new Error('sin red'))
    expect(await handleKitchenText('pídeselas a la IA', 'create', TODAY, ON)).toMatchObject({ kind: 'answer', text: expect.stringContaining('No he podido preparar ideas') })
    expect(latestCookIdeas()?.ideas).toEqual([])
  })

  it('sin una búsqueda reciente, «sí» o «la IA» no hacen nada', async () => {
    expect(await handleKitchenText('sí', 'create', TODAY, ON)).toBeNull()
    expect(ai.requestCookIdeas).not.toHaveBeenCalled()
  })
})

describe('handleKitchenText: elegir una de las ideas de la IA', () => {
  async function withIdeas() {
    await handleKitchenText('tengo pepino, tomate y pimiento, ¿qué puedo cocinar?', 'create', TODAY, ON)
    ai.requestCookIdeas.mockResolvedValue([idea('Ensalada mixta'), idea('Gazpacho andaluz'), idea('Pisto con huevo')])
    await handleKitchenText('pídeselas a la IA', 'create', TODAY, ON)
    ai.requestCookIdeas.mockClear()
  }

  it('«la segunda» enseña la receta ya preparada (sin volver a llamar a la IA)', async () => {
    await withIdeas()
    const out = await handleKitchenText('la segunda', 'create', TODAY, ON)
    expect(out).toMatchObject({ kind: 'recipe-offer', request: { dish: 'Gazpacho andaluz', draft: { title: 'Gazpacho andaluz' } } })
    expect(ai.requestCookIdeas).not.toHaveBeenCalled()
  })

  it('también por nombre', async () => {
    await withIdeas()
    expect(await handleKitchenText('quiero la del pisto', 'create', TODAY, ON)).toMatchObject({ kind: 'recipe-offer', request: { dish: 'Pisto con huevo' } })
  })

  it('una orden de apuntar no se confunde con una elección («añade dos limones»)', async () => {
    await withIdeas()
    expect(await handleKitchenText('añade dos limones', 'create', TODAY, ON)).toBeNull()
    expect(await handleKitchenText('apunta la segunda cita del dentista en el calendario para el viernes por la tarde', 'create', TODAY, ON)).toBeNull()
  })

  it('sin ideas recientes, «la primera» no hace nada', async () => {
    expect(await handleKitchenText('la primera', 'create', TODAY, ON)).toBeNull()
  })
})
