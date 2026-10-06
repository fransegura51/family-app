import { describe, expect, it } from 'vitest'
import { parseSimpleNumber, scaleIngredientQuantity } from '@/domain/recipeScaling'

describe('escalado orientativo de cantidades de receta', () => {
  it('escala cantidad × comensales / raciones cuando todo es conocido y escalable', () => {
    expect(scaleIngredientQuantity('250', 'g', 4, 8)).toEqual({ quantity: '500 g', scaled: true, reason: null })
    expect(scaleIngredientQuantity('1,5', 'kg', 4, 6)).toEqual({ quantity: '2,3 kg', scaled: true, reason: null })
  })

  it('sin raciones conocidas (null o 0) NO escala y conserva la cantidad original', () => {
    expect(scaleIngredientQuantity('250', 'g', null, 8)).toEqual({ quantity: '250', scaled: false, reason: 'sin_raciones' })
    expect(scaleIngredientQuantity('250', 'g', 0, 8)).toEqual({ quantity: '250', scaled: false, reason: 'sin_raciones' })
  })

  it('cantidad no numérica (fracción, rango, texto) se conserva sin alterar', () => {
    expect(scaleIngredientQuantity('1/2', 'l', 4, 8).reason).toBe('cantidad_no_numerica')
    expect(scaleIngredientQuantity('2-3', 'g', 4, 8).reason).toBe('cantidad_no_numerica')
    expect(scaleIngredientQuantity('un puñado', 'g', 4, 8)).toEqual({ quantity: 'un puñado', scaled: false, reason: 'cantidad_no_numerica' })
  })

  it('unidades de conteo no se escalan (2 unidades ×4/3 daría fracciones inventadas)', () => {
    expect(scaleIngredientQuantity('2', 'unidades', 4, 6)).toEqual({ quantity: '2', scaled: false, reason: 'unidad_no_escalable' })
  })

  it('sin cantidad (null) no inventa nada', () => {
    expect(scaleIngredientQuantity(null, 'g', 4, 8)).toEqual({ quantity: null, scaled: false, reason: 'cantidad_no_numerica' })
  })

  it('parseSimpleNumber solo acepta números simples', () => {
    expect(parseSimpleNumber('3')).toBe(3)
    expect(parseSimpleNumber('0,5')).toBe(0.5)
    expect(parseSimpleNumber('0')).toBeNull()
    expect(parseSimpleNumber('3 huevos')).toBeNull()
  })
})
