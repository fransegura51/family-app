import { describe, expect, it } from 'vitest'
import { suggestBudgetCategoryGroup } from '@/domain/eventBudgetCategoryGroups'

describe('suggestBudgetCategoryGroup — Punto 3.1, categoría real distinta del nombre de la partida', () => {
  it('agrupa varios conceptos florales distintos bajo la MISMA categoría real', () => {
    expect(suggestBudgetCategoryGroup('Ramo de Jennifer')).toBe('Flores y decoración')
    expect(suggestBudgetCategoryGroup('Flor de solapa de Paco')).toBe('Flores y decoración')
  })
  it('vestuario, alianzas y animación caen en sus propias categorías reales', () => {
    expect(suggestBudgetCategoryGroup('Vestido de Jennifer')).toBe('Vestuario')
    expect(suggestBudgetCategoryGroup('Alianzas')).toBe('Alianzas y joyería')
    expect(suggestBudgetCategoryGroup('Monitor')).toBe('Animación')
  })
  it('no reconoce ninguna palabra clave: "Otros", nunca inventa una categoría nueva', () => {
    expect(suggestBudgetCategoryGroup('Decoración con globos personalizados XYZ')).toBe('Flores y decoración')
    expect(suggestBudgetCategoryGroup('Imprevistos de última hora')).toBe('Otros')
  })
  it('no distingue mayúsculas/minúsculas ni acentos ya puestos', () => {
    expect(suggestBudgetCategoryGroup('RAMO DE NOVIA')).toBe('Flores y decoración')
    expect(suggestBudgetCategoryGroup('música en directo')).toBe('Música')
  })
})
