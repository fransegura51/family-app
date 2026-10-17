import { describe, expect, it } from 'vitest'
import { defaultDiners, hasShoppableRecipe, kitchenMenuShopping, shoppableEntries } from '@/domain/kitchenMenuShopping'
import type { MenuEntry, Recipe } from '@/domain/types'

const recipe = (id: string, title: string, servings: number | null, ing: [string, string | null, string | null][]): Recipe => ({
  id,
  familyId: 'f',
  title,
  notes: null,
  imagePath: null,
  tags: [],
  servings,
  ingredients: ing.map(([name, quantity, unit], i) => ({ id: `${id}-${i}`, name, quantity, unit })),
})
const entry = (id: string, date: string, recipeId: string | null, freeText: string | null = null): MenuEntry => ({ id, familyId: 'f', entryDate: date, mealType: 'comida', recipeId, freeText })

const recipes = [
  recipe('r1', 'Lentejas', 4, [['Lentejas', '320', 'g'], ['Ajo', '2', 'dientes'], ['Sal', null, 'al gusto']]),
  recipe('r2', 'Tortilla', 4, [['Huevos', '4', null], ['Ajo', '1', 'diente']]),
  recipe('r3', 'Vacía', 4, []),
]
const entries = [entry('e1', '2026-10-19', 'r1'), entry('e2', '2026-10-19', 'r2'), entry('e3', '2026-10-20', 'r1'), entry('e4', '2026-10-20', null, 'Pizza del sábado'), entry('e5', '2026-10-21', 'r3')]

describe('menú semanal de la Cocina → Compras', () => {
  it('semana: suma las recetas con ingredientes y no inventa nada para los platos escritos a mano ni las recetas vacías', () => {
    const lines = kitchenMenuShopping(entries, recipes, { scope: 'week' }, 4)
    expect(lines.find((l) => l.name === 'Lentejas')?.quantity).toBe('640 g') // dos veces la receta
    expect(lines.find((l) => l.name === 'Huevos')?.quantity).toBe('4 unidades')
    expect(lines.find((l) => l.name === 'Ajo')?.quantity).toBe('5 dientes') // 2 + 1 + 2 (ajo en dientes y en diente: misma pieza)
    expect(lines.some((l) => /pizza/i.test(l.name))).toBe(false)
    expect(lines.filter((l) => l.name === 'Ajo')).toHaveLength(1)
  })
  it('un día solo suma ese día; un plato, solo ese plato', () => {
    expect(kitchenMenuShopping(entries, recipes, { scope: 'day', date: '2026-10-19' }, 4).find((l) => l.name === 'Lentejas')?.quantity).toBe('320 g')
    const one = kitchenMenuShopping(entries, recipes, { scope: 'entry', entryId: 'e2' }, 4)
    expect(one.map((l) => l.name).sort()).toEqual(['Ajo', 'Huevos'])
  })
  it('escala a las personas elegidas (2 a 6) sin tocar las recetas', () => {
    for (const [diners, lentejas] of [[2, '160 g'], [3, '240 g'], [5, '400 g'], [6, '480 g']] as const) {
      expect(kitchenMenuShopping(entries, recipes, { scope: 'entry', entryId: 'e1' }, diners).find((l) => l.name === 'Lentejas')?.quantity).toBe(lentejas)
    }
    expect(recipes[0].ingredients[0].quantity).toBe('320')
  })
  it('no hay botón útil si el día solo tiene platos escritos a mano o recetas sin ingredientes', () => {
    expect(hasShoppableRecipe(entries, recipes, { scope: 'day', date: '2026-10-21' })).toBe(false)
    expect(hasShoppableRecipe([entry('x', '2026-10-22', null, 'Bocadillo')], recipes, { scope: 'week' })).toBe(false)
    expect(shoppableEntries(entries, recipes, { scope: 'week' }).map((e) => e.id)).toEqual(['e1', 'e2', 'e3'])
  })
  it('personas por defecto: quienes comen en casa (sin bebés ni invitadas)', () => {
    expect(defaultDiners(null)).toBe(4)
    expect(defaultDiners([])).toBe(4)
    expect(defaultDiners([{ memberType: 'admin' }, { memberType: 'adult' }, { memberType: 'child' }, { memberType: 'baby' }, { memberType: 'guest' }])).toBe(3)
    expect(defaultDiners([{ memberType: 'baby' }])).toBe(1)
  })
})
