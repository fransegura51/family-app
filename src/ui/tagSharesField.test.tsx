// @vitest-environment jsdom
// Editor de etiquetas con reparto (ETQ-1) en su pantalla real, con una persona que lo usa. ECO-UI-02: un selector compacto por etiqueta asignada y «+ Añadir etiqueta» para sumar otra
// (en vez de una lista de botones con todas); los repartos (iguales, euros, %) y su comprobación de suma son los de siempre.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

const sel = (n: number) => screen.getByLabelText(`Etiqueta ${n}`) as HTMLSelectElement
const addTag = () => fireEvent.click(screen.getByRole('button', { name: '+ Añadir etiqueta' }))

describe('Etiquetas de un movimiento (selectores)', () => {
  it('una sola etiqueta: un único desplegable, sin lista de botones con todas las etiquetas', () => {
    render(<Harness total={100} initialTag="comun" />)
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(sel(1).value).toBe('comun')
    expect(screen.queryByRole('button', { name: 'Vacaciones' })).toBeNull() // ya no hay botones por etiqueta
    expect(screen.getByRole('button', { name: '+ Añadir etiqueta' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Gestionar etiquetas/ })).toBeTruthy()
    expect(last.split).toBeNull()
  })

  it('sin etiqueta: un desplegable en «Sin etiqueta» y todavía sin «+ Añadir etiqueta»', () => {
    render(<Harness total={100} />)
    expect(sel(1).value).toBe('')
    expect(screen.queryByRole('button', { name: '+ Añadir etiqueta' })).toBeNull()
    fireEvent.change(sel(1), { target: { value: 'eric' } })
    expect(last.tagId).toBe('eric')
    expect(last.split).toBeNull()
  })

  it('«+ Añadir etiqueta» abre un segundo selector vacío; al elegir arranca a partes iguales con las dos', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag()
    expect(sel(2).value).toBe('')
    expect(last.split).toBeNull() // todavía no hay segunda etiqueta
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    expect(last.split?.ids).toEqual(['comun', 'eric'])
    expect(last.split?.mode).toBe('equal')
    expect(screen.getAllByText('50,00 €')).toHaveLength(2)
    expect(screen.getByText(/Suma 100,00 € ✓/)).toBeTruthy()
  })

  it('no se puede elegir dos veces la misma etiqueta: cada selector solo ofrece las que no están en otro', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag()
    const optionsOf = (n: number) => within(sel(n)).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(optionsOf(2)).toEqual(['', 'eric', 'vac'])
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    expect(optionsOf(1)).toEqual(['', 'comun', 'vac'])
    expect(optionsOf(2)).toEqual(['', 'eric', 'vac'])
  })

  it('tres etiquetas: reparte 100 € en 33,34 · 33,33 · 33,33', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag()
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    addTag()
    fireEvent.change(sel(3), { target: { value: 'vac' } })
    expect(last.split?.ids).toEqual(['comun', 'eric', 'vac'])
    expect(screen.getByText('33,34 €')).toBeTruthy()
    expect(screen.getAllByText('33,33 €')).toHaveLength(2)
  })

  it('en euros: 60 / 30 / 10 suman 100 y se acepta; si no suman, dice cuánto falta', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag()
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    addTag()
    fireEvent.change(sel(3), { target: { value: 'vac' } })
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
    addTag()
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    fireEvent.click(screen.getByRole('button', { name: 'En %' }))
    fireEvent.change(screen.getByLabelText('Porcentaje de Común'), { target: { value: '70' } })
    fireEvent.change(screen.getByLabelText('Porcentaje de Cumpleaños Eric'), { target: { value: '30' } })
    expect(screen.getByText('= 70,00 €')).toBeTruthy()
    expect(screen.getByText('= 30,00 €')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Porcentaje de Común'), { target: { value: '50' } })
    expect(screen.getByText(/tienen que sumar 100 %/)).toBeTruthy()
  })

  it('añadir una etiqueta en euros CONSERVA lo ya escrito en las otras (no pisa importes personalizados)', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag()
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    fireEvent.click(screen.getByRole('button', { name: 'En euros' }))
    fireEvent.change(screen.getByLabelText('Importe de Común'), { target: { value: '70' } })
    fireEvent.change(screen.getByLabelText('Importe de Cumpleaños Eric'), { target: { value: '20' } })
    addTag()
    fireEvent.change(sel(3), { target: { value: 'vac' } })
    expect(last.split?.inputs.comun).toBe('70')
    expect(last.split?.inputs.eric).toBe('20')
    expect(last.split?.inputs.vac).toBe('10.00') // lo que faltaba hasta 100
    expect(screen.getByText(/Suma 100,00 € ✓/)).toBeTruthy()
  })

  it('cambiar una etiqueta del reparto por otra conserva su parte', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag()
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    fireEvent.click(screen.getByRole('button', { name: 'En euros' }))
    fireEvent.change(screen.getByLabelText('Importe de Común'), { target: { value: '80' } })
    fireEvent.change(screen.getByLabelText('Importe de Cumpleaños Eric'), { target: { value: '20' } })
    fireEvent.change(sel(2), { target: { value: 'vac' } })
    expect(last.split?.ids).toEqual(['comun', 'vac'])
    expect(last.split?.inputs.vac).toBe('20')
    expect(last.split?.inputs.eric).toBeUndefined()
  })

  it('quitar el selector adicional vuelve a una sola etiqueta (sin reparto)', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag()
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    expect(last.split).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la etiqueta Cumpleaños Eric' }))
    expect(last.split).toBeNull()
    expect(last.tagId).toBe('comun')
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
  })

  it('cancelar un selector recién añadido (sin elegir) no cambia nada', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar este selector' }))
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(last).toEqual({ tagId: 'comun', split: null })
  })

  it('sin importe todavía lo dice en vez de repartir nada', () => {
    render(<Harness total={NaN} initialTag="comun" />)
    addTag()
    fireEvent.change(sel(2), { target: { value: 'eric' } })
    expect(screen.getByText(/Escribe primero el importe/)).toBeTruthy()
  })

  it('nombres largos: el selector se encoge dentro de su fila (no se sale de la pantalla)', () => {
    const long = [{ id: 'l1', name: 'Cumpleaños de Eric en el parque de bolas con toda la familia', color: '#999', sortOrder: 0 }] as unknown as Tag[]
    render(<TagSharesField tags={long} tagId="l1" split={null} total={10} onChange={() => undefined} />)
    expect(parseFloat(sel(1).style.minWidth)).toBe(0)
    expect(sel(1).style.flex).toContain('1')
  })

  it('con muchas etiquetas aparece un buscador que filtra los selectores', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, name: i === 7 ? 'Zapatos' : `Etiqueta ${i}`, color: '#abc', sortOrder: i })) as unknown as Tag[]
    render(<TagSharesField tags={many} tagId="" split={null} total={10} onChange={() => undefined} />)
    fireEvent.change(screen.getByLabelText('Buscar etiqueta'), { target: { value: 'zap' } })
    expect(within(sel(1)).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sin etiqueta', 'Zapatos'])
  })
})
