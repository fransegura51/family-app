import { describe, expect, it } from 'vitest'
import { parseSimpleNumber, scaleIngredientQuantity, unitInfo } from '@/domain/recipeScaling'

// Caso real validado: receta de 4 raciones → 10 comensales (factor 2,5).
const F = { servings: 4, diners: 10 }
const scale = (q: string | null, u: string | null) => scaleIngredientQuantity(q, u, F.servings, F.diners)

describe('escalado — factor 10 / 4 = 2,5 con valores exactos (sin redondear)', () => {
  it('9. 4 raciones → 10 comensales: factor 2,5', () => {
    expect(scale('1', 'kg').value).toBe(2.5)
  })
  it('10. 1,5 kg → 3,75 kg (valor interno exacto, no 3,8)', () => {
    expect(scale('1,5', 'kg')).toMatchObject({ value: 3.75, unit: 'kg', scaled: true, reason: null, fractional: false })
  })
  it('11. 4 unidades → 10 unidades', () => {
    expect(scale('4', 'unidades')).toMatchObject({ value: 10, unit: 'unidades', scaled: true, fractional: false })
  })
  it('12. 1 cucharada → 2,5 cucharadas (no entero: fraccionario para revisar)', () => {
    expect(scale('1', 'cucharada')).toMatchObject({ value: 2.5, unit: 'cucharadas', scaled: true, fractional: true })
  })
  it('13. 1 cucharadita → 2,5 cucharaditas', () => {
    expect(scale('1', 'cucharadita')).toMatchObject({ value: 2.5, unit: 'cucharaditas', scaled: true, fractional: true })
  })
  it('14. 4 cucharadas → 10 cucharadas', () => {
    expect(scale('4', 'cucharadas')).toMatchObject({ value: 10, unit: 'cucharadas', scaled: true, fractional: false })
  })
  it('3 huevos × 2,5 = 7,5: se propone 7,5 marcado como fraccionario, nunca redondeado en silencio', () => {
    expect(scale('3', 'unidades')).toMatchObject({ value: 7.5, scaled: true, fractional: true })
  })
  it('15. cantidad desconocida (null) sigue desconocida, sin inventar', () => {
    expect(scale(null, 'g')).toMatchObject({ value: null, scaled: false, reason: 'cantidad_no_numerica' })
  })
  it('cantidad textual («un puñado», fracción «1/2») no se escala', () => {
    expect(scale('un puñado', 'g')).toMatchObject({ value: null, scaled: false, reason: 'cantidad_no_numerica' })
    expect(scale('1/2', 'cucharada')).toMatchObject({ value: null, scaled: false, reason: 'cantidad_no_numerica' })
  })
  it('16. unidad no interpretable («pizca», vacía) → no inventa escalado: conserva la original', () => {
    expect(scale('2', 'pizca')).toMatchObject({ value: 2, unit: 'pizca', scaled: false, reason: 'unidad_no_escalable' })
    expect(scale('2', null)).toMatchObject({ scaled: false, reason: 'unidad_no_escalable' })
  })
  it('sin raciones válidas (null o 0) → no escala', () => {
    expect(scaleIngredientQuantity('250', 'g', null, 10)).toMatchObject({ value: 250, scaled: false, reason: 'sin_raciones' })
    expect(scaleIngredientQuantity('250', 'g', 0, 10)).toMatchObject({ scaled: false, reason: 'sin_raciones' })
  })
  it('sin comensales objetivo → no escala', () => {
    expect(scaleIngredientQuantity('250', 'g', 4, 0)).toMatchObject({ scaled: false, reason: 'sin_raciones' })
  })
  it('17. escalar no modifica la entrada ni la receta', () => {
    const quantity = '1,5'
    const unit = 'kg'
    scaleIngredientQuantity(quantity, unit, 4, 10)
    expect(quantity).toBe('1,5')
    expect(unit).toBe('kg')
  })
})

describe('unidades reconocidas y canónicas', () => {
  it('singulares, plurales y abreviaturas van a la misma familia', () => {
    expect(unitInfo('cda')?.family).toBe('cucharada')
    expect(unitInfo('Cucharaditas')?.family).toBe('cucharadita')
    expect(unitInfo('uds')?.family).toBe('conteo')
    expect(unitInfo('gr')?.label).toBe('g')
    expect(unitInfo('cl')?.factor).toBe(10)
  })
  it('unidades no reconocidas → null', () => {
    expect(unitInfo('pizca')).toBeNull()
    expect(unitInfo('al gusto')).toBeNull()
    expect(unitInfo(null)).toBeNull()
  })
})

describe('parseSimpleNumber', () => {
  it('solo números simples', () => {
    expect(parseSimpleNumber('3')).toBe(3)
    expect(parseSimpleNumber('0,5')).toBe(0.5)
    expect(parseSimpleNumber('0')).toBeNull()
    expect(parseSimpleNumber('3 huevos')).toBeNull()
  })
})
