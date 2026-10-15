import { describe, expect, it } from 'vitest'
import {
  addIngredientRowAfter,
  addStepRow,
  addTag,
  blankIngredientRows,
  blankStepRows,
  cleanTagInput,
  customTags,
  filledIngredients,
  ingredientRowsFrom,
  moveStepRow,
  newIngredientRow,
  parseServingsText,
  removeIngredientRow,
  removeStepRow,
  servingsTextInvalid,
  stepRowsFrom,
  tagIsOn,
  tagsAtLimit,
  toggleTag,
  updateIngredientRow,
  updateStepRow,
  validServings,
  type RecipeEditorLimits,
} from '@/domain/recipeEditor'

// Lógica pura del editor de recetas compartido por la Cocina y Comunidad.
const LOWER: RecipeEditorLimits = { tagCase: 'lower', maxTags: 3, maxTagLength: 6 }

describe('filas de ingredientes', () => {
  it('sin lista guardada deja tres filas en blanco y con lista usa solo sus datos (cantidad/unidad vacías si faltan)', () => {
    expect(blankIngredientRows()).toHaveLength(3)
    expect(ingredientRowsFrom([])).toHaveLength(3)
    const rows = ingredientRowsFrom([{ name: 'Sal', quantity: null }, { name: 'Harina', quantity: '500', unit: 'g' }])
    expect(rows.map(({ name, quantity, unit }) => ({ name, quantity, unit }))).toEqual([
      { name: 'Sal', quantity: '', unit: '' },
      { name: 'Harina', quantity: '500', unit: 'g' },
    ])
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })

  it('las filas sin nombre no cuentan al guardar', () => {
    const rows = [newIngredientRow({ name: 'Leche' }), newIngredientRow({ name: '   ', quantity: '1' }), newIngredientRow()]
    expect(filledIngredients(rows).map((r) => r.name)).toEqual(['Leche'])
  })

  it('modificar una fila no toca las demás', () => {
    const rows = ingredientRowsFrom([{ name: 'A' }, { name: 'B' }])
    const next = updateIngredientRow(rows, rows[1].id, { quantity: '2' })
    expect(next[0]).toBe(rows[0])
    expect(next[1].quantity).toBe('2')
  })

  it('añadir: debajo de la fila indicada, al final con null, y nunca más del máximo', () => {
    const rows = ingredientRowsFrom([{ name: 'A' }, { name: 'B' }])
    const after = addIngredientRowAfter(rows, rows[0].id)
    expect(after).toHaveLength(3)
    expect(after[0].name).toBe('A')
    expect(after[1].name).toBe('')
    expect(after[2].name).toBe('B')
    expect(addIngredientRowAfter(rows, null)[2].name).toBe('')
    expect(addIngredientRowAfter(rows, null, 2)).toBe(rows)
  })

  it('quitar la última fila deja una en blanco (nunca se queda sin filas)', () => {
    const rows = ingredientRowsFrom([{ name: 'Solo' }])
    const next = removeIngredientRow(rows, rows[0].id)
    expect(next).toHaveLength(1)
    expect(next[0].name).toBe('')
    expect(removeIngredientRow(ingredientRowsFrom([{ name: 'A' }, { name: 'B' }]), 'no-existe')).toHaveLength(2)
  })
})

describe('filas de pasos', () => {
  it('sin pasos deja dos en blanco', () => {
    expect(blankStepRows()).toHaveLength(2)
    expect(stepRowsFrom([])).toHaveLength(2)
    expect(stepRowsFrom(['Pelar', 'Cortar']).map((s) => s.text)).toEqual(['Pelar', 'Cortar'])
  })

  it('subir y bajar cambia el orden y en los extremos no hace nada', () => {
    const rows = stepRowsFrom(['uno', 'dos', 'tres'])
    expect(moveStepRow(rows, 1, -1).map((s) => s.text)).toEqual(['dos', 'uno', 'tres'])
    expect(moveStepRow(rows, 1, 1).map((s) => s.text)).toEqual(['uno', 'tres', 'dos'])
    expect(moveStepRow(rows, 0, -1)).toBe(rows)
    expect(moveStepRow(rows, 2, 1)).toBe(rows)
  })

  it('escribir, añadir y quitar (la última se sustituye por una en blanco)', () => {
    const rows = stepRowsFrom(['uno'])
    expect(updateStepRow(rows, rows[0].id, 'UNO')[0].text).toBe('UNO')
    expect(addStepRow(rows)).toHaveLength(2)
    const left = removeStepRow(rows, rows[0].id)
    expect(left).toHaveLength(1)
    expect(left[0].text).toBe('')
  })
})

