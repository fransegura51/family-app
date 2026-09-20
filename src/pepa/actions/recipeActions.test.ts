import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/food', () => ({
  setMenuEntry: vi.fn(),
  updateMenuEntry: vi.fn(),
  addRecipeIngredientsToShoppingList: vi.fn(),
  createRecipe: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/data/shopping', () => ({ addShoppingItem: vi.fn() }))
vi.mock('@/data/calendar', () => ({ createEvent: vi.fn() }))

import { createRecipe } from '@/data/food'
import { proposeAction } from '@/pepa/actions/registry'
import { resetRecipeSaveGuard } from '@/pepa/actions/recipeActions'
import type { ActionContext } from '@/pepa/actions/types'

function ctx(overrides: Partial<ActionContext> = {}): ActionContext {
  return { recipes: [], menuEntries: [], shoppingItemNames: [], members: [], today: new Date(2026, 8, 20), ...overrides }
}

const VALID = {
  title: 'Lentejas con chorizo',
  servings: 4,
  timeMinutes: 60,
  ingredients: [
    { name: 'lentejas', quantity: '400', unit: 'g' },
    { name: 'chorizo', quantity: '2', unit: 'unidades' },
    { name: 'sal', quantity: '', unit: '' },
  ],
  steps: ['Sofríe la cebolla.', 'Añade las lentejas.'],
  tags: ['Fáciles de preparar'],
}

beforeEach(() => {
  vi.clearAllMocks()
  resetRecipeSaveGuard()
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
})

describe('recipe.create', () => {
  it('NO guarda nada hasta que se confirma', async () => {
    const result = proposeAction('recipe.create', VALID, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    expect(createRecipe).not.toHaveBeenCalled()
    const message = await result.proposal.confirm(result.proposal.initialSelection)
    expect(createRecipe).toHaveBeenCalledTimes(1)
    expect(message).toBe('Receta guardada: Lentejas con chorizo.')
  })

  it('guarda con las funciones de siempre: notas con raciones y pasos, ingredientes y etiquetas', async () => {
    const result = proposeAction('recipe.create', VALID, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    await result.proposal.confirm(result.proposal.initialSelection)
    expect(createRecipe).toHaveBeenCalledWith({
      title: 'Lentejas con chorizo',
      notes: 'Raciones: 4 · Tiempo aproximado: 60 min\n\n1. Sofríe la cebolla.\n2. Añade las lentejas.',
      ingredientLines: ['lentejas, 400, g', 'chorizo, 2, unidades', 'sal, , '],
      tags: ['Fáciles de preparar'],
      imagePath: null,
    })
  })

  it('un doble toque no crea dos recetas', async () => {
    const result = proposeAction('recipe.create', VALID, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    const selection = result.proposal.initialSelection
    const outcomes = await Promise.allSettled([result.proposal.confirm(selection), result.proposal.confirm(selection)])
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    expect(createRecipe).toHaveBeenCalledTimes(1)
    await expect(result.proposal.confirm(selection)).rejects.toThrow('ya se acaba de guardar')
  })

  it('si falla al guardar, se puede reintentar', async () => {
    vi.mocked(createRecipe).mockRejectedValueOnce(new Error('sin red'))
    const result = proposeAction('recipe.create', VALID, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    await expect(result.proposal.confirm(result.proposal.initialSelection)).rejects.toThrow('sin red')
    await expect(result.proposal.confirm(result.proposal.initialSelection)).resolves.toContain('Receta guardada')
    expect(createRecipe).toHaveBeenCalledTimes(2)
  })

  it('avisa si ya existe una receta con ese nombre', () => {
    const existing = [{ id: 'r1', familyId: 'f', title: 'lentejas con chorizo', notes: null, imagePath: null, tags: [], ingredients: [] }]
    const result = proposeAction('recipe.create', VALID, ctx({ recipes: existing }))
    if (!result.ok) throw new Error('debería ser válida')
    expect(result.proposal.preview(result.proposal.initialSelection).warnings).toHaveLength(1)
  })

  it('rechaza datos no válidos', () => {
    const cases: unknown[] = [
      { ...VALID, title: '' },
      { ...VALID, title: 'a\nb' },
      { ...VALID, title: 'a,b' },
      { ...VALID, servings: 0 },
      { ...VALID, servings: 2.5 },
      { ...VALID, timeMinutes: 0 },
      { ...VALID, ingredients: [] },
      { ...VALID, ingredients: [{ name: 'sal, fina', quantity: '', unit: '' }] },
      { ...VALID, ingredients: [{ name: 'agua', quantity: '1,5', unit: 'l' }] },
      { ...VALID, ingredients: [{ name: 'agua', quantity: 5, unit: 'l' }] },
      { ...VALID, ingredients: [{ name: 'agua', quantity: '1', unit: 'l', extra: 1 }] },
      { ...VALID, steps: [] },
      { ...VALID, steps: ['línea 1\nlínea 2'] },
      { ...VALID, steps: [''] },
      { ...VALID, tags: ['a', 'b', 'c', 'd'] },
      { ...VALID, tags: ['con,coma'] },
      { ...VALID, borrarTodo: true },
      'texto',
      null,
    ]
    for (const raw of cases) expect(proposeAction('recipe.create', raw, ctx()).ok).toBe(false)
  })

  it('una edición inválida hecha en la tarjeta no se guarda', async () => {
    const result = proposeAction('recipe.create', VALID, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    expect(createRecipe).not.toHaveBeenCalled()
    expect(proposeAction('recipe.create', { ...VALID, steps: [] }, ctx()).ok).toBe(false)
  })
})
