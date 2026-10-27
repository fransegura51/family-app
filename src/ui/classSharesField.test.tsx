// @vitest-environment jsdom
// Campo «Clasificación» de un movimiento con reparto opcional (CLASIF-1), en su pantalla real: una sola clasificación como siempre (por defecto) y «Repartir entre varias
// clasificaciones» como opción voluntaria, con partes iguales, euros o %, y la comprobación de que suma el importe exacto.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClassSplitDraft } from '@/domain/classShares'
import type { FamilyFoodType } from '@/data/foodTypes'

const empty = (): unknown => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }), eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty })
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy({}, { get: (_t, prop) => (prop === 'auth' ? { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } : prop === 'channel' ? () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }) : prop === 'removeChannel' ? () => undefined : () => empty()) }),
}))

const { ClassSharesField } = await import('@/ui/FinanceScreen')

const options = [
  { id: 'a', name: 'Ropa y calzado', icon: '👕' },
  { id: 'b', name: 'Papelería y manualidades', icon: '✏️' },
  { id: 'c', name: 'Juguetes', icon: '🧸' },
] as unknown as FamilyFoodType[]

let last: { value: string; split: ClassSplitDraft | null } = { value: '', split: null }
function Harness({ total, initial = '', opts = options }: { total: number; initial?: string; opts?: FamilyFoodType[] }) {
  const [state, setState] = useState<{ value: string; split: ClassSplitDraft | null }>({ value: initial, split: null })
  last = state
  return <ClassSharesField options={opts} value={state.value} split={state.split} total={total} onChange={setState} />
}
afterEach(cleanup)

describe('Clasificación de un movimiento', () => {
  it('por defecto se ve el desplegable de siempre y el reparto es opcional', () => {
    render(<Harness total={47.97} initial="Ropa y calzado" />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('Ropa y calzado')
    expect(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ })).toBeTruthy()
    expect(last.split).toBeNull()
  })

  it('con una sola clasificación disponible no se ofrece repartir', () => {
    render(<Harness total={10} opts={[options[0]]} />)
    expect(screen.queryByRole('button', { name: /Repartir entre varias clasificaciones/ })).toBeNull()
  })

  it('al repartir arranca a partes iguales con la clasificación ya elegida y otra, sin escribir nada', () => {
    render(<Harness total={47.97} initial="Ropa y calzado" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ }))
    expect(last.split?.ids).toEqual(['Ropa y calzado', 'Papelería y manualidades'])
    expect(last.split?.mode).toBe('equal')
    expect(screen.getByText('23,99 €')).toBeTruthy()
    expect(screen.getByText('23,98 €')).toBeTruthy()
    expect(screen.getByText(/Suma 47,97 € ✓ — el movimiento cuenta una sola vez; cada clasificación recibe su parte\./)).toBeTruthy()
  })

  it('caso real de Amazon: en euros 40,98 + 6,99 suma 47,97 y se acepta; un céntimo de menos se avisa', () => {
    render(<Harness total={47.97} initial="Ropa y calzado" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ }))
    fireEvent.click(screen.getByRole('button', { name: 'En euros' }))
    fireEvent.change(screen.getByLabelText('Importe de 👕 Ropa y calzado'), { target: { value: '40,98' } })
    fireEvent.change(screen.getByLabelText('Importe de ✏️ Papelería y manualidades'), { target: { value: '6,98' } })
    expect(screen.getByText('Faltan 0,01 € por repartir.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Importe de ✏️ Papelería y manualidades'), { target: { value: '6,99' } })
    expect(screen.getByText(/Suma 47,97 € ✓/)).toBeTruthy()
  })

  it('en porcentaje: 85 % / 15 % se convierte a euros y suma exacto; si no suman 100 % se avisa', () => {
    render(<Harness total={47.97} initial="Ropa y calzado" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ }))
    fireEvent.click(screen.getByRole('button', { name: 'En %' }))
    fireEvent.change(screen.getByLabelText('Porcentaje de 👕 Ropa y calzado'), { target: { value: '85' } })
    fireEvent.change(screen.getByLabelText('Porcentaje de ✏️ Papelería y manualidades'), { target: { value: '10' } })
    expect(screen.getByText(/tienen que sumar 100 %/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Porcentaje de ✏️ Papelería y manualidades'), { target: { value: '15' } })
    expect(screen.getByText(/Suma 47,97 € ✓/)).toBeTruthy()
  })

  it('se pueden añadir y quitar clasificaciones; al quedar una sola vuelve al desplegable de siempre', () => {
    render(<Harness total={30} initial="Ropa y calzado" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ }))
    fireEvent.click(screen.getByRole('button', { name: '🧸 Juguetes' }))
    expect(last.split?.ids).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: '🧸 Juguetes' }))
    fireEvent.click(screen.getByRole('button', { name: '✏️ Papelería y manualidades' }))
    expect(last.split).toBeNull()
    expect(last.value).toBe('Ropa y calzado')
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('«Volver a una sola clasificación» conserva la que ya estaba elegida', () => {
    render(<Harness total={30} initial="Ropa y calzado" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver a una sola clasificación' }))
    expect(last.split).toBeNull()
    expect(last.value).toBe('Ropa y calzado')
  })

  it('avisa de que un ticket con productos clasificados manda sobre este reparto', () => {
    render(<Harness total={30} initial="Ropa y calzado" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias clasificaciones/ }))
    expect(screen.getByText(/manda ese desglose y este reparto no se aplica/)).toBeTruthy()
  })
})
