// @vitest-environment jsdom
// Editor de etiquetas con reparto (ETQ-1) en su pantalla real, con una persona que lo usa: una sola etiqueta como siempre, y reparto opcional entre varias.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TagSplitDraft } from '@/domain/tagShares'
import type { Tag } from '@/domain/types'

const empty = (): unknown => ({
  then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
  eq: empty, order: empty, select: empty, in: empty, limit: empty, maybeSingle: empty, single: empty, gte: empty, lte: empty, is: empty, not: empty, or: empty, range: empty,
})
vi.mock('@/data/supabaseClient', () => ({
  supabase: new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'auth') return { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) }
        if (prop === 'channel') return () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) })
        if (prop === 'removeChannel') return () => undefined
        return () => empty()
      },
    },
  ),
}))

const { TagSharesField } = await import('@/ui/FinanceScreen')

const tags = [
  { id: 'comun', name: 'Común', color: '#4dabf7', sortOrder: 0 },
  { id: 'eric', name: 'Cumpleaños Eric', color: '#f06595', sortOrder: 1 },
  { id: 'vac', name: 'Vacaciones', color: '#51cf66', sortOrder: 2 },
] as unknown as Tag[]

let last: { tagId: string; split: TagSplitDraft | null } = { tagId: '', split: null }
function Harness({ total, initialTag = '' }: { total: number; initialTag?: string }) {
  const [state, setState] = useState<{ tagId: string; split: TagSplitDraft | null }>({ tagId: initialTag, split: null })
  last = state
  return <TagSharesField tags={tags} tagId={state.tagId} split={state.split} total={total} onChange={setState} />
}
afterEach(cleanup)

describe('Etiquetas de un movimiento', () => {
  it('con una sola etiqueta se ve el desplegable de siempre y el reparto es opcional', () => {
    render(<Harness total={100} initialTag="comun" />)
    expect(screen.getByRole('combobox')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Repartir entre varias etiquetas/ })).toBeTruthy()
    expect(last.split).toBeNull()
  })

  it('al repartir arranca a partes iguales con la etiqueta ya elegida y otra, sin escribir nada', () => {
    render(<Harness total={100} initialTag="comun" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias etiquetas/ }))
    expect(last.split?.ids).toEqual(['comun', 'eric'])
    expect(last.split?.mode).toBe('equal')
    expect(screen.getAllByText('50,00 €')).toHaveLength(2)
    expect(screen.getByText(/Suma 100,00 € ✓/)).toBeTruthy()
  })

  it('añadir una tercera etiqueta reparte 100 € en 33,34 · 33,33 · 33,33', () => {
    render(<Harness total={100} initialTag="comun" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias etiquetas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vacaciones' }))
    expect(screen.getByText('33,34 €')).toBeTruthy()
    expect(screen.getAllByText('33,33 €')).toHaveLength(2)
  })

  it('en euros: 60 / 30 / 10 suman 100 y se acepta; si no suman, dice cuánto falta', () => {
    render(<Harness total={100} initialTag="comun" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias etiquetas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Vacaciones' }))
    fireEvent.click(screen.getByRole('button', { name: 'En euros' }))
    fireEvent.change(screen.getByLabelText('Importe de Común'), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText('Importe de Cumpleaños Eric'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Importe de Vacaciones'), { target: { value: '5' } })
    expect(screen.getByText('Faltan 5,00 € por repartir.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Importe de Vacaciones'), { target: { value: '10' } })
    expect(screen.getByText(/Suma 100,00 € ✓/)).toBeTruthy()
  })

  it('en %: 70 / 30 da 70 € y 30 €; con 50 / 30 avisa de que no suma 100', () => {
    render(<Harness total={100} initialTag="comun" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias etiquetas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'En %' }))
    fireEvent.change(screen.getByLabelText('Porcentaje de Común'), { target: { value: '70' } })
    fireEvent.change(screen.getByLabelText('Porcentaje de Cumpleaños Eric'), { target: { value: '30' } })
    expect(screen.getByText('= 70,00 €')).toBeTruthy()
    expect(screen.getByText('= 30,00 €')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Porcentaje de Común'), { target: { value: '50' } })
    expect(screen.getByText(/tienen que sumar 100 %/)).toBeTruthy()
  })

  it('sin importe todavía lo dice en vez de repartir nada', () => {
    render(<Harness total={NaN} initialTag="comun" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias etiquetas/ }))
    expect(screen.getByText(/Escribe primero el importe/)).toBeTruthy()
  })

  it('quitar etiquetas hasta quedar una, o «Volver a una sola etiqueta», devuelve el desplegable sencillo', () => {
    render(<Harness total={100} initialTag="comun" />)
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias etiquetas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cumpleaños Eric' }))
    expect(last.split).toBeNull()
    expect(last.tagId).toBe('comun')
    expect(screen.getByRole('combobox')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Repartir entre varias etiquetas/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Volver a una sola etiqueta' }))
    expect(last.split).toBeNull()
  })
})
