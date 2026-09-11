import { describe, expect, it } from 'vitest'
import { recipeText, shoppingListText } from './share'

describe('shoppingListText', () => {
  it('agrupa por tienda con cantidad y unidad', () => {
    const text = shoppingListText([
      {
        store: 'Mercadona',
        items: [
          { name: 'Leche', quantity: '2', unit: 'l' },
          { name: 'Pan', quantity: null, unit: null },
        ],
      },
      { store: 'Sin tienda', items: [{ name: 'Pilas', quantity: '4', unit: null }] },
    ])
    expect(text).toContain('— Mercadona —')
    expect(text).toContain('• Leche (2 l)')
    expect(text).toContain('• Pan')
    expect(text).not.toContain('Pan (')
    expect(text).toContain('— Sin tienda —')
    expect(text).toContain('• Pilas (4)')
  })

  it('omite tiendas sin productos', () => {
    const text = shoppingListText([{ store: 'Vacía', items: [] }])
    expect(text).not.toContain('Vacía')
  })
})

describe('recipeText', () => {
  it('incluye título, ingredientes con cantidad y preparación', () => {
    const text = recipeText({
      title: 'Tortilla de patatas',
      ingredients: [
        { name: 'Patatas', quantity: '1', unit: 'kg' },
        { name: 'Huevos', quantity: '6', unit: null },
      ],
      notes: 'Freír y cuajar.',
    })
    expect(text).toContain('🍽️ Tortilla de patatas')
    expect(text).toContain('• Patatas — 1 kg')
    expect(text).toContain('• Huevos — 6')
    expect(text).toContain('Preparación:')
    expect(text).toContain('Freír y cuajar.')
  })

  it('sin ingredientes ni notas, solo el título', () => {
    const text = recipeText({ title: 'Receta vacía', ingredients: [], notes: null })
    expect(text).toBe('🍽️ Receta vacía')
  })
})
