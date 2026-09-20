import { describe, expect, it } from 'vitest'
import {
  composeNotes,
  draftFromAi,
  draftToCreateParams,
  formatQuantity,
  ingredientDisplay,
  ingredientsToText,
  scaleDraft,
  textToIngredients,
  textToSteps,
  type RecipeDraftData,
} from './recipeDraft'

const AI = {
  title: 'Lentejas con chorizo',
  servings: 4,
  timeMinutes: 60,
  ingredients: [
    { name: 'lentejas pardinas', quantity: 400, unit: 'g' },
    { name: 'chorizo', quantity: 2, unit: 'unidades' },
    { name: 'agua', quantity: 1.5, unit: 'l' },
    { name: 'ajo', quantity: 2, unit: 'dientes' },
    { name: 'sal', quantity: null, unit: null },
  ],
  steps: ['Sofríe la cebolla.', 'Añade las lentejas.'],
  tags: ['Fáciles de preparar'],
}

describe('formatQuantity', () => {
  it('gramos y mililitros se redondean a cantidades de cocina', () => {
    expect(formatQuantity(400, 'g')).toBe('400')
    expect(formatQuantity(333, 'g')).toBe('330')
    expect(formatQuantity(87, 'ml')).toBe('85')
    expect(formatQuantity(12.4, 'g')).toBe('12')
    expect(formatQuantity(0.4, 'g')).toBe('1')
  })

  it('kilos y litros con punto decimal (la coma separa los campos al guardar)', () => {
    expect(formatQuantity(1.5, 'l')).toBe('1.5')
    expect(formatQuantity(0.75, 'l')).toBe('0.75')
    expect(formatQuantity(2, 'kg')).toBe('2')
  })

  it('unidades a medios', () => {
    expect(formatQuantity(2, 'unidades')).toBe('2')
    expect(formatQuantity(0.5, 'unidades')).toBe('0.5')
    expect(formatQuantity(1.3, 'dientes')).toBe('1.5')
    expect(formatQuantity(0.2, 'unidades')).toBe('0.5')
    expect(formatQuantity(12.4, null)).toBe('12')
  })
})

describe('scaleDraft', () => {
  const draft = draftFromAi(AI)

  it('para cuatro es igual', () => {
    expect(scaleDraft(draft, 4)).toEqual(draft)
  })

  it('a la mitad', () => {
    const half = scaleDraft(draft, 2)
    expect(half.servings).toBe(2)
    expect(half.ingredients.map(ingredientDisplay)).toEqual(['200 g lentejas pardinas', '1 unidad chorizo', '0.75 l agua', '1 diente ajo', 'sal'])
  })

  it('para seis', () => {
    expect(scaleDraft(draft, 6).ingredients.map(ingredientDisplay)).toEqual(['600 g lentejas pardinas', '3 unidades chorizo', '2.25 l agua', '3 dientes ajo', 'sal'])
  })

  it('el texto libre y lo que no tiene cantidad no se escalan', () => {
    const custom: RecipeDraftData = { ...draft, ingredients: [{ name: 'sal', quantity: null, quantityText: 'una pizca', unit: null }] }
    expect(scaleDraft(custom, 8).ingredients[0].quantityText).toBe('una pizca')
  })

  it('escalar de ida y vuelta desde la base no acumula errores', () => {
    const two = scaleDraft(draft, 2)
    const six = scaleDraft(draft, 6)
    expect(scaleDraft(two, 6).ingredients.map(ingredientDisplay)).toEqual(six.ingredients.map(ingredientDisplay))
  })
})

describe('edición como texto', () => {
  const draft = draftFromAi(AI)

  it('ida y vuelta de los ingredientes', () => {
    const text = ingredientsToText(draft.ingredients)
    expect(text.split('\n')[0]).toBe('lentejas pardinas, 400, g')
    const back = textToIngredients(text)
    expect(back.map(ingredientDisplay)).toEqual(draft.ingredients.map(ingredientDisplay))
  })

  it('cantidades con coma o texto libre', () => {
    expect(textToIngredients('agua, 1,5, l')).toEqual([{ name: 'agua', quantity: 1.5, quantityText: null, unit: 'l' }])
    expect(textToIngredients('agua, 1.5, l')).toEqual([{ name: 'agua', quantity: 1.5, quantityText: null, unit: 'l' }])
    expect(textToIngredients('sal, una pizca,')).toEqual([{ name: 'sal', quantity: null, quantityText: 'una pizca', unit: null }])
    expect(textToIngredients('pan\n\n  \nleche, 2, l')).toHaveLength(2)
  })

  it('los pasos pierden la numeración al editar', () => {
    expect(textToSteps('1. Sofríe\n2) Añade agua\n\nSirve')).toEqual(['Sofríe', 'Añade agua', 'Sirve'])
  })
})

describe('guardado', () => {
  const draft = draftFromAi(AI)

  it('las notas llevan raciones, tiempo y pasos numerados', () => {
    expect(composeNotes(draft)).toBe('Raciones: 4 · Tiempo aproximado: 60 min\n\n1. Sofríe la cebolla.\n2. Añade las lentejas.')
    expect(composeNotes({ ...draft, timeMinutes: null })).toBe('Raciones: 4\n\n1. Sofríe la cebolla.\n2. Añade las lentejas.')
  })

  it('los parámetros de guardado son todo texto', () => {
    const params = draftToCreateParams(scaleDraft(draft, 2))
    expect(params.servings).toBe(2)
    expect(params.ingredients[0]).toEqual({ name: 'lentejas pardinas', quantity: '200', unit: 'g' })
    expect(params.ingredients[4]).toEqual({ name: 'sal', quantity: '', unit: '' })
    expect(params.tags).toEqual(['Fáciles de preparar'])
  })
})

describe('unidades en singular', () => {
  it('con cantidad 1 la unidad va en singular', () => {
    expect(ingredientDisplay({ name: 'cebolla', quantity: 1, quantityText: null, unit: 'unidades' })).toBe('1 unidad cebolla')
    expect(ingredientDisplay({ name: 'ajo', quantity: 2, quantityText: null, unit: 'dientes' })).toBe('2 dientes ajo')
    expect(ingredientDisplay({ name: 'pimentón', quantity: 1, quantityText: null, unit: 'cucharaditas' })).toBe('1 cucharadita pimentón')
    expect(ingredientDisplay({ name: 'agua', quantity: 1, quantityText: null, unit: 'l' })).toBe('1 l agua')
  })

  it('también al guardar', () => {
    const params = draftToCreateParams(draftFromAi({ ...AI, ingredients: [{ name: 'cebolla', quantity: 1, unit: 'unidades' }] }))
    expect(params.ingredients[0]).toEqual({ name: 'cebolla', quantity: '1', unit: 'unidad' })
  })
})
