import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/food', () => ({
  setMenuEntry: vi.fn().mockResolvedValue(undefined),
  updateMenuEntry: vi.fn().mockResolvedValue(undefined),
  addRecipeIngredientsToShoppingList: vi.fn().mockResolvedValue(undefined),
}))

import { addRecipeIngredientsToShoppingList, setMenuEntry, updateMenuEntry } from '@/data/food'
import { actionIds, proposeAction } from '@/pepa/actions/registry'
import type { ActionContext } from '@/pepa/actions/types'
import type { MenuEntry, Recipe } from '@/domain/types'

const RECIPES: Recipe[] = [
  {
    id: 'r1',
    familyId: 'f',
    title: 'Tortilla de patata',
    notes: null,
    imagePath: null,
    tags: [],
    ingredients: [
      { id: 'i1', name: 'Huevos', quantity: '6', unit: null },
      { id: 'i2', name: 'Patatas', quantity: '1', unit: 'kg' },
      { id: 'i3', name: 'Cebolla', quantity: null, unit: null },
    ],
  },
  { id: 'r2', familyId: 'f', title: 'Tortilla francesa', notes: null, imagePath: null, tags: [], ingredients: [] },
]

function entry(id: string, entryDate: string, mealType: MenuEntry['mealType'], recipeId: string | null, freeText: string | null = null): MenuEntry {
  return { id, familyId: 'f', entryDate, mealType, recipeId, freeText }
}

function ctx(overrides: Partial<ActionContext> = {}): ActionContext {
  return { recipes: RECIPES, menuEntries: [], shoppingItemNames: [], today: new Date(2026, 8, 20), ...overrides }
}

const validMenuSet = { date: '2026-09-25', mealType: 'cena', recipeId: 'r1', dishText: 'tortilla', alternatives: ['r1', 'r2'] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
})

describe('registro de acciones', () => {
  it('solo existen las acciones registradas', () => {
    expect(actionIds()).toEqual(['menu.set', 'menu.ingredients_to_shopping'])
    expect(proposeAction('calendar.deleteEverything', {}, ctx())).toEqual({ ok: false, errors: ['Acción no permitida'] })
  })
})

