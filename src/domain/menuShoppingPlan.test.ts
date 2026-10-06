import { describe, expect, it } from 'vitest'
import { buildMenuShoppingPlan } from '@/domain/menuShoppingPlan'
import { makeMenuItem } from '@/domain/eventFoodFixtures'
import type { Recipe, RecipeIngredient } from '@/domain/types'

const ing = (id: string, name: string, quantity: string | null, unit: string | null): RecipeIngredient => ({ id, name, quantity, unit })
const recipe = (id: string, servings: number | null, ingredients: RecipeIngredient[]): Recipe => ({ id, familyId: 'f1', title: id, notes: null, imagePath: null, tags: [], ingredients, servings })
const dish = (id: string, name: string, recipeId: string | null, extra: Record<string, unknown> = {}) =>
  makeMenuItem({ id, name, recipeId, preparedBy: 'familia', kind: 'dish', ...extra } as never)

describe('Preparar compra del menú — solo ingredientes reales de recetas de la familia', () => {
  it('un plato sin receta NO genera ingredientes inventados: solo la propuesta de su nombre, sin cantidad', () => {
    const lines = buildMenuShoppingPlan([dish('d1', 'Ensalada', null)], [], 8, 'mixto')
    expect(lines.map((l) => l.name)).toEqual(['Ensalada'])
    expect(lines[0]).toMatchObject({ quantity: null, direct: true })
  })

  it('un plato de restaurante/proveedor NO genera compra aunque tenga receta vinculada', () => {
    const r = recipe('r1', 4, [ing('i1', 'Arroz', '500', 'g')])
    expect(buildMenuShoppingPlan([dish('d1', 'Paella', 'r1', { preparedBy: 'proveedor' })], [r], 8, 'mixto')).toEqual([])
  })

  it('agrupa ingredientes equivalentes (500 g + 1 kg = 1,5 kg) y lista los platos de procedencia', () => {
    const items = [dish('d1', 'Paella', 'r1'), dish('d2', 'Arroz al horno', 'r2')]
    const recipes = [recipe('r1', null, [ing('i1', 'Arroz', '500', 'g')]), recipe('r2', null, [ing('i2', 'arroz', '1', 'kg')])]
    const [line] = buildMenuShoppingPlan(items, recipes, 8, 'mixto')
    expect(line.quantity).toBe('1,5 kg')
    expect(line.sources.map((s) => s.dishName).sort()).toEqual(['Arroz al horno', 'Paella'])
  })

  it('unidades incompatibles NO se suman ni se convierten: «2 unidades» y «300 g» quedan en líneas separadas', () => {
    const items = [dish('d1', 'Tortilla', 'r1'), dish('d2', 'Revuelto', 'r2')]
    const recipes = [recipe('r1', null, [ing('i1', 'Huevo', '2', 'unidades')]), recipe('r2', null, [ing('i2', 'Huevo', '300', 'g')])]
    const lines = buildMenuShoppingPlan(items, recipes, 8, 'mixto')
    expect(lines.map((l) => l.quantity).sort()).toEqual(['2 unidades', '300 g'])
  })

  it('cantidad desconocida (null) se queda null: nunca se suma como 0', () => {
    const items = [dish('d1', 'Sopa', 'r1')]
    const recipes = [recipe('r1', null, [ing('i1', 'Sal', null, null)])]
    expect(buildMenuShoppingPlan(items, recipes, 8, 'mixto')[0].quantity).toBeNull()
  })

  it('con raciones conocidas escala orientativamente; sin raciones conserva la original y lo indica', () => {
    const items = [dish('d1', 'Pollo', 'r1'), dish('d2', 'Pasta', 'r2')]
    const recipes = [recipe('r1', 4, [ing('i1', 'Pollo', '500', 'g')]), recipe('r2', null, [ing('i2', 'Pasta', '400', 'g')])]
    const lines = buildMenuShoppingPlan(items, recipes, 8, 'mixto')
    const pollo = lines.find((l) => l.name === 'Pollo')!
    const pasta = lines.find((l) => l.name === 'Pasta')!
    expect(pollo.quantity).toBe('1 kg')
    expect(pasta.quantity).toBe('400 g')
    expect(pasta.notes).toEqual(['sin_raciones'])
  })

  it('el escalado NO modifica la receta original', () => {
    const r = recipe('r1', 4, [ing('i1', 'Pollo', '500', 'g')])
    buildMenuShoppingPlan([dish('d1', 'Pollo', 'r1')], [r], 8, 'mixto')
    expect(r.ingredients[0].quantity).toBe('500')
  })

  it('sin receta vinculada (recipeId null) no usa ingredientes de ninguna receta, aunque exista una con ese nombre', () => {
    const lines = buildMenuShoppingPlan([dish('d1', 'Pollo', null)], [recipe('r1', 4, [ing('i1', 'Pollo', '1', 'kg')])], 8, 'mixto')
    expect(lines.every((l) => l.direct)).toBe(true)
    expect(lines.find((l) => l.quantity !== null)).toBeUndefined()
  })
})

