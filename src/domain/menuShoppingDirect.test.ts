import { describe, expect, it } from 'vitest'
import { buildMenuShoppingPlan, directShoppingLines, explicitProductList, isDirectShoppingDish } from '@/domain/menuShoppingPlan'
import { makeMenuItem } from '@/domain/eventFoodFixtures'
import type { EventMenuItem, Recipe, RecipeIngredient } from '@/domain/types'

const dish = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  makeMenuItem({ id, name, recipeId: null, preparedBy: 'familia', kind: 'dish', ...extra } as never) as EventMenuItem
const ing = (id: string, name: string, quantity: string | null, unit: string | null): RecipeIngredient => ({ id, name, quantity, unit })
const recipe = (id: string, servings: number | null, ingredients: RecipeIngredient[]): Recipe => ({
  id,
  familyId: 'f1',
  title: id,
  notes: null,
  imagePath: null,
  tags: [],
  ingredients,
  servings,
})

describe('enumeración explícita: solo listas con comas inequívocas', () => {
  it('«Jamón, queso y almendras» → Jamón, Queso, Almendras', () => {
    expect(explicitProductList('Jamón, queso y almendras')).toEqual(['Jamón', 'Queso', 'Almendras'])
  })
  it('«Queso, jamón y aceitunas» → tres productos', () => {
    expect(explicitProductList('Queso, jamón y aceitunas')).toEqual(['Queso', 'Jamón', 'Aceitunas'])
  })
  it('«Pan y picos» (sin coma) → null: no se separa', () => {
    expect(explicitProductList('Pan y picos')).toBeNull()
  })
  it('«Ensaladilla rusa», «Tortilla de patatas», «Gambas al ajillo» → null: una sola línea', () => {
    expect(explicitProductList('Ensaladilla rusa')).toBeNull()
    expect(explicitProductList('Tortilla de patatas')).toBeNull()
    expect(explicitProductList('Gambas al ajillo')).toBeNull()
  })
  it('expresiones con palabras de enlace dentro de una parte → null (no se separa)', () => {
    expect(explicitProductList('Arroz con leche, canela y azúcar')).toBeNull()
    expect(explicitProductList('Pan, tomate y aceite de oliva')).toBeNull()
  })
  it('paréntesis, cifras o productos repetidos → null', () => {
    expect(explicitProductList('Jamón (ibérico), queso y almendras')).toBeNull()
    expect(explicitProductList('Pan, pan y picos')).toBeNull()
    expect(explicitProductList('2 tortillas, pan y queso')).toBeNull()
  })
})

describe('plato sin receta: propuesta basada solo en su nombre, sin cantidades', () => {
  it('«Gambas blancas cocidas» → una línea, cantidad null', () => {
    const [line] = directShoppingLines(dish('d1', 'Gambas blancas cocidas'))
    expect(line).toMatchObject({ name: 'Gambas blancas cocidas', quantity: null, direct: true })
    expect(line.sources).toEqual([{ dishName: 'Gambas blancas cocidas', ingredientText: 'Gambas blancas cocidas' }])
  })
  it('«Jamón, queso y almendras» → tres líneas separadas, ninguna cantidad inventada', () => {
    const lines = directShoppingLines(dish('d2', 'Jamón, queso y almendras'))
    expect(lines.map((l) => l.name)).toEqual(['Jamón', 'Queso', 'Almendras'])
    expect(lines.every((l) => l.quantity === null)).toBe(true)
  })
  it('«Ensaladilla rusa» → una sola línea (no patata + huevo + atún + mayonesa)', () => {
    expect(directShoppingLines(dish('d3', 'Ensaladilla rusa')).map((l) => l.name)).toEqual(['Ensaladilla rusa'])
  })
  it('«Tortilla de patatas» → una sola línea, sin huevos/patatas/aceite', () => {
    expect(directShoppingLines(dish('d4', 'Tortilla de patatas')).map((l) => l.name)).toEqual(['Tortilla de patatas'])
  })
  it('«Gambas al ajillo» → una sola línea, sin gambas/ajo/aceite', () => {
    expect(directShoppingLines(dish('d5', 'Gambas al ajillo')).map((l) => l.name)).toEqual(['Gambas al ajillo'])
  })
  it('«Pan y picos» → una sola línea (sin coma, no se separa)', () => {
    expect(directShoppingLines(dish('d6', 'Pan y picos')).map((l) => l.name)).toEqual(['Pan y picos'])
  })
})

describe('elegibilidad: datos estructurados del modo de comida, nunca texto', () => {
  it('sin receta y preparado por la familia → directo', () => {
    expect(isDirectShoppingDish(dish('d', 'Gambas'), 'familia')).toBe(true)
    expect(isDirectShoppingDish(dish('d', 'Gambas', { preparedBy: 'familia' }), 'mixto')).toBe(true)
  })
  it('plato de proveedor, incluido o sin comida → NO directo', () => {
    expect(isDirectShoppingDish(dish('d', 'Gambas', { preparedBy: 'proveedor' }), 'mixto')).toBe(false)
    expect(isDirectShoppingDish(dish('d', 'Gambas'), 'proveedor')).toBe(false)
    expect(isDirectShoppingDish(dish('d', 'Gambas'), 'sin_comida')).toBe(false)
    expect(isDirectShoppingDish(dish('d', 'Gambas'), 'esperando')).toBe(false)
  })
  it('encabezado o nota nunca es compra', () => {
    expect(isDirectShoppingDish(dish('d', 'Cambio de tercio', { kind: 'heading' }), 'familia')).toBe(false)
  })
  it('con receta enlazada no es directo: la receta manda', () => {
    expect(isDirectShoppingDish(dish('d', 'Pulpo', { recipeId: 'r1' }), 'familia')).toBe(false)
  })
})

describe('preparación global: combina platos con y sin receta', () => {
  it('receta → ingredientes reales; sin receta → propuesta del nombre; el nombre del plato con receta no se añade', () => {
    const pulpo = dish('p', 'Pulpo a la gallega con patatas', { recipeId: 'r1' })
    const gambas = dish('g', 'Gambas blancas cocidas')
    const jamon = dish('j', 'Jamón, queso y almendras')
    const lines = buildMenuShoppingPlan([pulpo, gambas, jamon], [recipe('r1', 4, [ing('i1', 'Pulpo', '1,5', 'kg')])], 10, 'familia')
    const names = lines.map((l) => l.name)
    expect(names).toEqual(['Pulpo', 'Gambas blancas cocidas', 'Jamón', 'Queso', 'Almendras'])
    expect(names).not.toContain('Pulpo a la gallega con patatas')
    expect(lines.find((l) => l.name === 'Pulpo')).toMatchObject({ quantity: '3,75 kg', direct: false })
    expect(lines.filter((l) => l.direct).every((l) => l.quantity === null)).toBe(true)
  })

  it('plato con receta sin ingredientes no añade su nombre como producto', () => {
    const vacio = dish('v', 'Plato vacío', { recipeId: 'r2' })
    expect(buildMenuShoppingPlan([vacio], [recipe('r2', 4, [])], 10, 'familia')).toEqual([])
  })

  it('plato de proveedor en el menú no entra en la compra global', () => {
    expect(buildMenuShoppingPlan([dish('g', 'Gambas', { preparedBy: 'proveedor' })], [], 10, 'mixto')).toEqual([])
  })
})
