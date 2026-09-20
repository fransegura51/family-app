import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/data/food', () => ({
  setMenuEntry: vi.fn().mockResolvedValue(undefined),
  updateMenuEntry: vi.fn().mockResolvedValue(undefined),
  addRecipeIngredientsToShoppingList: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/data/shopping', () => ({ addShoppingItem: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/data/calendar', () => ({ createEvent: vi.fn().mockResolvedValue(undefined) }))

import { createEvent } from '@/data/calendar'
import { addRecipeIngredientsToShoppingList, setMenuEntry, updateMenuEntry } from '@/data/food'
import { addShoppingItem } from '@/data/shopping'
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
  return { recipes: RECIPES, menuEntries: [], shoppingItemNames: [], members: [], today: new Date(2026, 8, 20), ...overrides }
}

const validMenuSet = { date: '2026-09-25', mealType: 'cena', recipeId: 'r1', dishText: 'tortilla', alternatives: ['r1', 'r2'] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
})

describe('registro de acciones', () => {
  it('solo existen las acciones registradas', () => {
    expect(actionIds()).toEqual(['menu.set', 'menu.ingredients_to_shopping', 'shopping.add', 'calendar.create'])
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

describe('shopping.add', () => {
  const valid = { store: 'Mercadona', items: ['leche', 'huevos', 'pan'], skipped: [] }

  it('enseña los productos y no escribe hasta confirmar', async () => {
    const result = proposeAction('shopping.add', valid, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    const view = result.proposal.preview(result.proposal.initialSelection)
    expect(view.lines).toEqual(['Tienda: Mercadona'])
    expect(view.checks.map((c) => c.label)).toEqual(['leche', 'huevos', 'pan'])
    expect(addShoppingItem).not.toHaveBeenCalled()
    const message = await result.proposal.confirm(result.proposal.initialSelection)
    expect(addShoppingItem).toHaveBeenCalledTimes(3)
    expect(addShoppingItem).toHaveBeenCalledWith({ name: 'leche', quantity: '', unit: '', priority: 'normal', tripId: null, store: 'Mercadona' })
    expect(message).toBe('Apuntado en la lista de la compra (Mercadona): leche, huevos, pan.')
  })

  it('los productos desmarcados no se añaden, y se pueden volver a marcar', async () => {
    const result = proposeAction('shopping.add', valid, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    const unchecked = { choices: {}, checked: ['0', '2'] }
    expect(result.proposal.preview(unchecked).checks.map((c) => c.label)).toEqual(['leche', 'huevos', 'pan'])
    await result.proposal.confirm(unchecked)
    expect(addShoppingItem).toHaveBeenCalledTimes(2)
    expect(vi.mocked(addShoppingItem).mock.calls.map((c) => c[0].name)).toEqual(['leche', 'pan'])
  })

  it('sin ningún producto marcado no se puede confirmar', async () => {
    const result = proposeAction('shopping.add', valid, ctx())
    if (!result.ok) throw new Error('debería ser válida')
    await expect(result.proposal.confirm({ choices: {}, checked: [] })).rejects.toThrow('Elige al menos un producto')
    expect(addShoppingItem).not.toHaveBeenCalled()
  })

  it('sin tienda', () => {
    expect(proposeAction('shopping.add', { ...valid, store: null }, ctx()).ok).toBe(true)
  })

  it('rechaza datos no válidos', () => {
    const cases: unknown[] = [
      { ...valid, items: [] },
      { ...valid, items: ['leche', ''] },
      { ...valid, items: ['x'.repeat(101)] },
      { ...valid, items: Array.from({ length: 31 }, (_, i) => `p${i}`) },
      { ...valid, items: ['leche', 5] },
      { ...valid, store: '' },
      { ...valid, store: 3 },
      { ...valid, skipped: [7] },
      { ...valid, skipped: [0, 1, 2] },
      { ...valid, borrarTodo: true },
      null,
    ]
    for (const raw of cases) expect(proposeAction('shopping.add', raw, ctx()).ok).toBe(false)
  })
})

describe('calendar.create', () => {
  const members = [
    { id: 'm1', name: 'Eric' },
    { id: 'm2', name: 'Jennifer' },
  ]
  const valid = {
    title: 'Dentista',
    date: '2026-09-25',
    time: '17:00',
    endTime: null,
    memberId: 'm1',
    recurrenceRule: null,
    reminders: [{ minutesBefore: 60, anchor: 'start' }],
  }

  it('enseña el evento y no escribe hasta confirmar', async () => {
    const result = proposeAction('calendar.create', valid, ctx({ members }))
    if (!result.ok) throw new Error('debería ser válida')
    const view = result.proposal.preview(result.proposal.initialSelection)
    expect(view.lines).toEqual(['Título: Dentista', 'Día: el viernes, 25 de septiembre', 'Hora: 17:00', expect.stringContaining('Aviso:')])
    expect(view.choices[0].options.map((o) => o.label)).toEqual(['Toda la familia', 'Eric', 'Jennifer'])
    expect(createEvent).not.toHaveBeenCalled()
    const message = await result.proposal.confirm(result.proposal.initialSelection)
    expect(createEvent).toHaveBeenCalledWith({
      title: 'Dentista',
      startAt: new Date('2026-09-25T17:00').toISOString(),
      endAt: null,
      allDay: false,
      recurrenceRule: null,
      reminders: [{ minutesBefore: 60, anchor: 'start' }],
      memberIds: ['m1'],
    })
    expect(message).toBe('Apuntado en el calendario: Dentista — el viernes, 25 de septiembre a las 17:00 · para Eric.')
  })

  it('cambiar la persona en la tarjeta cambia a quién se apunta', async () => {
    const result = proposeAction('calendar.create', valid, ctx({ members }))
    if (!result.ok) throw new Error('debería ser válida')
    await result.proposal.confirm({ choices: { member: 'm2' }, checked: [] })
    expect(vi.mocked(createEvent).mock.calls[0][0].memberIds).toEqual(['m2'])
    vi.clearAllMocks()
    await result.proposal.confirm({ choices: { member: 'none' }, checked: [] })
    expect(vi.mocked(createEvent).mock.calls[0][0].memberIds).toEqual([])
  })

  it('sin hora es de todo el día', async () => {
    const result = proposeAction('calendar.create', { ...valid, time: null, memberId: null, reminders: [] }, ctx({ members }))
    if (!result.ok) throw new Error('debería ser válida')
    await result.proposal.confirm(result.proposal.initialSelection)
    expect(vi.mocked(createEvent).mock.calls[0][0].allDay).toBe(true)
  })

  it('una persona inventada en la tarjeta se rechaza al confirmar', async () => {
    const result = proposeAction('calendar.create', valid, ctx({ members }))
    if (!result.ok) throw new Error('debería ser válida')
    await expect(result.proposal.confirm({ choices: { member: 'inventada' }, checked: [] })).rejects.toThrow('La persona no existe')
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('rechaza datos no válidos', () => {
    const cases: unknown[] = [
      { ...valid, title: '  ' },
      { ...valid, title: 'x'.repeat(121) },
      { ...valid, date: '2026-02-31' },
      { ...valid, time: '25:00' },
      { ...valid, time: '5pm' },
      { ...valid, time: null, endTime: '18:00' },
      { ...valid, endTime: '16:00' },
      { ...valid, memberId: 'no-existe' },
      { ...valid, recurrenceRule: 'FREQ=DAILY' },
      { ...valid, reminders: [{ minutesBefore: -5, anchor: 'start' }] },
      { ...valid, reminders: [{ minutesBefore: 10, anchor: 'end' }] },
      { ...valid, reminders: [{ minutesBefore: 10, anchor: 'start', extra: 1 }] },
      { ...valid, reminders: Array.from({ length: 6 }, () => ({ minutesBefore: 5, anchor: 'start' })) },
      { ...valid, borrarTodo: true },
      'texto',
    ]
    for (const raw of cases) expect(proposeAction('calendar.create', raw, ctx({ members })).ok).toBe(false)
  })

  it('acepta una repetición semanal válida', () => {
    expect(proposeAction('calendar.create', { ...valid, recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU,TH' }, ctx({ members })).ok).toBe(true)
  })
})

describe('calendar.create: notas de la tarjeta', () => {
  it('las notas se enseñan como aviso en la tarjeta y no se guardan', async () => {
    const result = proposeAction(
      'calendar.create',
      { title: 'Dentista', date: '2026-09-25', time: '17:00', endTime: null, memberId: null, recurrenceRule: null, reminders: [], notes: ['Entendido como las 17:00 (tarde).'] },
      ctx(),
    )
    if (!result.ok) throw new Error('debería ser válida')
    expect(result.proposal.preview(result.proposal.initialSelection).warnings).toEqual(['Entendido como las 17:00 (tarde).'])
    await result.proposal.confirm(result.proposal.initialSelection)
    expect(vi.mocked(createEvent).mock.calls[0][0]).not.toHaveProperty('notes')
  })

  it('rechaza notas no válidas', () => {
    const base = { title: 'Dentista', date: '2026-09-25', time: null, endTime: null, memberId: null, recurrenceRule: null, reminders: [] }
    expect(proposeAction('calendar.create', { ...base, notes: 'texto' }, ctx()).ok).toBe(false)
    expect(proposeAction('calendar.create', { ...base, notes: ['a', 'b', 'c', 'd'] }, ctx()).ok).toBe(false)
    expect(proposeAction('calendar.create', { ...base, notes: [5] }, ctx()).ok).toBe(false)
  })
})
