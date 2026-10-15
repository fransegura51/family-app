// Comparación de versiones de una receta (CMN-§5.3): ingredientes añadidos/quitados/cambiados, pasos, datos generales.
import { describe, expect, it } from 'vitest'
import { diffRecipes, diffSteps, ingredientAmount, normalizeKey, splitSteps, summarizeDiff, type DiffRecipe } from '@/domain/communityRecipeDiff'

const base: DiffRecipe = {
  title: 'Pan casero',
  servings: 4,
  ingredients: [
    { name: 'Harina', quantity: '500', unit: 'g' },
    { name: 'Agua', quantity: '300', unit: 'ml' },
    { name: 'Sal', quantity: '1', unit: 'cucharadita' },
  ],
  steps: '1. Mezclar todo.\n2. Amasar 10 minutos.\n3. Hornear 30 minutos.',
  tags: ['pan', 'fáciles de preparar'],
}

describe('diffRecipes', () => {
  it('dos versiones iguales no tienen cambios (aunque cambie la numeración, las mayúsculas o las tildes)', () => {
    const same: DiffRecipe = { ...base, title: 'PAN CASERO', steps: 'Mezclar todo.\nAmasar 10 minutos.\nHornear 30 minutos.', tags: ['Pan', 'Faciles de preparar'] }
    const d = diffRecipes(base, same)
    expect(d.hasChanges).toBe(false)
    expect(d.ingredientsSame).toBe(3)
    expect(summarizeDiff(d)).toBe('')
  })

  it('ingredientes añadidos, quitados y cambiados', () => {
    const after: DiffRecipe = {
      ...base,
      ingredients: [
        { name: 'harina', quantity: '750', unit: 'g' }, // cambiado (misma harina, otra cantidad)
        { name: 'Agua', quantity: '300', unit: 'ml' }, // igual
        { name: 'Levadura', quantity: '10', unit: 'g' }, // nuevo
      ], // Sal quitada
    }
    const d = diffRecipes(base, after)
    expect(d.ingredientsAdded).toEqual([{ name: 'Levadura', quantity: '10', unit: 'g' }])
    expect(d.ingredientsRemoved).toEqual([{ name: 'Sal', quantity: '1', unit: 'cucharadita' }])
    expect(d.ingredientsChanged).toEqual([{ before: base.ingredients[0], after: after.ingredients[0] }])
    expect(d.ingredientsSame).toBe(1)
    expect(d.hasChanges).toBe(true)
    expect(summarizeDiff(d)).toBe('1 ingrediente nuevo · 1 ingrediente quitado · 1 ingrediente cambiado')
  })

  it('un mismo ingrediente repetido se empareja en orden', () => {
    const before: DiffRecipe = { ...base, ingredients: [{ name: 'Huevo', quantity: '1', unit: '' }, { name: 'Huevo', quantity: '2', unit: '' }] }
    const after: DiffRecipe = { ...base, ingredients: [{ name: 'Huevo', quantity: '1', unit: '' }, { name: 'Huevo', quantity: '3', unit: '' }] }
    const d = diffRecipes(before, after)
    expect(d.ingredientsSame).toBe(1)
    expect(d.ingredientsChanged).toHaveLength(1)
    expect(d.ingredientsAdded).toHaveLength(0)
    expect(d.ingredientsRemoved).toHaveLength(0)
  })

  it('datos generales: título, raciones y etiquetas', () => {
    const d = diffRecipes(base, { ...base, title: 'Pan de payés', servings: null, tags: ['pan', 'rápidas'] })
    expect(d.titleChanged).toEqual({ from: 'Pan casero', to: 'Pan de payés' })
    expect(d.servingsChanged).toEqual({ from: 4, to: null })
    expect(d.tagsAdded).toEqual(['rápidas'])
    expect(d.tagsRemoved).toEqual(['fáciles de preparar'])
    expect(summarizeDiff(d)).toContain('nuevo nombre')
    expect(summarizeDiff(d)).toContain('raciones distintas')
    expect(summarizeDiff(d)).toContain('etiquetas distintas')
  })

  it('solo cambia un paso: queda como «cambiado» con el antes y el ahora', () => {
    const d = diffRecipes(base, { ...base, steps: '1. Mezclar todo.\n2. Amasar 15 minutos.\n3. Hornear 30 minutos.' })
    expect(d.stepOps.filter((o) => o.type === 'changed')).toEqual([{ type: 'changed', from: 'Amasar 10 minutos.', to: 'Amasar 15 minutos.' }])
    expect(d.hasChanges).toBe(true)
    expect(summarizeDiff(d)).toBe('1 paso cambiado')
  })
})

describe('diffSteps', () => {
  it('añadir un paso en medio y quitar otro', () => {
    const ops = diffSteps('1. A\n2. B\n3. C', '1. A\n2. NUEVO\n3. B')
    expect(ops).toEqual([
      { type: 'same', text: 'A' },
      { type: 'added', text: 'NUEVO' },
      { type: 'same', text: 'B' },
      { type: 'removed', text: 'C' },
    ])
  })

  it('sin pasos antes: todos son nuevos; sin pasos después: todos quitados', () => {
    expect(diffSteps('', '1. A\n2. B').map((o) => o.type)).toEqual(['added', 'added'])
    expect(diffSteps('1. A\n2. B', '').map((o) => o.type)).toEqual(['removed', 'removed'])
    expect(diffSteps('', '')).toEqual([])
  })

  it('un bloque de varios pasos cambiados se empareja por posición y lo que sobra es nuevo o quitado', () => {
    const ops = diffSteps('1. A\n2. B', '1. X\n2. Y\n3. Z')
    expect(ops).toEqual([
      { type: 'changed', from: 'A', to: 'X' },
      { type: 'changed', from: 'B', to: 'Y' },
      { type: 'added', text: 'Z' },
    ])
  })
})

describe('ayudantes', () => {
  it('normalizeKey ignora mayúsculas, tildes y espacios repetidos', () => {
    expect(normalizeKey('  Pimiénto   ROJO ')).toBe('pimiento rojo')
  })

  it('splitSteps quita la numeración y las líneas vacías', () => {
    expect(splitSteps('1. Uno\n\n2) Dos\n- Tres\nCuatro')).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro'])
  })

  it('ingredientAmount une cantidad y unidad sin espacios sobrantes', () => {
    expect(ingredientAmount({ name: 'x', quantity: '250', unit: 'g' })).toBe('250 g')
    expect(ingredientAmount({ name: 'x', quantity: '', unit: '' })).toBe('')
    expect(ingredientAmount({ name: 'x', quantity: '2', unit: '' })).toBe('2')
  })
})
