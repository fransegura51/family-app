import { describe, expect, it } from 'vitest'
import { MANUAL_KEY_PREFIX, defaultDiners, hasShoppableEntry, kitchenMenuShopping, manualText, shoppableEntries } from '@/domain/kitchenMenuShopping'
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
const entries = [
  entry('e1', '2026-10-19', 'r1'),
  entry('e2', '2026-10-19', 'r2'),
  entry('e3', '2026-10-20', 'r1'),
  entry('e4', '2026-10-20', null, 'Pizza del sábado'),
  entry('e5', '2026-10-21', 'r3'),
  entry('e6', '2026-10-19', null, 'Fruta de temporada'),
  entry('e7', '2026-10-20', null, '  fruta   de TEMPORADA '),
  entry('e8', '2026-10-21', null, '   '),
]

describe('menú semanal de la Cocina → Compras', () => {
  it('semana: recetas con sus ingredientes sumados y los platos escritos a mano como productos; las recetas vacías y los textos en blanco no entran', () => {
    const lines = kitchenMenuShopping(entries, recipes, { scope: 'week' }, 4)
    expect(lines.find((l) => l.name === 'Lentejas')?.quantity).toBe('640 g') // dos veces la receta
    expect(lines.find((l) => l.name === 'Huevos')?.quantity).toBe('4 unidades')
    expect(lines.find((l) => l.name === 'Ajo')?.quantity).toBe('5 dientes') // 2 + 1 + 2 (ajo en dientes y en diente: misma pieza)
    expect(lines.filter((l) => l.name === 'Ajo')).toHaveLength(1)
    expect(lines.filter((l) => l.direct).map((l) => l.name)).toEqual(['Pizza del sábado', 'Fruta de temporada'])
  })
  it('lo escrito a mano es UN producto con ese texto: sin cantidad ni unidad inventadas, sin ingredientes deducidos y sin duplicar el mismo texto', () => {
    const lines = kitchenMenuShopping(entries, recipes, { scope: 'week' }, 4)
    const fruta = lines.find((l) => l.name === 'Fruta de temporada')!
    expect(fruta.direct).toBe(true)
    expect(fruta.quantity).toBeNull()
    expect(fruta.unit).toBe('')
    expect(fruta.key).toBe(MANUAL_KEY_PREFIX + 'fruta de temporada')
    expect(fruta.sources).toHaveLength(2) // dos días con el mismo texto → una sola línea
    expect(lines.filter((l) => /fruta/i.test(l.name))).toHaveLength(1)
    // La pizza escrita a mano no se convierte en ingredientes de pizza.
    expect(lines.some((l) => /masa|queso|tomate/i.test(l.name))).toBe(false)
  })
  it('un día solo suma ese día; un plato, solo ese plato (con receta o escrito a mano)', () => {
    const day = kitchenMenuShopping(entries, recipes, { scope: 'day', date: '2026-10-19' }, 4)
    expect(day.find((l) => l.name === 'Lentejas')?.quantity).toBe('320 g')
    expect(day.filter((l) => l.direct).map((l) => l.name)).toEqual(['Fruta de temporada'])
    const one = kitchenMenuShopping(entries, recipes, { scope: 'entry', entryId: 'e2' }, 4)
    expect(one.map((l) => l.name).sort()).toEqual(['Ajo', 'Huevos'])
    const manual = kitchenMenuShopping(entries, recipes, { scope: 'entry', entryId: 'e4' }, 4)
    expect(manual).toHaveLength(1)
    expect(manual[0]).toMatchObject({ name: 'Pizza del sábado', direct: true, quantity: null })
  })
  it('escala a las personas elegidas (2 a 6) sin tocar las recetas, y no escala lo escrito a mano', () => {
    for (const [diners, lentejas] of [[2, '160 g'], [3, '240 g'], [5, '400 g'], [6, '480 g']] as const) {
      expect(kitchenMenuShopping(entries, recipes, { scope: 'entry', entryId: 'e1' }, diners).find((l) => l.name === 'Lentejas')?.quantity).toBe(lentejas)
      expect(kitchenMenuShopping(entries, recipes, { scope: 'entry', entryId: 'e4' }, diners)[0].quantity).toBeNull()
    }
    expect(recipes[0].ingredients[0].quantity).toBe('320')
  })
  it('hay carrito para cualquier plato con receta con ingredientes o con texto; no para recetas vacías ni textos en blanco', () => {
    expect(hasShoppableEntry([entry('x', '2026-10-22', null, 'Bocadillo')], recipes, { scope: 'entry', entryId: 'x' })).toBe(true)
    expect(hasShoppableEntry(entries, recipes, { scope: 'day', date: '2026-10-21' })).toBe(false) // receta vacía + texto en blanco
    expect(shoppableEntries(entries, recipes, { scope: 'week' }).map((e) => e.id)).toEqual(['e1', 'e2', 'e3', 'e4', 'e6', 'e7'])
  })
  it('manualText: solo entradas sin receta y con texto', () => {
    expect(manualText({ recipeId: null, freeText: ' Yogur   natural ' })).toBe('Yogur natural')
    expect(manualText({ recipeId: 'r1', freeText: 'x' })).toBeNull()
    expect(manualText({ recipeId: null, freeText: null })).toBeNull()
  })
  it('personas por defecto: quienes comen en casa (sin bebés ni invitadas)', () => {
    expect(defaultDiners(null)).toBe(4)
    expect(defaultDiners([])).toBe(4)
    expect(defaultDiners([{ memberType: 'admin' }, { memberType: 'adult' }, { memberType: 'child' }, { memberType: 'baby' }, { memberType: 'guest' }])).toBe(3)
    expect(defaultDiners([{ memberType: 'baby' }])).toBe(1)
  })
})
