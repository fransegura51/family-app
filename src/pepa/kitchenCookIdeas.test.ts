// «¿Qué cocino hoy?» por voz: «tengo pepino, lechuga y tomate, ¿qué puedo cocinar?» → ideas con IA, contadas en voz alta; «la primera» → la receta para guardar.
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

vi.mock('@/data/food', () => ({ listRecipes: vi.fn(async () => []), listMenuEntries: vi.fn(async () => []), setMenuEntry: vi.fn(), updateMenuEntry: vi.fn(), addRecipeIngredientsToShoppingList: vi.fn(), createRecipe: vi.fn() }))
vi.mock('@/data/shoppingStores', () => ({ listShoppingStores: vi.fn(async () => []) }))
vi.mock('@/data/shopping', () => ({ listShoppingItems: vi.fn(async () => []), addShoppingItem: vi.fn(), addShoppingItems: vi.fn() }))
vi.mock('@/data/calendar', () => ({ createEvent: vi.fn() }))
vi.mock('@/data/location', () => ({ addPlace: vi.fn() }))
vi.mock('@/data/family', () => ({ listFamilyMembers: vi.fn(async () => [{ id: 'm1', name: 'A' }, { id: 'm2', name: 'B' }, { id: 'm3', name: 'C' }]) }))
vi.mock('@/services/whatToCook', () => ({ requestCookIdeas: ai.requestCookIdeas }))
vi.mock('@/services/aiClient', () => ({ AiUnavailableError: ai.AiUnavailableError }))

import type { CookIdeaData } from '@/domain/cookIdeas'
import { forgetCookIdeas, latestCookIdeas } from '@/pepa/cookIdeasStore'
import { handleKitchenText } from '@/pepa/kitchen'
import { forgetRecentRecipes } from '@/pepa/recentContext'

const TODAY = new Date(2026, 9, 13)
const ON = { recipeRequests: true }

const idea = (title: string, over: Partial<CookIdeaData> = {}): CookIdeaData => ({
  title,
  summary: 'Fresca.',
  missing: [],
  recipe: { title, servings: 3, timeMinutes: 15, ingredients: [{ name: 'Pepino', quantity: 1, quantityText: null, unit: 'unidades' }], steps: ['Corta.'], tags: [] },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  forgetCookIdeas()
  forgetRecentRecipes()
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.stubGlobal('CustomEvent', class { constructor(public type: string) {} })
})

describe('handleKitchenText: pedir ideas con lo que se tiene', () => {
  it('llama a la IA con los ingredientes y las raciones de la familia, y cuenta las ideas', async () => {
    ai.requestCookIdeas.mockResolvedValue([idea('Ensalada mixta'), idea('Gazpacho')])
    const out = await handleKitchenText('Pepa, tengo pepino, lechuga y tomate, ¿qué puedo cocinar?', 'create', TODAY, ON)
    expect(ai.requestCookIdeas).toHaveBeenCalledWith({ ingredients: ['pepino', 'lechuga', 'tomate'], servings: 3, preferences: [] })
    expect(out).toMatchObject({ kind: 'cook-ideas', ingredients: ['pepino', 'lechuga', 'tomate'] })
    if (out?.kind !== 'cook-ideas') throw new Error('debería dar ideas')
    expect(out.text).toContain('Con pepino, lechuga y tomate puedes hacer: Ensalada mixta')
    expect(out.ideas).toHaveLength(2)
    expect(latestCookIdeas()?.ideas).toHaveLength(2) // la pestaña las enseña al abrirse
  })

  it('con los botones de siempre (sin «Hablar con PEPA») no se activa', async () => {
    const out = await handleKitchenText('tengo pepino y tomate, ¿qué cocino?', 'create', TODAY, {})
    expect(ai.requestCookIdeas).not.toHaveBeenCalled()
    expect(out?.kind).not.toBe('cook-ideas')
  })

  it('si la IA no está disponible lo dice con claridad y no guarda nada', async () => {
    ai.requestCookIdeas.mockRejectedValueOnce(new ai.AiUnavailableError('daily_cap'))
    const capped = await handleKitchenText('tengo huevos, ¿qué cocino?', 'create', TODAY, ON)
    expect(capped).toMatchObject({ kind: 'answer', text: expect.stringContaining('límite diario') })
    ai.requestCookIdeas.mockRejectedValueOnce(new ai.AiUnavailableError('not_adult_account'))
    expect(await handleKitchenText('tengo huevos, ¿qué cocino?', 'create', TODAY, ON)).toMatchObject({ text: expect.stringContaining('cuentas de adultos') })
    ai.requestCookIdeas.mockRejectedValueOnce(new Error('sin red'))
    expect(await handleKitchenText('tengo huevos, ¿qué cocino?', 'create', TODAY, ON)).toMatchObject({ kind: 'answer', text: expect.stringContaining('No he podido preparar ideas') })
    expect(latestCookIdeas()).toBeNull()
  })

  it('«qué cenamos hoy» sigue siendo del menú, no de ideas de cocina', async () => {
    const out = await handleKitchenText('¿qué cenamos hoy?', 'ask', TODAY, ON)
    expect(ai.requestCookIdeas).not.toHaveBeenCalled()
    expect(out?.kind).not.toBe('cook-ideas')
  })
})

describe('handleKitchenText: elegir una de las ideas contadas', () => {
  async function withIdeas() {
    ai.requestCookIdeas.mockResolvedValue([idea('Ensalada mixta'), idea('Gazpacho andaluz'), idea('Pisto con huevo')])
    await handleKitchenText('tengo pepino, tomate y pimiento, ¿qué puedo cocinar?', 'create', TODAY, ON)
  }

  it('«la segunda» enseña la receta ya preparada (sin volver a llamar a la IA)', async () => {
    await withIdeas()
    ai.requestCookIdeas.mockClear()
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