describe('menu.set', () => {
  it('propone y enseña lo que va a hacer', () => {
    const result = proposeAction('menu.set', validMenuSet, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    const view = result.proposal.preview(result.proposal.initialSelection)
    expect(view.lines).toEqual(['Plato: Tortilla de patata', 'Día: el viernes, 25 de septiembre'])
    expect(view.choices.map((c) => c.id)).toEqual(['meal', 'dish'])
    expect(view.warnings).toEqual([])
    expect(setMenuEntry).not.toHaveBeenCalled()
  })

  it('NO escribe nada hasta que se confirma', async () => {
    const result = proposeAction('menu.set', validMenuSet, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    expect(setMenuEntry).not.toHaveBeenCalled()
    expect(updateMenuEntry).not.toHaveBeenCalled()
    const message = await result.proposal.confirm(result.proposal.initialSelection)
    expect(setMenuEntry).toHaveBeenCalledWith({ entryDate: '2026-09-25', mealType: 'cena', recipeId: 'r1', freeText: null })
    expect(message).toContain('Apuntado en el menú: Tortilla de patata')
  })

  it('lo elegido en la tarjeta cambia lo que se guarda', async () => {
    const result = proposeAction('menu.set', validMenuSet, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    await result.proposal.confirm({ choices: { meal: 'comida', dish: 'free' }, checked: [] })
    expect(setMenuEntry).toHaveBeenCalledWith({ entryDate: '2026-09-25', mealType: 'comida', recipeId: null, freeText: 'tortilla' })
  })

  it('si el hueco ya tiene un plato lo avisa y lo sustituye en vez de duplicar', async () => {
    const context = ctx({ menuEntries: [entry('e1', '2026-09-25', 'cena', null, 'Lentejas')] })
    const result = proposeAction('menu.set', validMenuSet, context)
    if (!result.ok) throw new Error('debería ser válida')
    expect(result.proposal.preview(result.proposal.initialSelection).warnings).toEqual(['Ahora hay «Lentejas»: se sustituirá.'])
    await result.proposal.confirm(result.proposal.initialSelection)
    expect(updateMenuEntry).toHaveBeenCalledWith('e1', { recipeId: 'r1', freeText: null })
    expect(setMenuEntry).not.toHaveBeenCalled()
  })

  it('el aviso sigue a la comida elegida en la tarjeta', () => {
    const context = ctx({ menuEntries: [entry('e1', '2026-09-25', 'comida', null, 'Ensalada')] })
    const result = proposeAction('menu.set', validMenuSet, context)
    if (!result.ok) throw new Error('debería ser válida')
    expect(result.proposal.preview({ choices: { meal: 'comida', dish: 'r1' }, checked: [] }).warnings).toEqual(['Ahora hay «Ensalada»: se sustituirá.'])
  })

  it('rechaza parámetros no válidos', () => {
    const cases: unknown[] = [
      { ...validMenuSet, date: '2026-02-31' },
      { ...validMenuSet, mealType: 'brunch' },
      { ...validMenuSet, recipeId: 'no-existe' },
      { ...validMenuSet, recipeId: null, dishText: '   ' },
      { ...validMenuSet, alternatives: ['no-existe'] },
      { ...validMenuSet, dishText: 'x'.repeat(81) },
      { ...validMenuSet, borrarTodo: true },
      'texto',
      null,
      [],
    ]
    for (const raw of cases) expect(proposeAction('menu.set', raw, ctx()).ok).toBe(false)
  })

  it('una elección de la tarjeta con una receta inventada se rechaza al confirmar', async () => {
    const result = proposeAction('menu.set', validMenuSet, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    await expect(result.proposal.confirm({ choices: { meal: 'cena', dish: 'inventada' }, checked: [] })).rejects.toThrow('La receta no existe')
    expect(setMenuEntry).not.toHaveBeenCalled()
  })
})

describe('menu.ingredients_to_shopping', () => {
  const valid = { recipeId: 'r1', ingredientIds: ['i1', 'i2', 'i3'] }

  it('marca todo salvo lo que ya está en la lista', () => {
    const result = proposeAction('menu.ingredients_to_shopping', valid, ctx({ shoppingItemNames: ['huevos'] }))
    if (!result.ok) throw new Error('debería ser válida')
    expect(result.proposal.initialSelection.checked).toEqual(['i2', 'i3'])
    const view = result.proposal.preview(result.proposal.initialSelection)
    expect(view.checks).toEqual([
      { key: 'i1', label: 'Huevos — 6', note: 'ya está en la lista' },
      { key: 'i2', label: 'Patatas — 1 kg', note: undefined },
      { key: 'i3', label: 'Cebolla', note: undefined },
    ])
  })

  it('solo añade los ingredientes marcados, y solo al confirmar', async () => {
    const result = proposeAction('menu.ingredients_to_shopping', valid, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    expect(addRecipeIngredientsToShoppingList).not.toHaveBeenCalled()
    const message = await result.proposal.confirm({ choices: {}, checked: ['i2'] })
    expect(addRecipeIngredientsToShoppingList).toHaveBeenCalledWith(RECIPES[0], [{ ingredientId: 'i2', store: null }])
    expect(message).toBe('Añadido a la lista de la compra: Patatas.')
  })

  it('sin ningún ingrediente marcado no se puede confirmar', async () => {
    const result = proposeAction('menu.ingredients_to_shopping', valid, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    await expect(result.proposal.confirm({ choices: {}, checked: [] })).rejects.toThrow('Elige al menos un ingrediente')
    expect(addRecipeIngredientsToShoppingList).not.toHaveBeenCalled()
  })

  it('rechaza recetas o ingredientes que no existen', () => {
    expect(proposeAction('menu.ingredients_to_shopping', { recipeId: 'zzz', ingredientIds: ['i1'] }, ctx()).ok).toBe(false)
    expect(proposeAction('menu.ingredients_to_shopping', { recipeId: 'r1', ingredientIds: ['zzz'] }, ctx()).ok).toBe(false)
    expect(proposeAction('menu.ingredients_to_shopping', { recipeId: 'r1', ingredientIds: ['i1', 'i1'] }, ctx()).ok).toBe(false)
    expect(proposeAction('menu.ingredients_to_shopping', { ...valid, extra: 1 }, ctx()).ok).toBe(false)
  })
})
