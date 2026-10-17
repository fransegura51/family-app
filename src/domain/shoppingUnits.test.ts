// Compras: unidades, escalado a 2–6 comensales, redondeo de compra, "al gusto" y agrupación (bloque Compras del prompt 17/10/2026).
import { describe, expect, it } from 'vitest'
import { buildMenuShoppingPlan } from '@/domain/menuShoppingPlan'
import type { EventMenuItem, Recipe, RecipeIngredient } from '@/domain/types'

const ing = (id: string, name: string, quantity: string | null, unit: string | null): RecipeIngredient => ({ id, name, quantity, unit })
const recipe = (id: string, servings: number | null, ingredients: RecipeIngredient[]): Recipe => ({ id, familyId: 'f', title: id, notes: null, imagePath: null, tags: [], ingredients, servings })
const dish = (id: string, recipeId: string): EventMenuItem =>
  ({ id, eventId: '', familyId: '', name: 'Plato ' + id, category: null, quantityNote: null, transferred: false, sortOrder: 0, createdAt: '', recipeId, notes: null, source: 'importado', documentId: null, preparedBy: 'familia', kind: 'dish' }) as EventMenuItem

const sandwich = recipe('r1', 4, [
  ing('1', 'Queso', '8', 'lonchas'),
  ing('2', 'Pan de molde', '8', 'rebanadas'),
  ing('3', 'Lechuga', '1', 'unidad'),
  ing('4', 'Huevos', '4', null),
  ing('5', 'Ajo', '2', 'dientes de ajo'),
  ing('6', 'Sal', null, 'al gusto'),
  ing('7', 'Pimienta', '1', 'pizca'),
  ing('8', 'Aceite de oliva', '2', 'cucharadas'),
  ing('9', 'Leche', '500', 'ml'),
])
const plan = (diners: number, extra: Recipe[] = []) =>
  buildMenuShoppingPlan([dish('d1', 'r1'), ...extra.map((r, i) => dish('x' + i, r.id))], [sandwich, ...extra], diners, 'familia')
const q = (lines: ReturnType<typeof plan>, name: string) => lines.find((l) => l.name === name)?.quantity

describe('escalado a 2, 3, 4, 5 y 6 comensales (receta de 4 raciones)', () => {
  it.each([
    [2, '4 lonchas', '4 rebanadas', '1 unidad', '2 unidades', '1 diente'],
    [3, '6 lonchas', '6 rebanadas', '1 unidad', '3 unidades', '2 dientes'],
    [4, '8 lonchas', '8 rebanadas', '1 unidad', '4 unidades', '2 dientes'],
    [5, '10 lonchas', '10 rebanadas', '2 unidades', '5 unidades', '3 dientes'],
    [6, '12 lonchas', '12 rebanadas', '2 unidades', '6 unidades', '3 dientes'],
  ])('%i personas', (diners, queso, pan, lechuga, huevos, ajo) => {
    const lines = plan(diners)
    expect(q(lines, 'Queso')).toBe(queso)
    expect(q(lines, 'Pan de molde')).toBe(pan)
    expect(q(lines, 'Lechuga')).toBe(lechuga)
    expect(q(lines, 'Huevos')).toBe(huevos)
    expect(q(lines, 'Ajo')).toBe(ajo)
  })
  it('1,5 lechugas se COMPRAN como 2, con una frase clara; la receta guardada no cambia', () => {
    const lines = plan(6)
    const lechuga = lines.find((l) => l.name === 'Lechuga')!
    expect(lechuga.quantity).toBe('2 unidades')
    expect(lechuga.hint).toBe('La receta usa 1,5; se redondea a 2 para comprar.')
    expect(sandwich.ingredients.find((i) => i.name === 'Lechuga')?.quantity).toBe('1')
  })
  it('sin redondeos no hay frase técnica', () => {
    const lines = plan(4)
    expect(lines.every((l) => l.hint === null)).toBe(true)
  })
  it('masa, volumen y cucharadas se escalan sin redondear a enteros', () => {
    const lines = plan(6)
    expect(q(lines, 'Leche')).toBe('750 ml')
    expect(q(lines, 'Aceite de oliva')).toBe('3 cucharadas')
  })
})

describe('«al gusto», sal y especias: se conserva la indicación sin inventar cantidades', () => {
  it('sin número queda «al gusto» y una pizca nunca se escala ni se convierte en cantidad', () => {
    for (const diners of [2, 4, 6]) {
      const lines = plan(diners)
      expect(q(lines, 'Sal')).toBe('al gusto')
      expect(q(lines, 'Pimienta')).toBe('al gusto')
    }
  })
  it('un producto sin cantidad numérica no se repite si otra receta sí lo cuantifica', () => {
    const other = recipe('r2', 4, [ing('a', 'Lechuga', 'al gusto', null), ing('b', 'Sal', '1', 'cucharadita')])
    const lines = plan(4, [other])
    expect(lines.filter((l) => l.name === 'Lechuga')).toHaveLength(1)
    expect(q(lines, 'Lechuga')).toBe('1 unidad')
    // sigue sabiéndose de qué recetas viene
    expect(lines.find((l) => l.name === 'Lechuga')?.sources.map((s) => s.dishName)).toEqual(['Plato d1', 'Plato x0'])
    // la sal «al gusto» de una receta y la de «1 cucharadita» de otra son el mismo producto: una sola línea (con la cantidad real)
    expect(lines.filter((l) => l.name === 'Sal').map((l) => l.quantity)).toEqual(['1 cucharadita'])
  })
})

describe('agrupación', () => {
  it('suma lo compatible (g con kg) y no mezcla unidades incompatibles', () => {
    const a = recipe('ra', 4, [ing('1', 'Patata', '500', 'g'), ing('2', 'Queso', '4', 'lonchas')])
    const b = recipe('rb', 4, [ing('1', 'Patata', '1', 'kg'), ing('2', 'Queso', '100', 'g')])
    const lines = buildMenuShoppingPlan([dish('1', 'ra'), dish('2', 'rb')], [a, b], 4, 'familia')
    expect(lines.find((l) => l.name === 'Patata')?.quantity).toBe('1,5 kg')
    // queso en lonchas y queso en gramos son líneas distintas
    expect(lines.filter((l) => l.name === 'Queso').map((l) => l.quantity).sort()).toEqual(['100 g', '4 lonchas'])
  })
  it('el mismo producto en varias recetas es una sola línea con la suma y todas sus recetas', () => {
    const a = recipe('ra', 2, [ing('1', 'Huevos', '2', 'unidades')])
    const b = recipe('rb', 4, [ing('1', 'Huevos', '4', null)])
    const lines = buildMenuShoppingPlan([dish('1', 'ra'), dish('2', 'rb')], [a, b], 4, 'familia')
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe('8 unidades')
    expect(lines[0].sources).toHaveLength(2)
  })
  it('sin raciones en la receta: cantidad tal cual (no se inventa un escalado)', () => {
    const r = recipe('rx', null, [ing('1', 'Arroz', '300', 'g')])
    expect(buildMenuShoppingPlan([dish('1', 'rx')], [r], 6, 'familia')[0].quantity).toBe('300 g')
  })
})
