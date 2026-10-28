// @vitest-environment jsdom
// Editor de etiquetas con reparto (ETQ-1) en su pantalla real, con una persona que lo usa. ECO-UI-02/03: un selector compacto por etiqueta ASIGNADA y «+ Añadir etiqueta», que abre el
// buscador/selector de etiquetas disponibles solo cuando se pulsa (nada de buscador permanente); los repartos (iguales, euros, %) y su comprobación de suma son los de siempre.
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
const openPicker = () => fireEvent.click(screen.getByRole('button', { name: '+ Añadir etiqueta' }))
const addTag = (name: string) => {
  openPicker()
  fireEvent.click(within(screen.getByTestId('tag-picker')).getByRole('option', { name: new RegExp(name) }))
}

describe('Etiquetas de un movimiento (selectores + buscador a demanda)', () => {
  it('una sola etiqueta: un único desplegable, sin lista de botones y SIN campo de búsqueda a la vista', () => {
    render(<Harness total={100} initialTag="comun" />)
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(sel(1).value).toBe('comun')
    expect(screen.queryByRole('button', { name: 'Vacaciones' })).toBeNull()
    expect(screen.queryByLabelText('Buscar etiqueta')).toBeNull()
    expect(screen.getByRole('button', { name: '+ Añadir etiqueta' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Gestionar etiquetas/ })).toBeTruthy()
    expect(last.split).toBeNull()
  })

  it('sin etiqueta: solo «Sin etiqueta» y el enlace; al elegir una aparece su desplegable', () => {
    render(<Harness total={100} />)
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.getByText('Sin etiqueta')).toBeTruthy()
    addTag('Cumpleaños Eric')
    expect(last.tagId).toBe('eric')
    expect(last.split).toBeNull()
    expect(sel(1).value).toBe('eric')
  })

  it('el buscador aparece SOLO al pulsar «+ Añadir etiqueta» y se cierra al elegir (o al cancelar)', () => {
    render(<Harness total={100} initialTag="comun" />)
    expect(screen.queryByLabelText('Buscar etiqueta')).toBeNull()
    openPicker()
    expect(screen.getByLabelText('Buscar etiqueta')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Buscar etiqueta')).toBeNull()
    expect(last.split).toBeNull()
    addTag('Vacaciones')
    expect(screen.queryByLabelText('Buscar etiqueta')).toBeNull()
  })

  it('al elegir una segunda etiqueta arranca a partes iguales con las dos', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag('Cumpleaños Eric')
    expect(last.split?.ids).toEqual(['comun', 'eric'])
    expect(last.split?.mode).toBe('equal')
    expect(screen.getAllByText('50,00 €')).toHaveLength(2)
    expect(screen.getByText(/Suma 100,00 € ✓/)).toBeTruthy()
  })

  it('no hay duplicados: el selector de añadir solo ofrece las no asignadas y cada desplegable no ofrece las de los demás', () => {
    render(<Harness total={100} initialTag="comun" />)
    openPicker()
    const offered = within(screen.getByTestId('tag-picker')).getAllByRole('option').map((o) => o.textContent)
    expect(offered).toEqual(['Cumpleaños Eric', 'Vacaciones'])
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    addTag('Cumpleaños Eric')
    const optionsOf = (n: number) => within(sel(n)).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(optionsOf(1)).toEqual(['comun', 'vac'])
    expect(optionsOf(2)).toEqual(['eric', 'vac'])
  })

  it('tres etiquetas: reparte 100 € en 33,34 · 33,33 · 33,33; con todas asignadas ya no se ofrece añadir', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag('Cumpleaños Eric')
    addTag('Vacaciones')
    expect(last.split?.ids).toEqual(['comun', 'eric', 'vac'])
    expect(screen.getByText('33,34 €')).toBeTruthy()
    expect(screen.getAllByText('33,33 €')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '+ Añadir etiqueta' })).toBeNull()
  })

  it('en euros: 60 / 30 / 10 suman 100 y se acepta; si no suman, dice cuánto falta', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag('Cumpleaños Eric')
    addTag('Vacaciones')
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
    addTag('Cumpleaños Eric')
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
    addTag('Cumpleaños Eric')
    fireEvent.click(screen.getByRole('button', { name: 'En euros' }))
    fireEvent.change(screen.getByLabelText('Importe de Común'), { target: { value: '70' } })
    fireEvent.change(screen.getByLabelText('Importe de Cumpleaños Eric'), { target: { value: '20' } })
    addTag('Vacaciones')
    expect(last.split?.inputs.comun).toBe('70')
    expect(last.split?.inputs.eric).toBe('20')
    expect(last.split?.inputs.vac).toBe('10.00')
    expect(screen.getByText(/Suma 100,00 € ✓/)).toBeTruthy()
  })

  it('cambiar una etiqueta del reparto por otra (desplegable) conserva su parte', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag('Cumpleaños Eric')
    fireEvent.click(screen.getByRole('button', { name: 'En euros' }))
    fireEvent.change(screen.getByLabelText('Importe de Común'), { target: { value: '80' } })
    fireEvent.change(screen.getByLabelText('Importe de Cumpleaños Eric'), { target: { value: '20' } })
    fireEvent.change(sel(2), { target: { value: 'vac' } })
    expect(last.split?.ids).toEqual(['comun', 'vac'])
    expect(last.split?.inputs.vac).toBe('20')
    expect(last.split?.inputs.eric).toBeUndefined()
  })

  it('quitar una etiqueta deja el resto; quitar hasta quedar una vuelve sin reparto; se puede quitar también la última', () => {
    render(<Harness total={100} initialTag="comun" />)
    addTag('Cumpleaños Eric')
    expect(last.split).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la etiqueta Cumpleaños Eric' }))
    expect(last.split).toBeNull()
    expect(last.tagId).toBe('comun')
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Quitar la etiqueta Común' }))
    expect(last).toEqual({ tagId: '', split: null })
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  it('sin importe todavía lo dice en vez de repartir nada', () => {
    render(<Harness total={NaN} initialTag="comun" />)
    addTag('Cumpleaños Eric')
    expect(screen.getByText(/Escribe primero el importe/)).toBeTruthy()
  })

  it('nombres largos: el desplegable se encoge dentro de su fila y el nombre del selector se recorta con puntos suspensivos', () => {
    const long = [
      { id: 'l1', name: 'Cumpleaños de Eric en el parque de bolas con toda la familia', color: '#999', sortOrder: 0 },
      { id: 'l2', name: 'Otra etiqueta con un nombre larguísimo que no cabe en una línea del móvil', color: '#888', sortOrder: 1 },
    ] as unknown as Tag[]
    render(<TagSharesField tags={long} tagId="l1" split={null} total={10} onChange={() => undefined} />)
    expect(parseFloat(sel(1).style.minWidth)).toBe(0)
    expect(sel(1).style.flex).toContain('1')
    openPicker()
    const opt = within(screen.getByTestId('tag-picker')).getByRole('option', { name: /Otra etiqueta/ })
    expect((opt.querySelector('span:last-child') as HTMLElement).style.textOverflow).toBe('ellipsis')
  })

  it('con muchas etiquetas, el buscador del selector filtra por nombre', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, name: i === 7 ? 'Zapatos' : `Etiqueta ${i}`, color: '#abc', sortOrder: i })) as unknown as Tag[]
    render(<TagSharesField tags={many} tagId="" split={null} total={10} onChange={() => undefined} />)
    openPicker()
    fireEvent.change(screen.getByLabelText('Buscar etiqueta'), { target: { value: 'zap' } })
    expect(within(screen.getByTestId('tag-picker')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Zapatos'])
  })
})