// Caso real validado: pulpo a la gallega, receta de 4 raciones → 10 comensales (factor 2,5).
describe('propuesta de compra — caso real pulpo a la gallega (4 → 10 comensales)', () => {
  const pulpo = [
    ing('i1', 'Pulpo', '1,5', 'kg'),
    ing('i2', 'Patatas', '4', 'unidades'),
    ing('i3', 'Pimentón dulce', '1', 'cucharada'),
    ing('i4', 'Pimentón picante', '1', 'cucharadita'),
    ing('i5', 'Aceite de oliva', '4', 'cucharadas'),
    ing('i6', 'Sal gorda', null, null),
  ]
  const lines = () => buildMenuShoppingPlan([dish('d1', 'Pulpo a la gallega', 'r1')], [recipe('r1', 4, pulpo)], 10, 'mixto')
  const byName = (name: string) => lines().find((l) => l.name === name)!

  it('pulpo 1,5 kg → 3,75 kg (no 3,8)', () => expect(byName('Pulpo').quantity).toBe('3,75 kg'))
  it('patatas 4 unidades → 10 unidades', () => expect(byName('Patatas').quantity).toBe('10 unidades'))
  it('pimentón dulce 1 cucharada → 2,5 cucharadas, sin aviso fraccionario', () => {
    expect(byName('Pimentón dulce').quantity).toBe('2,5 cucharadas')
    expect(byName('Pimentón dulce').notes).not.toContain('fraccionario')
  })
  it('pimentón picante 1 cucharadita → 2,5 cucharaditas', () => expect(byName('Pimentón picante').quantity).toBe('2,5 cucharaditas'))
  it('aceite 4 cucharadas → 10 cucharadas', () => expect(byName('Aceite de oliva').quantity).toBe('10 cucharadas'))
  it('sal gorda, cantidad desconocida → quantity null (nunca 0)', () => expect(byName('Sal gorda').quantity).toBeNull())
  it('la receta original no cambia tras calcular la propuesta', () => {
    const r = recipe('r1', 4, pulpo)
    buildMenuShoppingPlan([dish('d1', 'Pulpo', 'r1')], [r], 10, 'mixto')
    expect(r.ingredients[0].quantity).toBe('1,5')
    expect(r.ingredients[1].quantity).toBe('4')
  })
})

describe('avisos — fraccionario solo para conteo indivisible; la cantidad desconocida conserva su aviso', () => {
  const plan = (ingredients: RecipeIngredient[]) => buildMenuShoppingPlan([dish('d1', 'Plato', 'r1')], [recipe('r1', 4, ingredients)], 10, 'mixto')

  it('3 huevos × 2,5 = 7,5 unidades → aviso fraccionario', () => {
    const [line] = plan([ing('h', 'Huevo', '3', 'unidades')])
    expect(line.quantity).toBe('7,5 unidades')
    expect(line.notes).toEqual(['fraccionario'])
  })

  it('sal sin cantidad → aviso de cantidad no numérica, NUNCA el fraccionario', () => {
    const [line] = plan([ing('s', 'Sal gorda', null, null)])
    expect(line.quantity).toBeNull()
    expect(line.notes).toContain('cantidad_no_numerica')
    expect(line.notes).not.toContain('fraccionario')
  })

  it('cucharadas y cucharaditas con decimales → sin ningún aviso', () => {
    const [spoon] = plan([ing('c', 'Aceite', '1', 'cucharada')])
    const [tea] = plan([ing('t', 'Pimentón', '1', 'cucharadita')])
    expect(spoon.notes).toEqual([])
    expect(tea.notes).toEqual([])
  })
})
