// @vitest-environment jsdom
// Campo «Clasificación» de un movimiento con reparto opcional (CLASIF-1), en su pantalla real: una sola clasificación como siempre (por defecto) y «Repartir entre varias
// clasificaciones» como opción voluntaria, con partes iguales, euros o %, y la comprobación de que suma el importe exacto.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

const add = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: '+ Añadir clasificación' }))
  fireEvent.click(within(screen.getByTestId('class-picker')).getByRole('option', { name }))
}

describe('Clasificación de un movimiento (selector compacto)', () => {
  it('solo se ve la clasificación elegida, con su importe; el catálogo completo NO está a la vista hasta pulsar «+ Añadir clasificación»', () => {
    render(<Harness total={47.97} initial="Ropa y calzado" />)
    expect((screen.getByLabelText('Clasificación 1') as HTMLSelectElement).value).toBe('Ropa y calzado')
    expect(screen.getByTestId('class-amount').textContent).toBe('47,97 €')
    expect(screen.queryByTestId('class-picker')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Juguetes/ })).toBeNull() // ya no hay un botón por cada clasificación
    expect(last.split).toBeNull()
  })

  it('sin clasificación dice «Sin clasificar» y, con todas ya elegidas, no ofrece añadir', () => {
    const { unmount } = render(<Harness total={10} />)
    expect(screen.getByText('Sin clasificar')).toBeTruthy()
    unmount()
    render(<Harness total={10} initial="Ropa y calzado" opts={[options[0]]} />)
    expect(screen.queryByRole('button', { name: '+ Añadir clasificación' })).toBeNull()
  })

  it('el selector abre el catálogo con buscador, solo con lo que falta, y se cierra al elegir', () => {
    render(<Harness total={30} initial="Ropa y calzado" />)
    fireEvent.click(screen.getByRole('button', { name: '+ Añadir clasificación' }))
    const picker = screen.getByTestId('class-picker')
    expect(within(picker).queryByRole('option', { name: /Ropa y calzado/ })).toBeNull() // la ya elegida no se repite
    expect(within(picker).getAllByRole('option')).toHaveLength(2)
    fireEvent.change(within(picker).getByLabelText('Buscar clasificación'), { target: { value: 'jug' } })
    expect(within(picker).getAllByRole('option')).toHaveLength(1)
    fireEvent.click(within(picker).getByRole('option', { name: /Juguetes/ }))
    expect(screen.queryByTestId('class-picker')).toBeNull()
    expect(last.split?.ids).toEqual(['Ropa y calzado', 'Juguetes'])
  })

  it('al añadir una segunda arranca a partes iguales, sin escribir nada, y suma el total', () => {
    render(<Harness total={47.97} initial="Ropa y calzado" />)
    add('Papelería y manualidades')
    expect(last.split?.ids).toEqual(['Ropa y calzado', 'Papelería y manualidades'])
    expect(last.split?.mode).toBe('equal')
    expect(screen.getAllByTestId('class-amount').map((e) => e.textContent)).toEqual(['23,99 €', '23,98 €'])
    expect(screen.getByText(/Suma 47,97 € ✓ — el movimiento cuenta una sola vez; cada clasificación recibe su parte\./)).toBeTruthy()
  })

  it('caso real de Amazon: en euros 40,98 + 6,99 suma 47,97 y se acepta; un céntimo de menos se avisa; el total no cambia', () => {
    render(<Harness total={47.97} initial="Ropa y calzado" />)
    add('Papelería y manualidades')
    fireEvent.click(screen.getByRole('button', { name: 'En euros' }))
    fireEvent.change(screen.getByLabelText('Importe de 👕 Ropa y calzado'), { target: { value: '40,98' } })
    fireEvent.change(screen.getByLabelText('Importe de ✏️ Papelería y manualidades'), { target: { value: '6,98' } })
    expect(screen.getByText('Faltan 0,01 € por repartir.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Importe de ✏️ Papelería y manualidades'), { target: { value: '6,99' } })
    expect(screen.getByText(/Suma 47,97 € ✓/)).toBeTruthy()
    expect(screen.getAllByTestId('class-amount').map((e) => e.textContent)).toEqual(['40,98 €', '6,99 €'])
  })

  it('en porcentaje: 85 % / 15 % se convierte a euros y suma exacto; si no suman 100 % se avisa', () => {
    render(<Harness total={47.97} initial="Ropa y calzado" />)
    add('Papelería y manualidades')
    fireEvent.click(screen.getByRole('button', { name: 'En %' }))
    fireEvent.change(screen.getByLabelText('Porcentaje de 👕 Ropa y calzado'), { target: { value: '85' } })
    fireEvent.change(screen.getByLabelText('Porcentaje de ✏️ Papelería y manualidades'), { target: { value: '10' } })
    expect(screen.getByText(/tienen que sumar 100 %/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Porcentaje de ✏️ Papelería y manualidades'), { target: { value: '15' } })
    expect(screen.getByText(/Suma 47,97 € ✓/)).toBeTruthy()
  })

  it('se puede cambiar una clasificación por otra sin tocar el reparto, y quitarlas; al quedar una sola vuelve a la vista sencilla', () => {
    render(<Harness total={30} initial="Ropa y calzado" />)
    add('Papelería y manualidades')
    fireEvent.change(screen.getByLabelText('Clasificación 2'), { target: { value: 'Juguetes' } })
    expect(last.split?.ids).toEqual(['Ropa y calzado', 'Juguetes'])
    add('Papelería y manualidades')
    expect(last.split?.ids).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la clasificación Juguetes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la clasificación Papelería y manualidades' }))
    expect(last.split).toBeNull()
    expect(last.value).toBe('Ropa y calzado')
    expect(screen.getAllByTestId('class-amount')).toHaveLength(1)
  })

  it('quitar la última deja «Sin clasificar»', () => {
    render(<Harness total={30} initial="Ropa y calzado" />)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la clasificación Ropa y calzado' }))
    expect(last.value).toBe('')
    expect(screen.getByText('Sin clasificar')).toBeTruthy()
  })

  it('avisa de que un ticket con productos clasificados manda sobre este reparto', () => {
    render(<Harness total={30} initial="Ropa y calzado" />)
    add('Papelería y manualidades')
    expect(screen.getByText(/manda ese desglose y este reparto no se aplica/)).toBeTruthy()
  })
})