describe('raciones', () => {
  it('vacío = null (nunca 0), coma decimal admitida, texto raro = NaN', () => {
    expect(parseServingsText('')).toBeNull()
    expect(parseServingsText('  ')).toBeNull()
    expect(parseServingsText('6,5')).toBe(6.5)
    expect(Number.isNaN(parseServingsText('abc'))).toBe(true)
  })

  it('válidas: 1–50, enteros o medios puntos; lo demás se marca como inválido y no se guarda', () => {
    for (const ok of ['', '1', '4', '6,5', '6.5', '50']) expect(servingsTextInvalid(ok)).toBe(false)
    for (const bad of ['0', '0,5', '51', '2.3', 'abc', '-1']) expect(servingsTextInvalid(bad)).toBe(true)
    expect(validServings('6,5')).toBe(6.5)
    expect(validServings('')).toBeNull()
    expect(validServings('2.3')).toBeNull()
  })
})

describe('etiquetas', () => {
  it('Cocina (sin límites, mayúsculas tal cual): se marcan, desmarcan y no se repiten, pero «Postres» y «postres» son distintas', () => {
    expect(toggleTag([], 'Postres')).toEqual(['Postres'])
    expect(toggleTag(['Postres'], 'Postres')).toEqual([])
    expect(tagIsOn(['Postres'], 'postres')).toBe(false)
    expect(addTag(['Postres'], '  Postres ')).toEqual(['Postres'])
    expect(addTag(['Postres'], ' Cena ')).toEqual(['Postres', 'Cena'])
    expect(addTag([], '   ')).toEqual([])
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`)
    expect(addTag(many, 'otra')).toHaveLength(31)
  })

  it('Comunidad (minúsculas, máximo y largo): una sola etiqueta aunque se escriba distinto, recortada y sin pasar del máximo', () => {
    expect(cleanTagInput('  Postres Ricos ', LOWER)).toBe('postre')
    expect(tagIsOn(['postres'], 'Postres', LOWER)).toBe(true)
    expect(toggleTag(['postres'], 'POSTRES', LOWER)).toEqual([])
    expect(toggleTag([], 'Vegetariano', LOWER)).toEqual(['vegeta'])
    expect(addTag(['a', 'b'], 'C', LOWER)).toEqual(['a', 'b', 'c'])
    expect(addTag(['a', 'b', 'c'], 'd', LOWER)).toEqual(['a', 'b', 'c'])
    expect(toggleTag(['a', 'b', 'c'], 'Fáciles', LOWER)).toEqual(['a', 'b', 'c'])
    // Quitar siempre se puede aunque se esté en el máximo.
    expect(toggleTag(['a', 'b', 'c'], 'b', LOWER)).toEqual(['a', 'c'])
    expect(tagsAtLimit(['a', 'b', 'c'], LOWER)).toBe(true)
    expect(tagsAtLimit(['a', 'b'], LOWER)).toBe(false)
    expect(tagsAtLimit(['a', 'b', 'c'])).toBe(false)
  })

  it('las etiquetas propias son las que no están entre las sugeridas', () => {
    expect(customTags(['Postres', 'mis cenas'], ['Postres', 'Rápidas'])).toEqual(['mis cenas'])
    expect(customTags(['postres', 'x'], ['Postres'], LOWER)).toEqual(['x'])
  })
})
