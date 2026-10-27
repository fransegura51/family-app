// @vitest-environment jsdom
// Cocina (24/10/2026): botones de raciones en el visor de recetas, semana anterior/siguiente en el menú y el tipo «snack». Comportamiento real del componente y comprobaciones
// de código de la pantalla de Cocina.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import cocina from '@/ui/AlimentacionScreen.tsx?raw'
import { ScaledIngredients } from '@/ui/ScaledIngredients'

afterEach(cleanup)

const ingredients = [
  { id: '1', name: 'Harina', quantity: '200', unit: 'g' },
  { id: '2', name: 'Huevos', quantity: '2', unit: '' },
  { id: '3', name: 'Sal', quantity: '', unit: '' },
]

describe('visor de recetas: raciones con − / +', () => {
  it('muestra las cantidades de la receta y, al subir una ración, las recalcula; «Volver a» las deja como estaban', () => {
    render(<ScaledIngredients servings={4} ingredients={ingredients} />)
    expect(screen.getByText('Para 4 personas')).toBeTruthy()
    expect(screen.getByText('Harina — 200 g')).toBeTruthy()
    expect(screen.getByText('Huevos — 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Una ración más' }))
    expect(screen.getByText('Para 5 personas')).toBeTruthy()
    expect(screen.getByText('Harina — 250 g')).toBeTruthy()
    // 2 huevos para 4 → 2,5 para 5: pieza entera con decimales, se marca como orientativo (≈).
    expect(screen.getByText(/Huevos — ≈ 2[,.]5/)).toBeTruthy()
    expect(screen.getByText(/orientativas/)).toBeTruthy()
    expect(screen.getByText('Sal')).toBeTruthy() // sin cantidad: se deja tal cual

    fireEvent.click(screen.getByRole('button', { name: 'Volver a 4' }))
    expect(screen.getByText('Para 4 personas')).toBeTruthy()
    expect(screen.getByText('Harina — 200 g')).toBeTruthy()
  })

  it('no baja de 1 persona', () => {
    render(<ScaledIngredients servings={2} ingredients={ingredients} />)
    fireEvent.click(screen.getByRole('button', { name: 'Una ración menos' }))
    expect(screen.getByText('Para 1 persona')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Una ración menos' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Harina — 100 g')).toBeTruthy()
  })

  it('sin raciones indicadas no hay botones y las cantidades se ven tal cual', () => {
    render(<ScaledIngredients servings={null} ingredients={ingredients} />)
    expect(screen.queryByRole('button', { name: 'Una ración más' })).toBeNull()
    expect(screen.getByText('Harina — 200 g')).toBeTruthy()
  })
})

describe('Cocina: menú semanal', () => {
  it('tiene semana anterior / siguiente y «Volver a hoy», y recarga al cambiar de semana', () => {
    expect(cocina).toContain('aria-label="Semana anterior"')
    expect(cocina).toContain('aria-label="Semana siguiente"')
    expect(cocina).toContain('Volver a hoy')
    expect(cocina).toContain("next.set('desde', toDateStr(base))")
    expect(cocina).toContain('}, [dates])')
  })

  it('pinta también el tipo «snack» (ya no se filtra)', () => {
    expect(cocina).toContain('{MEAL_TYPES.map((meal) => {')
    expect(cocina).not.toContain("m.value !== 'snack'")
  })

  it('los dos visores de recetas usan los ingredientes con raciones', () => {
    expect(cocina).toContain('<ScaledIngredients key={recipe.id}')
    expect(cocina).toContain('<ScaledIngredients key={viewing.id}')
  })
})
